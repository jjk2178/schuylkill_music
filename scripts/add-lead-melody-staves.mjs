import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { addBeatCoordinates } from "../src/music/beatTimeline.mjs";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);

function vocalRange(pitch) {
  while (pitch < 60) pitch += 12;
  while (pitch > 81) pitch -= 12;
  return pitch;
}

function updateChart(relativePath, update) {
  const file = resolve(repoRoot, relativePath);
  const chart = JSON.parse(readFileSync(file, "utf8"));
  update(chart);
  addBeatCoordinates(chart);
  writeFileSync(file, `${JSON.stringify(chart, null, 2)}\n`);
  console.log(`Updated ${chart.title}`);
}

updateChart("public/user-songs/how-far-ill-go.json", (chart) => {
  const rhythm = chart.tracks.find((track) => track.id === "piano-reduction");
  if (!rhythm) throw new Error("Moana rhythm piano source is missing.");
  rhythm.name = "Rhythm Piano — purchased score";
  const trackId = "how-far-ill-go-lead-melody";
  chart.tracks = chart.tracks.filter((track) => track.id !== trackId);
  // The purchased Moana piano score contains the sung top line inside its
  // right-hand material. Keep its top pitch at every source onset as an
  // explicit rehearsal melody staff, leaving the original grand staff intact.
  chart.tracks.push({
    id: trackId,
    name: "Lead vocal melody — top-line reference",
    instrument: "vocals",
    clef: "treble",
    events: rhythm.events
      .filter((event) => event.expected?.midi?.length)
      .map((event) => ({
        ...event,
        id: `${trackId}-${event.id}`,
        expected: {
          ...event.expected,
          kind: "note",
          // The piano source occasionally writes the vocal line an octave
          // low beneath accompaniment. Keep the contour in a readable sung
          // treble range.
          midi: [vocalRange(Math.max(...event.expected.midi))],
        },
      })),
  });
});

updateChart("public/user-songs/olivia-rodrigo-drivers-license-purchased.json", (chart) => {
  const rhythm = chart.tracks.find((track) => track.id === "piano-reduction");
  if (rhythm) rhythm.name = "Rhythm Piano — purchased MusicXML";
  const melody = chart.tracks.find((track) => track.id === "drivers-pdf-melody");
  if (!melody) throw new Error("Drivers License lead melody source is missing.");
  // This is the complete melody extracted from the supplied score. The newer
  // supplied .mxl is retained as the rhythm-piano source, while this track
  // provides the clean dedicated vocal line for rehearsal display.
  melody.name = "Lead vocal melody — supplied score";
  melody.instrument = "vocals";
  melody.clef = "treble";
});
