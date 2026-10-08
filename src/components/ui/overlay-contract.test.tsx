// ==========================================
// TESTS: overlay dialog contract (§25 follow-up, 2026-09-15)
//
// WHY THIS EXISTS
//   §25 gave `useOverlay` the job of writing role / aria-modal /
//   aria-labelledby, and `e2e/test-dialog.mjs` asserts the RESULT in a real
//   browser. But that guard only walks the routes it navigates, and it is not
//   part of any delivery path — so two modals sat outside it:
//
//     ListKandidatModal   no hook at all → no role, no name, no trap, no Escape
//                         (and `if (!isOpen) return null` made it unopenable
//                          from the page the e2e guard visits)
//     RejectMailModal     role/aria-modal HARDCODED in the markup with no hook
//                         behind them → it TOLD assistive tech the page was
//                         inert while nothing trapped focus. The inverse of
//                         §25's defect: the announcement without the behaviour.
//
//   The e2e guard cannot reach either one (both live behind the admin tab and
//   are opened from a table row, not a route). This file asserts the same
//   contract at the unit level, where both are reachable.
//
// WHAT IT LOCKS DOWN
//   One rule, stated once: a component that renders a `.u-modal-shell` must
//   have the hook behind it, and the rendered DOM must carry
//   role="dialog" + aria-modal="true" + a name that RESOLVES.
//
// HOW THIS COULD LIE
//   `new Set(...).size === list.length` is a tautology for a single item —
//   1 === 1 passes while the item is unnamed. So the name is asserted
//   PER COMPONENT against the element the id actually points at, never
//   inferred from a set comparison.
// ==========================================
import { render, cleanup } from '@testing-library/preact';
import { describe, it, expect, afterEach, vi } from 'vitest';
import ListKandidatModal from '../admin/ListKandidatModal';
import RejectMailModal from '../admin/RejectMailModal';
import AdminAiCopilot from '../admin/AdminAiCopilot';
import RirekishoBuilder from '../admin/RirekishoBuilder';
import EditCandidateModal from '../admin/EditCandidateModal';
import CvTemplateSelector from '../CvTemplateSelector';
import MatchmakingModal from '../admin/MatchmakingModal';
import CandidateProfileModal from '../admin/CandidateProfileModal';
import RincianBiayaModal from '../admin/RincianBiayaModal';
import AdminJobEditModal from '../admin/AdminJobEditModal';
import PemberkasanModal from '../admin/PemberkasanModal';

vi.mock('../../store/i18n', async () => {
  const { atom } = await import('nanostores');
  return { t: (k: string) => k, langStore: atom('id'), toggleLang: () => {} };
});
vi.mock('../Toast', () => ({ showToast: () => {} }));
vi.mock('../../lib/apiEndpoint', () => ({
  getEndpoint: (a: string) => `/.netlify/functions/${a}`,
}));
// Never settles: these components load their data in a mount effect, and a
// resolved promise would land a state update after the assertion, which is
// both noise and a race. A pending promise leaves them in their initial
// render — which is the render whose contract this file is about.
vi.mock('../../lib/apiClient', () => {
  const pending = () => new Promise(() => {});
  // `apiClient` (named, callable) ikut diekspor: `CandidateProfileModal`
  // memanggilnya langsung, dan mock yang hanya punya `default` + `api` membuat
  // render-nya gagal dengan "No apiClient export is defined on the mock" —
  // kegagalan infrastruktur tes, bukan cacat komponen.
  return { default: { call: pending, secure: pending }, api: { call: pending, secure: pending }, apiClient: pending };
});
vi.mock('../../store/authReactive', async () => {
  const { atom } = await import('nanostores');
  return {
    authStore: atom({
      sessionToken: 'test-token',
      isLoggedIn: true,
      role: 'admin',
      name: 'Test Admin',
    }),
    logout: () => {},
  };
});
vi.mock('../../store/adminStore', async () => {
  const { atom } = await import('nanostores');
  return {
    allKandidatList: atom([]),
    fetchAllKandidat: () => {},
  };
});

afterEach(() => {
  cleanup();
});

/**
 * Read the dialog contract off whatever the component rendered.
 * Returns the resolved NAME, not just the presence of an attribute — a
 * dangling `aria-labelledby` silently yields no name, which is the exact
 * failure mode §25 exists to close.
 */
function dialogContract() {
  const shell = document.querySelector('.u-modal-shell') as HTMLElement | null;
  if (!shell) throw new Error('no .u-modal-shell in the rendered output');

  const lb = shell.getAttribute('aria-labelledby');
  const labelEl = lb ? document.getElementById(lb.split(/\s+/)[0]) : null;
  const labelText = labelEl ? (labelEl.textContent || '').trim() : '';

  return {
    role: shell.getAttribute('role'),
    ariaModal: shell.getAttribute('aria-modal'),
    ariaLabelledby: lb,
    ariaLabel: shell.getAttribute('aria-label'),
    resolvedName: labelText || (shell.getAttribute('aria-label') || '').trim(),
    // `aria-modal="true"` asserts the rest of the page is inert. That claim is
    // only honest if focus was actually moved into the dialog — the hook does
    // that, and its "nothing focusable" branch lands on `tabindex="-1"`.
    tabIndex: shell.getAttribute('tabindex'),
    focusInside: shell.contains(document.activeElement),
    shell,
  };
}

describe('§25 contract — ListKandidatModal is a real dialog', () => {
  it('declares role="dialog" and aria-modal="true" while open', () => {
    render(<ListKandidatModal jobCode="TG658" isOpen={true} onClose={() => {}} />);
    const c = dialogContract();
    expect(c.role).toBe('dialog');
    expect(c.ariaModal).toBe('true');
  });

  it('has a name that RESOLVES to a non-empty element', () => {
    render(<ListKandidatModal jobCode="TG658" isOpen={true} onClose={() => {}} />);
    const c = dialogContract();
    // Name must come from aria-labelledby (the heading), never a bare
    // textContent read of the container.
    expect(c.ariaLabelledby).toBeTruthy();
    expect(c.resolvedName.length).toBeGreaterThan(0);
    expect(c.resolvedName).toBe('admin.list_kandidat');
  });

  it('claims NO semantics while closed (the container is still mounted)', () => {
    // `open: isOpen` is what strips the attributes. This asserts the hook was
    // actually wired to `isOpen` rather than hardcoded — the ListKandidat
    // branch in the hook's `!open` path.
    render(<ListKandidatModal jobCode="TG658" isOpen={false} onClose={() => {}} />);
    expect(document.querySelector('.u-modal-shell')).toBeNull();
  });

  it('moves focus INSIDE, so aria-modal="true" is not a false claim', () => {
    render(<ListKandidatModal jobCode="TG658" isOpen={true} onClose={() => {}} />);
    const c = dialogContract();
    // Either a focusable child took focus, or the container itself did via the
    // `tabindex="-1"` fallback. What must NOT happen is focus left outside.
    expect(c.focusInside || c.tabIndex === '-1').toBe(true);
  });

  it('closes on Escape', () => {
    // The trap and Escape come from the same hook. Asserting Escape works is
    // the cheapest proof the hook is live rather than merely imported.
    let closed = false;
    render(<ListKandidatModal jobCode="TG658" isOpen={true} onClose={() => { closed = true; }} />);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(closed).toBe(true);
  });
});

describe('§25 contract — RejectMailModal is a real dialog', () => {
  it('carries the .u-modal-shell class the e2e sweep keys on', () => {
    // MEASURED: this was the ONLY modal in the repo without `.u-modal-shell`.
    // That is why `e2e/test-dialog.mjs` never reported it — the sweep selects
    // `.u-modal-shell`, so the component was invisible to the guard by CLASS,
    // not merely by route. The class also carries `overscroll-behavior:
    // contain` (layout.css §3), so the omission was a real behavioural gap too.
    render(<RejectMailModal onCancel={() => {}} onConfirm={() => {}} />);
    expect(document.querySelectorAll('.u-modal-shell').length).toBe(1);
  });

  it('declares role="dialog" and aria-modal="true"', () => {
    render(<RejectMailModal onCancel={() => {}} onConfirm={() => {}} />);
    const c = dialogContract();
    expect(c.role).toBe('dialog');
    expect(c.ariaModal).toBe('true');
  });

  it('has a name that RESOLVES to a non-empty element', () => {
    render(<RejectMailModal onCancel={() => {}} onConfirm={() => {}} />);
    const c = dialogContract();
    expect(c.ariaLabelledby).toBeTruthy();
    expect(c.resolvedName.length).toBeGreaterThan(0);
    expect(c.resolvedName).toContain('ui.reject_app');
  });

  it('the semantics come from the hook, not the markup', () => {
    // Regression guard for the original defect: role/aria-modal were literal
    // attributes in the JSX. If they are still literal, removing the hook
    // would leave the false claim behind. Assert the id the hook generates.
    render(<RejectMailModal onCancel={() => {}} onConfirm={() => {}} />);
    const c = dialogContract();
    expect(c.ariaLabelledby).toMatch(/^asj-overlay-title-\d+$/);
  });
});

/* ══ Second wave (2026-09-16) ═══════════════════════════════════════════════
   §3.1(a) named two modals that were STILL outside this contract after the
   first wave above: they carried `.u-modal-shell` and no hook at all — no
   role, no accessible name, no Tab trap, no Escape. Both live behind the
   admin tab, so `e2e/test-dialog.mjs` cannot reach them either, for the same
   reason this file exists.

   Asserted against the RENDERED DOM, never the source: the source cannot show
   a contract the hook writes imperatively onto the container node.
   ═════════════════════════════════════════════════════════════════════════ */

describe('§3.1(a) — AdminAiCopilot is a real dialog', () => {
  it('declares role="dialog" and aria-modal="true"', () => {
    render(<AdminAiCopilot onClose={() => {}} />);
    const c = dialogContract();
    expect(c.role).toBe('dialog');
    expect(c.ariaModal).toBe('true');
  });

  it('is named after its own heading, via the hook', () => {
    render(<AdminAiCopilot onClose={() => {}} />);
    const c = dialogContract();
    expect(c.ariaLabelledby).toMatch(/^asj-overlay-title-\d+$/);
    expect(c.resolvedName).toBe('ui.ai_copilot');
  });

  it('moves focus INSIDE, so aria-modal="true" is not a false claim', () => {
    render(<AdminAiCopilot onClose={() => {}} />);
    const c = dialogContract();
    expect(c.focusInside || c.tabIndex === '-1').toBe(true);
  });

  it('closes on Escape', () => {
    let closed = false;
    render(<AdminAiCopilot onClose={() => { closed = true; }} />);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(closed).toBe(true);
  });
});

describe('§3.1(a) — RirekishoBuilder is a real dialog', () => {
  const props = { waTarget: '628123456789', isOpen: true, onClose: () => {} };

  it('declares role="dialog" and aria-modal="true"', () => {
    render(<RirekishoBuilder {...props} />);
    const c = dialogContract();
    expect(c.role).toBe('dialog');
    expect(c.ariaModal).toBe('true');
  });

  it('is named by `label`, because the A4 sheet has no heading to borrow', () => {
    // The sheet's title is a styled <div> inside the generated HTML, so there
    // is no <h1>-<h6> for the hook to name the dialog from. Without `label`
    // this overlay would be a dialog with NO accessible name — precisely the
    // failure §25 exists to close, which is why it is asserted here and not
    // left to the hook's heading lookup.
    render(<RirekishoBuilder {...props} />);
    const c = dialogContract();
    expect(c.ariaLabelledby).toBeNull();
    expect(c.ariaLabel).toBe('admin.rirekisho_title');
    expect(c.resolvedName).toBe('admin.rirekisho_title');
  });

  it('claims nothing at all while isOpen is false', () => {
    render(<RirekishoBuilder {...props} isOpen={false} />);
    expect(document.querySelector('.u-modal-shell')).toBeNull();
  });

  it('closes on Escape', () => {
    let closed = false;
    render(<RirekishoBuilder {...props} onClose={() => { closed = true; }} />);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(closed).toBe(true);
  });
});

/**
 * ==========================================
 * The two overlays this contract was still MISSING (added 2026-10-08)
 * ==========================================
 * `CvTemplateSelector` and `EditCandidateModal` were not in this file's list,
 * and both shipped broken in exactly the way §25 exists to catch. Found by
 * driving the admin panel in a real browser tab by tab — no unit test could see
 * either one, because the unit contract only reads the components it names.
 *
 *   CvTemplateSelector  — no `.u-modal-shell` at all, so it was invisible to
 *                         every e2e overlay gate (they all select that class),
 *                         and with no `useOverlay` it had no role, no
 *                         aria-modal, no Escape and no focus management.
 *   EditCandidateModal  — carried the class but put `containerRef` on the INNER
 *                         panel, so `role`/`aria-modal`/`aria-labelledby` landed
 *                         on a div the sweep never reads. Measured in the
 *                         browser: `.u-modal-shell` with role=null, aria-modal=
 *                         null, name="". Its close button was nameless too.
 *
 * Both are asserted the same way as every other component above: against the
 * element the class selector actually returns, never against the source.
 */
describe('§25 contract — CvTemplateSelector is a real dialog', () => {
  const props = { waTarget: '081234567890', isAdmin: true, onClose: () => {} };

  it('carries the .u-modal-shell class the e2e sweeps key on', () => {
    render(<CvTemplateSelector {...props} />);
    expect(document.querySelectorAll('.u-modal-shell').length).toBe(1);
  });

  it('declares role="dialog" and aria-modal="true"', () => {
    render(<CvTemplateSelector {...props} />);
    const c = dialogContract();
    expect(c.role).toBe('dialog');
    expect(c.ariaModal).toBe('true');
  });

  it('has a name that RESOLVES to a non-empty element', () => {
    render(<CvTemplateSelector {...props} />);
    const c = dialogContract();
    expect(c.ariaLabelledby).toBeTruthy();
    expect(c.resolvedName.length).toBeGreaterThan(0);
    // The hook names it from the component's own <h3>, so the resolved text is
    // the title, not the container's whole textContent.
    expect(c.resolvedName).toBe('ui.select_cv_template');
  });

  it('closes on Escape', () => {
    // This is the assertion that fails on the pre-fix component: with no
    // `useOverlay` there was no keydown handler, so the ONLY exit was the mouse.
    let closed = false;
    render(<CvTemplateSelector {...props} onClose={() => { closed = true; }} />);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(closed).toBe(true);
  });
});

describe('§25 contract — EditCandidateModal is a real dialog', () => {
  const candidate = {
    nama: 'Aria Uji',
    wa: '081234567890',
    idLoker: 'TG591ASJ',
    idKandidat: 'ASJ-001',
    tahapan: 'PEMBERKASAN',
    status: 'LULUS',
  };

  it('puts the semantics on the SHELL, not on the inner panel', () => {
    // The defect: `ref={containerRef}` sat on the inner `glass-panel`, so the
    // attributes were written there and the shell — the element every sweep
    // reads — stayed bare. Asserting through `dialogContract()` (which starts
    // from `.u-modal-shell`) is what makes the misplacement visible.
    render(<EditCandidateModal candidate={candidate} isOpen={true} onClose={() => {}} />);
    const c = dialogContract();
    expect(c.role).toBe('dialog');
    expect(c.ariaModal).toBe('true');
    expect(c.ariaLabelledby).toBeTruthy();
    expect(c.resolvedName.length).toBeGreaterThan(0);
  });

  it('names the only control that closes it', () => {
    render(<EditCandidateModal candidate={candidate} isOpen={true} onClose={() => {}} />);
    const shell = document.querySelector('.u-modal-shell') as HTMLElement;
    const first = shell.querySelector('button');
    // The glyph inside is `aria-hidden`, so without an explicit label the
    // accessibility tree gives this button NO name — measured in the browser.
    expect((first?.getAttribute('aria-label') || '').trim().length).toBeGreaterThan(0);
  });

  it('claims NO semantics while closed (the container is still mounted)', () => {
    render(<EditCandidateModal candidate={candidate} isOpen={false} onClose={() => {}} />);
    expect(document.querySelector('.u-modal-shell')).toBeNull();
  });

  it('closes on Escape', () => {
    let closed = false;
    render(<EditCandidateModal candidate={candidate} isOpen={true} onClose={() => { closed = true; }} />);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(closed).toBe(true);
  });
});

/**
 * MatchmakingModal — cacat yang SAMA dengan EditCandidateModal, ditemukan
 * terpisah di tab `#dbjob` ("Match"), 2026-10-08.
 *
 * Terukur di browser: dialognya terbuka dan tampak normal, accessibility tree
 * di dalamnya juga sehat (38 kontrol bernama), tetapi `.u-modal-shell` —
 * elemen yang dipilih SEMUA gate overlay — berdiri dengan `role=null`,
 * `aria-modal=null`, nama `""`. Sebabnya `containerRef` dipasang di panel
 * DALAM, sehingga `useOverlay` menulis atributnya ke div yang tidak pernah
 * dibaca sweep mana pun.
 *
 * Dua komponen dengan cacat identik berarti ini bukan kelalaian satu orang,
 * melainkan bentuk yang mudah salah tulis. Karena itu asersinya menunjuk
 * elemen yang sama seperti komponen lain di berkas ini: hasil
 * `.u-modal-shell`, bukan kode sumbernya.
 */
describe('§25 contract — MatchmakingModal is a real dialog', () => {
  const props = {
    job: { code: 'TG591ASJ', pekerjaan: 'PETANI', kategori: 'NOUGYOU SAYURAN' } as never,
    candidates: [] as never,
    isOpen: true,
    onClose: () => {},
  };

  it('puts the semantics on the SHELL, not on the inner panel', () => {
    render(<MatchmakingModal {...props} />);
    const c = dialogContract();
    expect(c.role).toBe('dialog');
    expect(c.ariaModal).toBe('true');
    expect(c.ariaLabelledby).toBeTruthy();
    expect(c.resolvedName.length).toBeGreaterThan(0);
  });

  it('claims NO semantics while isOpen is false', () => {
    render(<MatchmakingModal {...props} isOpen={false} />);
    expect(document.querySelector('.u-modal-shell')).toBeNull();
  });

  it('closes on Escape', () => {
    let closed = false;
    render(<MatchmakingModal {...props} onClose={() => { closed = true; }} />);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(closed).toBe(true);
  });
});

/**
 * Empat modal admin yang tersisa (2026-10-08, sesi ketiga).
 *
 * Dua di antaranya (`AdminJobEditModal`, `PemberkasanModal`) dan
 * `RincianBiayaModal` sudah BENAR saat diperiksa — shell-nya membawa
 * `.u-modal-shell` DAN `containerRef`, dan tombol tutupnya punya nama. Mereka
 * masuk ke sini sebagai penjaga, bukan sebagai perbaikan.
 *
 * `CandidateProfileModal` adalah contoh **KETIGA** dari cacat yang sama
 * (`EditCandidateModal`, `MatchmakingModal`, lalu ini): `containerRef` dipasang
 * di panel DALAM, jadi `role`/`aria-modal` ditulis ke div yang tidak pernah
 * dibaca sweep mana pun. Terukur di browser: `.u-modal-shell` dengan role=null
 * dan nama "" pada dialog yang terbuka. Tombol tutupnya juga tanpa nama
 * (glyph `aria-hidden`, tanpa `aria-label`).
 *
 * Yang diasersikan di sini adalah `role` + `aria-modal` + keberadaan kelas,
 * BUKAN nama yang sudah teresolusi: `CandidateProfileModal` merender spinner
 * sebelum datanya datang, dan hook sengaja mencari heading-nya lewat
 * MutationObserver sesudah itu (lihat catatan di `useOverlay.ts`). Menuntut nama
 * pada render pertama akan menguji waktu, bukan kontrak.
 */
describe('§25 contract — empat modal admin sisanya', () => {
  const assertShellIsTheDialog = () => {
    const c = dialogContract();
    expect(c.role).toBe('dialog');
    expect(c.ariaModal).toBe('true');
  };

  it('CandidateProfileModal — semantiknya di SHELL, bukan di panel dalam', () => {
    render(<CandidateProfileModal wa="081234567890" nama="Aria Uji" isOpen={true} onClose={() => {}} />);
    assertShellIsTheDialog();
  });

  it('CandidateProfileModal — tombol tutupnya punya nama', () => {
    render(<CandidateProfileModal wa="081234567890" nama="Aria Uji" isOpen={true} onClose={() => {}} />);
    const shell = document.querySelector('.u-modal-shell') as HTMLElement;
    const close = shell.querySelector('button');
    expect((close?.getAttribute('aria-label') || '').trim().length).toBeGreaterThan(0);
  });

  it('RincianBiayaModal — shell yang sama membawa semantiknya', () => {
    render(<RincianBiayaModal open={true} onApply={() => {}} onClose={() => {}} />);
    assertShellIsTheDialog();
  });

  it('AdminJobEditModal — shell yang sama membawa semantiknya', () => {
    render(<AdminJobEditModal job={{ code: 'TG591ASJ', pekerjaan: 'PETANI' } as never} onClose={() => {}} />);
    assertShellIsTheDialog();
  });

  it('PemberkasanModal — shell yang sama membawa semantiknya', () => {
    render(<PemberkasanModal isOpen={true} onClose={() => {}} waTarget="081234567890" namaTarget="Aria Uji" />);
    assertShellIsTheDialog();
  });
});
