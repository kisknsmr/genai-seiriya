# アイコン画像（icons/icon16.png など）を作り直すスクリプト。
# 使い方: powershell -ExecutionPolicy Bypass -File scripts/make-icons.ps1
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $root 'icons'
New-Item -ItemType Directory -Force $dir | Out-Null

foreach ($size in 16, 32, 48, 128) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::Transparent)
  $s = $size / 24.0

  # 青い角丸の四角
  $r = [single](5 * $s)
  $d = [single](2 * $r)
  $e = [single]($size - $d)
  $z = [single]0
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc($z, $z, $d, $d, [single]180, [single]90)
  $path.AddArc($e, $z, $d, $d, [single]270, [single]90)
  $path.AddArc($e, $e, $d, $d, [single]0, [single]90)
  $path.AddArc($z, $e, $d, $d, [single]90, [single]90)
  $path.CloseFigure()
  $g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(11, 87, 208))), $path)

  # 白い「ダウンロード」矢印と受け皿
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ([Math]::Max(1.5, 2.2 * $s))
  $pen.StartCap = 'Round'; $pen.EndCap = 'Round'; $pen.LineJoin = 'Round'
  $g.DrawLine($pen, [single](12 * $s), [single](5 * $s), [single](12 * $s), [single](14 * $s))
  $g.DrawLines($pen, [System.Drawing.PointF[]]@(
      (New-Object System.Drawing.PointF (8 * $s), (10.5 * $s)),
      (New-Object System.Drawing.PointF (12 * $s), (14.5 * $s)),
      (New-Object System.Drawing.PointF (16 * $s), (10.5 * $s))))
  $g.DrawLines($pen, [System.Drawing.PointF[]]@(
      (New-Object System.Drawing.PointF (6 * $s), (15 * $s)),
      (New-Object System.Drawing.PointF (6 * $s), (18.5 * $s)),
      (New-Object System.Drawing.PointF (18 * $s), (18.5 * $s)),
      (New-Object System.Drawing.PointF (18 * $s), (15 * $s))))

  $out = Join-Path $dir "icon$size.png"
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Output "Created: $out"
}
