/**
 * adminTasks.ts — the "Papan Tugas Tim" scratchpad, as a store.
 *
 * WHY THIS IS A STORE AND NOT COMPONENT STATE
 * -------------------------------------------
 * The board used to be a card in the admin dashboard header, always mounted, so
 * its `useState` lived as long as the panel did. It is now its own sidebar tab
 * (`tugas`), and a tab is mounted and unmounted as the admin switches around —
 * so tab-local `useState` would silently DROP every task on the first tab
 * change. That would be a regression the old always-visible card could not
 * have, introduced by a change that was only supposed to move a widget.
 *
 * A module-level atom keeps exactly the lifetime the board always had — the
 * current admin session — with no new behaviour attached.
 *
 * SCOPE IS STILL LOCAL, ON PURPOSE
 * --------------------------------
 * No network call, no DB table, no Supabase write. A task does not survive a
 * reload, and that is by design rather than an omission: the board is a
 * scratchpad for the current session. Do not "fix" that without asking.
 */
import { atom } from 'nanostores';

/** A row on the board. */
export interface TeamTask {
  id: number;
  text: string;
  done: boolean;
}

export const adminTasks = atom<TeamTask[]>([]);

/**
 * Append a task. Returns `false` — and adds nothing — for a blank or
 * whitespace-only draft, which is what the original inline handler did.
 */
export function addTask(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const prev = adminTasks.get();
  adminTasks.set([...prev, { id: Date.now() + prev.length, text: trimmed, done: false }]);
  return true;
}

export function toggleTask(id: number): void {
  adminTasks.set(adminTasks.get().map((tk) => (tk.id === id ? { ...tk, done: !tk.done } : tk)));
}

export function removeTask(id: number): void {
  adminTasks.set(adminTasks.get().filter((tk) => tk.id !== id));
}
