import { getContent, type NoticeItem } from '@/lib/api';

interface SliderItem {
  id: string;
  imageUrl: string;
  title: string | null;
  subtitle: string | null;
  btnText: string | null;
  btnLink: string | null;
}

export default async function PublicHomePage() {
  const [slides, notices] = await Promise.all([
    getContent<SliderItem[]>('/sliders'),
    getContent<NoticeItem[]>('/notices'),
  ]);

  return (
    <div>
      {slides && slides.length > 0 && (
        <section className="mb-8 space-y-4">
          {slides.map((s) => (
            <div key={s.id} className="overflow-hidden rounded-lg border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.imageUrl} alt={s.title ?? ''} className="h-64 w-full object-cover" />
              {(s.title || s.subtitle) && (
                <div className="p-3">
                  {s.title && <h2 className="font-semibold">{s.title}</h2>}
                  {s.subtitle && <p className="text-sm text-gray-600">{s.subtitle}</p>}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Notices</h2>
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
      </section>
    </div>
  );
}
