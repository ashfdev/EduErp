import { getContent } from '@/lib/api';

interface FacultyMember {
  name: string;
  designation: string;
  department: string | null;
  qualification: string | null;
  photoUrl: string | null;
  email: string | null;
}

export default async function FacultyPage() {
  const faculty = await getContent<FacultyMember[]>('/faculty');

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Faculty Directory</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {(faculty ?? []).map((f, i) => (
          <div key={i} className="rounded-md border p-3 text-center">
            {f.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={f.photoUrl} alt={f.name} className="mx-auto h-20 w-20 rounded-full object-cover" />
            ) : (
              <div className="mx-auto h-20 w-20 rounded-full bg-gray-200" />
            )}
            <div className="mt-2 font-medium">{f.name}</div>
            <div className="text-sm text-gray-600">{f.designation}</div>
            {f.department && <div className="text-xs text-gray-500">{f.department}</div>}
            {f.qualification && <div className="text-xs text-gray-500">{f.qualification}</div>}
          </div>
        ))}
        {(!faculty || faculty.length === 0) && <p className="text-sm text-gray-500">No faculty listed yet.</p>}
      </div>
    </div>
  );
}
