import React from 'react';

interface HomeflowLogoProps {
  className?: string;
  size?: number;
}

export const HomeflowLogo: React.FC<HomeflowLogoProps> = ({ className = '', size = 28 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="homeflow-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3B82F6" /> {/* Blue 500 */}
          <stop offset="50%" stopColor="#6366F1" /> {/* Indigo 500 */}
          <stop offset="100%" stopColor="#EC4899" /> {/* Pink 500 */}
        </linearGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      
      {/* Silueta abstracta y elegante de una casa con líneas de flujo financiero */}
      <path
        d="M20 45L50 18L80 45V80C80 82.2091 78.2091 84 76 84H24C21.7909 84 20 82.2091 20 80V45Z"
        stroke="url(#homeflow-grad)"
        strokeWidth="6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      
      {/* Techo flotante sutil para dar dinamismo tridimensional */}
      <path
        d="M14 50L50 20L86 50"
        stroke="url(#homeflow-grad)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.6"
      />
      
      {/* Onda elegante de crecimiento financiero (flujo ascendente) que cruza el hogar */}
      <path
        d="M32 64C42 54 58 74 68 62"
        stroke="url(#homeflow-grad)"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#glow)"
      />
      
      {/* Pequeño punto satinado de culminación en el flujo */}
      <circle cx="68" cy="62" r="3.5" fill="#EC4899" />
    </svg>
  );
};

export default HomeflowLogo;
