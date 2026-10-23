import { describe, expect, it } from "vitest";
import { bandMembers, rehearsalSongs, sharedEquipment } from "./rehearsalSet";

describe("rehearsalSet", () => {
  it("includes Landslide as an imported rehearsal reference", () => {
    expect(rehearsalSongs.map(song => song.id)).toEqual([
      "jerusalem-parry",
      "how-far-ill-go",
      "olivia-rodrigo-drivers-license",
      "fleetwood-mac-landslide",
      "silent-night",
    ]);
  });

  it("keeps the requested flute omission and gives Landslide its guitar and vocal guides", () => {
    const players = bandMembers.map(member => member.name).sort();
    rehearsalSongs.forEach(song => {
      expect(song.roles.map(role => role.player).sort()).toEqual(
        song.id === "fleetwood-mac-landslide"
          ? ["Jack", "Nana", "Xinnia"]
          : song.id === "olivia-rodrigo-drivers-license"
            ? players.filter(name => name !== "Laura")
            : players,
      );
    });
  });

  it("includes equipment manifests for players and the room", () => {
    expect(sharedEquipment.length).toBeGreaterThan(0);
    bandMembers.forEach((member) => {
      expect(member.equipment.length).toBeGreaterThan(0);
    });
  });
});
