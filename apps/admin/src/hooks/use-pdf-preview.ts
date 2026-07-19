import { useCallback, useState } from "react";
import { api } from "@/lib/api";

// Fee receipts/invoices, admit cards, seat plans, and payslips are all
// served behind staff auth (a bare <iframe src> can't carry the JWT), so
// previewing them means fetching the PDF as an authenticated blob first and
// handing the resulting object URL to PdfPreviewModal — unlike the public
// Notice PDF route, which the modal can point at directly.
export function usePdfPreview() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState<string | null>(null);

  const openPreview = useCallback(async (apiUrl: string, previewTitle: string) => {
    setTitle(previewTitle);
    setUrl(null);
    setOpen(true);
    try {
      const res = await api.get(apiUrl, { responseType: "blob" });
      setUrl(URL.createObjectURL(res.data));
    } catch {
      setOpen(false);
    }
  }, []);

  function closePreview() {
    setOpen(false);
    if (url) URL.revokeObjectURL(url);
    setUrl(null);
  }

  return { open, title, url, openPreview, closePreview };
}
