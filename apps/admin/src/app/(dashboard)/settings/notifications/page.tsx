"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Switch, Textarea, Label, Input } from "@education-erp/ui";
import { api } from "@/lib/api";

interface NotificationConfig {
  id: string;
  trigger: string;
  channel: string;
  is_enabled: boolean;
  template_bn: string;
  template_en: string;
}

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const { data } = useQuery<NotificationConfig[]>({
    queryKey: ["settings", "notifications"],
    queryFn: async () => (await api.get("/api/settings/notifications")).data.data,
  });

  const [expanded, setExpanded] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { template_bn: string; template_en: string }>>({});
  const [testPhone, setTestPhone] = useState("");

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<NotificationConfig> }) => api.put(`/api/settings/notifications/${id}`, body),
    onSuccess: () => {
      toast.success("Saved");
      queryClient.invalidateQueries({ queryKey: ["settings", "notifications"] });
    },
  });

  const testMutation = useMutation({
    mutationFn: () => api.post("/api/settings/notifications/test", { phone: testPhone, message: "Test notification from Education ERP." }),
    onSuccess: () => toast.success("Test SMS queued (check server logs if SMS gateway isn't configured)"),
  });

  const grouped = new Map<string, NotificationConfig[]>();
  for (const n of data ?? []) {
    if (!grouped.has(n.trigger)) grouped.set(n.trigger, []);
    grouped.get(n.trigger)!.push(n);
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Notifications"
        subtitle="SMS/Email/Push templates per trigger event"
        breadcrumbs={[{ label: "Settings" }, { label: "Notifications" }]}
        action={
          <div className="flex gap-2">
            <Input placeholder="01XXXXXXXXX" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} className="w-40" />
            <Button size="sm" onClick={() => testMutation.mutate()} disabled={!testPhone}>Send Test</Button>
          </div>
        }
      />

      <div className="space-y-2">
        {[...grouped.entries()].map(([trigger, configs]) => (
          <Card key={trigger}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <button className="text-left font-medium" onClick={() => setExpanded(expanded === trigger ? null : trigger)}>
                  {trigger.replace(/_/g, " ")}
                </button>
                <div className="flex gap-4">
                  {configs.map((c) => (
                    <div key={c.id} className="flex items-center gap-1.5">
                      <Label className="text-xs">{c.channel}</Label>
                      <Switch checked={c.is_enabled} onCheckedChange={(v) => updateMutation.mutate({ id: c.id, body: { is_enabled: v, template_bn: c.template_bn, template_en: c.template_en } })} />
                    </div>
                  ))}
                </div>
              </div>

              {expanded === trigger && (
                <div className="mt-4 space-y-4 border-t pt-4">
                  {configs.map((c) => (
                    <div key={c.id} className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">{c.channel}</p>
                      <div className="space-y-1.5">
                        <Label>Bangla template</Label>
                        <Textarea
                          defaultValue={c.template_bn}
                          onChange={(e) => setDrafts((prev) => ({ ...prev, [c.id]: { template_bn: e.target.value, template_en: drafts[c.id]?.template_en ?? c.template_en } }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>English template</Label>
                        <Textarea
                          defaultValue={c.template_en}
                          onChange={(e) => setDrafts((prev) => ({ ...prev, [c.id]: { template_en: e.target.value, template_bn: drafts[c.id]?.template_bn ?? c.template_bn } }))}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">Variables: {"{{student_name}}"} {"{{date}}"} {"{{class}}"}</p>
                      <Button
                        size="sm"
                        onClick={() =>
                          updateMutation.mutate({
                            id: c.id,
                            body: { is_enabled: c.is_enabled, template_bn: drafts[c.id]?.template_bn ?? c.template_bn, template_en: drafts[c.id]?.template_en ?? c.template_en },
                          })
                        }
                      >
                        Save Template
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </PageWrapper>
  );
}
