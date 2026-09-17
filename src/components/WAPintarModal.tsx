/**
 * WAPintarModal.tsx - WhatsApp smart sender with template picker
 * Migrated from legacy/js/08_wa_pintar.ts injectModalWaPintar()
 */
import { useState } from 'preact/hooks';
import { showToast } from './Toast';
import { t } from '../store/i18n';
import Icon from './ui/Icon';
import { useOverlay } from './ui/useOverlay';

interface WaTemplate {
  id: string;
  nama: string;
  isi: string;
}

interface Props {
  candidateName: string;
  candidateJob: string;
  phone: string;
  templates: WaTemplate[];
  onClose: () => void;
}

export default function WAPintarModal({ candidateName, candidateJob, phone, templates, onClose }: Props) {
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    if (!templateId) { setMessage(''); return; }
    const tpl = templates.find(t => t.id === templateId);
    if (!tpl) return;
    let msg = tpl.isi;
    msg = msg.replace(/<<NAMA>>/gi, candidateName);
    msg = msg.replace(/<<JOB>>/gi, candidateJob || 'Umum');
    setMessage(msg);
  };

  const handleSend = () => {
    // B02: toasts via key — parity legacy kirimWaPintar (ui.toast_wa_invalid_cand2 / ui.toast_msg_empty)
    if (!phone) return showToast(t('ui.toast_wa_invalid_cand2'), 'error');
    if (!message.trim()) return showToast(t('ui.toast_msg_empty'), 'error');
    const url = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(message.trim());
    window.open(url, '_blank');
    onClose();
  };

  const { containerRef, onBackdropClick } = useOverlay({ open: true, onClose });

  return (
    <div class="fixed inset-0 u-modal-shell bg-black/70 backdrop-blur-md z-[200] flex items-center justify-center p-4" ref={containerRef} onClick={onBackdropClick}>
      <div class="bg-slate-900 border border-emerald-500/50 p-6 rounded-[2rem] w-full max-w-md shadow-2xl">
        <div class="flex items-center justify-between mb-5">
          <h3 class="text-xl font-bold text-emerald-400">
            <Icon name="whatsapp" class="mr-2" />{t('ui.wa_pintar')}
          </h3>
          <button onClick={onClose} class="text-slate-400 hover:text-white transition">
            <Icon name="times" class="text-2xl" />
          </button>
        </div>

        <div class="space-y-4">
          {/* Candidate info */}
          <div>
            <label class="block text-[10px] font-bold text-slate-400 mb-1" for="wp-tujuan">{t('ui.kandidat_tujuan')}</label>
            <input type="text" id="wp-tujuan" readonly
                   value={candidateName + ' (' + (candidateJob || 'Umum') + ')'}
                   class="w-full p-2.5 rounded-lg bg-black/40 border border-slate-700 text-emerald-300 text-sm font-bold outline-none cursor-not-allowed" />
          </div>

          {/* Template picker */}
          <div>
            <label class="block text-[10px] font-bold text-slate-400 mb-1" for="wp-template">{t('ui.pilih_template_pesan')}</label>
            <select id="wp-template" value={selectedTemplate}
                    onChange={e => handleTemplateSelect((e.target as HTMLSelectElement).value)}
                    class="w-full p-2.5 rounded-lg bg-black/60 border border-slate-700 text-white text-sm outline-none focus:border-emerald-500 transition">
              <option value="">{t('ui.manual_or_template')}</option>
              {templates.map(tpl => (
                <option value={tpl.id}>{tpl.nama}</option>
              ))}
            </select>
          </div>

          {/* Message textarea */}
          <div>
            <label class="block text-[10px] font-bold text-slate-400 mb-1" for="wp-pesan">{t('ui.isi_pesan_custom')}</label>
            <textarea rows={6} id="wp-pesan" value={message}
                      onInput={e => setMessage((e.target as HTMLTextAreaElement).value)}
                      class="w-full p-2.5 rounded-lg bg-black/60 border border-slate-700 text-white text-sm outline-none focus:border-emerald-500 transition leading-relaxed resize-none"
                      placeholder={t('ui.ketik_pesan_ph')}></textarea>
          </div>

          {/* Send button */}
          <button onClick={handleSend}
                  class="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold shadow-lg transition text-base mt-2">
            <Icon name="whatsapp" class="mr-2" />{t('ui.wa_open_send')}
          </button>
        </div>
      </div>
    </div>
  );
}
