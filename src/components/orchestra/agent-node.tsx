"use client";

import { motion } from "framer-motion";
import {
  Crown,
  Megaphone,
  Code2,
  ClipboardList,
  Palette,
  CheckCircle2,
  Bot,
} from "lucide-react";
import type { AgentRole } from "@/lib/types";
import type { NodeStatus } from "./use-orchestra-state";

interface AgentNodeProps {
  role: AgentRole;
  /** User-defined display name (e.g. "Researcher"). Falls back to capitalized role slug. */
  name?: string;
  status: NodeStatus;
  /** Optional extra label shown below the name (e.g. "running... 8s") */
  label?: string;
  centerNode?: boolean;
}

type RoleVisual = {
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  colorClass: string;
  glowColor: string;
};

// Well-known role visual config (seeded agents)
const KNOWN_ROLE_CONFIG: Record<string, RoleVisual> = {
  ceo: {
    Icon: Crown,
    colorClass: "bg-amber-500 border-amber-400",
    glowColor: "rgba(245,158,11,0.7)",
  },
  marketer: {
    Icon: Megaphone,
    colorClass: "bg-pink-600 border-pink-400",
    glowColor: "rgba(219,39,119,0.7)",
  },
  developer: {
    Icon: Code2,
    colorClass: "bg-blue-600 border-blue-400",
    glowColor: "rgba(37,99,235,0.7)",
  },
  pm: {
    Icon: ClipboardList,
    colorClass: "bg-violet-600 border-violet-400",
    glowColor: "rgba(124,58,237,0.7)",
  },
  ux: {
    Icon: Palette,
    colorClass: "bg-teal-600 border-teal-400",
    glowColor: "rgba(13,148,136,0.7)",
  },
  qa: {
    Icon: CheckCircle2,
    colorClass: "bg-emerald-600 border-emerald-400",
    glowColor: "rgba(5,150,105,0.7)",
  },
};

// Curated palette for unknown / custom roles — maps hash index → Tailwind classes
const FALLBACK_PALETTE: Array<{ colorClass: string; glowColor: string }> = [
  { colorClass: "bg-cyan-600 border-cyan-400",    glowColor: "rgba(8,145,178,0.7)" },
  { colorClass: "bg-pink-500 border-pink-400",    glowColor: "rgba(236,72,153,0.7)" },
  { colorClass: "bg-emerald-500 border-emerald-400", glowColor: "rgba(16,185,129,0.7)" },
  { colorClass: "bg-violet-500 border-violet-400", glowColor: "rgba(139,92,246,0.7)" },
  { colorClass: "bg-orange-500 border-orange-400", glowColor: "rgba(249,115,22,0.7)" },
  { colorClass: "bg-rose-600 border-rose-400",    glowColor: "rgba(225,29,72,0.7)" },
  { colorClass: "bg-teal-500 border-teal-400",    glowColor: "rgba(20,184,166,0.7)" },
  { colorClass: "bg-indigo-600 border-indigo-400", glowColor: "rgba(79,70,229,0.7)" },
];

/** Stable numeric hash of a string (djb2-lite variant). */
function hashRole(role: string): number {
  return [...role].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0);
}

/** Return the visual config for any role, falling back gracefully for unknowns. */
function getRoleVisual(role: AgentRole): RoleVisual {
  const known = KNOWN_ROLE_CONFIG[role];
  if (known) return known;

  const idx = hashRole(role) % FALLBACK_PALETTE.length;
  return {
    Icon: Bot,
    ...FALLBACK_PALETTE[idx],
  };
}

/** Derive a display label from the role slug when no name is provided. */
function defaultLabel(role: AgentRole): string {
  if (!role) return "Agent";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

const STATUS_RING: Record<NodeStatus, string> = {
  idle: "ring-transparent",
  running: "ring-current",
  done: "ring-green-400",
  failed: "ring-red-400",
};

export function AgentNode({ role, name, status, label, centerNode = false }: AgentNodeProps) {
  const { Icon, colorClass, glowColor } = getRoleVisual(role);
  const displayName = name ?? defaultLabel(role);

  const size = centerNode ? 72 : 56;
  const iconSize = centerNode ? 28 : 22;

  const isRunning = status === "running";
  const isDone = status === "done";
  const isFailed = status === "failed";
  const isIdle = status === "idle";

  return (
    <div
      className="flex flex-col items-center gap-1.5"
      title={`${displayName} — ${label ?? status}`}
    >
      {/* Outer pulse ring — only visible when running */}
      <div className="relative flex items-center justify-center">
        {isRunning && (
          <motion.div
            className="absolute rounded-full"
            style={{
              width: size + 20,
              height: size + 20,
              background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`,
            }}
            animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0.2, 0.6] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
        )}

        {/* Node circle */}
        <motion.div
          className={[
            "rounded-full border-2 flex items-center justify-center text-white relative overflow-visible",
            colorClass,
            isIdle ? "opacity-40" : "opacity-100",
            isDone ? "ring-2 ring-offset-1 ring-green-400 ring-offset-transparent" : "",
            isFailed ? "ring-2 ring-offset-1 ring-red-400 ring-offset-transparent" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={{ width: size, height: size }}
          animate={
            isRunning
              ? { boxShadow: [`0 0 8px ${glowColor}`, `0 0 20px ${glowColor}`, `0 0 8px ${glowColor}`] }
              : { boxShadow: "0 0 0px transparent" }
          }
          transition={
            isRunning
              ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.4 }
          }
          layout
        >
          <Icon size={iconSize} strokeWidth={1.8} />

          {/* Done overlay checkmark */}
          {isDone && (
            <motion.div
              className="absolute -bottom-1 -right-1 bg-green-500 rounded-full w-5 h-5 flex items-center justify-center"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 18 }}
            >
              <svg viewBox="0 0 12 12" width={10} height={10} fill="none">
                <path
                  d="M2 6l3 3 5-5"
                  stroke="white"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </motion.div>
          )}

          {/* Failed overlay X */}
          {isFailed && (
            <motion.div
              className="absolute -bottom-1 -right-1 bg-red-500 rounded-full w-5 h-5 flex items-center justify-center"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 18 }}
            >
              <svg viewBox="0 0 12 12" width={10} height={10} fill="none">
                <path
                  d="M3 3l6 6M9 3l-6 6"
                  stroke="white"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                />
              </svg>
            </motion.div>
          )}
        </motion.div>
      </div>

      {/* Display name */}
      <span
        className={[
          "text-xs font-semibold tracking-wide select-none",
          isIdle ? "text-muted-foreground opacity-50" : "text-foreground",
        ].join(" ")}
      >
        {displayName}
      </span>

      {/* Status sub-label */}
      {label && (
        <span className="text-[10px] text-muted-foreground leading-none">{label}</span>
      )}
    </div>
  );
}
