import { Notice } from "../app/useBoard";

export function NoticeStack({ notices }: { notices: Notice[] }) {
  if (notices.length === 0) return null;
  return (
    <div className="notice-stack" role="status" aria-live="polite">
      {notices.map((n) => (
        <div key={n.id} className={`notice notice-${n.kind}`}>
          <span className="notice-dot" />
          {n.text}
        </div>
      ))}
    </div>
  );
}
