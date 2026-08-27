import { useState, useEffect, useMemo, useRef } from "react";
import { fetchSimulation, fetchFailureCodes } from "../api/client.js";
import { inr } from "../lib/format.js";
import {
  INK, PANEL, LINE, TEXT, MUTE, GOLD, STEEL, RUST, VIOLET, FONT_SANS, FONT_MONO,
} from "../lib/theme.js";

const CUSTOMERS = 5000;

// Which logged attempt to surface in the event ticker: the one that
// actually cleared the charge, or -- if it never cleared -- the last one
// attempted before guardrails or the horizon cut the plan off.
function displayAttempt(attempts, recoveredDay) {
  if (!attempts.length) return null;
  if (recoveredDay != null) {
    return attempts.find((a) => a.day === recoveredDay) ?? attempts[attempts.length - 1];
  }
  return attempts[attempts.length - 1];
}

function lastKnownDay(result) {
  return result.attempts.length
    ? result.attempts[result.attempts.length - 1].day
    : result.fail_day;
}

// Zips the baseline and agent per-charge streams (same charges, same order,
// same seeded outcomes) into one row per charge for the ticker.
function buildFailures(sim, labels) {
  const baseByCharge = new Map(sim.stream.baseline.map((r) => [r.charge_id, r]));

  return sim.stream.agent.map((agent) => {
    const base = baseByCharge.get(agent.charge_id) ?? null;
    const agentAttempt = displayAttempt(agent.attempts, agent.recovered_day);
    const baseAttempt = base ? displayAttempt(base.attempts, base.recovered_day) : null;

    return {
      id: agent.charge_id,
      name: agent.customer_name,
      amount: agent.amount,
      reasonLabel: labels[agent.failure_code] ?? agent.failure_code,
      failDay: agent.fail_day,

      agentRecovered: agent.recovered,
      agentDay: agent.recovered ? agent.recovered_day : lastKnownDay(agent),
      agentMove: agentAttempt?.reason ?? "no action taken within guardrails",

      baselineRecovered: base ? base.recovered : false,
      baselineDay: base ? (base.recovered ? base.recovered_day : lastKnownDay(base)) : agent.fail_day,
    };
  });
}

function Counter({ value, color, dim }) {
  return (
    <div
      style={{
        fontFamily: FONT_MONO,
        fontSize: "clamp(28px, 5vw, 44px)",
        fontWeight: 500,
        letterSpacing: "-0.02em",
        color,
        opacity: dim ? 0.72 : 1,
        lineHeight: 1.1,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {inr(value)}
    </div>
  );
}

function EventRow({ ev, side }) {
  const recovered = ev.recovered;
  const accent = side === "agent" ? (recovered ? GOLD : RUST) : recovered ? STEEL : RUST;

  return (
    <div
      className="event-row flex items-baseline gap-3 py-2"
      style={{ borderBottom: `1px solid ${LINE}` }}
    >
      <span
        style={{ fontFamily: FONT_MONO, fontSize: 11, color: MUTE, minWidth: 34 }}
      >
        d{String(ev.day).padStart(2, "0")}
      </span>
      <span
        className="truncate"
        style={{ fontSize: 13, color: TEXT, flex: 1, minWidth: 0 }}
      >
        {ev.name}
      </span>
      <span
        className="hidden sm:inline truncate"
        title={side === "agent" ? ev.move : ev.reasonLabel}
        style={{ fontSize: 11, color: side === "agent" ? VIOLET : MUTE, maxWidth: 160 }}
      >
        {side === "agent" ? ev.move : ev.reasonLabel}
      </span>
      <span
        style={{
          fontFamily: FONT_MONO,
          fontSize: 12,
          color: accent,
          fontVariantNumeric: "tabular-nums",
          minWidth: 62,
          textAlign: "right",
        }}
      >
        {recovered ? "+" + inr(ev.amount) : "lost"}
      </span>
    </div>
  );
}

function Panel({ title, subtitle, recovered, rate, events, side, atRisk }) {
  const isAgent = side === "agent";
  const bar = atRisk > 0 ? (recovered / atRisk) * 100 : 0;

  return (
    <div
      className="flex flex-col px-5 py-5 sm:px-7 sm:py-6"
      style={{
        background: isAgent ? PANEL : "transparent",
        filter: isAgent ? "none" : "saturate(0.45)",
        minHeight: 420,
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div
            style={{
              fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase",
              color: isAgent ? VIOLET : MUTE, marginBottom: 6,
            }}
          >
            {subtitle}
          </div>
          <div style={{ fontFamily: FONT_SANS, fontSize: 17, fontWeight: 500, color: TEXT }}>
            {title}
          </div>
        </div>
        <div
          style={{
            fontFamily: FONT_MONO, fontSize: 12, color: isAgent ? GOLD : MUTE,
            fontVariantNumeric: "tabular-nums", paddingTop: 18,
          }}
        >
          {rate.toFixed(1)}%
        </div>
      </div>

      <Counter value={recovered} color={isAgent ? GOLD : STEEL} dim={!isAgent} />

      <div className="mt-3 mb-5" style={{ height: 3, background: LINE, borderRadius: 0 }}>
        <div
          style={{
            height: "100%", width: bar + "%", background: isAgent ? GOLD : STEEL,
            transition: "width 240ms linear",
          }}
        />
      </div>

      <div className="flex-1 flex flex-col justify-end">
        {events.length === 0 ? (
          <div style={{ fontSize: 12, color: MUTE, paddingBottom: 8 }}>
            Waiting for the first failed charge.
          </div>
        ) : (
          events.map((ev) => <EventRow key={ev.key} ev={ev} side={side} />)
        )}
      </div>
    </div>
  );
}

function CenterMessage({ children }) {
  return (
    <div
      style={{ background: INK, minHeight: "100vh", color: MUTE, display: "flex",
        alignItems: "center", justifyContent: "center", fontSize: 13 }}
    >
      {children}
    </div>
  );
}

export default function RecoveryRace() {
  const [day, setDay] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [seed, setSeed] = useState(42);
  const [sim, setSim] = useState(null);
  const [labels, setLabels] = useState({});
  const [error, setError] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    fetchFailureCodes()
      .then((codes) => {
        const map = {};
        for (const [key, v] of Object.entries(codes)) map[key] = v.label;
        setLabels(map);
      })
      .catch(() => {}); // labels are cosmetic only; raw code still renders fine
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    fetchSimulation({ customers: CUSTOMERS, seed })
      .then((res) => {
        if (cancelled) return;
        setSim(res);
        setDay(0);
        setPlaying(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [seed]);

  const horizon = sim?.horizon_days ?? 30;
  const atRisk = sim?.agent?.at_risk ?? 0;
  const totalCharges = sim?.agent?.charges ?? 0;

  const failures = useMemo(() => (sim ? buildFailures(sim, labels) : []), [sim, labels]);

  useEffect(() => {
    if (!playing || !sim) return;
    if (day >= horizon) {
      setPlaying(false);
      return;
    }
    timer.current = setTimeout(() => setDay((d) => d + 1), 260);
    return () => clearTimeout(timer.current);
  }, [playing, day, sim, horizon]);

  const { baseTotal, agentTotal, baseRate, agentRate, baseEvents, agentEvents } = useMemo(() => {
    if (!sim) {
      return { baseTotal: 0, agentTotal: 0, baseRate: 0, agentRate: 0, baseEvents: [], agentEvents: [] };
    }

    const baseDay = sim.baseline.daily[Math.min(day, sim.baseline.daily.length - 1)];
    const agentDay = sim.agent.daily[Math.min(day, sim.agent.daily.length - 1)];

    const bE = [];
    const aE = [];
    for (const t of failures) {
      if (t.baselineDay <= day) {
        bE.push({ ...t, key: "b" + t.id, day: t.baselineDay, recovered: t.baselineRecovered });
      }
      if (t.agentDay <= day) {
        aE.push({ ...t, key: "a" + t.id, day: t.agentDay, recovered: t.agentRecovered, move: t.agentMove });
      }
    }
    bE.sort((x, y) => x.day - y.day);
    aE.sort((x, y) => x.day - y.day);

    return {
      baseTotal: baseDay?.recovered ?? 0,
      agentTotal: agentDay?.recovered ?? 0,
      baseRate: totalCharges ? ((baseDay?.recovered_count ?? 0) / totalCharges) * 100 : 0,
      agentRate: totalCharges ? ((agentDay?.recovered_count ?? 0) / totalCharges) * 100 : 0,
      baseEvents: bE.slice(-7),
      agentEvents: aE.slice(-7),
    };
  }, [sim, failures, day, totalCharges]);

  const lift = baseTotal > 0 ? ((agentTotal - baseTotal) / baseTotal) * 100 : 0;

  const handlePlayPause = () => {
    if (day >= horizon) {
      setDay(0);
      setPlaying(true);
    } else {
      setPlaying((p) => !p);
    }
  };

  const restart = () => {
    setPlaying(false);
    setDay(0);
    setSeed((s) => s + 1);
  };

  if (error) {
    return (
      <CenterMessage>
        Couldn't reach the Payday API ({error}). Is{" "}
        <code style={{ color: TEXT }}>uvicorn app.main:app --port 8000</code> running?
      </CenterMessage>
    );
  }

  if (!sim) {
    return <CenterMessage>Running the comparison&hellip;</CenterMessage>;
  }

  return (
    <div style={{ background: INK, minHeight: "100vh", color: TEXT }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
        .event-row { animation: slip 260ms ease-out; }
        @keyframes slip {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .event-row { animation: none; }
        }
        .ctl:focus-visible { outline: 2px solid ${VIOLET}; outline-offset: 2px; }
      `}</style>

      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <header className="px-5 sm:px-7 pt-8 pb-6" style={{ borderBottom: `1px solid ${LINE}` }}>
          <div style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: MUTE, marginBottom: 10 }}>
            {totalCharges} failed charges &middot; {inr(atRisk)} at risk &middot; same
            dataset, both sides &middot; seed {sim.seed}
          </div>
          <h1
            style={{
              fontFamily: FONT_SANS, fontSize: "clamp(26px, 4.6vw, 40px)", fontWeight: 700,
              letterSpacing: "-0.03em", lineHeight: 1.08, margin: 0,
            }}
          >
            Watch a fixed retry schedule lose to a reasoning agent.
          </h1>

          <div className="flex flex-wrap items-center gap-3 mt-6">
            <button
              className="ctl"
              onClick={handlePlayPause}
              style={{
                background: playing ? "transparent" : VIOLET,
                color: playing ? TEXT : INK,
                border: `1px solid ${playing ? LINE : VIOLET}`,
                padding: "7px 18px", fontSize: 13, cursor: "pointer",
              }}
            >
              {playing ? "Pause" : day >= horizon ? "Replay" : "Play"}
            </button>
            <button
              className="ctl"
              onClick={restart}
              style={{ background: "transparent", color: MUTE, border: `1px solid ${LINE}`, padding: "7px 18px", fontSize: 13, cursor: "pointer" }}
            >
              New cohort
            </button>
            <input
              type="range"
              min={0}
              max={horizon}
              value={day}
              onChange={(e) => {
                setPlaying(false);
                setDay(Number(e.target.value));
              }}
              className="ctl"
              style={{ flex: 1, minWidth: 140, accentColor: VIOLET }}
              aria-label="Scrub simulation day"
            />
            <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: MUTE, minWidth: 62, textAlign: "right" }}>
              day {String(day).padStart(2, "0")}/{horizon}
            </span>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2" style={{ borderBottom: `1px solid ${LINE}` }}>
          <div style={{ borderRight: `1px solid ${LINE}` }}>
            <Panel
              side="baseline"
              subtitle="Baseline"
              title={sim.baseline.label}
              recovered={baseTotal}
              rate={baseRate}
              events={baseEvents}
              atRisk={atRisk}
            />
          </div>
          <Panel
            side="agent"
            subtitle="Recovery agent"
            title={sim.agent.label}
            recovered={agentTotal}
            rate={agentRate}
            events={agentEvents}
            atRisk={atRisk}
          />
        </div>

        <footer className="px-5 sm:px-7 py-7 flex flex-wrap items-end gap-x-10 gap-y-5">
          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: MUTE, marginBottom: 8 }}>
              Extra revenue recovered
            </div>
            <div style={{ fontFamily: FONT_MONO, fontSize: "clamp(26px, 4vw, 36px)", color: GOLD, fontVariantNumeric: "tabular-nums" }}>
              {inr(Math.max(0, agentTotal - baseTotal))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: MUTE, marginBottom: 8 }}>
              Lift over baseline
            </div>
            <div style={{ fontFamily: FONT_MONO, fontSize: "clamp(26px, 4vw, 36px)", color: GOLD, fontVariantNumeric: "tabular-nums" }}>
              {lift > 0 ? "+" : ""}
              {lift.toFixed(0)}%
            </div>
          </div>
          <p style={{ fontSize: 12, color: MUTE, lineHeight: 1.6, maxWidth: 380, margin: 0 }}>
            Both sides receive identical failed charges from the same run of the Payday
            API. The only difference is what decides when to retry and what to say.
          </p>
        </footer>
      </div>
    </div>
  );
}
