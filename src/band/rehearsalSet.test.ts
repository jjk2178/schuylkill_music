import { describe, expect, it } from "vitest";
import { bandMembers, rehearsalSongs, sharedEquipment } from "./rehearsalSet";

describe("rehearsalSet", () => {
  it("uses the four-song set in performance order", () => {
    expect(rehearsalSongs.map(song => song.id)).toEqual([
      "jerusalem-parry",
      "how-far-ill-go",
      "olivia-rodrigo-drivers-license",
      "silent-night",
    ]);
  });

  it("keeps the requested flute and piano omissions", () => {
    const players = bandMembers.map(member => member.name).sort();
    rehearsalSongs.forEach(song => {
      expect(song.roles.map(role => role.player).sort()).toEqual(song.id === "olivia-rodrigo-drivers-license" ? players.filter(name=>name!=="Laura") : song.id === "how-far-ill-go" ? players.filter(name=>name!=="Nana") : players);
    });
  });

  it("includes equipment manifests for players and the room", () => {
    expect(sharedEquipment.length).toBeGreaterThan(0);
    bandMembers.forEach((member) => {
      expect(member.equipment.length).toBeGreaterThan(0);
    });
  });
});
