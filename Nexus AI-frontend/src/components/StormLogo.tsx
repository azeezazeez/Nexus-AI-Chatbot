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
        <linearGradient id="nexusLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4F46E5" />
          <stop offset="100%" stopColor="#9333EA" />
        </linearGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Connection Paths */}
      <path 
        d="M20 20 L50 50 L80 20 M20 80 L50 50 L80 80" 
        stroke="url(#nexusLogoGrad)" 
        strokeWidth="10" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        strokeOpacity="0.4"
      />
      
      {/* Main Core Structure */}
      <path 
        d="M30 30 L70 70 M70 30 L30 70" 
        stroke="url(#nexusLogoGrad)" 
        strokeWidth="12" 
        strokeLinecap="round" 
        filter="url(#glow)"
      />

      {/* Nodes */}
      <circle cx="30" cy="30" r="4" fill="white" className="dark:fill-zinc-900" />
      <circle cx="70" cy="70" r="4" fill="white" className="dark:fill-zinc-900" />
      <circle cx="70" cy="30" r="4" fill="white" className="dark:fill-zinc-900" />
      <circle cx="30" cy="70" r="4" fill="white" className="dark:fill-zinc-900" />
      
      {/* Central Pulsating Core */}
      <circle cx="50" cy="50" r="6" fill="#4F46E5" />
      <circle cx="50" cy="50" r="3" fill="white" />
    </svg>
  );
}
