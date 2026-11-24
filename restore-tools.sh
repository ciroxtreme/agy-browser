#!/usr/bin/env bash
# restore-tools.sh — balikin SEMUA perkakas agent di VPS baru.
#
# Dijalankan dari ROOT PROJECT BOT (folder yang berisi package.json,
# tools/, files/). Kalau belum ada project bot-nya, clone dulu:
#   git clone https://github.com/ciroxtreme/cirovps.git <nama-folder>
#   cd <nama-folder>
#
# Yang dipulihkan (lihat TOOLS.md buat sumber + alasan tiap langkah):
#   1. Playwright + Chromium        (npm + TMPDIR, jebakan /tmp 100 MB)
#   2. tools/browse.js              (raw dari repo agy-browser)
#   3. files/cfsolve-repo           (sparse clone Uvuvew + cargo build)
#   4. tools/curl_cffi              (clone upstream, pin commit server)
#   5. tools/pypasser-repo          (clone upstream, pin commit server)
#   6. pip install curl_cffi PyPasser (opsional, kalau pip bisa)
#   7. smoke test browse.js
#
# Langkah yang targetnya sudah ada DILEWATI (aman dijalankan ulang).
# Kalau satu langkah gagal, script BERHENTI dan bilang di mana.
set -euo pipefail

AGY_BROWSER_RAW="https://raw.githubusercontent.com/ciroxtreme/agy-browser/main/browse.js"
CURL_CFFI_SHA="b6817fe2e1ae8c92dfd06a2ca9d5e04bea537a5d"
PYPASSER_SHA="910c3def3d69e68d42d86ccba5a1b4cf105ee1ed"

info() { echo "== $* =="; }
lewat() { echo "   (sudah ada — dilewati)"; }

command -v git >/dev/null 2>&1 || { echo "restore: git belum ada."; exit 1; }
command -v node >/dev/null 2>&1 || { echo "restore: node 18+ belum ada — pasang Node dulu."; exit 1; }
[ -f package.json ] || { echo "restore: package.json tidak ketemu — jalankan dari root project bot."; exit 1; }

# 1. Playwright + Chromium -----------------------------------------------
info "1/6 Playwright + Chromium"
if [ -d node_modules/playwright ] && [ -d "$HOME/.cache/ms-playwright" ]; then
  lewat
else
  npm install playwright
  mkdir -p "$HOME/.cache/tmp"
  TMPDIR="$HOME/.cache/tmp" npx playwright install chromium
fi

# 2. browse.js ------------------------------------------------------------
info "2/6 tools/browse.js (dari agy-browser)"
if [ -f tools/browse.js ]; then
  lewat
else
  mkdir -p tools
  curl -fsSL "$AGY_BROWSER_RAW" -o tools/browse.js
  node --check tools/browse.js && echo "   browse.js OK (node --check lolos)"
fi

# 3. cfsolve ---------------------------------------------------------------
info "3/6 cfsolve (clone Uvuvew + cargo build)"
if [ -x files/cfsolve-repo/target/release/challenge ]; then
  lewat
else
  command -v cargo >/dev/null 2>&1 || {
    echo "restore: cargo belum ada — pasang Rust dulu:"
    echo "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    echo "  (lalu: source \$HOME/.cargo/env, dan jalankan lagi script ini)"
    exit 1
  }
  for dep in cmake; do
    command -v "$dep" >/dev/null 2>&1 || { echo "restore: $dep belum ada — pasang dulu (butuh buat build cfsolve)."; exit 1; }
  done
  TMP_CLONE="$(mktemp -d)/uvuvew-cfsolve"
  git clone --filter=blob:none --sparse https://github.com/ciroxtreme/Uvuvew.git "$TMP_CLONE"
  (cd "$TMP_CLONE" && git sparse-checkout set cfsolve)
  mkdir -p files
  rm -rf files/cfsolve-repo
  mv "$TMP_CLONE/cfsolve" files/cfsolve-repo
  rm -rf "$(dirname "$TMP_CLONE")"
  (cd files/cfsolve-repo && cargo build --release --bin challenge)
  echo "   binary: files/cfsolve-repo/target/release/challenge"
fi

# 4. curl_cffi -------------------------------------------------------------
info "4/6 tools/curl_cffi (lexiforest/curl_cffi @ $CURL_CFFI_SHA)"
if [ -d tools/curl_cffi/.git ]; then
  lewat
else
  git clone https://github.com/lexiforest/curl_cffi.git tools/curl_cffi
  (cd tools/curl_cffi && git checkout "$CURL_CFFI_SHA")
fi

# 5. pypasser --------------------------------------------------------------
info "5/6 tools/pypasser-repo (xHossein/PyPasser @ $PYPASSER_SHA)"
if [ -d tools/pypasser-repo/.git ]; then
  lewat
else
  git clone https://github.com/xHossein/PyPasser.git tools/pypasser-repo
  (cd tools/pypasser-repo && git checkout "$PYPASSER_SHA")
fi

# 6. pip install (opsional) + smoke test ------------------------------------
info "6/6 pip install + smoke test"
if command -v python3 >/dev/null 2>&1; then
  python3 -m pip install --user curl_cffi PyPasser \
    && echo "   pip install OK" \
    || echo "   (pip install gagal — clone di tools/ sudah cukup buat agent; lanjut)"
else
  echo "   (python3 tidak ada — lewati pip install)"
fi

node tools/browse.js shot https://example.com
echo "restore: SELESAI — semua perkakas balik lagi."
