/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useId } from 'react';

interface Props {
  className?: string;
}

export default function StormLogo({ className = '' }: Props) {
  const uid    = useId().replace(/:/g, '-');
  const gradId = `ng-${uid}`;
  const glowId = `nglow-${uid}`;
  const glowSm = `nglowSm-${uid}`;

  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Nexus AI"
    >
      <defs>
        {/* Indigo → violet → fuchsia brand gradient */}
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#6366f1" />
          <stop offset="50%"  stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#d946ef" />
        </linearGradient>

        {/* Core glow (center node) */}
        <filter id={glowId} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>

        {/* Subtle glow (trace nodes) */}
        <filter id={glowSm} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* ── Chip body ── */}
      <rect
        x="19" y="19" width="62" height="62" rx="9"
        fill={`url(#${gradId})`} fillOpacity="0.06"
        stroke={`url(#${gradId})`} strokeWidth="2"
      />

      {/* ── Pins: top ── */}
      <rect x="30" y="10" width="5" height="10" rx="1.5" fill={`url(#${gradId})`} opacity="0.85" />
      <rect x="47" y="10" width="5" height="10" rx="1.5" fill={`url(#${gradId})`} />
      <rect x="64" y="10" width="5" height="10" rx="1.5" fill={`url(#${gradId})`} opacity="0.85" />

      {/* ── Pins: bottom ── */}
      <rect x="30" y="80" width="5" height="10" rx="1.5" fill={`url(#${gradId})`} opacity="0.85" />
      <rect x="47" y="80" width="5" height="10" rx="1.5" fill={`url(#${gradId})`} />
      <rect x="64" y="80" width="5" height="10" rx="1.5" fill={`url(#${gradId})`} opacity="0.85" />

      {/* ── Pins: left ── */}
      <rect x="10" y="30" width="10" height="5" rx="1.5" fill={`url(#${gradId})`} opacity="0.85" />
      <rect x="10" y="47" width="10" height="5" rx="1.5" fill={`url(#${gradId})`} />
      <rect x="10" y="64" width="10" height="5" rx="1.5" fill={`url(#${gradId})`} opacity="0.85" />

      {/* ── Pins: right ── */}
      <rect x="80" y="30" width="10" height="5" rx="1.5" fill={`url(#${gradId})`} opacity="0.85" />
      <rect x="80" y="47" width="10" height="5" rx="1.5" fill={`url(#${gradId})`} />
      <rect x="80" y="64" width="10" height="5" rx="1.5" fill={`url(#${gradId})`} opacity="0.85" />

      {/* ── Interior diagonal traces (X — primary neural connections) ── */}
      <line x1="50" y1="50" x2="35" y2="35" stroke={`url(#${gradId})`} strokeWidth="1.8" strokeLinecap="round" filter={`url(#${glowSm})`} />
      <line x1="50" y1="50" x2="65" y2="35" stroke={`url(#${gradId})`} strokeWidth="1.8" strokeLinecap="round" filter={`url(#${glowSm})`} />
      <line x1="50" y1="50" x2="35" y2="65" stroke={`url(#${gradId})`} strokeWidth="1.8" strokeLinecap="round" filter={`url(#${glowSm})`} />
      <line x1="50" y1="50" x2="65" y2="65" stroke={`url(#${gradId})`} strokeWidth="1.8" strokeLinecap="round" filter={`url(#${glowSm})`} />

      {/* ── Interior cardinal traces (+ — secondary, lighter) ── */}
      <line x1="50" y1="50" x2="50" y2="33" stroke={`url(#${gradId})`} strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.5" />
      <line x1="50" y1="50" x2="50" y2="67" stroke={`url(#${gradId})`} strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.5" />
      <line x1="50" y1="50" x2="33" y2="50" stroke={`url(#${gradId})`} strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.5" />
      <line x1="50" y1="50" x2="67" y2="50" stroke={`url(#${gradId})`} strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.5" />

      {/* ── Corner nodes (primary) ── */}
      <circle cx="35" cy="35" r="3.5" fill="#6366f1" filter={`url(#${glowSm})`} />
      <circle cx="35" cy="35" r="2"   fill="#a5b4fc" />

      <circle cx="65" cy="35" r="3.5" fill="#8b5cf6" filter={`url(#${glowSm})`} />
      <circle cx="65" cy="35" r="2"   fill="#c4b5fd" />

      <circle cx="35" cy="65" r="3.5" fill="#8b5cf6" filter={`url(#${glowSm})`} />
      <circle cx="35" cy="65" r="2"   fill="#c4b5fd" />

      <circle cx="65" cy="65" r="3.5" fill="#d946ef" filter={`url(#${glowSm})`} />
      <circle cx="65" cy="65" r="2"   fill="#f0abfc" />

      {/* ── Cardinal edge nodes (secondary, lower opacity) ── */}
      <circle cx="50" cy="33" r="2" fill="#8b5cf6" opacity="0.7" />
      <circle cx="50" cy="67" r="2" fill="#8b5cf6" opacity="0.7" />
      <circle cx="33" cy="50" r="2" fill="#8b5cf6" opacity="0.7" />
      <circle cx="67" cy="50" r="2" fill="#8b5cf6" opacity="0.7" />

      {/* ── Centre core node ── */}
      <circle cx="50" cy="50" r="6.5" fill={`url(#${gradId})`} filter={`url(#${glowId})`} />
      <circle cx="50" cy="50" r="3"   fill="white" fillOpacity="0.95" />
    </svg>
  );
}
