"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Tabs, TabsList, TabsTrigger, TabsContent, Badge } from "@education-erp/ui";
import { api } from "@/lib/api";

interface ChartPreviewRow {
  row: number;
  data: {
    code: string;
    name: string;
    name_bn?: string;
    account_group: string;
    account_group_id?: string;
    account_nature: string;
    opening_balance?: string;
    opening_balance_type?: string;
    is_bank_account?: string;
    is_cash_account?: string;
  };
  valid: boolean;
  errors: string[];
}

interface VoucherGroupPreview {
  row_group_id: string;
  date: string;
  narration: string;
  lines: { debit_account_code?: string; credit_account_code?: string; amount?: string; narration?: string }[];
  total_amount: number;
  valid: boolean;
  errors: string[];
}

async function download(url: string, filename: string, params?: Record<string, string>) {
  const res = await api.get(url, { params, responseType: "blob" });
  const objUrl = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = objUrl;
  a.download = filename;
  a.click();
}

function ChartImportExport() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ total: number; valid: number; preview: ChartPreviewRow[] } | null>(null);
  const [result, setResult] = useState<{ created: number; failed: { row: number; reason: string }[] } | null>(null);

  const previewMutation = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append("file", file!);
      return api.post("/api/accounts/chart/bulk-import", form, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: (res) => {
      setPreview(res.data.data);
      setResult(null);
    },
    onError: (err: unknown) => toast.error((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "Preview failed"),
  });

  const confirmMutation = useMutation({
    mutationFn: () => {
      const rows = (preview?.preview ?? [])
        .filter((p) => p.valid)
        .map((p) => ({
          code: p.data.code,
          name: p.data.name,
          name_bn: p.data.name_bn || undefined,
          account_group_id: p.data.account_group_id,
          account_nature: p.data.account_nature,
          opening_balance: p.data.opening_balance || 0,
          opening_balance_type: p.data.opening_balance_type || "DEBIT",
          is_bank_account: p.data.is_bank_account,
          is_cash_account: p.data.is_cash_account,
        }));
      return api.post("/api/accounts/chart/bulk-import/confirm", { rows });
    },
    onSuccess: (res) => {
      setResult(res.data.data);
      toast.success(`Imported ${res.data.data.created} accounts`);
    },
    onError: (err: unknown) => toast.error((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "Import failed"),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-6">
          <p className="font-medium">Export</p>
          <p className="text-sm text-muted-foreground">Download the current chart of accounts as an Excel file.</p>
          <Button variant="outline" onClick={() => download("/api/accounts/chart/export", "Chart_of_Accounts.xlsx")}>Export Chart of Accounts</Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <p className="font-medium">Import</p>
          <p className="text-sm text-muted-foreground">
            CSV columns: <code className="rounded bg-muted px-1">code, name, name_bn, account_group, account_nature, opening_balance, opening_balance_type, is_bank_account, is_cash_account</code>.
            {" "}<code className="rounded bg-muted px-1">account_group</code> must match an existing group name exactly (e.g. "Assets"); <code className="rounded bg-muted px-1">account_nature</code> must be DEBIT_NORMAL or CREDIT_NORMAL.
          </p>
          <div className="flex items-center gap-3">
            <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
            <Button size="sm" disabled={!file || previewMutation.isPending} onClick={() => previewMutation.mutate()}>
              {previewMutation.isPending ? "Reading..." : "Preview"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="flex items-center justify-between">
              <p className="font-medium">Preview — {preview.valid} of {preview.total} rows valid</p>
              <Button size="sm" disabled={!preview.valid || confirmMutation.isPending} onClick={() => confirmMutation.mutate()}>
                {confirmMutation.isPending ? "Importing..." : `Confirm Import (${preview.valid})`}
              </Button>
            </div>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <th className="p-2">Row</th><th className="p-2">Code</th><th className="p-2">Name</th><th className="p-2">Group</th><th className="p-2">Nature</th><th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.map((p) => (
                    <tr key={p.row} className="border-b last:border-0">
                      <td className="p-2">{p.row}</td>
                      <td className="p-2 font-mono">{p.data.code}</td>
                      <td className="p-2">{p.data.name}</td>
                      <td className="p-2">{p.data.account_group}</td>
                      <td className="p-2">{p.data.account_nature}</td>
                      <td className="p-2">
                        {p.valid ? <Badge variant="success">Valid</Badge> : <Badge variant="destructive" title={p.errors.join("; ")}>{p.errors.join("; ")}</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardContent className="space-y-2 pt-6">
            <p className="font-medium">Import Result</p>
            <p className="text-sm">Created: {result.created}</p>
            {!!result.failed.length && (
              <div className="text-sm text-destructive">
                Failed: {result.failed.length}
                <ul className="list-inside list-disc">
                  {result.failed.map((f, i) => <li key={i}>Row {f.row}: {f.reason}</li>)}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function VoucherImportExport() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ total: number; valid: number; ungrouped_rows: number; preview: VoucherGroupPreview[] } | null>(null);
  const [result, setResult] = useState<{ created: number; failed: { row_group_id: string; reason: string }[] } | null>(null);

  const previewMutation = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append("file", file!);
      return api.post("/api/accounts/vouchers/bulk-import", form, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: (res) => {
      setPreview(res.data.data);
      setResult(null);
    },
    onError: (err: unknown) => toast.error((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "Preview failed"),
  });

  const confirmMutation = useMutation({
    mutationFn: () => {
      const groups = (preview?.preview ?? [])
        .filter((g) => g.valid)
        .map((g) => ({
          row_group_id: g.row_group_id,
          date: g.date,
          narration: g.narration,
          lines: g.lines.map((l) => ({
            debit_account_code: l.debit_account_code || undefined,
            credit_account_code: l.credit_account_code || undefined,
            amount: l.amount,
            narration: l.narration || undefined,
          })),
        }));
      return api.post("/api/accounts/vouchers/bulk-import/confirm", { groups });
    },
    onSuccess: (res) => {
      setResult(res.data.data);
      toast.success(`Imported ${res.data.data.created} vouchers`);
    },
    onError: (err: unknown) => toast.error((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "Import failed"),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-6">
          <p className="font-medium">Export</p>
          <p className="text-sm text-muted-foreground">Download posted vouchers as an Excel file (one row per journal-entry line).</p>
          <div className="flex items-end gap-3">
            <div><label className="text-sm">From</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="block rounded-md border px-3 py-2 text-sm" /></div>
            <div><label className="text-sm">To</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="block rounded-md border px-3 py-2 text-sm" /></div>
            <Button variant="outline" onClick={() => download("/api/accounts/vouchers/export", "Vouchers.xlsx", { from: from || undefined, to: to || undefined } as never)}>
              Export Vouchers
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <p className="font-medium">Import</p>
          <p className="text-sm text-muted-foreground">
            "Wide" CSV — one row per journal-entry line, grouped into a voucher by a shared <code className="rounded bg-muted px-1">row_group_id</code>. Columns:{" "}
            <code className="rounded bg-muted px-1">row_group_id, date, narration, debit_account_code, credit_account_code, amount</code>.
            Each row must have exactly one of debit/credit account code, and each group's debits must equal its credits.
          </p>
          <div className="flex items-center gap-3">
            <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
            <Button size="sm" disabled={!file || previewMutation.isPending} onClick={() => previewMutation.mutate()}>
              {previewMutation.isPending ? "Reading..." : "Preview"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="flex items-center justify-between">
              <p className="font-medium">
                Preview — {preview.valid} of {preview.total} voucher groups valid
                {preview.ungrouped_rows > 0 && <span className="ml-2 text-destructive">({preview.ungrouped_rows} rows missing row_group_id, ignored)</span>}
              </p>
              <Button size="sm" disabled={!preview.valid || confirmMutation.isPending} onClick={() => confirmMutation.mutate()}>
                {confirmMutation.isPending ? "Importing..." : `Confirm Import (${preview.valid})`}
              </Button>
            </div>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <th className="p-2">Group</th><th className="p-2">Date</th><th className="p-2">Narration</th><th className="p-2">Lines</th><th className="p-2">Amount</th><th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.map((g) => (
                    <tr key={g.row_group_id} className="border-b last:border-0">
                      <td className="p-2 font-mono">{g.row_group_id}</td>
                      <td className="p-2">{g.date}</td>
                      <td className="p-2">{g.narration}</td>
                      <td className="p-2">{g.lines.length}</td>
                      <td className="p-2">৳{g.total_amount.toLocaleString()}</td>
                      <td className="p-2">
                        {g.valid ? <Badge variant="success">Valid</Badge> : <Badge variant="destructive" title={g.errors.join("; ")}>{g.errors.length} error(s)</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.preview.some((g) => !g.valid) && (
              <div className="text-sm text-destructive">
                <ul className="list-inside list-disc">
                  {preview.preview.filter((g) => !g.valid).flatMap((g) => g.errors.map((e, i) => <li key={`${g.row_group_id}-${i}`}>{g.row_group_id}: {e}</li>))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardContent className="space-y-2 pt-6">
            <p className="font-medium">Import Result</p>
            <p className="text-sm">Created: {result.created}</p>
            {!!result.failed.length && (
              <div className="text-sm text-destructive">
                Failed: {result.failed.length}
                <ul className="list-inside list-disc">
                  {result.failed.map((f, i) => <li key={i}>{f.row_group_id}: {f.reason}</li>)}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function AccountsImportExportPage() {
  return (
    <PageWrapper>
      <PageHeader title="Import / Export" breadcrumbs={[{ label: "Accounts", href: "/accounts" }, { label: "Import / Export" }]} />
      <Tabs defaultValue="chart">
        <TabsList>
          <TabsTrigger value="chart">Chart of Accounts</TabsTrigger>
          <TabsTrigger value="vouchers">Vouchers</TabsTrigger>
        </TabsList>
        <TabsContent value="chart"><ChartImportExport /></TabsContent>
        <TabsContent value="vouchers"><VoucherImportExport /></TabsContent>
      </Tabs>
    </PageWrapper>
  );
}
