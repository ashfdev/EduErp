"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper,
  PageHeader,
  Card,
  CardContent,
  Button,
  Badge,
  Input,
  Label,
  Switch,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  EmptyState,
  ErrorState,
  LoadingSpinner,
  extractErrorMessage,
} from "@education-erp/ui";
import { api } from "@/lib/api";

const AUTHORITY_ROLES = [
  "PRINCIPAL", "VICE_PRINCIPAL", "HEADMASTER", "VICE_CHANCELLOR", "PRO_VICE_CHANCELLOR",
  "EXAM_CONTROLLER", "REGISTRAR", "PROCTOR", "DEAN", "HOD", "LIBRARIAN", "ACCOUNTANT", "CLASS_TEACHER",
];

interface AuthoritySignature {
  id: string;
  role: string;
  display_name: string;
  designation: string;
  signature_url?: string | null;
  seal_url?: string | null;
  is_active: boolean;
}

export default function SignaturesPage() {
  const queryClient = useQueryClient();
  const { data: signatures, isLoading, isError, error, refetch } = useQuery<AuthoritySignature[]>({
    queryKey: ["settings", "signatures"],
    queryFn: async () => (await api.get("/api/settings/signatures")).data.data,
  });

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [role, setRole] = useState("PRINCIPAL");
  const [displayName, setDisplayName] = useState("");
  const [designation, setDesignation] = useState("");
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [sealFile, setSealFile] = useState<File | null>(null);

  function openCreate() {
    setEditingId(null);
    setRole("PRINCIPAL");
    setDisplayName("");
    setDesignation("");
    setSignatureFile(null);
    setSealFile(null);
    setOpen(true);
  }
  function openEdit(s: AuthoritySignature) {
    setEditingId(s.id);
    setRole(s.role);
    setDisplayName(s.display_name);
    setDesignation(s.designation);
    setSignatureFile(null);
    setSealFile(null);
    setOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append("role", role);
      form.append("display_name", displayName);
      form.append("designation", designation);
      if (signatureFile) form.append("signature", signatureFile);
      if (sealFile) form.append("seal", sealFile);
      return editingId
        ? api.put(`/api/settings/signatures/${editingId}`, form, { headers: { "Content-Type": "multipart/form-data" } })
        : api.post("/api/settings/signatures", form, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => {
      toast.success(editingId ? "Signature updated" : "Signature added");
      queryClient.invalidateQueries({ queryKey: ["settings", "signatures"] });
      setOpen(false);
      setDisplayName("");
      setDesignation("");
      setSignatureFile(null);
      setSealFile(null);
    },
    onError: () => toast.error(editingId ? "Failed to update signature" : "Failed to add signature"),
  });

  const toggleMutation = useMutation({
    mutationFn: (sig: AuthoritySignature) => api.put(`/api/settings/signatures/${sig.id}/activate`, { is_active: !sig.is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings", "signatures"] }),
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to update signature status"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/settings/signatures/${id}`),
    onSuccess: () => {
      toast.success("Signature deleted");
      queryClient.invalidateQueries({ queryKey: ["settings", "signatures"] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to delete signature"),
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Authority Signatures"
        subtitle="Signature images used on generated documents"
        breadcrumbs={[{ label: "Settings" }, { label: "Signatures" }]}
        action={<Button onClick={openCreate}>+ Add Signature</Button>}
      />

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : isError ? (
        <ErrorState title="Failed to load signatures" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      ) : (
        <>
          {!signatures?.length && <EmptyState title="No signatures yet" />}

          <div className="grid grid-cols-3 gap-4">
            {signatures?.map((s) => (
              <Card key={s.id}>
                <CardContent className="space-y-2 pt-6">
                  <div className="flex h-20 items-center justify-center rounded border bg-muted">
                    {s.signature_url ? <img src={s.signature_url} alt="Signature" className="max-h-16" /> : <span className="text-xs text-muted-foreground">No signature</span>}
                  </div>
                  <p className="font-medium">{s.display_name}</p>
                  <p className="text-sm text-muted-foreground">{s.designation}</p>
                  <Badge variant="outline">{s.role}</Badge>
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2">
                      <Switch checked={s.is_active} onCheckedChange={() => toggleMutation.mutate(s)} />
                      <Label className="text-xs">Active</Label>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => openEdit(s)}>Edit</Button>
                      <Button size="sm" variant="destructive" onClick={() => deleteMutation.mutate(s.id)}>Delete</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? "Edit Signature" : "Add Signature"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Role</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={role} onChange={(e) => setRole(e.target.value)}>
                {AUTHORITY_ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><Label>Display Name</Label><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Dr. Mohammad Ali" /></div>
            <div className="space-y-1.5"><Label>Designation</Label><Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="Principal & Head" /></div>
            <div className="space-y-1.5"><Label>Signature Image{editingId ? " (leave blank to keep current)" : ""}</Label><Input type="file" accept="image/*" onChange={(e) => setSignatureFile(e.target.files?.[0] ?? null)} /></div>
            <div className="space-y-1.5"><Label>Seal Image{editingId ? " (leave blank to keep current)" : ""}</Label><Input type="file" accept="image/*" onChange={(e) => setSealFile(e.target.files?.[0] ?? null)} /></div>
          </div>
          <DialogFooter>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !displayName}>
              {saveMutation.isPending ? "Saving..." : editingId ? "Save Changes" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
