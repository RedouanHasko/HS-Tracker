import React from 'react';
import iconSrc from '../../assets/img/HS INFINITY-icon.jpeg';

export interface HSLogoProps {
  className?: string;
  /** Compact mark for navbar / sidebar (same asset, tighter fit) */
  compact?: boolean;
}

/**
 * HS Infinity brand mark — uses assets/img/HS INFINITY-icon.jpeg everywhere.
 */
export const HSLogo = ({ className = 'w-6 h-6', compact = false }: HSLogoProps) => {
  if (compact) {
    return (
      <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white dark:bg-slate-900 ${className}`}>
        <img
          src={iconSrc}
          alt="HS Infinity"
          className="h-full w-full object-contain p-0.5"
          draggable={false}
        />
      </span>
    );
  }

  return (
    <img
      src={iconSrc}
      alt="HS Infinity"
      className={`object-contain ${className}`}
      draggable={false}
    />
  );
};
