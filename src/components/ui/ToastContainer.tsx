import React from 'react';
import { useApp } from '../../context/AppContext';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed z-50 pointer-events-none flex flex-col gap-2 w-full max-w-sm px-4 safe-bottom-toasts md:bottom-auto md:top-6 md:right-6 left-1/2 md:left-auto -translate-x-1/2 md:translate-x-0">
      {toasts.map((toast) => {
        // Colores y estilos basados en el tipo
        let bgStyle = 'bg-slate-900 border-slate-800 text-slate-100';
        let Icon = Info;
        let iconColor = 'text-blue-400';

        if (toast.type === 'success') {
          bgStyle = 'bg-slate-950 border-brand-emerald/30 text-slate-100 shadow-lg';
          Icon = CheckCircle2;
          iconColor = 'text-brand-emerald';
        } else if (toast.type === 'error') {
          bgStyle = 'bg-slate-950 border-brand-rose/30 text-slate-100 shadow-lg';
          Icon = AlertCircle;
          iconColor = 'text-brand-rose';
        } else if (toast.type === 'info') {
          bgStyle = 'bg-slate-950 border-lux-accent/30 text-slate-100 shadow-lg';
          Icon = Info;
          iconColor = 'text-lux-accent';
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3.5 rounded-2xl border shadow-2xl animate-slide-up duration-300 w-full ${bgStyle}`}
          >
            <Icon className={`${iconColor} shrink-0`} size={18} />
            <p className="flex-1 text-xs font-bold tracking-wide">{toast.message}</p>
            <button
              onClick={() => removeToast(toast.id)}
              className="p-1 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors duration-150"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
