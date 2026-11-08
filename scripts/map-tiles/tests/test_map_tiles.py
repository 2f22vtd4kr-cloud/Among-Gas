import tempfile
import unittest
from pathlib import Path
import sys

# unittest discovery adds the tests directory, not its parent, to sys.path.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np
from PIL import Image

import map_tiles
import tile_qa


class MapTilesTests(unittest.TestCase):
    def make_master(self):
        yy, xx = np.mgrid[0:map_tiles.TEX_H, 0:map_tiles.TEX_W]
        red = (xx // 32 * 7 + yy // 64 * 3) % 256
        green = (xx // 8 + yy // 16 * 5) % 256
        blue = ((xx // 4) ^ (yy // 4)) % 256
        pixels = np.stack([red, green, blue], axis=-1).astype(np.uint8)
        pixels[700:1800, 1000:1020] = [4, 8, 12]
        pixels[1700:1720, 500:5000] = [3, 7, 9]
        return Image.fromarray(pixels)

    def test_grid_covers_exact_map(self):
        tiles = list(map_tiles.tile_grid())
        self.assertEqual(len(tiles), 28)
        total_area = sum(t["tex"][2] * t["tex"][3] for t in tiles)
        self.assertEqual(total_area, map_tiles.TEX_W * map_tiles.TEX_H)
        self.assertEqual(tiles[-1]["tex"], [6144, 3072, 304, 644])

    def test_png_cut_stitch_round_trip_is_lossless(self):
        master = self.make_master()
        with tempfile.TemporaryDirectory() as tmp:
            tile_dir = Path(tmp) / "tiles"
            map_tiles.cut(master, tile_dir, fmt="png")
            rebuilt_path = Path(tmp) / "rebuilt.png"
            rebuilt = map_tiles.stitch(tile_dir, rebuilt_path)
            self.assertTrue(np.array_equal(np.asarray(master), np.asarray(rebuilt)))
            self.assertTrue(rebuilt_path.is_file())

    def test_context_prepare_and_feather_stitch_round_trip(self):
        master = self.make_master()
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp) / "work"
            manifest = map_tiles.prepare_context(master, work, context=64)
            self.assertEqual(len(manifest["tiles"]), 28)
            for tile in manifest["tiles"]:
                source = work / tile["inputFile"]
                output = work / f"{Path(tile['inputFile']).stem.replace('_context', '')}_generated.png"
                output.write_bytes(source.read_bytes())
            result = map_tiles.stitch_generated(work, Path(tmp) / "feathered.png")
            self.assertTrue(np.array_equal(np.asarray(master), np.asarray(result)))

    def test_context_stitch_rejects_mixed_output_sizes(self):
        master = Image.new("RGB", (map_tiles.TEX_W, map_tiles.TEX_H), (10, 20, 30))
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp) / "work"
            manifest = map_tiles.prepare_context(master, work, context=64)
            for tile in manifest["tiles"]:
                output = work / f"{Path(tile['inputFile']).stem.replace('_context', '')}_generated.png"
                x, y, w, h = tile["tex"]
                Image.new("RGB", (w, h), (10, 20, 30)).save(output)
            first = manifest["tiles"][0]
            (work / f"{Path(first['inputFile']).stem.replace('_context', '')}_generated.png").write_bytes(
                (work / first["inputFile"]).read_bytes()
            )
            with self.assertRaisesRegex(ValueError, "Do not mix"):
                map_tiles.stitch_generated(work, Path(tmp) / "bad.png")

    def test_manifest_detects_missing_tile(self):
        master = Image.new("RGB", (map_tiles.TEX_W, map_tiles.TEX_H), (1, 2, 3))
        with tempfile.TemporaryDirectory() as tmp:
            tile_dir = Path(tmp) / "tiles"
            map_tiles.cut(master, tile_dir, fmt="png")
            (tile_dir / "tile_r0_c0.png").unlink()
            with self.assertRaises(FileNotFoundError):
                map_tiles.stitch(tile_dir, Path(tmp) / "missing.png")

    def test_qa_detects_new_localised_tile_seam(self):
        master = self.make_master()
        with tempfile.TemporaryDirectory() as tmp:
            ref = Path(tmp) / "ref.png"
            damaged = Path(tmp) / "damaged.png"
            master.save(ref)
            pixels = np.asarray(master).copy()
            pixels[:, 1024, :] = np.clip(
                pixels[:, 1024, :].astype(np.int16) + 80, 0, 255
            ).astype(np.uint8)
            Image.fromarray(pixels).save(damaged)
            report, passed = tile_qa.run(damaged, ref)
            self.assertGreater(report["G5_new_seam_step_levels"], 1.0)
            self.assertFalse(report["checks"]["G5"])
            self.assertFalse(passed)

    def test_qa_accepts_identity_and_rejects_geometry_shift(self):
        master = self.make_master()
        with tempfile.TemporaryDirectory() as tmp:
            ref = Path(tmp) / "ref.png"
            same = Path(tmp) / "same.png"
            shifted = Path(tmp) / "shifted.png"
            master.save(ref)
            master.save(same)
            moved = Image.new("RGB", master.size)
            moved.paste(master.crop((8, 0, master.width, master.height)), (0, 0))
            moved.paste(master.crop((0, 0, 8, master.height)), (master.width - 8, 0))
            moved.save(shifted)
            report, passed = tile_qa.run(same, ref)
            self.assertTrue(passed, report)
            report, passed = tile_qa.run(shifted, ref)
            self.assertFalse(passed)


if __name__ == "__main__":
    unittest.main()
