/**
 * ESignatureModal.tsx - Digital signature canvas pad
 * Migrated from legacy/js/12_esign_match.ts
 * Full-screen canvas for finger/mouse signature, save as image
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { showToast } from './Toast';
import Icon from './ui/Icon';
import { useOverlay } from './ui/useOverlay';

interface Props {
  title?: string;
  onSave: (dataUrl: string) => void;
  onClose: () => void;
}

export default function ESignatureModal({ title = 'Tanda Tangan Digital', onSave, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const STROKE_COLOR = '#ffffff';
  const STROKE_WIDTH = 2.5;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    ctx.strokeStyle = STROKE_COLOR;
    ctx.lineWidth = STROKE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // White background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, rect.width, rect.height);
    // Draw hint text
    ctx.fillStyle = '#475569';
    ctx.font = '14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Gunakan jari di area putih di atas', rect.width / 2, rect.height / 2);
  }, []);

  const getPos = (e: MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const touch = ("touches" in e && e.touches?.[0]) ? e.touches[0] : (e as MouseEvent);
    return {
      x: (touch.clientX - rect.left),
      y: (touch.clientY - rect.top),
    };
  };

  const startDraw = (e: MouseEvent | TouchEvent) => {
    e.preventDefault();
    setIsDrawing(true);
    setHasDrawn(true);
    lastPos.current = getPos(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.strokeStyle = STROKE_COLOR;
      ctx.lineWidth = STROKE_WIDTH;
    }
  };

  const draw = (e: MouseEvent | TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
  };

  const stopDraw = () => setIsDrawing(false);

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = '#475569';
    ctx.font = '14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Gunakan jari di area putih di atas', rect.width / 2, rect.height / 2);
    setHasDrawn(false);
  };

  const handleSave = () => {
    if (!hasDrawn) return showToast('Harap isi minimal 1 kotak gambar sebelum menyimpan!', 'error');
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    onSave(dataUrl);
    onClose();
  };

  const { containerRef, onBackdropClick } = useOverlay({ open: true, onClose });

  return (
    <div class="fixed inset-0 u-modal-shell bg-black/80 backdrop-blur-md z-[300] flex flex-col" ref={containerRef} onClick={onBackdropClick}>
      <div class="bg-slate-900 border border-slate-700 rounded-t-2xl w-full flex-1 flex flex-col overflow-hidden shadow-2xl max-h-[90vh]">
        {/* Header */}
        <div class="flex items-center justify-between px-4 py-3 border-b border-slate-700 shrink-0">
          <h3 class="text-sm font-bold text-white">
            <Icon name="pen-fancy" class="mr-2 text-amber-400" />{title}
          </h3>
          <button onClick={onClose} class="text-slate-400 hover:text-white transition">
            <Icon name="times" class="text-xl" />
          </button>
        </div>
        {/* Canvas */}
        <div class="flex-1 p-4 flex items-center justify-center overflow-hidden">
          <canvas ref={canvasRef}
                  class="w-full max-w-lg h-48 md:h-64 rounded-xl border border-slate-600 cursor-crosshair touch-none"
                  onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
                  onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw} />
        </div>
        {/* Actions */}
        <div class="flex gap-3 px-4 py-3 border-t border-slate-700 shrink-0">
          <button onClick={handleClear}
                  class="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold text-sm transition">
            <Icon name="eraser" class="mr-2" />Hapus & Ulangi
          </button>
          <button onClick={handleSave}
                  class="flex-1 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold text-sm transition shadow-lg">
            <Icon name="save" class="mr-2" />Simpan TTD
          </button>
        </div>
      </div>
    </div>
  );
}
