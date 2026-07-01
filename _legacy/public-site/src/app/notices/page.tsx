import { getContent, type NoticeItem } from '@/lib/api';

export default async function NoticesPage() {
  const notices = await getContent<NoticeItem[]>('/notices');

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Notice Board</h1>
      {notices && notices.length > 0 ? (
        <ul className="divide-y">
          {notices.map((n) => (
            <li key={n.id} className="py-3">
              <div className="font-medium">
                {n.isPinned && <span className="mr-1 text-amber-600">📌</span>}
                {n.title}
              </div>
              <p className="text-sm text-gray-600">{n.body}</p>
              <p className="text-xs text-gray-400">{n.publishAt.slice(0, 10)}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500">No notices published yet.</p>
      )}
    </div>
  );
}
