/**
 * TabTugas.tsx — "Papan Tugas Tim" as a sidebar tab.
 *
 * MOVED 2026-09-26 out of the admin dashboard header, at the owner's request:
 * the header (Agenda + Papan Tugas) was mounted above EVERY tab, so it ate the
 * top of every page and the panel read as cluttered — "tata letak tidak lagi
 * memenuhi layar ... fokus pengguna tetap tertuju pada navigasi tab menu".
 * The board is now reached from the sidebar like any other tab, and its content
 * renders in the same content area as Jadwal Agenda.
 *
 * State lives in `store/adminTasks.ts`, NOT here. As tab-local `useState` it
 * would be destroyed on the first tab change and silently drop every task —
 * see the note in that file.
 */
import { useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { t, useLang } from '../../store/i18n';
import { adminTasks, addTask, toggleTask, removeTask } from '../../store/adminTasks';
import Icon from '../ui/Icon';

export default function TabTugas() {
  useLang();
  const tasks = useStore(adminTasks);
  const [draft, setDraft] = useState('');

  function submit() {
    // `addTask` refuses a blank draft, and only a real add clears the box.
    if (addTask(draft)) setDraft('');
  }

  return (
    <div>
      <div class="flex justify-between items-center border-b border-pink-900/50 pb-4 mb-4">
        <h2 class="text-pink-400 font-bold text-lg">
          <Icon name="tasks" class="mr-2" /> {t('admin.task_board')}
        </h2>
      </div>

      <div class="flex gap-2 mb-3">
        <input
          type="text"
          id="todo-input"
          value={draft}
          onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => { if ((e as KeyboardEvent).key === 'Enter') submit(); }}
          class="min-h-11 flex-1 bg-black p-2.5 rounded-lg text-sm text-white border border-slate-600 outline-none focus:border-pink-500 transition"
          placeholder={t('admin.task_placeholder')}
          aria-label={t('admin.task_placeholder')}
        />
        <button
          type="button"
          onClick={submit}
          class="bg-red-600 hover:bg-red-500 px-5 rounded-lg text-sm text-white font-bold transition shadow-lg"
          aria-label={t('button.add')}
        >
          <Icon name="plus" />
        </button>
      </div>

      {/* The cap is larger than the old card's 190px because this is now a full
          page rather than a quarter-width dashboard tile; it still scrolls
          internally so a long list cannot push the tab into one endless column. */}
      <div id="todo-list" class="u-scroll-area custom-scrollbar pr-2 space-y-2" style={{ maxHeight: '380px' }}>
        {tasks.length === 0 && (
          <p class="text-xs text-slate-500">{t('admin.task_empty')}</p>
        )}
        {tasks.map((task) => (
          <div key={task.id} class="flex items-center gap-2 bg-black/40 border border-slate-700 rounded-lg px-3 py-2">
            <input
              type="checkbox"
              checked={task.done}
              onChange={() => toggleTask(task.id)}
              aria-label={t('admin.task_done')}
              class="accent-pink-500 shrink-0"
            />
            <span class={`flex-1 min-w-0 break-words text-sm ${task.done ? 'line-through text-slate-500' : 'text-white'}`}>{task.text}</span>
            <button type="button" onClick={() => removeTask(task.id)} aria-label={t('button.delete')} class="text-slate-400 hover:text-red-400 transition shrink-0">
              <Icon name="times" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
