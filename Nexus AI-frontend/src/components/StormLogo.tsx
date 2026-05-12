/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface Props {
  className?: string;
}

export default function StormLogo({ className = "" }: Props) {
  return (
    <svg 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg" 
      className={className}
    >
      <defs>
        <linearGradient id="nexusGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="50%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#d946ef" />
        </linearGradient>
        <filter id="nexusGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Decorative Outer Rings */}
      <circle cx="50" cy="50" r="48" stroke="currentColor" strokeWidth="0.25" strokeOpacity="0.1" strokeDasharray="4 2" />
      <circle cx="50" cy="50" r="42" stroke="currentColor" strokeWidth="0.5" strokeOpacity="0.05" />

      {/* Interconnected Network Grid (Simplified) */}
      <g stroke="currentColor" strokeWidth="0.5" strokeOpacity="0.1">
        <line x1="20" y1="50" x2="80" y2="50" />
        <line x1="50" y1="20" x2="50" y2="80" />
        <line x1="30" y1="30" x2="70" y2="70" />
        <line x1="70" y1="30" x2="30" y2="70" />
      </g>

      {/* Stylized Nexus "X" / Core */}
      <path 
        d="M30 30L50 50L70 30M30 70L50 50L70 70" 
        stroke="url(#nexusGrad)" 
        strokeWidth="8" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        filter="url(#nexusGlow)"
      />

      {/* Connection Points (Nodes) */}
      <circle cx="30" cy="30" r="3" fill="#6366f1" />
      <circle cx="70" cy="30" r="3" fill="#8b5cf6" />
      <circle cx="30" cy="70" r="3" fill="#8b5cf6" />
      <circle cx="70" cy="70" r="3" fill="#d946ef" />
      
      {/* Interactive Core pulsing effect (semantic) */}
      <circle cx="50" cy="50" r="5" fill="white" className="dark:fill-zinc-900 shadow-sm" />
      <circle cx="50" cy="50" r="2.5" fill="url(#nexusGrad)" />
    </svg>
  );
}
