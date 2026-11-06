/**
 * surfaces/job-docs.ts — entry KHUSUS unduhan ZIP dokumen per loker.
 *
 * KENAPA DIPISAH
 * --------------
 * `downloadJobDocs` adalah satu-satunya action yang memakai `archiver`, dan
 * `archiver` menyeret rantai `readable-stream`/`compress-commons`/`zip-stream`
 * (terukur 2026-11-06: ~70 KB dari entry `files.js`). Action ini dipakai
 * admin sesekali, sementara `files.js` melayani setiap unggahan kandidat —
 * membayar ZIP di setiap permintaan formulir adalah harga yang salah.
 *
 * Karena `surfaces/docs.ts` mengimpor `* as documents`, satu baris
 * `documents.handleDownloadJobDocs` di sana cukup untuk menarik seluruh
 * `contexts/documents/download.ts` (beserta `archiver`) ke `files.js`.
 * Di sini impornya SEMPIT: satu modul, satu handler.
 */
import { handleDownloadJobDocs } from '../contexts/documents/download';

export const JOB_DOCS_ACTIONS: Record<
  string,
  (payload: unknown[], sessionToken?: string) => Promise<unknown>
> = {
  downloadJobDocs: (payload, sessionToken) => handleDownloadJobDocs(payload, sessionToken),
};
