#!/usr/bin/env bash
# setup.sh — pasang engine browser buat agy-browser di VPS baru.
#   bash setup.sh
# Isi: npm install + install Chromium (Playwright).
# JEBAKAN /tmp: di panel Pterodactyl, /tmp sering tmpfs kecil (di server
# lama cuma 100 MB) sementara zip Chromium ~200 MB — download-nya gagal
# ENOSPC di tengah jalan. Makanya TMPDIR dialihkan ke disk utama.
set -euo pipefail

node --version >/dev/null 2>&1 || { echo "setup: node 18+ belum ada — pasang Node dulu."; exit 1; }

echo "== npm install (playwright) =="
npm install

echo "== install Chromium (TMPDIR dialihkan ke disk utama) =="
mkdir -p "$HOME/.cache/tmp"
TMPDIR="$HOME/.cache/tmp" npx playwright install chromium

echo "== cek cfsolve (opsional, buat auto-bypass Cloudflare) =="
if [ -x "${CFSOLVE_BIN:-/home/container/files/cfsolve-repo/target/release/challenge}" ]; then
  echo "cfsolve OK — duet Cloudflare aktif."
else
  echo "cfsolve belum ada — browse.js tetap jalan, tapi halaman Cloudflare"
  echo "mungkin nahan. Cara pasang (lihat README): clone cfsolve-repo,"
  echo "cargo build --release, lalu set CFSOLVE_BIN + CFSOLVE_PROFILE."
fi

echo "== smoke test =="
node browse.js shot https://example.com
echo "setup: selesai. Coba: node browse.js shot https://example.com"
