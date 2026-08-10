# Crops the frames this game actually uses out of the purchased asset packs
# and writes them into art-source/ (gitignored).
#
# Why this exists rather than importing the packs directly: the GameDev Market
# Pro Licence lets us embed art in the game but not share the assets outside
# it, so nothing from the packs may enter the repo. This script is the record
# of *which* frames we use, and it is committed; its output is not.
#
# Re-run it after changing any casting decision below.
#
#   powershell -File tools/extract-art.ps1
#
# Source packs are expected under $PackRoot. Change that if yours live
# elsewhere. If the packs are missing the script says so and stops.

param(
  [string]$PackRoot = 'C:\Users\ejupo\Downloads\GameAssets\_extracted',
  [string]$OutDir   = (Join-Path $PSScriptRoot '..\art-source')
)

Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

$OutDir = [System.IO.Path]::GetFullPath($OutDir)
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$charaSheet  = Join-Path $PackRoot 'over80characterswithanimations_windows\timefantasy_characters\sheets\chara2.png'
$monsterSht  = Join-Path $PackRoot 'monsterstimefantasyrpgspritepack_windows\monsterstimefantasyrpgspritepack\Assets\1x\monster1.png'
$monsterSht2 = Join-Path $PackRoot 'monsterstimefantasyrpgspritepack_windows\monsterstimefantasyrpgspritepack\Assets\1x\monster2.png'
$terrainSht  = Join-Path $PackRoot 'fantasyrpgtilesetpack_windows\fantasyrpgtilesetpack\Assets\TILESETS\terrain.png'

foreach ($p in @($charaSheet, $monsterSht, $monsterSht2, $terrainSht)) {
  if (-not (Test-Path $p)) { throw "Missing source sheet: $p" }
}

function Crop($sourcePath, $x, $y, $w, $h, $outName) {
  $src = [System.Drawing.Image]::FromFile($sourcePath)
  $dst = New-Object System.Drawing.Bitmap($w, $h)
  $g   = [System.Drawing.Graphics]::FromImage($dst)
  # Nearest neighbour: this is pixel art, any smoothing ruins it.
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $g.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, $w, $h)),
               (New-Object System.Drawing.Rectangle($x, $y, $w, $h)),
               [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()
  $out = Join-Path $OutDir $outName
  $dst.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $dst.Dispose(); $src.Dispose()
  "  {0,-14} {1}x{2}" -f $outName, $w, $h
}

# --- casting -----------------------------------------------------------------
# RPG Maker layout: each creature is a 3x4 block (3 walk frames, 4 facings in
# the order down, left, right, up). Sheets hold 4 blocks across and 2 down.
# To recast something, change its block coordinates.

$charaFrameW = 26; $charaFrameH = 36     # chara2.png is 312x288 over a 12x8 grid
$monFrameW   = 60; $monFrameH   = 64     # monster1.png is 720x512 over a 12x8 grid

function BlockRect($col, $row, $fw, $fh) {
  @{ x = $col * 3 * $fw; y = $row * 4 * $fh; w = 3 * $fw; h = 4 * $fh }
}

"cropping to $OutDir"

$hero = BlockRect 3 1 $charaFrameW $charaFrameH
Crop $charaSheet $hero.x $hero.y $hero.w $hero.h 'hero.png'

# Red crab, from the second monster sheet. Contrast decides this one: the
# commonest enemy has to be legible in a heap of forty on green grass, and the
# green slime that was here first vanished into the ground.
$shambler = BlockRect 0 0 $monFrameW $monFrameH
Crop $monsterSht2 $shambler.x $shambler.y $shambler.w $shambler.h 'shambler.png'

$hulk = BlockRect 2 0 $monFrameW $monFrameH         # dark rock creature
Crop $monsterSht $hulk.x $hulk.y $hulk.w $hulk.h 'hulk.png'

$stalker = BlockRect 3 1 $monFrameW $monFrameH      # bat
Crop $monsterSht $stalker.x $stalker.y $stalker.w $stalker.h 'stalker.png'

# Plain grass, from the solid band across the top-left of the terrain sheet.
# 16x16 grid; this tile is uniform so it repeats seamlessly.
Crop $terrainSht 48 16 16 16 'grass.png'

# --- contact sheet, for eyeballing the casting -------------------------------
$names = @('hero.png','shambler.png','hulk.png','stalker.png')
$imgs  = $names | ForEach-Object { [System.Drawing.Image]::FromFile((Join-Path $OutDir $_)) }
$sheetW = 10; $sheetH = 0
foreach ($i in $imgs) { $sheetW += $i.Width + 10; if ($i.Height -gt $sheetH) { $sheetH = $i.Height } }
$sheetW = [int]$sheetW; $sheetH = [int]($sheetH + 20)
$sheet = New-Object System.Drawing.Bitmap($sheetW, $sheetH)
$g = [System.Drawing.Graphics]::FromImage($sheet)
$g.Clear([System.Drawing.Color]::FromArgb(255, 30, 36, 44))
$x = 10
foreach ($i in $imgs) { $g.DrawImage($i, $x, 10, $i.Width, $i.Height); $x += $i.Width + 10 }
$g.Dispose()
$sheet.Save((Join-Path $OutDir '_preview.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$sheet.Dispose()
$imgs | ForEach-Object { $_.Dispose() }
"  _preview.png   (contact sheet, not used by the game)"
