import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import type { NotificationItem } from "@education-erp/ui";

interface NotificationsResponse {
  data: NotificationItem[];
  meta: { unread_count: number };
}

// Socket.io push is the live-update path; the query itself is the
// safety-net fetch on mount/reconnect — live push alone isn't a substitute
// for a reliable initial/catch-up fetch (anything created while the socket
// was disconnected would otherwise never appear until the next full reload).
export function useNotifications() {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const socketRef = useRef<Socket | null>(null);

  const { data } = useQuery<NotificationsResponse>({
    queryKey: ["notifications"],
    queryFn: async () => (await api.get("/api/notifications")).data,
    enabled: !!accessToken,
  });

  useEffect(() => {
    if (!accessToken) return;
    const socket = io(api.defaults.baseURL, { auth: { token: accessToken }, transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("notification", (notification: NotificationItem) => {
      queryClient.setQueryData<NotificationsResponse>(["notifications"], (old) =>
        old ? { data: [notification, ...old.data], meta: { unread_count: old.meta.unread_count + 1 } } : old,
      );
      toast(notification.title, { description: notification.body ?? undefined });
    });
    socket.on("connect", () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [accessToken, queryClient]);

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const markAllReadMutation = useMutation({
    mutationFn: () => api.post("/api/notifications/read-all"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return {
    notifications: data?.data ?? [],
    unreadCount: data?.meta.unread_count ?? 0,
    markRead: (id: string) => markReadMutation.mutate(id),
    markAllRead: () => markAllReadMutation.mutate(),
    refetch: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  };
}
