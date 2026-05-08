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
      {/* stylized 'N' as a storm/lightning bolt */}
      <path 
        d="M30 80L25 20L55 55L50 15L75 15L80 75L50 40L55 85H30Z" 
        fill="currentColor"
        className="drop-shadow-lg"
      />
      <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="2" strokeOpacity="0.1" />
    </svg>
  );
}
