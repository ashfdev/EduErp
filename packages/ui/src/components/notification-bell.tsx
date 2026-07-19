"use client";

import * as React from "react";
import { Bell } from "lucide-react";
import { cn } from "../lib/utils";

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationBellProps {
  notifications: NotificationItem[];
  unreadCount: number;
  onOpen?: () => void;
  onMarkAllRead: () => void;
  onNotificationClick: (notification: NotificationItem) => void;
  emptyLabel?: string;
  markAllLabel?: string;
  className?: string;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Deliberately a plain controlled panel (not Radix DropdownMenu — no
// wrapper for that primitive exists in this package yet, and one isn't
// worth building for a single consumer) with an outside-click handler,
// matching the simple toggle patterns already used elsewhere in these apps.
export function NotificationBell({
  notifications,
  unreadCount,
  onOpen,
  onMarkAllRead,
  onNotificationClick,
  emptyLabel = "No notifications yet",
  markAllLabel = "Mark all read",
  className,
}: NotificationBellProps) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) onOpen?.();
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={toggle}
        aria-label="Notifications"
        className="relative rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[90vw] rounded-lg border bg-background shadow-lg">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <p className="text-sm font-semibold">Notifications</p>
            {unreadCount > 0 && (
              <button type="button" onClick={onMarkAllRead} className="text-xs font-medium text-primary hover:underline">
                {markAllLabel}
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {!notifications.length && <p className="p-4 text-center text-sm text-muted-foreground">{emptyLabel}</p>}
            {notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onNotificationClick(n);
                }}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 border-b px-3 py-2.5 text-left text-sm last:border-0 hover:bg-muted/50",
                  !n.is_read && "bg-primary/5",
                )}
              >
                <div className="flex w-full items-center gap-2">
                  {!n.is_read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                  <span className={cn("flex-1 truncate font-medium", n.is_read && "font-normal text-muted-foreground")}>{n.title}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(n.created_at)}</span>
                </div>
                {n.body && <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
