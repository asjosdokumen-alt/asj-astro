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
import { render, screen, fireEvent, cleanup } from '@testing-library/preact';
import { describe, it, expect, vi, afterEach } from 'vitest';

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

const taskInput = () => screen.getByPlaceholderText('admin.task_placeholder') as HTMLInputElement;
const addButton = () => screen.getByRole('button', { name: 'button.add' });

describe('AdminPanel — Papan Tugas Tim', () => {
  afterEach(() => cleanup());

  it('typing a task and clicking + adds it to the list and clears the input', () => {
    render(<AdminPanel />);

    // The list starts empty (the card renders its empty-state hint).
    expect(screen.queryByText('admin.task_empty')).toBeTruthy();

    fireEvent.input(taskInput(), { target: { value: 'Telepon kandidat TG658' } });
    fireEvent.click(addButton());

    expect(screen.getByText('Telepon kandidat TG658')).toBeTruthy();
    expect(taskInput().value).toBe(''); // the input clears after adding
    expect(screen.queryByText('admin.task_empty')).toBeNull();
  });

  it('the + button refuses a blank / whitespace-only task', () => {
    render(<AdminPanel />);

    fireEvent.input(taskInput(), { target: { value: '   ' } });
    fireEvent.click(addButton());

    expect(screen.queryByText('admin.task_empty')).toBeTruthy();
  });

  it('a task can be marked done and removed', () => {
    render(<AdminPanel />);

    fireEvent.input(taskInput(), { target: { value: 'Kirim undangan kelas' } });
    fireEvent.click(addButton());

    const done = () => screen.getByRole('checkbox', { name: 'admin.task_done' }) as HTMLInputElement;
    expect(done().checked).toBe(false);
    fireEvent.click(done());
    expect(done().checked).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'button.delete' }));
    expect(screen.queryByText('Kirim undangan kelas')).toBeNull();
    expect(screen.queryByText('admin.task_empty')).toBeTruthy();
  });
});
