import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle2, XCircle, Info, AlertTriangle, X, AlertCircle } from 'lucide-react';

// ─── Toast Types ────────────────────────────────────────────────────────────
type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

// ─── Confirm Types ───────────────────────────────────────────────────────────
interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

// ─── Context ─────────────────────────────────────────────────────────────────
interface ToastContextValue {
  toast: {
    success: (title: string, message?: string) => void;
    error: (title: string, message?: string) => void;
    info: (title: string, message?: string) => void;
    warning: (title: string, message?: string) => void;
  };
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

// ─── Icons ───────────────────────────────────────────────────────────────────
const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 size={20} />,
  error: <XCircle size={20} />,
  info: <Info size={20} />,
  warning: <AlertTriangle size={20} />,
};

const styles: Record<ToastType, string> = {
  success: 'bg-emerald-600 text-white',
  error:   'bg-red-600 text-white',
  info:    'bg-primary text-white',
  warning: 'bg-amber-500 text-white',
};

// ─── Provider ────────────────────────────────────────────────────────────────
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const idRef = useRef(0);

  const addToast = useCallback((type: ToastType, title: string, message?: string) => {
    const id = String(++idRef.current);
    setToasts(prev => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const toast = {
    success: (title: string, message?: string) => addToast('success', title, message),
    error:   (title: string, message?: string) => addToast('error', title, message),
    info:    (title: string, message?: string) => addToast('info', title, message),
    warning: (title: string, message?: string) => addToast('warning', title, message),
  };

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmState({ ...options, resolve });
    });
  }, []);

  const handleConfirm = (result: boolean) => {
    confirmState?.resolve(result);
    setConfirmState(null);
  };

  return (
    <ToastContext.Provider value={{ toast, confirm }}>
      {children}

      {/* ── Toast Container ── */}
      <div className="fixed bottom-6 right-6 z-[99999] flex flex-col gap-3 pointer-events-none" style={{ maxWidth: 360 }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 px-4 py-3.5 rounded-2xl shadow-2xl backdrop-blur-sm animate-slideUp ${styles[t.type]}`}
            style={{ animation: 'slideUp 0.25s cubic-bezier(.17,.67,.35,1.2) both' }}
          >
            <span className="shrink-0 mt-0.5">{icons[t.type]}</span>
            <div className="min-w-0 flex-1">
              <p className="font-black text-sm leading-tight">{t.title}</p>
              {t.message && <p className="text-xs mt-0.5 opacity-90 leading-relaxed">{t.message}</p>}
            </div>
            <button
              onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              className="shrink-0 opacity-70 hover:opacity-100 transition-opacity"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>

      {/* ── Confirm Dialog ── */}
      {confirmState && (
        <div className="fixed inset-0 z-[99998] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
            style={{ animation: 'slideUp 0.2s cubic-bezier(.17,.67,.35,1.2) both' }}
          >
            <div className="p-6">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${confirmState.danger ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-primary'}`}>
                {confirmState.danger ? <AlertCircle size={24} /> : <AlertTriangle size={24} />}
              </div>
              <h3 className="text-lg font-black text-slate-900 mb-2">{confirmState.title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{confirmState.message}</p>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={() => handleConfirm(false)}
                className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors"
              >
                {confirmState.cancelLabel || 'ยกเลิก'}
              </button>
              <button
                onClick={() => handleConfirm(true)}
                className={`flex-[1.5] py-2.5 rounded-xl font-bold text-sm text-white transition-colors ${confirmState.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primary-container'}`}
              >
                {confirmState.confirmLabel || 'ยืนยัน'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}
