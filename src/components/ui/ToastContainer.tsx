import React from 'react';
import { useApp } from '../../context/AppContext';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed z-50 pointer-events-none flex flex-col gap-2 w-full max-w-sm px-4 bottom-20 md:bottom-auto md:top-6 md:right-6 left-1/2 md:left-auto -translate-x-1/2 md:translate-x-0">
      {toasts.map((toast) => {
        // Colores y estilos basados en el tipo
        let bgStyle = 'bg-slate-900 border-slate-800 text-slate-100';
        let Icon = Info;
        let iconColor = 'text-blue-400';

        if (toast.type === 'success') {
          bgStyle = 'bg-slate-900/90 backdrop-blur-md border-emerald-500/30 text-emerald-100 dark:bg-emerald-950/80 dark:border-emerald-500/20';
          Icon = CheckCircle2;
          iconColor = 'text-brand-emerald';
        } else if (toast.type === 'error') {
          bgStyle = 'bg-slate-900/90 backdrop-blur-md border-red-500/30 text-red-100 dark:bg-red-950/80 dark:border-red-500/20';
          Icon = AlertCircle;
          iconColor = 'text-brand-rose';
        } else if (toast.type === 'info') {
          bgStyle = 'bg-slate-900/90 backdrop-blur-md border-blue-500/30 text-blue-100 dark:bg-blue-950/80 dark:border-blue-500/20';
          Icon = Info;
          iconColor = 'text-lux-accent';
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-xl animate-slide-up duration-300 w-full`}
          >
            <Icon className={`${iconColor} shrink-0`} size={20} />
            <p className="flex-1 text-sm font-medium">{toast.message}</p>
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
