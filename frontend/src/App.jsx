import UsageGuide from "./components/UsageGuide.jsx";
import RecoveryRace from "./components/RecoveryRace.jsx";
import DiagnosePanel from "./components/DiagnosePanel.jsx";
import OutreachPanel from "./components/OutreachPanel.jsx";
// LedgerPanel is built and working (see components/LedgerPanel.jsx) but only
// shows something once MONGODB_URI is set -- pulled off the page for the
// submission demo so there's nothing on screen saying "not configured yet".
// Re-add the import and <LedgerPanel /> below once that's wired up.

export default function App() {
  return (
    <>
      <UsageGuide />
      <RecoveryRace />
      <DiagnosePanel />
      <OutreachPanel />
    </>
  );
}
