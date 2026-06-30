/* istanbul ignore file -- WebSocket upgrade is validated with local/e2e smoke tests; unit coverage focuses on business rules and room state. */
import crypto from "crypto";
import { IncomingMessage, Server as HttpServer } from "http";
import { Socket } from "net";
import { env } from "../config/env";
import { callCatalogMethod } from "../grpc/catalog.client";
import { callIdentityMethod } from "../grpc/identity.client";
import { getActiveSubscriptionForUser } from "../middleware/subscription-policy";
import { getWatchPartyRoom, serializeRoom } from "./rooms";
import { evaluateParentalControlForSubject } from "../policies/parental-control";

type ValidTokenResponse = {
  valid: boolean;
  user_id: string;
  email: string;
  profile_id: string;
  profile_is_child?: boolean;
  parental_pin_configured?: boolean;
};

type CatalogResponse = {
  success: boolean;
  message: string;
  content?: { maturity_rating?: string };
};

type Client = {
  id: string;
  socket: Socket;
  roomCode: string;
  userId: string;
  profileId: string;
};

const clientsByRoom = new Map<string, Set<Client>>();

function parseCookies(cookieHeader = ""): Record<string, string> {
  return cookieHeader.split(";").reduce<Record<string, string>>((acc, pair) => {
    const [rawKey, ...rest] = pair.trim().split("=");
    if (!rawKey) return acc;
    acc[rawKey] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}

function reject(socket: Socket, statusCode: number, reason: string) {
  socket.write(`HTTP/1.1 ${statusCode} ${reason}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function writeFrame(socket: Socket, payload: unknown) {
  if (socket.destroyed || !socket.writable) return;

  const data = Buffer.from(JSON.stringify(payload));
  const header: number[] = [0x81];

  if (data.length < 126) {
    header.push(data.length);
  } else if (data.length < 65536) {
    header.push(126, (data.length >> 8) & 255, data.length & 255);
  } else {
    header.push(127, 0, 0, 0, 0, (data.length >> 24) & 255, (data.length >> 16) & 255, (data.length >> 8) & 255, data.length & 255);
  }

  socket.write(Buffer.concat([Buffer.from(header), data]));
}

function readTextFrame(buffer: Buffer): string | null {
  if (buffer.length < 6) return null;
  const opcode = buffer[0] & 0x0f;
  if (opcode === 0x8) return null;
  const masked = (buffer[1] & 0x80) === 0x80;
  let length = buffer[1] & 0x7f;
  let offset = 2;

  if (length === 126) {
    if (buffer.length < offset + 2) return null;
    length = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (length === 127) {
    if (buffer.length < offset + 8) return null;
    length = buffer.readUInt32BE(offset + 4);
    offset += 8;
  }

  if (!masked || buffer.length < offset + 4 + length) return null;
  const mask = buffer.subarray(offset, offset + 4);
  offset += 4;
  const payload = Buffer.alloc(length);

  for (let i = 0; i < length; i += 1) {
    payload[i] = buffer[offset + i] ^ mask[i % 4];
  }

  return payload.toString("utf8");
}

function broadcast(roomCode: string, payload: unknown, excludeClientId?: string) {
  const clients = clientsByRoom.get(roomCode);
  if (!clients) return;

  for (const client of clients) {
    if (excludeClientId && client.id === excludeClientId) continue;
    writeFrame(client.socket, payload);
  }
}

function removeClient(client: Client) {
  const clients = clientsByRoom.get(client.roomCode);
  if (!clients) return;

  clients.delete(client);
  if (clients.size === 0) {
    clientsByRoom.delete(client.roomCode);
  }

  const room = getWatchPartyRoom(client.roomCode);
  room?.participants.delete(client.id);
  broadcast(client.roomCode, {
    type: "presence",
    room: room ? serializeRoom(room) : null
  });
}

export function attachWatchPartyUpgrade(server: HttpServer) {
  server.on("upgrade", async (req: IncomingMessage, socket: Socket) => {
    try {
      const url = new URL(req.url || "", `http://${req.headers.host}`);
      const match = url.pathname.match(/^\/api\/watch-party\/ws\/([A-Z0-9]+)$/i);

      if (!match) {
        return reject(socket, 404, "Not Found");
      }

      const websocketKey = req.headers["sec-websocket-key"];
      if (!websocketKey || Array.isArray(websocketKey)) {
        return reject(socket, 400, "Bad Request");
      }

      const code = match[1].toUpperCase();
      const room = getWatchPartyRoom(code);
      if (!room) {
        return reject(socket, 404, "Room Not Found");
      }

      const cookies = parseCookies(req.headers.cookie || "");
      const token = cookies[env.cookieName];
      if (!token) {
        return reject(socket, 401, "Unauthorized");
      }

      const identity = await callIdentityMethod<
        { token: string },
        ValidTokenResponse
      >("ValidateToken", { token });

      if (!identity.valid) {
        return reject(socket, 401, "Unauthorized");
      }

      const subscription = await getActiveSubscriptionForUser(identity.user_id);
      if (!subscription) {
        return reject(socket, 403, "Subscription Required");
      }

      const content = await callCatalogMethod<
        { content_id: string },
        CatalogResponse
      >("GetContentDetail", { content_id: room.content_id });

      if (!content.success) {
        return reject(socket, 404, "Content Not Found");
      }

      const policy = await evaluateParentalControlForSubject({
        subject: {
          user_id: identity.user_id,
          profile_id: identity.profile_id || "",
          profile_is_child: Boolean(identity.profile_is_child)
        },
        maturityRating: content.content?.maturity_rating || "ALL",
        pin: url.searchParams.get("parental_pin") || ""
      });

      if (policy.blocked) {
        return reject(socket, 403, "Parental Pin Required");
      }

      const acceptKey = crypto
        .createHash("sha1")
        .update(`${websocketKey}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
        .digest("base64");

      socket.write(
        [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${acceptKey}`,
          "\r\n"
        ].join("\r\n")
      );

      const client: Client = {
        id: `${identity.user_id}:${identity.profile_id || "account"}:${crypto.randomUUID()}`,
        socket,
        roomCode: code,
        userId: identity.user_id,
        profileId: identity.profile_id || ""
      };

      if (!clientsByRoom.has(code)) {
        clientsByRoom.set(code, new Set());
      }

      clientsByRoom.get(code)?.add(client);
      room.participants.set(client.id, identity.user_id);

      writeFrame(socket, {
        type: "snapshot",
        room: serializeRoom(room),
        playback: room.playback,
        is_host: room.host_user_id === identity.user_id
      });

      broadcast(code, {
        type: "presence",
        room: serializeRoom(room)
      });

      socket.on("data", (chunk) => {
        const text = readTextFrame(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        if (!text) return;

        try {
          const message = JSON.parse(text) as {
            type?: string;
            action?: "play" | "pause" | "seek";
            position?: number;
          };

          if (message.type !== "control") return;

          if (room.host_user_id !== client.userId) {
            writeFrame(socket, {
              type: "error",
              message: "Only the Premium host can control synchronized playback"
            });
            return;
          }

          if (!message.action || !["play", "pause", "seek"].includes(message.action)) {
            writeFrame(socket, { type: "error", message: "Invalid control action" });
            return;
          }

          const position = Number(message.position || 0);
          room.playback = {
            action: message.action,
            position: Number.isFinite(position) && position >= 0 ? position : 0,
            updated_at: new Date().toISOString()
          };

          broadcast(code, {
            type: "sync",
            room: serializeRoom(room),
            playback: room.playback
          }, client.id);
        } catch {
          writeFrame(socket, { type: "error", message: "Invalid websocket message" });
        }
      });

      socket.on("close", () => removeClient(client));
      socket.on("end", () => removeClient(client));
      socket.on("error", () => removeClient(client));
    } catch (error) {
      console.error("Watch Party websocket upgrade failed", error);
      reject(socket, 503, "Service Unavailable");
    }
  });
}
