#!/usr/bin/env bash
# Rebuilds src/pluralspace-qol.user.js from src/modules/ on every save.

set -euo pipefail
cd "$(dirname "$0")/.."

node scripts/build.js
find src/modules src/_header.txt | entr -c node scripts/build.js
