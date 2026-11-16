/* ASJ page bridge — menghubungkan tombol halaman ke adegan Godot.
 *
 * Satu skrip untuk tiga halaman. Ia membuat overlay + HUD, memilih ronde
 * sesuai `data-godot-buka`, dan meneruskan event. Tidak ada skor resmi atau
 * progres yang ditulis di sini: skor Genba/Kotoba di layar ini adalah SKOR
 * SESI (tidak dikirim ke papan peringkat), sedangkan Kotoba hanya MEMBACA
 * `localStorage` yang sudah ditulis KotobaGame.
 *
 * Urutan pemuatan: asj-loader.js dulu, baru file ini.
 */
(function () {
  'use strict';
  if (window.ASJPageBridge) return;

  var state = {
    mode: '',
    loop: 0,
    timer: 0,
    terpasang: false,
    genba: null,
    kotoba: null,
    combo: null,
    figural: null,
    choukai: false,
  };
  var BUCKET = 'asj-godot-v1';
  var BERKAS = ['/godot/index.js', '/godot/index.pck', '/godot/index.wasm'];

  /* Nama Jepang untuk 12 ikon atlas, urutannya SAMA dengan `item-atlas.webp`
     (helm, kardus, botol, kunci pas, sarung tangan, papan jepit, sapu, kotak
     alat, apron, meteran, gerobak, peti). Teks ini dirender DOM, bukan canvas,
     supaya kanji/kana tidak bergantung pada font di dalam engine. */
  var BARANG_JP = [
    'ヘルメット', 'だんボール', 'すいとう', 'レンチ',
    'てぶくろ', 'バインダー', 'ほうき', 'どうぐばこ',
    'エプロン', 'メジャー', '台車', '木箱',
  ];

  /* Urutan warna HARUS sama dengan `WARNA_SLOT` di godot/scripts/views/genba.gd.
     Instruksi memakai nama warna, bukan nomor rak: nomor membuat permainan
     hanya mencocokkan digit, bukan membaca bahasa Jepang. */
  var WARNA_FRASE = ['赤い棚', '青い棚', '黄色い棚', '緑の棚', '白い棚', '黒い棚', '紫の棚', 'オレンジの棚'];

  /* Bank kecil untuk Kotoba Garden. Ini BUKAN pengganti bank 1.440 kata di
     server; ini loop latihan singkat supaya taman punya permainan, bukan
     gambar diam. Kata yang sudah dikuasai tetap dibaca dari localStorage. */
  var KATA = [
    { jp: '水', baca: 'みず', arti: 'air' },
    { jp: '火', baca: 'ひ', arti: 'api' },
    { jp: '山', baca: 'やま', arti: 'gunung' },
    { jp: '川', baca: 'かわ', arti: 'sungai' },
    { jp: '食べる', baca: 'たべる', arti: 'makan' },
    { jp: '飲む', baca: 'のむ', arti: 'minum' },
    { jp: '行く', baca: 'いく', arti: 'pergi' },
    { jp: '見る', baca: 'みる', arti: 'melihat' },
    { jp: '聞く', baca: 'きく', arti: 'mendengar' },
    { jp: '書く', baca: 'かく', arti: 'menulis' },
    { jp: '読む', baca: 'よむ', arti: 'membaca' },
    { jp: '大きい', baca: 'おおきい', arti: 'besar' },
    { jp: '小さい', baca: 'ちいさい', arti: 'kecil' },
    { jp: '新しい', baca: 'あたらしい', arti: 'baru' },
    { jp: '古い', baca: 'ふるい', arti: 'lama' },
    { jp: '先生', baca: 'せんせい', arti: 'guru' },
    { jp: '学生', baca: 'がくせい', arti: 'murid' },
    { jp: '会社', baca: 'かいしゃ', arti: 'perusahaan' },
    { jp: '仕事', baca: 'しごと', arti: 'pekerjaan' },
    { jp: '日本', baca: 'にほん', arti: 'Jepang' },
  ];

  /* Kalimat Combo: cukup pendek untuk satu layar, dan partikelnya benar.
     Ini bank latihan beta, bukan pengganti 30 kalimat di `COMBO_SOAL`. */
  var KALIMAT = [
    { indo: 'Saya minum kopi di kantin.', kartu: ['わたし', 'は', 'コーヒー', 'を', 'のみます'] },
    { indo: 'Dia makan roti di rumah.', kartu: ['かれ', 'は', 'パン', 'を', 'たべます'] },
    { indo: 'Saya pergi ke sekolah dengan bus.', kartu: ['わたし', 'は', 'バス', 'で', 'がっこう', 'に', 'いきます'] },
    { indo: 'Guru menulis di papan tulis.', kartu: ['せんせい', 'は', 'こくばん', 'に', 'かきます'] },
    { indo: 'Saya membaca buku di kamar.', kartu: ['わたし', 'は', 'へや', 'で', 'ほん', 'を', 'よみます'] },
    { indo: 'Adik melihat TV.', kartu: ['いもうと', 'は', 'テレビ', 'を', 'みます'] },
    { indo: 'Ayah bekerja di perusahaan.', kartu: ['ちち', 'は', 'かいしゃ', 'で', 'はたらきます'] },
    { indo: 'Saya mendengarkan musik setiap hari.', kartu: ['わたし', 'は', 'まいにち', 'おんがく', 'を', 'ききます'] },
  ];

  function el(id) {
    return document.getElementById(id);
  }

  function node(tag, cls, isi) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (isi !== undefined && isi !== null) e.textContent = isi;
    return e;
  }

  function acak(a, b) {
    return a + Math.floor(Math.random() * (b - a + 1));
  }

  function kirim(msg) {
    if (window.ASJGodot) window.ASJGodot.kirim(msg);
  }

  function hentikanTimer() {
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = 0;
    }
  }

  /* ── Gaya overlay ─────────────────────────────────────────────────────── */
  function suntikGaya() {
    if (el('asj-godot-gaya')) return;
    var g = document.createElement('style');
    g.id = 'asj-godot-gaya';
    g.textContent =
      'html.asj-godot-open{overflow:hidden;scrollbar-width:none}' +
      'html.asj-godot-open::-webkit-scrollbar{display:none;width:0;height:0}' +
      '.asj-stage{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#0b1220}' +
      '#asj-godot-mount{position:relative;width:100%;height:100%;overflow:hidden;background:#101a2e}' +
      '@media(min-width:720px){#asj-godot-mount{width:calc(100dvh * 9 / 16);height:100dvh;max-width:480px;border-radius:20px;box-shadow:0 0 0 1px rgba(245,185,66,.28),0 24px 80px rgba(0,0,0,.55)}}' +
      '.asj-hud{position:absolute;left:0;right:0;top:0;z-index:2;padding:10px 12px 26px;pointer-events:none;background:linear-gradient(180deg,rgba(16,26,46,.94),rgba(16,26,46,0));font-family:ui-sans-serif,system-ui;color:#fdf6ec}' +
      '.asj-hud-top{display:flex;justify-content:space-between;gap:8px}.asj-hud-top>div:first-child{min-width:0;flex:1}.asj-hud-kanan{min-width:72px}' +
      '.asj-kicker{font-size:10px;letter-spacing:.12em;color:#f5b942;font-weight:800;margin:0}' +
      '.asj-perintah{font-size:15px;line-height:1.32;overflow-wrap:anywhere;font-weight:700;margin:4px 0 0;text-shadow:0 1px 2px rgba(0,0,0,.55)}' +
      '.asj-hud-kanan{text-align:right;flex-shrink:0}' +
      '.asj-skor{font-size:18px;font-weight:800;margin:0;font-variant-numeric:tabular-nums}' +
      '.asj-nyawa{font-size:14px;margin:2px 0 0;letter-spacing:2px;color:#ff8fbf}' +
      '.asj-progress{font-size:11px;margin:2px 0 0;color:#b4b2a9}' +
      '.asj-hud-bawah{position:absolute;left:0;right:0;bottom:0;z-index:2;display:flex;align-items:center;gap:8px;padding:10px 12px;pointer-events:none;background:linear-gradient(0deg,rgba(16,26,46,.94),rgba(16,26,46,0))}' +
      '.asj-hud-bawah button{pointer-events:auto;min-height:40px;border-radius:10px;border:1px solid rgba(245,185,66,.5);background:#1b2740;color:#fdf6ec;font:700 11px ui-sans-serif,system-ui;padding:0 10px}' +
      '.asj-hint{font-size:10px;color:#b4b2a9;margin:2px 0 0}' +
      '.asj-hasil{position:absolute;inset:0;z-index:3;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:20px;background:rgba(8,14,26,.84);text-align:center;color:#fdf6ec;font-family:ui-sans-serif,system-ui}' +
      '.asj-hasil[hidden]{display:none}' +
      '.asj-hasil-teks{font-size:14px;font-weight:700;line-height:1.5;margin:0}' +
      '.asj-hasil button{min-height:44px;border-radius:12px;border:1px solid rgba(245,185,66,.6);background:#f5b942;color:#101a2e;font:800 12px ui-sans-serif,system-ui;padding:0 16px}' +
      '.asj-hasil button.asj-ghost{background:#1b2740;color:#fdf6ec}' +
      '.asj-combo{position:absolute;left:0;right:0;bottom:0;z-index:2;display:none;padding:12px;background:linear-gradient(0deg,rgba(16,26,46,.97),rgba(16,26,46,.25));font-family:ui-sans-serif,system-ui;color:#fdf6ec}' +
      '.asj-combo-rel{display:flex;flex-wrap:wrap;gap:6px;min-height:44px;align-items:center;margin-bottom:8px}' +
      '.asj-combo-rel span{background:#f5b942;color:#101a2e;border-radius:8px;padding:8px 10px;font:800 13px ui-sans-serif,system-ui}' +
      '.asj-combo-tray{display:flex;flex-wrap:wrap;gap:8px}' +
      '.asj-combo-tray button{min-height:44px;border-radius:10px;border:1px solid rgba(245,185,66,.45);background:#1b2740;color:#fdf6ec;font:700 14px ui-sans-serif,system-ui;padding:6px 10px}' +
      '.asj-combo-tray button.salah{background:#e24b4a;color:#fff;border-color:#e24b4a}' +
      '.asj-kotoba{position:absolute;left:0;right:0;bottom:0;z-index:2;display:none;padding:12px;background:linear-gradient(0deg,rgba(16,26,46,.97),rgba(16,26,46,.25));font-family:ui-sans-serif,system-ui;color:#fdf6ec}' +
      '.asj-kotoba-kepala{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:10px;color:#b4b2a9}' +
      '.asj-kotoba-kepala b{color:#f5b942;font-size:11px}' +
      '.asj-kotoba-kata{font-size:30px;font-weight:800;margin:6px 0 0;line-height:1.2}' +
      '.asj-kotoba-baca{font-size:11px;color:#b4b2a9;margin:2px 0 8px}' +
      '.asj-kotoba-opsi{display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
      '.asj-kotoba-opsi button{min-height:44px;border-radius:10px;border:1px solid rgba(245,185,66,.45);background:#1b2740;color:#fdf6ec;font:700 12px ui-sans-serif,system-ui;padding:6px 8px;text-align:left}' +
      '.asj-kotoba-opsi button.benar{background:#34d399;color:#101a2e;border-color:#34d399}' +
      '.asj-kotoba-opsi button.salah{background:#e24b4a;color:#fff;border-color:#e24b4a}';
    document.head.appendChild(g);
  }

  /* ── Overlay + HUD ────────────────────────────────────────────────────── */
  function buatOverlay() {
    if (el('asj-godot')) return;
    suntikGaya();

    var d = node('div');
    d.id = 'asj-godot';
    d.dataset.aktif = '0';
    d.style.cssText =
      'position:fixed;left:0;top:0;width:100vw;height:100vh;height:100dvh;z-index:2147483000;background:#0b1220;isolation:isolate;display:none';

    var stage = node('div', 'asj-stage');
    var mount = node('div');
    mount.id = 'asj-godot-mount';

    var hud = node('div', 'asj-hud');
    var top = node('div', 'asj-hud-top');
    var kiri = node('div');
    var kicker = node('p', 'asj-kicker', 'GENBA · ');
    kicker.id = 'asj-godot-kicker';
    var wave = node('span', '', 'SHIFT');
    wave.id = 'asj-godot-wave';
    kicker.appendChild(wave);
    var perintah = node('p', 'asj-perintah', 'Menyiapkan perintah…');
    perintah.id = 'asj-godot-perintah';
    kiri.appendChild(kicker);
    kiri.appendChild(perintah);
    var hint = node('p', 'asj-hint', 'Tarik barang ke rak berwarna yang disebut');
    hint.id = 'asj-godot-hint';
    kiri.appendChild(hint);
    var kanan = node('div', 'asj-hud-kanan');
    var skor = node('p', 'asj-skor', '¥ 0');
    skor.id = 'asj-godot-skor';
    var nyawa = node('p', 'asj-nyawa', '♥♥♥♥');
    nyawa.id = 'asj-godot-nyawa';
    var progress = node('p', 'asj-progress', '0/8');
    progress.id = 'asj-godot-ronde';
    kanan.appendChild(skor);
    kanan.appendChild(nyawa);
    kanan.appendChild(progress);
    top.appendChild(kiri);
    top.appendChild(kanan);
    hud.appendChild(top);

    var bawah = node('div', 'asj-hud-bawah');
    var ulang = node('button', '', '🔊 Ulangi');
    ulang.id = 'asj-godot-ulang';
    ulang.type = 'button';
    var choukai = node('button', '', '👂 Choukai');
    choukai.id = 'asj-godot-choukai';
    choukai.type = 'button';
    bawah.appendChild(ulang);
    bawah.appendChild(choukai);

    var hasil = node('div', 'asj-hasil');
    hasil.id = 'asj-godot-hasil';
    hasil.hidden = true;
    var hasilTeks = node('p', 'asj-hasil-teks', '');
    hasilTeks.id = 'asj-godot-hasil-teks';
    var lagi = node('button', '', 'Main lagi');
    lagi.id = 'asj-godot-lagi';
    lagi.type = 'button';
    var loopBtn = node('button', '', '∞ Ultimate Loop');
    loopBtn.id = 'asj-godot-loop';
    loopBtn.type = 'button';
    loopBtn.hidden = true;
    hasil.appendChild(hasilTeks);
    hasil.appendChild(lagi);
    hasil.appendChild(loopBtn);

    var kotoba = node('div', 'asj-kotoba');
    kotoba.id = 'asj-godot-kotoba';
    var kkepala = node('div', 'asj-kotoba-kepala');
    kkepala.appendChild(node('span', '', 'Kotoba Garden · pilih arti yang benar'));
    var kskor = node('b', '', '0 benar · 0 daun');
    kskor.id = 'asj-godot-kotoba-skor';
    kkepala.appendChild(kskor);
    var kata = node('p', 'asj-kotoba-kata', '');
    kata.id = 'asj-godot-kotoba-kata';
    var baca = node('p', 'asj-kotoba-baca', '');
    baca.id = 'asj-godot-kotoba-baca';
    var opsi = node('div', 'asj-kotoba-opsi');
    opsi.id = 'asj-godot-kotoba-opsi';
    kotoba.appendChild(kkepala);
    kotoba.appendChild(kata);
    kotoba.appendChild(baca);
    kotoba.appendChild(opsi);

    var combo = node('div', 'asj-combo');
    combo.id = 'asj-godot-combo';
    var crel = node('div', 'asj-combo-rel');
    crel.id = 'asj-godot-combo-rel';
    var ctray = node('div', 'asj-combo-tray');
    ctray.id = 'asj-godot-combo-tray';
    combo.appendChild(crel);
    combo.appendChild(ctray);

    mount.appendChild(hud);
    mount.appendChild(bawah);
    mount.appendChild(kotoba);
    mount.appendChild(combo);
    mount.appendChild(hasil);
    stage.appendChild(mount);
    d.appendChild(stage);

    var tutup = node('button', '', 'Tutup');
    tutup.id = 'asj-godot-tutup';
    tutup.type = 'button';
    tutup.setAttribute('aria-label', 'Tutup mode Godot');
    tutup.style.cssText =
      'position:absolute;bottom:12px;right:12px;z-index:4;min-height:44px;padding:0 14px;border-radius:12px;border:1px solid rgba(245,185,66,.55);background:#1b2740;color:#fdf6ec;font:700 12px ui-sans-serif,system-ui;cursor:pointer';
    d.appendChild(tutup);

    document.body.appendChild(d);

    tutup.addEventListener('click', function () {
      d.style.display = 'none';
      document.documentElement.classList.remove('asj-godot-open');
      hentikanTimer();
    });
    ulang.addEventListener('click', function () {
      if (state.genba && state.genba.daftar[state.genba.idx]) {
        ucap(state.genba.daftar[state.genba.idx].jp);
      }
    });
    choukai.addEventListener('click', function () {
      state.choukai = !state.choukai;
      choukai.style.borderColor = state.choukai ? '#f5b942' : 'rgba(245,185,66,.5)';
      choukai.style.background = state.choukai ? '#f5b942' : '#1b2740';
      choukai.style.color = state.choukai ? '#101a2e' : '#fdf6ec';
      updateHUD();
      if (state.genba && state.genba.daftar[state.genba.idx]) ucap(state.genba.daftar[state.genba.idx].jp);
    });
    lagi.addEventListener('click', function () {
      sembunyiHasil();
      if (state.mode === 'combo') mulaiCombo();
      else if (state.mode === 'matematika') mulaiFigural();
      else {
        state.loop = 0;
        rondeGenba();
      }
    });
    loopBtn.addEventListener('click', function () {
      state.loop = state.loop + 1;
      sembunyiHasil();
      rondeGenba();
    });
    opsi.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('button') : null;
      if (b) jawabKotoba(b.getAttribute('data-arti') || '');
    });
    ctray.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('button') : null;
      if (b) pilihKartu(b.getAttribute('data-kartu') || '', b.getAttribute('data-pos') || '0');
    });
  }

  function tampil(mode) {
    var d = el('asj-godot');
    if (!d) return;
    d.style.display = 'block';
    d.dataset.aktif = '1';
    document.documentElement.classList.add('asj-godot-open');

    /* Judul dan hint HARUS mengikuti mode. Sebelum ini HUD Combo menampilkan
       "GENBA · COMBO" dan hint Genba ("Tarik barang ke rak…") — terbaca seperti
       mode yang salah, dan pemain diberi instruksi yang tidak berlaku. */
    var judul = { genba: 'GENBA · ', combo: 'KALIMAT · ', matematika: 'FIGURAL · ' };
    var petunjuk = {
      genba: 'Tarik barang ke rak berwarna yang disebut',
      combo: 'Ketuk kartu sesuai urutan kalimat',
      kotoba: 'Pilih arti yang benar',
      matematika: 'Putar / cermin, lalu KIRIM',
    };
    var kickerEl = el('asj-godot-kicker');
    if (kickerEl && kickerEl.firstChild) {
      kickerEl.firstChild.nodeValue = judul[mode] || 'GENBA · ';
    }
    var hintEl = el('asj-godot-hint');
    if (hintEl) hintEl.textContent = petunjuk[mode] || petunjuk.genba;

    var kotoba = mode === 'kotoba';
    var hud = document.querySelector('.asj-hud');
    var bawah = document.querySelector('.asj-hud-bawah');
    var panel = el('asj-godot-kotoba');
    var panelCombo = el('asj-godot-combo');
    if (hud) hud.style.display = kotoba ? 'none' : 'block';
    if (bawah) bawah.style.display = mode === 'genba' ? 'flex' : 'none';
    if (panel) panel.style.display = kotoba ? 'block' : 'none';
    if (panelCombo) panelCombo.style.display = mode === 'combo' ? 'block' : 'none';
    var tutup = el('asj-godot-tutup');
    if (tutup) {
      var diBawah = mode === 'genba';
      tutup.style.top = diBawah ? 'auto' : '12px';
      tutup.style.bottom = diBawah ? '12px' : 'auto';
    }
    if (mode !== 'genba') sembunyiHasil();
  }

  function ucap(teks) {
    if (!teks || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      var u = new window.SpeechSynthesisUtterance(teks);
      u.lang = 'ja-JP';
      u.rate = 0.95;
      window.speechSynthesis.speak(u);
    } catch (e) {
      /* TTS gagal: instruksi tetap terbaca di HUD */
    }
  }

  /* ── Unduh paket offline ──────────────────────────────────────────────── */
  function statusUnduh(teks) {
    var s = el('asj-godot-unduh-status');
    if (s) s.textContent = teks;
  }

  var KUNCI_TUNDA_PREFLIGHT = 'asj_godot_preflight_nanti';

  /**
   * Tawarkan unduhan saat halaman terbuka, sinyal bagus, paket belum ada.
   *
   * Keputusan "kapan" ada di `preflight.js` (murni, diuji tabel kebenaran);
   * fungsi ini hanya merakit DOM-nya. Inline style, bukan kelas utilitas:
   * berkas ini tidak dipindai Tailwind, jadi kelas baru tidak akan ada di CSS
   * hasil build.
   */
  function tawarkanPreflight(unduhBtn) {
    if (!window.ASJPreflight || !unduhBtn || !unduhBtn.parentNode) return;
    if (el('asj-godot-preflight')) return;
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection || {};
    var putusan;
    try {
      putusan = window.ASJPreflight.putuskan({
        tersimpan: false,
        hematData: conn.saveData === true,
        tipe: conn.type || '',
        effectiveType: conn.effectiveType || '',
        ditundaSampai: Number(localStorage.getItem(KUNCI_TUNDA_PREFLIGHT) || 0),
        sekarang: Date.now(),
      });
    } catch (e) {
      return;
    }
    if (!putusan.tawarkan) return;

    var kotak = document.createElement('div');
    kotak.id = 'asj-godot-preflight';
    kotak.setAttribute('role', 'status');
    kotak.style.cssText =
      'margin-top:8px;padding:8px 10px;border:1px solid rgba(56,189,248,.45);' +
      'border-radius:10px;background:rgba(56,189,248,.10);font-size:11px;line-height:1.35';

    var teks = document.createElement('p');
    teks.style.cssText = 'margin:0 0 6px';
    teks.textContent =
      'Sinyal bagus. Unduh paket game (±10 MB) sekarang supaya bisa dimainkan tanpa internet.';

    var baris = document.createElement('div');
    baris.style.cssText = 'display:flex;gap:12px;align-items:center';

    var ya = document.createElement('button');
    ya.type = 'button';
    ya.textContent = 'Unduh sekarang';
    ya.style.cssText =
      'border:0;background:transparent;padding:0;font:inherit;font-weight:800;' +
      'text-decoration:underline;cursor:pointer;color:inherit';
    ya.addEventListener('click', function () {
      kotak.remove();
      unduh();
    });

    var nanti = document.createElement('button');
    nanti.type = 'button';
    nanti.textContent = 'Nanti';
    nanti.style.cssText =
      'border:0;background:transparent;padding:0;font:inherit;opacity:.7;cursor:pointer;color:inherit';
    nanti.addEventListener('click', function () {
      try {
        localStorage.setItem(
          KUNCI_TUNDA_PREFLIGHT,
          String(Date.now() + window.ASJPreflight.TUNDA_MS),
        );
      } catch (e) {
        /* localStorage penuh/diblokir: tawaran tetap ditutup untuk sesi ini */
      }
      kotak.remove();
    });

    baris.appendChild(ya);
    baris.appendChild(nanti);
    kotak.appendChild(teks);
    kotak.appendChild(baris);
    /* Di luar baris tombol (`.mt-1.5.flex`), supaya tidak terjepit di
       samping tautan unduhan. */
    var barisUnduh = unduhBtn.parentNode;
    barisUnduh.parentNode.insertBefore(kotak, barisUnduh);
  }

  async function unduh() {
    if (!('caches' in window)) {
      statusUnduh('Browser ini tidak mendukung cache offline.');
      return;
    }
    try {
      var cache = await caches.open(BUCKET);
      var selesai = 0;
      for (var i = 0; i < BERKAS.length; i++) {
        var url = BERKAS[i];
        var ada = await cache.match(url);
        if (!ada) {
          statusUnduh('Mengunduh ' + (i + 1) + '/' + BERKAS.length + '…');
          var res = await fetch(url, { cache: 'no-store' });
          if (!res.ok) throw new Error(url + ' → ' + res.status);
          await cache.put(url, res.clone());
        }
        selesai++;
        statusUnduh('Menyiapkan ' + selesai + '/' + BERKAS.length + '…');
      }
      /* Cache Storage saja tidak cukup: engine hanya dilayani dari cache
         kalau service worker MENGONTROL halaman. Di localhost SW sengaja
         dilepas (kecuali `?pwa=1`), jadi beri tahu langkah yang benar. */
      if (!(navigator.serviceWorker && navigator.serviceWorker.controller)) {
        statusUnduh('Paket tersimpan. Muat ulang halaman sekali agar offline aktif.');
      } else {
        statusUnduh('Paket siap · game bisa dimainkan offline.');
      }
    } catch (e) {
      statusUnduh('Gagal mengunduh paket. Coba lagi saat sinyal stabil.');
    }
  }

  /* ── Genba: warna rak + waktu mengecil + choukai ──────────────────────── */
  function labelWave() {
    return state.loop > 0 ? 'W' + state.loop : 'SHIFT';
  }

  function updateHUD() {
    var wave = el('asj-godot-wave');
    var skor = el('asj-godot-skor');
    var nyawa = el('asj-godot-nyawa');
    var progress = el('asj-godot-ronde');
    var perintah = el('asj-godot-perintah');
    if (state.mode === 'genba' && state.genba) {
      var g = state.genba;
      if (wave) wave.textContent = labelWave();
      if (skor) skor.textContent = '¥ ' + g.skor.toLocaleString('id-ID') + (g.kombo > 1 ? ' · ×' + g.kombo : '');
      if (nyawa) nyawa.textContent = '♥'.repeat(Math.max(0, g.nyawa));
      if (progress) progress.textContent = g.idx + '/' + g.total;
      if (perintah) {
        perintah.textContent = g.daftar[g.idx]
          ? state.choukai
            ? '🔊 ？？？'
            : g.daftar[g.idx].jp
          : 'Selesai.';
      }
      return;
    }
    if (state.mode === 'combo' && state.combo) {
      var c = state.combo;
      if (wave) wave.textContent = 'COMBO';
      if (skor) skor.textContent = '¥ ' + c.skor.toLocaleString('id-ID') + (c.kombo > 1 ? ' · ×' + c.kombo : '');
      if (nyawa) nyawa.textContent = '♥'.repeat(Math.max(0, c.nyawa));
      if (progress) progress.textContent = c.idx + '/' + c.total;
      if (perintah) perintah.textContent = c.soal ? c.soal.indo : 'Menyiapkan kalimat…';
      return;
    }
    if (state.mode === 'matematika' && state.figural) {
      var f = state.figural;
      if (wave) wave.textContent = 'FIGURAL';
      if (skor) skor.textContent = '¥ ' + f.skor.toLocaleString('id-ID');
      if (nyawa) nyawa.textContent = '♥'.repeat(Math.max(0, f.nyawa));
      if (progress) progress.textContent = f.idx + '/' + f.total;
      if (perintah) {
        perintah.textContent =
          'Putar ke ' + f.targetPutar + '°' + (f.targetCermin ? ' + cermin' : '') + ' · swipe ⟷';
      }
    }
  }

  function rondeGenba() {
    var total = state.loop > 0 ? 4 : 8;
    var nyawa = state.loop > 0 ? 1 : 4;
    var zona = state.loop > 0 ? 8 : 6;
    var pesanan = [];
    var daftar = [];
    for (var i = 0; i < total; i++) {
      /* Waktu mengecil di dalam satu shift: 8,0 dtk → 4,85 dtk. Sebelumnya
         semua pesanan 8 dtk, jadi tidak ada kurva dan tidak ada alasan
         membaca cepat. */
      var batas = state.loop > 0
        ? Math.max(2500, 7000 - 300 * state.loop)
        : Math.max(3500, 8000 - 450 * i);
      var barang = acak(0, 11);
      var rak = acak(0, zona - 1);
      var jp = BARANG_JP[barang] + ' を ' + WARNA_FRASE[rak] + ' においてください。';
      pesanan.push({ id: 'g' + state.loop + '-' + i, barang: barang, rak: rak, batasMs: batas });
      daftar.push({ jp: jp, batasMs: batas });
    }
    state.genba = { daftar: daftar, idx: 0, skor: 0, nyawa: nyawa, benar: 0, total: total, kombo: 0 };
    sembunyiHasil();
    updateHUD();
    ucap(daftar[0].jp);
    kirim({
      v: 1,
      type: 'round',
      game: 'genba',
      payload: { pesanan: pesanan, zona: zona, loop: state.loop, batasMs: 8000 },
    });
  }

  function jawabGenba(p) {
    var g = state.genba;
    if (!g || !g.daftar[g.idx]) return;
    var batas = g.daftar[g.idx].batasMs || 8000;
    if (p.benar) {
      g.kombo += 1;
      var dasar = 100 + Math.round(50 * Math.max(0, Math.min(1, (p.sisaMs || 0) / batas)));
      g.skor += Math.round(dasar * (1 + Math.min(5, g.kombo - 1) * 0.15));
      g.benar += 1;
    } else {
      g.kombo = 0;
      g.nyawa -= 1;
    }
    g.idx += 1;
    updateHUD();
    if (g.daftar[g.idx]) ucap(g.daftar[g.idx].jp);
  }

  function tampilHasil(teks, tawarkanLoop) {
    var h = el('asj-godot-hasil');
    var t = el('asj-godot-hasil-teks');
    var loopBtn = el('asj-godot-loop');
    if (t) t.textContent = teks;
    if (loopBtn) {
      loopBtn.hidden = !tawarkanLoop;
      loopBtn.textContent = '∞ Ultimate Loop W' + (state.loop + 1);
    }
    if (h) h.hidden = false;
  }

  function sembunyiHasil() {
    var h = el('asj-godot-hasil');
    if (h) h.hidden = true;
  }

  /* ── Kotoba Garden: kuis kosakata + progres taman ─────────────────────── */
  function waSekarang() {
    try {
      var raw = localStorage.getItem('asj_auth');
      if (!raw) return '';
      var a = JSON.parse(raw);
      return String((a && a.wa) || '');
    } catch (e) {
      return '';
    }
  }

  function progresKotoba() {
    var hasil = { daun: 0, tier: 0, musim: 0, streak: 0 };
    var wa = waSekarang();
    if (!wa) return hasil;
    try {
      var raw = localStorage.getItem('asj_kotoba_v1:' + wa);
      if (!raw) return hasil;
      var p = JSON.parse(raw);
      var kata = p.kata || {};
      var n = 0;
      for (var k in kata) {
        if (!Object.prototype.hasOwnProperty.call(kata, k)) continue;
        var c = kata[k];
        if (c && c.benar >= 3 && c.salah === 0) n++;
      }
      hasil.daun = Math.min(30, n);
      hasil.tier = Math.min(2, Math.floor(n / 10));
      hasil.streak = (p.streak && p.streak.jumlah) || 0;
      hasil.musim = hasil.streak % 4;
    } catch (e) {
      /* data rusak: taman tetap tampil kosong */
    }
    return hasil;
  }

  function updateKotobaHUD() {
    var k = state.kotoba;
    var s = el('asj-godot-kotoba-skor');
    if (k && s) s.textContent = k.benar + ' benar · ' + k.daun + '/30 daun';
  }

  function soalKotoba() {
    var k = state.kotoba;
    if (!k) return;
    var pilih = KATA[acak(0, KATA.length - 1)];
    if (k.soal && KATA.length > 1) {
      var n = 0;
      while (pilih.jp === k.soal.jp && n < 20) {
        pilih = KATA[acak(0, KATA.length - 1)];
        n++;
      }
    }
    k.soal = pilih;
    var opsi = [pilih.arti];
    while (opsi.length < 4) {
      var lain = KATA[acak(0, KATA.length - 1)].arti;
      if (opsi.indexOf(lain) < 0) opsi.push(lain);
    }
    for (var i = opsi.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = opsi[i];
      opsi[i] = opsi[j];
      opsi[j] = tmp;
    }
    var kata = el('asj-godot-kotoba-kata');
    var baca = el('asj-godot-kotoba-baca');
    var kotak = el('asj-godot-kotoba-opsi');
    if (kata) kata.textContent = pilih.jp;
    if (baca) baca.textContent = pilih.baca;
    if (kotak) {
      kotak.textContent = '';
      for (var o = 0; o < opsi.length; o++) {
        var b = node('button', '', opsi[o]);
        b.type = 'button';
        b.setAttribute('data-arti', opsi[o]);
        kotak.appendChild(b);
      }
    }
    updateKotobaHUD();
  }

  function jawabKotoba(arti) {
    var k = state.kotoba;
    if (!k || !k.soal || k.terkunci) return;
    var benar = arti === k.soal.arti;
    k.terkunci = true;
    var kotak = el('asj-godot-kotoba-opsi');
    if (kotak) {
      var tombol = kotak.querySelectorAll('button');
      for (var i = 0; i < tombol.length; i++) {
        var b = tombol[i];
        if (b.getAttribute('data-arti') === k.soal.arti) b.classList.add('benar');
        else if (b.getAttribute('data-arti') === arti && !benar) b.classList.add('salah');
      }
    }
    if (benar) {
      k.benar += 1;
      k.daun = Math.min(30, k.daun + 1);
      k.tier = Math.min(2, Math.floor(k.daun / 10));
      kirim({
        v: 1,
        type: 'progress',
        game: 'kotoba',
        payload: { daun: k.daun, tier: k.tier, musim: k.musim, streak: k.streak },
      });
    }
    updateKotobaHUD();
    window.setTimeout(function () {
      k.terkunci = false;
      soalKotoba();
    }, benar ? 650 : 1100);
  }

  function mulaiKotoba() {
    var p = progresKotoba();
    state.kotoba = {
      benar: 0,
      daun: p.daun,
      tier: p.tier,
      musim: p.musim,
      streak: p.streak,
      soal: null,
      terkunci: false,
    };
    kirim({ v: 1, type: 'round', game: 'kotoba', payload: {} });
    kirim({ v: 1, type: 'progress', game: 'kotoba', payload: p });
    soalKotoba();
  }

  /* ── Combo: susun kalimat, kartu DOM + panggung Godot ─────────────────── */
  function acakArray(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function mulaiCombo() {
    var soal = KALIMAT[acak(0, KALIMAT.length - 1)];
    state.combo = {
      soal: soal,
      pilih: [],
      tray: acakArray(soal.kartu),
      skor: 0,
      kombo: 0,
      nyawa: 3,
      idx: 0,
      total: 5,
    };
    sembunyiHasil();
    updateHUD();
    renderCombo();
    /* Kirim KATA-nya, bukan jumlahnya: panggung Godot menggambar teks di kartu.
       Sebelum ini hanya `kartu.length` yang dikirim, jadi kartu di layar kosong
       dan panggung terbaca seperti dekorasi yang belum jadi. */
    kirim({ v: 1, type: 'round', game: 'combo', payload: { kartu: soal.kartu } });
  }

  function renderCombo() {
    var c = state.combo;
    if (!c) return;
    var rel = el('asj-godot-combo-rel');
    var tray = el('asj-godot-combo-tray');
    if (rel) {
      rel.textContent = '';
      for (var i = 0; i < c.pilih.length; i++) rel.appendChild(node('span', '', c.pilih[i]));
    }
    if (tray) {
      tray.textContent = '';
      for (var j = 0; j < c.tray.length; j++) {
        var b = node('button', '', c.tray[j]);
        b.type = 'button';
        b.setAttribute('data-kartu', c.tray[j]);
        b.setAttribute('data-pos', String(j));
        tray.appendChild(b);
      }
    }
    updateHUD();
  }

  function pilihKartu(kartu, pos) {
    var c = state.combo;
    if (!c || !c.soal) return;
    var n = Number(pos);
    var harap = c.soal.kartu[c.pilih.length];
    var tombol = document.querySelectorAll('#asj-godot-combo-tray button')[n];
    if (kartu === harap) {
      c.pilih.push(kartu);
      c.tray.splice(n, 1);
      c.kombo += 1;
      c.skor += 50 * c.kombo;
      kirim({
        v: 1,
        type: 'combo',
        game: 'combo',
        payload: { aksi: 'benar', indeks: c.pilih.length - 1, kombo: c.kombo, kata: kartu },
      });
      if (c.pilih.length === c.soal.kartu.length) {
        c.skor += 100;
        c.idx += 1;
        kirim({ v: 1, type: 'combo', game: 'combo', payload: { aksi: 'selesai', indeks: -1, kombo: c.kombo } });
        if (c.idx >= c.total) {
          tampilHasil('¥ ' + c.skor.toLocaleString('id-ID') + ' · ' + c.idx + '/' + c.total + ' kalimat', false);
          return;
        }
        window.setTimeout(function () {
          var next = KALIMAT[acak(0, KALIMAT.length - 1)];
          c.soal = next;
          c.pilih = [];
          c.tray = acakArray(next.kartu);
          renderCombo();
          kirim({ v: 1, type: 'round', game: 'combo', payload: { kartu: next.kartu } });
        }, 900);
        return;
      }
      renderCombo();
    } else {
      c.kombo = 0;
      c.nyawa -= 1;
      kirim({ v: 1, type: 'combo', game: 'combo', payload: { aksi: 'salah', indeks: n, kombo: 0 } });
      if (tombol) tombol.classList.add('salah');
      updateHUD();
      if (c.nyawa <= 0) {
        window.setTimeout(function () {
          tampilHasil('¥ ' + c.skor.toLocaleString('id-ID') + ' · nyawa habis', false);
        }, 350);
      } else {
        window.setTimeout(renderCombo, 350);
      }
    }
  }

  /* ── Figural: putar/cermin sampai cocok dengan target ─────────────────── */
  function mulaiFigural() {
    state.figural = {
      skor: 0,
      nyawa: 3,
      idx: 0,
      total: 8,
      targetPutar: 0,
      targetCermin: false,
      bentuk: 'L',
    };
    sembunyiHasil();
    nextFigural();
  }

  function nextFigural() {
    var f = state.figural;
    if (!f) return;
    f.targetPutar = [0, 90, 180, 270][acak(0, 3)];
    f.targetCermin = Math.random() < 0.5;
    f.bentuk = ['L', 'pisau', 'bendera'][acak(0, 2)];
    kirim({
      v: 1,
      type: 'round',
      game: 'matematika',
      payload: { bentuk: f.bentuk, putar: 0, cermin: false },
    });
    updateHUD();
  }

  function jawabFigural(p) {
    var f = state.figural;
    if (!f) return;
    var putar = ((Number(p.putar) % 360) + 360) % 360;
    var benar = putar === f.targetPutar && !!p.cermin === f.targetCermin;
    if (benar) f.skor += 100;
    else f.nyawa -= 1;
    f.idx += 1;
    if (f.idx >= f.total || f.nyawa <= 0) {
      tampilHasil(
        '¥ ' + f.skor.toLocaleString('id-ID') + ' · ' + f.idx + '/' + f.total + ' benar',
        false,
      );
      return;
    }
    updateHUD();
    window.setTimeout(nextFigural, 700);
  }

  function kirimAwal(mode) {
    hentikanTimer();
    state.mode = mode;
    if (mode === 'genba') {
      state.loop = 0;
      rondeGenba();
    } else if (mode === 'combo') mulaiCombo();
    else if (mode === 'kotoba') mulaiKotoba();
    else if (mode === 'matematika') mulaiFigural();
  }

  function buka(mode) {
    if (!window.ASJGodot) return;
    tampil(mode);
    if (!window.ASJGodot.status().siap) {
      window.ASJGodot.mulai();
      window.addEventListener(
        'asj:godot-ready',
        function () {
          kirimAwal(state.mode || mode);
        },
        { once: true },
      );
      state.mode = mode;
    } else {
      kirimAwal(mode);
    }
  }

  /* ── Pemasangan ───────────────────────────────────────────────────────── */
  function pasang() {
    if (state.terpasang) return;
    state.terpasang = true;
    buatOverlay();

    var unduhBtn = document.querySelector('[data-godot-unduh]');
    if (unduhBtn) {
      unduhBtn.addEventListener('click', function () {
        unduh();
      });
      if ('caches' in window) {
        caches
          .open(BUCKET)
          .then(function (c) {
            return Promise.all(
              BERKAS.map(function (f) {
                return c.match(f);
              }),
            );
          })
          .then(function (hasil) {
            if (hasil.every(Boolean)) {
              statusUnduh('Paket offline siap.');
            } else {
              /* Belum lengkap: tawarkan SEKARANG, selagi sinyal masih bagus. */
              tawarkanPreflight(unduhBtn);
            }
          })
          .catch(function () {
            /* cache tidak tersedia: tombol tetap bisa diklik */
          });
      }
    }

    var tombol = document.querySelectorAll('[data-godot-buka]');
    for (var i = 0; i < tombol.length; i++) {
      tombol[i].addEventListener('click', function (e) {
        var mode = e.currentTarget.getAttribute('data-godot-buka') || 'genba';
        buka(mode);
      });
    }

    window.addEventListener('asj:combo', function (e) {
      if (state.mode !== 'combo' || !e.detail) return;
      if (!window.ASJGodot || !window.ASJGodot.status().siap) return;
      hentikanTimer();
      kirim({ v: 1, type: 'combo', game: 'combo', payload: e.detail });
    });

    window.addEventListener('asj:godot', function (e) {
      var m = e.detail;
      if (!m) return;
      if (m.type === 'answer' && m.game === 'genba' && m.payload) {
        jawabGenba(m.payload);
      }
      if (m.type === 'finish' && m.game === 'genba') {
        var g = state.genba;
        var teks = g
          ? '¥ ' + g.skor.toLocaleString('id-ID') + ' · ' + g.benar + '/' + g.total + ' benar' + (g.nyawa <= 0 ? ' · nyawa habis' : '')
          : 'Selesai';
        tampilHasil(teks, !!(g && g.benar === g.total && g.nyawa > 0));
      }
      if (m.type === 'answer' && m.game === 'matematika' && m.payload && m.payload.aksi === 'jawab') {
        jawabFigural(m.payload);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', pasang);
  } else {
    pasang();
  }

  window.ASJPageBridge = { buka: buka, unduh: unduh, progresKotoba: progresKotoba };
})();
