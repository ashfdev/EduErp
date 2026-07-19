import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./dialog";
import { Button } from "./button";
import { cn } from "../lib/utils";

export interface PdfPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** URL to render inline. When null while `open` is true, a loading state is shown. */
  pdfUrl: string | null;
  /** Defaults to `pdfUrl` — pass a distinct URL only when the download link differs (e.g. `?download=1`). */
  downloadUrl?: string;
  downloadLabel?: string;
  closeLabel?: string;
}

// Renders any PDF the app already serves (a signed download URL, a public
// document route) inline in a modal instead of navigating away to a new tab
// — the "View PDF" affordance this project didn't have anywhere until now.
// Deliberately just an <iframe> over the same URL every "Download" action
// already resolves — no new file-serving mechanism, just a new way to show
// what's already correctly served.
export function PdfPreviewModal({
  open,
  onOpenChange,
  title,
  pdfUrl,
  downloadUrl,
  downloadLabel = "Download",
  closeLabel = "Close",
}: PdfPreviewModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-w-4xl w-[90vw] p-0 gap-0")}>
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="pr-8">{title}</DialogTitle>
        </DialogHeader>
        <div className="h-[75vh] bg-muted/30">
          {pdfUrl ? (
            <iframe src={pdfUrl} title={title} className="h-full w-full border-0" />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading…</div>
          )}
        </div>
        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {closeLabel}
          </Button>
          <Button asChild disabled={!pdfUrl}>
            <a href={downloadUrl ?? pdfUrl ?? "#"} target="_blank" rel="noreferrer" download>
              {downloadLabel}
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
