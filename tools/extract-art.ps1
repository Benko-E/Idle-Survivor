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
$skillDir    = Join-Path $PackRoot 'skilliconpack_windows\skilliconpack'
$tileDir     = Join-Path $PackRoot 'fantasyrpgtilesetpack_windows\fantasyrpgtilesetpack\Assets\TILESETS'
$framesDir   = Join-Path $PackRoot 'over80characterswithanimations_windows\timefantasy_characters\frames'
$animSheet   = Join-Path $PackRoot 'over80characterswithanimations_windows\timefantasy_characters\sheets\animation1.png'
$elemSheet   = Join-Path $PackRoot 'monsterstimefantasyrpgspritepack_windows\monsterstimefantasyrpgspritepack\Assets\1x\elemental.png'

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

# Red crab as the commonest enemy: contrast decided it. It has to be legible
# in a heap of forty on green grass, and the green slime that was there first
# vanished into the ground.
#
# The enemy roster, one sheet per creature in art-source/enemies/, loaded by
# file name (an enemy's `sprite` is the name without .png). A new enemy's art
# is one line here. Small creatures come out of the shared 12x8 sheets; the
# big ones have a sheet each, which is already exactly one 3x4 block.
$enemyOut = Join-Path $OutDir 'enemies'
New-Item -ItemType Directory -Force -Path $enemyOut | Out-Null
$monDir = Split-Path $monsterSht -Parent
$enemySheets = @(
  # name,     sheet,          block col, block row (-1: the whole file)
  @('crab',   'monster2.png',  0,  0),
  @('bat',    'monster1.png',  3,  1),
  @('spider', 'monster1.png',  2,  0),
  @('bee',    'monster1.png',  2,  1),
  @('wolf',   'monster_wolf2.png',  -1, 0),
  @('treant', 'monster_treant.png', -1, 0),
  @('boar',   'monster_boar.png',   -1, 0),
  @('wisp',   'monster3.png',  1,  1),
  @('mushroom_purple', 'monster3.png', 0, 0),
  @('mushroom_red',    'monster3.png', 1, 0)
)
# Fliers come with a shadow painted under them, a separate blob below the
# body. The game lifts them off the ground and draws their shadow itself, so
# the painted one would float up with them: erase it. Per frame, the lowest
# run of rows, if an empty row separates it from the body above.
function StripPaintedShadow($path, $fw, $fh) {
  $bmp = [System.Drawing.Bitmap]::FromFile($path)
  $copy = New-Object System.Drawing.Bitmap($bmp)
  $bmp.Dispose()
  $clear = [System.Drawing.Color]::FromArgb(0, 0, 0, 0)
  for ($fy = 0; $fy -lt $copy.Height; $fy += $fh) {
    for ($fx = 0; $fx -lt $copy.Width; $fx += $fw) {
      $filled = @()
      for ($y = 0; $y -lt $fh; $y++) {
        $any = $false
        for ($x = 0; $x -lt $fw; $x++) { if ($copy.GetPixel($fx + $x, $fy + $y).A -gt 0) { $any = $true; break } }
        $filled += $any
      }
      $bottom = $fh - 1
      while ($bottom -ge 0 -and -not $filled[$bottom]) { $bottom-- }
      $top = $bottom
      while ($top -gt 0 -and $filled[$top - 1]) { $top-- }
      # Only a short blob with body above it is a shadow; a flier with no gap
      # under it keeps everything.
      $bodyAbove = $false
      for ($y = 0; $y -lt $top - 1; $y++) { if ($filled[$y]) { $bodyAbove = $true; break } }
      if ($bottom -lt 0 -or -not $bodyAbove -or ($bottom - $top) -gt 8) { continue }
      for ($y = $top; $y -le $bottom; $y++) { for ($x = 0; $x -lt $fw; $x++) { $copy.SetPixel($fx + $x, $fy + $y, $clear) } }
    }
  }
  $copy.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $copy.Dispose()
}

foreach ($e in $enemySheets) {
  $path = Join-Path $monDir $e[1]
  if ($e[2] -lt 0) {
    $img = [System.Drawing.Image]::FromFile($path); $w = $img.Width; $h = $img.Height; $img.Dispose()
    Crop $path 0 0 $w $h ('enemies\' + $e[0] + '.png')
  } else {
    $r = BlockRect $e[2] $e[3] $monFrameW $monFrameH
    Crop $path $r.x $r.y $r.w $r.h ('enemies\' + $e[0] + '.png')
  }
}
foreach ($flier in @('bat', 'bee', 'wisp')) {
  StripPaintedShadow (Join-Path $enemyOut ($flier + '.png')) $monFrameW $monFrameH
}

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

# --- spell and upgrade icons -----------------------------------------------------
# Painted 256x256 icons from the skill icon pack, for the spell bar, the
# spell choice cards and the level-up cards. Not pixel art, and that's fine for interface: they sit
# in the HUD and on cards, never in the world beside the sprites.
#
# Shrunk to 64x64 so the page stays small — nine at full size would add well
# over a megabyte to a single-file build. Bicubic here, unlike the coins:
# these are painted, and nearest neighbour would shred them.
#
# Keyed by spell or upgrade id. Anything with no icon here gets a plain badge.
$spellIcons = [ordered]@{
  'spell_bolt_01'      = 'red\red_20'      # streaking fireballs
  'spell_frostbolt_01' = 'blue\blue_21'    # ice shard in flight
  'spell_chain_01'     = 'violet\violet_01' # forked purple lightning
  'spell_aura_01'      = 'red\red_05'      # a ring of fire
  'spell_orb_01'       = 'blue\blue_35'    # a ball of ice
  'spell_ball_01'      = 'blue\blue_18'    # a crackling energy ball
  'spell_meteor_01'    = 'red\red_16'      # a flaming comet
  'spell_blizzard_01'  = 'blue\blue_04'    # a snowflake
  'spell_storm_01'     = 'blue\blue_42'    # lightning from the sky
  # Upgrades.
  'up_damage_01'       = 'yellow\yellow_10' # a clenched fist
  'up_haste_01'        = 'blue\blue_11'     # a quickening swirl
  'up_range_01'        = 'blue\blue_19'     # an eye
  'up_area_01'         = 'yellow\yellow_31' # a spiral sigil
  'up_multishot_01'    = 'yellow\yellow_03' # splitting rays
  'up_pierce_01'       = 'red\red_13'       # a spear
  'up_chain_01'        = 'violet\violet_28' # forked lightning
  'up_conduct_01'      = 'violet\violet_09' # an energy beam
  'up_chill_01'        = 'blue\blue_32'     # ice crystals
  'up_wither_01'       = 'green\green_12'   # poison
  'up_strike_01'       = 'blue\blue_41'     # a tornado
  'up_root_01'         = 'green\green_02'   # vines
  'up_fire_01'         = 'red\red_36'       # flames
  'up_frost_01'        = 'blue\blue_31'     # a wolf howling
  'up_storm_01'        = 'blue\blue_23'     # a lightning bolt
  'up_vigour_01'       = 'red\red_17'       # a heart
  'up_regen_01'        = 'green\green_20'   # a healing cross
  'up_ward_01'         = 'red\red_18'       # a shield
  'up_reach_01'        = 'yellow\yellow_11' # a hand grasping sparks
  'up_swift_01'        = 'blue\blue_05'     # wind
  'up_scholar_01'      = 'red\red_27'       # a spellbook
  'up_greed_01'        = 'yellow\yellow_01' # a golden burst
}
$iconOut = Join-Path $OutDir 'icons'
New-Item -ItemType Directory -Force -Path $iconOut | Out-Null
$iconSize = 64
foreach ($id in $spellIcons.Keys) {
  $rel = $spellIcons[$id]
  $src = Get-ChildItem (Join-Path $skillDir (Split-Path $rel -Parent)) -File |
    Where-Object { $_.BaseName -eq (Split-Path $rel -Leaf) } | Select-Object -First 1
  if (-not $src) { throw "Missing spell icon: $rel" }
  $img = [System.Drawing.Image]::FromFile($src.FullName)
  $dst = New-Object System.Drawing.Bitmap($iconSize, $iconSize)
  $ig = [System.Drawing.Graphics]::FromImage($dst)
  $ig.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $ig.DrawImage($img, (New-Object System.Drawing.Rectangle(0, 0, $iconSize, $iconSize)))
  $ig.Dispose(); $img.Dispose()
  $dst.Save((Join-Path $iconOut "$id.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $dst.Dispose()
  "  icons/{0,-20} from {1}" -f "$id.png", $rel
}

# --- world props ---------------------------------------------------------------
# Trees, rocks and the shop camp, from the Time Fantasy outdoor tileset.
#
# Each rectangle is a rough box around the object on the sheet; CropTight then
# shrinks it to the object's real edges, so a sprite's bottom row is the
# ground it stands on and nothing is off-centre by a stray empty column.
function CropTight($sourcePath, $x, $y, $w, $h, $outName) {
  $src = [System.Drawing.Bitmap]::FromFile($sourcePath)
  $minX = $w; $minY = $h; $maxX = -1; $maxY = -1
  for ($py = 0; $py -lt $h; $py++) {
    for ($px = 0; $px -lt $w; $px++) {
      if ($src.GetPixel($x + $px, $y + $py).A -gt 20) {
        if ($px -lt $minX) { $minX = $px }; if ($px -gt $maxX) { $maxX = $px }
        if ($py -lt $minY) { $minY = $py }; if ($py -gt $maxY) { $maxY = $py }
      }
    }
  }
  $src.Dispose()
  if ($maxX -lt 0) { throw "Nothing in the box for $outName" }
  Crop $sourcePath ($x + $minX) ($y + $minY) ($maxX - $minX + 1) ($maxY - $minY + 1) $outName
}

$outside = Join-Path $tileDir 'outside.png'
$propOut = Join-Path $OutDir 'props'
New-Item -ItemType Directory -Force -Path $propOut | Out-Null
# Written into props/ by prefixing the name; Crop writes into $OutDir.
$props = [ordered]@{
  'props/tree_oak.png'      = @(272, 48, 64, 64)
  'props/tree_great.png'    = @(528, 0, 96, 112)
  'props/tree_pine.png'     = @(400, 48, 48, 64)
  'props/tree_small.png'    = @(272, 112, 48, 64)
  'props/tree_fir.png'      = @(320, 112, 32, 64)
  'props/tree_fir2.png'     = @(352, 112, 32, 64)
  'props/tree_round.png'    = @(384, 112, 48, 64)
  'props/tree_autumn.png'   = @(432, 112, 48, 64)
  'props/tree_gold.png'     = @(480, 112, 48, 64)
  'props/tree_blossom.png'  = @(464, 176, 48, 64)
  'props/tree_blossom2.png' = @(512, 176, 48, 64)
  'props/tree_dead.png'     = @(496, 64, 32, 48)
  'props/stump.png'         = @(336, 16, 32, 32)
  'props/stump_flowers.png' = @(368, 16, 32, 32)
  'props/stump_shrooms.png' = @(400, 16, 32, 32)
  'props/log.png'           = @(288, 16, 48, 32)
  'props/boulder.png'       = @(16, 144, 16, 16)
  'props/boulder2.png'      = @(32, 144, 16, 16)
  'props/stone.png'         = @(16, 160, 16, 16)
  'props/stone2.png'        = @(32, 160, 16, 16)
  'props/spire.png'         = @(128, 144, 16, 16)
  'props/spires.png'        = @(144, 144, 16, 16)
  # The shop camp.
  'props/tent.png'          = @(16, 192, 48, 64)
  'props/campfire_logs.png' = @(16, 288, 48, 32)
  'props/barrel.png'        = @(192, 16, 16, 32)
  'props/barrel_apples.png' = @(240, 16, 16, 32)
  'props/crates.png'        = @(112, 16, 16, 32)
  'props/sack.png'          = @(80, 48, 16, 16)
}
foreach ($name in $props.Keys) {
  $r = $props[$name]
  CropTight $outside $r[0] $r[1] $r[2] $r[3] $name
}

# --- animation strips ------------------------------------------------------------
# Frames laid side by side, each frame the same size and in the same place,
# which is why these don't go through CropTight: tightening each frame on its
# own would make the animation wobble.
function Strip($frames, $fw, $fh, $outName) {
  $dst = New-Object System.Drawing.Bitmap(($frames.Count * $fw), $fh)
  $g = [System.Drawing.Graphics]::FromImage($dst)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  for ($i = 0; $i -lt $frames.Count; $i++) {
    $f = $frames[$i]
    $img = [System.Drawing.Image]::FromFile($f[0])
    $g.DrawImage($img, (New-Object System.Drawing.Rectangle(($i * $fw), 0, $fw, $fh)),
                 (New-Object System.Drawing.Rectangle($f[1], $f[2], $fw, $fh)), [System.Drawing.GraphicsUnit]::Pixel)
    $img.Dispose()
  }
  $g.Dispose()
  $dst.Save((Join-Path $OutDir $outName), [System.Drawing.Imaging.ImageFormat]::Png)
  "  {0,-24} {1} frames of {2}x{3}" -f $outName, $frames.Count, $fw, $fh
  $dst.Dispose()
}

# The hero reading from his spellbook: his own 3-frame action pose, from the
# right half of animation1.png, row 4. Same pixel scale as his walk sheet.
Strip @(@($animSheet, 423, 150), @($animSheet, 470, 150), @($animSheet, 517, 150)) 47 50 'hero_cast.png'

# Flames for the campfire: the first column of fireplace.png, four frames.
$fireplace = Join-Path $tileDir 'animated\fireplace.png'
Strip @(@($fireplace, 0, 0), @($fireplace, 0, 20), @($fireplace, 0, 40), @($fireplace, 0, 60)) 16 20 'flames.png'

# The bank chest opening, four frames.
$chest = Join-Path $framesDir 'chests\chest5'
$chestImg = [System.Drawing.Image]::FromFile((Join-Path $chest '1.png')); $cw = $chestImg.Width; $ch = $chestImg.Height; $chestImg.Dispose()
Strip @(@((Join-Path $chest '1.png'), 0, 0), @((Join-Path $chest '2.png'), 0, 0), @((Join-Path $chest '3.png'), 0, 0), @((Join-Path $chest '4.png'), 0, 0)) $cw $ch 'chest.png'

# The shopkeeper, standing facing the camera.
$keeper = Join-Path $framesDir 'npc\npc1_5\down_stand.png'
$keeperImg = [System.Drawing.Image]::FromFile($keeper); $kw = $keeperImg.Width; $kh = $keeperImg.Height; $keeperImg.Dispose()
# The leading comma keeps a one-frame list a list; PowerShell would
# otherwise unwrap it and hand Strip the path itself.
Strip @(,@($keeper, 0, 0)) $kw $kh 'shopkeeper.png'

# Spell projectiles: the ice and fire orbs from elemental.png, four frames
# each, cropped above the shadow baked into the sheet (the game draws its own).
Strip @(@($elemSheet, 78, 290), @($elemSheet, 78, 354), @($elemSheet, 78, 418), @($elemSheet, 78, 482)) 22 24 'orb_ice.png'
Strip @(@($elemSheet, 256, 286), @($elemSheet, 256, 350), @($elemSheet, 256, 414), @($elemSheet, 256, 478)) 26 28 'orb_fire.png'

# --- interface ---------------------------------------------------------------------
# Window frames and bars from the 7 Souls UI pack, which is still zipped:
# the handful of files needed are read straight out of the zip.
#
#   panel.png       the dark window with a rounded gold frame (style 19)
#   panel_gold.png  the dark window with a studded double gold frame (style 7)
#   button.png      style 19's wide pill, for buttons
#   slot.png        style 19's gold item slot, for the spell bar
#   bar_*.png       frame and fill pieces for the health and XP bars
$uiZip = Join-Path (Split-Path $PackRoot -Parent) '7soulsrpggraphics_uipack_windows.zip'
if (Test-Path $uiZip) {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $uiOut = Join-Path $OutDir 'ui'
  New-Item -ItemType Directory -Force -Path $uiOut | Out-Null
  $tmp = Join-Path $uiOut '_zip'
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  $wanted = @{
    '7soulsrpggraphics_uipack/Assets/Windows/_sheet_window_19.png' = 'window19.png'
    '7soulsrpggraphics_uipack/Assets/Windows/_sheet_window_07.png' = 'window07.png'
    '7soulsrpggraphics_uipack/Assets/Bars/bar_01.png'  = 'bar_hp_frame.png'
    '7soulsrpggraphics_uipack/Assets/Bars/bar_04.png'  = 'bar_hp_fill.png'
    '7soulsrpggraphics_uipack/Assets/Bars/bar_223.png' = 'bar_xp_frame.png'
    '7soulsrpggraphics_uipack/Assets/Bars/bar_226.png' = 'bar_xp_fill.png'
  }
  $zip = [System.IO.Compression.ZipFile]::OpenRead($uiZip)
  foreach ($entry in $zip.Entries) {
    if ($wanted.ContainsKey($entry.FullName)) {
      $target = if ($entry.FullName -like '*Bars*') { Join-Path $uiOut $wanted[$entry.FullName] } else { Join-Path $tmp $wanted[$entry.FullName] }
      [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $true)
    }
  }
  $zip.Dispose()
  Crop (Join-Path $tmp 'window19.png') 0 0 48 48 'ui/panel.png'
  Crop (Join-Path $tmp 'window19.png') 0 48 48 16 'ui/button.png'
  Crop (Join-Path $tmp 'window19.png') 64 32 16 16 'ui/slot.png'
  Crop (Join-Path $tmp 'window07.png') 0 0 48 48 'ui/panel_gold.png'
  Remove-Item -Recurse -Force $tmp
  "  ui/bar_*.png          health and XP bar pieces"
} else {
  "  UI pack zip not found at $uiZip : the interface keeps its plain look"
}

# --- generated effects -------------------------------------------------------------
# Spell effects no pack had, made with an image generator from the prompts in
# ART-REQUESTS.md and saved into art-source/generated/. tools/GeneratedArt.cs
# rebuilds each at its true pixel resolution and keys out the magenta; see the
# comment at the top of that file.
#
# unmix: 'all' recovers see-through pixels painted blended into the magenta;
# 'warm' does that only where the result isn't blue, for art whose real
# violet would otherwise be mistaken for a blend.
$genDir = Join-Path $OutDir 'generated'
if (Test-Path $genDir) {
  Add-Type -ReferencedAssemblies System.Drawing -Path (Join-Path $PSScriptRoot 'GeneratedArt.cs')
  $fxOut = Join-Path $OutDir 'fx'
  New-Item -ItemType Directory -Force -Path $fxOut | Out-Null
  $generated = @(
    @('strike.png',         4, 1, 'all',  'strike.png'),
    @('storm_cloud.png',    3, 1, 'all',  'storm_cloud.png'),
    @('arc.png',            3, 1, 'warm', 'arc.png'),
    @('ball_lightning.png', 4, 1, 'all',  'ball_lightning.png'),
    @('meteor.png',         4, 1, 'all',  'meteor.png'),
    @('explosion.png',      6, 1, 'all',  'explosion.png'),
    @('scorch.png',         4, 1, 'all',  'scorch.png'),
    @('ice_shard.png',      5, 1, 'all',  'ice_shard.png'),
    @('frost_ground.png',   1, 1, 'all',  'frost_ground.png'),
    @('holy_flames.png',    4, 1, 'all',  'holy_flames.png'),
    # Three rows, one per element: written as three files.
    @('hit_sparks.png',     3, 3, 'warm', 'hit_{row}.png')
  )
  foreach ($g in $generated) {
    $src = Join-Path $genDir $g[0]
    if (-not (Test-Path $src)) { "  fx/{0,-20} missing, skipped" -f $g[4]; continue }
    $result = [GeneratedArt]::Process($src, $g[1], $g[2], $g[3], (Join-Path $fxOut $g[4]))
    "  fx/{0,-20} {1}" -f $g[4], $result
  }
  # hit_1..3 are fire, frost and lightning, in the order the prompt asked for.
  foreach ($pair in @(@('hit_1.png', 'hit_fire.png'), @('hit_2.png', 'hit_frost.png'), @('hit_3.png', 'hit_lightning.png'))) {
    $from = Join-Path $fxOut $pair[0]
    if (Test-Path $from) { Move-Item -Force $from (Join-Path $fxOut $pair[1]) }
  }
} else {
  "  generated/ not found: spell effects fall back to drawn shapes"
}

# --- contact sheet, for eyeballing the casting -------------------------------
$names = @('hero.png', 'enemies\crab.png', 'enemies\bat.png', 'enemies\bee.png', 'enemies\spider.png', 'enemies\wolf.png', 'enemies\treant.png')
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
