"""Unit tests for tito_s3."""

import hashlib
import io
import json
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path

sys.modules.setdefault("boto3", types.SimpleNamespace(client=lambda *_a, **_k: None))
os.environ.setdefault("TITO_S3_BUCKET", "test-bucket")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import tito_s3  # noqa: E402


class FakeS3:
    def __init__(self, objects=None):
        self.objects = objects or {}
        self.uploaded = []
        self.put = {}
        self.downloads = 0

    def get_object(self, Bucket, Key):
        return {"Body": io.BytesIO(self.objects[Key])}

    def download_file(self, Bucket, Key, Filename):
        self.downloads += 1
        Path(Filename).write_bytes(self.objects[Key])

    def upload_file(self, Filename, Bucket, Key):
        self.uploaded.append(Key)

    def put_object(self, Bucket, Key, Body, ContentType):
        self.put[Key] = json.loads(Body)


def digest(data):
    return hashlib.sha256(data).hexdigest()


class TitoS3Case(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.app = Path(self.tmp.name)
        tito_s3.APP = self.app
        os.environ["TITO_STATIC_PREFIX"] = "static/guatemala/v1"
        os.environ["TITO_OUTPUT_PREFIX"] = "outputs/guatemala"
        os.environ.pop("TITO_UPDATE_LATEST", None)

    def tearDown(self):
        self.tmp.cleanup()

    def static(self, manifest, files):
        objects = {"static/guatemala/v1/manifest.sha256": manifest.encode()}
        objects.update({f"static/guatemala/v1/{k}": v for k, v in files.items()})
        tito_s3.s3 = FakeS3(objects)
        return tito_s3.s3


class FetchStatic(TitoS3Case):
    def test_downloads_and_verifies(self):
        self.static(f"{digest(b'grid')}  EF5_conf/basic/DEM.tif\n", {"EF5_conf/basic/DEM.tif": b"grid"})
        tito_s3.fetch_static()
        self.assertEqual((self.app / "EF5_conf/basic/DEM.tif").read_bytes(), b"grid")

    def test_checksum_mismatch_exits(self):
        self.static(f"{'0' * 64}  EF5_conf/basic/DEM.tif\n", {"EF5_conf/basic/DEM.tif": b"grid"})
        with self.assertRaises(SystemExit) as ctx:
            tito_s3.fetch_static()
        self.assertIn("checksum mismatch", str(ctx.exception))

    def test_rejects_parent_path(self):
        self.static(f"{digest(b'x')}  ../etc/passwd\n", {})
        with self.assertRaises(SystemExit) as ctx:
            tito_s3.fetch_static()
        self.assertIn("unsafe path", str(ctx.exception))

    def test_rejects_absolute_path(self):
        self.static(f"{digest(b'x')}  /etc/passwd\n", {})
        with self.assertRaises(SystemExit):
            tito_s3.fetch_static()

    def test_skips_file_already_valid(self):
        target = self.app / "EF5_conf/pet/PET.01.tif"
        target.parent.mkdir(parents=True)
        target.write_bytes(b"pet")
        fake = self.static(f"{digest(b'pet')}  EF5_conf/pet/PET.01.tif\n", {"EF5_conf/pet/PET.01.tif": b"pet"})
        tito_s3.fetch_static()
        self.assertEqual(fake.downloads, 0)


class PublishOutputs(TitoS3Case):
    def make_cycle(self, name, files):
        for rel in files:
            path = self.app / "outputs" / name / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("x")

    def test_uploads_every_cycle_and_points_latest_at_newest(self):
        self.make_cycle("20260927.170000", ["guatemala_90m/a.tif"])
        self.make_cycle("20260927.180000", ["guatemala_90m/b.tif"])
        (self.app / "outputs/logs").mkdir()
        tito_s3.s3 = FakeS3()
        tito_s3.publish_outputs()
        self.assertEqual(sorted(tito_s3.s3.uploaded), [
            "outputs/guatemala/20260927.170000/guatemala_90m/a.tif",
            "outputs/guatemala/20260927.180000/guatemala_90m/b.tif",
        ])
        latest = tito_s3.s3.put["outputs/guatemala/latest.json"]
        self.assertEqual(latest["cycle"], "20260927.180000")

    def test_override_run_leaves_latest_unchanged(self):
        self.make_cycle("20250101.000000", ["guatemala_90m/a.tif"])
        os.environ["TITO_UPDATE_LATEST"] = "0"
        tito_s3.s3 = FakeS3()
        tito_s3.publish_outputs()
        self.assertEqual(len(tito_s3.s3.uploaded), 1)
        self.assertEqual(tito_s3.s3.put, {})

    def test_no_cycle_folder_exits(self):
        (self.app / "outputs/logs").mkdir(parents=True)
        tito_s3.s3 = FakeS3()
        with self.assertRaises(SystemExit):
            tito_s3.publish_outputs()


if __name__ == "__main__":
    unittest.main()
