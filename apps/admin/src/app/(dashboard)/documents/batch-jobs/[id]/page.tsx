"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { FileDown, Clock } from "lucide-react";
import { PageWrapper, PageHeader, Card, CardContent, Button, LoadingSpinner, ErrorState, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

interface DownloadReady {
  url: string;
  filename: string | null;
}
interface StillProcessing {
  stillProcessing: true;
}

// Plan Twenty (via Plan Twenty-Six, Phase C5) -- where a "Your document is
// ready" in-app notification's link points. A large batch-PDF request
// (e.g. all ID cards for a big class) is generated in the background
// instead of blocking the request past Puppeteer's own timeout; this page
// polls the batch job's status and surfaces the download once it's real,
// or a clear failure reason if the render itself failed.
export default function DocumentBatchJobDownloadPage() {
  const params = useParams<{ id: string }>();
  const jobId = params.id;

  const { data, isLoading, isError, error, refetch } = useQuery<DownloadReady | StillProcessing>({
    queryKey: ["document-batch-job", jobId],
    queryFn: async () => {
      try {
        const res = await api.get(`/api/documents/batch-jobs/${jobId}/download`);
        return res.data.data as DownloadReady;
      } catch (err) {
        const status = (err as { response?: { status?: number } }).response?.status;
        if (status === 409) return { stillProcessing: true };
        throw err;
      }
    },
    refetchInterval: (query) => (query.state.data && "stillProcessing" in query.state.data ? 5000 : false),
  });

  const ready = data && "url" in data ? data : null;

  return (
    <PageWrapper>
      <PageHeader
        title="Document Download"
        subtitle="A large batch document you requested"
        breadcrumbs={[{ label: "Documents", href: "/documents/print" }, { label: "Download" }]}
      />
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          {isLoading ? (
            <LoadingSpinner />
          ) : isError ? (
            <ErrorState title="Couldn't load this document" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
          ) : ready ? (
            <>
              <FileDown className="h-10 w-10 text-primary" />
              <p className="text-sm text-muted-foreground">Your document has finished generating and is ready to download.</p>
              <Button asChild size="lg">
                <a href={ready.url} target="_blank" rel="noreferrer">
                  Download {ready.filename ?? "PDF"}
                </a>
              </Button>
            </>
          ) : (
            <>
              <Clock className="h-10 w-10 animate-pulse text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Still generating — this page will update automatically once it&apos;s ready.</p>
            </>
          )}
        </CardContent>
      </Card>
    </PageWrapper>
  );
}
