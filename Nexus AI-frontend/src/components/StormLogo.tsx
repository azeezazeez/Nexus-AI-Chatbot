/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface Props {
  className?: string;
}

export default function StormLogo({
  className = '',
}: Props) {
  // Prevent duplicate gradient IDs
  const gradientId = React.useId();

  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      className={className}
      aria-label="Storm Logo"
      role="img"
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          <stop
            offset="0%"
            stopColor="#4F46E5"
          />
          <stop
            offset="100%"
            stopColor="#7C3AED"
          />
        </linearGradient>

        {/* SVG Shadow */}
        <filter
          id="shadow"
          x="-50%"
          y="-50%"
          width="200%"
          height="200%"
        >
          <feDropShadow
            dx="0"
            dy="2"
            stdDeviation="2"
            floodOpacity="0.25"
          />
        </filter>
      </defs>

      {/* Background Glow */}
      <circle
        cx="50"
        cy="50"
        r="45"
        fill={`url(#${gradientId})`}
        fillOpacity="0.05"
      />

      {/* Left Shape */}
      <path
        d="M32 25V75L50 53"
        stroke={`url(#${gradientId})`}
        strokeWidth="11"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Right Shape */}
      <path
        d="M68 75V25L50 47"
        stroke={`url(#${gradientId})`}
        strokeWidth="11"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Center White Circle */}
      <circle
        cx="50"
        cy="50"
        r="10"
        fill="white"
        filter="url(#shadow)"
      />

      {/* Center Gradient Dot */}
      <circle
        cx="50"
        cy="50"
        r="5"
        fill={`url(#${gradientId})`}
      />

      {/* Decorative Dots */}
      <circle
        cx="32"
        cy="25"
        r="2.5"
        fill="white"
        fillOpacity="0.5"
      />

      <circle
        cx="68"
        cy="75"
        r="2.5"
        fill="white"
        fillOpacity="0.5"
      />
    </svg>
  );
}
