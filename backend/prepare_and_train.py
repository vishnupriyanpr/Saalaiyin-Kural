import os, sys, glob, zipfile, random, shutil, subprocess, urllib.request
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.abspath(__file__))           # backend/
DATA = os.path.join(ROOT, 'dataset')
ZIP  = os.path.join(DATA, 'RDD2022.zip')
RAW  = os.path.join(DATA, 'RDD2022_raw')
OUT  = os.path.join(DATA, 'rdd2022')
URL  = 'https://ndownloader.figshare.com/files/38030910'
CLASSES = {'D00': 0, 'D10': 1, 'D20': 2, 'D40': 3}
NAMES   = ['longitudinal_crack', 'transverse_crack', 'alligator_crack', 'pothole']

def log(m): print(m, flush=True)

os.makedirs(DATA, exist_ok=True)

# 1) Download (resumable via curl, urllib fallback)
need = (not os.path.exists(ZIP)) or os.path.getsize(ZIP) < 13_000_000_000
if need:
    log('Downloading RDD2022 (~12.3 GB)...')
    rc = subprocess.call(['curl.exe', '-L', '-C', '-', '--retry', '5', '-o', ZIP, URL])
    if rc != 0 or (os.path.exists(ZIP) and os.path.getsize(ZIP) < 13_000_000_000):
        log('curl incomplete, falling back to urllib...')
        with urllib.request.urlopen(urllib.request.Request(URL)) as r, open(ZIP, 'wb') as f:
            shutil.copyfileobj(r, f, 1 << 20)
    log('Download done: %.2f GB' % (os.path.getsize(ZIP) / 1e9))
else:
    log('Zip already present.')

# 2) Extract
if not os.path.isdir(RAW):
    log('Extracting...')
    with zipfile.ZipFile(ZIP) as z: z.extractall(RAW)
log('Extracted.')

# 3) Locate India train images + VOC xmls (robust glob)
def find(*parts):
    hits = glob.glob(os.path.join(RAW, '**', *parts), recursive=True)
    return hits[0] if hits else None
img_dir = find('India', 'train', 'images') or find('India', '**', 'images')
xml_dir = find('India', 'train', 'annotations', 'xmls') or find('India', '**', 'xmls')
if not img_dir or not xml_dir:
    log('ERROR: India train images/xmls not found. Top-level under RAW:')
    for p in glob.glob(os.path.join(RAW, '*')): log('  ' + p)
    sys.exit(1)
log('images: ' + img_dir); log('xmls: ' + xml_dir)

# 4) VOC -> YOLO conversion + 85/15 split
for sub in ['train/images', 'train/labels', 'valid/images', 'valid/labels']:
    os.makedirs(os.path.join(OUT, sub), exist_ok=True)
xmls = glob.glob(os.path.join(xml_dir, '*.xml'))
random.seed(42); random.shuffle(xmls)
val_set = set(xmls[:max(1, int(len(xmls) * 0.15))])
kept = 0
for xp in xmls:
    try:
        root = ET.parse(xp).getroot()
        size = root.find('size')
        W = float(size.find('width').text); Hh = float(size.find('height').text)
    except Exception:
        continue
    if W <= 0 or Hh <= 0: continue
    lines = []
    for obj in root.findall('object'):
        nm = (obj.findtext('name') or '').strip()
        if nm not in CLASSES: continue
        b = obj.find('bndbox')
        x1 = float(b.findtext('xmin')); y1 = float(b.findtext('ymin'))
        x2 = float(b.findtext('xmax')); y2 = float(b.findtext('ymax'))
        cx = ((x1 + x2) / 2) / W; cy = ((y1 + y2) / 2) / Hh
        bw = (x2 - x1) / W; bh = (y2 - y1) / Hh
        if bw <= 0 or bh <= 0: continue
        lines.append('%d %.6f %.6f %.6f %.6f' % (CLASSES[nm], cx, cy, bw, bh))
    if not lines: continue
    base = os.path.splitext(os.path.basename(xp))[0]
    src = os.path.join(img_dir, base + '.jpg')
    if not os.path.exists(src): continue
    split = 'valid' if xp in val_set else 'train'
    shutil.copy(src, os.path.join(OUT, split, 'images', base + '.jpg'))
    with open(os.path.join(OUT, split, 'labels', base + '.txt'), 'w') as f:
        f.write('\n'.join(lines))
    kept += 1
log('Converted %d labelled images.' % kept)
if kept < 50:
    log('ERROR: too few labelled images converted; aborting.'); sys.exit(1)

# 5) dataset.yaml
with open(os.path.join(OUT, 'dataset.yaml'), 'w') as f:
    f.write('path: %s\ntrain: train/images\nval: valid/images\nnc: 4\nnames: %s\n' % (OUT.replace('\\', '/'), NAMES))

# 6) Train YOLOv8s (auto-batch to fit 8GB)
from ultralytics import YOLO
import torch
log('CUDA %s' % torch.cuda.is_available())
model = YOLO('yolov8s.pt')
model.train(data=os.path.join(OUT, 'dataset.yaml'), epochs=80, imgsz=640, batch=-1,
            device=0 if torch.cuda.is_available() else 'cpu', patience=20, amp=True,
            cache=False, project=os.path.join(ROOT, 'runs', 'train'),
            name='saalaikural_v1', exist_ok=True, plots=True)
best = os.path.join(ROOT, 'runs', 'train', 'saalaikural_v1', 'weights', 'best.pt')
shutil.copy(best, os.path.join(ROOT, 'best.pt'))
log('DONE. Model saved to backend/best.pt')
