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

Use Python 3.11 or newer in an isolated virtual environment from this directory
(`scripts/map-tiles`):

    python3 -m venv .venv
    . .venv/bin/activate
    python -m pip install -r requirements.txt
    python -m unittest discover -s tests -v

The test module also adds its utility parent to `sys.path`, so CI may run discovery
from the repository root without a manual `PYTHONPATH` setting.

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

Create overlapping input crops, each with neighbour context. Keep the inputs, manifest, and
generated PNGs together in the same work directory:

    python map_tiles.py prepare /tmp/map-stage1/master_baseline.png /tmp/map-refinement/work --context 64

Run the selected image-to-image or SR model outside the game runtime and save exactly one PNG per
manifest tile into /tmp/map-refinement/work. Name each output
tile_r{row}_c{col}_generated.png and preserve the corresponding input dimensions. The manifest
is the source of truth for crop rectangles and expected output sizes. Do not crop, shift, rotate,
reframe, recolour globally, or change canvas dimensions.

Stitch the context-bearing outputs with cosine feather weights:

    python map_tiles.py stitch-generated /tmp/map-refinement/work /tmp/map-refinement/candidate.png
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


## Stage 1 — model-based super-resolution candidate

The baseline above remains a faithful resampling reference. It is not the Stage 1
super-resolution result. A separate, offline model runner now uses the pinned
Real-ESRGAN x4plus Anime 6B ONNX checkpoint to generate a genuine learned 4×
restoration, then downsamples that result to the canonical 2× texture size.
The map's logical world dimensions, source crop and tile layout are unchanged.

The model is suited to illustration/line-art content. It is pinned by immutable
model revision and SHA-256; its upstream weights and RRDBNet architecture are
BSD-3-Clause licensed. See [MODEL_NOTICES.md](MODEL_NOTICES.md) for provenance
and attribution. The model is not bundled in the repository or game runtime.

Install the optional inference dependency and fetch the exact model:

```bash
python -m pip install -r scripts/map-tiles/requirements-sr.txt
mkdir -p /tmp/map-sr
curl -L --fail --retry 3 \
  https://huggingface.co/skillsafe-ai/realesrgan-x4plus-anime-6b/resolve/c001be5/model.onnx \
  -o /tmp/map-sr/model.onnx
echo "9a029dae374b2cd4c3eb2dbbed857e22e6d785687c767aa12828e7356b9fb378  /tmp/map-sr/model.onnx" | sha256sum --check
python scripts/map-tiles/super_resolution.py \
  --input artifacts/telegram-game/public/map-hires.webp \
  --output /tmp/map-sr/candidate-2x.png \
  --model /tmp/map-sr/model.onnx \
  --core-size 192 --context 64
```

The runner uses overlapping context around each core, performs x4 model inference,
downsamples to x2, and writes only to the requested work directory. It records
source/model/output hashes, model revision, inference provider, tile geometry and
resampling details in a sidecar manifest. It never modifies tracked public assets.

Compare the learned candidate against the faithful baseline:

```bash
python scripts/map-tiles/map_tiles.py baseline \
  artifacts/telegram-game/public/map-hires.webp /tmp/map-sr/baseline --format png
python scripts/map-tiles/tile_qa.py \
  /tmp/map-sr/candidate-2x.png /tmp/map-sr/baseline/master_baseline.png \
  --report /tmp/map-sr/qa.json
```

A failed QA gate is a rejected candidate, not permission to relax geometry or colour
thresholds. The manual GitHub Actions workflow `Map super-resolution candidate`
runs this exact process and uploads the candidate, baseline, manifest and QA report
for visual review. Nothing is copied into `public/` or integrated into gameplay
without a passing gate and explicit asset review.
