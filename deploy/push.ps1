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

# 원격 디렉토리 일괄 생성 (scp 전에 반드시 존재해야 함)
ssh $SERVER "mkdir -p $REMOTE/backend $REMOTE/frontend $REMOTE/deploy"

# 전송할 디렉토리 목록
$dirs = @(
    @{ Local = "$REPO\backend";  Remote = "$REMOTE/backend"  },
    @{ Local = "$REPO\frontend"; Remote = "$REMOTE/frontend" },
    @{ Local = "$REPO\deploy";   Remote = "$REMOTE/deploy"   }
)

$i = 1
foreach ($d in $dirs) {
    Write-Host "[$i/$($dirs.Count)] $($d.Local | Split-Path -Leaf) 전송 중..."
    scp -r "$($d.Local)" "${SERVER}:$(Split-Path $d.Remote -Parent)/"
    $i++
}

Write-Host ""
Write-Host "=== 원격 빌드 및 배포 ===" -ForegroundColor Cyan

if ($SkipBuild) {
    ssh $SERVER "bash $REMOTE/deploy/deploy.sh --skip-build"
} else {
    ssh $SERVER "bash $REMOTE/deploy/deploy.sh"
}
