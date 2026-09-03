import { LINE, FONT_MONO } from "../lib/theme.js";

// Real reason/outcome strings straight out of agent_policy.py and
// outcome_model.py -- the ambient background is the app's own audit-trail
// language, faint and drifting, not decorative filler. Reinforces the
// product's own framing (every decision is logged) instead of just being
// a texture.
const LINES = [
  "d29 -- heads-up the day before payday (1)",
  "d30 -- retry on payday, balance likely topped up",
  "d31 -- second pass one day after payday",
  "d02 -- card past expiry, retries cannot succeed",
  "d05 -- second prompt, no card update received",
  "d02 -- single retry in case the refusal was transient",
  "d03 -- repeated retries harden the issuer, switch method",
  "d00 -- auth session expired, immediate retry while odds are high",
  "d01 -- one more pass before the window closes",
  "d00 -- request never reached the issuer, retry immediately",
  "charge cleared (p=0.74)",
  "declined again (p=0.11)",
  "customer updated their card",
  "backup payment method available",
  "guardrail: retry cap reached (4)",
  "guardrail: contact cap reached (2)",
  "reminder delivered",
];

// Four columns, each a differently-offset, differently-shuffled slice of
// the same pool, each looping at a slightly different speed -- reads as an
// ongoing system rather than one obviously-looped strip.
function columnLines(offset) {
  const rotated = [...LINES.slice(offset), ...LINES.slice(0, offset)];
  return [...rotated, ...rotated]; // doubled for a seamless loop
}

const COLUMNS = [
  { lines: columnLines(0), duration: 46 },
  { lines: columnLines(4), duration: 60 },
  { lines: columnLines(9), duration: 52 },
  { lines: columnLines(13), duration: 68 },
];

export default function AmbientLedger() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute", inset: 0, overflow: "hidden",
        pointerEvents: "none", zIndex: 0, opacity: 0.4,
        display: "flex", justifyContent: "space-between",
        maskImage: "linear-gradient(to bottom, transparent, black 12%, black 88%, transparent)",
        WebkitMaskImage: "linear-gradient(to bottom, transparent, black 12%, black 88%, transparent)",
      }}
    >
      <style>{`
        .ambient-col { animation: ambientScroll linear infinite; }
        @keyframes ambientScroll {
          from { transform: translateY(0); }
          to { transform: translateY(-50%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .ambient-col { animation: none; }
        }
        @media (max-width: 640px) {
          .ambient-col:nth-child(n+3) { display: none; }
        }
      `}</style>
      {COLUMNS.map((col, i) => (
        <div
          key={i}
          className="ambient-col"
          style={{ animationDuration: `${col.duration}s`, flexShrink: 0, width: "25%" }}
        >
          {col.lines.map((line, j) => (
            <div
              key={j}
              style={{
                fontFamily: FONT_MONO, fontSize: 10.5, color: LINE,
                whiteSpace: "nowrap", padding: "10px 0",
              }}
            >
              {line}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
