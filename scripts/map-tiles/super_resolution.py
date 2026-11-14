#!/usr/bin/env python3
"""Pinned Real-ESRGAN Stage-1 map super-resolution candidate generator.

The official model is x4. We infer overlapping source patches, retain only each
patch's context-safe core, and downsample the learned output to the canonical x2
texture. This script never writes to the game's public asset directory.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Callable

import numpy as np
from PIL import Image

WORLD_W, WORLD_H = 3224, 1858
MODEL_SCALE = 4
OUTPUT_SCALE = 2
MODEL_REPOSITORY = "skillsafe-ai/realesrgan-x4plus-anime-6b"
MODEL_REVISION = "c001be5"
MODEL_URL = (
    "https://huggingface.co/skillsafe-ai/realesrgan-x4plus-anime-6b/"
    "resolve/c001be5/model.onnx"
)
MODEL_SHA256 = "9a029dae374b2cd4c3eb2dbbed857e22e6d785687c767aa12828e7356b9fb378"
UPSTREAM_WEIGHTS_SHA256 = "f872d837d3c90ed2e05227bed711af5671a6fd1c9f7d7e91c911a61f155e99da"
MODEL_LICENSE = "BSD-3-Clause"


def sha256_file(path: str | Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def extract_context_patch(
    source: np.ndarray,
    x0: int,
    y0: int,
    x1: int,
    y1: int,
    context: int,
) -> np.ndarray:
    """Extract one core plus reflected context, including at all four map edges."""
    height, width, channels = source.shape
    if channels != 3 or not (0 <= x0 < x1 <= width and 0 <= y0 < y1 <= height):
        raise ValueError("Patch core must be a non-empty in-bounds RGB rectangle")
    if context < 0:
        raise ValueError("Context must be non-negative")

    left, top = max(0, x0 - context), max(0, y0 - context)
    right, bottom = min(width, x1 + context), min(height, y1 + context)
    crop = source[top:bottom, left:right]
    pad_left = context - (x0 - left)
    pad_top = context - (y0 - top)
    pad_right = context - (right - x1)
    pad_bottom = context - (bottom - y1)
    if min(pad_left, pad_top, pad_right, pad_bottom) < 0:
        raise ValueError("Calculated patch context is invalid")
    if any((pad_left, pad_top, pad_right, pad_bottom)):
        mode = "reflect" if crop.shape[0] > 1 and crop.shape[1] > 1 else "edge"
        crop = np.pad(
            crop,
            ((pad_top, pad_bottom), (pad_left, pad_right), (0, 0)),
            mode=mode,
        )
    expected = (y1 - y0 + context * 2, x1 - x0 + context * 2, 3)
    if crop.shape != expected:
        raise RuntimeError(f"Context patch has {crop.shape}; expected {expected}")
    return np.ascontiguousarray(crop)


def process_image(
    image: Image.Image,
    upscale_patch: Callable[[np.ndarray], np.ndarray],
    *,
    core_size: int = 192,
    context: int = 64,
) -> tuple[Image.Image, int]:
    """Run 4× inference with context-safe cores, then produce an exact 2× master."""
    if core_size <= 0 or context < 0:
        raise ValueError("Core size must be positive and context non-negative")
    source = np.asarray(image.convert("RGB"), dtype=np.uint8)
    height, width = source.shape[:2]
    output = np.zeros((height * OUTPUT_SCALE, width * OUTPUT_SCALE, 3), dtype=np.uint8)
    tile_count = 0

    for y0 in range(0, height, core_size):
        y1 = min(height, y0 + core_size)
        for x0 in range(0, width, core_size):
            x1 = min(width, x0 + core_size)
            patch = extract_context_patch(source, x0, y0, x1, y1, context)
            restored = np.asarray(upscale_patch(patch))
            expected_shape = (patch.shape[0] * MODEL_SCALE, patch.shape[1] * MODEL_SCALE, 3)
            if restored.shape != expected_shape:
                raise ValueError(
                    f"SR model returned {restored.shape}; expected {expected_shape}"
                )
            if restored.dtype != np.uint8:
                restored = np.clip(restored, 0, 255).round().astype(np.uint8)

            restored_image = Image.fromarray(restored, mode="RGB")
            half = restored_image.resize(
                (patch.shape[1] * OUTPUT_SCALE, patch.shape[0] * OUTPUT_SCALE),
                Image.Resampling.LANCZOS,
            )
            core = np.asarray(half, dtype=np.uint8)[
                context * OUTPUT_SCALE:(context + (y1 - y0)) * OUTPUT_SCALE,
                context * OUTPUT_SCALE:(context + (x1 - x0)) * OUTPUT_SCALE,
            ]
            output[
                y0 * OUTPUT_SCALE:y1 * OUTPUT_SCALE,
                x0 * OUTPUT_SCALE:x1 * OUTPUT_SCALE,
            ] = core
            tile_count += 1

    return Image.fromarray(output, mode="RGB"), tile_count


def load_onnx_upscaler(model_path: str | Path, provider: str = "CPUExecutionProvider"):
    try:
        import onnxruntime as ort
    except ImportError as exc:
        raise RuntimeError(
            "onnxruntime is required; install scripts/map-tiles/requirements-sr.txt"
        ) from exc

    actual_sha = sha256_file(model_path)
    if actual_sha != MODEL_SHA256:
        raise ValueError(
            f"Model SHA-256 mismatch: expected {MODEL_SHA256}, got {actual_sha}"
        )
    available = ort.get_available_providers()
    if provider not in available:
        raise RuntimeError(
            f"Requested ONNX provider {provider!r} is unavailable; found {available}"
        )
    session = ort.InferenceSession(str(model_path), providers=[provider])
    input_name = session.get_inputs()[0].name
    output_name = session.get_outputs()[0].name

    def upscale(patch: np.ndarray) -> np.ndarray:
        tensor = patch.astype(np.float32) / 255.0
        tensor = np.transpose(tensor, (2, 0, 1))[None, ...]
        result = session.run([output_name], {input_name: tensor})[0][0]
        result = np.transpose(result, (1, 2, 0))
        if result.shape != (patch.shape[0] * MODEL_SCALE, patch.shape[1] * MODEL_SCALE, 3):
            raise ValueError(f"Unexpected ONNX output tensor shape: {result.shape}")
        return np.clip(result * 255.0, 0, 255).round().astype(np.uint8)

    return upscale, ort.__version__, provider


def run(
    input_path: str | Path,
    output_path: str | Path,
    model_path: str | Path,
    *,
    core_size: int = 192,
    context: int = 64,
    provider: str = "CPUExecutionProvider",
    manifest_path: str | Path | None = None,
) -> dict:
    source = Image.open(input_path).convert("RGB")
    if source.size != (WORLD_W, WORLD_H):
        raise ValueError(
            f"Canonical source must be {WORLD_W}x{WORLD_H}; got {source.width}x{source.height}"
        )
    model_sha = sha256_file(model_path)
    if model_sha != MODEL_SHA256:
        raise ValueError(f"Model SHA-256 mismatch: expected {MODEL_SHA256}, got {model_sha}")

    upscale, ort_version, selected_provider = load_onnx_upscaler(model_path, provider)
    candidate, tile_count = process_image(
        source, upscale, core_size=core_size, context=context
    )
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    candidate.save(output, "PNG", optimize=False, compress_level=1)

    manifest = {
        "version": 1,
        "stage": "stage-1-learned-super-resolution",
        "input": {
            "path": str(input_path),
            "sha256": sha256_file(input_path),
            "width": source.width,
            "height": source.height,
        },
        "model": {
            "name": "RealESRGAN_x4plus_anime_6B",
            "repository": MODEL_REPOSITORY,
            "revision": MODEL_REVISION,
            "url": MODEL_URL,
            "sha256": model_sha,
            "upstream_weights_sha256": UPSTREAM_WEIGHTS_SHA256,
            "license": MODEL_LICENSE,
            "upscale": MODEL_SCALE,
        },
        "processing": {
            "output_scale": OUTPUT_SCALE,
            "downsample": "Pillow Lanczos",
            "core_size": core_size,
            "context": context,
            "tile_count": tile_count,
            "provider": selected_provider,
            "onnxruntime_version": ort_version,
            "deterministic": selected_provider == "CPUExecutionProvider",
        },
        "output": {
            "path": str(output),
            "sha256": sha256_file(output),
            "width": candidate.width,
            "height": candidate.height,
        },
        "approval": "candidate-only; requires tile QA and manual visual review",
    }
    manifest_file = Path(manifest_path) if manifest_path else output.with_suffix(".manifest.json")
    manifest_file.parent.mkdir(parents=True, exist_ok=True)
    manifest_file.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate a pinned Real-ESRGAN Stage-1 map candidate")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--manifest")
    parser.add_argument("--core-size", type=int, default=192)
    parser.add_argument("--context", type=int, default=64)
    parser.add_argument("--provider", default="CPUExecutionProvider")
    args = parser.parse_args(argv)
    try:
        manifest = run(
            args.input, args.output, args.model,
            core_size=args.core_size, context=args.context,
            provider=args.provider, manifest_path=args.manifest,
        )
        print(json.dumps(manifest, indent=2))
        return 0
    except (OSError, ValueError, RuntimeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
