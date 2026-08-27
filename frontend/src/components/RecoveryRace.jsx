import { useState, useEffect, useMemo, useRef } from "react";

const INK = "#0B0D12";
const PANEL = "#12151C";
const LINE = "#1E232D";
const TEXT = "#E8E6E1";
const MUTE = "#79808D";
const GOLD = "#E5B04B";
const STEEL = "#5A6472";
const RUST = "#C15F3C";
const VIOLET = "#8B7FE8";

const REASONS = {
  insufficient_funds: {
    label: "Insufficient funds",
    weight: 34,
    baseRate: 0.41,
    agentRate: 0.68,
    move: "hold until payday",
  },
  card_expired: {
    label: "Card expired",
    weight: 22,
    baseRate: 0.08,
    agentRate: 0.71,
    move: "send update link",
  },
  do_not_honor: {
    label: "Do not honor",
    weight: 18,
    baseRate: 0.22,
    agentRate: 0.39,
    move: "switch method",
  },
  auth_timeout: {
    label: "3DS timeout",
    weight: 14,
    baseRate: 0.55,
    agentRate: 0.89,
    move: "retry immediately",
  },
  network_error: {
    label: "Network error",
    weight: 12,
    baseRate: 0.61,
    agentRate: 0.92,
    move: "retry in 2 hours",
  },
};

const NAMES = [
  "Aarav Mehta", "Priya Nair", "Rohan Iyer", "Sana Qureshi", "Vikram Rao",
  "Ishita Bose", "Karan Malhotra", "Neha Pillai", "Aditya Shah", "Meera Krishnan",
  "Farhan Ali", "Divya Reddy", "Siddharth Jain", "Ananya Ghosh", "Rahul Menon",
  "Tara Kapoor", "Nikhil Verma", "Kavya Subramanian", "Arjun Desai", "Riya Chatterjee",
];

const PLANS = [499, 999, 1999, 4999, 9999];
const HORIZON = 30;
const TOTAL_FAILURES = 160;

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickReason(r) {
  const roll = r() * 100;
  let acc = 0;
  for (const key of Object.keys(REASONS)) {
    acc += REASONS[key].weight;
    if (roll < acc) return key;
  }
  return "network_error";
}

function buildDataset(seed) {
  const r = mulberry32(seed);
  const failures = [];

  for (let i = 0; i < TOTAL_FAILURES; i++) {
    const reasonKey = pickReason(r);
    const reason = REASONS[reasonKey];
    const amount = PLANS[Math.floor(r() * PLANS.length)];
    const name = NAMES[Math.floor(r() * NAMES.length)];
    const failDay = Math.floor(r() * 19);
    const payday = r() < 0.5 ? 1 : 15;

    const baselineWins = r() < reason.baseRate;
    const baselineAttempts = [failDay + 1, failDay + 3, failDay + 7];
    const baselineDay = baselineWins
      ? baselineAttempts[Math.floor(r() * 3)]
      : null;

    const agentWins = r() < reason.agentRate;
    let agentDay = null;
    if (agentWins) {
      if (reasonKey === "insufficient_funds") {
        let d = failDay + 1;
        while (d % 30 !== payday && d % 30 !== payday + 1) d++;
        agentDay = Math.min(d, HORIZON);
      } else if (reasonKey === "card_expired") {
        agentDay = failDay + 2 + Math.floor(r() * 4);
      } else if (reasonKey === "do_not_honor") {
        agentDay = failDay + 2 + Math.floor(r() * 5);
      } else {
        agentDay = failDay + (r() < 0.7 ? 0 : 1);
      }
    }

    failures.push({
      id: i,
      name,
      amount,
      reasonKey,
      reasonLabel: reason.label,
      move: reason.move,
      failDay,
      baselineDay: baselineDay !== null && baselineDay <= HORIZON ? baselineDay : null,
      agentDay: agentDay !== null && agentDay <= HORIZON ? agentDay : null,
    });
  }

  return failures;
}

function inr(n) {
  return "\u20B9" + n.toLocaleString("en-IN");
}

function Counter({ value, color, dim }) {
  return (
    <div
      style={{
        fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
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
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 11,
          color: MUTE,
          minWidth: 34,
        }}
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
        style={{ fontSize: 11, color: side === "agent" ? VIOLET : MUTE, maxWidth: 120 }}
      >
        {side === "agent" ? ev.move : ev.reasonLabel}
      </span>
      <span
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
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
              fontSize: 10,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: isAgent ? VIOLET : MUTE,
              marginBottom: 6,
            }}
          >
            {subtitle}
          </div>
          <div
            style={{
              fontFamily: "'Space Grotesk', system-ui, sans-serif",
              fontSize: 17,
              fontWeight: 500,
              color: TEXT,
            }}
          >
            {title}
          </div>
        </div>
        <div
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 12,
            color: isAgent ? GOLD : MUTE,
            fontVariantNumeric: "tabular-nums",
            paddingTop: 18,
          }}
        >
          {rate.toFixed(1)}%
        </div>
      </div>

      <Counter value={recovered} color={isAgent ? GOLD : STEEL} dim={!isAgent} />

      <div
        className="mt-3 mb-5"
        style={{ height: 3, background: LINE, borderRadius: 0 }}
      >
        <div
          style={{
            height: "100%",
            width: bar + "%",
            background: isAgent ? GOLD : STEEL,
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

export default function RecoveryRace() {
  const [day, setDay] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [seed, setSeed] = useState(7);
  const timer = useRef(null);

  const data = useMemo(() => buildDataset(seed), [seed]);

  const atRisk = useMemo(
    () => data.reduce((s, t) => s + t.amount, 0),
    [data]
  );

  useEffect(() => {
    if (!playing) return;
    if (day >= HORIZON) {
      setPlaying(false);
      return;
    }
    timer.current = setTimeout(() => setDay((d) => d + 1), 260);
    return () => clearTimeout(timer.current);
  }, [playing, day]);

  const { baseTotal, agentTotal, baseEvents, agentEvents, baseCount, agentCount } =
    useMemo(() => {
      let bT = 0;
      let aT = 0;
      let bC = 0;
      let aC = 0;
      const bE = [];
      const aE = [];

      for (const t of data) {
        if (t.baselineDay !== null && t.baselineDay <= day) {
          bT += t.amount;
          bC += 1;
          bE.push({ ...t, key: "b" + t.id, day: t.baselineDay, recovered: true });
        } else if (t.baselineDay === null && t.failDay + 7 <= day) {
          bE.push({ ...t, key: "b" + t.id, day: t.failDay + 7, recovered: false });
        }

        if (t.agentDay !== null && t.agentDay <= day) {
          aT += t.amount;
          aC += 1;
          aE.push({ ...t, key: "a" + t.id, day: t.agentDay, recovered: true });
        } else if (t.agentDay === null && t.failDay + 5 <= day) {
          aE.push({ ...t, key: "a" + t.id, day: t.failDay + 5, recovered: false });
        }
      }

      bE.sort((x, y) => x.day - y.day);
      aE.sort((x, y) => x.day - y.day);

      return {
        baseTotal: bT,
        agentTotal: aT,
        baseEvents: bE.slice(-7),
        agentEvents: aE.slice(-7),
        baseCount: bC,
        agentCount: aC,
      };
    }, [data, day]);

  const lift = baseTotal > 0 ? ((agentTotal - baseTotal) / baseTotal) * 100 : 0;

  const restart = () => {
    setDay(0);
    setSeed((s) => s + 1);
    setPlaying(true);
  };

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
        <header
          className="px-5 sm:px-7 pt-8 pb-6"
          style={{ borderBottom: `1px solid ${LINE}` }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: MUTE,
              marginBottom: 10,
            }}
          >
            {TOTAL_FAILURES} failed charges &middot; {inr(atRisk)} at risk &middot; same
            dataset, both sides
          </div>
          <h1
            style={{
              fontFamily: "'Space Grotesk', system-ui, sans-serif",
              fontSize: "clamp(26px, 4.6vw, 40px)",
              fontWeight: 700,
              letterSpacing: "-0.03em",
              lineHeight: 1.08,
              margin: 0,
            }}
          >
            Watch a fixed retry schedule lose to a reasoning agent.
          </h1>

          <div className="flex flex-wrap items-center gap-3 mt-6">
            <button
              className="ctl"
              onClick={() => setPlaying((p) => !p)}
              style={{
                background: playing ? "transparent" : VIOLET,
                color: playing ? TEXT : INK,
                border: `1px solid ${playing ? LINE : VIOLET}`,
                padding: "7px 18px",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {playing ? "Pause" : day >= HORIZON ? "Replay" : "Play"}
            </button>
            <button
              className="ctl"
              onClick={restart}
              style={{
                background: "transparent",
                color: MUTE,
                border: `1px solid ${LINE}`,
                padding: "7px 18px",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              New cohort
            </button>
            <input
              type="range"
              min={0}
              max={HORIZON}
              value={day}
              onChange={(e) => {
                setPlaying(false);
                setDay(Number(e.target.value));
              }}
              className="ctl"
              style={{ flex: 1, minWidth: 140, accentColor: VIOLET }}
              aria-label="Scrub simulation day"
            />
            <span
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 13,
                color: MUTE,
                minWidth: 62,
                textAlign: "right",
              }}
            >
              day {String(day).padStart(2, "0")}/{HORIZON}
            </span>
          </div>
        </header>

        <div
          className="grid grid-cols-1 md:grid-cols-2"
          style={{ borderBottom: `1px solid ${LINE}` }}
        >
          <div style={{ borderRight: `1px solid ${LINE}` }}>
            <Panel
              side="baseline"
              subtitle="Baseline"
              title="Fixed retries on day 1, 3, 7"
              recovered={baseTotal}
              rate={(baseCount / TOTAL_FAILURES) * 100}
              events={baseEvents}
              atRisk={atRisk}
            />
          </div>
          <Panel
            side="agent"
            subtitle="Recovery agent"
            title="Diagnose, then time each retry"
            recovered={agentTotal}
            rate={(agentCount / TOTAL_FAILURES) * 100}
            events={agentEvents}
            atRisk={atRisk}
          />
        </div>

        <footer className="px-5 sm:px-7 py-7 flex flex-wrap items-end gap-x-10 gap-y-5">
          <div>
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: MUTE,
                marginBottom: 8,
              }}
            >
              Extra revenue recovered
            </div>
            <div
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: "clamp(26px, 4vw, 36px)",
                color: GOLD,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {inr(Math.max(0, agentTotal - baseTotal))}
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: MUTE,
                marginBottom: 8,
              }}
            >
              Lift over baseline
            </div>
            <div
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: "clamp(26px, 4vw, 36px)",
                color: GOLD,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {lift > 0 ? "+" : ""}
              {lift.toFixed(0)}%
            </div>
          </div>
          <p
            style={{
              fontSize: 12,
              color: MUTE,
              lineHeight: 1.6,
              maxWidth: 380,
              margin: 0,
            }}
          >
            Both sides receive identical failed charges. The only difference is what
            decides when to retry and what to say.
          </p>
        </footer>
      </div>
    </div>
  );
}
