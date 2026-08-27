import { useEffect, useState } from "react";
import { diagnoseDecline, fetchDiagnoseExamples } from "../api/client.js";
import { INK, PANEL, LINE, TEXT, MUTE, GOLD, VIOLET, RUST, FONT_SANS, FONT_MONO } from "../lib/theme.js";

const ACTION_LABELS = {
  retry: "Retry charge",
  send_card_update_link: "Send card-update link",
  switch_method: "Switch payment method",
  outreach: "Send outreach",
};

function ExampleChip({ text, onClick }) {
  return (
    <button
      onClick={() => onClick(text)}
      className="ctl"
      style={{
        background: "transparent", border: `1px solid ${LINE}`, color: MUTE,
        fontSize: 11, padding: "5px 10px", cursor: "pointer", textAlign: "left",
        fontFamily: FONT_MONO,
      }}
    >
      {text}
    </button>
  );
}

export default function DiagnosePanel() {
  const [examples, setExamples] = useState({});
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDiagnoseExamples().then(setExamples).catch(() => {});
  }, []);

  const runDiagnosis = async (raw) => {
    const input = raw ?? text;
    if (!input.trim()) return;
    setText(input);
    setLoading(true);
    setError(null);
    try {
      const res = await diagnoseDecline(input);
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const flatExamples = Object.values(examples).flat().slice(0, 6);

  return (
    <div style={{ background: INK, borderTop: `1px solid ${LINE}` }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }} className="px-5 sm:px-7 py-10">
        <div style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: MUTE, marginBottom: 10 }}>
          Live diagnosis &middot; POST /diagnose
        </div>
        <h2 style={{ fontFamily: FONT_SANS, fontSize: "clamp(20px, 3vw, 28px)", fontWeight: 700, color: TEXT, margin: "0 0 8px" }}>
          Classify a raw decline, right now
        </h2>
        <p style={{ fontSize: 13, color: MUTE, maxWidth: 640, lineHeight: 1.6, margin: "0 0 20px" }}>
          Every charge in the race above already carries a clean failure code because the
          simulator wrote it. A real processor doesn't do that &mdash; it hands you a raw
          string. Paste one below (or pick an example) and this calls Groq to classify it
          into Payday's taxonomy and generate the plan, live.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Decline code 05: Do not honor"
              rows={3}
              className="ctl"
              style={{
                width: "100%", background: PANEL, border: `1px solid ${LINE}`, color: TEXT,
                fontSize: 13, padding: "10px 12px", fontFamily: FONT_MONO, resize: "vertical",
              }}
            />
            <div className="flex flex-wrap gap-2 mt-3">
              {flatExamples.map((ex) => (
                <ExampleChip key={ex} text={ex} onClick={runDiagnosis} />
              ))}
            </div>
            <button
              className="ctl"
              onClick={() => runDiagnosis()}
              disabled={loading || !text.trim()}
              style={{
                marginTop: 14, background: VIOLET, color: INK, border: "none",
                padding: "9px 20px", fontSize: 13, fontWeight: 500,
                cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "Classifying…" : "Diagnose"}
            </button>
            {error && (
              <div style={{ marginTop: 10, fontSize: 12, color: RUST }}>{error}</div>
            )}
          </div>

          <div style={{ background: PANEL, border: `1px solid ${LINE}`, minHeight: 200, padding: "18px 20px" }}>
            {!result ? (
              <div style={{ fontSize: 12, color: MUTE }}>Result appears here.</div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div style={{ fontFamily: FONT_SANS, fontSize: 16, fontWeight: 500, color: TEXT }}>
                    {result.diagnosis.label}
                  </div>
                  <span
                    style={{
                      fontFamily: FONT_MONO, fontSize: 10, letterSpacing: "0.08em",
                      textTransform: "uppercase", color: result.diagnosis.source === "llm" ? GOLD : MUTE,
                      border: `1px solid ${result.diagnosis.source === "llm" ? GOLD : LINE}`,
                      padding: "2px 8px",
                    }}
                  >
                    {result.diagnosis.source === "llm" ? "groq" : "heuristic fallback"}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: MUTE, marginBottom: 4 }}>
                  confidence {(result.diagnosis.confidence * 100).toFixed(0)}%
                </div>
                <p style={{ fontSize: 13, color: TEXT, lineHeight: 1.6, margin: "6px 0 16px" }}>
                  {result.diagnosis.reasoning}
                </p>

                <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTE, marginBottom: 8 }}>
                  Payday's plan for this family
                </div>
                <div>
                  {result.recommended_plan.map((a, i) => (
                    <div
                      key={i}
                      className="flex items-baseline gap-3 py-1.5"
                      style={{ borderBottom: i < result.recommended_plan.length - 1 ? `1px solid ${LINE}` : "none" }}
                    >
                      <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: MUTE, minWidth: 40 }}>
                        d+{a.day}
                      </span>
                      <span style={{ fontSize: 12, color: VIOLET, minWidth: 150 }}>
                        {ACTION_LABELS[a.kind] ?? a.kind}
                      </span>
                      <span style={{ fontSize: 12, color: TEXT, flex: 1 }}>{a.reason}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
