import crypto from "crypto";

export type PlaybackState = {
  action: "play" | "pause" | "seek";
  position: number;
  updated_at: string;
};

export type WatchPartyRoom = {
  code: string;
  host_user_id: string;
  host_profile_id: string;
  content_id: string;
  created_at: string;
  participants: Map<string, string>;
  playback: PlaybackState;
};

const rooms = new Map<string, WatchPartyRoom>();

export function createWatchPartyRoom(params: {
  hostUserId: string;
  hostProfileId: string;
  contentId: string;
}): WatchPartyRoom {
  let code = "";

  do {
    code = crypto.randomBytes(4).toString("hex").toUpperCase();
  } while (rooms.has(code));

  const room: WatchPartyRoom = {
    code,
    host_user_id: params.hostUserId,
    host_profile_id: params.hostProfileId,
    content_id: params.contentId,
    created_at: new Date().toISOString(),
    participants: new Map(),
    playback: {
      action: "pause",
      position: 0,
      updated_at: new Date().toISOString()
    }
  };

  rooms.set(code, room);
  return room;
}

export function getWatchPartyRoom(code: string): WatchPartyRoom | null {
  return rooms.get(code.toUpperCase()) || null;
}

export function serializeRoom(room: WatchPartyRoom) {
  return {
    code: room.code,
    host_user_id: room.host_user_id,
    host_profile_id: room.host_profile_id,
    content_id: room.content_id,
    created_at: room.created_at,
    participants_count: room.participants.size,
    playback: room.playback
  };
}
