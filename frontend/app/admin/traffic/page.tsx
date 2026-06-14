"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Play, Pause, RotateCcw, Gauge, Timer, Activity, Cpu, Radio, ArrowRight, Sparkles, TrendingUp } from "lucide-react";
import Navbar from "@/components/shared/Navbar";
import { useRequireAuth, getStoredUser } from "@/lib/useAuth";
import { JUNCTIONS, INTENSITIES, DIRS, sampleArrivals, type Dir } from "@/lib/trafficData";
import { TrafficSim, type SimSnapshot, type Mode } from "@/lib/trafficModel";

const CW = 880, CH = 520;          // canvas internal resolution
const STEP = 0.1;                  // simulation seconds per fixed step

// A cheerful but tasteful car palette; cars pick a stable colour from their id.
const CAR_COLORS = [
  "#E2574C", "#3B82F6", "#F59E0B", "#10B981", "#8B5CF6", "#EC4899",
  "#0EA5E9", "#F97316", "#FACC15", "#22C55E", "#14B8A6", "#FB7185",
  "#A855F7", "#EF4444", "#84CC16", "#06B6D4",
];
const carColor = (seed: number) => CAR_COLORS[((seed % CAR_COLORS.length) + CAR_COLORS.length) % CAR_COLORS.length];

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// Draw a little top-down car centred at (cx, cy) heading along `dir`, with a
// body, glass cabin, head/tail lights and a soft shadow — not a dot.
function drawCar(ctx: CanvasRenderingContext2D, cx: number, cy: number, dir: Dir, color: string) {
  const vertical = dir === "N" || dir === "S";
  const LEN = 30, WID = 15;
  const w = vertical ? WID : LEN;
  const h = vertical ? LEN : WID;
  const x = cx - w / 2, y = cy - h / 2;

  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  roundRect(ctx, x + 2, y + 3, w, h, 4); ctx.fill();

  // body
  ctx.fillStyle = color;
  roundRect(ctx, x, y, w, h, 4); ctx.fill();

  // glossy top highlight
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  if (vertical) { roundRect(ctx, x + 1.5, y + 2, w - 3, h * 0.42, 3); }
  else { roundRect(ctx, x + 2, y + 1.5, w * 0.42, h - 3, 3); }
  ctx.fill();

  // windshield / cabin glass (toward the centre of the body)
  ctx.fillStyle = "rgba(12,20,33,0.55)";
  if (vertical) { roundRect(ctx, x + 2.5, y + h * 0.34, w - 5, h * 0.30, 2); }
  else { roundRect(ctx, x + w * 0.34, y + 2.5, w * 0.30, h - 5, 2); }
  ctx.fill();

  // lights: headlights at the FRONT (travel direction), taillights at the REAR
  const head = "rgba(255,244,190,0.95)";
  const tail = "rgba(255,86,66,0.95)";
  const dot = (px: number, py: number, c: string) => { ctx.fillStyle = c; roundRect(ctx, px - 1.6, py - 1.6, 3.2, 3.2, 1); ctx.fill(); };
  if (dir === "N") { // front = bottom
    dot(x + 3, y + h - 2.5, head); dot(x + w - 3, y + h - 2.5, head);
    dot(x + 3, y + 2.5, tail); dot(x + w - 3, y + 2.5, tail);
  } else if (dir === "S") { // front = top
    dot(x + 3, y + 2.5, head); dot(x + w - 3, y + 2.5, head);
    dot(x + 3, y + h - 2.5, tail); dot(x + w - 3, y + h - 2.5, tail);
  } else if (dir === "E") { // front = left
    dot(x + 2.5, y + 3, head); dot(x + 2.5, y + h - 3, head);
    dot(x + w - 2.5, y + 3, tail); dot(x + w - 2.5, y + h - 3, tail);
  } else { // W, front = right
    dot(x + w - 2.5, y + 3, head); dot(x + w - 2.5, y + h - 3, head);
    dot(x + 2.5, y + 3, tail); dot(x + 2.5, y + h - 3, tail);
  }
}

function drawIntersection(ctx: CanvasRenderingContext2D, sim: TrafficSim) {
  const W = CW, H = CH, cx = W / 2, cy = H / 2, road = 140, half = road / 2, lane = 30;
  ctx.clearRect(0, 0, W, H);

  // grassy / ground backdrop with a soft vignette
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0c1016"); bg.addColorStop(1, "#0a0d12");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // asphalt
  ctx.fillStyle = "#23282f";
  ctx.fillRect(0, cy - half, W, road);
  ctx.fillRect(cx - half, 0, road, H);
  // subtle asphalt shading at the edges of each carriageway
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(0, cy - half, W, 6); ctx.fillRect(0, cy + half - 6, W, 6);
  ctx.fillRect(cx - half, 0, 6, H); ctx.fillRect(cx + half - 6, 0, 6, H);
  // intersection box (slightly different tone)
  ctx.fillStyle = "#1b2027"; ctx.fillRect(cx - half, cy - half, road, road);

  // lane edge lines (solid)
  ctx.strokeStyle = "#5b6675"; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, cy - half + 3); ctx.lineTo(cx - half, cy - half + 3);
  ctx.moveTo(cx + half, cy - half + 3); ctx.lineTo(W, cy - half + 3);
  ctx.moveTo(0, cy + half - 3); ctx.lineTo(cx - half, cy + half - 3);
  ctx.moveTo(cx + half, cy + half - 3); ctx.lineTo(W, cy + half - 3);
  ctx.moveTo(cx - half + 3, 0); ctx.lineTo(cx - half + 3, cy - half);
  ctx.moveTo(cx - half + 3, cy + half); ctx.lineTo(cx - half + 3, H);
  ctx.moveTo(cx + half - 3, 0); ctx.lineTo(cx + half - 3, cy - half);
  ctx.moveTo(cx + half - 3, cy + half); ctx.lineTo(cx + half - 3, H);
  ctx.stroke();

  // dashed centre lines (yellow)
  ctx.strokeStyle = "#9a8431"; ctx.lineWidth = 2.5; ctx.setLineDash([18, 16]);
  ctx.beginPath();
  ctx.moveTo(0, cy); ctx.lineTo(cx - half, cy); ctx.moveTo(cx + half, cy); ctx.lineTo(W, cy);
  ctx.moveTo(cx, 0); ctx.lineTo(cx, cy - half); ctx.moveTo(cx, cy + half); ctx.lineTo(cx, H);
  ctx.stroke(); ctx.setLineDash([]);

  // zebra crosswalks + stop lines on each arm
  ctx.fillStyle = "rgba(226,232,240,0.85)";
  const zebra = (ax: "h" | "v", bx: number, by: number) => {
    for (let i = 0; i < 5; i++) {
      if (ax === "h") ctx.fillRect(bx + i * (road / 5) + 3, by, road / 5 - 6, 6);
      else ctx.fillRect(bx, by + i * (road / 5) + 3, 6, road / 5 - 6);
    }
  };
  zebra("h", cx - half, cy - half - 12); // north arm
  zebra("h", cx - half, cy + half + 6);  // south arm
  zebra("v", cx - half - 12, cy - half); // west arm
  zebra("v", cx + half + 6, cy - half);  // east arm

  // queued cars (stopped at red), nicely spaced single-file per approach
  const carL = 30, spacing = carL + 9;
  const maxVis = Math.max(3, Math.floor((Math.min(W, H) / 2 - half - 14) / spacing));
  for (const dir of DIRS) {
    const q = sim.queues[dir];
    const n = Math.min(q, maxVis);
    for (let i = 0; i < n; i++) {
      let px = 0, py = 0;
      if (dir === "N") { px = cx + lane / 2; py = cy - half - spacing * (i + 1) + spacing / 2; }
      else if (dir === "S") { px = cx - lane / 2; py = cy + half + spacing * i + spacing / 2; }
      else if (dir === "E") { px = cx + half + spacing * i + spacing / 2; py = cy - lane / 2; }
      else { px = cx - half - spacing * (i + 1) + spacing / 2; py = cy + lane / 2; }
      // stable per-slot colour so the queue doesn't flicker between frames
      drawCar(ctx, px, py, dir, carColor(dir.charCodeAt(0) * 7 + i));
    }
    // overflow badge
    if (q > maxVis) {
      ctx.fillStyle = "#F59E0B"; ctx.font = "bold 14px ui-sans-serif, system-ui";
      ctx.textBaseline = "middle"; ctx.textAlign = "center";
      if (dir === "N") ctx.fillText("+" + (q - maxVis), cx + lane / 2, cy - half - spacing * (maxVis + 1));
      else if (dir === "S") ctx.fillText("+" + (q - maxVis), cx - lane / 2, cy + half + spacing * (maxVis + 0.6));
      else if (dir === "E") ctx.fillText("+" + (q - maxVis), cx + half + spacing * (maxVis + 0.5), cy - lane / 2);
      else ctx.fillText("+" + (q - maxVis), cx - half - spacing * (maxVis + 0.6), cy + lane / 2);
    }
  }

  // crossing cars (smoothly interpolated across the box by their progress t)
  for (const c of sim.crossing) {
    let px = 0, py = 0;
    if (c.dir === "N") { px = cx + lane / 2; py = cy - half + c.t * road; }
    else if (c.dir === "S") { px = cx - lane / 2; py = cy + half - c.t * road; }
    else if (c.dir === "E") { px = cx + half - c.t * road; py = cy - lane / 2; }
    else { px = cx - half + c.t * road; py = cy + lane / 2; }
    drawCar(ctx, px, py, c.dir, carColor(c.id));
  }

  // traffic-signal heads (housing + 3 lamps) at each approach
  const greenDirs = sim.greenDirs();
  const phaseDirs: Dir[] = sim.phase === "NS" ? ["N", "S"] : ["E", "W"];
  const state = (dir: Dir): "r" | "y" | "g" =>
    sim.amber ? (phaseDirs.includes(dir) ? "y" : "r") : (greenDirs.includes(dir) ? "g" : "r");
  const sigPos: Record<Dir, [number, number]> = {
    N: [cx + lane + 30, cy - half - 22],
    S: [cx - lane - 30, cy + half + 22],
    E: [cx + half + 22, cy - lane - 30],
    W: [cx - half - 22, cy + lane + 30],
  };
  for (const dir of DIRS) {
    const [sx, sy] = sigPos[dir];
    const st = state(dir);
    // housing
    ctx.fillStyle = "#0b0e13";
    roundRect(ctx, sx - 7, sy - 20, 14, 40, 5); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 1; ctx.stroke();
    const lamps: ["r" | "y" | "g", number, string][] = [["r", -12, "#EF4444"], ["y", 0, "#F59E0B"], ["g", 12, "#22C55E"]];
    for (const [k, dy, col] of lamps) {
      const on = st === k;
      ctx.beginPath(); ctx.arc(sx, sy + dy, 5, 0, Math.PI * 2);
      ctx.fillStyle = on ? col : "rgba(255,255,255,0.10)";
      if (on) { ctx.shadowColor = col; ctx.shadowBlur = 14; }
      ctx.fill(); ctx.shadowBlur = 0;
    }
  }
}

function Stat({ icon: Icon, label, value, sub, accent }: { icon: any; label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
      <div className="flex items-center gap-2 text-slate-400">
        <Icon className="w-4 h-4" style={{ color: accent }} strokeWidth={1.8} />
        <span className="text-[10px] font-mono uppercase tracking-wider">{label}</span>
      </div>
      <div className="mt-1.5 text-2xl font-black text-slate-800 tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

// Lazy, build-once sim instance (avoids re-allocating a TrafficSim every render).
function useSim(mode: Mode) {
  const ref = useRef<TrafficSim | null>(null);
  if (ref.current === null) ref.current = new TrafficSim(mode);
  return ref as React.MutableRefObject<TrafficSim>;
}

type Snap3 = { rl: SimSnapshot; mp: SimSnapshot; f: SimSnapshot };

const MODE_LABEL: Record<Mode, string> = { rl: "AI · Reinforcement Learning", adaptive: "Max-pressure", fixed: "Fixed-time" };

export default function TrafficManagement() {
  const router = useRouter();
  const { ready } = useRequireAuth();
  const [session, setSession] = useState<any>(null);

  const [junctionId, setJunctionId] = useState(JUNCTIONS[0].id);
  const [intensityId, setIntensityId] = useState("peak");
  const [mode, setMode] = useState<Mode>("rl");
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(2);
  const [snap, setSnap] = useState<Snap3 | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRL = useSim("rl");
  const simMP = useSim("adaptive");
  const simF = useSim("fixed");

  // live params mirrored into refs so the rAF loop never restarts
  const runningRef = useRef(running);
  const speedRef = useRef(speed);
  const modeRef = useRef(mode);
  const junctionRef = useRef(junctionId);
  const intensityRef = useRef(intensityId);
  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { junctionRef.current = junctionId; }, [junctionId]);
  useEffect(() => { intensityRef.current = intensityId; }, [intensityId]);

  // auth
  useEffect(() => {
    if (!ready) return;
    const parsed = getStoredUser();
    if (parsed?.role !== "admin") { router.replace("/login"); return; }
    setSession(parsed);
  }, [ready, router]);

  const snapAll = (): Snap3 => ({ rl: simRL.current.snapshot(), mp: simMP.current.snapshot(), f: simF.current.snapshot() });
  const resetSims = () => { simRL.current.reset(); simMP.current.reset(); simF.current.reset(); setSnap(snapAll()); };
  // reset when the scenario changes (the RL agent KEEPS its learned policy)
  useEffect(() => { resetSims(); }, [junctionId, intensityId]);

  // single rAF loop drives all three sims (shared arrivals) and draws the selected one
  useEffect(() => {
    let raf = 0; let last = performance.now(); let acc = 0; let lastSnap = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dtReal = Math.min((now - last) / 1000, 0.05); last = now;
      if (runningRef.current) {
        acc += dtReal * speedRef.current;
        let steps = 0;
        const j = JUNCTIONS.find((x) => x.id === junctionRef.current) ?? JUNCTIONS[0];
        const mult = (INTENSITIES.find((x) => x.id === intensityRef.current) ?? INTENSITIES[0]).mult;
        while (acc >= STEP && steps < 60) {
          const arr = sampleArrivals(j.base, mult, STEP);
          simRL.current.tick(STEP, arr);
          simMP.current.tick(STEP, arr);
          simF.current.tick(STEP, arr);
          acc -= STEP; steps++;
        }
      }
      const ctx = canvasRef.current?.getContext("2d");
      const drawSim = modeRef.current === "rl" ? simRL.current : modeRef.current === "adaptive" ? simMP.current : simF.current;
      if (ctx) drawIntersection(ctx, drawSim);
      if (now - lastSnap > 200) { lastSnap = now; setSnap(snapAll()); }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Activity className="w-7 h-7 text-primary animate-pulse" />
      </div>
    );
  }

  const shown = snap ? (mode === "rl" ? snap.rl : mode === "adaptive" ? snap.mp : snap.f) : null;
  const rlStats = snap?.rl.rl;
  const wRL = snap?.rl.avgWaitSec ?? 0;
  const wF = snap?.f.avgWaitSec ?? 0;
  const waitImprovement = wF > 1 ? Math.round((1 - wRL / wF) * 100) : 0;
  const clearedDelta = snap ? snap.rl.cleared - snap.f.cleared : 0;
  const phaseLabel = shown ? (shown.amber ? "ALL-RED CLEARANCE" : shown.phase === "NS" ? "NORTH ⇅ SOUTH" : "EAST ⇄ WEST") : "—";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col pb-16">
      <Navbar portal="admin" userId={session?.userId} userName={session?.name} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-8 mt-6 space-y-6">
        {/* header */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="p-6 rounded-2xl bg-gradient-to-br from-[#0F141C] via-[#131A24] to-[#0c1934] text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-[-30%] right-[-8%] w-56 h-56 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5 text-secondary" /> Adaptive Signal Control · போக்குவரத்து மேலாண்மை
              </span>
              <h2 className="text-2xl font-display font-black tracking-tight mt-1">Traffic Management Engine</h2>
              <p className="text-xs text-slate-400 mt-1 max-w-xl">
                A <strong className="text-slate-200">reinforcement-learning</strong> signal controller that learns its policy
                live, benchmarked against max-pressure and fixed-time on the same traffic. Dataset-driven today —
                architected to ingest <strong className="text-slate-200">live CCTV</strong> vehicle counts next.
              </p>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <span className="px-3 py-1.5 rounded-full text-[11px] font-mono bg-secondary/15 border border-secondary/30 text-amber-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> REINFORCEMENT LEARNING
              </span>
              <span className="px-3 py-1.5 rounded-full text-[11px] font-mono bg-amber-400/10 border border-amber-400/20 text-amber-300/80 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5" /> DATASET MODE
              </span>
            </div>
          </div>
        </motion.div>

        {/* controls */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center gap-4 flex-wrap">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Junction</span>
            <select value={junctionId} onChange={(e) => setJunctionId(e.target.value)}
              className="py-1.5 px-3 rounded-lg text-sm bg-slate-100 border border-slate-200 focus:outline-none">
              {JUNCTIONS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Demand</span>
            <div className="flex rounded-lg bg-slate-100 border border-slate-200 p-1">
              {INTENSITIES.map((x) => (
                <button key={x.id} onClick={() => setIntensityId(x.id)}
                  className={`py-1 px-3 rounded-md text-xs font-semibold transition ${intensityId === x.id ? "bg-primary text-white shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                  {x.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Controller (shown)</span>
            <div className="flex rounded-lg bg-slate-100 border border-slate-200 p-1">
              <button onClick={() => setMode("rl")}
                className={`py-1 px-3 rounded-md text-xs font-semibold transition flex items-center gap-1.5 ${mode === "rl" ? "bg-secondary text-white shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                <Sparkles className="w-3.5 h-3.5" /> AI · RL
              </button>
              <button onClick={() => setMode("adaptive")}
                className={`py-1 px-3 rounded-md text-xs font-semibold transition ${mode === "adaptive" ? "bg-primary text-white shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                Max-pressure
              </button>
              <button onClick={() => setMode("fixed")}
                className={`py-1 px-3 rounded-md text-xs font-semibold transition ${mode === "fixed" ? "bg-slate-700 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                Fixed-time
              </button>
            </div>
          </div>

          <div className="flex items-end gap-2 ml-auto">
            <button onClick={() => setRunning((r) => !r)}
              className="py-2 px-4 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-bold flex items-center gap-2 shadow-sm">
              {running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}{running ? "Pause" : "Run"}
            </button>
            <div className="flex rounded-lg bg-slate-100 border border-slate-200 p-1">
              {[1, 2, 4].map((s) => (
                <button key={s} onClick={() => setSpeed(s)}
                  className={`py-1.5 px-2.5 rounded-md text-xs font-bold transition ${speed === s ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-800"}`}>{s}×</button>
              ))}
            </div>
            <button onClick={resetSims} title="Reset traffic (keeps the AI's learned policy)"
              className="py-2 px-3 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 hover:bg-slate-200 transition">
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-[1.6fr_1fr] gap-6">
          {/* simulation canvas */}
          <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-lg bg-[#0E1116] relative">
            <div className="absolute top-3 left-4 z-10 flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded-md text-[10px] font-mono font-bold ${mode === "rl" ? "bg-secondary/20 text-amber-300 border border-amber-400/30" : mode === "adaptive" ? "bg-primary/20 text-orange-200 border border-primary/30" : "bg-slate-700/40 text-slate-300 border border-slate-600"}`}>
                {MODE_LABEL[mode]}
              </span>
              <span className="px-2.5 py-1 rounded-md text-[10px] font-mono text-slate-300 bg-black/30 border border-white/10">{phaseLabel}</span>
            </div>
            <canvas ref={canvasRef} width={CW} height={CH} className="w-full h-auto block" />
            <div className="absolute bottom-3 left-4 z-10 flex gap-3 text-[10px] font-mono text-slate-400">
              {DIRS.map((d) => (
                <span key={d} className="flex items-center gap-1">
                  <span className="text-slate-500">{d}</span>
                  <span className="text-slate-200 font-bold tabular-nums">{shown ? shown.queues[d] : 0}</span>
                </span>
              ))}
            </div>
          </div>

          {/* metrics + RL learning + comparison */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Stat icon={Timer} label="Avg wait" value={shown ? `${shown.avgWaitSec.toFixed(1)}s` : "—"} sub="per vehicle" accent="#E29A13" />
              <Stat icon={Gauge} label="Throughput" value={shown ? `${Math.round(shown.throughputPerMin)}` : "—"} sub="veh / min" accent="#0F6A3D" />
              <Stat icon={Activity} label="Cleared" value={shown ? shown.cleared.toLocaleString("en-IN") : "—"} sub="vehicles" accent="#2563EB" />
              <Stat icon={ArrowRight} label="Max queue" value={shown ? `${shown.maxQueue}` : "—"} sub="peak backlog" accent="#DC2626" />
            </div>

            {/* RL learning panel */}
            <div className="p-5 rounded-2xl bg-gradient-to-br from-[#11161f] to-[#0c1322] text-white border border-slate-800 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-secondary" />
                <span className="text-xs font-bold">Reinforcement-learning model</span>
                <span className="text-[10px] text-slate-400 ml-auto">Q-learning · learns live</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-lg font-black tabular-nums">{rlStats ? rlStats.states.toLocaleString("en-IN") : "—"}</div>
                  <div className="text-[9px] font-mono uppercase tracking-wider text-slate-400">states learned</div>
                </div>
                <div>
                  <div className="text-lg font-black tabular-nums">{rlStats ? rlStats.updates.toLocaleString("en-IN") : "—"}</div>
                  <div className="text-[9px] font-mono uppercase tracking-wider text-slate-400">Q-updates</div>
                </div>
                <div>
                  <div className="text-lg font-black tabular-nums">{rlStats ? `${(rlStats.epsilon * 100).toFixed(0)}%` : "—"}</div>
                  <div className="text-[9px] font-mono uppercase tracking-wider text-slate-400">exploration</div>
                </div>
              </div>
              <div className="mt-4">
                <div className="flex justify-between text-[10px] font-mono text-slate-400 mb-1">
                  <span>policy confidence</span>
                  <span>{rlStats ? `${Math.round(rlStats.confidence * 100)}%` : "—"}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <motion.div className="h-full rounded-full bg-gradient-to-r from-secondary to-amber-300"
                    animate={{ width: `${rlStats ? Math.round(rlStats.confidence * 100) : 0}%` }}
                    transition={{ ease: "easeOut", duration: 0.4 }} />
                </div>
                <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                  No pre-training — the agent starts naïve and improves from its own reward
                  (cleared vehicles minus waiting) as the simulation runs.
                </p>
              </div>
            </div>

            {/* three-way comparison: RL vs max-pressure vs fixed */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-secondary" />
                <span className="text-xs font-bold text-slate-700">RL vs Max-pressure vs Fixed</span>
                <span className="text-[10px] text-slate-400 ml-auto">same traffic, three controllers</span>
              </div>
              <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-1 text-[10px] font-mono uppercase tracking-wider text-slate-400 pb-2 border-b border-slate-100">
                <span></span><span className="text-right text-secondary">RL</span><span className="text-right">Max-P</span><span className="text-right">Fixed</span>
              </div>
              <div className="divide-y divide-slate-100">
                <Compare3 label="Avg wait / veh" rl={snap ? snap.rl.avgWaitSec : 0} mp={snap ? snap.mp.avgWaitSec : 0} f={snap ? snap.f.avgWaitSec : 0} fmt={(v) => `${v.toFixed(1)}s`} lowerBetter />
                <Compare3 label="Vehicles cleared" rl={snap ? snap.rl.cleared : 0} mp={snap ? snap.mp.cleared : 0} f={snap ? snap.f.cleared : 0} fmt={(v) => v.toLocaleString("en-IN")} />
                <Compare3 label="Peak queue" rl={snap ? snap.rl.maxQueue : 0} mp={snap ? snap.mp.maxQueue : 0} f={snap ? snap.f.maxQueue : 0} fmt={(v) => `${v}`} lowerBetter />
              </div>
              <div className="mt-4 p-3 rounded-xl bg-success-light border border-success/20 text-center">
                <p className="text-sm font-extrabold text-success">
                  {waitImprovement > 0
                    ? `${waitImprovement}% less waiting than fixed-time`
                    : "RL agent is still learning — give it a few seconds…"}
                </p>
                {clearedDelta > 0 && <p className="text-[11px] text-slate-500 mt-0.5">+{clearedDelta.toLocaleString("en-IN")} more vehicles cleared than fixed-time</p>}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-100 border border-slate-200">
              <p className="text-[11px] text-slate-500 leading-relaxed">
                <Radio className="w-3.5 h-3.5 inline mr-1 text-slate-400" />
                <strong className="text-slate-700">Roadmap:</strong> the same engine accepts live per-approach vehicle counts —
                swap the dataset sampler for a CCTV detector feed and the trained policy controls real signals unchanged.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// One comparison row across the three controllers, highlighting the best cell.
function Compare3({ label, rl, mp, f, fmt, lowerBetter }: {
  label: string; rl: number; mp: number; f: number; fmt: (v: number) => string; lowerBetter?: boolean;
}) {
  const vals = [rl, mp, f];
  const best = lowerBetter ? Math.min(...vals) : Math.max(...vals);
  const cell = (v: number, primary?: boolean) => {
    const isBest = v === best && (rl !== mp || mp !== f);
    return (
      <span className={`text-right tabular-nums ${isBest ? "text-success font-extrabold" : primary ? "text-slate-700 font-bold" : "text-slate-400"}`}>
        {fmt(v)}
      </span>
    );
  };
  return (
    <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-1 items-center py-2 text-xs">
      <span className="text-slate-500">{label}</span>
      {cell(rl, true)}{cell(mp)}{cell(f)}
    </div>
  );
}
