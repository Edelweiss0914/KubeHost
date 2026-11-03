# KubeHost 배포 스크립트 (PowerShell)
# 사용법: .\deploy\push.ps1 [-SkipBuild]
param([switch]$SkipBuild)

$ErrorActionPreference = "Stop"

$SERVER  = "root@100.84.38.5"
$REMOTE  = "/root/KubeHost"
$REPO    = Split-Path -Parent $PSScriptRoot

Write-Host "=== KubeHost 코드 전송 ===" -ForegroundColor Cyan
Write-Host "    로컬:  $REPO"
Write-Host "    원격:  ${SERVER}:${REMOTE}"
Write-Host ""

# 원격 디렉토리 일괄 생성
ssh $SERVER "mkdir -p $REMOTE/backend $REMOTE/frontend $REMOTE/deploy"
if ($LASTEXITCODE -ne 0) { throw "서버 디렉터리를 만들지 못했습니다." }

# robocopy로 임시 디렉토리에 복사 (불필요한 파일 제외 후 scp 전송)
$EXCLUDE_DIRS  = @('node_modules', '__pycache__', '.venv', 'venv', 'dist', '.vite', '.mypy_cache', '.pytest_cache', 'htmlcov', '.git')
$EXCLUDE_FILES = @('*.pyc', '*.pyo', '*.egg-info')
$TEMP = Join-Path $env:TEMP "kubehost-deploy-$(Get-Random)"

function Sync-Dir {
    param([string]$Src, [string]$Name, [string]$RemotePath, [int]$Idx, [int]$Total)
    Write-Host "[$Idx/$Total] $Name 전송 중..."
    $tmp = Join-Path $TEMP $Name
    $rcArgs = @($Src, $tmp, '/E', '/NFL', '/NDL', '/NJH', '/NJS')
    foreach ($d in $EXCLUDE_DIRS)  { $rcArgs += "/XD"; $rcArgs += $d }
    foreach ($f in $EXCLUDE_FILES) { $rcArgs += "/XF"; $rcArgs += $f }
    $result = & robocopy @rcArgs
    # robocopy 종료 코드 0–7은 정상 (8 이상이 오류)
    if ($LASTEXITCODE -ge 8) { throw "$Name 복사 실패 (robocopy 종료 코드 $LASTEXITCODE)" }
    scp -r $tmp "${SERVER}:$(Split-Path $RemotePath -Parent)/"
    if ($LASTEXITCODE -ne 0) { throw "$Name 전송 실패" }
}

try {
    New-Item -ItemType Directory -Path $TEMP -Force | Out-Null
    Sync-Dir "$REPO\backend"  "backend"  "$REMOTE/backend"  1 3
    Sync-Dir "$REPO\frontend" "frontend" "$REMOTE/frontend" 2 3
    Sync-Dir "$REPO\deploy"   "deploy"   "$REMOTE/deploy"   3 3
} finally {
    Remove-Item -Recurse -Force $TEMP -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "=== 원격 빌드 및 배포 ===" -ForegroundColor Cyan

# CRLF → LF 변환 (Windows에서 전송된 .sh 파일의 줄바꿈 문제 방지)
ssh $SERVER "find $REMOTE/deploy -name '*.sh' -exec sed -i 's/\r//' {} +"
if ($LASTEXITCODE -ne 0) { Write-Warning "CRLF 변환 실패 — 계속 진행합니다." }

if ($SkipBuild) {
    ssh $SERVER "bash $REMOTE/deploy/deploy.sh --skip-build"
} else {
    ssh $SERVER "bash $REMOTE/deploy/deploy.sh"
}
if ($LASTEXITCODE -ne 0) { throw "원격 배포에 실패했습니다." }
