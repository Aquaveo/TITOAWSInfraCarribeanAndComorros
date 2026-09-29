#!/bin/bash
# Publish static data to S3.
set -euo pipefail

SRC="${1:?source checkout}"
COUNTRY="${2:?country key}"
REGION_NAME="${3:?TITO region name}"
VERSION="${4:?data version}"
BUCKET="${5:?bucket}"
DEST="s3://$BUCKET/static/$COUNTRY/$VERSION"

PATHS=(
    EF5_conf/basic
    EF5_conf/parameters
    EF5_conf/pet
    tito_utils/qpf_utils/StormLab-GFS-realtime/params
    "fim_store/$REGION_NAME"
)

cd "$SRC"
for p in "${PATHS[@]}"; do
    [ -e "$p" ] || { echo "missing: $p" >&2; exit 1; }
done

# Refuse Git LFS pointer files
pointers=$(find "${PATHS[@]}" -type f -size -1024c -exec grep -l '^version https://git-lfs' {} + || true)
if [ -n "$pointers" ]; then
    echo "Git LFS pointers found, run git lfs pull:" >&2
    echo "$pointers" | head -20 >&2
    exit 1
fi

if aws s3 ls "$DEST/manifest.sha256" >/dev/null 2>&1; then
    echo "$DEST already published; versions are immutable" >&2
    exit 1
fi

manifest=$(mktemp)
find "${PATHS[@]}" -type f ! -name '.gitkeep' -print0 | sort -z | xargs -0 sha256sum > "$manifest"
echo "files: $(wc -l < "$manifest"), size: $(du -shc "${PATHS[@]}" | tail -1 | cut -f1)"

for p in "${PATHS[@]}"; do
    aws s3 cp --recursive --only-show-errors --exclude '.gitkeep' "$p" "$DEST/$p"
done

# Manifest last marks completion
aws s3 cp --only-show-errors "$manifest" "$DEST/manifest.sha256"
echo "published $DEST"
