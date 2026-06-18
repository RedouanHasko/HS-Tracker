import React from 'react';

export const HSLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <defs>
      <linearGradient id="arrowGradient" x1="20" y1="80" x2="80" y2="20" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#0f172a" />
        <stop offset="60%" stopColor="#0ea5e9" />
        <stop offset="100%" stopColor="#f59e0b" />
      </linearGradient>
      <linearGradient id="textHGradient" x1="0" y1="0" x2="0" y2="100" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#0ea5e9" />
        <stop offset="100%" stopColor="#1e3a8a" />
      </linearGradient>
      <linearGradient id="textSGradient" x1="0" y1="0" x2="0" y2="100" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#f59e0b" />
        <stop offset="100%" stopColor="#7c2d12" />
      </linearGradient>
    </defs>
    
    {/* Outer circle leaving a gap */}
    <path d="M 80 25 A 42 42 0 1 0 50 92 A 42 42 0 0 0 90.5 38" stroke="#1e3a8a" strokeWidth="3.5" strokeLinecap="round" />
    
    {/* HS Letters */}
    <g transform="translate(18, 15)">
      {/* H - Left vertical */}
      <path d="M10 20 L10 55" stroke="url(#textHGradient)" strokeWidth="8" strokeLinecap="butt" />
      {/* H - Middle horizontal */}
      <path d="M10 37.5 L28 37.5" stroke="url(#textHGradient)" strokeWidth="8" strokeLinecap="butt" />
      {/* H - Right vertical */}
      <path d="M28 20 L28 55" stroke="url(#textHGradient)" strokeWidth="8" strokeLinecap="butt" />
      
      {/* S */}
      <path d="M 64 22 C 50 20, 44 26, 44 32 C 44 40, 64 40, 64 48 C 64 56, 52 60, 42 56" stroke="url(#textSGradient)" fill="none" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
    </g>

    {/* The Zig-Zag Arrow Path */}
    <path d="M 18 68 L 36 46 L 48 56 L 76 26" stroke="url(#arrowGradient)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    
    {/* Arrowhead */}
    <path d="M 68 22 L 81 20 L 76 33 Z" fill="#f59e0b" stroke="#f59e0b" strokeWidth="2" strokeLinejoin="round" />
    
    {/* Sunburst lines */}
    <line x1="86" y1="14" x2="91" y2="10" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
    <line x1="91" y1="22" x2="96" y2="22" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
    <line x1="86" y1="30" x2="91" y2="34" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);
