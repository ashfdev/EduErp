"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, Label, Tabs, TabsList, TabsTrigger, TabsContent, ErrorState, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";
import { RichTextEditor } from "@/components/rich-text-editor";
import { Save, Globe, Eye } from "lucide-react";

interface StaticPageData {
  page_key: string;
  title_en: string | null;
  title_bn: string | null;
  content_en: string | null;
  content_bn: string | null;
  meta_title: string | null;
  meta_desc: string | null;
}

const PAGE_LABELS: Record<string, string> = {
  about: "About Us",
  history: "History",
  mission_vision: "Mission & Vision",
  facilities: "Facilities",
  achievements: "Achievements",
  admission_info: "Admission Info",
  principal_message: "Principal's Message",
  vice_principal_message: "Vice Principal's Message",
  chairman_message: "Chairman's Message",
  course_curriculum: "Course Curriculum",
  grading_system: "Grading System",
  academic_regulations: "Academic Regulations",
  policies: "Policies",
};

const PAGE_PREVIEW_URLS: Record<string, string> = {
  about: "/about/about",
  history: "/about/history",
  mission_vision: "/about/mission_vision",
  facilities: "/about/facilities",
  achievements: "/about/achievements",
  admission_info: "/about/admission_info",
  principal_message: "/about/principal_message",
  vice_principal_message: "/about/vice_principal_message",
  chairman_message: "/about/chairman_message",
  course_curriculum: "/academic/course_curriculum",
  grading_system: "/academic/grading_system",
  academic_regulations: "/academic/academic_regulations",
  policies: "/academic/policies",
};

export default function StaticPageEditorPage() {
  const { page_key } = useParams<{ page_key: string }>();
  const queryClient = useQueryClient();

  const { data: page, isLoading, isError, error, refetch } = useQuery<StaticPageData>({
    queryKey: ["website", "pages", page_key],
    queryFn: async () => (await api.get(`/api/website/pages/${page_key}`)).data.data,
  });

  const [titleEn, setTitleEn] = useState("");
  const [titleBn, setTitleBn] = useState("");
  const [contentEn, setContentEn] = useState("");
  const [contentBn, setContentBn] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDesc, setMetaDesc] = useState("");

  useEffect(() => {
    if (page) {
      setTitleEn(page.title_en ?? "");
      setTitleBn(page.title_bn ?? "");
      setContentEn(page.content_en ?? "");
      setContentBn(page.content_bn ?? "");
      setMetaTitle(page.meta_title ?? "");
      setMetaDesc(page.meta_desc ?? "");
    }
  }, [page]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.put(`/api/website/pages/${page_key}`, {
        title_en: titleEn,
        title_bn: titleBn,
        content_en: contentEn,
        content_bn: contentBn,
        meta_title: metaTitle,
        meta_desc: metaDesc,
      }),
    onSuccess: () => {
      toast.success("Page saved successfully!");
      queryClient.invalidateQueries({ queryKey: ["website", "pages"] });
    },
    onError: () => {
      toast.error("Failed to save. Please try again.");
    },
  });

  const pageLabel = PAGE_LABELS[page_key] ?? page_key.replace(/_/g, " ");
  const previewUrl = PAGE_PREVIEW_URLS[page_key];

  return (
    <PageWrapper>
      <PageHeader
        title={pageLabel}
        breadcrumbs={[
          { label: "Website" },
          { label: "Pages", href: "/website/pages" },
          { label: pageLabel },
        ]}
      />

      {/* Action Bar */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-muted-foreground">
          Edit the content for this page. Changes are live after saving.
        </p>
        <div className="flex items-center gap-3">
          {previewUrl && (
            <a
              href={`http://localhost:3002/en${previewUrl}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 transition-colors"
            >
              <Eye className="h-3.5 w-3.5" />
              Preview
            </a>
          )}
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || isLoading}
            className="flex items-center gap-2"
          >
            <Save className="h-4 w-4" />
            {saveMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4 animate-pulse">
              <div className="h-5 bg-muted rounded w-1/4" />
              <div className="h-10 bg-muted rounded" />
              <div className="h-64 bg-muted rounded" />
            </div>
          </CardContent>
        </Card>
      ) : isError ? (
        <ErrorState title="Failed to load page content" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      ) : (
        <div className="space-y-6">
          {/* Language Tabs */}
          <Card>
            <CardContent className="pt-6">
              <Tabs defaultValue="en">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-sm font-semibold flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    Page Content
                  </h2>
                  <TabsList>
                    <TabsTrigger value="en">🇬🇧 English</TabsTrigger>
                    <TabsTrigger value="bn">🇧🇩 বাংলা</TabsTrigger>
                  </TabsList>
                </div>

                {/* English Tab */}
                <TabsContent value="en" className="space-y-4 mt-0">
                  <div className="space-y-1.5">
                    <Label>Page Title (English)</Label>
                    <Input
                      value={titleEn}
                      onChange={(e) => setTitleEn(e.target.value)}
                      placeholder="e.g. About Us"
                      className="text-base font-semibold"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Content (English)</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Use the toolbar to format text — headings, bold, lists, tables, blockquotes, and more.
                    </p>
                    <RichTextEditor
                      value={contentEn}
                      onChange={setContentEn}
                      placeholder="Write your page content here..."
                      minHeight="360px"
                    />
                  </div>
                </TabsContent>

                {/* Bangla Tab */}
                <TabsContent value="bn" className="space-y-4 mt-0">
                  <div className="space-y-1.5">
                    <Label>Page Title (বাংলা)</Label>
                    <Input
                      value={titleBn}
                      onChange={(e) => setTitleBn(e.target.value)}
                      placeholder="যেমন: আমাদের সম্পর্কে"
                      className="text-base font-semibold"
                      dir="auto"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Content (বাংলা)</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      টুলবার ব্যবহার করে শিরোনাম, বোল্ড, তালিকা, টেবিল ইত্যাদি যোগ করুন।
                    </p>
                    <RichTextEditor
                      value={contentBn}
                      onChange={setContentBn}
                      placeholder="এখানে বাংলায় লিখুন..."
                      minHeight="360px"
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* SEO Section */}
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-sm font-semibold mb-4">SEO Settings <span className="text-xs font-normal text-muted-foreground">(optional)</span></h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Meta Title</Label>
                  <Input
                    value={metaTitle}
                    onChange={(e) => setMetaTitle(e.target.value)}
                    placeholder="Title shown in browser tab and search results"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Meta Description</Label>
                  <Input
                    value={metaDesc}
                    onChange={(e) => setMetaDesc(e.target.value)}
                    placeholder="Short description shown in search results"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Save bottom button */}
          <div className="flex justify-end">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              size="lg"
              className="flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
