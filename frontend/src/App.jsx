import UsageGuide from "./components/UsageGuide.jsx";
import RecoveryRace from "./components/RecoveryRace.jsx";
import DiagnosePanel from "./components/DiagnosePanel.jsx";
import OutreachPanel from "./components/OutreachPanel.jsx";
import LedgerPanel from "./components/LedgerPanel.jsx";

export default function App() {
  return (
    <>
      <UsageGuide />
      <RecoveryRace />
      <DiagnosePanel />
      <OutreachPanel />
      <LedgerPanel />
    </>
  );
}
