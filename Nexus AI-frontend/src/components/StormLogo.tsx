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
        <linearGradient id="nexusGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      
      {/* Outer Hexagon Frame */}
      <path 
        d="M50 10L85 30V70L50 90L15 70V30L50 10Z" 
        stroke="url(#nexusGradient)" 
        strokeWidth="2" 
        strokeOpacity="0.3"
      />
      
      {/* Inner Interconnected Hub */}
      <path 
        d="M50 25L72 38V62L50 75L28 62V38L50 25Z" 
        fill="url(#nexusGradient)" 
        fillOpacity="0.1"
      />
      <path 
        d="M50 25V50M72 38L50 50M72 62L50 50M50 75V50M28 62L50 50M28 38L50 50" 
        stroke="url(#nexusGradient)" 
        strokeWidth="4" 
        strokeLinecap="round" 
      />
      
      {/* Core Node */}
      <circle cx="50" cy="50" r="8" fill="url(#nexusGradient)" />
      <circle cx="50" cy="50" r="4" fill="white" className="dark:fill-zinc-900" />
      
      {/* Terminal Nodes */}
      <circle cx="50" cy="25" r="3" fill="#6366f1" />
      <circle cx="72" cy="38" r="3" fill="#818cf8" />
      <circle cx="72" cy="62" r="3" fill="#a855f7" />
      <circle cx="50" cy="75" r="3" fill="#c084fc" />
      <circle cx="28" cy="62" r="3" fill="#a855f7" />
      <circle cx="28" cy="38" r="3" fill="#818cf8" />
    </svg>
  );
}
