/* ASJ Godot loader — menempelkan engine ke canvas halaman, bukan iframe.
 *
 * Kontrak:
 *   window.ASJGodot.mulai()        -> unduh + jalankan engine (lazy, sekali)
 *   window.ASJGodot.kirim(msg)     -> host -> Godot (JSON)
 *   window.ASJGodot.onMessage(fn)  -> Godot -> host
 *   event "asj:godot"              -> alternatif tanpa callback
 *
 * Yang TIDAK dilakukan loader ini: menghitung skor, menyimpan progres, atau
 * memanggil API. Semua itu tetap milik host (TypeScript).
 */
(function () {
  'use strict';
  if (window.ASJGodot) return;

  var state = {
    siap: false,
    mulai: false,
    antre: [],
    engine: null,
    canvas: null,
    mount: null,
    gagal: '',
  };

  function el(id) {
    return document.getElementById(id);
  }

  function log(teks) {
    var box = el('asj-godot-log');
    if (!box) return;
    var baris = document.createElement('div');
    baris.textContent = teks;
    box.appendChild(baris);
    while (box.childNodes.length > 8) box.removeChild(box.firstChild);
  }

  function status(teks, persen) {
    var s = el('asj-godot-status');
    if (s) s.textContent = teks;
    var p = el('asj-godot-progress');
    if (p) {
      if (typeof persen === 'number') {
        p.style.display = 'block';
        p.value = Math.round(persen * 100);
      } else {
        p.style.display = 'none';
      }
    }
  }

  function buatCanvas(mount) {
    var c = document.createElement('canvas');
    c.id = 'asj-godot-canvas';
    c.width = 720;
    c.height = 1280;
    c.setAttribute('aria-hidden', 'true');
    c.style.cssText =
      'position:absolute;inset:0;z-index:0;display:block;width:100%;height:100%;touch-action:none;outline:none;background:transparent;';
    mount.appendChild(c);
    return c;
  }

  function muatScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error('gagal memuat ' + src));
      };
      document.head.appendChild(s);
    });
  }

  function pasangJembatan() {
    window.ASJ_HOST = {
      emit: function (json) {
        var msg;
        try {
          msg = JSON.parse(json);
        } catch (e) {
          return;
        }
        window.dispatchEvent(new CustomEvent('asj:godot', { detail: msg }));
        if (typeof window.ASJGodot.onMessage === 'function') {
          try {
            window.ASJGodot.onMessage(msg);
          } catch (e) {
            /* callback host tidak boleh mematikan engine */
          }
        }
      },
    };
  }

  async function mulai() {
    if (state.mulai) return;
    state.mulai = true;
    state.mount = el('asj-godot');
    if (!state.mount) {
      state.mulai = false;
      return;
    }
    state.mount.dataset.status = 'memuat';
    status('Menyiapkan mesin…', 0);
    try {
      pasangJembatan();
      /* HUD + bingkai portrait dibuat page-bridge di dalam `#asj-godot-mount`.
         Kalau mount ada, canvas masuk ke sana supaya HUD menempel di bingkai
         yang sama — bukan ke overlay penuh layar. */
      var wadah = el('asj-godot-mount') || state.mount;
      state.canvas = buatCanvas(wadah);
      await muatScript('/godot/index.js');
      if (typeof Engine !== 'function') throw new Error('Engine tidak ditemukan');
      var engine = new Engine({
        executable: '/godot/index',
        mainPack: '/godot/index.pck',
        canvasResizePolicy: 0,
        focusCanvas: false,
        ensureCrossOriginIsolationHeaders: false,
        args: [],
      });
      state.engine = engine;
      await engine.startGame({
        canvas: state.canvas,
        onProgress: function (current, total) {
          if (current > 0 && total > 0) {
            status('Mengunduh mesin… ' + Math.round((current / total) * 100) + '%', current / total);
          } else {
            status('Mengunduh mesin…', null);
          }
        },
        onPrint: function (teks) {
          log(String(teks));
        },
      });
      state.siap = true;
      state.mount.dataset.status = 'siap';
      status('Siap', null);
      log('engine siap');
      for (var i = 0; i < state.antre.length; i++) kirim(state.antre[i]);
      state.antre = [];
      window.dispatchEvent(new CustomEvent('asj:godot-ready'));
    } catch (err) {
      state.gagal = String(err && err.message ? err.message : err);
      state.mount.dataset.status = 'gagal';
      status('Mode Godot tidak tersedia: ' + state.gagal, null);
      log('GAGAL ' + state.gagal);
      state.mulai = false;
    }
  }

  function kirim(msg) {
    if (!msg || typeof msg !== 'object') return false;
    if (!state.siap || typeof window.ASJ_GODOT_IN !== 'function') {
      if (state.antre.length < 40) state.antre.push(msg);
      return false;
    }
    try {
      window.ASJ_GODOT_IN(JSON.stringify(msg));
      return true;
    } catch (e) {
      return false;
    }
  }

  window.ASJGodot = {
    mulai: mulai,
    kirim: kirim,
    onMessage: null,
    status: function () {
      return { siap: state.siap, gagal: state.gagal };
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      var m = el('asj-godot');
      if (m && m.dataset.aktif === '1') mulai();
    });
  } else {
    var m = el('asj-godot');
    if (m && m.dataset.aktif === '1') mulai();
  }
})();
