"""Fail on a broken image."""

import hashlib
import importlib
import os
import shutil
import subprocess
import sys

MODULES = [
    "numpy", "scipy", "pandas", "xarray", "netCDF4", "h5py", "rasterio", "rioxarray",
    "pyproj", "shapely", "pysteps", "zarr", "boto3", "cfgrib", "eccodes", "herbie",
    "matplotlib", "tifffile", "osgeo.gdal",
]
TOOLS = ["bash", "flock", "timeout", "stat", "grep"]

failed = []
for name in MODULES:
    try:
        importlib.import_module(name)
    except Exception as exc:
        failed.append(f"{name}: {exc}")

if sys.version_info < (3, 11) or not hasattr(hashlib, "file_digest"):
    failed.append(f"python {sys.version.split()[0]} lacks hashlib.file_digest")

for tool in TOOLS:
    if shutil.which(tool) is None:
        failed.append(f"{tool} not on PATH")

ef5 = "/app/EF5/bin/ef5"
if not os.access(ef5, os.X_OK):
    failed.append(f"{ef5} missing or not executable")
else:
    run = subprocess.run([ef5], capture_output=True, text=True, timeout=60)
    if "Ensemble Framework" not in run.stdout + run.stderr:
        failed.append("ef5 did not start")

for path in ["/docker-entrypoint.sh", "/app/orchestrator.py", "/opt/tito-task/tito-task.sh"]:
    if not os.path.exists(path):
        failed.append(f"{path} missing")

os.environ.setdefault("TITO_S3_BUCKET", "smoke-test")
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")
sys.path.insert(0, "/opt/tito-task")
try:
    importlib.import_module("tito_s3")
except Exception as exc:
    failed.append(f"tito_s3: {exc}")

if failed:
    print("smoke test failed:\n  " + "\n  ".join(failed))
    sys.exit(1)
print(f"smoke test ok: {len(MODULES)} modules, {len(TOOLS)} tools, ef5 runs, tito_s3 imports")
