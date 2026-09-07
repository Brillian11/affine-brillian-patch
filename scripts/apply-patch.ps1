Write-Host "Applying AFFiNE Brillian Patch..." -ForegroundColor Cyan

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir
$PatchFile = Join-Path $RepoRoot "patches/affine-brillian-patch-v1.4.0.patch"

if (-not (Test-Path $PatchFile)) {
    Write-Error "Patch file not found: $PatchFile"
    exit 1
}

git apply --check $PatchFile
if ($LASTEXITCODE -ne 0) {
    Write-Host "Direct git apply check failed, attempting 3-way merge..." -ForegroundColor Yellow
    git apply --3way $PatchFile
} else {
    git apply $PatchFile
}

Write-Host "✅ Brillian Patch applied successfully!" -ForegroundColor Green
