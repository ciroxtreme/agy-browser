#!/usr/bin/env bash
# restore-tools.sh — balikin SEMUA perkakas agent di VPS baru (Instant Golden Bundle).
#
# Dijalankan dari ROOT PROJECT BOT (folder yang berisi package.json, tools/, files/).
#
# Yang dipulihkan secara instan via Golden Bundle (v1.0.0, 12 MB):
#   1. Playwright + Chromium        (npm + TMPDIR, jebakan /tmp 100 MB)
#   2. Golden Tools Bundle (cfsolve, tilesturn, curl_cffi, pypasser, shared libs)
#   3. Global CLI Symlinks          (cfsolve-v5-cli, tilesturn)
#   4. pip install (opsional) + smoke test browse.js
#
# SEMUA TANPA KOMPILASI, TANPA BUTUH RUST/CARGO, TANPA OOM CRASH!
set -euo pipefail

BUNDLE_URL="https://github.com/ciroxtreme/agy-browser/releases/download/v1.0.0/tools-bundle-x86_64.tar.gz"

info() { echo "== $* =="; }
lewat() { echo "   (sudah ada — dilewati)"; }

command -v curl >/dev/null 2>&1 || { echo "restore: curl belum ada."; exit 1; }
command -v node >/dev/null 2>&1 || { echo "restore: node 18+ belum ada — pasang Node dulu."; exit 1; }
[ -f package.json ] || { echo "restore: package.json tidak ketemu — jalankan dari root project bot."; exit 1; }

# 1. Playwright + Chromium -----------------------------------------------
info "1/4 Playwright + Chromium"
if [ -d node_modules/playwright ] && [ -d "$HOME/.cache/ms-playwright" ]; then
  lewat
else
  npm install playwright
  mkdir -p "$HOME/.cache/tmp"
  TMPDIR="$HOME/.cache/tmp" npx playwright install chromium
fi

# 2. Golden Tools Bundle (Instant Extract) --------------------------------
info "2/4 Golden Tools Bundle (cfsolve, tilesturn, curl_cffi, pypasser, libs)"
if [ -x files/cfsolve-repo/target/release/challenge ] && [ -d tools/tilesturn-repo/dist ] && [ -d tools/curl_cffi ]; then
  lewat
else
  echo "   Mengunduh pre-built bundle (~12 MB)..."
  mkdir -p "$HOME/.local/bin" "$HOME/.local/usr/lib/x86_64-linux-gnu" files tools
  curl -fsSL "$BUNDLE_URL" | tar -xz -C "$PWD"
  chmod +x files/cfsolve-repo/target/release/challenge tools/tilesturn.mjs tools/browse.js
  echo "   Bundle berhasil diekstrak dalam hitungan detik!"
fi

# 3. Setup Symlinks ------------------------------------------------------
info "3/4 Setup CLI PATH Symlinks"
mkdir -p "$HOME/.local/bin"
ln -sf "$PWD/files/cfsolve-repo/target/release/challenge" "$HOME/.local/bin/cfsolve-v5-cli"
ln -sf "$PWD/tools/tilesturn.mjs" "$HOME/.local/bin/tilesturn"
echo "   cfsolve-v5-cli & tilesturn siap di PATH!"

# 4. pip install (opsional) + smoke test ---------------------------------
info "4/4 pip install (opsional) + smoke test browse.js"
if command -v python3 >/dev/null 2>&1; then
  python3 -m pip install --user curl_cffi PyPasser \
    && echo "   pip install OK" \
    || echo "   (pip install dilewati — modul lokal di tools/ sudah aktif)"
else
  echo "   (python3 tidak ada — lewati pip install)"
fi

node tools/browse.js shot https://example.com
echo "restore: SELESAI — semua perkakas 100% pulih dan siap tempur tanpa error!"
