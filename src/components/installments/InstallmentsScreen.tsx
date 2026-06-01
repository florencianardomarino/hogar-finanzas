import React from 'react';
import { useApp } from '../../context/AppContext';
import { getPeriodLabel } from '../../utils/dateUtils';
import { CreditCard, CalendarDays, Percent, Trash2, CheckCircle2, ChevronRight } from 'lucide-react';

export const InstallmentsScreen: React.FC = () => {
  const { installments, cancelInstallment, currentPeriod, showToast } = useApp();

  // Separar cuotas activas de archivadas
  const activeInstallments: any[] = [];
  const finishedInstallments: any[] = [];

  installments.forEach((inst) => {
    const firstMonth = inst.first_debit_month;
    const firstYear = inst.first_debit_year;
    const total = inst.num_installments;

    // Calcular cuántos meses han pasado desde el primer débito hasta el mes actual del sistema
    const elapsedMonths = (currentPeriod.year - firstYear) * 12 + (currentPeriod.month - firstMonth);
    
    // El número de cuotas cobradas es el transcurrido + 1 (si el mes actual es posterior o igual al inicio)
    let paidCount = 0;
    if (elapsedMonths >= 0) {
      paidCount = Math.min(elapsedMonths, total); // Si el mes ya pasó la duración, son todas las cuotas
    }

    const isFinished = paidCount >= total;

    const enriched = {
      ...inst,
      paidCount,
      isFinished,
      progressPercent: Math.min((paidCount / total) * 100, 100)
    };

    if (isFinished) {
      finishedInstallments.push(enriched);
    } else {
      activeInstallments.push(enriched);
    }
  });

  const handleCancel = async (id: string, desc: string) => {
    if (window.confirm(`¿Estás seguro de que deseas cancelar la compra en cuotas "${desc}"? Se eliminará su proyección futura de los meses.`)) {
      await cancelInstallment(id);
    }
  };

  return (
    <div className="px-4 py-5 pb-24 animate-fade-in">
      <div className="mb-6">
        <h2 className="text-xl font-extrabold font-sans text-gradient-sky">Cuotas y Préstamos</h2>
        <p className="text-xs text-lux-muted mt-0.5">Control y proyección de compras a plazos y préstamos a largo plazo</p>
      </div>

      {/* 1. SECCIÓN DE CUOTAS ACTIVAS */}
      <div className="flex flex-col gap-4">
        <h3 className="text-xs font-bold text-lux-muted uppercase tracking-wider px-1">Cuotas Activas ({activeInstallments.length})</h3>

        {activeInstallments.length === 0 ? (
          <div className="glass-panel p-8 rounded-3xl border-lux-border/40 text-center flex flex-col items-center justify-center">
            <Percent size={32} className="text-lux-muted mb-2.5" />
            <p className="text-sm font-bold text-lux-text">No hay cuotas activas</p>
            <p className="text-xs text-lux-muted mt-1 max-w-xs">
              Registra compras grandes (electrodomésticos, viajes) en cuotas desde el Dashboard (+) para proyectarlas en los meses correspondientes de forma automática.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            {activeInstallments.map((inst) => (
              <div 
                key={inst.id}
                className="glass-panel p-5 rounded-3xl border-lux-border/30 flex flex-col gap-3 relative overflow-hidden"
              >
                {/* Cabecera del ítem */}
                <div className="flex justify-between items-start">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-extrabold text-lux-text">{inst.description}</span>
                    <span className="text-[10px] text-lux-muted font-semibold flex items-center gap-1">
                      <CalendarDays size={12} />
                      Primer débito: {getPeriodLabel(inst.first_debit_year, inst.first_debit_month)}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-sm font-extrabold text-lux-accent">
                      {Number(inst.amount_per_installment).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}/mes
                    </span>
                    <span className="text-[9px] text-lux-muted">Total: {Number(inst.total_amount).toFixed(2)}€</span>
                  </div>
                </div>

                {/* Barra de progreso visual */}
                <div className="flex flex-col gap-1.5 mt-1">
                  <div className="flex justify-between items-center text-[10px] font-bold">
                    <span className="text-lux-muted">Progreso de Pago</span>
                    <span className="text-lux-text">{inst.paidCount} de {inst.num_installments} cuotas</span>
                  </div>
                  <div className="w-full h-2 bg-lux-border/20 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-lux-accent to-brand-indigo rounded-full transition-all duration-500"
                      style={{ width: `${inst.progressPercent}%` }}
                    />
                  </div>
                </div>

                {/* Pie con detalles y botón de eliminar */}
                <div className="flex justify-between items-center pt-2 border-t border-lux-border/10 text-[10px] text-lux-muted font-semibold">
                  <span className="flex items-center gap-1">
                    <CreditCard size={12} />
                    {inst.payment_type === 'credit_card' ? 'Tarjeta' : 'Cuenta'}: {inst.account}
                  </span>

                  <button
                    onClick={() => handleCancel(inst.id, inst.description)}
                    className="p-1.5 rounded-full hover:bg-brand-rose/10 text-brand-rose hover:text-red-400 transition-colors flex items-center gap-1"
                    title="Cancelar compra en cuotas"
                  >
                    <Trash2 size={12} />
                    <span>Cancelar</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. SECCIÓN DE CUOTAS FINALIZADAS */}
      {finishedInstallments.length > 0 && (
        <div className="flex flex-col gap-3 mt-8">
          <h3 className="text-xs font-bold text-lux-muted uppercase tracking-wider px-1">Historial Completadas ({finishedInstallments.length})</h3>
          
          <div className="flex flex-col gap-2.5 opacity-60 hover:opacity-90 transition-opacity">
            {finishedInstallments.map((inst) => (
              <div 
                key={inst.id}
                className="glass-panel px-4 py-3 rounded-2xl border-lux-border/20 flex justify-between items-center text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 size={16} className="text-brand-emerald shrink-0" />
                  <div className="flex flex-col">
                    <span className="font-bold text-lux-text line-through">{inst.description}</span>
                    <span className="text-[10px] text-lux-muted">Finalizó en {getPeriodLabel(inst.first_debit_year + Math.floor((inst.first_debit_month + inst.num_installments - 2) / 12), ((inst.first_debit_month + inst.num_installments - 2) % 12) + 1)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span className="font-bold text-lux-muted">{Number(inst.total_amount).toFixed(2)}€</span>
                  <button
                    onClick={() => handleCancel(inst.id, inst.description)}
                    className="text-brand-rose hover:text-red-400 transition-colors"
                    title="Eliminar historial"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
