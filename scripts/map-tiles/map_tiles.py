#!/usr/bin/env python3
"""Among Gas map pipeline.

World geometry is frozen at 3224x1858 logical pixels and texture scale is exactly 2.
The pipeline supports:
  baseline       create a faithful 2x baseline from the current map image
  cut            cut an exact 6448x3716 master into non-overlapping delivery tiles
  stitch         reassemble a delivery tile set (lossless round-trip when PNG)
  prepare        export context crops for image-to-image tile refinement
  stitch-generated feather-blend context-bearing generated tiles into a master

Context workflow:
  python map_tiles.py prepare master_baseline.png work/inputs --context 64
  # Generate one output per input tile, preserving each input's exact dimensions.
  python map_tiles.py stitch-generated work/generated candidate.png
  python tile_qa.py candidate.png master_baseline.png

Generated tiles may instead be core-only (the original tile dimensions); in that case
stitch-generated performs a strict, non-blended placement. Mixing the two forms is rejected.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any, Iterable

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

WORLD_W, WORLD_H, SCALE = 3224, 1858, 2
TEX_W, TEX_H = WORLD_W * SCALE, WORLD_H * SCALE
TILE_PX = 1024
DEFAULT_CONTEXT = 64
Image.MAX_IMAGE_PIXELS = None


def tile_grid() -> Iterable[dict[str, Any]]:
    cols = math.ceil(TEX_W / TILE_PX)
    rows = math.ceil(TEX_H / TILE_PX)
    for row in range(rows):
        for col in range(cols):
            x0, y0 = col * TILE_PX, row * TILE_PX
            width, height = min(TILE_PX, TEX_W - x0), min(TILE_PX, TEX_H - y0)
            yield {
                "file": f"tile_r{row}_c{col}",
                "row": row,
                "col": col,
                "tex": [x0, y0, width, height],
                "world": [x0 / SCALE, y0 / SCALE, width / SCALE, height / SCALE],
            }


def _open_rgb(source: str | Path) -> Image.Image:
    path = Path(source)
    if not path.is_file():
        raise FileNotFoundError(f"Image does not exist: {path}")
    with Image.open(path) as image:
        return image.convert("RGB")


def _validate_master(image: Image.Image, *, label: str = "master") -> None:
    if image.size != (TEX_W, TEX_H):
        raise ValueError(f"{label} must be exactly {TEX_W}x{TEX_H}, got {image.width}x{image.height}")


def baseline(source: str | Path) -> Image.Image:
    """Create the restrained exact-2x baseline; this is not AI super-resolution."""
    image = _open_rgb(source)
    expected_ratio = WORLD_W / WORLD_H
    if abs(image.width / image.height - expected_ratio) >= 0.002:
        raise ValueError(f"Unexpected source aspect ratio {image.size}; expected {WORLD_W}:{WORLD_H}")

    # Chroma-only deblocking avoids softening the luminance ink contours.
    ycc = image.convert("YCbCr")
    y, cb, cr = ycc.split()
    cb = cb.filter(ImageFilter.MedianFilter(3))
    cr = cr.filter(ImageFilter.MedianFilter(3))
    image = Image.merge("YCbCr", (y, cb, cr)).convert("RGB")

    # This is faithful resampling and restrained local contrast, not a learned SR pass.
    upscaled = image.resize((TEX_W, TEX_H), Image.Resampling.LANCZOS)
    pixels = np.asarray(upscaled, dtype=np.float32)
    luminance = pixels @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    detail = luminance - ndi.gaussian_filter(luminance, 1.6)
    gain = 0.9 * np.clip(np.abs(detail) / 6.0, 0.0, 1.0)
    delta = np.clip(detail * gain, -22.0, 22.0)
    result = np.clip(pixels + delta[..., None], 0, 255).astype(np.uint8)
    return Image.fromarray(result)


def _manifest_base(fmt: str = "webp", quality: int = 90) -> dict[str, Any]:
    tiles = [{**spec, "file": f"{spec['file']}.{fmt}"} for spec in tile_grid()]
    return {
        "version": 1,
        "worldW": WORLD_W, "worldH": WORLD_H, "scale": SCALE,
        "texW": TEX_W, "texH": TEX_H, "tilePx": TILE_PX,
        "cols": math.ceil(TEX_W / TILE_PX), "rows": math.ceil(TEX_H / TILE_PX),
        "format": fmt, "quality": quality if fmt == "webp" else None,
        "tiles": tiles,
    }


def _write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    temp.replace(path)


def cut(master: Image.Image | str | Path, output_dir: str | Path, fmt: str = "webp", quality: int = 90) -> dict[str, Any]:
    image = master if isinstance(master, Image.Image) else _open_rgb(master)
    _validate_master(image)
    fmt = fmt.lower().lstrip(".")
    if fmt not in {"webp", "png"}:
        raise ValueError("Tile format must be 'webp' or 'png'")
    if not 1 <= quality <= 100:
        raise ValueError("WebP quality must be between 1 and 100")
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    manifest = _manifest_base(fmt, quality)
    for tile in manifest["tiles"]:
        x, y, width, height = tile["tex"]
        crop = image.crop((x, y, x + width, y + height))
        path = out / tile["file"]
        if fmt == "webp":
            crop.save(path, "WEBP", quality=quality, method=6)
        else:
            crop.save(path, "PNG", optimize=True)
    _write_json(out / "manifest.json", manifest)
    return manifest


def read_manifest(tile_dir: str | Path) -> dict[str, Any]:
    path = Path(tile_dir) / "manifest.json"
    if not path.is_file():
        raise FileNotFoundError(f"Tile manifest missing: {path}")
    manifest = json.loads(path.read_text(encoding="utf-8"))
    _validate_manifest(manifest)
    return manifest


def _validate_manifest(manifest: dict[str, Any]) -> None:
    expected = {
        "worldW": WORLD_W, "worldH": WORLD_H, "scale": SCALE,
        "texW": TEX_W, "texH": TEX_H, "tilePx": TILE_PX,
    }
    for key, value in expected.items():
        if manifest.get(key) != value:
            raise ValueError(f"Manifest {key} must be {value}, got {manifest.get(key)!r}")
    expected_specs = {(t["row"], t["col"]): t for t in tile_grid()}
    tiles = manifest.get("tiles")
    if not isinstance(tiles, list) or len(tiles) != len(expected_specs):
        raise ValueError(f"Manifest must contain exactly {len(expected_specs)} tiles")
    seen: set[tuple[int, int]] = set()
    for tile in tiles:
        if not isinstance(tile, dict):
            raise ValueError("Manifest contains a malformed tile entry")
        key = (tile.get("row"), tile.get("col"))
        if key not in expected_specs or key in seen:
            raise ValueError(f"Unexpected or duplicate tile row/col: {key}")
        spec = expected_specs[key]
        for field in ("tex", "world"):
            if tile.get(field) != spec[field]:
                raise ValueError(f"Tile {key} has invalid {field} rect: {tile.get(field)!r}")
        filename = tile.get("file")
        if not isinstance(filename, str) or not filename or Path(filename).name != filename:
            raise ValueError(f"Tile {key} has an unsafe/invalid filename")
        if filename != f"{spec['file']}.{manifest.get('format')}":
            raise ValueError(f"Tile {key} filename does not match manifest format")
        seen.add(key)


def stitch(tile_dir: str | Path, output_path: str | Path) -> Image.Image:
    """Reassemble a core-tile set; verifies dimensions and rejects missing tiles."""
    directory = Path(tile_dir)
    manifest = read_manifest(directory)
    master = Image.new("RGB", (TEX_W, TEX_H))
    for tile in manifest["tiles"]:
        path = directory / tile["file"]
        if not path.is_file():
            raise FileNotFoundError(f"Manifest tile missing: {path}")
        with Image.open(path) as image:
            image = image.convert("RGB")
            x, y, width, height = tile["tex"]
            if image.size != (width, height):
                raise ValueError(f"{path.name} dimensions {image.size} do not match manifest {(width, height)}")
            master.paste(image, (x, y))
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    master.save(output, "PNG", optimize=True)
    return master


def prepare_context(master: Image.Image | str | Path, output_dir: str | Path, context: int = DEFAULT_CONTEXT) -> dict[str, Any]:
    """Export PNG input crops with neighbouring context for image-to-image refinement."""
    image = master if isinstance(master, Image.Image) else _open_rgb(master)
    _validate_master(image)
    if not 0 <= context <= TILE_PX // 4:
        raise ValueError(f"Context must be between 0 and {TILE_PX // 4} pixels")
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    tiles: list[dict[str, Any]] = []
    for spec in tile_grid():
        x, y, width, height = spec["tex"]
        left, top = min(context, x), min(context, y)
        right, bottom = min(context, TEX_W - (x + width)), min(context, TEX_H - (y + height))
        crop_box = (x - left, y - top, x + width + right, y + height + bottom)
        crop = image.crop(crop_box)
        filename = f"{spec['file']}_context.png"
        crop.save(out / filename, "PNG", optimize=True)
        tiles.append({
            **spec,
            "inputFile": filename,
            "inputTex": [crop_box[0], crop_box[1], crop.width, crop.height],
            "context": {"left": left, "top": top, "right": right, "bottom": bottom},
            "expectedOutput": [crop.width, crop.height],
        })
    manifest = {
        "version": 2, "kind": "context-refinement-inputs",
        "worldW": WORLD_W, "worldH": WORLD_H, "scale": SCALE,
        "texW": TEX_W, "texH": TEX_H, "tilePx": TILE_PX,
        "context": context,
        "tiles": tiles,
        "outputInstructions": (
            "Return one image per tile, at exactly the input crop dimensions. Preserve all geometry, positions, "
            "outlines, colours and lighting. Use neighbouring context only to maintain continuity."
        ),
    }
    _write_json(out / "prepare_manifest.json", manifest)
    return manifest


def _cosine_ramp(length: int, rising: bool = True) -> np.ndarray:
    if length <= 0:
        return np.ones((0,), dtype=np.float32)
    t = (np.arange(length, dtype=np.float32) + 0.5) / length
    ramp = 0.5 - 0.5 * np.cos(np.pi * t)
    return ramp if rising else 1.0 - ramp


def _axis_weights(start: int, end: int, full_size: int, context: int, crop_start: int, crop_end: int) -> np.ndarray:
    coords = np.arange(crop_start, crop_end, dtype=np.int32)
    weights = np.ones(coords.shape[0], dtype=np.float32)
    if start > 0 and context > 0:
        lo, hi = start - context, start + context
        mask = (coords >= lo) & (coords < hi)
        if mask.any():
            weights[mask] *= _cosine_ramp(2 * context, rising=True)[coords[mask] - lo]
        weights[coords < lo] = 0.0
    if end < full_size and context > 0:
        lo, hi = end - context, end + context
        mask = (coords >= lo) & (coords < hi)
        if mask.any():
            weights[mask] *= _cosine_ramp(2 * context, rising=False)[coords[mask] - lo]
        weights[coords >= hi] = 0.0
    return weights


def stitch_generated(tile_dir: str | Path, output_path: str | Path, context: int | None = None) -> Image.Image:
    """Stitch generated context crops with cosine feathering, or strict core tiles."""
    directory = Path(tile_dir)
    manifest_path = directory / "prepare_manifest.json"
    if not manifest_path.is_file():
        raise FileNotFoundError(f"Context manifest missing: {manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("kind") != "context-refinement-inputs":
        raise ValueError("Unsupported prepare manifest kind")
    for key, value in {"worldW": WORLD_W, "worldH": WORLD_H, "scale": SCALE, "texW": TEX_W, "texH": TEX_H, "tilePx": TILE_PX}.items():
        if manifest.get(key) != value:
            raise ValueError(f"Context manifest {key} must be {value}")
    manifest_context = manifest.get("context")
    blend_context = manifest_context if context is None else context
    if not isinstance(blend_context, int) or blend_context < 0 or blend_context > TILE_PX // 4:
        raise ValueError("Context must be an integer between 0 and 256 pixels")
    if blend_context != manifest_context:
        raise ValueError("The stitch context must match the context used by prepare")

    entries = manifest.get("tiles")
    expected_specs = list(tile_grid())
    if not isinstance(entries, list) or len(entries) != len(expected_specs):
        raise ValueError("Context manifest has an incomplete tile list")
    loaded: list[tuple[dict[str, Any], Image.Image, str]] = []
    forms: set[str] = set()
    for spec, entry in zip(expected_specs, entries):
        if entry.get("row") != spec["row"] or entry.get("col") != spec["col"] or entry.get("tex") != spec["tex"]:
            raise ValueError("Context manifest tile ordering or geometry is invalid")
        candidates = [
            directory / f"{spec['file']}_generated.png",
            directory / f"{spec['file']}_context.png",
            directory / f"{spec['file']}.png",
        ]
        generated_path = next((p for p in candidates if p.is_file() and p.name != f"{spec['file']}_context.png"), None)
        if generated_path is None:
            expected = ", ".join(p.name for p in candidates if p.name != f"{spec['file']}_context.png")
            raise FileNotFoundError(f"Generated tile missing; expected one of: {expected}")
        image = _open_rgb(generated_path)
        x, y, width, height = spec["tex"]
        crop_rect = entry.get("inputTex")
        if not isinstance(crop_rect, list) or len(crop_rect) != 4 or not all(isinstance(v, int) for v in crop_rect):
            raise ValueError(f"Invalid context crop rect in manifest for tile {spec['row']},{spec['col']}")
        expected_left = min(blend_context, x)
        expected_top = min(blend_context, y)
        expected_right = min(blend_context, TEX_W - (x + width))
        expected_bottom = min(blend_context, TEX_H - (y + height))
        expected_crop_rect = [x - expected_left, y - expected_top,
                              width + expected_left + expected_right,
                              height + expected_top + expected_bottom]
        if crop_rect != expected_crop_rect:
            raise ValueError(f"Tile {spec['row']},{spec['col']} has inconsistent context crop rect")
        _, _, crop_w, crop_h = crop_rect
        form = "context" if image.size == (crop_w, crop_h) else "core" if image.size == (width, height) else "invalid"
        if form == "invalid":
            raise ValueError(f"{generated_path.name} is {image.size}; expected context {(crop_w, crop_h)} or core {(width, height)}")
        forms.add(form)
        loaded.append((entry, image, form))

    if len(forms) != 1:
        raise ValueError("Do not mix context-sized and core-sized generated tiles in one stitch")
    if forms == {"core"}:
        master = Image.new("RGB", (TEX_W, TEX_H))
        for entry, image, _ in loaded:
            x, y, _, _ = entry["tex"]
            master.paste(image, (x, y))
    else:
        # This is intentionally an offline/GPU-runner operation, not a Replit runtime path.
        # Peak memory is several hundred MiB because all feather overlaps are accumulated.
        accum = np.zeros((TEX_H, TEX_W, 3), dtype=np.float32)
        weights = np.zeros((TEX_H, TEX_W), dtype=np.float32)
        for entry, image, _ in loaded:
            x, y, width, height = entry["tex"]
            crop_x, crop_y, crop_w, crop_h = entry["inputTex"]
            rgb = np.asarray(image, dtype=np.float32)
            wx = _axis_weights(x, x + width, TEX_W, blend_context, crop_x, crop_x + crop_w)
            wy = _axis_weights(y, y + height, TEX_H, blend_context, crop_y, crop_y + crop_h)
            weight = wy[:, None] * wx[None, :]
            accum[crop_y:crop_y + crop_h, crop_x:crop_x + crop_w] += rgb * weight[..., None]
            weights[crop_y:crop_y + crop_h, crop_x:crop_x + crop_w] += weight
        if np.any(weights <= 0):
            missing = int(np.count_nonzero(weights <= 0))
            raise ValueError(f"Feather blend left {missing} texture pixels uncovered; check context size and manifest")
        pixels = np.clip(accum / weights[..., None], 0, 255).round().astype(np.uint8)
        master = Image.fromarray(pixels)

    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    master.save(output, "PNG", optimize=True)
    return master


def _cmd_baseline(args: argparse.Namespace) -> None:
    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    image = baseline(args.source)
    image.save(out / "master_baseline.png", "PNG", optimize=True)
    manifest = cut(image, out / "tiles", fmt=args.format, quality=args.quality)
    print(f"Created {len(manifest['tiles'])} tiles at {out / 'tiles'}")


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Among Gas 2x map tile pipeline")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("baseline", help="create the faithful exact-2x baseline and cut tiles")
    p.add_argument("source")
    p.add_argument("output_dir")
    p.add_argument("--format", choices=("webp", "png"), default="webp")
    p.add_argument("--quality", type=int, default=90)
    p.set_defaults(func=_cmd_baseline)

    p = sub.add_parser("cut", help="cut an exact-size master into core tiles")
    p.add_argument("master")
    p.add_argument("output_dir")
    p.add_argument("--format", choices=("webp", "png"), default="webp")
    p.add_argument("--quality", type=int, default=90)
    p.set_defaults(func=lambda a: print(f"Created {len(cut(a.master, a.output_dir, a.format, a.quality)['tiles'])} tiles"))

    p = sub.add_parser("stitch", help="reassemble a core tile directory")
    p.add_argument("tile_dir")
    p.add_argument("output")
    p.set_defaults(func=lambda a: (stitch(a.tile_dir, a.output), print("Stitched master successfully")))

    p = sub.add_parser("prepare", help="export context crops for tile refinement")
    p.add_argument("master")
    p.add_argument("output_dir")
    p.add_argument("--context", type=int, default=DEFAULT_CONTEXT)
    p.set_defaults(func=lambda a: print(f"Prepared {len(prepare_context(a.master, a.output_dir, a.context)['tiles'])} context crops"))

    p = sub.add_parser("stitch-generated", help="feather-stitch generated context crops")
    p.add_argument("tile_dir")
    p.add_argument("output")
    p.add_argument("--context", type=int, default=None)
    p.set_defaults(func=lambda a: (stitch_generated(a.tile_dir, a.output, a.context), print("Generated master stitched successfully")))
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    try:
        args.func(args)
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
