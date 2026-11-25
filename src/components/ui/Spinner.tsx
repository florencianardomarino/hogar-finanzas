import React from 'react';

interface SpinnerProps {
  /** Lado en píxeles */
  size?: number;
  className?: string;
}

/** Indicador de carga; hereda el color del texto (currentColor). */
export const Spinner: React.FC<SpinnerProps> = ({ size = 16, className = '' }) => (
  <span
    aria-hidden="true"
    className={`inline-block shrink-0 rounded-full border-2 border-current border-t-transparent animate-spin ${className}`}
    style={{ width: size, height: size }}
  />
);
