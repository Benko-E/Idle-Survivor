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
$iconDir     = Join-Path $PackRoot 'rpginventoryiconspackvol1_windows\rpginventoryiconspackvol1\Assets\Icons 64x64\Misc'

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

# Ground tiles, packed into a single horizontal strip.
#
# One repeating tile reads as wallpaper the moment you can see more than a few
# metres of it. These are scattered by a hash of the tile's world position, so
# the field is varied and still identical every time you look at it.
#
# Order matters: the first $groundPlain entries are plain grass and everything
# after is detail. The renderer picks from the two groups at different rates —
# flowers everywhere would look like confetti.
# Detail tiles are mostly green tufts rather than flowers. Two reasons: a
# meadow of scattered blossoms reads as confetti, and the magenta ones were
# close enough to the red crabs to make a heap of enemies harder to pick out.
# Breaking up the repetition is the job; adding colour is not.
$groundTiles = @(
  @(32, 16), @(48, 16), @(64, 16), @(80, 16),   # plain grass, four variations
  @(112, 32), @(128, 32),                        # green tufts, subtle
  @(16, 32),                                     # yellow flowers, sparse
  @(48, 32)                                      # white flowers, sparse
)

$tile = 16
$strip = New-Object System.Drawing.Bitmap(($groundTiles.Count * $tile), $tile)
$sg = [System.Drawing.Graphics]::FromImage($strip)
$sg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$sg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
$terrainImg = [System.Drawing.Image]::FromFile($terrainSht)
for ($i = 0; $i -lt $groundTiles.Count; $i++) {
  $t = $groundTiles[$i]
  $sg.DrawImage($terrainImg,
    (New-Object System.Drawing.Rectangle(($i * $tile), 0, $tile, $tile)),
    (New-Object System.Drawing.Rectangle($t[0], $t[1], $tile, $tile)),
    [System.Drawing.GraphicsUnit]::Pixel)
}
$sg.Dispose(); $terrainImg.Dispose()
$strip.Save((Join-Path $OutDir 'ground.png'), [System.Drawing.Imaging.ImageFormat]::Png)
"  {0,-14} {1}x{2} ({3} tiles)" -f 'ground.png', $strip.Width, $strip.Height, $groundTiles.Count
$strip.Dispose()

# Coins, one per gold tier. These come from the inventory icon pack rather than
# the Time Fantasy set, which has no coin, and they are painterly 64x64 rather
# than pixel art. Shrinking them to 20px throws away almost all of that detail,
# which is the point: at this size they read as coins and stop clashing.
$coinSources = @('Coins_Small.png', 'Coins_Medium.png', 'Coins_Big.png')

# 64 -> 16 is an exact 4:1 reduction, so nearest neighbour lands on real
# pixels and produces a crunchy result that suits the pixel art around it.
# Bicubic was the first attempt and was worse twice over: soft against crisp
# sprites, and it interpolated colour against transparent black, ringing every
# coin with a dark halo.
$coinSize = 16

$coins = New-Object System.Drawing.Bitmap(($coinSources.Count * $coinSize), $coinSize)
$cg = [System.Drawing.Graphics]::FromImage($coins)
$cg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$cg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
for ($i = 0; $i -lt $coinSources.Count; $i++) {
  $path = Join-Path $iconDir $coinSources[$i]
  if (-not (Test-Path $path)) { throw "Missing coin icon: $path" }
  $img = [System.Drawing.Image]::FromFile($path)
  $cg.DrawImage($img, (New-Object System.Drawing.Rectangle(($i * $coinSize), 0, $coinSize, $coinSize)))
  $img.Dispose()
}
$cg.Dispose()

# These icons ship as 24-bit with no alpha channel: the "transparent" area is
# literally solid black. Pasted straight in, every coin arrives as a black
# square. So key the black out, and tint silver to gold in the same pass —
# the game's currency is gold and the pack's coins are not.
for ($py = 0; $py -lt $coins.Height; $py++) {
  for ($px = 0; $px -lt $coins.Width; $px++) {
    $c = $coins.GetPixel($px, $py)
    $lum = [Math]::Max($c.R, [Math]::Max($c.G, $c.B))
    if ($lum -lt 45) {
      $coins.SetPixel($px, $py, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
    } else {
      $r = [Math]::Min(255, [int]($c.R * 1.30))
      $g2 = [Math]::Min(255, [int]($c.G * 1.02))
      $b = [Math]::Min(255, [int]($c.B * 0.40))
      $coins.SetPixel($px, $py, [System.Drawing.Color]::FromArgb(255, $r, $g2, $b))
    }
  }
}
$coins.Save((Join-Path $OutDir 'coins.png'), [System.Drawing.Imaging.ImageFormat]::Png)
"  {0,-14} {1}x{2} ({3} tiers)" -f 'coins.png', $coins.Width, $coins.Height, $coinSources.Count
$coins.Dispose()

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
