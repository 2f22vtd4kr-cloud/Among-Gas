import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np
from PIL import Image

from super_resolution import extract_context_patch, process_image


class SuperResolutionPatchTests(unittest.TestCase):
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

        result, tile_count = process_image(
            Image.fromarray(self.source), fake_x4, core_size=6, context=2
        )
        self.assertEqual(result.size, (34, 18))
        self.assertEqual(tile_count, 6)
        pixels = np.asarray(result)
        self.assertEqual(pixels.shape, (18, 34, 3))
        self.assertTrue(np.isfinite(pixels).all())
        self.assertGreater(int(pixels[8, 16].sum()), 0)
        full_x4 = np.repeat(np.repeat(self.source, 4, axis=0), 4, axis=1)
        expected = Image.fromarray(full_x4).resize((34, 18), Image.Resampling.LANCZOS)
        self.assertTrue(
            np.array_equal(pixels, np.asarray(expected)),
            "overlapped tile cores must stitch to the same result as one full-frame inference",
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
