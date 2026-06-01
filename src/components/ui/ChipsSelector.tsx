import React from 'react';

export interface ChipOption<T> {
  value: T;
  label: string;
  color?: string; // Color personalizado cuando está seleccionado (clase CSS o hex)
  icon?: React.ReactNode;
}

interface ChipsSelectorProps<T> {
  options: ChipOption<T>[];
  selectedValue: T;
  onChange: (value: T) => void;
  label?: string;
}

export function ChipsSelector<T>({
  options,
  selectedValue,
  onChange,
  label
}: ChipsSelectorProps<T>) {
  return (
    <div className="flex flex-col gap-2">
      {label && <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">{label}</label>}
      <div className="flex flex-wrap gap-2">
        {options.map((opt, idx) => {
          const isSelected = opt.value === selectedValue;
          
          // Estilo dinámico si está seleccionado
          let activeStyle = 'border-lux-accent bg-lux-accent/15 text-lux-accent shadow-lg shadow-lux-accent/5';
          if (opt.color && isSelected) {
            activeStyle = opt.color;
          }

          return (
            <button
              key={idx}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-sm font-medium transition-all duration-200 ease-out select-none active:scale-95 ${
                isSelected
                  ? activeStyle
                  : 'border-lux-border/40 bg-lux-panel/30 text-lux-muted hover:border-lux-border hover:bg-lux-panel/50 hover:text-lux-text'
              }`}
            >
              {opt.icon && <span className="shrink-0">{opt.icon}</span>}
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
