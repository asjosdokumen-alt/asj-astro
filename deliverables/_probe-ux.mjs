/**
 * _probe-ux.mjs — dua perbaikan 2026-11-16 yang tidak bisa dibuktikan unit test:
 *   1. kursor kustom berhenti di atas kolom isian (tidak ada dua penunjuk),
 *   2. penulisan manual di modal jadi HURUF BESAR saat blur — termasuk nilai
 *      yang tersimpan, bukan hanya tampilan CSS.
 *
 * Halaman diuji: beranda (satu-satunya tempat kursor kustom aktif).
 */
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const srv = spawn(process.execPath, ['server.cjs'], { cwd: 'E:/astro', stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((r) => setTimeout(r, 1500));
const BASE = 'http://localhost:4321';

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const galat = [];
page.on('pageerror', (e) => galat.push(String(e).slice(0, 200)));

let gagal = 0;
const cek = (nama, ok, detail = '') => {
  if (!ok) gagal += 1;
  console.log(`${ok ? '✓' : '✗'} ${nama}${detail ? ` — ${detail}` : ''}`);
};

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);

/* Kursor kustom baru lahir setelah pointer bergerak pertama. */
await page.mouse.move(520, 420);
await page.waitForTimeout(200);
const kursorAda = await page.evaluate(() => Boolean(document.querySelector('.u-cursor.is-live')));
cek('kursor kustom aktif setelah pointer bergerak', kursorAda);

/* Kolom isian disuntik di tengah viewport, lalu pointer diarahkan ke sana. */
await page.evaluate(() => {
  const kotak = document.createElement('div');
  kotak.id = 'uji-kursor';
  kotak.style.cssText =
    'position:fixed;left:500px;top:380px;width:320px;height:60px;z-index:10001;background:#111';
  const input = document.createElement('input');
  input.id = 'uji-input';
  input.style.cssText = 'width:300px;height:44px;margin:8px';
  kotak.appendChild(input);
  document.body.appendChild(kotak);
});
const box = await page.locator('#uji-input').boundingBox();
await page.mouse.move(box.x + 40, box.y + 20);
await page.waitForTimeout(150);
const kelasInput = await page.evaluate(() => {
  const l = document.querySelector('.u-cursor');
  return { isInput: l?.classList.contains('is-input'), opacity: getComputedStyle(l).opacity };
});
cek('di atas kolom isian lapisan kustom berhenti', kelasInput.isInput && kelasInput.opacity === '0',
  `is-input=${kelasInput.isInput} opacity=${kelasInput.opacity}`);

await page.mouse.move(200, 700);
await page.waitForTimeout(150);
const lepasInput = await page.evaluate(() =>
  document.querySelector('.u-cursor')?.classList.contains('is-input'),
);
cek('kursor kustom kembali setelah meninggalkan kolom', lepasInput === false);

/* Huruf besar: dialog + input teks + password, isi huruf kecil, blur. */
await page.evaluate(() => {
  document.getElementById('uji-kursor')?.remove();
  const dlg = document.createElement('div');
  dlg.setAttribute('role', 'dialog');
  dlg.style.cssText = 'position:fixed;left:40px;top:40px;padding:12px;background:#111;z-index:10001';
  dlg.innerHTML =
    '<input id="uji-teks" type="text" /><input id="uji-pass" type="password" />';
  document.body.appendChild(dlg);
});
await page.fill('#uji-teks', 'budi santoso');
await page.fill('#uji-pass', 'rahasia123');
await page.locator('#uji-teks').blur();
await page.locator('#uji-pass').blur();
await page.waitForTimeout(150);
const nilai = await page.evaluate(() => ({
  teks: (document.getElementById('uji-teks')).value,
  pass: (document.getElementById('uji-pass')).value,
}));
cek('input teks di modal tersimpan HURUF BESAR', nilai.teks === 'BUDI SANTOSO', nilai.teks);
cek('password TIDAK diubah', nilai.pass === 'rahasia123', nilai.pass);

cek('tidak ada pageerror', galat.length === 0, galat.join(' | '));

await browser.close();
srv.kill();
console.log(gagal === 0 ? '\nSEMUA LULUS' : `\n${gagal} GAGAL`);
process.exitCode = gagal === 0 ? 0 : 1;
