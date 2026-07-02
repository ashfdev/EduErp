"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { PortalShell } from "@/components/portal-shell";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Card, CardContent, Button, LoadingSpinner } from "@education-erp/ui";

interface StudentDetail {
  student_uid: string; name_en: string; name_bn: string | null; phone: string | null;
  current_roll_no: string | null; registration_no: string | null;
  current_class: { name_en: string } | null; current_section: { name: string } | null;
  father_name: string | null; father_phone: string | null; mother_name: string | null; mother_phone: string | null;
}

function ProfileContent() {
  const router = useRouter();
  const { activeStudentId, logout } = useAuthStore();

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
    <div className="space-y-4 p-4">
      <h1 className="text-lg font-semibold">Profile</h1>
      <Card>
        <CardContent className="space-y-2 pt-6 text-sm">
          <p><span className="text-gray-500">Name (EN):</span> {data.name_en}</p>
          <p><span className="text-gray-500">Name (BN):</span> {data.name_bn ?? "—"}</p>
          <p><span className="text-gray-500">Student ID:</span> {data.student_uid}</p>
          <p><span className="text-gray-500">Class:</span> {data.current_class?.name_en} {data.current_section && `· ${data.current_section.name}`}</p>
          <p><span className="text-gray-500">Roll:</span> {data.current_roll_no ?? "—"}</p>
          <p><span className="text-gray-500">Registration No:</span> {data.registration_no ?? "—"}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-2 pt-6 text-sm">
          <p className="font-medium">Contact</p>
          <p><span className="text-gray-500">Phone:</span> {data.phone ?? "—"}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-2 pt-6 text-sm">
          <p className="font-medium">Guardian</p>
          <p><span className="text-gray-500">Father:</span> {data.father_name} ({data.father_phone})</p>
          <p><span className="text-gray-500">Mother:</span> {data.mother_name ?? "—"} ({data.mother_phone ?? "—"})</p>
        </CardContent>
      </Card>
      <Button variant="outline" className="w-full" onClick={() => logoutMutation.mutate()}>Sign Out</Button>
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
