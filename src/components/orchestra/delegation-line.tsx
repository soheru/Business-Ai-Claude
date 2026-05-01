"use client";

import { motion } from "framer-motion";

interface DelegationLineProps {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /** flowing = animated dot traveling from→to, idle = faint static line, pending = hidden */
  state: "pending" | "flowing" | "idle";
}

export function DelegationLine({
  fromX,
  fromY,
  toX,
  toY,
  state,
}: DelegationLineProps) {
  if (state === "pending") return null;

  const dx = toX - fromX;
  const dy = toY - fromY;
  const length = Math.sqrt(dx * dx + dy * dy);

  // Unit vector for positioning the traveling dot
  const ux = dx / length;
  const uy = dy / length;

  const isFlowing = state === "flowing";

  return (
    <g>
      {/* Static line — faint when idle, slightly visible when flowing */}
      <line
        x1={fromX}
        y1={fromY}
        x2={toX}
        y2={toY}
        stroke={isFlowing ? "rgba(148,163,184,0.35)" : "rgba(100,116,139,0.2)"}
        strokeWidth={isFlowing ? 1.5 : 1}
        strokeDasharray={isFlowing ? "none" : "4 4"}
      />

      {/* Glowing traveling dot — only when flowing */}
      {isFlowing && (
        <motion.circle
          r={4}
          fill="white"
          filter="url(#dot-glow)"
          animate={{
            cx: [fromX, toX],
            cy: [fromY, toY],
            opacity: [0, 1, 1, 0],
          }}
          transition={{
            duration: 1.4,
            repeat: Infinity,
            ease: "easeInOut",
            times: [0, 0.15, 0.85, 1],
          }}
        />
      )}

      {/* Subtle midpoint dot for idle residual lines */}
      {!isFlowing && (
        <circle
          cx={fromX + dx / 2}
          cy={fromY + dy / 2}
          r={2}
          fill="rgba(100,116,139,0.3)"
        />
      )}
    </g>
  );
}

/** SVG filter definition — render once inside the parent SVG's <defs> */
export function DotGlowFilter() {
  return (
    <filter id="dot-glow" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  );
}
