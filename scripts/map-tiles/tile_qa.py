#!/usr/bin/env python3
"""Acceptance gate for Among Gas map refinements.

Usage:
  python tile_qa.py candidate_master.png master_baseline.png [--report qa.json]

The gate protects geometry, colour grade and tile boundaries. Sharpness is measured
but deliberately never used as a pass/fail criterion: sharpening is not new detail.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage import color

Image.MAX_IMAGE_PIXELS = None
TEX_W, TEX_H, TILE = 6448, 3716, 1024
THRESHOLDS = {
    "G2_lowfreq_lab_mad_max": 3.5,
    "G3_chamfer_px_quarter_max": 1.5,
    "G3_edge_f1_min": 0.80,
    "G4_worst_tile_color_drift_max": 2.5,
    "G5_new_seam_step_levels_max": 1.0,
}


def load(path: str | Path) -> Image.Image:
    p = Path(path)
    if not p.is_file():
        raise FileNotFoundError(f"Image does not exist: {p}")
    with Image.open(p) as image:
        return image.convert("RGB")


def lab_small(image: Image.Image, factor: int) -> np.ndarray:
    size = (max(1, image.width // factor), max(1, image.height // factor))
    small = image.resize(size, Image.Resampling.BOX)
    return color.rgb2lab(np.asarray(small, dtype=np.float32) / 255.0)


def edges(image: Image.Image, factor: int = 4) -> np.ndarray:
    gray = np.asarray(
        image.convert("L").resize((image.width // factor, image.height // factor), Image.Resampling.BOX),
        dtype=np.float32,
    )
    gx, gy = ndi.sobel(gray, axis=1), ndi.sobel(gray, axis=0)
    magnitude = np.hypot(gx, gy)
    return (magnitude > np.percentile(magnitude, 92)) & (gray < np.percentile(gray, 60))


def chamfer_f1(candidate: np.ndarray, reference: np.ndarray, tolerance: int = 2) -> tuple[float, float]:
    if not candidate.any() and not reference.any():
        return 0.0, 1.0
    if not candidate.any() or not reference.any():
        return float("inf"), 0.0
    dist_to_candidate = ndi.distance_transform_edt(~candidate)
    dist_to_reference = ndi.distance_transform_edt(~reference)
    mean_distance = 0.5 * (
        float(dist_to_candidate[reference].mean()) + float(dist_to_reference[candidate].mean())
    )
    precision = float((dist_to_reference[candidate] <= tolerance).mean())
    recall = float((dist_to_candidate[reference] <= tolerance).mean())
    f1 = 2 * precision * recall / max(precision + recall, 1e-12)
    return mean_distance, f1


def seam_profiles(image: Image.Image) -> list[np.ndarray]:
    """Per-pixel signed seam residuals, with natural local image slope removed."""
    gray = np.asarray(image.convert("L"), dtype=np.float32)
    profiles: list[np.ndarray] = []
    for x in range(TILE, TEX_W, TILE):
        delta = gray[:, x] - gray[:, x - 1]
        local_slope = ((gray[:, x - 1] - gray[:, x - 2]) + (gray[:, x + 2] - gray[:, x + 1])) / 2
        profiles.append(delta - local_slope)
    for y in range(TILE, TEX_H, TILE):
        delta = gray[y, :] - gray[y - 1, :]
        local_slope = ((gray[y - 1, :] - gray[y - 2, :]) + (gray[y + 2, :] - gray[y + 1, :])) / 2
        profiles.append(delta - local_slope)
    return profiles


def seam_step(candidate: Image.Image, reference: Image.Image) -> float:
    """95th-percentile new seam discontinuity relative to the reference."""
    candidate_values = seam_profiles(candidate)
    reference_values = seam_profiles(reference)
    return max(
        (float(np.percentile(np.abs(a - b), 95)) for a, b in zip(candidate_values, reference_values)),
        default=0.0,
    )


def laplacian_variance(image: Image.Image) -> float:
    gray = np.asarray(image.convert("L"), dtype=np.float32)
    return float(ndi.laplace(gray).var())


def run(candidate_path: str | Path, reference_path: str | Path) -> tuple[dict[str, Any], bool]:
    candidate, reference = load(candidate_path), load(reference_path)
    report: dict[str, Any] = {
        "thresholds": THRESHOLDS.copy(),
        "candidate_size": list(candidate.size),
        "reference_size": list(reference.size),
    }
    report["G1_size_ok"] = candidate.size == (TEX_W, TEX_H) and reference.size == (TEX_W, TEX_H)
    if not report["G1_size_ok"]:
        report["failures"] = ["G1: candidate and reference must both be 6448x3716"]
        return report, False

    candidate_lab, reference_lab = lab_small(candidate, 16), lab_small(reference, 16)
    report["G2_lowfreq_lab_mad"] = float(np.abs(candidate_lab - reference_lab).mean())
    report["G3_chamfer_px_quarter"], report["G3_edge_f1"] = chamfer_f1(
        edges(candidate), edges(reference)
    )

    worst_drift = 0.0
    tile_results = []
    for y in range(0, TEX_H, TILE):
        for x in range(0, TEX_W, TILE):
            box = (x, y, min(x + TILE, TEX_W), min(y + TILE, TEX_H))
            candidate_mean = lab_small(candidate.crop(box), 8).reshape(-1, 3).mean(axis=0)
            reference_mean = lab_small(reference.crop(box), 8).reshape(-1, 3).mean(axis=0)
            drift = float(np.linalg.norm(candidate_mean - reference_mean))
            worst_drift = max(worst_drift, drift)
            tile_results.append({"row": y // TILE, "col": x // TILE, "lab_drift": drift})
    report["G4_worst_tile_color_drift"] = worst_drift
    report["G4_tile_results"] = tile_results

    candidate_seams = seam_profiles(candidate)
    reference_seams = seam_profiles(reference)
    report["G5_candidate_seam_step_levels"] = max((float(np.percentile(np.abs(v), 95)) for v in candidate_seams), default=0.0)
    report["G5_reference_seam_step_levels"] = max((float(np.percentile(np.abs(v), 95)) for v in reference_seams), default=0.0)
    report["G5_new_seam_step_levels"] = seam_step(candidate, reference)
    report["G6_sharpness_ratio_vs_ref"] = (
        laplacian_variance(candidate) / laplacian_variance(reference)
        if laplacian_variance(reference) > 0 else None
    )
    checks = {
        "G2": report["G2_lowfreq_lab_mad"] <= THRESHOLDS["G2_lowfreq_lab_mad_max"],
        "G3_chamfer": report["G3_chamfer_px_quarter"] <= THRESHOLDS["G3_chamfer_px_quarter_max"],
        "G3_f1": report["G3_edge_f1"] >= THRESHOLDS["G3_edge_f1_min"],
        "G4": report["G4_worst_tile_color_drift"] <= THRESHOLDS["G4_worst_tile_color_drift_max"],
        "G5": report["G5_new_seam_step_levels"] <= THRESHOLDS["G5_new_seam_step_levels_max"],
    }
    report["checks"] = checks
    report["failures"] = [name for name, passed in checks.items() if not passed]
    report["PASS"] = not report["failures"]
    return report, bool(report["PASS"])


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="QA a candidate 2x map against its faithful baseline")
    parser.add_argument("candidate")
    parser.add_argument("reference")
    parser.add_argument("--report", help="write the complete JSON report to this path")
    args = parser.parse_args(argv)
    try:
        report, passed = run(args.candidate, args.reference)
        print(json.dumps(report, indent=2, allow_nan=False))
        if args.report:
            report_path = Path(args.report)
            report_path.parent.mkdir(parents=True, exist_ok=True)
            report_path.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
        return 0 if passed else 1
    except (OSError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
