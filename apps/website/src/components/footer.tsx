"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import Image from "next/image";
import { fetchContent } from "@/lib/content-api";
import type { Institution } from "@/lib/types";
import { MapPin, Phone, Mail, ChevronRight, Facebook, Youtube, ExternalLink, Landmark } from "lucide-react";

interface ImportantLink {
  id: string;
  title: string;
  url: string;
}

export function Footer({ institution }: { institution: Institution | null }) {
  const t = useTranslations("footer");
  const [links, setLinks] = useState<ImportantLink[]>([]);

  useEffect(() => {
    fetchContent<ImportantLink[]>("/important-links").then((data) => setLinks(data ?? [])).catch(() => {});
  }, []);

  return (
    <footer className="mt-16 border-t border-[#142D33]/50 bg-[#142D33] text-slate-100">
      {/* Expanded container width max-w-[1536px] with tight side padding px-4 sm:px-8 lg:px-12 to remove giant side margins */}
      <div className="mx-auto max-w-[1536px] px-4 py-16 sm:px-8 lg:px-12">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-12 items-start">
          
          {/* Brand Column (All inner elements strictly CENTERED together) */}
          <div className="lg:col-span-4 flex flex-col items-center text-center space-y-4 pr-0 lg:pr-6">
            {institution?.logo_url ? (
              <div className="mb-2 h-20 w-20 overflow-hidden rounded-full bg-white p-1 shadow-sm ring-1 ring-primary/20 flex items-center justify-center">
                <Image src={institution.logo_url} alt="Logo" width={80} height={80} className="h-full w-full object-contain" />
              </div>
            ) : (
              <div className="mb-2 flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-3xl ring-1 ring-primary/20">
                🏫
              </div>
            )}
            <p className="text-xl font-bold text-white mb-1 text-center">{institution?.name_en ?? "Institution"}</p>
            {institution?.tagline_en && <p className="text-sm text-slate-300 font-medium text-center">{institution.tagline_en}</p>}
            {institution?.established_text && <p className="text-sm font-medium text-slate-300 text-center leading-relaxed max-w-sm">{institution.established_text}</p>}
            
            <div className="flex gap-3 justify-center pt-2">
              {institution?.facebook_url && (
                <a href={institution.facebook_url} target="_blank" rel="noreferrer" className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0e1f24] shadow-sm border border-white/10 text-white hover:bg-white hover:text-[#142D33] transition-all">
                  <Facebook className="h-5 w-5" />
                </a>
              )}
              {institution?.youtube_url && (
                <a href={institution.youtube_url} target="_blank" rel="noreferrer" className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0e1f24] shadow-sm border border-white/10 text-white hover:bg-white hover:text-red-600 transition-all">
                  <Youtube className="h-5 w-5" />
                </a>
              )}
            </div>
          </div>

          {/* Quick Links (lg:col-span-2) */}
          <div className="lg:col-span-2">
            <p className="mb-6 text-lg font-bold text-white relative inline-block">
              {t("quickLinks")}
              <span className="absolute -bottom-2 left-0 h-1 w-1/2 bg-white/60 rounded-full"></span>
            </p>
            <ul className="space-y-3 text-sm">
              {[
                { href: "/about", label: t("aboutUs") },
                { href: "/notices", label: t("noticeBoard") },
                { href: "/admission", label: t("admission") },
                { href: "/careers", label: t("careers") },
                { href: "/result", label: t("resultLookup") },
                { href: "/contact", label: t("contact") },
              ].map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="group flex items-center text-slate-300 hover:text-white transition-colors font-medium">
                    <ChevronRight className="mr-2 h-3.5 w-3.5 text-slate-400 group-hover:text-white transition-colors" />
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Important Links (lg:col-span-3) */}
          <div className="lg:col-span-3">
            <p className="mb-6 text-lg font-bold text-white relative inline-block">
              {t("importantLinks")}
              <span className="absolute -bottom-2 left-0 h-1 w-1/2 bg-white/60 rounded-full"></span>
            </p>
            <ul className="space-y-3 text-sm">
              {links.length > 0 ? (
                links.map((l) => (
                  <li key={l.id}>
                    <a href={l.url} target="_blank" rel="noreferrer" className="group flex items-center text-slate-300 hover:text-white transition-colors font-medium">
                      <ExternalLink className="mr-2 h-3.5 w-3.5 text-slate-400 group-hover:text-white transition-colors" />
                      {l.title}
                    </a>
                  </li>
                ))
              ) : (
                <li className="text-slate-400 italic">No links available</li>
              )}
            </ul>
          </div>

          {/* Contact Us (lg:col-span-3) */}
          <div className="lg:col-span-3">
            <p className="mb-6 text-lg font-bold text-white relative inline-block">
              {t("contactHeading")}
              <span className="absolute -bottom-2 left-0 h-1 w-1/2 bg-white/60 rounded-full"></span>
            </p>
            <ul className="space-y-4 text-sm">
              {institution?.address && (
                <li className="flex items-start">
                  <div className="mt-0.5 rounded-full bg-white/10 p-1.5 text-slate-200 mr-3 shrink-0">
                    <MapPin className="h-4 w-4" />
                  </div>
                  <span className="font-medium text-slate-200">{institution.address}</span>
                </li>
              )}
              {institution?.phone_primary && (
                <li className="flex items-center">
                  <div className="rounded-full bg-white/10 p-1.5 text-slate-200 mr-3 shrink-0">
                    <Phone className="h-4 w-4" />
                  </div>
                  <span className="font-medium text-slate-200">{institution.phone_primary}</span>
                </li>
              )}
              {institution?.email_primary && (
                <li className="flex items-center">
                  <div className="rounded-full bg-white/10 p-1.5 text-slate-200 mr-3 shrink-0">
                    <Mail className="h-4 w-4" />
                  </div>
                  <span className="font-medium text-slate-200">{institution.email_primary}</span>
                </li>
              )}
              {institution?.eiin && (
                <li className="flex items-center">
                  <div className="rounded-full bg-white/10 p-1.5 text-slate-200 mr-3 shrink-0">
                    <Landmark className="h-4 w-4" />
                  </div>
                  <span className="font-medium text-slate-200">{t("eiinLabel")} {institution.eiin}</span>
                </li>
              )}
            </ul>
          </div>

        </div>
      </div>
      
      {/* Bottom Bar */}
      <div className="border-t border-white/10 bg-[#0e1f24] py-6">
        <div className="mx-auto flex max-w-[1536px] flex-col items-center justify-between px-4 sm:px-8 lg:flex-row lg:px-12 text-sm">
          <p className="text-slate-300 mb-2 lg:mb-0 font-medium">
            © {new Date().getFullYear()} {institution?.name_en ?? "Institution"}. All rights reserved.
          </p>
          <p className="text-slate-300 flex items-center font-medium">
            {t("poweredBy")} <span className="ml-1 font-bold text-white">Education ERP</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
