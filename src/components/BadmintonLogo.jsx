// src/components/BadmintonLogo.jsx
//
// Usage in App.jsx — replace:
//   <div className="logo">🏸</div>
// with:
//   <BadmintonLogo />
//
// The component renders at 28×28px by default, matching the existing .logo div size.
// Pass size={N} to override if needed.

import React from "react";

export default function BadmintonLogo({ size = 28 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", flexShrink: 0 }}
    >
      {/* Orange rounded-square badge background */}
      <rect width="28" height="28" rx="7" fill="#e05a1c" />

      {/* ── Racket 1 — leaning left (−35°) ── */}
      <g transform="translate(14,14) rotate(-35)">
        {/* handle */}
        <rect x="-1.4" y="5.5" width="2.8" height="7.5" rx="1.4" fill="white" opacity="0.92"/>
        {/* neck */}
        <rect x="-1" y="0.5" width="2" height="6" rx="1" fill="white" opacity="0.92"/>
        {/* head */}
        <ellipse cx="0" cy="-6" rx="5.5" ry="7" fill="none" stroke="white" stroke-width="1.8" opacity="0.92"/>
        {/* horizontal strings */}
        <line x1="-5" y1="-6"  x2="5"  y2="-6"  stroke="white" stroke-width="0.7" opacity="0.55"/>
        <line x1="-4" y1="-10" x2="4"  y2="-10" stroke="white" stroke-width="0.7" opacity="0.55"/>
        <line x1="-4" y1="-2"  x2="4"  y2="-2"  stroke="white" stroke-width="0.7" opacity="0.55"/>
        {/* vertical strings */}
        <line x1="0"  y1="-13" x2="0"  y2="1"   stroke="white" stroke-width="0.7" opacity="0.55"/>
        <line x1="-3" y1="-13" x2="-3" y2="1"   stroke="white" stroke-width="0.7" opacity="0.55"/>
        <line x1="3"  y1="-13" x2="3"  y2="1"   stroke="white" stroke-width="0.7" opacity="0.55"/>
      </g>

      {/* ── Racket 2 — leaning right (+35°) ── */}
      <g transform="translate(14,14) rotate(35)">
        <rect x="-1.4" y="5.5" width="2.8" height="7.5" rx="1.4" fill="white" opacity="0.92"/>
        <rect x="-1" y="0.5" width="2" height="6" rx="1" fill="white" opacity="0.92"/>
        <ellipse cx="0" cy="-6" rx="5.5" ry="7" fill="none" stroke="white" stroke-width="1.8" opacity="0.92"/>
        <line x1="-5" y1="-6"  x2="5"  y2="-6"  stroke="white" stroke-width="0.7" opacity="0.55"/>
        <line x1="-4" y1="-10" x2="4"  y2="-10" stroke="white" stroke-width="0.7" opacity="0.55"/>
        <line x1="-4" y1="-2"  x2="4"  y2="-2"  stroke="white" stroke-width="0.7" opacity="0.55"/>
        <line x1="0"  y1="-13" x2="0"  y2="1"   stroke="white" stroke-width="0.7" opacity="0.55"/>
        <line x1="-3" y1="-13" x2="-3" y2="1"   stroke="white" stroke-width="0.7" opacity="0.55"/>
        <line x1="3"  y1="-13" x2="3"  y2="1"   stroke="white" stroke-width="0.7" opacity="0.55"/>
      </g>

      {/* ── Shuttlecock — sitting above the cross point ── */}
      {/* cork */}
      <ellipse cx="14" cy="4.5" rx="2.8" ry="2.2" fill="white" opacity="0.97"/>
      {/* feather lines fanning down from cork */}
      <line x1="14"   y1="6.5" x2="10.5" y2="11.5" stroke="white" stroke-width="0.9" opacity="0.72"/>
      <line x1="14"   y1="6.5" x2="12"   y2="12"   stroke="white" stroke-width="0.9" opacity="0.72"/>
      <line x1="14"   y1="6.5" x2="14"   y2="12.5" stroke="white" stroke-width="0.9" opacity="0.72"/>
      <line x1="14"   y1="6.5" x2="16"   y2="12"   stroke="white" stroke-width="0.9" opacity="0.72"/>
      <line x1="14"   y1="6.5" x2="17.5" y2="11.5" stroke="white" stroke-width="0.9" opacity="0.72"/>
      {/* feather rim arc */}
      <path d="M 10.5 11.5 Q 14 13.5 17.5 11.5" fill="none" stroke="white" stroke-width="0.9" opacity="0.65"/>
    </svg>
  );
}
