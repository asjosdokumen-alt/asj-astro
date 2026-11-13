// Lihat plate Ishihara seperti yang dilihat kandidat + UKUR kesetiaannya:
//   IoU  = tumpang-tindih himpunan titik "angka" dengan area glyph (bobot luas)
//   presisi/recall, jumlah titik, dan cakupan lingkaran.
// Dipakai untuk menilai "jelas / tidak" dengan angka, bukan selera.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const bundle = 'F:/tmp/plate-bundle.js';
const OUT = process.argv[2] || 'F:/tmp/plate-12.png';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1240, height: 900 }, deviceScaleFactor: 2 });
await page.setContent(`<!doctype html><meta charset="utf-8">
<style>
  body{margin:0;background:#0b1220;font:600 11px system-ui;color:#e2e8f0}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:10px}
  figure{margin:0;background:#fff;border-radius:8px;padding:6px}
  figcaption{padding:4px 2px 0;color:#334155;font:700 11px system-ui}
  canvas{display:block}
</style>
<div class="grid" id="g"></div>`);
await page.addScriptTag({ path: bundle });

const hasil = await page.evaluate(() => {
  const g = document.getElementById('g');
  const { gambarPlate, PLATE_ISHIHARA, susunTitik, pembacaKoverPlate, UKURAN_PLATE, RADIUS_PLATE } = window.__plate;
  const out = [];
  for (const p of PLATE_ISHIHARA) {
    const fig = document.createElement('figure');
    const c = document.createElement('canvas');
    c.width = UKURAN_PLATE;
    c.height = UKURAN_PLATE;
    const t0 = performance.now();
    gambarPlate(c, p);
    const ms = +(performance.now() - t0).toFixed(1);
    fig.appendChild(c);
    const cap = document.createElement('figcaption');
    cap.textContent = `#${p.no} ${p.kategori} → ${p.normal}${p.defisiensi ? ' / ' + p.defisiensi : ''}`;
    fig.appendChild(cap);
    g.appendChild(fig);

    // ── ukur kesetiaan bentuk ──────────────────────────────────────────────
    const baca = pembacaKoverPlate(p, UKURAN_PLATE);
    const titik = susunTitik(p, baca, { ukuran: UKURAN_PLATE, radius: RADIUS_PLATE });
    let tp = 0;
    let fp = 0;
    let fn = 0;
    let luas = 0;
    for (const t of titik) {
      const [kiri, kanan] = baca(t.x, t.y, t.r);
      const benar = Math.max(kiri, kanan) >= 0.5;
      const tebak = t.jenis !== 'latar';
      const a = Math.PI * t.r * t.r;
      luas += a;
      if (benar && tebak) tp += a;
      else if (!benar && tebak) fp += a;
      else if (benar && !tebak) fn += a;
    }
    out.push({
      no: p.no,
      normal: p.normal,
      titik: titik.length,
      iou: +(tp / (tp + fp + fn)).toFixed(3),
      presisi: +(tp / (tp + fp || 1)).toFixed(3),
      recall: +(tp / (tp + fn || 1)).toFixed(3),
      isi: +(luas / (Math.PI * RADIUS_PLATE * RADIUS_PLATE)).toFixed(2),
      ms,
    });
  }
  return out;
});

await page.screenshot({ path: OUT, fullPage: true });
await browser.close();
writeFileSync('F:/tmp/plate-info.json', JSON.stringify(hasil, null, 1));
for (const r of hasil) {
  console.log(
    `#${String(r.no).padStart(2)} ${String(r.normal).padStart(2)}  titik ${String(r.titik).padStart(4)}  IoU ${r.iou}  P ${r.presisi}  R ${r.recall}  isi ${r.isi}  ${r.ms} ms`,
  );
}
console.log('→', OUT);
