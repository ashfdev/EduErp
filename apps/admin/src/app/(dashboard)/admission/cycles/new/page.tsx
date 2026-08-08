"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, Label, ErrorState, LoadingSpinner, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

interface Option {
  id: string;
  name_en?: string;
  label?: string;
}

export default function NewAdmissionCyclePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [classId, setClassId] = useState("");
  const [academicYearId, setAcademicYearId] = useState("");
  const [openDate, setOpenDate] = useState("");
  const [closeDate, setCloseDate] = useState("");
  const [seatCount, setSeatCount] = useState(50);
  const [appFee, setAppFee] = useState(500);
  const [formFee, setFormFee] = useState(0);

  const { data: classes, isLoading: classesLoading, isError: classesError, error: classesErrorObj, refetch: refetchClasses } = useQuery<Option[]>({ queryKey: ["settings", "classes"], queryFn: async () => (await api.get("/api/settings/classes")).data.data });
  const { data: years, isLoading: yearsLoading, isError: yearsError, error: yearsErrorObj, refetch: refetchYears } = useQuery<Option[]>({ queryKey: ["settings", "academic-years"], queryFn: async () => (await api.get("/api/settings/academic-years")).data.data });

  const isLoading = classesLoading || yearsLoading;
  const isError = classesError || yearsError;

  const createMutation = useMutation({
    mutationFn: () =>
      api.post("/api/admission/cycles", {
        name,
        class_id: classId,
        academic_year_id: academicYearId,
        open_date: openDate,
        close_date: closeDate,
        seat_count: seatCount,
        app_fee: appFee,
        form_fee: formFee,
      }),
    onSuccess: (res) => {
      toast.success("Admission cycle created");
      router.push(`/admission/cycles/${res.data.data.id}`);
    },
    onError: () => toast.error("Failed to create admission cycle"),
  });

  const canSubmit = name && classId && academicYearId && openDate && closeDate && seatCount > 0;

  return (
    <PageWrapper>
      <PageHeader title="New Admission Cycle" breadcrumbs={[{ label: "Admission", href: "/admission" }, { label: "New Cycle" }]} />
      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : isError ? (
        <ErrorState
          title="Failed to load classes or academic years"
          description={extractErrorMessage(classesErrorObj ?? yearsErrorObj)}
          retryLabel="Retry"
          onRetry={() => { refetchClasses(); refetchYears(); }}
        />
      ) : (
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-1.5">
            <Label>Cycle Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Class One Admission 2026" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Class</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="">Select...</option>
                {classes?.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Academic Year</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)}>
                <option value="">Select...</option>
                {years?.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-5 gap-4">
            <div className="space-y-1.5"><Label>Open Date</Label><Input type="date" value={openDate} onChange={(e) => setOpenDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Close Date</Label><Input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Seat Count</Label><Input type="number" value={seatCount} onChange={(e) => setSeatCount(Number(e.target.value))} /></div>
            <div className="space-y-1.5"><Label>Application Fee (৳)</Label><Input type="number" value={appFee} onChange={(e) => setAppFee(Number(e.target.value))} /></div>
            <div className="space-y-1.5"><Label>Form Fee (৳)</Label><Input type="number" value={formFee} onChange={(e) => setFormFee(Number(e.target.value))} /></div>
          </div>
          <Button disabled={!canSubmit || createMutation.isPending} onClick={() => createMutation.mutate()}>
            {createMutation.isPending ? "Creating..." : "Create Cycle"}
          </Button>
        </CardContent>
      </Card>
      )}
    </PageWrapper>
  );
}
