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
          <stop offset="0%" stopColor="#4F46E5" />
          <stop offset="100%" stopColor="#9333EA" />
        </linearGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Geometric Frame */}
      <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="0.5" strokeOpacity="0.1" />
      <path 
        d="M50 15L80 32.5V67.5L50 85L20 67.5V32.5L50 15Z" 
        stroke="currentColor" 
        strokeWidth="1" 
        strokeOpacity="0.05" 
      />

      {/* Main Nexus 'N' - Abstract & Connected */}
      <path 
        d="M35 30V70L50 50L65 30V70" 
        stroke="url(#nexusGrad)" 
        strokeWidth="10" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        filter="url(#glow)"
      />

      {/* Connector Nodes */}
      <circle cx="35" cy="30" r="4" fill="#4F46E5" />
      <circle cx="65" cy="70" r="4" fill="#9333EA" />
      
      {/* Central Core */}
      <circle cx="50" cy="50" r="8" fill="white" className="dark:fill-zinc-900" />
      <circle cx="50" cy="50" r="4" fill="url(#nexusGrad)" />
    </svg>
  );
}
