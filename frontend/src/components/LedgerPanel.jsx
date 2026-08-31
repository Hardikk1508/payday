import { useEffect, useRef, useState } from "react";
import { fetchLedger } from "../api/client.js";
import { timeAgo } from "../lib/format.js";
import { INK, PANEL, LINE, TEXT, MUTE, GOLD, VIOLET, FONT_SANS, FONT_MONO } from "../lib/theme.js";
import Reveal from "./Reveal.jsx";

const POLL_MS = 4000;

const KIND_META = {
  diagnose: { label: "Diagnose", color: VIOLET },
  outreach_copy: { label: "Outreach copy", color: GOLD },
};

function summarize(entry) {
  if (entry.kind === "diagnose") {
    const raw = entry.input?.raw_text ?? "";
    const label = entry.output?.diagnosis?.label ?? "?";
    const source = entry.output?.diagnosis?.source ?? "?";
    return {
      title: raw.length > 70 ? raw.slice(0, 70) + "…" : raw,
      detail: `→ ${label} (${source})`,
    };
  }
  const name = entry.input?.customer_name ?? "customer";
  const subject = entry.output?.subject ?? "";
  return { title: `${name}`, detail: `→ "${subject}"` };
}

function LedgerRow({ entry, isNew }) {
  const meta = KIND_META[entry.kind] ?? { label: entry.kind, color: MUTE };
  const { title, detail } = summarize(entry);

  return (
    <div
      className={isNew ? "ledger-row ledger-row-new" : "ledger-row"}
      style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "9px 0", borderBottom: `1px solid ${LINE}` }}
    >
      <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: MUTE, minWidth: 52 }}>
        {timeAgo(entry.created_at)}
      </span>
      <span
        style={{
          fontFamily: FONT_MONO, fontSize: 10, letterSpacing: "0.04em", textTransform: "uppercase",
          color: meta.color, border: `1px solid ${meta.color}55`, padding: "1px 7px", flexShrink: 0,
        }}
      >
        {meta.label}
      </span>
      <span className="truncate" style={{ fontSize: 12, color: TEXT, flexShrink: 0, maxWidth: 260 }}>
        {title}
      </span>
      <span className="truncate" style={{ fontSize: 12, color: MUTE, flex: 1 }}>
        {detail}
      </span>
    </div>
  );
}

export default function LedgerPanel() {
  const [entries, setEntries] = useState([]);
  const [configured, setConfigured] = useState(null);
  const [error, setError] = useState(null);
  const seenIds = useRef(new Set());

  useEffect(() => {
    let cancelled = false;

    const poll = () => {
      fetchLedger({ limit: 15 })
        .then((res) => {
          if (cancelled) return;
          setConfigured(res.db_configured);
          setEntries(res.entries);
          setError(null);
        })
        .catch((err) => {
          if (!cancelled) setError(err.message);
        });
    };

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Track which ids we've already rendered so only genuinely new rows
  // (arrived since last poll) get the entrance animation -- otherwise
  // every row would replay it every 4s.
  const rendered = entries.map((e) => {
    const isNew = !seenIds.current.has(e.id);
    return { entry: e, isNew };
  });
  useEffect(() => {
    entries.forEach((e) => seenIds.current.add(e.id));
  }, [entries]);

  return (
    <div id="ledger" style={{ background: INK, borderTop: `1px solid ${LINE}`, scrollMarginTop: 16 }}>
      <style>{`
        .ledger-row-new { animation: ledgerRowIn 500ms cubic-bezier(0.16, 1, 0.3, 1) both; }
        @keyframes ledgerRowIn {
          from { opacity: 0; transform: translateX(-10px); background: ${VIOLET}14; }
          to { opacity: 1; transform: translateX(0); background: transparent; }
        }
        .live-dot { width: 6px; height: 6px; border-radius: 50%; background: ${GOLD}; display: inline-block; }
        @media (prefers-reduced-motion: no-preference) {
          .live-dot { animation: livePulse 1800ms ease-in-out infinite; }
        }
        @keyframes livePulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 ${GOLD}66; }
          50% { opacity: 0.6; box-shadow: 0 0 0 4px ${GOLD}00; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ledger-row-new { animation: none !important; }
        }
      `}</style>
      <div style={{ maxWidth: 1180, margin: "0 auto" }} className="px-5 sm:px-7 py-12 sm:py-14">
        <Reveal>
          <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
            <span className="live-dot" />
            <span style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: MUTE }}>
              Decision ledger &middot; GET /ledger &middot; polling every {POLL_MS / 1000}s
            </span>
          </div>
          <h2 style={{ fontFamily: FONT_SANS, fontSize: "clamp(20px, 3vw, 28px)", fontWeight: 700, color: TEXT, margin: "0 0 8px" }}>
            Every call above, actually persisted
          </h2>
          <p style={{ fontSize: 14, color: MUTE, maxWidth: 640, lineHeight: 1.7, margin: "0 0 22px" }}>
            Each diagnosis and each generated message writes a row to MongoDB the
            moment it happens &mdash; this list reads it back live. Try the diagnose
            or outreach panels above, then watch a new row land here within a few
            seconds, no refresh needed.
          </p>

          {error && <div style={{ fontSize: 12, color: MUTE }}>Couldn't reach the ledger ({error}).</div>}

          {!error && configured === false && (
            <div style={{ background: PANEL, border: `1px solid ${LINE}`, padding: "14px 16px", fontSize: 12, color: MUTE }}>
              <code style={{ color: TEXT }}>MONGODB_URI</code> isn't set, so nothing persists yet &mdash;
              every diagnose/outreach call above still runs live, it just isn't saved.
              Add it to <code style={{ color: TEXT }}>.env</code> and restart the API to turn this on.
            </div>
          )}

          {!error && configured === true && entries.length === 0 && (
            <div style={{ fontSize: 12, color: MUTE }}>
              Connected, nothing logged yet &mdash; try the diagnose or outreach panels above.
            </div>
          )}

          {!error && entries.length > 0 && (
            <div>
              {rendered.map(({ entry, isNew }) => (
                <LedgerRow key={entry.id} entry={entry} isNew={isNew} />
              ))}
            </div>
          )}
        </Reveal>
      </div>
    </div>
  );
}
