/**
 * contexts/catalog/service.ts — Business logic for public catalog, dashboard, and share view
 *
 * Other contexts and surfaces import ONLY from index.ts.
 */
import { requireAdmin } from '../identity';
import { safeError } from '../../_lib/kernel/errors';
import {
  hasBackend, demo, normalizeWa, pick, toText, mapCandidate, stripRaw,
  loadCandidatesUnik, loadSchedules, loadTugas, loadWaTemplates, loadPublicBase,
  findFormsByWaList, findFormsByWa, findFormsLight, findForms, parseDocs,
  findCandidateByWaFiltered, findCandidates, attachApplications, attachBerkasBio,
  findJobByCodeFiltered, findCandidatesByJobFiltered, listStorageFolder,
  BERKAS_COLUMNS, supabaseJson, docTypeOf, docAge, mapForm,
} from './repository';
import { MASTER_LIGHT_COLS, PEMBERKASAN_COLS } from '../../_lib/db/projections';

export async function handleGetAppData(payload: any[], sessionToken?: string) {
  const mode = (payload && payload[0]) || 'public';
  if (!hasBackend()) return demo.demoGetAppData(mode);

  try {
    let t: any = null;
    if (mode === 'admin' || mode === 'kandidat') {
      const role = mode === 'admin' ? 'admin' : 'kandidat';
      const session = await import('../../_lib/session');
      t = session.verifyToken(sessionToken || '');
      const waPayload = String((payload && payload[1]) || '').replace(/\D/g, '');
      const valid = t && t.role === role && (mode !== 'kandidat' || (t.wa || '') === waPayload || waPayload === '');
      if (!valid) {
        const pub0 = await loadPublicBase(mode);
        if (pub0.notFound) return pub0.base;
        return { success: true, activeTheme: '', sessionInvalid: true, jobs: pub0.jobs, dropdowns: pub0.dropdowns, assets: pub0.assets, pengumuman: pub0.pengumuman };
      }
    }

    const w = mode === 'kandidat' ? normalizeWa(t.wa || '') : '';
    const jobs: Promise<any>[] = [];
    if (mode === 'admin') jobs.push(loadCandidatesUnik('', { page: 1, pageSize: 50 }));
    if (mode === 'kandidat') {
      jobs.push(findCandidateByWaFiltered(w), findFormsByWa(w), loadSchedules());
    }
    const results = await Promise.all([loadPublicBase(mode), ...jobs]);
    const pub = results[0];
    if (pub.notFound) return pub.base;

    const result: Record<string, any> = {
      success: true, activeTheme: '', sessionInvalid: false,
      jobs: pub.jobs, dropdowns: pub.dropdowns, assets: pub.assets, pengumuman: pub.pengumuman,
    };

    if (mode === 'admin') {
      const { rows: candRows, total: candidatesTotal } = results[1];
      result.dbJobs = pub.jobs;
      result.candidates = stripRaw(candRows.map(mapCandidate));
      const [berkas, schedules, tugas, allForms, waTemplates] = await Promise.all([
        attachBerkasBio(result.candidates),
        loadSchedules(), loadTugas(),
        findFormsLight().then((r) => (r === undefined ? findForms() : r)),
        loadWaTemplates(),
      ]);
      result.candidates = berkas;
      attachApplications(result.candidates, allForms);
      result.candidatesTotal = candidatesTotal;
      result.schedules = schedules;
      result.tugas = tugas;
      result.formInbox = allForms.map(mapForm);
      result.waTemplates = waTemplates;
      result.kandidatRiwayat = [];
    }

    if (mode === 'kandidat') {
      let row = results[1];
      if (row === undefined) {
        const foundCand = await findCandidates();
        row = foundCand.rows.find((r) => normalizeWa(pick(r, ['no_wa', 'wa', 'whatsapp', 'telepon', 'phone', 'no_hp']) || '') === w) || null;
      }
      result.dbJobs = pub.jobs;
      const myCands = row ? stripRaw([mapCandidate(row)]) : [];
      await attachBerkasBio(myCands);
      let myForms = results[2];
      if (myForms === undefined) myForms = await findForms();
      attachApplications(myCands, myForms);
      result.candidates = myCands;
      result.kandidatRiwayat = (myCands[0] && myCands[0].applications) || [];
      try {
        const allSched = results[3];
        const myJobCodes = new Set(
          (Array.isArray(myForms) ? myForms : []).map((f) => String(pick(f, ['code_job', 'code']) || '').toUpperCase()).filter(Boolean),
        );
        result.mySchedules = allSched.filter((s: any) => {
          const kandidatList = String(s.kandidat || '').split(/[\n,;]+/).map((x) => normalizeWa(x)).filter(Boolean);
          const inDaftar = kandidatList.length > 0 && kandidatList.some((k) => k === w || k.endsWith(w.slice(-9)));
          const lokerSama = String(s.idLoker || '').toUpperCase() !== '-' && myJobCodes.has(String(s.idLoker || '').toUpperCase());
          return inDaftar || lokerSama;
        }).map((s: any) => ({
          agenda: s.namaAgenda || '', status: s.status || 'AKTIF', waktu: s.waktu || '',
          lokasi: s.link && s.link !== '-' ? s.link : '-', link: s.link && s.link !== '-' ? s.link : '',
        }));
      } catch { result.mySchedules = []; }
    }
    return result;
  } catch (e: any) {
    return { success: false, message: safeError('Gagal memuat data dari Supabase.', e) };
  }
}

export async function handleGetMonthlyReport(payload: any[], sessionToken?: string) {
  const guard = requireAdmin(sessionToken || '');
  if (guard.error) return guard.error;
  try {
    const { rows: candRows } = await loadCandidatesUnik('', { page: 1, pageSize: 5000 });
    const cands = candRows.map(mapCandidate);
    const byLoker: Record<string, any> = {};
    for (const c of cands) {
      const loker = String(c.idLoker || 'UNKNOWN').trim();
      if (!byLoker[loker]) byLoker[loker] = { total: 0, tahapan: {}, status: {} };
      byLoker[loker].total++;
      const tahap = String(c.tahapan || '-').trim() || '-';
      byLoker[loker].tahapan[tahap] = (byLoker[loker].tahapan[tahap] || 0) + 1;
      const stat = String(c.status || '-').trim() || '-';
      byLoker[loker].status[stat] = (byLoker[loker].status[stat] || 0) + 1;
    }
    const report = Object.entries(byLoker).sort((a, b) => b[1].total - a[1].total).map(([loker, data]) => ({ loker, ...data }));
    return { success: true, report, totalCandidates: cands.length, generatedAt: new Date().toISOString() };
  } catch (e: any) {
    return { success: false, error: safeError('Gagal generate laporan.', e) };
  }
}

// The TSK viewer is public by job code — exactly as legacy. Legacy
// `share-data.js` read only `?job=` and called `handleShareData(job)`; there was
// no account, no login and no token anywhere in that flow. The Astro rebuild
// briefly added a per-job token gate; the owner removed it on 2026-09-13.
//
// This is a deliberate trade-off, not an oversight, so it is worth stating what
// it costs. A job code is short and human-readable (`TG658`, `SSW-KAIGO`) and is
// printed in the admin panel and sent over WhatsApp, so it CAN be enumerated:
// someone who guesses a code sees that job's candidate list. Three things bound
// the exposure:
//   · only candidates already attached to the requested job are ever returned;
//   · `dokumen_share` below decides which document TYPES a viewer may see, and
//     is set per job by an admin (default CV/JFT/SSW);
//   · the list is what is protected here — the files themselves live on a public
//     bucket, so a leaked document URL was never protected by this gate anyway.
export async function handleShareData(jobCode: string) {
  const code = String(jobCode || '').trim();
  if (!code) return { error: 'Kode job tidak ditemukan.' };
  try {
    let jobRow: any = await findJobByCodeFiltered(code);
    if (jobRow === undefined) {
      const { findJobs, pick, toText } = await import('./repository');
      const found = await findJobs();
      jobRow = found.rows.find((r) => String(pick(r, ['code_job', 'code']) || '') === code) || null;
    }
    if (!jobRow) return { error: 'Kode job tidak ditemukan: ' + code };
    const name = toText(pick(jobRow, ['pekerjaan', 'nama_pekerjaan', 'judul', 'title']));
    let candRows: any[] | undefined = await findCandidatesByJobFiltered(code);
    if (candRows === undefined) {
      const cands = await findCandidates();
      candRows = cands.rows;
    }
    const rows = (Array.isArray(candRows) ? candRows : []).filter((r) =>
      String(pick(r, ['id_loker_pilihan', 'id_loker']) || '').split(',').map((s) => s.trim()).includes(code),
    );
    const mapped = rows.map(mapCandidate);

    const { normalizeWa, supabaseUrl } = await import('./repository');
    const storageBase = supabaseUrl().replace(/\/$/, '');
    const pubBase = storageBase + '/storage/v1/object/public/asj-files/';
    const waList = mapped.map((c) => normalizeWa(String(c.wa || ''))).filter(Boolean);
    let forms = await findFormsByWaList(waList);
    if (forms === undefined) forms = await findForms();
    const byWa = new Map();
    const formsByWa = new Map();
    for (const f of forms) {
      const fnWa = normalizeWa(String(f.no_wa || f.wa || f.whatsapp || ''));
      if (!fnWa) continue;
      if (!byWa.has(fnWa)) byWa.set(fnWa, []);
      for (const d of parseDocs(toText(f.keterangan))) byWa.get(fnWa).push(d);
      if (!formsByWa.has(fnWa)) formsByWa.set(fnWa, []);
      formsByWa.get(fnWa).push(f);
    }

    let pemberkasanRows: any[] = [];
    let masterRows: any[] = [];
    try {
      const [pRes, mRes] = await Promise.all([
        waList.length > 0 && waList.length <= 150
          ? supabaseJson('GET', 'pemberkasan_checklist', { query: { select: PEMBERKASAN_COLS, wa: 'in.(' + waList.join(',') + ')' } }).catch(() => null)
          : Promise.resolve(null),
        waList.length > 0 && waList.length <= 150
          ? supabaseJson('GET', 'master_database_candidate', { query: { select: MASTER_LIGHT_COLS, no_wa: 'in.(' + waList.join(',') + ')' } }).catch(() => null)
          : Promise.resolve(null),
      ]);
      pemberkasanRows = Array.isArray(pRes) ? pRes : [];
      masterRows = Array.isArray(mRes) ? mRes : [];
    } catch { /* non-fatal */ }

    const pByWa = new Map();
    for (const r of pemberkasanRows) pByWa.set(normalizeWa(String(r.wa || '')), r);
    const mByWa = new Map();
    for (const r of masterRows) mByWa.set(normalizeWa(String(r.no_wa || r.wa || '')), r);

    const rawShareDocs = toText(pick(jobRow, ['dokumen_share', 'dokumenshare'])).toUpperCase();
    const allowedDocTypes = new Set(rawShareDocs ? rawShareDocs.split(/[,;]+/).map((s) => s.trim()).filter(Boolean) : ['CV', 'JFT', 'SSW']);
    const showAllDocs = allowedDocTypes.has('ALL');

    const folderResults = await Promise.all(mapped.map((c) => {
      const folder = 'master/' + String(c.nama || '').toUpperCase().replace(/\s+/g, '_') + '/';
      return listStorageFolder(folder).catch(() => []);
    }));
    const folderNamesMap = new Map<string, string[]>();
    mapped.forEach((c, i) => {
      const folder = 'master/' + String(c.nama || '').toUpperCase().replace(/\s+/g, '_') + '/';
      folderNamesMap.set(folder, folderResults[i] || []);
    });

    const candidates = [];
    for (const c of mapped) {
      const folder = 'master/' + String(c.nama || '').toUpperCase().replace(/\s+/g, '_') + '/';
      const names = folderNamesMap.get(folder) || [];
      const mainBasenames = [c.pasPhoto, c.fileCv, c.jft, c.ssw].map((u) => { try { return decodeURIComponent(String(u || '').split('/').pop() || ''); } catch { return String(u || '').split('/').pop() || ''; } }).filter(Boolean);
      const mainTypes = new Set(['CV', 'JFT', 'SSW', 'PHOTO']);
      for (const b of mainBasenames) { const t = docTypeOf(b); if (t) mainTypes.add(t); }
      const byType = new Map();
      for (const n of names) {
        if (mainBasenames.indexOf(n) !== -1) continue;
        const t = docTypeOf(n);
        if (mainTypes.has(t)) continue;
        const prev = byType.get(t);
        if (!prev || docAge(n) > docAge(prev.name)) byType.set(t, { name: n, url: pubBase + folder + encodeURIComponent(n) });
      }
      const rawExtraDocs = [...byType.values()];
      const extraDocs = showAllDocs ? rawExtraDocs : rawExtraDocs.filter((d) => { const t = docTypeOf(d.name); return allowedDocTypes.has(t); });
      const formDocs = (byWa.get(normalizeWa(String(c.wa || ''))) || []).filter((d: any) => showAllDocs || allowedDocTypes.has(docTypeOf(d.name)));
      const seenUrl = new Set(extraDocs.map((d: any) => d.url));
      for (const d of formDocs) { if (!seenUrl.has(String(d.url))) { seenUrl.add(String(d.url)); extraDocs.push(d); } }
      const pRow = pByWa.get(normalizeWa(String(c.wa || '')));
      const mRow = mByWa.get(normalizeWa(String(c.wa || '')));
      for (const src of [pRow, mRow].filter(Boolean)) {
        for (const [key, cols] of BERKAS_COLUMNS) {
          let v = '';
          for (const col of cols) { if (src[col]) { v = String(src[col]); break; } }
          if (v && v !== '-' && v.startsWith('http') && !seenUrl.has(v)) {
            const label = String(key).toUpperCase();
            if (!showAllDocs && !allowedDocTypes.has(label)) continue;
            seenUrl.add(v);
            extraDocs.push({ name: label, url: v });
          }
        }
      }
      let pasPhoto = c.pasPhoto;
      if (!pasPhoto || pasPhoto === '-') { const photoFile = names.find((n) => docTypeOf(n) === 'PHOTO'); if (photoFile) pasPhoto = pubBase + folder + encodeURIComponent(photoFile); }
      let finalCv = c.fileCv, finalJft = c.jft, finalSsw = c.ssw;
      const cWa = normalizeWa(String(c.wa || ''));
      const formRows = formsByWa.get(cWa) || [];
      const pickFirstForm = (fields: string[]) => { for (const r of formRows) { const v = toText(pick(r, fields)); if (v && v !== '-' && v !== 'null') return v; } return null; };
      if (!pasPhoto || pasPhoto === '-') { const f = pickFirstForm(['pas_photo', 'pasPhoto', 'photo']); if (f) pasPhoto = f; }
      if (!finalJft || finalJft === '-') { const f = pickFirstForm(['jft', 'jft_url']); if (f) finalJft = f; }
      if (!finalSsw || finalSsw === '-') { const f = pickFirstForm(['ssw', 'ssw_url']); if (f) finalSsw = f; }
      if (!finalCv || finalCv === '-') { const f = pickFirstForm(['file_cv', 'cv', 'cv_url']); if (f) finalCv = f; }
      for (let i = extraDocs.length - 1; i >= 0; i--) {
        const doc = extraDocs[i]; const t = docTypeOf(doc.name);
        if (t === 'CV' && (!finalCv || finalCv === '-')) { finalCv = doc.url; extraDocs.splice(i, 1); }
        else if (t === 'JFT' && (!finalJft || finalJft === '-')) { finalJft = doc.url; extraDocs.splice(i, 1); }
        else if (t === 'SSW' && (!finalSsw || finalSsw === '-')) { finalSsw = doc.url; extraDocs.splice(i, 1); }
      }
      candidates.push({ id_kandidat: c.idKandidat, no_wa: c.wa, nama_lengkap: c.nama, gender: c.gender, usia: c.usia, tb: c.tb, bb: c.bb, pas_photo: pasPhoto, file_cv: finalCv, jft: finalJft, ssw: finalSsw, nilai_jft_text: c.jftText, bidang_ssw_text: c.sswText, extraDocs });
    }
    return { job: { code, name, tsk: toText(pick(jobRow, ['tsk', 'pengurus'])) }, candidates };
  } catch (e: any) {
    return { error: safeError('Gagal memuat data share.', e) };
  }
}
