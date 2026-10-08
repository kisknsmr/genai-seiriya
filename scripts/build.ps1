# 配布用 ZIP（dist/genai-seiriya-v<バージョン>.zip）を作るスクリプト。
# 使い方: powershell -ExecutionPolicy Bypass -File scripts/build.ps1
# Mac などでも正しく展開できるよう、ZIP 内のパス区切りは「/」にする。
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content (Join-Path $root 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$version = $manifest.version

$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null
$zipPath = Join-Path $dist "genai-seiriya-v$version.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force -Confirm:$false }

$include = @('manifest.json', 'README.md', 'PRIVACY.md', 'LICENSE', 'icons', 'src')
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, 'Create')
try {
  foreach ($item in $include) {
    $full = Join-Path $root $item
    if (-not (Test-Path $full)) { throw "Missing: $item" }
    $files = if ((Get-Item $full).PSIsContainer) { Get-ChildItem $full -Recurse -File } else { Get-Item $full }
    foreach ($f in $files) {
      $rel = $f.FullName.Substring($root.Length + 1).Replace('\', '/')
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $f.FullName, "genai-seiriya/$rel") | Out-Null
    }
  }
} finally {
  $zip.Dispose()
}
Write-Output "Created: $zipPath"
