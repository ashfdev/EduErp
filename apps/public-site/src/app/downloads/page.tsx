import { getContent } from '@/lib/api';

interface DownloadFile {
  id: string;
  title: string;
  category: string;
  fileUrl: string;
  academicYear: string | null;
}

export default async function DownloadsPage() {
  const files = await getContent<DownloadFile[]>('/downloads');
  const byCategory = new Map<string, DownloadFile[]>();
  for (const f of files ?? []) {
    if (!byCategory.has(f.category)) byCategory.set(f.category, []);
    byCategory.get(f.category)!.push(f);
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Downloads</h1>
      {[...byCategory.entries()].map(([category, categoryFiles]) => (
        <section key={category} className="mb-6">
          <h2 className="mb-2 font-medium">{category}</h2>
          <ul className="divide-y">
            {categoryFiles.map((f) => (
              <li key={f.id} className="py-2">
                <a href={f.fileUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                  {f.title}
                </a>
                {f.academicYear && <span className="ml-2 text-xs text-gray-500">({f.academicYear})</span>}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {(!files || files.length === 0) && <p className="text-sm text-gray-500">No files available yet.</p>}
    </div>
  );
}
