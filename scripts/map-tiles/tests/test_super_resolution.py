import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np
from PIL import Image

from super_resolution import (
    OUTPUT_RESAMPLING,
    OUTPUT_RESAMPLING_DESCRIPTION,
    extract_context_patch,
    process_image,
)


class SuperResolutionPatchTests(unittest.TestCase):
    def test_manifest_resampler_matches_the_actual_affine_kernel(self):
        self.assertEqual(OUTPUT_RESAMPLING, Image.Resampling.BICUBIC)
        self.assertEqual(
            OUTPUT_RESAMPLING_DESCRIPTION,
            "Pillow BICUBIC affine (global pixel-centre transform)",
        )

    def setUp(self):
        yy, xx = np.mgrid[0:9, 0:17]
        self.source = np.stack([xx * 7, yy * 19, (xx + yy) * 5], axis=-1).astype(np.uint8)

    def test_context_patch_has_exact_dimensions_at_map_edges(self):
        patch = extract_context_patch(self.source, 0, 0, 6, 5, 2)
        self.assertEqual(patch.shape, (9, 10, 3))
        self.assertTrue(np.array_equal(patch[2:7, 2:8], self.source[0:5, 0:6]))

        east_south = extract_context_patch(self.source, 11, 5, 17, 9, 2)
        self.assertEqual(east_south.shape, (8, 10, 3))
        self.assertTrue(np.array_equal(east_south[2:6, 2:8], self.source[5:9, 11:17]))

    def test_tiled_inference_covers_exact_two_x_output(self):
        def fake_x4(patch):
            return np.repeat(np.repeat(patch, 4, axis=0), 4, axis=1)

        context = 4
        output_size = (34, 18)
        result, tile_count = process_image(
            Image.fromarray(self.source),
            fake_x4,
            core_size=6,
            context=context,
            output_size=output_size,
        )
        self.assertEqual(result.size, output_size)
        self.assertEqual(tile_count, 6)
        pixels = np.asarray(result)
        self.assertEqual(pixels.shape, (18, 34, 3))
        self.assertTrue(np.isfinite(pixels).all())
        self.assertGreater(int(pixels[8, 16].sum()), 0)

        full_patch = extract_context_patch(
            self.source, 0, 0, self.source.shape[1], self.source.shape[0], context
        )
        full_x4 = fake_x4(full_patch)
        scale_x = output_size[0] / self.source.shape[1]
        scale_y = output_size[1] / self.source.shape[0]
        transform = (
            4 / scale_x,
            0,
            4 * (0.5 / scale_x + context) - 0.5,
            0,
            4 / scale_y,
            4 * (0.5 / scale_y + context) - 0.5,
        )
        expected = Image.fromarray(full_x4).transform(
            output_size,
            Image.Transform.AFFINE,
            transform,
            resample=Image.Resampling.BICUBIC,
        )
        self.assertTrue(
            np.array_equal(pixels, np.asarray(expected)),
            "all tiled cores must stitch to the same global resampling transform",
        )

    def test_maps_non_integer_source_scale_to_exact_locked_texture_size(self):
        def fake_x4(patch):
            return np.repeat(np.repeat(patch, 4, axis=0), 4, axis=1)

        result, tile_count = process_image(
            Image.fromarray(self.source),
            fake_x4,
            core_size=6,
            context=2,
            output_size=(31, 17),
        )
        self.assertEqual(result.size, (31, 17))
        self.assertEqual(tile_count, 6)
        pixels = np.asarray(result)
        self.assertEqual(pixels.shape, (17, 31, 3))
        self.assertTrue(np.isfinite(pixels).all())
        self.assertGreater(int(pixels.sum()), 0)
        self.assertTrue(np.any(pixels[:, -1, :] > 0), "the mapped east edge must be populated")
        self.assertTrue(np.any(pixels[-1, :, :] > 0), "the mapped south edge must be populated")

    def test_non_integer_tiles_match_one_global_resample_without_seams(self):
        def fake_x4(patch):
            return np.repeat(np.repeat(patch, 4, axis=0), 4, axis=1)

        context = 4
        output_size = (31, 17)
        actual, tile_count = process_image(
            Image.fromarray(self.source),
            fake_x4,
            core_size=6,
            context=context,
            output_size=output_size,
        )
        self.assertEqual(tile_count, 6)

        # A single padded full-frame inference is the deterministic reference.
        # Each tiled core must use the same global pixel-centre transform rather
        # than a locally rounded resize ratio that can create tile seams.
        full_patch = extract_context_patch(
            self.source, 0, 0, self.source.shape[1], self.source.shape[0], context
        )
        full_restored = fake_x4(full_patch)
        scale_x = output_size[0] / self.source.shape[1]
        scale_y = output_size[1] / self.source.shape[0]
        transform = (
            4 / scale_x,
            0,
            4 * (0.5 / scale_x + context) - 0.5,
            0,
            4 / scale_y,
            4 * (0.5 / scale_y + context) - 0.5,
        )
        expected = Image.fromarray(full_restored).transform(
            output_size,
            Image.Transform.AFFINE,
            transform,
            resample=Image.Resampling.BICUBIC,
        )
        self.assertTrue(
            np.array_equal(np.asarray(actual), np.asarray(expected)),
            "non-integer tiled output must match one global resampling transform exactly",
        )

    def test_rejects_wrong_model_output_scale(self):
        def wrong_scale(patch):
            return patch

        with self.assertRaisesRegex(ValueError, "expected"):
            process_image(Image.fromarray(self.source), wrong_scale, core_size=6, context=2)

    def test_rejects_invalid_patch_context(self):
        with self.assertRaisesRegex(ValueError, "non-negative"):
            extract_context_patch(self.source, 0, 0, 3, 3, -1)


if __name__ == "__main__":
    unittest.main()
