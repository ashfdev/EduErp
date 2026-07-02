import Link from "next/link";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-64 shrink-0 border-r bg-card">
        <div className="flex h-[60px] items-center border-b px-4 font-semibold">Education ERP</div>
        <nav className="flex flex-col gap-1 p-3 text-sm">
          <Link href="/dashboard" className="rounded-md px-3 py-2 hover:bg-accent">
            Dashboard
          </Link>
          <Link href="/settings/institution" className="rounded-md px-3 py-2 hover:bg-accent">
            Settings
          </Link>
        </nav>
      </aside>
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex h-[60px] items-center justify-end border-b px-6" />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
