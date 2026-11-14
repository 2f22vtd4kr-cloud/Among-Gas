import React, { type CSSProperties } from 'react';

export function EmergencyCallIcon({ size = 70 }: { readonly size?: number }) {
  return (
    <svg
      data-testid="emergency-call-icon"
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
    >
      <circle cx="48" cy="48" r="43" fill="#42191B" stroke="#FFB29A" strokeOpacity="0.5" strokeWidth="2" />
      <circle cx="48" cy="48" r="35" fill="#B83D35" stroke="#FFDFCC" strokeOpacity="0.75" strokeWidth="2" />
      <path d="M48 13V5M20 24l-6-6M76 24l6-6" stroke="#FFF1DD" strokeWidth="5" strokeLinecap="round" />
      <path d="M34 60V43a14 14 0 0 1 28 0v17" fill="#F8C9A9" stroke="#FFF1DD" strokeWidth="3" strokeLinejoin="round" />
      <path d="M29 60h38v9H29z" fill="#542326" stroke="#FFF1DD" strokeWidth="3" strokeLinejoin="round" />
      <path d="M48 35v14" stroke="#8A292A" strokeWidth="5" strokeLinecap="round" />
      <circle cx="48" cy="55" r="2.8" fill="#8A292A" />
      <path d="M25 78h46" stroke="#F4BFA5" strokeWidth="4" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

export function EmergencyMeetingArtwork({ style }: { readonly style?: CSSProperties }) {
  return (
    <svg
      data-testid="emergency-meeting-artwork"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 340 220"
      role="presentation"
      style={style}
    >
      <circle cx="170" cy="104" r="98" fill="#10202A" />
      <circle cx="170" cy="104" r="82" fill="#142B35" stroke="#31505A" strokeWidth="2" />
      <circle cx="170" cy="104" r="65" fill="#183641" stroke="#F06A56" strokeOpacity="0.45" strokeWidth="2" />
      <path d="M76 75a96 96 0 0 1 188 0" stroke="#F26E58" strokeWidth="4" strokeLinecap="round" opacity="0.7" />
      <path d="M95 61a78 78 0 0 1 150 0" stroke="#E9B36D" strokeWidth="3" strokeLinecap="round" opacity="0.55" />
      <path d="M170 12v17M70 103H50M290 103h-20" stroke="#E9B36D" strokeWidth="4" strokeLinecap="round" opacity="0.8" />
      <circle cx="170" cy="88" r="38" fill="#6D292D" stroke="#FFB79A" strokeWidth="3" />
      <circle cx="170" cy="88" r="29" fill="#D94E45" />
      <path d="M149 90V81a21 21 0 0 1 42 0v9" fill="#FFE1C5" stroke="#FFF4E6" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M143 91h54v12h-54z" fill="#632D30" stroke="#FFF0DF" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M170 72v14" stroke="#A83535" strokeWidth="5" strokeLinecap="round" />
      <circle cx="170" cy="91" r="2.5" fill="#A83535" />
      <path d="M90 151h160l-13 15H103z" fill="#213E48" stroke="#82A6A6" strokeWidth="2" strokeLinejoin="round" />
      <path d="M116 166v17M224 166v17" stroke="#82A6A6" strokeWidth="5" strokeLinecap="round" />
      <g stroke="#E5D4BB" strokeWidth="2">
        <circle cx="112" cy="133" r="9" fill="#E58D61" />
        <path d="M99 151q13-18 26 0v4H99z" fill="#C65E4F" />
        <circle cx="147" cy="139" r="8" fill="#89B8AF" />
        <path d="M136 153q11-15 22 0v3h-22z" fill="#3C817E" />
        <circle cx="193" cy="139" r="8" fill="#DAB477" />
        <path d="M182 153q11-15 22 0v3h-22z" fill="#A87948" />
        <circle cx="228" cy="133" r="9" fill="#B3A0CE" />
        <path d="M215 151q13-18 26 0v4h-26z" fill="#766A9D" />
      </g>
      <circle cx="67" cy="44" r="4" fill="#F6C47C" />
      <circle cx="274" cy="47" r="4" fill="#F6C47C" />
      <path d="M48 118l7 7m0-7l-7 7M285 117l7 7m0-7l-7 7" stroke="#F5A08A" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
