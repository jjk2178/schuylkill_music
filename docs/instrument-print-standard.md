# Instrument print standard

Letter paper, 0.45-inch margins. Each part page has four systems. Short final pages keep blank systems for rehearsal notes. Song order and page numbers are shared across the master and instrument packets.

| Instrument | System |
| --- | --- |
| Piano / keys | Treble and bass grand staff |
| Vocals | Treble and bass staves, lyric text in the center |
| Trumpet | B♭ written-pitch treble staff, valve diagrams below |
| Flute / recorder | Concert-pitch treble staff, fingering diagrams below |
| Guitar tab | Treble staff with six-string tab underneath |
| Guitar chords | Treble staff, chord diagrams at changes; continued chords marked |
| Bass | Bass-clef staff with four-string tab underneath |
| Drums | Five-line percussion staff; kick F4, snare C5, cross-head hats G5 and crash A5 |

Eighth and sixteenth notes beam inside meter beats, with dotted-quarter groups in compound meter. Beams stop at measure boundaries, rests, and longer values. Dotted values retain dots.

`lyrics` in a chart is an optional array of `{ timeMs, text, verse? }` entries. Text appears between the vocal staves. Missing lyrics leave a center line and a printed explanation; event labels are not lyrics.

`chordChanges` is an optional array of `{ timeMs, chord, origin? }`. Explicit changes take priority. Without them, the chord version estimates an accompaniment chord from pitch durations and bass notes per measure, labels it as suggested, and removes consecutive repeats. These suggestions need musical review and are separate from the melody/tab practice targets. The shape library currently supports all major/minor triads; unsupported symbols are printed by name without substituting a different chord.

VexFlow engraves staves and beams. VexChords engraves the fretboard diagrams. The PDF generator bundles the installed VexChords source because its upstream prebuilt bundle is incompatible with this browser environment.

Regenerate with `npm run packets:pdf` (set `CHROME_PATH` and optionally `CHROME_NO_SANDBOX=1` for Linux).

Piano and Keys are aliases for one compiled piano part and one website selection. The piano packet includes all keyboard assignments; `keys-packet.pdf` is a compatibility copy. Jerusalem's flute and recorder parts play the full trumpet melody and rhythm, uniformly one octave above the trumpet's concert notes (A4–D6). Trumpet written notation remains a whole step above concert pitch.

Silent Night's flute part carries every encoded melody note with its original timing. The entire source melody is raised one octave (D4–B5), preserving intervals and avoiding notes below the flute's range.

Explicit `piano-accompaniment` tracks take precedence over generated piano reductions. Events may carry `staff`, `voice`, `stemDirection`, `measure`, `tieNext` and `tiePrevious` to preserve the supplied edition's engraving and polyphony. Drivers license uses the piano from the supplied PDF, in two-measure systems, four systems per page. Tied pitches sustain during audio playback.
