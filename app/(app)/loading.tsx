export default function Loading() {
  return (
    <div className="page-skeleton" role="status" aria-live="polite" aria-label="Loading">
      <div className="sk sk-title" />
      <div className="sk sk-sub" />
      <div className="sk-grid">
        <div className="sk sk-card" /><div className="sk sk-card" /><div className="sk sk-card" /><div className="sk sk-card" />
      </div>
      <div className="sk sk-block" />
      <div className="sk sk-block short" />
    </div>
  );
}
