#!/usr/bin/env bash
set -e

echo "Applying AFFiNE Brillian Patch..."
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
PATCH_FILE="$REPO_ROOT/patches/affine-brillian-patch-v1.4.0.patch"

if [ ! -f "$PATCH_FILE" ]; then
    echo "Error: Patch file not found at $PATCH_FILE"
    exit 1
fi

git apply --check "$PATCH_FILE" || {
    echo "Warning: Direct git apply check failed, attempting 3-way merge..."
    git apply --3way "$PATCH_FILE"
    exit 0
}

git apply "$PATCH_FILE"
echo "✅ Brillian Patch applied successfully!"
