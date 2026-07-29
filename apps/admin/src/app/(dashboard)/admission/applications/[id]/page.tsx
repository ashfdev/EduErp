"use client";

import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, StatusBadge } from "@education-erp/ui";
import { api } from "@/lib/api";

interface Application {
  id: string;
  admission_roll: string | null;
  applicant_name: string;
  status: string;
  merit_rank: number | null;
  guardian_info: { father_name?: string; mother_name?: string; phone: string; email?: string; address?: string };
  personal_info: Record<string, unknown>;
  previous_result: {
    institution?: string;
    class_passed?: string;
    gpa?: number;
    gpa_scale?: "5" | "4" | "OTHER";
    marks_obtained?: number;
    marks_total_out_of?: number;
    total_marks?: number; // legacy field from applications submitted before gpa_scale/marks_total_out_of existed
  } | null;
  selected_subjects: string[] | null;
  documents: Record<string, string> | null;
  enrolled_student_id: string | null;
  cycle: { id: string; name: string; class_id: string };
}

export default function AdmissionApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: app } = useQuery<Application>({ queryKey: ["admission", "applications", "detail", id], queryFn: async () => (await api.get(`/api/admission/applications/${id}`)).data.data });

  const statusMutation = useMutation({
    mutationFn: (status: "SHORTLISTED" | "WAITLISTED" | "REJECTED") => api.put(`/api/admission/applications/${id}/status`, { status }),
    onSuccess: () => {
      toast.success("Status updated");
      queryClient.invalidateQueries({ queryKey: ["admission", "applications", "detail", id] });
    },
  });

  const confirmMutation = useMutation({
    mutationFn: () => api.post(`/api/admission/applications/${id}/confirm`),
    onSuccess: () => {
      toast.success("Application confirmed");
      queryClient.invalidateQueries({ queryKey: ["admission", "applications", "detail", id] });
    },
    onError: () => toast.error("Only shortlisted applications can be confirmed"),
  });

  const enrollMutation = useMutation({
    mutationFn: () => api.post(`/api/admission/applications/${id}/enroll`, {}),
    onSuccess: (res) => {
      const loginWarnings: string[] | undefined = res.data.login_warnings;
      if (loginWarnings?.length) {
        for (const warning of loginWarnings) toast(warning, { duration: 15000 });
      }
      toast.success(`Enrolled as ${res.data.data.student_uid}`);
      queryClient.invalidateQueries({ queryKey: ["admission", "applications", "detail", id] });
      router.push(`/students/${res.data.data.id}`);
    },
    onError: () => toast.error("Only confirmed applications can be enrolled"),
  });

  if (!app) return <PageWrapper><p className="text-sm text-muted-foreground">Loading...</p></PageWrapper>;

  return (
    <PageWrapper>
      <PageHeader
        title={app.applicant_name}
        breadcrumbs={[{ label: "Admission", href: "/admission" }, { label: app.cycle.name, href: `/admission/cycles/${app.cycle.id}` }, { label: app.applicant_name }]}
        action={
          <div className="flex gap-2">
            {app.status === "PENDING" && (
              <>
                <Button variant="outline" onClick={() => statusMutation.mutate("SHORTLISTED")}>Shortlist</Button>
                <Button variant="outline" onClick={() => statusMutation.mutate("WAITLISTED")}>Waitlist</Button>
                <Button variant="destructive" onClick={() => statusMutation.mutate("REJECTED")}>Reject</Button>
              </>
            )}
            {app.status === "SHORTLISTED" && <Button onClick={() => confirmMutation.mutate()} disabled={confirmMutation.isPending}>Confirm Seat</Button>}
            {app.status === "CONFIRMED" && <Button onClick={() => enrollMutation.mutate()} disabled={enrollMutation.isPending}>Enroll Student</Button>}
          </div>
        }
      />

      <div className="flex items-center gap-3">
        <StatusBadge status={app.status} />
        {app.admission_roll && <span className="font-mono text-sm text-muted-foreground">{app.admission_roll}</span>}
        {app.merit_rank && <span className="text-sm text-muted-foreground">Merit Rank #{app.merit_rank}</span>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="space-y-2 pt-6">
            <p className="font-medium">Guardian Info</p>
            <p className="text-sm">Father: {app.guardian_info.father_name ?? "-"}</p>
            <p className="text-sm">Mother: {app.guardian_info.mother_name ?? "-"}</p>
            <p className="text-sm">Phone: {app.guardian_info.phone}</p>
            <p className="text-sm">Email: {app.guardian_info.email ?? "-"}</p>
            <p className="text-sm">Address: {app.guardian_info.address ?? "-"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 pt-6">
            <p className="font-medium">Previous Academic Record</p>
            <p className="text-sm">Institution: {app.previous_result?.institution ?? "-"}</p>
            <p className="text-sm">Class Passed: {app.previous_result?.class_passed ?? "-"}</p>
            <p className="text-sm">GPA: {app.previous_result?.gpa != null ? `${app.previous_result.gpa} (out of ${app.previous_result.gpa_scale ?? "5"})` : "-"}</p>
            <p className="text-sm">
              Total Marks:{" "}
              {app.previous_result?.marks_obtained != null
                ? `${app.previous_result.marks_obtained}${app.previous_result.marks_total_out_of ? ` / ${app.previous_result.marks_total_out_of}` : ""}`
                : (app.previous_result?.total_marks ?? "-")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 pt-6">
            <p className="font-medium">Personal Info</p>
            {Object.entries(app.personal_info ?? {}).map(([k, v]) => (
              <p key={k} className="text-sm"><span className="text-muted-foreground">{k}:</span> {String(v)}</p>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 pt-6">
            <p className="font-medium">Documents</p>
            {app.documents && Object.keys(app.documents).length ? (
              Object.entries(app.documents).map(([k, url]) => (
                <p key={k} className="text-sm"><a href={url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{k}</a></p>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No documents uploaded</p>
            )}
          </CardContent>
        </Card>
      </div>
    </PageWrapper>
  );
}
