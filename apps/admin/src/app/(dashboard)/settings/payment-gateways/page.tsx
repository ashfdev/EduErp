"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper, PageHeader, Card, CardContent, CardHeader, CardTitle, Label, Input, Switch, Button, Badge,
  extractErrorMessage,
} from "@education-erp/ui";
import type { PaymentGatewayConfigInput } from "@education-erp/validators";
import { api } from "@/lib/api";

interface GatewayStatus {
  provider: "BKASH" | "NAGAD" | "SSLCOMMERZ" | "ROCKET";
  has_app_key: boolean;
  has_app_secret: boolean;
  has_username: boolean;
  has_password: boolean;
  sandbox_mode: boolean;
  is_active: boolean;
  updated_at: string | null;
}

// The Prisma model's field names are generic (app_key/app_secret/username/
// password) since they're shared across four gateways with different real
// terminology -- this is purely a display-label mapping, not a schema split.
const PROVIDER_META: Record<GatewayStatus["provider"], { label: string; keyLabel: string; secretLabel: string; showUserPass: boolean }> = {
  BKASH: { label: "bKash", keyLabel: "App Key", secretLabel: "App Secret", showUserPass: true },
  NAGAD: { label: "Nagad", keyLabel: "Merchant ID", secretLabel: "Merchant Private Key", showUserPass: false },
  SSLCOMMERZ: { label: "SSLCommerz", keyLabel: "Store ID", secretLabel: "Store Password", showUserPass: false },
  ROCKET: { label: "Rocket (DBBL)", keyLabel: "Merchant ID", secretLabel: "Merchant Key", showUserPass: false },
};

function GatewayCard({ status }: { status: GatewayStatus }) {
  const queryClient = useQueryClient();
  const meta = PROVIDER_META[status.provider];
  const [appKey, setAppKey] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [sandboxMode, setSandboxMode] = useState(status.sandbox_mode);
  const [isActive, setIsActive] = useState(status.is_active);

  const saveMutation = useMutation({
    mutationFn: (body: PaymentGatewayConfigInput) => api.put(`/api/settings/payment-gateways/${status.provider}`, body),
    onSuccess: () => {
      toast.success(`${meta.label} credentials updated`);
      setAppKey("");
      setAppSecret("");
      setUsername("");
      setPassword("");
      queryClient.invalidateQueries({ queryKey: ["settings", "payment-gateways"] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to update credentials"),
  });

  const handleSave = () => {
    saveMutation.mutate({
      app_key: appKey || undefined,
      app_secret: appSecret || undefined,
      username: username || undefined,
      password: password || undefined,
      sandbox_mode: sandboxMode,
      is_active: isActive,
    });
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
              value={appKey}
              onChange={(e) => setAppKey(e.target.value)}
              placeholder={status.has_app_key ? "•••• saved — leave blank to keep" : "Not set"}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{meta.secretLabel}</Label>
            <Input
              type="password"
              value={appSecret}
              onChange={(e) => setAppSecret(e.target.value)}
              placeholder={status.has_app_secret ? "•••• saved — leave blank to keep" : "Not set"}
            />
          </div>
          {meta.showUserPass && (
            <>
              <div className="space-y-1.5">
                <Label>Username</Label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={status.has_username ? "•••• saved — leave blank to keep" : "Not set"}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={status.has_password ? "•••• saved — leave blank to keep" : "Not set"}
                />
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Switch checked={sandboxMode} onCheckedChange={setSandboxMode} />
            <Label>Sandbox mode</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            <Label>Active</Label>
          </div>
        </div>
        <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "Saving..." : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function PaymentGatewaysPage() {
  const { data } = useQuery<GatewayStatus[]>({
    queryKey: ["settings", "payment-gateways"],
    queryFn: async () => (await api.get("/api/settings/payment-gateways")).data.data,
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Payment Gateways"
        subtitle="Enter merchant credentials for each gateway. Real bKash/Nagad/SSLCommerz/Rocket integration is still pending — these credentials activate automatically once each gateway's live integration is wired up."
        breadcrumbs={[{ label: "Settings" }, { label: "Payment Gateways" }]}
      />
      <div className="max-w-3xl space-y-6">
        {data?.map((status) => <GatewayCard key={status.provider} status={status} />)}
      </div>
    </PageWrapper>
  );
}
