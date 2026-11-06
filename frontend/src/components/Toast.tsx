import { useEffect, useState, useCallback } from 'react';
import { X } from 'lucide-react';

export type ToastLevel = 'info' | 'success' | 'warning' | 'error';

export interface ToastItem {
  id: number;
  message: string;
  level: ToastLevel;
}

let _nextId = 1;

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((message: string, level: ToastLevel = 'info') => {
    const id = _nextId++;
    setToasts(prev => [...prev, { id, message, level }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, push, dismiss };
}

export function ToastContainer({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  if (!toasts.length) return null;
  return (
    <div className="toast-container" aria-live="polite" aria-atomic="false">
      {toasts.map(t => (
        <ToastEntry key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastEntry({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className={`toast toast-${toast.level}${visible ? ' toast-in' : ''}`} role="status">
      <span className="toast-msg">{toast.message}</span>
      <button className="toast-close" onClick={() => onDismiss(toast.id)} aria-label="닫기"><X size={14}/></button>
    </div>
  );
}
