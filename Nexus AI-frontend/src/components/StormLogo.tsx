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
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Background Nexus Pattern */}
      <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="0.5" strokeOpacity="0.1" />
      <circle cx="50" cy="50" r="35" stroke="currentColor" strokeWidth="0.25" strokeOpacity="0.05" />

      {/* Connection Lines (Nexus Network) */}
      <g stroke="currentColor" strokeWidth="0.5" strokeOpacity="0.1" strokeDasharray="2 2">
        <line x1="25" y1="25" x2="75" y2="75" />
        <line x1="75" y1="25" x2="25" y2="75" />
        <line x1="50" y1="20" x2="50" y2="80" />
        <line x1="20" y1="50" x2="80" y2="50" />
      </g>

      {/* Stylized 'N' Core */}
      <path 
        d="M32 70V30L68 70V30" 
        stroke="url(#nexusGrad)" 
        strokeWidth="12" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        filter="url(#nexusGlow)"
      />

      {/* Interaction Nodes */}
      <circle cx="32" cy="70" r="4" fill="#6366f1" />
      <circle cx="32" cy="30" r="4" fill="#8b5cf6" />
      <circle cx="68" cy="70" r="4" fill="#8b5cf6" />
      <circle cx="68" cy="30" r="4" fill="#d946ef" />

      {/* Central Nexus Point */}
      <circle cx="50" cy="50" r="6" fill="currentColor" className="opacity-10 shadow-sm" />
      <circle cx="50" cy="50" r="2.5" fill="white" className="dark:fill-zinc-900" />
      <circle cx="50" cy="50" r="1.5" fill="url(#nexusGrad)" />
    </svg>
  );
}
