"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper, PageHeader, Card, CardContent, CardHeader, CardTitle, Label, Input, Switch, Button, Badge,
  extractErrorMessage, ErrorState, LoadingSpinner,
} from "@education-erp/ui";
import type { SmsGatewayConfigInput } from "@education-erp/validators";
import { api } from "@/lib/api";

interface SmsGatewayStatus {
  provider: "SSL_WIRELESS" | "BULKSMSBD" | "OTHER";
  has_api_key: boolean;
  has_api_secret: boolean;
  sender_id: string | null;
  api_url: string | null;
  is_active: boolean;
  updated_at: string | null;
}

// Every provider's URL is editable now -- BulkSMSBD accounts can sit behind
// a reseller-specific domain, not always the bare bulksmsbd.net endpoint,
// so it needs to be overridable here too, not just for "Other". Leaving the
// field blank still uses each adapter's own hardcoded default (see
// bulksmsbd.provider.ts / sslwireless.provider.ts) -- this only ever
// overrides it, never requires filling it in.
const PROVIDER_META: Record<SmsGatewayStatus["provider"], { label: string; keyLabel: string; senderIdLabel: string; defaultUrl: string; showSecret: boolean }> = {
  SSL_WIRELESS: { label: "SSL Wireless (BD)", keyLabel: "API Token", senderIdLabel: "SID", defaultUrl: "https://sms.sslwireless.com/pushapi/dynamic/server.php", showSecret: false },
  BULKSMSBD: { label: "BulkSMSBD", keyLabel: "API Key", senderIdLabel: "Sender ID", defaultUrl: "https://bulksmsbd.net/api/smsapi", showSecret: false },
  OTHER: { label: "Other / Custom", keyLabel: "API Key", senderIdLabel: "Sender ID", defaultUrl: "", showSecret: true },
};

function GatewayCard({ status }: { status: SmsGatewayStatus }) {
  const queryClient = useQueryClient();
  const meta = PROVIDER_META[status.provider];
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [senderId, setSenderId] = useState(status.sender_id ?? "");
  const [apiUrl, setApiUrl] = useState(status.api_url ?? "");

  const saveMutation = useMutation({
    mutationFn: (body: SmsGatewayConfigInput) => api.put(`/api/settings/sms-gateways/${status.provider}`, body),
    onSuccess: (_res, variables) => {
      toast.success(`${meta.label} ${variables.is_active ? "activated" : "credentials updated"}`);
      setApiKey("");
      setApiSecret("");
      queryClient.invalidateQueries({ queryKey: ["settings", "sms-gateways"] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to update credentials"),
  });

  const handleSave = () => {
    saveMutation.mutate({
      api_key: apiKey || undefined,
      api_secret: apiSecret || undefined,
      sender_id: senderId || undefined,
      api_url: apiUrl || undefined,
    });
  };

  const handleActivate = (checked: boolean) => {
    // A bare activate/deactivate toggle needs no credential fields
    // re-submitted -- the backend's "blank means unchanged" rule already
    // leaves api_key/api_secret/sender_id/api_url untouched.
    saveMutation.mutate({ is_active: checked });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{meta.label}</CardTitle>
        <div className="flex items-center gap-2">
          {status.updated_at && <span className="text-xs text-muted-foreground">Last updated {new Date(status.updated_at).toLocaleString()}</span>}
          <Badge variant={status.is_active ? "success" : "outline"}>{status.is_active ? "Active" : "Inactive"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>{meta.keyLabel}</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={status.has_api_key ? "•••• saved — leave blank to keep" : "Not set"}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{meta.senderIdLabel}</Label>
            <Input value={senderId} onChange={(e) => setSenderId(e.target.value)} placeholder="e.g. your approved sender ID" />
          </div>
          {meta.showSecret && (
            <div className="space-y-1.5">
              <Label>API Secret (optional)</Label>
              <Input
                type="password"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                placeholder={status.has_api_secret ? "•••• saved — leave blank to keep" : "Not set — only if your provider needs a second credential"}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>API URL {meta.defaultUrl && <span className="font-normal text-muted-foreground">(optional)</span>}</Label>
            <Input
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder={meta.defaultUrl || "https://your-provider.example.com/send"}
            />
            {meta.defaultUrl && (
              <p className="text-xs text-muted-foreground">Leave blank to use {meta.label}&apos;s standard endpoint. Only override if your account uses a different domain (e.g. a reseller URL).</p>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between border-t pt-4">
          <div className="flex items-center gap-2">
            <Switch checked={status.is_active} onCheckedChange={handleActivate} disabled={saveMutation.isPending} />
            <Label>Use this gateway for outgoing SMS</Label>
          </div>
          <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving…" : "Save Credentials"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SmsGatewayPage() {
  const { data, isLoading, isError, error, refetch } = useQuery<SmsGatewayStatus[]>({
    queryKey: ["settings", "sms-gateways"],
    queryFn: async () => (await api.get("/api/settings/sms-gateways")).data.data,
  });

  return (
    <PageWrapper>
      <PageHeader
        title="SMS Gateway"
        subtitle="Enter your SMS provider's credentials once here and every SMS the site sends — OTPs, receipts, reminders, bulk SMS — goes through it automatically. Only one gateway can be active at a time. Falls back to the SMS_API_TOKEN/SMS_SID environment variables (SSL Wireless) if nothing here is active."
        breadcrumbs={[{ label: "Settings" }, { label: "SMS Gateway" }]}
      />
      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : isError ? (
        <ErrorState title="Failed to load SMS gateway settings" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      ) : (
        <div className="max-w-3xl space-y-6">
          {data?.map((status) => <GatewayCard key={status.provider} status={status} />)}
        </div>
      )}
    </PageWrapper>
  );
}
