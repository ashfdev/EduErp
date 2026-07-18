"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { PortalShell } from "@/components/portal-shell";
import { LanguageToggle } from "@/components/language-toggle";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Card, CardContent, Button, LoadingSpinner } from "@education-erp/ui";

interface StudentDetail {
  student_uid: string; name_en: string; name_bn: string | null; phone: string | null;
  current_roll_no: string | null; registration_no: string | null;
  current_class: { name_en: string } | null; current_section: { name: string } | null;
  father_name: string | null; father_phone: string | null; mother_name: string | null; mother_phone: string | null;
}

import { UserCircle, Phone, Users, Shield, Languages, LogOut, GraduationCap, FileText, Hash } from "lucide-react";

// (Skipping boilerplate above ProfileContent)
function ProfileContent() {
  const router = useRouter();
  const { activeStudentId, logout } = useAuthStore();
  const t = useTranslations("profile");

  const { data, isLoading } = useQuery<StudentDetail>({
    queryKey: ["portal", "profile", activeStudentId],
    queryFn: async () => (await api.get(`/api/portal/student/${activeStudentId}/profile`)).data.data,
    enabled: !!activeStudentId,
  });

  const logoutMutation = useMutation({
    mutationFn: () => Promise.resolve(),
    onSuccess: () => {
      logout();
      router.replace("/login");
    },
  });

  if (isLoading || !data) return <div className="flex min-h-[50vh] items-center justify-center"><LoadingSpinner /></div>;

  return (
    <div className="space-y-6 lg:space-y-8 max-w-3xl mx-auto w-full">
      {/* Profile Hero */}
      <div className="flex flex-col items-center text-center py-6">
        <div className="h-24 w-24 rounded-3xl bg-primary/10 text-primary flex items-center justify-center shadow-inner mb-4">
           <span className="text-4xl font-bold">{data.name_en.charAt(0)}</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{data.name_en}</h1>
        {data.name_bn && <p className="text-sm font-medium text-slate-500 mt-1">{data.name_bn}</p>}
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
           <Hash className="h-3.5 w-3.5" />
           {data.student_uid}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
        {/* Academic Info */}
        <Card className="border-0 shadow-sm md:col-span-2">
          <CardContent className="p-0">
             <div className="bg-slate-50/50 p-4 border-b border-slate-100 flex items-center gap-2">
               <GraduationCap className="h-5 w-5 text-indigo-500" />
               <h3 className="font-bold text-slate-700">Academic Details</h3>
             </div>
             <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{t("class")}</p>
                  <p className="font-semibold text-slate-800">{data.current_class?.name_en} {data.current_section && `· ${data.current_section.name}`}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{t("roll")}</p>
                  <p className="font-semibold text-slate-800">{data.current_roll_no ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{t("registrationNo")}</p>
                  <p className="font-semibold text-slate-800">{data.registration_no ?? "—"}</p>
                </div>
             </div>
          </CardContent>
        </Card>

        {/* Contact Info */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
             <div className="bg-slate-50/50 p-4 border-b border-slate-100 flex items-center gap-2">
               <Phone className="h-5 w-5 text-emerald-500" />
               <h3 className="font-bold text-slate-700">{t("contact")}</h3>
             </div>
             <div className="p-5 space-y-4">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{t("phone")}</p>
                  <p className="font-semibold text-slate-800">{data.phone ?? "—"}</p>
                </div>
             </div>
          </CardContent>
        </Card>

        {/* Guardian Info */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
             <div className="bg-slate-50/50 p-4 border-b border-slate-100 flex items-center gap-2">
               <Users className="h-5 w-5 text-amber-500" />
               <h3 className="font-bold text-slate-700">{t("guardian")}</h3>
             </div>
             <div className="p-5 space-y-4">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{t("father")}</p>
                  <p className="font-semibold text-slate-800">{data.father_name || "—"}</p>
                  {data.father_phone && <p className="text-sm text-slate-500">{data.father_phone}</p>}
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{t("mother")}</p>
                  <p className="font-semibold text-slate-800">{data.mother_name || "—"}</p>
                  {data.mother_phone && <p className="text-sm text-slate-500">{data.mother_phone}</p>}
                </div>
             </div>
          </CardContent>
        </Card>
      </div>

      {/* Settings / Actions */}
      <div className="pt-6 space-y-3">
        <div className="flex items-center justify-between p-4 rounded-2xl bg-white border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-xl text-slate-600"><Languages className="h-5 w-5" /></div>
            <span className="font-semibold text-slate-700">{t("language")}</span>
          </div>
          <LanguageToggle />
        </div>
        
        <button 
          onClick={() => logoutMutation.mutate()}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-50 p-4 text-sm font-bold text-rose-600 transition-colors hover:bg-rose-100"
        >
          <LogOut className="h-5 w-5" />
          {t("signOut")}
        </button>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <PortalShell>
      <ProfileContent />
    </PortalShell>
  );
}
