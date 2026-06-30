/**
 * Pruebas unitarias para watch-party/rooms.ts.
 * Valida creación, búsqueda y serialización de salas Watch Party.
 */

import {
  createWatchPartyRoom,
  getWatchPartyRoom,
  serializeRoom,
} from "../watch-party/rooms";

describe("watch-party rooms", () => {
  it("crea sala con código, playback inicial en pausa y datos del host", () => {
    const room = createWatchPartyRoom({
      hostUserId: "premium-user",
      hostProfileId: "profile-1",
      contentId: "content-1",
    });

    expect(room.code).toMatch(/^[A-F0-9]{8}$/);
    expect(room.host_user_id).toBe("premium-user");
    expect(room.host_profile_id).toBe("profile-1");
    expect(room.content_id).toBe("content-1");
    expect(room.participants.size).toBe(0);
    expect(room.playback).toEqual(
      expect.objectContaining({ action: "pause", position: 0 })
    );
    expect(new Date(room.created_at).toString()).not.toBe("Invalid Date");
  });

  it("busca sala por código sin importar mayúsculas o minúsculas", () => {
    const room = createWatchPartyRoom({
      hostUserId: "premium-user-2",
      hostProfileId: "profile-2",
      contentId: "content-2",
    });

    expect(getWatchPartyRoom(room.code)).toBe(room);
    expect(getWatchPartyRoom(room.code.toLowerCase())).toBe(room);
  });

  it("retorna null para sala inexistente", () => {
    expect(getWatchPartyRoom("NOEXISTE")).toBeNull();
  });

  it("serializa sin exponer el Map interno de participantes", () => {
    const room = createWatchPartyRoom({
      hostUserId: "premium-user-3",
      hostProfileId: "profile-3",
      contentId: "content-3",
    });

    room.participants.set("socket-1", "premium-user-3");
    room.participants.set("socket-2", "standard-user");
    room.playback = {
      action: "play",
      position: 42,
      updated_at: "2026-06-26T00:00:00.000Z",
    };

    expect(serializeRoom(room)).toEqual({
      code: room.code,
      host_user_id: "premium-user-3",
      host_profile_id: "profile-3",
      content_id: "content-3",
      created_at: room.created_at,
      participants_count: 2,
      playback: room.playback,
    });
  });
});
