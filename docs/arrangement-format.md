# Song arrangement format

A beat-based, lossless arrangement format that holds tempo, key, meter, tuning,
multiple instrument tracks, chord diagrams, techniques, and lyrics for a whole
song. It is the persisted **source of truth**; MusicXML is an export.

## Why a second format

`src/charts/schema.ts` (v1) is **millisecond-timed** because the gameplay loop
scores note onsets against microphone input inside hit windows. That is the right
model for the game but a poor one for engraving and interchange: positions do not
line up with bars and beats.

The arrangement format (`src/arrangement/schema.mjs`, `schemaVersion: 2`) is
**beat-timed** — every event carries a `beat` offset and `durationBeats` in
quarter-note units inside its measure — so it maps cleanly onto notation and onto
MusicXML. The two formats coexist; neither replaces the other.

## Files

| File | Purpose |
| --- | --- |
| `src/arrangement/schema.mjs` | Zod schema + helpers (`parseArrangement`, `noteValueFor`, `tabNoteMidi`, `tuningMidi`). |
| `src/arrangement/parse.mjs` | Parse Ultimate-Guitar style `.txt` into an arrangement (`parseSong`). |
| `src/arrangement/tab.mjs` | Derive tab (string/fret) from pitch via a fret-assignment optimiser (`generateTab`, `withGeneratedTab`). Works for 6-string guitar and 4-string bass. |
| `src/arrangement/parts.mjs` | Generate supporting parts: `generateBassTrack` (root+octave groove) and `generateRhythmGuitarTrack` (strummed Guitar 2), driven by the chord progression. |
| `src/arrangement/parse-bass.mjs` | Parse a 4-string EADG bass tab into a bass-only arrangement (`parseBassSong`). |
| `src/arrangement/musicxml.mjs` | Export an arrangement to multi-part MusicXML 4.0 (`arrangementToMusicXML`). |
| `src/arrangement/html.mjs` | Render the combined notation to printable HTML (`renderArrangementHtml`). |
| `scripts/import-guitar-songs.mjs` | CLI: `.txt` → `<id>.json` + `<id>.guitar.musicxml`. |
| `scripts/render-guitar-pdf.mjs` | CLI: `<id>.json` → `<id>.guitar.html` + `<id>.guitar.pdf`. |

## Conventions

Shared with `src/music/guitarChords.mjs`:

- A chord shape's `frets` array runs **string 6 (low E) → string 1 (high e)**;
  `-1` = muted/not played, `0` = open.
- `tuning` runs string 6 → string 1, e.g. `["E2","A2","D3","G3","B3","E4"]`.
- A tab note's `string` is the standard tab number: **1 = high e, 6 = low E**
  (this matches MusicXML's `<string>` numbering, so it exports unchanged).
- `baseFret` on a diagram is `1` whenever any open string is played; only an
  all-fretted shape above the nut shifts the window up.

## The combined guitar notation

The goal is to show, for the same beat, the **tab**, the **chord diagram** of the
shape being held, and the **lyric** — e.g. Landslide's Travis-picking pattern is
tab, but you are holding a chord, so the diagram stays relevant.

In the schema an event can simultaneously carry `tab[]` (string/fret/technique),
`midi[]` (staff pitches), `chordSymbol` (→ a `chordLibrary` diagram), and `lyric`.
On MusicXML export:

- `chordSymbol` becomes `<harmony>` with a fretboard `<frame>` diagram.
- `tab[]` becomes `<note>` with `<technical><string>/<fret>` plus the pitch.
- `lyric` becomes `<lyric>`.
- A chord-chart event that has only a `chordSymbol` (no explicit notes, as in a
  lyrics-with-chords sheet) is **strummed**: the resolved shape's fretted strings
  are emitted as a chord so the bar is playable and the lyric attaches to real
  notes.

## Tab is generated from pitch, not copied

Pitch is the musical representation and the source of truth. Tab is **derived**
from the pitches by `src/arrangement/tab.mjs`: a pitch can sound at several
string/fret positions, so for each event the optimiser picks playable positions
that minimise hand travel and chord span, carrying the fretting-hand position
across the whole track (the way notation software generates tab from notes).

Both exporters call `withGeneratedTab(arr)` by default (pass
`generateTabFromPitch: false` to opt out), so the tab in the PDF and in the
MusicXML `<technical>` elements is computed from `midi` — it is not the ingested
ASCII fingering. Every generated position reproduces the exact source pitch. The
originally-parsed fingering is preserved on each event as `sourceFingering` so
nothing is lost; it just no longer drives rendering. The optimiser's scoring
(fret span, hand travel, open-string and low-position bias) lives in `tab.mjs`
and is the single place to tune fingering style.

## Parsing notes

ASCII tab encodes rhythm only by column spacing, so a note's character column is
mapped to a beat within its measure and quantized to a 16th-note grid. This is
approximate by nature; the JSON preserves every parsed symbol (including picking
templates, secondary-guitar riffs, performance notes, and the legend in
`snippets`/`legend`) so nothing from the source is silently dropped.

Techniques recognised: hammer `h`, pull `p`, slide `/` `\`, bend `b`, release
`r`, vibrato `~`, dead note `x`, ghost/hold `(n)`.

## Usage

```bash
npm run songs:import                 # ~/Music/songs/*.txt -> public/arrangements/
node scripts/import-guitar-songs.mjs <srcDir> <outDir>

npm run songs:pdf                    # public/arrangements/*.json -> *.guitar.{html,pdf}
```

`songs:import` writes `<id>.json` (multi-track source of truth) and a multi-part
`<id>.musicxml` (opens in MuseScore / Guitar Pro / Finale). `songs:pdf` renders
one PDF per part — `<id>.<trackId>.pdf` (e.g. `landslide.guitar1.pdf`,
`landslide.guitar2.pdf`, `landslide.bass.pdf`) — plus the matching `.html`. Tests
live in `src/arrangement/arrangement.test.mjs`.

### Parts per song

Each guitar song produces three tracks:

- **Guitar 1** — the primary part parsed from the source (tab where the source has
  tab, chord-chart where it is chords-over-lyrics).
- **Guitar 2** — a clean strummed rhythm part (chord diagrams + strums) built from
  the chord progression. Chords come from explicit symbols where present, and are
  otherwise inferred from Guitar 1's pitches per measure (`parts.mjs`).
- **Bass** — a root+octave eighth-note groove on a 4-string (EADG) staff,
  following the same per-measure chord roots.

A file whose name contains `bass` (e.g. `cant_stop_bass.txt`) is parsed as a
4-string bass tab and produces a bass-only arrangement (slap/pop/ghost/slide
markings kept in the legend), with no generated guitar parts.

### PDF rendering (Chromium)

`render-guitar-pdf.mjs` shells out to Chromium exactly like `build-packets.mjs`:
`CHROME_PATH` (default `chromium`), optional `CHROME_NO_SANDBOX=1`. Snap-packaged
Chromium is confined to `$HOME` and refuses hidden dot-directories, so the script
stages each HTML + PDF in a plain `$HOME` directory (`GUITAR_PDF_STAGING`,
default `~/guitar-pdf-build`) and copies the finished PDF back into the output
dir. Point `CHROME_PATH` at a non-sandboxed Chrome to skip the staging dance.

### The combined notation on the page

Per measure: the chord diagram(s) of the shape being held sit above a monospace
tab grid, with the sung lyric below and the bar number beneath. Lyrics-with-chords
measures (no tab in the source) drop the tab and show diagrams + lyric, so a song
like Landslide prints as a diagram-rich chord/lyric chart while a tabbed song like
Stairway prints as tab — and a passage with both (e.g. a solo with chord labels)
shows both at once.

## What MusicXML does and does not carry

MusicXML is lossless for the **notation**: tab (`<technical>`), chord diagrams
(`<frame>`), harmony, lyrics, tempo, key, meter, ties, and multiple parts. It has
no home for the v1 gameplay fields (`expected.toleranceCents`, `timingWindowMs`)
or for millisecond-exact timing, which is why the beat-based JSON — not the
MusicXML — is the source of truth.
