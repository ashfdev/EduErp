import Link from "next/link";
import type { Institution } from "@/lib/types";

export function Footer({ institution }: { institution: Institution | null }) {
  return (
    <footer className="mt-12 border-t bg-gray-900 text-gray-300">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 py-10 md:grid-cols-3">
        <div>
          <p className="text-lg font-semibold text-white">{institution?.name_en ?? "Institution"}</p>
          <p className="mt-2 text-sm">{institution?.established_text ?? institution?.tagline_en ?? ""}</p>
        </div>
        <div>
          <p className="mb-2 font-semibold text-white">Quick Links</p>
          <ul className="space-y-1 text-sm">
            <li><Link href="/about">About Us</Link></li>
            <li><Link href="/notices">Notice Board</Link></li>
            <li><Link href="/admission">Admission</Link></li>
            <li><Link href="/result">Result Lookup</Link></li>
            <li><Link href="/contact">Contact</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-2 font-semibold text-white">Contact</p>
          <p className="text-sm">{institution?.address}</p>
          <p className="text-sm">{institution?.phone_primary}</p>
          <p className="text-sm">{institution?.email_primary}</p>
          <div className="mt-2 flex gap-3 text-sm">
            {institution?.facebook_url && <a href={institution.facebook_url} target="_blank" rel="noreferrer">Facebook</a>}
            {institution?.youtube_url && <a href={institution.youtube_url} target="_blank" rel="noreferrer">YouTube</a>}
          </div>
        </div>
      </div>
      <div className="border-t border-gray-800 py-4 text-center text-xs">
        © {new Date().getFullYear()} {institution?.name_en ?? "Institution"} | Powered by AshDevs
      </div>
    </footer>
  );
}
