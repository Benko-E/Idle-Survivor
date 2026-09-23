# Art requests

Art the game needs that none of the owned packs have. Each section is a prompt
for an image generator: paste the **style block** first, then the asset's own
prompt.

Everything else in the game is the Time Fantasy style (finalbossblues), so the
new art has to sit next to it without looking pasted in.

## How to hand the results back

Save each image into `art-source/generated/` with the file name given below,
then tell me. I'll add it to `tools/extract-art.ps1`, which will:

- shrink it by exactly 8 (every 8×8 block becomes one pixel), and
- turn the magenta background transparent.

That's why the prompts ask for chunky 8× pixels on magenta: image generators
are bad at exact small sizes and clean transparency, and this sidesteps both.
If a result comes out slightly off-grid, send it anyway — I can clean it up.

Check the generator's terms before committing generated art to the public
repo; until we know, it goes in `art-source/` like the licensed art.

---

## Style block (paste before every prompt)

```
Pixel art game sprite in the style of Time Fantasy RPG assets: 16-bit JRPG
look, top-down three-quarter view, limited palette, soft two- or three-step
shading, dark coloured outlines (a darker shade of the fill colour, not pure
black), no anti-aliasing, no blur, no gradients, no text, no border, no drop
shadow. Draw at 8x scale: every single art pixel is a solid 8x8 square of one
colour, perfectly aligned to an 8-pixel grid. Solid flat magenta background
(#FF00FF) everywhere that is not the sprite. Frames side by side in one
horizontal row, all frames exactly the same size, no gaps and no padding
between them, each frame centred in its cell.
```

---

## 1. Lightning strike — `strike.png`

Used by Thunderstorm: the bolt that falls from the storm onto an enemy.

```
A vertical bolt of lightning striking the ground, 4 animation frames, each
frame 24 pixels wide by 64 pixels tall (so the image is 96x64 art pixels,
768x512 at 8x). Frame 1: a thin jagged bolt from the top edge to the bottom
edge. Frame 2: the brightest frame, a thicker bolt with a white core and pale
yellow edges, a small bright splash where it hits the bottom. Frame 3: the
bolt breaking up into fragments, the ground splash widening. Frame 4: only a
faint afterglow and a few sparks at the bottom. Colours: white core, pale
yellow #f4e76e, a little light purple at the edges.
```

## 2. Storm cloud — `storm_cloud.png`

Used by Thunderstorm: the cloud hanging over the crowd while it strikes.

```
A dark storm cloud seen from slightly above, 3 animation frames of a gentle
rolling motion, each frame 64 pixels wide by 32 pixels tall (192x32 art
pixels, 1536x256 at 8x). Heavy, lumpy cloud shapes in dark slate blue and
grey, lighter grey tops, a faint yellow flicker inside the cloud in frame 2
only. Wide and flat, like a lid hanging over an area.
```

## 3. Chain lightning arc — `arc.png`

Used by Chain Lightning: the jump between two enemies (it gets stretched
between them, so it's drawn horizontally).

```
A horizontal crackling electric arc, 3 animation frames, each frame 48 pixels
wide by 12 pixels tall (144x12 art pixels, 1152x96 at 8x). A jagged line of
electricity running from the left edge to the right edge, different zigzag in
each frame, white core with a violet glow #c9a6ff and a few tiny side sparks.
The arc must touch both the left and right edges of every frame.
```

## 4. Ball lightning — `ball_lightning.png`

Used by Ball Lightning: the orbs circling the wizard.

```
A floating ball of lightning, 4 animation frames, each frame 20 by 20 pixels
(80x20 art pixels, 640x160 at 8x). A round glowing sphere, white-yellow core,
yellow #f1e05a body, with small crackling sparks that jump to different
positions around its edge in each frame. Looks like it's buzzing with energy.
```

## 5. Meteor — `meteor.png`

Used by Meteor: the rock coming down before impact.

```
A flaming meteor falling diagonally from the top right towards the bottom
left, 4 animation frames, each frame 32 by 32 pixels (128x32 art pixels,
1024x256 at 8x). A dark brown and grey rock at the bottom-left of the frame
with a long flickering fire trail streaming back up to the top-right corner,
orange #ff7b3d and yellow flames, a few embers. The flames change shape each
frame; the rock stays in the same place.
```

## 6. Meteor impact — `explosion.png`

Used by Meteor on landing (and later, anything that explodes).

```
A fiery explosion on the ground seen from slightly above, 6 animation frames,
each frame 48 by 48 pixels (288x48 art pixels, 2304x384 at 8x). Frame 1: a
small white-yellow flash. Frames 2-3: a big round fireball, yellow centre,
orange and red outside. Frame 4: the fireball breaking into smoke puffs with
flames. Frame 5: grey-brown smoke and a few embers. Frame 6: thin fading
smoke. The explosion is centred on the bottom half of the frame, as if it sits
on the ground.
```

## 7. Scorched ground — `scorch.png`

For the Meteor upgrade that leaves a burning patch.

```
A burning patch of scorched ground, flat on the floor seen from above at a
slight angle, 4 animation frames, each frame 48 pixels wide by 24 pixels tall
(192x24 art pixels, 1536x192 at 8x). An oval of blackened earth with glowing
orange cracks and small flames flickering at different spots in each frame.
Squashed oval, twice as wide as tall, as it lies flat on the ground.
```

## 8. Blizzard shards — `ice_shard.png`

Used by Blizzard: ice falling inside its circle.

```
A single sharp ice shard falling straight down and shattering, 5 animation
frames, each frame 12 pixels wide by 24 pixels tall (60x24 art pixels,
480x192 at 8x). Frames 1-3: a pointed pale blue icicle #d6f3ff with a white
highlight, moving down the frame. Frame 4: it hits the bottom and cracks into
pieces. Frame 5: a few tiny ice fragments and a puff of frost at the bottom.
```

## 9. Frost ground — `frost_ground.png`

Used by Blizzard: the frozen floor under the storm.

```
A patch of frozen ground seen from above at a slight angle, a single frame,
64 pixels wide by 32 pixels tall (512x256 at 8x). An oval of frost and thin
ice with pale blue and white crystal patterns, frosty edges that fade into
scattered snow flecks. Flat on the ground, twice as wide as tall. Soft and
subtle: other things will be drawn on top of it.
```

## 10. Righteous Fire flames — `holy_flames.png`

Used by Righteous Fire: flames drawn around the ring that burns near him.
Several copies are placed around the circle.

```
A small tongue of holy fire on the ground, 4 animation frames, each frame 12
pixels wide by 18 pixels tall (48x18 art pixels, 384x144 at 8x). Golden-white
at the base, orange #ff6a2a flame body, bright yellow tips, flickering to a
different shape each frame. Slightly more golden than normal fire, as if
blessed.
```

## 11. Hit sparks — `hit_sparks.png`

A small flash on an enemy when a spell hits it, one row per element.

```
Small impact flashes, 3 rows by 3 frames, each frame 16 by 16 pixels (48x48
art pixels, 384x384 at 8x). Row 1, fire: an orange-yellow burst of sparks.
Row 2, frost: a white-blue star of ice crystals. Row 3, lightning: a
yellow-white crackle with violet edges. In each row, frame 1 is a small bright
point, frame 2 the full burst, frame 3 fading fragments.
```

---

## Optional, lower priority

- **Chill and burn markers** (`status.png`): a small blue snowflake and a small
  flame, 8×8 pixels each, 2 frames, to float over affected enemies.
- **Banking sparkle** (`sparkle.png`): a gold coin-glint burst, 16×16, 4
  frames, for when gold goes into the chest.
