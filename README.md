# agy-browser

Browser visual otonom buat agent Antigravity — lahir dari eksperimen
tele-console 24 Nov 2026 ("pengen antigravituku punya browser juga
kayak kamu"). Satu script `browse.js`: buka halaman, baca teks/DOM,
klik, isi form, dan simpan screenshot yang bisa dibaca agent
(multimodal) — jadi agent bisa browsing sendiri kayak manusia.

Teruji live 24 Nov 2026: `shot example.com` + `click "Learn more"`
(navigasi ke iana.org, dibaca dengan benar) + `type` + duet cfsolve.

## Isi repo

- **`browse.js`** — script-nya. Perintah: `shot`, `click`, `type`.
- **`setup.sh`** — installer satu perintah (lihat bawah).
- **`package.json`** — dependensi cuma `playwright`.
- **`TOOLS.md`** — peta semua perkakas agent (cfsolve, curl_cffi,
  pypasser) + cara balikinnya pas pindah VPS.
- **`restore-tools.sh`** — sekali jalan dari root project bot, balikin
  semua perkakas dari nol (lihat `TOOLS.md`).

## Pasang di VPS baru

```bash
git clone https://github.com/ciroxtreme/agy-browser.git
cd agy-browser
bash setup.sh
```

`setup.sh` menjalankan `npm install` lalu
`TMPDIR=$HOME/.cache/tmp npx playwright install chromium`.

> **Jebakan `/tmp`:** di panel Pterodactyl, `/tmp` sering tmpfs kecil
> (di server lama cuma 100 MB) sementara zip Chromium ~200 MB — install
> gagal `ENOSPC` di 47%. Makanya `TMPDIR` dialihkan ke disk utama
> (`$HOME/.cache/tmp`). Jangan install Chromium dengan `/tmp` bawaan.

Browser terpasang di `~/.cache/ms-playwright` (bukan di repo, hilang
kalau container di-rebuild — install ulang pakai `setup.sh`).

> **Mau semua perkakas sekaligus** (browser + cfsolve + curl_cffi +
> pypasser, sekali sedot ke folder masing-masing seperti di VPS saat
> ini)? Dari root project bot, satu perintah:
>
> ```bash
> curl -fsSL https://raw.githubusercontent.com/ciroxtreme/agy-browser/main/restore-tools.sh -o restore-tools.sh && bash restore-tools.sh
> ```
>
> Detailnya di `TOOLS.md`.

## Pakai

```bash
node browse.js shot https://example.com
node browse.js shot https://example.com hasil.png
node browse.js click https://example.com "text=Learn more"
node browse.js type https://duckduckgo.com "input[name=q]" kucing
```

Keluaran: `TITLE`, `URL`, `PNG`, lalu isi teks halaman (maks 8000
karakter). Screenshot default masuk `data/files/browse-<waktu>.png`
(folder ini tidak masuk git, lihat `.gitignore`).

Loop buat agent: shot → baca PNG → putuskan klik/ketik apa →
click/type → baca PNG baru → ulang. Viewport tetap 1280x720 supaya
koordinat klik dari screenshot selalu cocok. Baca isi halaman dari
TEKS (murah + presisi); screenshot cuma pas butuh liat tampilan.

## Duet cfsolve (auto-bypass Cloudflare)

Kalau halaman ketahan Cloudflare ("Just a moment..."), `browse.js`
otomatis jalanin **cfsolve** buat ambil cookie `cf_clearance`, lalu
muat ulang halaman dengan UA profil cfsolve. Tanpa cfsolve pun script
tetap jalan — halaman Cloudflare-nya aja yang mungkin nahan.

cfsolve TIDAK termasuk di repo ini (binary Rust terpisah). Cara pasang:

```bash
# clone repo cfsolve (di server lama: files/cfsolve-repo)
git clone <url-cfsolve> cfsolve-repo
cd cfsolve-repo && cargo build --release
```

Lalu arahkan `browse.js` ke lokasinya (default-nya jalur server lama):

```bash
export CFSOLVE_BIN="$HOME/cfsolve-repo/target/release/challenge"
export CFSOLVE_PROFILE="$HOME/cfsolve-repo/profiles/safari-26-ios.json"
```

## Anti-deteksi

- UA desktop default: Chrome/128 Windows (+ header `Sec-Ch-Ua`).
- Launch arg `--disable-blink-features=AutomationControlled`.
- Override UA: `BROWSE_UA="Mozilla/5.0 ..."`.

## Login nempel (opsional)

```bash
export BROWSE_PROFILE=.browser-profile   # cookies/login nempel antar panggilan
```

Catatan: kalau `BROWSE_PROFILE` dipakai DAN halaman ketahan Cloudflare,
context dibuat ulang dengan UA cfsolve (sudah ditangani di script).

Khusus X/Twitter: kalau ada file `data/files/cookie-x.txt` (JSON
`{ "cookies": [...] }` hasil export cookies), cookie-nya otomatis
disuntikkan pas buka x.com/twitter.com. **File ini TIDAK BOLEH masuk
git** — sudah ada di `.gitignore`. Jangan commit cookie/login siapa pun.

## Env (semua opsional)

| Env | Guna | Default |
| --- | --- | --- |
| `BROWSE_CHROMIUM_PATH` | Binary chromium/chrome lain | Playwright bawaan |
| `BROWSE_PROFILE` | Folder profil persisten | — (tanpa profil) |
| `BROWSE_UA` | User-Agent desktop sendiri | Chrome/128 Windows |
| `CFSOLVE_BIN` | Binary cfsolve | `/home/container/files/cfsolve-repo/target/release/challenge` |
| `CFSOLVE_PROFILE` | Profil fingerprint cfsolve | `.../profiles/safari-26-ios.json` |
| `CFSOLVE_UA` | UA pasca-bypass | Safari iOS 26 |

## Batas yang diketahui

- Chromium + `node_modules/` tidak ikut backup git/repo (by design).
- Screenshot menumpuk di `data/files/` — bersihkan manual kalau sudah
  banyak (tiap shot ~60–200 KB).
- `type` cuma isi field + Enter; belum ada scroll/hover khusus.

## Efisiensi (foto tidak menumpuk, halaman putih ketahuan)

- **Rotasi otomatis:** tiap shot menyimpan PNG baru lalu menghapus
  `browse-<waktu>.png` lama, menyisakan 20 terbaru (atur lewat
  `BROWSE_KEEP=30`). File bernama lain (mis. `test-awal.png` atau
  nama custom dari agent) tidak disentuh — itu file kerja agent,
  bukan sampah otomatis.
- **Mode teks saja:** `BROWSE_NO_PNG=1` — tidak menyimpan screenshot
  sama sekali (buat tugas yang cuma butuh teks). Rotasi tetap jalan.
- **Smart wait:** tidak ada lagi tidur buta 3 detik — script polling
  sampai halaman punya isi (teks/gambar), max 10 detik. Halaman
  lambat / JS-berat tidak kefoto putih.
- **Peringatan halaman kosong:** kalau halaman tetap kosong setelah
  tunggu max, output mencetak `PERINGATAN: halaman tampak kosong...`
  supaya agent tahu itu belum muat / kena anti-bot — bukan halaman
  beneran kosong. Jangan langsung percaya screenshot putih.
- **Deteksi Cloudflare** diperluas: judul/teks/iframe challenge
  (termasuk "Checking your browser", "Verify you are human").
