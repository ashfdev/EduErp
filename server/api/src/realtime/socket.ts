import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { verifyAccessToken } from "../lib/jwt";
import { env } from "../lib/env";
import { logger } from "../lib/logger";

const ALLOWED_ORIGINS = [env.ADMIN_URL, env.PORTAL_URL, env.WEBSITE_URL, env.TEACHER_URL].filter((url): url is string => !!url);

let io: SocketIOServer | null = null;

// Attached to the same http.Server the Express app already listens on
// (shares the port, default /socket.io/ path) — a parallel, additive
// real-time layer, not a replacement for the REST auth path. A missing/
// invalid JWT is rejected at the handshake, exactly as `authenticate`
// middleware rejects a bad Bearer token on every other route.
export function attachSocketServer(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : true,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("Authentication token is required"));
    try {
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId as string;
    socket.join(`user:${userId}`);
    socket.on("disconnect", () => {
      // Room membership is cleaned up automatically by socket.io on disconnect.
    });
  });

  logger.info("Socket.io real-time layer attached");
  return io;
}

// Called by createInAppNotification() — a no-op (not a throw) when the
// socket server hasn't been attached (e.g. under `vitest`, which imports
// route modules directly without ever calling attachSocketServer()).
export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(`user:${userId}`).emit(event, payload);
}
