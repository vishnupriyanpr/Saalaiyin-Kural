from ultralytics import YOLO
import torch, shutil

print(f"CUDA: {torch.cuda.is_available()} | GPU: {torch.cuda.get_device_name(0)}")

model = YOLO('yolov8m.pt')

results = model.train(
    data='backend/dataset/dataset.yaml',
    epochs=100,
    imgsz=640,
    batch=16,
    device=0,
    workers=8,
    optimizer='AdamW',
    lr0=0.001,
    warmup_epochs=3,
    augment=True,
    mosaic=1.0,
    mixup=0.1,
    amp=True,
    patience=20,
    cache=True,
    save=True,
    save_period=10,
    project='backend/runs/train',
    name='saalaikural_v1',
    exist_ok=True,
    plots=True
)

shutil.copy('backend/runs/train/saalaikural_v1/weights/best.pt', 'backend/best.pt')
print("Done. Model saved to backend/best.pt")
