/**
 * aria-names.mjs — the accessible-name rule, in ONE place.
 *
 * WHY A SHARED MODULE
 * -------------------
 * Two gates enforce the same rule on different surfaces, and they cannot share a
 * fixture: `test-aria-names.mjs` sweeps RESTING pages (routes and admin tabs),
 * while `test-candidate-modals.mjs` can only reach the candidate dashboard's six
 * overlays because it owns the session + `get-app-data` fixture. Copying the
 * rule into the second file would let the two drift, and a rule that exists in
 * two versions is a rule that is enforced in one version and believed in two.
 *
 * WHAT THE RULE IS
 * ----------------
 * Read the REAL accessibility tree (`Accessibility.getFullAXTree`) — not a grep
 * for `aria-label`, and not a re-implementation of the accessible-name
 * algorithm. The browser has already computed `role` and `name` for every node,
 * including names that come from `aria-labelledby`, from subtree text, from a
 * `<label for>`, from `title`, or from `alt`. The gate reads the RESULT, so it
 * does not care which mechanism produced it.
 *
 * Two defects are detectable this way, and they fail differently:
 *
 *   R1  the name is EMPTY, for a role where that is a defect rather than a
 *       design choice (`NAME_REQUIRED`). A `<button>` holding only an `<svg>`
 *       is announced as "button" and nothing else.
 *   R2  the name IS A RAW TRANSLATION KEY. `t()` falls back to the key itself
 *       (`src/store/i18n.ts`: `... || key`), so `aria-label={t('x.y')}` with
 *       `x.y` missing from every dictionary ships the literal string `"x.y"` as
 *       the name — visible to screen readers, invisible in the browser, and no
 *       other gate in the repo sees it.
 *
 * A third rule (`sweepHiddenFocus`) lives here too: a FOCUSABLE element inside an
 * `aria-hidden="true"` subtree. That one is a DOM relation rather than an AX-tree
 * property, so it is read in-page.
 *
 * WHAT THIS CANNOT SEE, AND IT IS NOT A GAP THAT CAN BE CLOSED
 * -----------------------------------------------------------
 * A name that is PRESENT but WRONG — "Close" on a delete button — is not
 * detectable by any automated tool. This checks for ABSENCE, not for truth.
 */

/**
 * Roles where an EMPTY accessible name is a defect.
 *
 * A closed list rather than "every node with a name": most roles legitimately
 * have none (`generic`, `paragraph`, `listitem`, `group`), and including them
 * would bury the signal under thousands of rows. These are the name-required
 * roles the ARIA spec names, minus the ones this repo has no instances of.
 */
export const NAME_REQUIRED = new Set([
  'button',
  'link',
  'checkbox',
  'radio',
  'combobox',
  'listbox',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'textbox',
  'img',
]);

/** A dotted lowercase token — the shape `t()` leaves behind for a missing key. */
export const RAW_KEY = /^[a-z][A-Za-z0-9]*(?:\.[a-z0-9_]+)+$/;

/**
 * Every node violating R1 or R2, with the offending element resolved back to
 * something a reader can act on.
 *
 * `backendDOMNodeId` is resolved for the OFFENDERS only — resolving the whole
 * tree would be thousands of CDP round-trips, and the only reason to resolve at
 * all is that a report saying `<button>` with no file is useless to the next
 * reader. A node that vanishes between the tree read and the resolve is reported
 * bare rather than dropped: dropping it would silently shrink the finding.
 *
 * `overlay` is the index of the open `.u-modal-shell` the element sits inside,
 * or `-1` for the page itself. It is what lets a caller scope the verdict to a
 * dialog without a second traversal.
 *
 * @returns {Promise<{offenders: object[], controlCount: number}>}
 *   `controlCount` counts every named-role node, offenders included, and exists
 *   so a caller can refuse to report a verdict for a page that rendered nothing.
 */
export async function sweepNames(cdp) {
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');

  const offenders = [];
  let controlCount = 0;
  for (const n of nodes) {
    if (n.ignored) continue;
    const role = n.role?.value;
    if (!role) continue;
    const name = (n.name?.value ?? '').trim();
    if (NAME_REQUIRED.has(role)) controlCount++;
    if (NAME_REQUIRED.has(role) && name === '') {
      offenders.push({ rule: 'R1', role, name: '', backendDOMNodeId: n.backendDOMNodeId });
    } else if (name && RAW_KEY.test(name)) {
      offenders.push({ rule: 'R2', role, name, backendDOMNodeId: n.backendDOMNodeId });
    }
  }

  for (const o of offenders) {
    if (!o.backendDOMNodeId) continue;
    try {
      const { object } = await cdp.send('DOM.resolveNode', { backendNodeId: o.backendDOMNodeId });
      const res = await cdp.send('Runtime.callFunctionOn', {
        objectId: object.objectId,
        returnByValue: true,
        functionDeclaration: `function () {
          const el = this;
          const path = [];
          let p = el;
          while (p && p.nodeType === 1 && path.length < 3) {
            const cls = typeof p.className === 'string'
              ? p.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
            path.unshift(p.tagName.toLowerCase() + (p.id ? '#' + p.id : '') + (cls ? '.' + cls : ''));
            p = p.parentElement;
          }
          const ov = el.closest('.u-modal-shell');
          const visible = [...document.querySelectorAll('.u-modal-shell')].filter(
            (x) => (x.offsetWidth > 0 || x.offsetHeight > 0) && x.getAttribute('aria-hidden') !== 'true',
          );
          return JSON.stringify({
            tag: el.tagName.toLowerCase(),
            html: (el.outerHTML || '').replace(/\\s+/g, ' ').slice(0, 200),
            path: path.join(' > '),
            overlay: ov ? visible.indexOf(ov) : -1,
          });
        }`,
      });
      Object.assign(o, JSON.parse(res.result.value));
      await cdp.send('Runtime.releaseObject', { objectId: object.objectId });
    } catch {
      /* the node vanished between the tree read and the resolve — report it bare */
    }
    delete o.backendDOMNodeId;
  }

  return { offenders, controlCount };
}

/**
 * R3 — a focusable element inside an `aria-hidden="true"` subtree.
 *
 * Read in-page because it is a DOM relation, not an AX-tree property. `tabindex="-1"`
 * and `disabled` are excluded because neither is Tab-reachable, and a zero-size
 * element is excluded because `display:none` is not reachable either. The rule
 * has to fire on the real defect and only on it: a check that also fires on
 * unreachable elements is a check that gets muted.
 */
export async function sweepHiddenFocus(page) {
  return page.evaluate(() => {
    const FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex]';
    const out = [];
    for (const holder of document.querySelectorAll('[aria-hidden="true"]')) {
      for (const el of holder.querySelectorAll(FOCUSABLE)) {
        if (el.getAttribute('tabindex') === '-1') continue;
        if (el.disabled) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        out.push({
          tag: el.tagName.toLowerCase(),
          text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
          holder: holder.tagName.toLowerCase() + (holder.id ? `#${holder.id}` : ''),
        });
      }
    }
    return out;
  });
}

/** One offender per line, with where it is and what it is — for a failure message. */
export function describeOffenders(offenders) {
  return offenders
    .map((o) => {
      const where = o.overlay >= 0 ? ` (inside open overlay #${o.overlay})` : '';
      const what = o.rule === 'R2' ? `name is the raw key ${JSON.stringify(o.name)}` : 'name is EMPTY';
      return (
        `\n      [${o.rule}] <${o.tag ?? o.role}>${where} ${what}` +
        `\n        at ${o.path ?? '?'}\n        ${o.html ?? ''}`
      );
    })
    .join('');
}

/** One focusable-in-aria-hidden finding per line — for a failure message. */
export function describeHiddenFocus(hidden) {
  return hidden.map((h) => `<${h.tag}> in ${h.holder}`).join(', ');
}
