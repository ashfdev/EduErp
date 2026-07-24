"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Link from "@tiptap/extension-link";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useCallback } from "react";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading2, Heading3,
  List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight,
  Table as TableIcon, Link as LinkIcon, Quote,
  Undo, Redo, Minus, Type,
} from "lucide-react";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: string;
}

function ToolbarButton({
  onClick, active = false, title, children,
}: {
  onClick: () => void; active?: boolean; title: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(evt) => { evt.preventDefault(); onClick(); }}
      title={title}
      className={`p-1.5 rounded-lg text-sm transition-all ${
        active
          ? "bg-slate-800 text-white"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-slate-200 mx-1" />;
}

// Helper: returns editor.chain().focus() cast to any to avoid @tiptap/pm
// peer-version type conflicts inside this pnpm monorepo. Runtime behaviour
// is identical — the StarterKit commands (toggleBold, toggleHeading, etc.)
// are present at runtime; only the TS declarations are out of sync.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cmd(editor: ReturnType<typeof useEditor>): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (editor as any)?.chain().focus();
}

export function RichTextEditor({ value, onChange, placeholder = "Start writing...", minHeight = "280px" }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({ openOnClick: false }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    immediatelyRender: false,
    onUpdate({ editor: ed }) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onChange((ed as any).getHTML());
    },
    editorProps: {
      attributes: { class: "outline-none" },
    },
  });

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ed = editor as any;
    if (ed && value !== ed.getHTML()) {
      ed.commands.setContent(value, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const setLink = useCallback(() => {
    if (!editor) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prev = (editor as any).getAttributes("link").href as string | undefined;
    const url = window.prompt("Enter URL", prev ?? "https://");
    if (url === null) return;
    const chain = cmd(editor).extendMarkRange("link");
    if (url === "") chain.unsetLink().run();
    else chain.setLink({ href: url }).run();
  }, [editor]);

  const insertTable = useCallback(() => {
    cmd(editor)?.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }, [editor]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isActive = (name: string, attrs?: object) => (editor as any)?.isActive(name, attrs) ?? false;

  if (!editor) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-0.5 px-3 py-2 border-b border-slate-100 bg-slate-50/80">
        <ToolbarButton onClick={() => cmd(editor).undo().run()} title="Undo"><Undo className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton onClick={() => cmd(editor).redo().run()} title="Redo"><Redo className="h-4 w-4" /></ToolbarButton>
        <Divider />
        <ToolbarButton onClick={() => cmd(editor).setParagraph().run()} active={isActive("paragraph")} title="Normal Text"><Type className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton onClick={() => cmd(editor).toggleHeading({ level: 2 }).run()} active={isActive("heading", { level: 2 })} title="Heading"><Heading2 className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton onClick={() => cmd(editor).toggleHeading({ level: 3 }).run()} active={isActive("heading", { level: 3 })} title="Sub-heading"><Heading3 className="h-4 w-4" /></ToolbarButton>
        <Divider />
        <ToolbarButton onClick={() => cmd(editor).toggleBold().run()} active={isActive("bold")} title="Bold"><Bold className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton onClick={() => cmd(editor).toggleItalic().run()} active={isActive("italic")} title="Italic"><Italic className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton onClick={() => cmd(editor).toggleUnderline().run()} active={isActive("underline")} title="Underline"><UnderlineIcon className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton onClick={() => cmd(editor).toggleStrike().run()} active={isActive("strike")} title="Strikethrough"><Strikethrough className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton onClick={setLink} active={isActive("link")} title="Insert Link"><LinkIcon className="h-4 w-4" /></ToolbarButton>
        <Divider />
        <ToolbarButton onClick={() => cmd(editor).toggleBulletList().run()} active={isActive("bulletList")} title="Bullet List"><List className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton onClick={() => cmd(editor).toggleOrderedList().run()} active={isActive("orderedList")} title="Numbered List"><ListOrdered className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton onClick={() => cmd(editor).toggleBlockquote().run()} active={isActive("blockquote")} title="Blockquote"><Quote className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton onClick={() => cmd(editor).setHorizontalRule().run()} title="Divider Line"><Minus className="h-4 w-4" /></ToolbarButton>
        <Divider />
        <ToolbarButton onClick={() => cmd(editor).setTextAlign("left").run()} active={isActive("left", {})} title="Align Left"><AlignLeft className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton onClick={() => cmd(editor).setTextAlign("center").run()} active={isActive("center", {})} title="Align Center"><AlignCenter className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton onClick={() => cmd(editor).setTextAlign("right").run()} active={isActive("right", {})} title="Align Right"><AlignRight className="h-4 w-4" /></ToolbarButton>
        <Divider />
        <ToolbarButton onClick={insertTable} title="Insert Table"><TableIcon className="h-4 w-4" /></ToolbarButton>
      </div>

      {/* ── Editable area ── */}
      <div
        className="px-5 py-4 cursor-text"
        style={{ minHeight }}
        onClick={() => { (editor as any)?.chain().focus().run(); }}
      >
        <style>{`
          .rte-admin .ProseMirror { outline: none; min-height: ${minHeight}; }
          .rte-admin .ProseMirror p.is-editor-empty:first-child::before { content: attr(data-placeholder); float: left; color: #94a3b8; pointer-events: none; height: 0; }
          .rte-admin h2 { font-size: 1.15rem; font-weight: 700; margin: 1rem 0 0.4rem; border-left: 3px solid #16a34a; padding-left: 0.75rem; color: #0f172a; }
          .rte-admin h3 { font-size: 1rem; font-weight: 700; margin: 0.8rem 0 0.3rem; color: #15803d; }
          .rte-admin p { margin: 0.35rem 0; line-height: 1.75; font-size: 0.9375rem; color: #334155; }
          .rte-admin ul { list-style: disc; padding-left: 1.5rem; margin: 0.5rem 0; }
          .rte-admin ol { list-style: decimal; padding-left: 1.5rem; margin: 0.5rem 0; }
          .rte-admin li { margin: 0.2rem 0; line-height: 1.6; color: #334155; }
          .rte-admin blockquote { border-left: 4px solid #4ade80; background: #f0fdf4; padding: 0.4rem 1rem; border-radius: 0 0.75rem 0.75rem 0; margin: 0.75rem 0; color: #475569; font-style: italic; }
          .rte-admin a { color: #15803d; text-decoration: underline; }
          .rte-admin table { border-collapse: collapse; width: 100%; margin: 0.75rem 0; }
          .rte-admin th { background: #f8fafc; font-weight: 700; font-size: 0.8125rem; color: #475569; padding: 0.45rem 0.75rem; border: 1px solid #e2e8f0; text-align: left; }
          .rte-admin td { padding: 0.45rem 0.75rem; border: 1px solid #e2e8f0; font-size: 0.875rem; color: #475569; }
          .rte-admin hr { border: none; border-top: 1px solid #e2e8f0; margin: 1rem 0; }
          .rte-admin strong { font-weight: 700; color: #1e293b; }
        `}</style>
        <div className="rte-admin">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
