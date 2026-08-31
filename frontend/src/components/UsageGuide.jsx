import { INK, PANEL, LINE, TEXT, MUTE, GOLD, VIOLET, FONT_MONO, FONT_SANS } from "../lib/theme.js";

const STEPS = [
  {
    n: "1",
    text: "The race below plays itself",
    hint: "pause it or drag the slider",
    href: null,
  },
  {
    n: "2",
    text: "Click an example to diagnose it",
    hint: "real Groq call",
    href: "#diagnose",
  },
  {
    n: "3",
    text: "Click Generate message on any row",
    hint: "real Groq call",
    href: "#outreach",
  },
  {
    n: "4",
    text: "Watch it land in the ledger",
    hint: "saved live",
    href: "#ledger",
  },
];

function Step({ n, text, hint, href }) {
  const inner = (
    <>
      <span
        style={{
          fontFamily: FONT_MONO, fontSize: 11, color: INK, background: GOLD,
          width: 18, height: 18, borderRadius: "50%", display: "inline-flex",
          alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: 700,
        }}
      >
        {n}
      </span>
      <span style={{ fontSize: 13, color: TEXT }}>{text}</span>
      <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: MUTE }}>{hint}</span>
    </>
  );

  const style = {
    display: "inline-flex", alignItems: "center", gap: 9,
    padding: "8px 4px",
  };

  if (!href) {
    return <div style={style}>{inner}</div>;
  }

  return (
    <a
      href={href}
      className="ctl usage-link"
      style={{ ...style, textDecoration: "none", borderBottom: "none", cursor: "pointer" }}
    >
      {inner}
      <span style={{ color: VIOLET, fontSize: 13 }}>&darr;</span>
    </a>
  );
}

export default function UsageGuide() {
  return (
    <div
      style={{
        background: PANEL, borderBottom: `1px solid ${LINE}`,
        position: "sticky", top: 0, zIndex: 30,
        boxShadow: "0 8px 24px -12px rgba(0,0,0,0.6)",
      }}
    >
      <style>{`
        .usage-link:hover span:nth-child(2) { color: ${VIOLET} !important; text-decoration: underline; }
      `}</style>
      <div
        style={{ maxWidth: 1180, margin: "0 auto" }}
        className="px-5 sm:px-7 py-3 flex flex-wrap items-center gap-x-2"
      >
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          style={{
            fontFamily: FONT_SANS, fontSize: 13, fontWeight: 700, color: TEXT,
            textDecoration: "none", borderBottom: "none", marginRight: 20, flexShrink: 0,
            letterSpacing: "-0.01em",
          }}
        >
          Payday
        </a>
        <div className="flex flex-wrap items-center gap-x-7 gap-y-1">
          {STEPS.map((s) => (
            <Step key={s.n} {...s} />
          ))}
        </div>
      </div>
    </div>
  );
}
