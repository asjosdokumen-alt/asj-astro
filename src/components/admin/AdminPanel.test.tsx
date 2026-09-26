// ==========================================
// TESTS: AdminPanel — the "Papan Tugas Tim" (Team Task Board) card
//
// The card LOOKED live and did nothing. Measured before this file existed:
// a click-sweep that fired el.click() on every visible enabled control on
// /admin (with a fabricated admin session) found exactly ONE no-op — the
// button with aria-label={t('button.add')} — and a repo-wide grep for
// todo-input / todo-list returned only the two markup lines and their i18n
// strings, i.e. nothing else in the tree wrote to them. So the input had no
// state binding, the + button had no onClick, and #todo-list was never
// populated: type a task, click +, nothing happens, the list stays empty.
//
// These tests pin the behaviour that replaced the no-op: a task can be added,
// the input clears, a blank task is refused, and a task can be marked done and
// removed. SCOPE IS LOCAL COMPONENT STATE on purpose — no network call, no DB
// table, no Supabase persistence.
//
// The panel's heavy children are mocked away: none of them is under test here,
// and rendering the whole admin surface would drag in their data fetching.
// ==========================================
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./TabKelola.tsx', () => ({ default: () => null }));
vi.mock('./TabPelamar.tsx', () => ({ default: () => null }));
vi.mock('./TabDbJob.tsx', () => ({ default: () => null }));
vi.mock('./TabTambah.tsx', () => ({ default: () => null }));
vi.mock('./TabMail.tsx', () => ({ default: () => null }));
vi.mock('./TabJadwal.tsx', () => ({ default: () => null }));
vi.mock('./TabWA.tsx', () => ({ default: () => null }));
vi.mock('./TabConfig.tsx', () => ({ default: () => null }));
vi.mock('./PemberkasanModal', () => ({ default: () => null }));
vi.mock('./UndanganKelasModal', () => ({ default: () => null }));
vi.mock('./AdminAiCopilot', () => ({ default: () => null }));
vi.mock('./CandidateProfileModal', () => ({ default: () => null }));
vi.mock('./EditCandidateModal', () => ({ default: () => null }));
vi.mock('./MatchmakingModal', () => ({ default: () => null }));

vi.mock('../Toast', () => ({ showToast: vi.fn() }));

// Keep the real store (AdminPanel calls useLang(), which reads it) but make t()
// a pass-through so assertions read the key names, like MatchmakingModal.test.
vi.mock('../../store/i18n', async () => {
  const actual = await vi.importActual<typeof import('../../store/i18n')>('../../store/i18n');
  return { ...actual, t: (k: string) => k };
});

import AdminPanel from './AdminPanel';
import { adminTasks } from '../../store/adminTasks';

const taskInput = () => screen.getByPlaceholderText('admin.task_placeholder') as HTMLInputElement;
const addButton = () => screen.getByRole('button', { name: 'button.add' });

/**
 * Open the `tugas` tab. The board moved out of the dashboard header into a
 * sidebar tab on 2026-09-26, so it is no longer on the default tab (`kelola`).
 * `t()` is a pass-through in this file, so the button's accessible name is the
 * raw key.
 */
const openTugasTab = () =>
  fireEvent.click(screen.getByRole('button', { name: 'admin.tab_tugas' }));

describe('AdminPanel — Papan Tugas Tim', () => {
  beforeEach(() => {
    // The board's state is a module-level store now, because a tab unmounts
    // when the admin switches away and component state would have dropped every
    // task. That means it is NOT reset by unmounting — clear it per test, or
    // one test's tasks leak into the next.
    adminTasks.set([]);
  });
  afterEach(() => cleanup());

  it('typing a task and clicking + adds it to the list and clears the input', () => {
    render(<AdminPanel />);
    openTugasTab();

    // The list starts empty (the tab renders its empty-state hint).
    expect(screen.queryByText('admin.task_empty')).toBeTruthy();

    fireEvent.input(taskInput(), { target: { value: 'Telepon kandidat TG658' } });
    fireEvent.click(addButton());

    expect(screen.getByText('Telepon kandidat TG658')).toBeTruthy();
    expect(taskInput().value).toBe(''); // the input clears after adding
    expect(screen.queryByText('admin.task_empty')).toBeNull();
  });

  it('the + button refuses a blank / whitespace-only task', () => {
    render(<AdminPanel />);
    openTugasTab();

    fireEvent.input(taskInput(), { target: { value: '   ' } });
    fireEvent.click(addButton());

    expect(screen.queryByText('admin.task_empty')).toBeTruthy();
  });

  it('a task can be marked done and removed', async () => {
    render(<AdminPanel />);
    openTugasTab();

    fireEvent.input(taskInput(), { target: { value: 'Kirim undangan kelas' } });
    fireEvent.click(addButton());

    const done = () => screen.getByRole('checkbox', { name: 'admin.task_done' }) as HTMLInputElement;
    expect(done().checked).toBe(false);
    fireEvent.click(done());
    expect(done().checked).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'button.delete' }));
    // `useStore` notifies asynchronously, and unlike the add path there is no
    // accompanying component-state change (`setDraft('')`) to force a
    // synchronous re-render — so this one has to be awaited.
    await waitFor(() => expect(screen.queryByText('Kirim undangan kelas')).toBeNull());
    expect(screen.queryByText('admin.task_empty')).toBeTruthy();
  });

  it('the board is NOT on the default tab any more, and switching away keeps its tasks', () => {
    render(<AdminPanel />);

    // The whole point of the move: the dashboard header is gone, so the board
    // must not be reachable without choosing its tab.
    expect(screen.queryByPlaceholderText('admin.task_placeholder')).toBeNull();

    openTugasTab();
    fireEvent.input(taskInput(), { target: { value: 'Tugas yang harus bertahan' } });
    fireEvent.click(addButton());
    expect(screen.getByText('Tugas yang harus bertahan')).toBeTruthy();

    // Leave and come back — the task must survive the unmount, which is exactly
    // what tab-local useState could not do.
    fireEvent.click(screen.getByRole('button', { name: 'admin.tab_mail' }));
    expect(screen.queryByText('Tugas yang harus bertahan')).toBeNull();
    openTugasTab();
    expect(screen.getByText('Tugas yang harus bertahan')).toBeTruthy();
  });
});
