"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, Label, Textarea, Tabs, TabsList, TabsTrigger, TabsContent } from "@education-erp/ui";
import { api } from "@/lib/api";

interface StaticPageData {
  page_key: string;
  title_en: string | null;
  title_bn: string | null;
  content_en: string | null;
  content_bn: string | null;
  meta_title: string | null;
  meta_desc: string | null;
}

export default function StaticPageEditorPage() {
  const { page_key } = useParams<{ page_key: string }>();
  const queryClient = useQueryClient();

  const { data: page } = useQuery<StaticPageData>({ queryKey: ["website", "pages", page_key], queryFn: async () => (await api.get(`/api/website/pages/${page_key}`)).data.data });

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
        title_en: titleEn, title_bn: titleBn, content_en: contentEn, content_bn: contentBn, meta_title: metaTitle, meta_desc: metaDesc,
      }),
    onSuccess: () => {
      toast.success("Page saved");
      queryClient.invalidateQueries({ queryKey: ["website", "pages"] });
    },
  });

  return (
    <PageWrapper>
      <PageHeader title={page_key.replace(/_/g, " ")} breadcrumbs={[{ label: "Website" }, { label: "Pages", href: "/website/pages" }, { label: page_key }]} />
      <Card>
        <CardContent className="space-y-4 pt-6">
          <Tabs defaultValue="en">
            <TabsList>
              <TabsTrigger value="en">English</TabsTrigger>
              <TabsTrigger value="bn">Bangla</TabsTrigger>
            </TabsList>
            <TabsContent value="en" className="space-y-3">
              <div className="space-y-1.5"><Label>Title (EN)</Label><Input value={titleEn} onChange={(e) => setTitleEn(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Content (EN)</Label><Textarea rows={10} value={contentEn} onChange={(e) => setContentEn(e.target.value)} /></div>
            </TabsContent>
            <TabsContent value="bn" className="space-y-3">
              <div className="space-y-1.5"><Label>Title (BN)</Label><Input value={titleBn} onChange={(e) => setTitleBn(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Content (BN)</Label><Textarea rows={10} value={contentBn} onChange={(e) => setContentBn(e.target.value)} /></div>
            </TabsContent>
          </Tabs>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Meta Title</Label><Input value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Meta Description</Label><Input value={metaDesc} onChange={(e) => setMetaDesc(e.target.value)} /></div>
          </div>
          <Button disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>{saveMutation.isPending ? "Saving..." : "Save"}</Button>
        </CardContent>
      </Card>
    </PageWrapper>
  );
}
