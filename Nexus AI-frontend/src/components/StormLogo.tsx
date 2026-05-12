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
      <path 
        d="M25 35L50 20L75 35L75 65L50 80L25 65L25 35Z" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeOpacity="0.1" 
      />
      <path 
        d="M35 40L50 31L65 40V60L50 69L35 60" 
        stroke="currentColor" 
        strokeWidth="1" 
        strokeOpacity="0.2" 
      />
      <path 
        d="M75 35L50 50L25 35" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
      />
      <path 
        d="M75 65L50 50L25 65" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
      />
      <path 
        d="M50 20V50V80" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        strokeOpacity="0.5"
      />
      <path 
        d="M30 45C30 35 50 30 50 30C50 30 70 35 70 45C70 55 50 60 50 60C50 60 30 65 30 75C30 85 50 90 50 90" 
        stroke="currentColor"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-indigo-600 dark:text-indigo-400"
      />
    </svg>
  );
}
