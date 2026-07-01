import { notFound } from 'next/navigation';
import { getContent } from '@/lib/api';

interface PageContent {
  title: string;
  titleBn: string | null;
  bodyHtml: string;
}

export default async function StaticPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getContent<PageContent>(`/pages/${slug}`);

  if (!page) notFound();

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">{page.title}</h1>
      {page.titleBn && <h2 className="mb-4 text-lg text-gray-600">{page.titleBn}</h2>}
      {/* eslint-disable-next-line react/no-danger */}
      <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: page.bodyHtml }} />
    </div>
  );
}
