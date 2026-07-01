import { getContent } from '@/lib/api';

interface Album {
  id: string;
  name: string;
  description: string | null;
  images: { id: string; imageUrl: string; caption: string | null }[];
}

export default async function GalleryPage() {
  const albums = await getContent<Album[]>('/gallery');

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Photo Gallery</h1>
      {(albums ?? []).map((album) => (
        <section key={album.id} className="mb-8">
          <h2 className="mb-2 font-medium">{album.name}</h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {album.images.map((img) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={img.id} src={img.imageUrl} alt={img.caption ?? album.name} className="aspect-square w-full rounded-md object-cover" />
            ))}
          </div>
        </section>
      ))}
      {(!albums || albums.length === 0) && <p className="text-sm text-gray-500">No albums published yet.</p>}
    </div>
  );
}
