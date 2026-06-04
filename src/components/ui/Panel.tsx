import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface PanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const Panel: React.FC<PanelProps> = ({ isOpen, onClose, title, children }) => {
  const [shouldRender, setShouldRender] = useState(isOpen);

  // Lógica para manejar animaciones de cierre
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      document.body.style.overflow = 'hidden'; // Bloquear scroll en fondo
    } else {
      const timer = setTimeout(() => {
        setShouldRender(false);
        document.body.style.overflow = '';
      }, 300); // Duración de la animación
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!shouldRender) return null;

  return (
    <div className="fixed inset-0 z-[100] flex md:justify-end items-end md:items-stretch">
      {/* Fondo desenfocado */}
      <div 
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      {/* Contenedor del Panel */}
      <div 
        className={`relative w-full max-h-[92vh] md:max-h-screen md:w-[460px] glass-panel flex flex-col rounded-t-3xl md:rounded-t-none md:rounded-l-3xl shadow-2xl transform transition-transform duration-300 ease-out z-10 ${
          isOpen 
            ? 'translate-y-0 md:translate-x-0' 
            : 'translate-y-full md:translate-x-full'
        }`}
      >
        {/* Barra superior del Bottom Sheet en Móviles */}
        <div className="flex md:hidden justify-center py-3 select-none" onClick={onClose}>
          <div className="w-12 h-1.5 bg-lux-border/80 rounded-full cursor-pointer hover:bg-lux-accent/50 transition-colors" />
        </div>

        {/* Encabezado del Panel */}
        <div className="flex items-center justify-between px-6 pb-4 pt-2 md:pt-6 border-b border-lux-border/40">
          <h3 className="text-xl font-bold font-sans text-gradient-sky">{title}</h3>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-lux-border/50 text-lux-muted hover:text-lux-text transition-colors duration-200"
          >
            <X size={20} />
          </button>
        </div>

        {/* Contenido con scroll independiente */}
        <div className="flex-1 overflow-y-auto px-6 pt-4 pb-48 md:pb-6">
          {children}
        </div>
      </div>
    </div>
  );
};
