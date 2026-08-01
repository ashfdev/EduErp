"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Label, Input, Switch, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Button } from "@education-erp/ui";
import { feeRulesSchema, type FeeRulesInput } from "@education-erp/validators";
import { api } from "@/lib/api";

export default function FeeRulesPage() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["settings", "fee-rules"],
    queryFn: async () => (await api.get("/api/settings/fee-rules")).data.data,
  });

  const { register, handleSubmit, reset, watch, setValue, formState: { isSubmitting } } = useForm<FeeRulesInput>({
    resolver: zodResolver(feeRulesSchema),
  });

  useEffect(() => {
    if (data) reset(data);
  }, [data, reset]);

  const saveMutation = useMutation({
    mutationFn: (body: FeeRulesInput) => api.put("/api/settings/fee-rules", body),
    onSuccess: () => {
      toast.success("Fee rules updated");
      queryClient.invalidateQueries({ queryKey: ["settings", "fee-rules"] });
    },
    onError: () => toast.error("Failed to update fee rules"),
  });

  const lateFeeEnabled = watch("late_fee_enabled");

  return (
    <PageWrapper>
      <PageHeader title="Fee Rules" subtitle="Late fees, restrictions, and payment options" breadcrumbs={[{ label: "Settings" }, { label: "Fee Rules" }]} />
      <form onSubmit={handleSubmit((body) => saveMutation.mutate(body))} className="max-w-2xl space-y-6">
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center justify-between">
              <Label>Late fee enabled</Label>
              <Switch checked={watch("late_fee_enabled")} onCheckedChange={(v) => setValue("late_fee_enabled", v)} />
            </div>
            {lateFeeEnabled && (
              <div className="grid grid-cols-2 gap-4 border-l-2 pl-4">
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={watch("late_fee_type")} onValueChange={(v) => setValue("late_fee_type", v as FeeRulesInput["late_fee_type"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FIXED">Fixed</SelectItem>
                      <SelectItem value="PERCENTAGE">Percentage</SelectItem>
                      <SelectItem value="DAILY">Daily</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Amount</Label>
                  <Input type="number" {...register("late_fee_amount", { valueAsNumber: true })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Daily Cap</Label>
                  <Input type="number" min={1} {...register("late_fee_daily_cap", { valueAsNumber: true })} />
                  <p className="text-xs text-muted-foreground">
                    Fines are capped at this amount per invoice. To disable late fees entirely, use the &quot;Late fee enabled&quot; toggle above.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Grace Period (days)</Label>
                  <Input type="number" {...register("grace_period_days", { valueAsNumber: true })} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="flex items-center justify-between">
              <Label>Block result card if dues pending</Label>
              <Switch checked={watch("block_result_on_due")} onCheckedChange={(v) => setValue("block_result_on_due", v)} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Block admit card if dues pending</Label>
              <Switch checked={watch("block_admit_on_due")} onCheckedChange={(v) => setValue("block_admit_on_due", v)} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Allow partial payment</Label>
              <Switch checked={watch("partial_payment_allowed")} onCheckedChange={(v) => setValue("partial_payment_allowed", v)} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Allow advance payment</Label>
              <Switch checked={watch("advance_payment_allowed")} onCheckedChange={(v) => setValue("advance_payment_allowed", v)} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Fine applies to exam fee</Label>
              <Switch checked={watch("fine_applies_to_exam_fee")} onCheckedChange={(v) => setValue("fine_applies_to_exam_fee", v)} />
            </div>
          </CardContent>
        </Card>

        <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save Changes"}</Button>
      </form>
    </PageWrapper>
  );
}
