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
          <stop offset="0%" stopColor="#4F46E5" />
          <stop offset="100%" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      
      <circle cx="50" cy="50" r="45" fill="url(#nexusGradient)" fillOpacity="0.03" />

      <path 
        d="M32 25V75L50 53" 
        stroke="url(#nexusGradient)" 
        strokeWidth="11" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
      <path 
        d="M68 75V25L50 47" 
        stroke="url(#nexusGradient)" 
        strokeWidth="11" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
      
      <circle 
        cx="50" 
        cy="50" 
        r="10" 
        fill="white" 
        className="dark:fill-zinc-900 shadow-md"
      />
      <circle 
        cx="50" 
        cy="50" 
        r="5" 
        fill="url(#nexusGradient)" 
      />

      <circle cx="32" cy="25" r="2.5" fill="white" fillOpacity="0.5" />
      <circle cx="68" cy="75" r="2.5" fill="white" fillOpacity="0.5" />
    </svg>
  );
}
