"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { DocumentType } from "@education-erp/types";
import { cardDesignSchema, type CardDesign } from "@education-erp/validators";
import { PageWrapper, ErrorState, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";
import { CardDesigner } from "@/components/card-designer/CardDesigner";

// Doc types without an explicit designable size default to A4 (certificates,
// testimonials, and the admission registration card are all paper-sized, not card-sized).
const DEFAULT_SIZE_BY_DOC_TYPE: Partial<Record<DocumentType, { preset: string; width_mm: number; height_mm: number }>> = {
  STUDENT_ID_CARD: { preset: "ID_CARD", width_mm: 85.6, height_mm: 54 },
  STAFF_ID_CARD: { preset: "ID_CARD", width_mm: 85.6, height_mm: 54 },
  TRANSPORT_CARD: { preset: "ID_CARD", width_mm: 85.6, height_mm: 54 },
  HOSTEL_CARD: { preset: "ID_CARD", width_mm: 85.6, height_mm: 54 },
  REGISTRATION_CARD: { preset: "A4", width_mm: 210, height_mm: 297 },
  CERTIFICATE: { preset: "A4", width_mm: 210, height_mm: 297 },
  TESTIMONIAL: { preset: "A4", width_mm: 210, height_mm: 297 },
};

interface TemplateDetail {
  id: string;
  name: string;
  layout_json: unknown;
}

export default function CardDesignerPage() {
  const params = useParams<{ docType: string; templateId?: string[] }>();
  const docType = params.docType as DocumentType;
  const templateId = params.templateId?.[0] ?? null;

  const { data: template, isLoading, isError, error, refetch } = useQuery<TemplateDetail | null>({
    queryKey: ["settings", "templates", "detail", templateId],
    queryFn: async () => (await api.get(`/api/settings/templates/${templateId}`)).data.data,
    enabled: !!templateId,
  });

  if (templateId && isLoading) return <PageWrapper><p className="text-sm text-muted-foreground">Loading...</p></PageWrapper>;

  if (templateId && isError) {
    return (
      <PageWrapper>
        <ErrorState title="Failed to load template" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      </PageWrapper>
    );
  }

  const defaults = DEFAULT_SIZE_BY_DOC_TYPE[docType] ?? { preset: "ID_CARD", width_mm: 85.6, height_mm: 54 };

  let initialDesign: CardDesign | null = null;
  if (template?.layout_json) {
    const parsed = cardDesignSchema.safeParse(template.layout_json);
    if (parsed.success) initialDesign = parsed.data;
  }

  return (
    <CardDesigner
      docType={docType}
      templateId={templateId}
      initialName={template?.name ?? `${docType.replace(/_/g, " ")} Design`}
      initialDesign={initialDesign}
      defaultSizePreset={defaults.preset}
      defaultWidthMm={defaults.width_mm}
      defaultHeightMm={defaults.height_mm}
    />
  );
}
