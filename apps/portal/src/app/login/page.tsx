"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { Button, Input, Label } from "@education-erp/ui";

export default function PortalLoginPage() {
  const router = useRouter();
  const { setSession } = useAuthStore();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.post("/api/auth/login", { identifier, password, portal: "portal" });
      setSession(res.data.data);
      router.replace("/");
    } catch {
      setError("Invalid Student ID / phone or password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-lg border bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold" style={{ color: "var(--primary, #1a3c4a)" }}>Student Portal</h1>
        <p className="mb-6 text-sm text-gray-500">Sign in with your Student ID or guardian phone number.</p>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Student ID / Phone</Label>
            <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="STU-26-0001 or 01XXXXXXXXX" required />
          </div>
          <div className="space-y-1.5">
            <Label>Password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>{loading ? "Signing in..." : "Sign In"}</Button>
        </form>
      </div>
    </main>
  );
}
