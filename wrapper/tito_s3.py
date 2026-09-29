"""S3 steps for TITO cycles."""

import hashlib
import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import boto3

APP = Path(os.environ.get("TITO_APP_DIR", "/app"))
BUCKET = os.environ["TITO_S3_BUCKET"]
CYCLE_DIR = re.compile(r"^\d{8}\.\d{6}$")
s3 = boto3.client("s3")


def sha256(path):
    with open(path, "rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()


def read_manifest(prefix):
    body = s3.get_object(Bucket=BUCKET, Key=f"{prefix}/manifest.sha256")["Body"].read()
    entries = []
    for line in body.decode().splitlines():
        if not line.strip():
            continue
        digest, rel = line.split(maxsplit=1)
        rel = rel.lstrip("*")
        if rel.startswith("/") or ".." in Path(rel).parts:
            sys.exit(f"unsafe path in manifest: {rel}")
        entries.append((digest, rel))
    return entries


def fetch_one(prefix, digest, rel):
    dest = APP / rel
    if dest.is_file() and sha256(dest) == digest:
        return rel, True
    dest.parent.mkdir(parents=True, exist_ok=True)
    s3.download_file(BUCKET, f"{prefix}/{rel}", str(dest))
    return rel, sha256(dest) == digest


def fetch_static():
    prefix = os.environ["TITO_STATIC_PREFIX"].strip("/")
    entries = read_manifest(prefix)
    with ThreadPoolExecutor(max_workers=16) as pool:
        results = list(pool.map(lambda e: fetch_one(prefix, *e), entries))
    bad = [rel for rel, ok in results if not ok]
    if bad:
        sys.exit(f"checksum mismatch: {bad[:5]}")
    print(f"static data ok: {len(entries)} files from s3://{BUCKET}/{prefix}")


def cycles():
    root = APP / "outputs"
    found = sorted(p for p in root.iterdir() if p.is_dir() and CYCLE_DIR.match(p.name))
    if not found:
        sys.exit("no cycle folder under outputs/")
    return found


def publish_outputs():
    prefix = os.environ["TITO_OUTPUT_PREFIX"].strip("/")
    done = cycles()
    files = [(c, p) for c in done for p in c.rglob("*") if p.is_file()]

    def upload(item):
        cycle, path = item
        key = f"{prefix}/{cycle.name}/{path.relative_to(cycle).as_posix()}"
        s3.upload_file(str(path), BUCKET, key)

    with ThreadPoolExecutor(max_workers=16) as pool:
        list(pool.map(upload, files))

    # Index after files, for readers
    for cycle in done:
        rels = sorted((p.relative_to(cycle).as_posix(), p.stat().st_size)
                      for c, p in files if c == cycle)
        put_json(f"{prefix}/{cycle.name}/index.json", {
            "cycle": cycle.name,
            "files": [{"path": rel, "size": size} for rel, size in rels],
        })

    print(f"outputs ok: {len(files)} files, {len(done)} cycle(s) to s3://{BUCKET}/{prefix}/")
    if os.environ.get("TITO_UPDATE_LATEST", "1") != "1":
        print("latest.json left unchanged")
        return

    cycle = done[-1]
    latest = {
        "cycle": cycle.name,
        "prefix": f"{prefix}/{cycle.name}/",
        "index": f"{prefix}/{cycle.name}/index.json",
        "cycles_published": [c.name for c in done],
        "files": len(files),
        "published_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "image_tag": os.environ.get("TITO_IMAGE_TAG", ""),
        "static_data": os.environ.get("TITO_STATIC_PREFIX", ""),
    }
    put_json(f"{prefix}/latest.json", latest)
    print(f"latest.json -> {cycle.name}")


def put_json(key, doc):
    s3.put_object(
        Bucket=BUCKET,
        Key=key,
        Body=json.dumps(doc, indent=2).encode(),
        ContentType="application/json",
    )


if __name__ == "__main__":
    commands = {"fetch-static": fetch_static, "publish-outputs": publish_outputs}
    if len(sys.argv) != 2 or sys.argv[1] not in commands:
        sys.exit(f"usage: tito_s3.py {'|'.join(commands)}")
    commands[sys.argv[1]]()
