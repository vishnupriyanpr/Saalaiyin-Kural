<#
  RoadWatch - start every service for local development.

  Brings up the full stack:
    1. Docker:   Postgres (5432), Redis (host 6380 -> 6379), n8n (5678)
    2. Backend:  Express API + WebSocket (8000)
    3. Worker:   Redis complaint-queue -> smart routing consumer
    4. ML:       YOLO inference server (5001)
    5. Frontend: Next.js dev server (3000)

  Usage:
    powershell -ExecutionPolicy Bypass -File .\start_roadwatch.ps1            # start everything
    powershell -ExecutionPolicy Bypass -File .\start_roadwatch.ps1 -Seed      # also re-seed the DB (wipes + reinserts)
    powershell -ExecutionPolicy Bypass -File .\start_roadwatch.ps1 -Migrate   # also run knex migrations
    powershell -ExecutionPolicy Bypass -File .\start_roadwatch.ps1 -Clean     # also wipe frontend\.next (fixes corrupted dev cache)

  Fresh-machine ready: installs Node.js / Python / Docker Desktop (via winget), generates the
  .env files, starts Docker, installs all deps, downloads the ML model, migrates + seeds the DB,
  and launches every service. On a new computer: copy/clone the repo, then double-click
  start_roadwatch.bat (reboot once if it just installed Docker/Node, then run it again).
  Re-running is safe: it frees ports 8000/5001/3000 first, so it never collides with a stale
  instance (no more EADDRINUSE).
#>
param(
  [switch]$Seed,
  [switch]$Migrate,
  [switch]$Clean
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
Set-Location $root

Clear-Host
# --- Tricolour ROADWATCH block banner (Indian-flag: saffron / white / green) ---
$e = [char]27
$SAF = $e + '[1;38;2;255;153;51m'   # saffron
$WHT = $e + '[1;38;2;255;255;255m'  # white
$GRN = $e + '[1;38;2;19;136;8m'     # green
$RST = $e + '[0m'
$gS = @('███████╗','██╔════╝','███████╗','╚════██║','███████║','╚══════╝')
$gA = @(' █████╗ ','██╔══██╗','███████║','██╔══██║','██║  ██║','╚═╝  ╚═╝')
$gL = @('██╗     ','██║     ','██║     ','██║     ','███████╗','╚══════╝')
$gI = @('██╗','██║','██║','██║','██║','╚═╝')
$gK = @('██╗  ██╗','██║ ██╔╝','█████╔╝ ','██╔═██╗ ','██║  ██╗','╚═╝  ╚═╝')
$gU = @('██╗   ██╗','██║   ██║','██║   ██║','██║   ██║','╚██████╔╝',' ╚═════╝ ')
$gR = @('██████╗ ','██╔══██╗','██████╔╝','██╔══██╗','██║  ██║','╚═╝  ╚═╝')
$gY = @('██╗   ██╗','╚██╗ ██╔╝',' ╚████╔╝ ','  ╚██╔╝  ','   ██║   ','   ╚═╝   ')
$gN = @('███╗   ██╗','████╗  ██║','██╔██╗ ██║','██║╚██╗██║','██║ ╚████║','╚═╝  ╚═══╝')
Write-Host ""
0..5 | ForEach-Object { Write-Host ($SAF + '  ' + $gS[$_] + ' ' + $gA[$_] + ' ' + $gA[$_] + ' ' + $gL[$_] + ' ' + $gA[$_] + ' ' + $gI[$_] + ' ' + $gY[$_] + ' ' + $gI[$_] + ' ' + $gN[$_] + $RST) }
Write-Host ($WHT + '  Voice of the Road  -  Government of Tamil Nadu' + $RST)
0..5 | ForEach-Object { Write-Host ($GRN + '  ' + $gK[$_] + ' ' + $gU[$_] + ' ' + $gR[$_] + ' ' + $gA[$_] + ' ' + $gL[$_] + $RST) }
Write-Host ""

# --- 0. Docker daemon check ---------------------------------------------------
# --- Dependency check + install (portable to a fresh machine) ----------------
Write-Host "`n[deps] Checking toolchain (Node / Python / Docker)..." -ForegroundColor Yellow
function Test-Cmd($c) { return [bool](Get-Command $c -ErrorAction SilentlyContinue) }
$wingetOk = Test-Cmd 'winget'
function Ensure-Tool($cmd, $id, $label) {
  if (Test-Cmd $cmd) { Write-Host "  [ok]  $label" -ForegroundColor Green; return $true }
  if ($wingetOk) {
    Write-Host "  [..]  $label missing - installing via winget ($id)..." -ForegroundColor DarkYellow
    winget install --id $id -e --accept-source-agreements --accept-package-agreements | Out-Null
    $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
    if (Test-Cmd $cmd) { Write-Host "  [ok]  $label installed" -ForegroundColor Green; return $true }
    Write-Host "  [!!]  $label installed but not yet on PATH - close & reopen this window, then re-run." -ForegroundColor Red
    return $false
  }
  Write-Host "  [!!]  $label missing and winget unavailable - install it manually, then re-run." -ForegroundColor Red
  return $false
}
$okNode   = Ensure-Tool 'node'   'OpenJS.NodeJS.LTS'    'Node.js (+ npm)'
$okPython = Ensure-Tool 'python' 'Python.Python.3.12'   'Python 3'
$okDocker = Ensure-Tool 'docker' 'Docker.DockerDesktop' 'Docker Desktop'
if (-not (Test-Cmd 'wt') -and $wingetOk) {
  Write-Host "  [..]  Windows Terminal (optional, for the split view) - installing..." -ForegroundColor DarkYellow
  winget install --id Microsoft.WindowsTerminal -e --accept-source-agreements --accept-package-agreements | Out-Null
}
if (-not ($okNode -and $okPython -and $okDocker)) {
  Write-Error "Required tools are missing (see [!!] above). A reboot may be needed after a fresh Docker/Node install. Install them, then re-run start_roadwatch.bat."
  exit 1
}

# --- Environment files (generated if missing - required on a fresh machine) ---
Write-Host "`n[env] Ensuring environment files exist..." -ForegroundColor Yellow
$beEnv = "$root\backend\.env"
if (-not (Test-Path $beEnv)) {
  Write-Host "  Creating backend\.env (first run, with fresh secrets)..." -ForegroundColor DarkYellow
  # Cryptographically-secure secrets (256-bit CSPRNG, NOT Get-Random which is clock-seeded)
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $b1 = New-Object byte[] 32; $rng.GetBytes($b1); $jwt    = -join ($b1 | ForEach-Object { '{0:x2}' -f $_ })
  $b2 = New-Object byte[] 32; $rng.GetBytes($b2); $ingest = -join ($b2 | ForEach-Object { '{0:x2}' -f $_ })
  $rng.Dispose()
  $beContent = @"
JWT_SECRET=$jwt
NODE_ENV=development
PORT=8000
ML_SERVER_URL=http://localhost:5001
NEXT_PUBLIC_API_URL=http://localhost:8000
DATABASE_URL=postgresql://roadwatch_user:roadwatch_pass@localhost:5432/roadwatch
REDIS_URL=redis://localhost:6380
N8N_WEBHOOK_URL=http://localhost:5678/webhook/roadwatch-chat
INGEST_TOKEN=$ingest
"@
  Set-Content -Path $beEnv -Value $beContent -Encoding UTF8
  Write-Host "  backend\.env created." -ForegroundColor Green
} else { Write-Host "  backend\.env present." -ForegroundColor Green }

$feEnv = "$root\frontend\.env.local"
if (-not (Test-Path $feEnv)) {
  Write-Host "  Creating frontend\.env.local (first run)..." -ForegroundColor DarkYellow
  Set-Content -Path $feEnv -Value "NEXT_PUBLIC_API_URL=http://localhost:8000" -Encoding UTF8
  Write-Host "  frontend\.env.local created." -ForegroundColor Green
} else { Write-Host "  frontend\.env.local present." -ForegroundColor Green }

# Probe the Docker daemon WITHOUT tripping $ErrorActionPreference='Stop'. In Windows
# PowerShell 5.1, redirecting a native command's stderr (which `docker version` writes to
# when the daemon is down) is wrapped as a TERMINATING NativeCommandError under Stop — that
# used to kill this script before the auto-launch logic below could run. Routing through
# cmd.exe swallows both streams so PowerShell only ever reads the exit code.
function Test-DockerUp {
  cmd /c "docker version > NUL 2>&1"
  return ($LASTEXITCODE -eq 0)
}

function Find-DockerDesktop {
  $paths = @(
    "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
    "C:\Program Files\Docker\Docker\Docker Desktop.exe",
    "$env:LOCALAPPDATA\Docker\Docker Desktop.exe"
  )
  return ($paths | Where-Object { Test-Path $_ } | Select-Object -First 1)
}

function Start-DockerDesktop {
  $dd = Find-DockerDesktop
  if ($dd) { Start-Process $dd; return $true }
  Write-Host "  Docker Desktop not found. Install it: winget install Docker.DockerDesktop (a reboot may be required)." -ForegroundColor Red
  return $false
}

# Poll until the daemon answers or the timeout elapses; prints a live progress line
# so a slow cold boot doesn't look like a hang.
function Wait-DockerUp([int]$TimeoutSec = 150) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    if (Test-DockerUp) { Write-Host ""; return $true }
    Write-Host "." -NoNewline -ForegroundColor DarkGray
    Start-Sleep -Seconds 3
  }
  Write-Host ""
  return $false
}

# Self-heal for the classic "Docker Desktop stuck on Starting / WSL2 engine hung" case:
# kill the desktop app + backend, terminate Docker's WSL distro, then relaunch fresh.
function Reset-Docker {
  Write-Host "  Engine didn't come up - restarting Docker Desktop + its WSL backend..." -ForegroundColor DarkYellow
  Get-Process 'Docker Desktop', 'com.docker.backend' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  cmd /c "wsl --terminate docker-desktop > NUL 2>&1"
  Start-Sleep -Seconds 4
  [void](Start-DockerDesktop)
}

Write-Host "`n[0/6] Checking Docker daemon..." -ForegroundColor Yellow
$dockerUp = Test-DockerUp
if (-not $dockerUp) {
  Write-Host "  Docker not reachable. Launching Docker Desktop and waiting (up to ~2.5 min)..." -ForegroundColor DarkYellow
  [void](Start-DockerDesktop)
  $dockerUp = Wait-DockerUp 150
  if (-not $dockerUp) {
    # One automatic recovery pass (handles a stuck/hung engine), then wait again.
    Reset-Docker
    Write-Host "  Waiting for the restarted engine (up to ~2.5 min)..." -ForegroundColor DarkYellow
    $dockerUp = Wait-DockerUp 150
  }
}
if (-not $dockerUp) {
  Write-Host ""
  Write-Host "  Docker daemon never came up after two attempts. Try these in order:" -ForegroundColor Red
  Write-Host "    1. Open Docker Desktop; wait until the whale icon reads 'Engine running'." -ForegroundColor Red
  Write-Host "    2. If it's stuck on 'Starting': quit Docker Desktop fully (tray > Quit)," -ForegroundColor Red
  Write-Host "       run  wsl --shutdown  in a terminal, then reopen Docker Desktop." -ForegroundColor Red
  Write-Host "    3. If newly installed: finish first-run/WSL2 setup and reboot once." -ForegroundColor Red
  Write-Host "    4. Confirm virtualization is on (Windows features: 'Virtual Machine Platform' + WSL;" -ForegroundColor Red
  Write-Host "       and VT-x/AMD-V enabled in BIOS)." -ForegroundColor Red
  Write-Host "  Then re-run start_roadwatch.bat." -ForegroundColor Red
  exit 1
}
Write-Host "  Docker is up." -ForegroundColor Green

# --- 1. Containers ------------------------------------------------------------
Write-Host "`n[1/6] Bringing up Postgres / Redis / n8n (docker compose)..." -ForegroundColor Yellow
docker compose up -d

Write-Host "  Waiting for Postgres to accept connections..." -ForegroundColor DarkYellow
$pgReady = $false
for ($i = 0; $i -lt 30; $i++) {
  # `docker compose exec` resolves the postgres service in THIS project regardless of
  # folder name / container name — portable to any machine. Routed through cmd.exe so a
  # not-ready-yet stderr doesn't terminate the script under $ErrorActionPreference='Stop'
  # (same Windows PowerShell 5.1 quirk as the Docker daemon probe above).
  cmd /c "docker compose exec -T postgres pg_isready -U roadwatch_user -d roadwatch > NUL 2>&1"
  if ($LASTEXITCODE -eq 0) { $pgReady = $true; break }
  Start-Sleep -Seconds 2
}
if ($pgReady) { Write-Host "  Postgres ready." -ForegroundColor Green }
else { Write-Host "  WARNING: Postgres readiness check timed out; continuing anyway." -ForegroundColor Red }

# --- 2. Backend deps + migrations + optional seed -----------------------------
Write-Host "`n[2/6] Backend dependencies..." -ForegroundColor Yellow
if (-not (Test-Path "$root\backend\node_modules")) {
  Write-Host "  Installing backend npm packages (first run)..." -ForegroundColor DarkYellow
  Push-Location "$root\backend"; npm install; Pop-Location
} else { Write-Host "  backend/node_modules present, skipping install." -ForegroundColor Green }

# Python ML dependencies (ultralytics / torch / fastapi ...) for the ML server
Write-Host "  Checking Python ML dependencies..." -ForegroundColor DarkYellow
python -c "import ultralytics" *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "  Installing Python deps from requirements.txt (large - torch can take several minutes)..." -ForegroundColor DarkYellow
  python -m pip install --upgrade pip | Out-Null
  python -m pip install -r "$root\backend\requirements.txt"
} else { Write-Host "  Python ML deps present." -ForegroundColor Green }

# Pretrained YOLOv8 road-damage model (~89 MB) - download if missing (not committed to git)
if (-not (Test-Path "$root\backend\best.pt")) {
  Write-Host "  Downloading pretrained road-damage model (best.pt, ~89 MB)..." -ForegroundColor DarkYellow
  try { curl.exe -L --retry 3 -o "$root\backend\best.pt" "https://github.com/oracl4/RoadDamageDetection/raw/main/models/YOLOv8_Small_RDD.pt" } catch {}
  if (Test-Path "$root\backend\best.pt") { Write-Host "  Model downloaded." -ForegroundColor Green }
  else { Write-Host "  WARNING: model download failed; the ML server will fall back to its smaller bundled model." -ForegroundColor Red }
} else { Write-Host "  ML model present (backend/best.pt)." -ForegroundColor Green }

# Migrations always run - knex migrate:latest is idempotent (only applies pending),
# so a fresh DB gets its full schema with no extra flag. (-Migrate kept for habit.)
Write-Host "  Applying database migrations (knex migrate:latest)..." -ForegroundColor DarkYellow
Push-Location "$root\backend"; npx knex migrate:latest; Pop-Location

# Seed when -Seed is passed, OR automatically when the DB is empty (first run).
# We only auto-seed on an exact "0" user count; if the check is inconclusive we skip
# (seed.js wipes + reinserts, so we never auto-wipe an existing populated DB).
$needSeed = $Seed
if (-not $needSeed) {
  $userCount = ""
  try { $userCount = (docker compose exec -T postgres psql -U roadwatch_user -d roadwatch -tAc "SELECT COUNT(*) FROM users" 2>$null | Out-String).Trim() } catch {}
  if ($userCount -eq "0") {
    $needSeed = $true
    Write-Host "  Empty database detected - seeding demo data (first run)..." -ForegroundColor DarkYellow
  }
}
if ($needSeed) {
  Write-Host "  Seeding database (wipes + reinserts realistic data)..." -ForegroundColor DarkYellow
  Push-Location "$root\backend"; node seed.js; Pop-Location
}

# --- 3. Frontend deps ---------------------------------------------------------
Write-Host "`n[3/6] Frontend dependencies..." -ForegroundColor Yellow
if (-not (Test-Path "$root\frontend\node_modules")) {
  Write-Host "  Installing frontend npm packages (first run)..." -ForegroundColor DarkYellow
  # --legacy-peer-deps REQUIRED: on Next 15 / React 19 the 3D + map libs (react-leaflet 5,
  # @react-three/fiber 9, drei 10, rapier 2) still carry lagging peer ranges; a plain install
  # fails with ERESOLVE. Do not remove this flag.
  Push-Location "$root\frontend"; npm install --legacy-peer-deps; Pop-Location
} else { Write-Host "  frontend/node_modules present, skipping install." -ForegroundColor Green }

# --- 3.5 Free ports so a re-run never collides (fixes EADDRINUSE) -------------
Write-Host "`n[*] Freeing ports 8000 / 5001 / 3000 (stopping any stale listeners)..." -ForegroundColor Yellow
foreach ($p in 8000, 5001, 3000) {
  try {
    $conns = Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue
    foreach ($conn in $conns) {
      $procId = $conn.OwningProcess
      if ($procId -and $procId -ne 0) {
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        Write-Host "    freed port $p (stopped PID $procId)" -ForegroundColor DarkYellow
      }
    }
  } catch {}
}
Start-Sleep -Seconds 1

if ($Clean) {
  Write-Host "  -Clean: removing frontend\.next dev cache..." -ForegroundColor DarkYellow
  Remove-Item "$root\frontend\.next" -Recurse -Force -ErrorAction SilentlyContinue
}

# --- 4. Launch ALL services in ONE split terminal (Windows Terminal, even 2x2) -
$be = "$root\backend"
$fe = "$root\frontend"
$wt = Get-Command wt.exe -ErrorAction SilentlyContinue
if ($wt) {
  Write-Host "`n[4/4] Launching services in a single split terminal (2x2 grid)..." -ForegroundColor Yellow
  # Pane layout -> top-left: Backend API | bottom-left: Worker | top-right: Frontend | bottom-right: ML API
  wt -w new new-tab --title "Saalaiyin Kural Services" -d "$be" powershell -NoExit -Command "node server.js" `
    `; split-pane -V -d "$fe" powershell -NoExit -Command "npm run dev" `
    `; split-pane -H -d "$be" powershell -NoExit -Command "python ml_server.py" `
    `; move-focus left `
    `; split-pane -H -d "$be" powershell -NoExit -Command "node worker.js" `
    `; move-focus right `
    `; split-pane -V -d "$root" powershell -NoExit -Command "docker compose logs -f"
  Write-Host "  All 5 panes launched in one window (Backend, Worker, Frontend, ML API, Docker/DB logs)." -ForegroundColor Green
} else {
  Write-Host "`n[4/4] Windows Terminal (wt.exe) not found - falling back to separate windows..." -ForegroundColor DarkYellow
  Write-Host "  Tip: install 'Windows Terminal' from the Microsoft Store for the single split-pane view." -ForegroundColor DarkGray
  Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$be'; node server.js"
  Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$be'; node worker.js"
  Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$be'; python ml_server.py"
  Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$fe'; npm run dev"
  Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; docker compose logs -f"
}

# --- Summary ------------------------------------------------------------------
Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host "  Saalaiyin Kural - all services started"   -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Frontend     : http://localhost:3000"
Write-Host "  Express API  : http://localhost:8000  (health: /health)"
Write-Host "  ML server    : http://localhost:5001  (health: /health)"
Write-Host "  n8n          : http://localhost:5678"
Write-Host "  Postgres     : localhost:5432   Redis: localhost:6380"
Write-Host ""
Write-Host "  Admin login  : admin@roadwatch.gov.in / RoadWatch@2026"
Write-Host "  Authority    : authority.nh@roadwatch.gov.in / Authority@2026 (also .sh / .mdr)"
Write-Host "  Civilian     : Citizen@2026 (see seed.js for phone numbers)"
Write-Host ""
Write-Host "  NOTE: chatbot needs the n8n workflow imported + activated at http://localhost:5678" -ForegroundColor DarkYellow
Write-Host "  ML model   : pretrained YOLOv8 (Japan+India RDD2022) ACTIVE - 4-class road-damage detection (backend/best.pt)" -ForegroundColor Green
