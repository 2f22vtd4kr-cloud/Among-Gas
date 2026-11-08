import type { CSSProperties } from "react";

interface ArtworkProps {
  style?: CSSProperties;
}

export function EmergencyMeetingIcon({ style }: ArtworkProps) {
  return (
    <svg
      data-emergency-icon
      viewBox="0 0 96 96"
      width="70"
      height="70"
      role="img"
      aria-label="Emergency alarm"
      style={{ display: "block", ...style }}
      focusable="false"
    >
      <defs>
        <linearGradient id="ag-emergency-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffb29a" />
          <stop offset="0.42" stopColor="#f04435" />
          <stop offset="1" stopColor="#8e171b" />
        </linearGradient>
        <linearGradient id="ag-emergency-metal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e4edf0" />
          <stop offset="0.5" stopColor="#82949d" />
          <stop offset="1" stopColor="#34444d" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="#ffcf9f" strokeWidth="4" strokeLinecap="round">
        <path d="M48 5v8M17 17l7 7M79 17l-7 7M7 47h10M79 47h10" />
      </g>
      <path d="M27 57V43c0-13 9-24 21-24s21 11 21 24v14Z" fill="url(#ag-emergency-glass)" stroke="#ffd0b6" strokeWidth="3" />
      <path d="M37 39c2-7 6-11 11-12" fill="none" stroke="#fff1e8" strokeWidth="4" strokeLinecap="round" opacity="0.8" />
      <path d="M21 57h54v11H21z" fill="url(#ag-emergency-metal)" stroke="#d5e0e4" strokeWidth="2.5" />
      <path d="M26 68h44l6 9H20z" fill="#26343b" stroke="#9aabb1" strokeWidth="2.5" />
      <path d="M34 73h28" stroke="#f2c66d" strokeWidth="3" strokeLinecap="round" />
      <circle cx="48" cy="48" r="43" fill="none" stroke="#ff7358" strokeWidth="2" opacity="0.38" />
    </svg>
  );
}

export function EmergencyMeetingSplash({ style }: ArtworkProps) {
  return (
    <svg
      data-emergency-splash-art
      viewBox="0 0 560 340"
      width="340"
      height="206"
      role="img"
      aria-label="Industrial emergency alarm"
      style={{ display: "block", ...style }}
      focusable="false"
    >
      <defs>
        <radialGradient id="ag-emergency-halo">
          <stop offset="0" stopColor="#ff6c4b" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ff6c4b" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ag-emergency-dome" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffd2b7" />
          <stop offset="0.35" stopColor="#ff5844" />
          <stop offset="1" stopColor="#8c111d" />
        </linearGradient>
        <linearGradient id="ag-emergency-base" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d7e1e4" />
          <stop offset="0.5" stopColor="#697d86" />
          <stop offset="1" stopColor="#26343b" />
        </linearGradient>
      </defs>
      <ellipse cx="280" cy="172" rx="235" ry="150" fill="url(#ag-emergency-halo)" />
      <g fill="none" stroke="#ff8061" strokeWidth="8" strokeLinecap="round" opacity="0.88">
        <path d="M280 14v37M126 67l27 27M434 67l-27 27M68 178h42M450 178h42" />
      </g>
      <g fill="none" stroke="#ffca86" strokeWidth="3" opacity="0.8">
        <path d="m95 104 18 12M465 104l-18 12M160 32l12 18M400 32l-12 18" />
      </g>
      <path d="M178 225v-61c0-58 42-104 102-104s102 46 102 104v61Z" fill="url(#ag-emergency-dome)" stroke="#ffd2b8" strokeWidth="8" />
      <path d="M224 145c10-32 30-52 55-58" fill="none" stroke="#fff0e7" strokeWidth="13" strokeLinecap="round" opacity="0.78" />
      <path d="M146 222h268v44H146z" rx="12" fill="url(#ag-emergency-base)" stroke="#d9e4e7" strokeWidth="7" />
      <path d="M164 266h232l25 31H139z" fill="#26363e" stroke="#82969e" strokeWidth="6" />
      <path d="M205 278h150" stroke="#f5c56d" strokeWidth="9" strokeLinecap="round" />
      <path d="M118 314h324" stroke="#ff6a4d" strokeWidth="6" strokeLinecap="round" opacity="0.72" />
      <g fill="#f4c76d" opacity="0.9">
        <path d="m118 314 18-14v28zM442 314l-18-14v28z" />
      </g>
    </svg>
  );
}
