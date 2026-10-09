import React from 'react';
import logoLight from '../../assets/img/HS INFINITY LOGO- for light mode.png';
import logoDark from '../../assets/img/HS INFINITY LOGO - for dark mode.png';

export interface HSLogoProps {
  className?: string;
  /** Kept for compatibility — no longer renders the boxed icon background. */
  compact?: boolean;
}

/**
 * HS Infinity brand mark — theme-aware full logos, no wrapper, no background box.
 * Light mode uses the light logo, dark mode uses the dark logo.
 */
export const HSLogo = ({ className = 'w-6 h-6' }: HSLogoProps) => {
  return (
    <>
      <img
        src={logoLight}
        alt="HS Infinity"
        className={`object-contain dark:hidden ${className}`}
        draggable={false}
      />
      <img
        src={logoDark}
        alt="HS Infinity"
        className={`hidden object-contain dark:block ${className}`}
        draggable={false}
      />
    </>
  );
};
