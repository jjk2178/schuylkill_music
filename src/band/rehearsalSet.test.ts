import { describe, expect, it } from "vitest";
import { bandMembers, rehearsalSongs, sharedEquipment } from "./rehearsalSet";

describe("rehearsalSet", () => {
  it("assigns every player to every rehearsal song", () => {
    const players = bandMembers.map((member) => member.name).sort();

    rehearsalSongs.forEach((song) => {
      expect(song.roles.map((role) => role.player).sort()).toEqual(players);
    });
  });

  it("includes equipment manifests for players and the room", () => {
    expect(sharedEquipment.length).toBeGreaterThan(0);
    bandMembers.forEach((member) => {
      expect(member.equipment.length).toBeGreaterThan(0);
    });
  });
});
