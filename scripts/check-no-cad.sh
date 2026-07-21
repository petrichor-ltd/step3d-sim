#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "$0")/.." && pwd)"
forbidden_list="$(mktemp)"
trap 'rm -f "$forbidden_list"' EXIT

find "$project_root" -type f \
  \( -iname '*.step' -o -iname '*.stp' -o -iname '*.stpz' -o -iname '*.iges' -o -iname '*.igs' \
     -o -iname '*.stl' -o -iname '*.obj' -o -iname '*.gltf' -o -iname '*.glb' -o -iname '*.3mf' \
     -o -iname '*.zip' -o -iname 'parts-manifest.json' -o -iname 'step-geometry-*.json' \) \
  -print > "$forbidden_list"

if [ -s "$forbidden_list" ]; then
  echo 'Refusing to publish: CAD/archive/derived model files were found.' >&2
  sed 's/^/ - /' "$forbidden_list" >&2
  exit 1
fi

echo 'CAD leak check passed.'
