# Map-art refinement utilities

These offline utilities complement the production tile builder in scripts/src/mapTilePipeline.ts.
They do not change the live map, generate AI artwork, or write into the public game-assets directory.

## Frozen geometry

- World: 3224 × 1858 logical pixels.
- Texture: 6448 × 3716 pixels (exactly 2 texels per world pixel).
- Delivery grid: 7 × 4, 1024 px cores (28 tiles; the east and south edge tiles are cropped).
- Context crops default to 64 px on each available side.
- Generated images are candidates only until the QA gate passes.

## Install and test

Use Python 3.11 or newer in an isolated virtual environment:

    python3 -m venv .venv
    . .venv/bin/activate
    python -m pip install -r requirements.txt
    python -m unittest discover -s tests -v

Tests use a synthetic image. They verify exact 28-tile coverage, lossless PNG cut/stitch,
context-crop preparation, overlap feathering, rejection of mixed output sizes, missing-tile
detection, and that the QA gate accepts an identity image but rejects a geometry shift.

## Prepare a faithful reference

The baseline command normalizes the current source to exact 2× dimensions using resampling,
chroma deblocking and restrained local contrast. This is not neural super-resolution and does not
create new image detail. Preserve the original source and use this output as the geometry/colour
reference:

    python map_tiles.py baseline ../../artifacts/telegram-game/public/map-hires.webp /tmp/map-stage1 --format png
    python map_tiles.py stitch /tmp/map-stage1/tiles /tmp/map-stage1/roundtrip.png

## Stage-2 context workflow

Create overlapping input crops, each with neighbour context:

    python map_tiles.py prepare /tmp/map-stage1/master_baseline.png /tmp/map-refinement/inputs --context 64

Run the selected image-to-image or SR model outside the game runtime and save exactly one PNG per
manifest tile in /tmp/map-refinement/generated. Name each output
tile_r{row}_c{col}_generated.png and preserve the corresponding input dimensions. The manifest
is the source of truth for crop rectangles and expected output sizes. Do not crop, shift, rotate,
reframe, recolour globally, or change canvas dimensions.

Stitch the context-bearing outputs with cosine feather weights:

    python map_tiles.py stitch-generated /tmp/map-refinement/generated /tmp/map-refinement/candidate.png
    python tile_qa.py /tmp/map-refinement/candidate.png /tmp/map-stage1/master_baseline.png --report /tmp/map-refinement/qa.json

Alternatively, core-only 1024 px outputs are accepted and placed without blending. Mixing core-only
and context-sized outputs is rejected. A successful stitch is only a candidate; the QA report must
show PASS true before it can be considered for the production pipeline.

## Acceptance gate

tile_qa.py compares the candidate with the faithful baseline:

- G1: exact 6448 × 3716 dimensions.
- G2: low-frequency Lab colour drift.
- G3: edge chamfer distance and F1 at quarter scale.
- G4: worst per-tile Lab colour drift.
- G5: new seam discontinuity relative to the reference seam signature. This is deliberately
  measured as the change in boundary residual, not the absolute image gradient; an unchanged
  naturally graded map must pass.
- G6: sharpness ratio is reported for inspection but never passes/fails the candidate.

Thresholds are in tile_qa.py. Do not loosen them merely to make a candidate pass. Sharpening
is not evidence of new detail, and generated texture must never be treated as geometry evidence.

## Memory and execution

The overlap stitch currently accumulates floating-point full-master buffers; peak memory is high
(offline workstation/GPU-runner only). It is not intended for Replit or the browser. Keep generated
assets out of the tracked public directory until the user approves the visual gallery and the
candidate passes both this gate and manual review.
