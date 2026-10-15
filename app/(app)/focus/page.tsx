import { recordFocusSession } from '@/app/actions';
import { FocusTimer } from '@/components/FocusTimer';
import { PremiumGate } from '@/components/PremiumGate';

export const dynamic = 'force-dynamic';

function FocusPageContent() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Focus</h1>
          <p>Work in one block of time without interruptions. Finished sessions appear in Stats.</p>
        </div>
      </div>
      <FocusTimer record={recordFocusSession} />
    </>
  );
}

export default function FocusPage() {
  return <PremiumGate feature="Focus timer"><FocusPageContent /></PremiumGate>;
}
