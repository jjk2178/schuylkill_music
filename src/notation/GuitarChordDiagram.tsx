import { useEffect, useRef, useState } from "react";
import { draw } from "vexchords";
import { type GuitarChord } from "../music/guitarChords.mjs";

import { guitarChordReference as guitarChords, vexChordData, vexChordOptions } from "../music/vexChordReference.mjs";

export function GuitarChordDiagram({ chord }: { chord: GuitarChord }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    host.current.replaceChildren();
    draw(
      host.current,
      vexChordData(chord),
      vexChordOptions(),
    );
  }, [chord]);
  return (
    <figure className="guitar-chord">
      <figcaption>{chord.id}</figcaption>
      <div
        ref={host}
        role="img"
        aria-label={`${chord.id} guitar chord, low E to high E: ${chord.frets.map((f) => (f < 0 ? "muted" : f === 0 ? "open" : `fret ${f}`)).join(", ")}`}
      />
    </figure>
  );
}

export function GuitarChordReference() {
  const [selected, setSelected] = useState("C");
  const chord = guitarChords.find((c) => c.id === selected)!;
  return (
    <section
      className="guitar-chord-reference"
      aria-label="Guitar chord reference"
    >
      <div>
        <strong>Guitar chord reference</strong>
        <p>
          VexChords reference · finger numbers 1–4 · ○ open · × muted · thick line = barre. Reference
          shapes; follow the score for timing.
        </p>
        <label>
          Chord{" "}
          <select
            aria-label="Guitar chord"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            {guitarChords.map((c) => (
              <option key={c.id}>{c.id}</option>
            ))}
          </select>
        </label>
      </div>
      <GuitarChordDiagram chord={chord} />
    </section>
  );
}
