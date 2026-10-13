import { recordFocusSession } from '@/app/actions';
import { FocusTimer } from '@/components/FocusTimer';

export const dynamic = 'force-dynamic';

export default function FocusPage() {
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
