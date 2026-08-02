"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Label, Input, Textarea, Button } from "@education-erp/ui";
import { admissionPaymentInstructionsSchema, type AdmissionPaymentInstructionsInput } from "@education-erp/validators";
import { api } from "@/lib/api";

export default function AdmissionPaymentInstructionsPage() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["settings", "admission-payment-instructions"],
    queryFn: async () => (await api.get("/api/settings/admission-payment-instructions")).data.data,
  });

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<AdmissionPaymentInstructionsInput>({
    resolver: zodResolver(admissionPaymentInstructionsSchema),
  });

  useEffect(() => {
    if (data) reset(data);
  }, [data, reset]);

  const saveMutation = useMutation({
    mutationFn: (body: AdmissionPaymentInstructionsInput) => api.put("/api/settings/admission-payment-instructions", body),
    onSuccess: () => {
      toast.success("Payment instructions updated");
      queryClient.invalidateQueries({ queryKey: ["settings", "admission-payment-instructions"] });
    },
    onError: () => toast.error("Failed to update payment instructions"),
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Admission Payment Instructions"
        subtitle="Shown to applicants on the public payment page — where to manually send bKash/Nagad/Rocket money or bank transfer"
        breadcrumbs={[{ label: "Settings" }, { label: "Admission Payment Instructions" }]}
      />
      <form onSubmit={handleSubmit((body) => saveMutation.mutate(body))} className="max-w-2xl space-y-6">
        <Card>
          <CardContent className="space-y-4 pt-6">
            <p className="text-sm font-medium">Mobile Wallet (Send Money) Numbers</p>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>bKash Number</Label>
                <Input placeholder="e.g. 01712345678" {...register("bkash_number")} />
              </div>
              <div className="space-y-1.5">
                <Label>Nagad Number</Label>
                <Input placeholder="e.g. 01712345678" {...register("nagad_number")} />
              </div>
              <div className="space-y-1.5">
                <Label>Rocket Number</Label>
                <Input placeholder="e.g. 01712345678" {...register("rocket_number")} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 pt-6">
            <p className="text-sm font-medium">Bank Transfer Details</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Bank Name</Label>
                <Input placeholder="e.g. Dutch-Bangla Bank" {...register("bank_name")} />
              </div>
              <div className="space-y-1.5">
                <Label>Account Name</Label>
                <Input placeholder="e.g. Green View School" {...register("bank_account_name")} />
              </div>
              <div className="space-y-1.5">
                <Label>Account Number</Label>
                <Input placeholder="e.g. 1234567890" {...register("bank_account_number")} />
              </div>
              <div className="space-y-1.5">
                <Label>Routing Number</Label>
                <Input placeholder="e.g. 090261234" {...register("bank_routing_number")} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-1.5 pt-6">
            <Label>Additional Note (optional)</Label>
            <Textarea rows={3} placeholder="e.g. Please keep the payment receipt/screenshot for your records." {...register("note")} />
          </CardContent>
        </Card>

        <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save Changes"}</Button>
      </form>
    </PageWrapper>
  );
}
