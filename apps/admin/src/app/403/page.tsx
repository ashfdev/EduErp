import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3">
      <h1 className="text-2xl font-semibold">403 — Forbidden</h1>
      <p className="text-muted-foreground">You do not have permission to view this page.</p>
      <Link href="/dashboard" className="text-primary hover:underline">
        Back to dashboard
      </Link>
    </div>
  );
}
