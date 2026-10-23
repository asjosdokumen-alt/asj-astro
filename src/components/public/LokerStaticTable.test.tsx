/**
 * LokerStaticTable.test.tsx — the server-rendered job table.
 *
 * WHY THIS EXISTS
 * ---------------
 * The table moved out of `LokerStaticList.astro` into a `.tsx` primitive because
 * the indexer resolves `.astro` template interpolations against the frontmatter
 * scope only (`{jobs.map((j) => …)}` produced 7 unresolved refs — see
 * `indexer/src/build.test.ts > reports occurrences, unresolved, and stage
 * timings`). Moving it changed WHICH code produces the crawler-visible HTML, and
 * nothing else in the repo checks that HTML: the indexer sees symbols, not
 * output, and a build with no database access renders an empty table (the
 * fetch's failure is deliberately non-fatal), so `dist/` cannot prove it either.
 *
 * The three properties pinned here are the ones the move could have broken:
 *   1. one `<tr>` per job, seven `<td>` per row — the rows really render;
 *   2. every `<th>` carries `data-lang`, which is the ONLY way the JP toggle can
 *      reach HTML that is frozen at build time;
 *   3. values coming from the database are escaped. This is the reason the
 *      component exists instead of a `set:html` string: a job title typed into
 *      the admin panel must never become markup on a public page.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'preact-render-to-string';
import LokerStaticTable, { type LokerStaticRow } from './LokerStaticTable';

const JOBS: LokerStaticRow[] = [
  {
    code: 'J-001',
    pekerjaan: 'Kaigo',
    kategori: 'Perawatan',
    lokasi: 'Tokyo',
    gender: 'P',
    kuota: '5',
    status: 'Aktif',
  },
  {
    code: 'J-002',
    pekerjaan: 'Kensetsu',
    kategori: 'Konstruksi',
    lokasi: 'Osaka',
    gender: 'L',
    kuota: '3',
    status: 'Aktif',
  },
];

describe('LokerStaticTable', () => {
  it('merender satu <tr> per lowongan, tujuh kolom per baris', () => {
    const html = render(<LokerStaticTable jobs={JOBS} />);
    // header + satu baris per lowongan
    expect(html.match(/<tr>/g)?.length).toBe(1 + JOBS.length);
    expect(html.match(/<td>/g)?.length).toBe(JOBS.length * 7);
    expect(html).toContain('J-001');
    expect(html).toContain('Osaka');
  });

  it('setiap <th> membawa data-lang supaya toggle JP bisa menjangkaunya', () => {
    const html = render(<LokerStaticTable jobs={JOBS} />);
    // HTML ini dibekukan saat build; `t()` akan membakar bahasa build, jadi
    // `data-lang` adalah satu-satunya mekanisme yang bisa mengubahnya.
    for (const key of ['code', 'job', 'category', 'location', 'gender', 'quota', 'status']) {
      expect(html).toContain(`data-lang="loker_static.${key}"`);
    }
  });

  it('nilai dari database di-escape, tidak pernah menjadi markup', () => {
    // Alasan komponen ini ada (bukan string + set:html): judul lowongan diisi
    // lewat panel admin dan tampil di halaman publik.
    const hostile: LokerStaticRow = {
      ...JOBS[0],
      pekerjaan: '<img src=x onerror=alert(1)>',
      lokasi: 'Tokyo & "Osaka"',
    };
    const html = render(<LokerStaticTable jobs={[hostile]} />);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).toContain('&amp;');
  });

  it('daftar kosong tetap menghasilkan tabel dengan header saja', () => {
    // `LokerStaticList.astro` tidak merender apa pun saat jobs kosong, tapi
    // komponen ini tidak boleh melempar kalau dipanggil dengan array kosong.
    const html = render(<LokerStaticTable jobs={[]} />);
    expect(html.match(/<td>/g)).toBeNull();
    expect(html).toContain('loker_static.code');
  });
});
