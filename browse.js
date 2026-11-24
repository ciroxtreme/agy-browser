#!/usr/bin/env node
'use strict';
// browse.js — browser sekali-jalan buat agent Antigravity
// (repo: ciroxtreme/agy-browser — lahir dari eksperimen tele-console
//  24 Nov 2026: kasih agent browser kayak Muse).
//
// CARA PAKAI (dijalankan dari root repo ini):
//   node browse.js shot <url> [out.png]
//       -> buka halaman, cetak judul + URL akhir + teks halaman,
//          simpan screenshot PNG (default: data/files/browse-<waktu>.png).
//   node browse.js click <url> <selector> [out.png]
//       -> buka halaman, klik elemen (selector CSS atau text=...),
//          lalu cetak teks + screenshot keadaan sesudah klik.
//   node browse.js type <url> <selector> <teks> [out.png]
//       -> buka halaman, isi field lalu tekan Enter (mis. kotak cari),
//          lalu cetak teks + screenshot.
//
// DUET CFSOLVE (tambahan agent, 24 Nov 2026 ~22:54 WIB):
//   Kalau halaman ketahan Cloudflare ("Just a moment..."), script
//   otomatis jalanin cfsolve buat ambil cookie cf_clearance, lalu
//   muat ulang halaman dengan UA profil cfsolve. Tanpa cfsolve pun
//   script tetap jalan (Cloudflare-nya yang mungkin nahan).
//
// LOOP BUAT AGENT (multimodal: dia bisa baca PNG):
//   shot -> baca PNG-nya (file gambar) -> putuskan klik/ketik apa ->
//   click/type -> baca PNG baru -> ulang sampai tugas selesai.
//   Viewport TETAP 1280x720 supaya koordinat klik dari screenshot
//   selalu cocok. Buat baca isi halaman pakai TEKS (murah + presisi);
//   screenshot cuma pas butuh liat tampilan.
//
// SYARAT: Playwright + Chromium sudah terpasang di server
//   (bash setup.sh — atau manual: npm install && TMPDIR=... npx
//    playwright install chromium; lihat README soal jebakan /tmp).
//   ENV (opsional):
//     BROWSE_CHROMIUM_PATH = path ke binary chromium/chrome lain
//       (mis. hasil install sistem / build ARM).
//     BROWSE_PROFILE = folder profil browser yang dipakai ulang
//       antar panggilan (cookies/login nempel di sana).
//     BROWSE_UA = User-Agent desktop sendiri (default: Chrome/128 Win).
//     CFSOLVE_BIN / CFSOLVE_PROFILE / CFSOLVE_UA = lokasi cfsolve +
//       profil fingerprint + UA-nya (default: jalur tele-console).
//
// KELUARAN ke stdout:
//   TITLE: ... | URL: ... | PNG: <path relatif dari root>
//   ---TEKS--- lalu isi teks halaman (maks 8000 karakter pertama).
//   Error ke stderr + exit 1.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ROOT: folder repo ini kalau browse.js duduk di root (ada package.json
// di sebelahnya); kalau duduk di tools/ (tele-console), naik satu level.
const ROOT = fs.existsSync(path.join(__dirname, 'package.json'))
  ? path.resolve(__dirname)
  : path.resolve(__dirname, '..');
const FILES_DIR = path.join(ROOT, 'data', 'files');
const VIEWPORT = { width: 1280, height: 720 };
const MAX_TEKS = 8000;

// cfsolve: bisa di-override lewat env pas pindah VPS (lihat README).
const CFSOLVE_BIN = process.env.CFSOLVE_BIN || '/home/container/files/cfsolve-repo/target/release/challenge';
const CFSOLVE_PROFILE = process.env.CFSOLVE_PROFILE || '/home/container/files/cfsolve-repo/profiles/safari-26-ios.json';
const CFSOLVE_UA = process.env.CFSOLVE_UA || 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.3 Mobile/15E148 Safari/604.1';

function resolveCfClearance(targetUrl) {
  if (!fs.existsSync(CFSOLVE_BIN) || !fs.existsSync(CFSOLVE_PROFILE)) return null;
  const outDir = '/tmp/cf_browse_' + Date.now();
  try {
    const cmd = `${CFSOLVE_BIN} --page "${targetUrl}" ${outDir} --solve --fingerprint ${CFSOLVE_PROFILE}`;
    const out = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 });
    const match = out.match(/cf_clearance=([^\s;]+)/);
    return match ? match[1] : null;
  } catch (e) {
    const combined = (e.stdout || '') + '\n' + (e.stderr || '');
    const match = combined.match(/cf_clearance=([^\s;]+)/);
    return match ? match[1] : null;
  } finally {
    try { fs.rmSync(outDir, { recursive: true, force: true }); } catch (_) {}
  }
}

function gagal(pesan) {
  console.error('browse: ' + pesan);
  process.exit(1);
}

function namaPng() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return 'browse-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
    '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '.png';
}

function jalurPng(arg) {
  if (!arg) return path.join(FILES_DIR, namaPng());
  return path.isAbsolute(arg) ? arg : path.join(ROOT, arg);
}

async function main() {
  const args = process.argv.slice(2);
  const sub = (args[0] || '').trim();
  if (!sub || !['shot', 'click', 'type'].includes(sub)) {
    console.error('Pakai: node browse.js shot <url> [out.png]');
    console.error('       node browse.js click <url> <selector> [out.png]');
    console.error('       node browse.js type <url> <selector> <teks> [out.png]');
    process.exit(1);
  }
  const url = args[1];
  if (!url || !/^https?:\/\//i.test(url)) {
    gagal('URL harus http(s) — contoh: https://example.com');
  }
  const pngArg = sub === 'shot' ? args[2] : sub === 'click' ? args[3] : args[4];
  if (sub === 'click' && !args[2]) gagal('click butuh selector — contoh: text=Cari atau #tombol');
  if (sub === 'type' && (!args[2] || args[3] === undefined)) {
    gagal('type butuh selector + teks — contoh: input[name=q] kucing');
  }

  let pw;
  try {
    pw = require('playwright');
  } catch (e) {
    gagal('playwright belum terpasang. Jalankan dulu: npm install playwright && npx playwright install chromium');
  }

  const launchArgs = [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled'
  ];
  const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
  const DEFAULT_HEADERS = {
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Ch-Ua': '"Chromium";v="128", "Not;A=Brand";v="24"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"'
  };

  let browser = null;
  let context = null;
  try {
    if (process.env.BROWSE_PROFILE) {
      context = await pw.chromium.launchPersistentContext(
        path.resolve(ROOT, process.env.BROWSE_PROFILE),
        {
          headless: true,
          viewport: VIEWPORT,
          args: launchArgs,
          userAgent: process.env.BROWSE_UA || DEFAULT_UA,
          extraHTTPHeaders: DEFAULT_HEADERS
        }
      );
    } else {
      const launchOpts = { headless: true, args: launchArgs };
      if (process.env.BROWSE_CHROMIUM_PATH) {
        launchOpts.executablePath = process.env.BROWSE_CHROMIUM_PATH;
      }
      browser = await pw.chromium.launch(launchOpts);
      context = await browser.newContext({
        viewport: VIEWPORT,
        userAgent: process.env.BROWSE_UA || DEFAULT_UA,
        extraHTTPHeaders: DEFAULT_HEADERS
      });
    }

    // Auto-inject cookies untuk X.com jika cookie-x.txt tersedia
    const xCookiePath = path.join(FILES_DIR, 'cookie-x.txt');
    if (/x\.com|twitter\.com/i.test(url) && fs.existsSync(xCookiePath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(xCookiePath, 'utf8'));
        const cookies = (raw.cookies || []).map(c => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path || '/',
          secure: c.secure !== undefined ? c.secure : true,
          httpOnly: c.httpOnly !== undefined ? c.httpOnly : false,
          ...(c.expiresDate ? { expires: Math.floor(c.expiresDate / 1000) } : {})
        }));
        await context.addCookies(cookies);
      } catch (_) {}
    }

    let page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    let initialTitle = await page.title().catch(() => '');
    let initialText = await page.evaluate(() => (document.body ? document.body.innerText : '')).catch(() => '');

    // Deteksi Cloudflare Challenge otomatis
    const isCloudflare = initialTitle.includes('Just a moment...') ||
      initialTitle.includes('Attention Required') ||
      initialText.includes('Performing security verification') ||
      initialText.includes('challenges.cloudflare.com');

    if (isCloudflare) {
      console.error('browse: Terdeteksi Cloudflare Challenge! Menjalankan cfsolve engine...');
      const clearance = resolveCfClearance(url);
      if (clearance) {
        console.error('browse: Berhasil mendapatkan cf_clearance, menyuntikkan cookie & memuat ulang...');
        const parsedUrl = new URL(url);
        if (context) await context.close().catch(() => {});
        if (process.env.BROWSE_PROFILE) {
          // Profil persisten: browser == null, jadi context harus
          // dibuat ulang lewat launchPersistentContext (bukan browser).
          context = await pw.chromium.launchPersistentContext(
            path.resolve(ROOT, process.env.BROWSE_PROFILE),
            {
              headless: true,
              viewport: VIEWPORT,
              args: launchArgs,
              userAgent: CFSOLVE_UA
            }
          );
        } else {
          context = await browser.newContext({
            viewport: VIEWPORT,
            userAgent: CFSOLVE_UA
          });
        }
        await context.addCookies([{
          name: 'cf_clearance',
          value: clearance,
          domain: '.' + parsedUrl.hostname,
          path: '/'
        }]);
        page = await context.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);
      } else {
        console.error('browse: Peringatan: cfsolve tidak mengembalikan cf_clearance.');
      }
    }

    if (sub === 'click') {
      await page.click(args[2], { timeout: 10000 });
      await page.waitForTimeout(1500);
    } else if (sub === 'type') {
      await page.fill(args[2], args[3], { timeout: 10000 });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
    }

    const title = await page.title().catch(() => '');
    const finalUrl = page.url();
    let teks = await page.evaluate(() => (document.body ? document.body.innerText : ''));
    teks = (teks || '').replace(/\n{3,}/g, '\n\n').trim();
    const dipotong = teks.length > MAX_TEKS;
    if (dipotong) teks = teks.slice(0, MAX_TEKS);

    const pngPath = jalurPng(pngArg);
    fs.mkdirSync(path.dirname(pngPath), { recursive: true });
    await page.screenshot({ path: pngPath });

    console.log('TITLE: ' + title);
    console.log('URL: ' + finalUrl);
    console.log('PNG: ' + path.relative(ROOT, pngPath));
    if (dipotong) console.log('TEKS: (dipotong, 8000 karakter pertama)');
    console.log('---TEKS---');
    console.log(teks);
  } catch (e) {
    gagal(e.message || String(e));
  } finally {
    try { if (context) await context.close(); } catch (e) { /* abaikan */ }
    try { if (browser) await browser.close(); } catch (e) { /* abaikan */ }
  }
}

main();
