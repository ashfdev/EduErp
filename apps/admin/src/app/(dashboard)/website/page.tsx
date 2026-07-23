"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageWrapper, PageHeader, Card, CardContent, Button, StatusBadge, EmptyState, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@education-erp/ui";
import { api } from "@/lib/api";

const SECTIONS = [
  { href: "/website/notices", label: "Notices", icon: "📢" },
  { href: "/website/sliders", label: "Sliders", icon: "🖼️" },
  { href: "/website/gallery", label: "Gallery", icon: "🖼️" },
  { href: "/website/downloads", label: "Downloads", icon: "📥" },
  { href: "/website/governing-body", label: "Governing Body", icon: "👥" },
  { href: "/website/events", label: "Events", icon: "📅" },
  { href: "/website/pages", label: "Static Pages", icon: "📄" },
  { href: "/website/important-links", label: "Important Links", icon: "🔗" },
];

interface ContactSubmission {
  id: string;
  name: string;
  subject: string | null;
  message: string;
  is_read: boolean;
  created_at: string;
}

export default function WebsiteDashboardPage() {
  const { data: submissions } = useQuery<ContactSubmission[]>({
    queryKey: ["website", "contact", "submissions"],
    queryFn: async () => (await api.get("/api/website/contact/submissions")).data.data,
  });

  const websiteUrl = process.env.NEXT_PUBLIC_WEBSITE_URL ?? "http://localhost:3002";

  return (
    <PageWrapper>
      <PageHeader
        title="Website Maintenance"
        subtitle="Manage all public website content"
        breadcrumbs={[{ label: "Website" }]}
        action={<a href={websiteUrl} target="_blank" rel="noreferrer"><Button variant="outline">👁️ Preview Website</Button></a>}
      />

      <div className="grid grid-cols-4 gap-4">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="transition hover:shadow-md">
              <CardContent className="pt-6 text-center">
                <p className="text-2xl">{s.icon}</p>
                <p className="mt-2 font-medium">{s.label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold">Contact Form Submissions</h2>
        {!submissions?.length && <EmptyState title="No submissions yet" />}
        {!!submissions?.length && (
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Name</TableHead><TableHead>Subject</TableHead><TableHead>Message</TableHead><TableHead>Status</TableHead><TableHead>Received</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {submissions.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.name}</TableCell>
                      <TableCell>{s.subject ?? "-"}</TableCell>
                      <TableCell className="max-w-xs truncate">{s.message}</TableCell>
                      <TableCell><StatusBadge status={s.is_read ? "READ" : "UNREAD"} /></TableCell>
                      <TableCell>{new Date(s.created_at).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </PageWrapper>
  );
}
