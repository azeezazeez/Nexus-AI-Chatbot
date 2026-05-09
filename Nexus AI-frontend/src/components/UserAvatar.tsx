/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface Props {
  name?: string;  // Make it optional
  className?: string;
}

export default function UserAvatar({ name, className = "" }: Props) {
  // Use name if provided, otherwise fallback to '?'
  const firstLetter = (name || "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <div className={`flex items-center justify-center font-black rounded-xl overflow-hidden bg-indigo-600 text-white shadow-lg ${className}`}>
      {firstLetter}
    </div>
  );
}