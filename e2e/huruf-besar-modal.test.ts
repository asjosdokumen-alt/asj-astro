// @vitest-environment jsdom
/**
 * huruf-besar-modal.test.ts — penulisan manual di modal jadi HURUF BESAR.
 *
 * Yang dijaga bukan "hurufnya besar", melainkan tiga hal yang mudah salah:
 *   1. nilai yang DISIMPAN ikut besar (event `input` dipancarkan ulang),
 *   2. password/email TIDAK disentuh — huruf besar di sana bukan gaya,
 *      melainkan bug,
 *   3. hanya di dalam `[role="dialog"]`; formulir halaman biasa tidak berubah.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { besarkanNilai, pasangHurufBesarModal } from '../src/lib/hurufBesarModal';

const pasang = (html: string) => {
  document.body.innerHTML = html;
};

let lepas: (() => void) | null = null;
afterEach(() => {
  lepas?.();
  lepas = null;
  document.body.innerHTML = '';
});

const blur = (el: Element) => el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));

describe('besarkanNilai', () => {
  it('membesarkan input teks di dalam dialog dan memancarkan input', () => {
    pasang('<div role="dialog"><input id="a" value="budi santoso"></div>');
    const el = document.getElementById('a') as HTMLInputElement;
    let event = 0;
    el.addEventListener('input', () => {
      event += 1;
    });

    expect(besarkanNilai(el)).toBe(true);
    expect(el.value).toBe('BUDI SANTOSO');
    /* Tanpa event ini, layar menampilkan besar tetapi state Preact tetap kecil. */
    expect(event).toBe(1);
  });

  it('tidak menyentuh password, email, number, dan url', () => {
    pasang(`
      <div role="dialog">
        <input id="p" type="password" value="rahasia123">
        <input id="e" type="email" value="budi@example.com">
        <input id="n" type="number" value="62">
        <input id="u" type="url" value="https://contoh.id">
      </div>`);
    for (const id of ['p', 'e', 'n', 'u']) {
      const el = document.getElementById(id) as HTMLInputElement;
      expect(besarkanNilai(el), id).toBe(false);
      expect(el.value, id).toBe(el.defaultValue);
    }
  });

  it('tidak menyentuh input di luar dialog', () => {
    pasang('<input id="luar" value="budi">');
    const el = document.getElementById('luar') as HTMLInputElement;
    expect(besarkanNilai(el)).toBe(false);
    expect(el.value).toBe('budi');
  });

  it('textarea ikut dibesarkan', () => {
    pasang('<div role="dialog"><textarea id="t">jalan sakura 5</textarea></div>');
    const el = document.getElementById('t') as HTMLTextAreaElement;
    expect(besarkanNilai(el)).toBe(true);
    expect(el.value).toBe('JALAN SAKURA 5');
  });

  it('elemen bisa memilih keluar lewat data-tanpa-huruf-besar', () => {
    pasang('<div role="dialog"><input id="x" data-tanpa-huruf-besar value="budi"></div>');
    const el = document.getElementById('x') as HTMLInputElement;
    expect(besarkanNilai(el)).toBe(false);
    expect(el.value).toBe('budi');
  });

  it('nilai yang sudah besar tidak memancarkan event lagi', () => {
    pasang('<div role="dialog"><input id="a" value="BUDI"></div>');
    const el = document.getElementById('a') as HTMLInputElement;
    let event = 0;
    el.addEventListener('input', () => {
      event += 1;
    });
    expect(besarkanNilai(el)).toBe(false);
    expect(event).toBe(0);
  });
});

describe('pasangHurufBesarModal', () => {
  it('membesarkan nilai saat blur, dan berhenti setelah dilepas', () => {
    pasang('<div role="dialog"><input id="a" value="budi"></div>');
    const el = document.getElementById('a') as HTMLInputElement;

    lepas = pasangHurufBesarModal(document);
    blur(el);
    expect(el.value).toBe('BUDI');

    lepas();
    lepas = null;
    el.value = 'sari';
    blur(el);
    expect(el.value).toBe('sari');
  });
});
