"use client";

import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Badge, EmptyState } from "@education-erp/ui";
import { api } from "@/lib/api";

interface Applicant {
  id: string;
  applicant_name: string;
  phone: string;
  email: string | null;
  cover_note: string | null;
  status: "SUBMITTED" | "SHORTLISTED" | "REJECTED" | "HIRED";
  created_at: string;
}
interface JobPosting {
  id: string;
  title: string;
}

const STATUS_VARIANT: Record<Applicant["status"], "outline" | "success" | "destructive" | "secondary"> = {
  SUBMITTED: "outline",
  SHORTLISTED: "secondary",
  HIRED: "success",
  REJECTED: "destructive",
};
const NEXT_STATUSES: Applicant["status"][] = ["SUBMITTED", "SHORTLISTED", "HIRED", "REJECTED"];

export default function JobApplicantsPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: jobs } = useQuery<JobPosting[]>({
    queryKey: ["hr", "jobs", "all"],
    queryFn: async () => (await api.get("/api/hr/jobs")).data.data,
  });
  const job = jobs?.find((j) => j.id === id);

  const { data: applicants } = useQuery<Applicant[]>({
    queryKey: ["hr", "jobs", id, "applications"],
    queryFn: async () => (await api.get(`/api/hr/jobs/${id}/applications`)).data.data,
  });

  const statusMutation = useMutation({
    mutationFn: ({ applicationId, status }: { applicationId: string; status: Applicant["status"] }) =>
      api.put(`/api/hr/jobs/applications/${applicationId}/status`, { status }),
    onSuccess: () => {
      toast.success("Status updated");
      queryClient.invalidateQueries({ queryKey: ["hr", "jobs", id, "applications"] });
    },
  });

  async function downloadCv(applicationId: string) {
    const res = await api.get(`/api/hr/jobs/applications/${applicationId}/cv-url`);
    window.open(res.data.data.url, "_blank");
  }

  return (
    <PageWrapper>
      <PageHeader
        title={job?.title ?? "Applicants"}
        subtitle="Review applications for this posting"
        breadcrumbs={[{ label: "HR" }, { label: "Job Postings", href: "/hr/jobs" }, { label: "Applicants" }]}
      />

      <Card>
        <CardContent className="pt-6">
          {!applicants?.length && <EmptyState title="No applications received yet" />}
          {!!applicants?.length && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-2">Name</th>
                  <th className="p-2">Contact</th>
                  <th className="p-2">Applied</th>
                  <th className="p-2">Status</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {applicants.map((a) => (
                  <tr key={a.id} className="border-b align-top">
                    <td className="p-2 font-medium">{a.applicant_name}</td>
                    <td className="p-2">
                      <p>{a.phone}</p>
                      {a.email && <p className="text-xs text-muted-foreground">{a.email}</p>}
                      {a.cover_note && <p className="mt-1 max-w-xs text-xs text-muted-foreground">{a.cover_note}</p>}
                    </td>
                    <td className="p-2">{new Date(a.created_at).toLocaleDateString()}</td>
                    <td className="p-2"><Badge variant={STATUS_VARIANT[a.status]}>{a.status}</Badge></td>
                    <td className="p-2 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => downloadCv(a.id)}>Download CV</Button>
                        <select
                          className="rounded-md border px-2 py-1 text-xs"
                          value={a.status}
                          onChange={(e) => statusMutation.mutate({ applicationId: a.id, status: e.target.value as Applicant["status"] })}
                        >
                          {NEXT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </PageWrapper>
  );
}
