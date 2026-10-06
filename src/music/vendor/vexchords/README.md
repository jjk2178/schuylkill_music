# Official VexChords chord definitions

Source demo: https://vexflow.com/vexchords/
Upstream: https://github.com/0xfe/vexchords

`demo.html` and `builder.mjs` were retrieved from upstream on 2026-10-05.
The upstream MIT license is retained in `LICENSE`.

Run `node scripts/import-vexchords.mjs` from the repository root to rebuild
`chords.json` without network access. This imports the 16 open chords and
226 E- and A-shaped barre examples from the demo, preserving finger labels,
barres, positions, and alternate voicings.

Song-specific supplied PDF voicings take precedence over reference shapes.
Capo offsets affect sounding MIDI pitches; diagrams and TAB remain relative
to the capo. `vexChordReference.mjs` provides the shared drawing contract for
React, rendered web scores, and PDF packets.
