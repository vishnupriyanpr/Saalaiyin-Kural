"""
Saalai Kural ML Server - port 5001
Accepts POST /analyze with a multipart image upload and runs real YOLO inference.

Model loading order (no mock, no fabricated data anywhere):
  1. backend/best.pt          (produced by train_road_model.py)
  2. backend/models/best.pt   (pre-existing fallback)
If neither exists, the server still starts but /analyze returns HTTP 503 with a
clear "model not trained yet" error. It NEVER returns invented detections.
"""
import os
import sys
import io
import json
import tempfile
import shutil
from http.server import BaseHTTPRequestHandler, HTTPServer

import multipart  # python-multipart

# -- Configuration ------------------------------------------------------------
_HERE = os.path.dirname(os.path.abspath(__file__))
PRIMARY_MODEL_PATH = os.path.join(_HERE, "best.pt")
FALLBACK_MODEL_PATH = os.path.join(_HERE, "models", "best.pt")
CONF_THRESHOLD = 0.4

try:
    from ultralytics import YOLO
except ImportError as e:
    print(f"[ML] FATAL: ultralytics is not installed: {e}", flush=True)
    sys.exit(1)


# -- Model load (best.pt first, then models/best.pt; no mock fallback) --------
def _resolve_model_path():
    if os.path.exists(PRIMARY_MODEL_PATH):
        return PRIMARY_MODEL_PATH
    if os.path.exists(FALLBACK_MODEL_PATH):
        return FALLBACK_MODEL_PATH
    return None


_model = None
_model_path = _resolve_model_path()
_class_names = {}

if _model_path is None:
    print(
        "[ML] WARNING: no model found (expected backend/best.pt or "
        "backend/models/best.pt). Server will start but /analyze returns 503 "
        "until a model is trained.",
        flush=True,
    )
else:
    try:
        _model = YOLO(_model_path)
        # Use the model's own class names so the contract matches whatever
        # model is actually loaded (2-class fallback or 4-class trained model).
        _class_names = dict(_model.names) if getattr(_model, "names", None) else {}
        print(f"[ML] YOLO model loaded from {_model_path}", flush=True)
        print(f"[ML] Classes: {_class_names}", flush=True)
    except Exception as e:
        _model = None
        print(f"[ML] ERROR: failed to load YOLO model from {_model_path}: {e}", flush=True)


# -- Deterministic helpers ----------------------------------------------------
def severity_from_confidence(conf: float) -> str:
    """Per-detection severity derived purely from model confidence."""
    if conf > 0.8:
        return "high"
    if conf >= 0.6:
        return "medium"
    return "low"


SEVERITY_RANK = {"none": 0, "low": 1, "medium": 2, "high": 3}
SEVERITY_BY_RANK = {0: "none", 1: "low", 2: "medium", 3: "high"}
SEVERITY_WEIGHT = {"low": 1.0, "medium": 2.0, "high": 3.0}


def run_yolo(image_path: str) -> list:
    """Run real YOLO inference; return detections above CONF_THRESHOLD.

    Each detection: {type, confidence, severity, bbox:[x1,y1,x2,y2]}
    Returns [] when nothing qualifies. Never fabricates detections.
    """
    detections = []
    results = _model(image_path)
    for result in results:
        for box in result.boxes:
            conf = float(box.conf[0].item())
            if conf < CONF_THRESHOLD:
                continue
            cls_id = int(box.cls[0].item())
            xyxy = [round(float(c), 2) for c in box.xyxy[0].tolist()]
            detections.append({
                "type": _class_names.get(cls_id, f"class_{cls_id}"),
                "confidence": round(conf, 4),
                "severity": severity_from_confidence(conf),
                "bbox": xyxy,
            })
    return detections


def aggregate(detections: list) -> dict:
    """Deterministically derive the overall result from the detection list.

    priority_score is a float in [1, 10] when there is at least one detection,
    and 0 when there are none. road_condition and recommended_action are pure
    functions of the detections - fully deterministic, never fabricated.
    """
    if not detections:
        return {
            "detections": [],
            "overall_severity": "none",
            "priority_score": 0,
            "road_condition": "No visible damage detected",
            "recommended_action": "no_action",
        }

    overall_rank = max(SEVERITY_RANK[d["severity"]] for d in detections)
    overall_severity = SEVERITY_BY_RANK[overall_rank]

    # Deterministic priority in [1, 10]:
    # severity weight (1/2/3) scaled by confidence, summed, plus a small count
    # bonus, normalized so a single low/medium/high maps sensibly and multiple
    # severe detections push toward 10.
    raw = 0.0
    for d in detections:
        raw += SEVERITY_WEIGHT[d["severity"]] * d["confidence"]
    raw += (len(detections) - 1) * 0.5  # additional-detection bonus
    # Scale: max single-detection raw ~= 3.0 (high, conf 1.0) -> map to ~9.
    priority_score = round(min(10.0, max(1.0, raw * 3.0)), 2)

    if overall_severity == "high":
        road_condition = "Severe road damage"
        recommended_action = "urgent_repair"
    elif overall_severity == "medium":
        road_condition = "Moderate road damage"
        recommended_action = "schedule_repair"
    else:  # low
        road_condition = "Minor road damage"
        recommended_action = "schedule_inspection"

    return {
        "detections": detections,
        "overall_severity": overall_severity,
        "priority_score": priority_score,
        "road_condition": road_condition,
        "recommended_action": recommended_action,
    }


def parse_image(body_bytes: bytes, content_type: str):
    """Parse the uploaded image from a multipart body using python-multipart.

    Returns (filename, file_bytes) or (None, None).
    """
    boundary = None
    for part in content_type.split(";"):
        part = part.strip()
        if part.startswith("boundary="):
            boundary = part[len("boundary="):].strip().strip('"')
            break
    if not boundary:
        return None, None

    found = {"filename": None, "data": io.BytesIO()}

    def on_part_begin():
        found["filename"] = None
        found["data"] = io.BytesIO()

    def on_header_value(value, start, end):
        text = value[start:end].decode("utf-8", errors="ignore")
        if "filename=" in text:
            after = text.split("filename=", 1)[1].strip().strip('"')
            if after:
                found["filename"] = after

    def on_part_data(data, start, end):
        found["data"].write(data[start:end])

    parser = multipart.MultipartParser(
        boundary.encode("utf-8"),
        callbacks={
            "on_part_begin": on_part_begin,
            "on_header_value": on_header_value,
            "on_part_data": on_part_data,
        },
    )
    parser.write(body_bytes)
    parser.finalize()

    data = found["data"].getvalue()
    if found["filename"] and data:
        return found["filename"], data
    return None, None


# -- HTTP Server --------------------------------------------------------------
class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[ML] {self.address_string()} {fmt % args}", flush=True)

    def send_json(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self.send_json(200, {
                "status": "ok",
                "service": "ml",
                "model_loaded": _model is not None,
            })
        elif self.path == "/":
            self.send_json(200, {
                "status": "ok",
                "service": "ml",
                "model_loaded": _model is not None,
            })
        else:
            self.send_json(404, {"error": "Not found"})

    def do_POST(self):
        if self.path != "/analyze":
            self.send_json(404, {"error": "Not found"})
            return

        if _model is None:
            self.send_json(503, {
                "error": "model not trained yet",
                "detail": (
                    "No YOLO model is loaded. Train a model with "
                    "`python backend/train_road_model.py` (writes backend/best.pt) "
                    "or place a model at backend/models/best.pt, then restart this server."
                ),
            })
            return

        tmp_dir = tempfile.mkdtemp()
        try:
            content_type = self.headers.get("Content-Type", "")
            length = int(self.headers.get("Content-Length", 0))
            body_bytes = self.rfile.read(length)

            if "multipart/form-data" not in content_type:
                self.send_json(400, {"error": "Expected multipart/form-data request"})
                return

            filename, file_data = parse_image(body_bytes, content_type)
            if not filename or not file_data:
                self.send_json(400, {"error": "No image field found in multipart request"})
                return

            ext = os.path.splitext(filename)[1] or ".jpg"
            tmp_file = os.path.join(tmp_dir, f"upload{ext}")
            with open(tmp_file, "wb") as f:
                f.write(file_data)

            detections = run_yolo(tmp_file)
            result = aggregate(detections)
            self.send_json(200, result)

        except Exception as e:
            print(f"[ML] Error: {e}", flush=True)
            self.send_json(500, {"error": str(e)})
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)


if __name__ == "__main__":
    PORT = 5001
    server = HTTPServer(("", PORT), Handler)
    print(f"[ML] Saalai Kural ML Server running on http://localhost:{PORT}", flush=True)
    print(f"[ML] POST /analyze - image analysis endpoint", flush=True)
    print(f"[ML] GET  /health  - health check (model_loaded={_model is not None})", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[ML] Shutting down.", flush=True)
        server.shutdown()
