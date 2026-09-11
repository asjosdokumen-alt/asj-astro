"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const XLSX = require("xlsx");

const ROOT_DIR = __dirname;
const LOADER_PATH = path.join(
  ROOT_DIR,
  "src",
  "lib",
  "cv-template-factory",
  "loaders",
  "tEMPLATE-loader.ts"
);
const ACTUAL_FILE = "C:\\Users\\k89\\Downloads\\YOGA AJI SAPUTRA_CV.xlsx";
const TEMPLATE_SHEET = "Template";

function loadExcelTemplateFromTypeScript() {
  const source = fs.readFileSync(LOADER_PATH, "utf8");
  const result = ts.transpileModule(source, {
    fileName: LOADER_PATH,
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  });
  const errors = (result.diagnostics || []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
  );
  assert.deepEqual(
    errors,
    [],
    `TypeScript transpilation failed: ${errors
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"))
      .join("; ")}`
  );

  const loaderModule = new Module(LOADER_PATH, module);
  loaderModule.filename = LOADER_PATH;
  loaderModule.paths = Module._nodeModulePaths(path.dirname(LOADER_PATH));
  loaderModule._compile(result.outputText, LOADER_PATH);
  assert.equal(
    typeof loaderModule.exports.loadExcelTemplate,
    "function",
    "loadExcelTemplate was not exported by the TypeScript loader"
  );
  return loaderModule.exports.loadExcelTemplate;
}

function createTemplateWorkbook() {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    [
      "{{identitas.nama_lengkap}}",
      "{{identitas.tempat_lahir}}",
      "{{identitas.tinggi_badan}}",
      "{{fisik.berat_badan}}",
      "{{pendidikan.tingkat}}",
      "{{pendidikan.sekolah}}",
      "{{pendidikan.jurusan}}",
      "{{pekerjaan.perusahaan}}",
      "{{pekerjaan.jabatan}}",
      "{{keluarga.hubungan}}",
      "{{keluarga.nama}}",
      "{{sertifikasi.jft}}",
    ],
  ]);
  worksheet["!cols"] = [
    { wch: 22 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 30 },
    { wch: 18 },
    { wch: 24 },
    { wch: 24 },
    { wch: 16 },
    { wch: 22 },
    { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(workbook, worksheet, TEMPLATE_SHEET);
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
  return {
    buffer,
    workbook: XLSX.read(buffer, { type: "buffer" }),
  };
}

function createMockCandidateData() {
  return {
    identitas: {
      nama_lengkap: "Yoga Aji Saputra",
      tempat_lahir: "Trenggalek",
      tinggi_badan: "169 cm",
      tanggal_lahir: "10 Mei 2000",
      katakana: "ヨガ アジ サプトラ",
    },
    fisik: {
      berat_badan: "55 kg",
      tangan_dominan: "Kanan",
    },
    medis: {
      alergi: "Tidak ada",
      riwayat_medis: "Tidak ada",
    },
    pendidikan: [
      {
        tingkat: "SMA",
        sekolah: "SMA Islam Watulimo",
        jurusan: "Ilmu Sosial",
        tahun: "2018 - 2021",
      },
      {
        tingkat: "SMP",
        sekolah: "SMP Gotong Royong 1 Watulimo",
        jurusan: "Umum",
        tahun: "2015 - 2018",
      },
    ],
    pekerjaan: [
      {
        perusahaan: "Tw. Mebel",
        jabatan: "Pembuatan mebel",
        tahun: "2020 - 2022",
      },
      {
        perusahaan: "Dgs teknik",
        jabatan: "Memperbaiki kendaraan",
        tahun: "2024 - 2025",
      },
    ],
    keluarga: [
      {
        hubungan: "Ayah",
        nama: "Tawiran",
        usia: "62 tahun",
        pekerjaan: "Pengrajin mebel",
      },
      {
        hubungan: "Ibu",
        nama: "Sulatmi",
        usia: "57 tahun",
        pekerjaan: "Ibu rumah tangga",
      },
    ],
    sertifikasi: {
      jft: "JFT-Basic",
      ssw: "Care Worker",
      bidang: "Care work",
    },
    wawancara: {
      motivasi_ke_jepang: "Bekerja dan belajar budaya Jepang",
    },
    kenalan_jepang: {},
    uploads: {},
    raw: {},
  };
}

function toArrayBuffer(buffer) {
  const arrayBuffer = buffer.buffer;
  if (
    buffer.byteOffset === 0 &&
    buffer.byteLength === arrayBuffer.byteLength
  ) {
    return arrayBuffer;
  }
  return arrayBuffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  );
}

function fileArrayBufferAdapter(buffer) {
  return {
    arrayBuffer: async () => toArrayBuffer(buffer),
  };
}

function worksheetRows(worksheet) {
  if (!worksheet["!ref"]) {
    return [];
  }
  const range = XLSX.utils.decode_range(worksheet["!ref"]);
  const rows = [];
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    const values = [];
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: col })];
      values.push(cell && cell.v !== undefined && cell.v !== null ? cell.v : "");
    }
    rows.push(values);
  }
  return rows;
}

function collectPlaceholders(workbook) {
  const placeholders = [];
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1");
    for (let row = range.s.r; row <= range.e.r; row += 1) {
      for (let col = range.s.c; col <= range.e.c; col += 1) {
        const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: col })];
        if (!cell || typeof cell.v !== "string") {
          continue;
        }
        for (const match of cell.v.matchAll(/\{\{([^}]+)\}\}/g)) {
          placeholders.push({
            sheetName,
            cell: XLSX.utils.encode_cell({ r: row, c: col }),
            key: match[1],
            text: cell.v,
          });
        }
      }
    }
  }
  return placeholders;
}

function formatCellValue(value) {
  if (value === "") {
    return "(empty)";
  }
  const text = String(value).replace(/\r?\n/g, " ");
  return text.length > 58 ? `${text.slice(0, 55)}...` : text;
}

function printWorkbook(title, workbook, maxRows = Number.POSITIVE_INFINITY) {
  console.log(`\n=== ${title} ===`);
  console.log(`Sheets: ${workbook.SheetNames.join(", ")}`);
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const rows = worksheetRows(worksheet).slice(0, maxRows);
    console.log(`\n[${sheetName}] range=${worksheet["!ref"] || "(empty)"}`);
    if (rows.length === 0) {
      console.log("(no rows)");
      continue;
    }
    const columnCount = Math.max(...rows.map((row) => row.length));
    const headers = Array.from({ length: columnCount }, (_, col) =>
      XLSX.utils.encode_col(col)
    );
    console.log(headers.join(" | "));
    rows.forEach((row, rowIndex) => {
      console.log(
        `Row ${rowIndex + 1}: ${row
          .map((value) => `[${formatCellValue(value)}]`)
          .join(" | ")}`
      );
    });
    const totalRows = worksheetRows(worksheet).length;
    if (totalRows > maxRows) {
      console.log(`... ${totalRows - maxRows} more rows`);
    }
  }
}

function hashFile(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function inspectActualWorkbook() {
  assert.ok(fs.existsSync(ACTUAL_FILE), `Actual CV file not found: ${ACTUAL_FILE}`);
  const hashBefore = hashFile(ACTUAL_FILE);
  const mtimeBefore = fs.statSync(ACTUAL_FILE).mtimeMs;
  const workbook = XLSX.readFile(ACTUAL_FILE, { cellDates: true });
  let totalNonEmptyCells = 0;
  let totalFormulas = 0;
  const placeholders = [];

  console.log("\n=== Actual CV structure ===");
  console.log(`File: ${ACTUAL_FILE}`);
  console.log(`Sheets: ${workbook.SheetNames.join(", ")}`);

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1");
    const rowCount = range.e.r - range.s.r + 1;
    const columnCount = range.e.c - range.s.c + 1;
    let nonEmptyCells = 0;
    let formulas = 0;

    for (let row = range.s.r; row <= range.e.r; row += 1) {
      for (let col = range.s.c; col <= range.e.c; col += 1) {
        const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: col })];
        if (!cell || cell.v === undefined || cell.v === null) {
          continue;
        }
        nonEmptyCells += 1;
        if (cell.f) {
          formulas += 1;
          totalFormulas += 1;
        }
        if (typeof cell.v === "string") {
          for (const match of cell.v.matchAll(/\{\{([^}]+)\}\}/g)) {
            placeholders.push({
              sheetName,
              cell: XLSX.utils.encode_cell({ r: row, c: col }),
              key: match[1],
              text: cell.v,
            });
          }
        }
      }
    }

    totalNonEmptyCells += nonEmptyCells;
    const mergedRanges = worksheet["!merges"]?.length || 0;
    console.log(
      `  ${sheetName}: range=${worksheet["!ref"]}, rows=${rowCount}, cols=${columnCount}, nonEmpty=${nonEmptyCells}, formulas=${formulas}, mergedRanges=${mergedRanges}`
    );
  }

  printWorkbook("Actual CV sample (first 31 rows, 12 columns)", workbook, 31);
  console.log(
    `\nActual workbook totals: nonEmptyCells=${totalNonEmptyCells}, formulas=${totalFormulas}, placeholders=${placeholders.length}`
  );
  if (placeholders.length > 0) {
    for (const placeholder of placeholders) {
      console.log(
        `  ${placeholder.sheetName}!${placeholder.cell}: {{${placeholder.key}}}`
      );
    }
  } else {
    console.log("  No {{placeholder}} patterns found.");
  }

  const hashAfter = hashFile(ACTUAL_FILE);
  const mtimeAfter = fs.statSync(ACTUAL_FILE).mtimeMs;
  assert.equal(hashAfter, hashBefore, "Actual CV file hash changed during the test");
  assert.equal(
    mtimeAfter,
    mtimeBefore,
    "Actual CV modification time changed during the test"
  );

  return { workbook, placeholders };
}

async function run() {
  console.log("Excel template loader test");
  console.log(`Loader: ${LOADER_PATH}`);
  console.log(`Node: ${process.version}`);
  console.log(`xlsx: ${XLSX.version}`);

  const loadExcelTemplate = loadExcelTemplateFromTypeScript();
  const template = createTemplateWorkbook();
  const candidateData = createMockCandidateData();
  const templatePlaceholders = collectPlaceholders(template.workbook);

  printWorkbook("In-memory template", template.workbook);
  console.log(`Template placeholders: ${templatePlaceholders.length}`);
  assert.equal(template.workbook.SheetNames[0], TEMPLATE_SHEET);
  assert.equal(templatePlaceholders.length, 12);

  const outputBlob = await loadExcelTemplate(
    fileArrayBufferAdapter(template.buffer),
    candidateData,
    { sheetName: TEMPLATE_SHEET }
  );
  const outputBuffer = Buffer.from(await outputBlob.arrayBuffer());
  const outputWorkbook = XLSX.read(outputBuffer, { type: "buffer" });
  const outputRows = worksheetRows(outputWorkbook.Sheets[TEMPLATE_SHEET]);
  const outputPlaceholders = collectPlaceholders(outputWorkbook);

  assert.equal(
    outputBlob.type,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  assert.deepEqual(outputWorkbook.SheetNames, [TEMPLATE_SHEET]);
  assert.equal(outputWorkbook.Sheets[TEMPLATE_SHEET]["!ref"], "A1:L2");
  assert.equal(outputPlaceholders.length, 0);
  assert.deepEqual(outputRows, [
    [
      candidateData.identitas.nama_lengkap,
      candidateData.identitas.tempat_lahir,
      candidateData.identitas.tinggi_badan,
      candidateData.fisik.berat_badan,
      candidateData.pendidikan[0].tingkat,
      candidateData.pendidikan[0].sekolah,
      candidateData.pendidikan[0].jurusan,
      candidateData.pekerjaan[0].perusahaan,
      candidateData.pekerjaan[0].jabatan,
      candidateData.keluarga[0].hubungan,
      candidateData.keluarga[0].nama,
      candidateData.sertifikasi.jft,
    ],
    [
      candidateData.identitas.nama_lengkap,
      candidateData.identitas.tempat_lahir,
      candidateData.identitas.tinggi_badan,
      candidateData.fisik.berat_badan,
      candidateData.pendidikan[1].tingkat,
      candidateData.pendidikan[1].sekolah,
      candidateData.pendidikan[1].jurusan,
      candidateData.pekerjaan[1].perusahaan,
      candidateData.pekerjaan[1].jabatan,
      candidateData.keluarga[1].hubungan,
      candidateData.keluarga[1].nama,
      candidateData.sertifikasi.jft,
    ],
  ]);

  printWorkbook("Rendered workbook", outputWorkbook);
  const actual = inspectActualWorkbook();
  assert.equal(actual.placeholders.length, 0);

  console.log("\n=== Result ===");
  console.log("PASS: template created in memory with 12 placeholders");
  console.log("PASS: loadExcelTemplate accepted the Node ArrayBuffer adapter");
  console.log("PASS: all placeholders were replaced across 2 rendered rows");
  console.log("PASS: rendered workbook parsed successfully as XLSX");
  console.log("PASS: actual CV structure was read without placeholder patterns");
  console.log("PASS: actual CV SHA-256 and modification time remained unchanged");
}

run().catch((error) => {
  console.error("\nFAIL: Excel template loader test failed");
  console.error(error);
  process.exitCode = 1;
});