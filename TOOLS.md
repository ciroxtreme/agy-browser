# Perkakas agent — biar bisa balik lagi pas pindah VPS

Repo ini bukan cuma `browse.js`. Agent Antigravity di server punya satu
set perkakas, dan semuanya harus bisa dibangun ulang dari nol di VPS
baru — tanpa ngubek-ngubek server lama. Dokumen ini peta + resepnya.

## Peta: di mana tiap tool tinggal di server

| Tool | Di server | Buat apa |
| --- | --- | --- |
| `browse.js` | `tools/browse.js` (di project bot) | Browser visual: shot/click/type + screenshot |
| Playwright + Chromium | `node_modules/` + `~/.cache/ms-playwright` | Engine browser-nya |
| cfsolve | `files/cfsolve-repo/` | Solver Cloudflare (Turnstile/challenge page) → `cf_clearance` |
| curl_cffi | `tools/curl_cffi/` | HTTP client Python yang meniru TLS/JA3 browser asli |
| pypasser | `tools/pypasser-repo/` | Solver CAPTCHA Python (reCAPTCHA, GeeTest, Turnstile, anti-bot wall) |

## Kenapa dokumen ini ada

Di repo bot (`ciroxtreme/cirovps`), `tools/curl_cffi` dan
`tools/pypasser-repo` tercatat sebagai **submodule git — tapi tanpa
file `.gitmodules`**. Artinya `git clone` + `git submodule update`
TIDAK BISA mengambil mereka: URL sumbernya tidak tercatat di mana pun
di repo. cfsolve juga tidak ada di repo bot sama sekali. Tanpa catatan
ini, pindah VPS = ketiga tool itu hilang dan harus dicari ulang.

## Sumber tiap tool (terverifikasi 25 Nov 2026)

### browse.js — repo ini

`https://github.com/ciroxtreme/agy-browser` — versi agent (duet
cfsolve + UA anti-deteksi) + edit portabilitas. Ambil mentahnya:

```bash
curl -fsSL https://raw.githubusercontent.com/ciroxtreme/agy-browser/main/browse.js -o tools/browse.js
```

### Playwright + Chromium — npm

```bash
npm install playwright
mkdir -p "$HOME/.cache/tmp"
TMPDIR="$HOME/.cache/tmp" npx playwright install chromium
```

Jebakan `/tmp` (lihat README): di panel Pterodactyl `/tmp` sering
tmpfs kecil (100 MB) sementara zip Chromium ~200 MB — install gagal
`ENOSPC`. Makanya `TMPDIR` dialihkan ke disk utama.

### cfsolve — repo `ciroxtreme/Uvuvew`, folder `cfsolve/`

Source Rust lengkap (2.103 file, termasuk `vendor/` crate yang
di-patch, `profiles/safari-26-ios.json` + jawaban rekamannya, dan
`rust-toolchain.toml`). Repo Uvuvew publik (~814 MB isinya radar BMKG
— jangan clone utuh, pakai sparse checkout):

```bash
git clone --filter=blob:none --sparse https://github.com/ciroxtreme/Uvuvew.git /tmp/uvuvew-cfsolve
cd /tmp/uvuvew-cfsolve
git sparse-checkout set cfsolve
mv cfsolve files/cfsolve-repo   # dari root project bot
cd files/cfsolve-repo
cargo build --release --bin challenge
```

Hasilnya: `files/cfsolve-repo/target/release/challenge` + profil di
`files/cfsolve-repo/profiles/safari-26-ios.json` — persis jalur
default yang dipakai `browse.js` (`CFSOLVE_BIN`, `CFSOLVE_PROFILE`).

Syarat build (dari README cfsolve): Rust versi `rust-toolchain.toml`
(**1.98.0**, `rustup` memasangnya otomatis), CMake, compiler C/C++,
libclang, dan Git (buat patch + build BoringSSL). Build pertama bisa
10–30 menit di VPS kecil — normal, crate-nya besar (Oxc, Tokio, wreq).

> **Catatan jujur:** sumber di Uvuvew adalah salinan yang tercatat.
> Kalau agent sempat mengubah `files/cfsolve-repo/` di server TANPA
> push ke Uvuvew, perubahan itu tidak ada di sini. Sebelum pindah VPS,
> suruh agent bandingkan + push dulu salinan servernya.

### curl_cffi — upstream `lexiforest/curl_cffi` (dulu `yifeikong`)

Salinan server adalah clone upstream **tanpa modifikasi**, di commit:

```
lexiforest/curl_cffi @ b6817fe2e1ae8c92dfd06a2ca9d5e04bea537a5d
("Update docs", 2026-11-23) — SHA terverifikasi cocok dengan upstream.
```

(R repo-nya pindah dari `yifeikong/curl_cffi` ke `lexiforest/curl_cffi`
— URL lama me-redirect.)

```bash
git clone https://github.com/lexiforest/curl_cffi.git tools/curl_cffi
cd tools/curl_cffi && git checkout b6817fe2e1ae8c92dfd06a2ca9d5e04bea537a5d
# atau cukup: pip install curl_cffi
```

### pypasser — upstream `xHossein/PyPasser`

Salinan server adalah clone upstream **tanpa modifikasi**, di commit:

```
xHossein/PyPasser @ 910c3def3d69e68d42d86ccba5a1b4cf105ee1ed
("docs: add mkdocs documentation and github pages workflow", 2026-10-24)
— SHA terverifikasi cocok dengan upstream.
```

```bash
git clone https://github.com/xHossein/PyPasser.git tools/pypasser-repo
cd tools/pypasser-repo && git checkout 910c3def3d69e68d42d86ccba5a1b4cf105ee1ed
# atau cukup: pip install PyPasser
```

## Sekali jalan: `restore-tools.sh`

Dari **root project bot** (folder yang berisi `package.json`,
`tools/`, `files/`), jalankan:

```bash
bash restore-tools.sh
```

Script itu mengerjakan semuanya di atas secara berurutan (yang sudah
ada dilewati): Playwright + Chromium → `tools/browse.js` → cfsolve
(clone + build) → `tools/curl_cffi` + `tools/pypasser-repo` (clone di
commit yang sama persis) → `pip install curl_cffi PyPasser` (kalau
pip-nya bisa) → smoke test `shot example.com`. Tiap langkah mencetak
statusnya; kalau satu langkah gagal, script berhenti dan bilang di
mana — jangan lanjut buta.

## Yang TIDAK ikut ke-restore (sengaja)

- **Chromium + `node_modules/`** — bukan file repo; di-install ulang
  oleh script (lihat atas).
- **Screenshot di `data/files/`** — hasil kerja, bukan perkakas.
  Tidak masuk backup git by design; kalau mau disimpan, salin manual.
- **Profil browser (`BROWSE_PROFILE`) / cookies / login** — nempel di
  server lama. Login ulang di VPS baru.
- **`.bot-token`, `secrets.enc`, kredensial Brangkas** — rahasia.
  Pulihkan lewat jalur resmi bot (Drive/G19 atau `pulih.js`), jangan
  pernah di-copy mentah.
