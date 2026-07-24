"use client";

import * as React from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, List, ListOrdered, Heading2, Heading3, Pilcrow } from "lucide-react";
import { cn } from "../lib/utils";

export interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  className?: string;
}

function ToolbarButton({
  active,
  onClick,
  label,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        active && "bg-muted text-foreground",
      )}
    >
      {children}
    </button>
  );
}

// Bangla/English rich text — bold, headings (for larger/smaller text), and
// lists, backed by the already-installed (previously unused) TipTap
// starter-kit. Deliberately scoped to what StarterKit already ships rather
// than pulling in a new font-size extension — headings cover the "choto
// boro" (bigger/smaller) sizing need without a new dependency.
// Helper: bypasses @tiptap/pm peer-version type conflicts in monorepo
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cmd(editor: ReturnType<typeof useEditor>): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (editor as any)?.chain().focus();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isActive = (editor: ReturnType<typeof useEditor>, name: string, attrs?: object) => (editor as any)?.isActive(name, attrs) ?? false;

export function RichTextEditor({ value, onChange, className }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "min-h-[10rem] px-3 py-2 text-sm focus:outline-none " +
          "[&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-2 [&_h2]:mb-1 " +
          "[&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1 " +
          "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-1",
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onUpdate: ({ editor: ed }) => onChange((ed as any).getHTML()),
  });

  // Keep the editor in sync when `value` is reset externally (e.g. form reset after save).
  React.useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ed = editor as any;
    if (ed && value !== ed.getHTML() && (value === "" || value === "<p></p>")) {
      ed.commands.setContent(value);
    }
  }, [value, editor]);

  if (!editor) return null;

  return (
    <div className={cn("rounded-md border border-input bg-background", className)}>
      <div className="flex items-center gap-0.5 border-b px-2 py-1.5">
        <ToolbarButton label="Bold" active={isActive(editor, "bold")} onClick={() => cmd(editor).toggleBold().run()}>
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Italic" active={isActive(editor, "italic")} onClick={() => cmd(editor).toggleItalic().run()}>
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <div className="mx-1 h-4 w-px bg-border" />
        <ToolbarButton label="Large heading" active={isActive(editor, "heading", { level: 2 })} onClick={() => cmd(editor).toggleHeading({ level: 2 }).run()}>
          <Heading2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Small heading" active={isActive(editor, "heading", { level: 3 })} onClick={() => cmd(editor).toggleHeading({ level: 3 }).run()}>
          <Heading3 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Normal text" active={isActive(editor, "paragraph")} onClick={() => cmd(editor).setParagraph().run()}>
          <Pilcrow className="h-3.5 w-3.5" />
        </ToolbarButton>
        <div className="mx-1 h-4 w-px bg-border" />
        <ToolbarButton label="Bullet list" active={isActive(editor, "bulletList")} onClick={() => cmd(editor).toggleBulletList().run()}>
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Numbered list" active={isActive(editor, "orderedList")} onClick={() => cmd(editor).toggleOrderedList().run()}>
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
