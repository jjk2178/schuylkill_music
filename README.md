# Pluck and Play

Retro web guitar play-along trainer with tab rendering, sticky practice progression, scoring,
mic analysis, and Guitar Hero-style feedback.

## Run

```bash
npm install
npm run dev
```

Open the localhost URL. Use `Mock hit` or click note hotspots to play without a mic.

Run the separate apps with:

```bash
npm run dev:pluck       # sticky play-along app
npm run dev:scoreboard  # arrangement score app
```

Both apps use the shared music library backend in `src/shared/musicLibraryBackend.ts` and shared
song database backend in `src/shared/songDatabaseBackend.ts`.

## Rehearsal Packets

Scoreboard rehearsal data lives in `src/band/rehearsalSet.json`. Generate printable PDFs with:

```bash
npm run packets:pdf
```

The command renders VexFlow SVG score pages through headless Chrome, including a master staff above
each player's instrument-specific annotations, then writes a master set list/equipment packet and one
player packet per band member to `output/pdf/`. Debuggable HTML intermediates are written to
`output/pdf/html/`.

## Demo Songs

The app ships with generated test excerpts in `public/demo-songs/`. They are imported from
Mutopia Project LilyPond sources copied into `public/demo-songs/sources/`.

To regenerate them after cloning the Mutopia mirror:

```bash
git clone --depth 1 https://github.com/MutopiaProject/MutopiaProject.git /private/tmp/mutopia
npm run import:mutopia
```

## Build Targets

- React + TypeScript + Vite app shell
- VexFlow tab rendering with a cursor/effects overlay
- Internal JSON chart schema with validation
- Practice Sticky and Performance gameplay modes
- AudioWorklet mic analyzer shell for RMS/onset/pitch frames
- IndexedDB persistence helpers for charts and scores

## Notes

Mic analysis requires `localhost` or HTTPS because browser AudioWorklet and microphone APIs need
a secure context.

## Set list trainer

Run `npm run dev:pluck -- --host 127.0.0.1 --port 5174` for Pluck and Play, and
`npm run dev:scoreboard -- --host 127.0.0.1 --port 5173` for Scoreboard.
The trainer lists the saved set list first and lets you choose
an assigned instrument/player. The trainer, band score and PDFs share their part
compiler. Trumpet notation is written for B♭ trumpet; microphone pitch scoring and
reference audio remain at concert pitch. Drum input scores onset timing.

Start the microphone to discover microphone/USB interface inputs. Stop it before
switching the selected input, then start again. Pitch analysis is monophonic:
keyboard and chord parts accept a matching individual note, not full chord recognition.
Guide audio is optional; use headphones with microphone input.

Measure bars use quarter-note BPM and the time signature denominator, with shared
positions across grand staves. Tempo changes preserve measure progress; a meter
change starts a new bar. Pickup measures are supported; Drivers License opens with a two-quarter pickup.

On Linux, generate packets with a Chromium path:

```bash
CHROME_PATH=/path/to/chrome npm run packets:pdf
```

Restricted containers may additionally require `CHROME_NO_SANDBOX=1`.
See [encoded repertoire sources](docs/repertoire-sources.md) for downloaded open
MIDI/MusicXML candidates and the import review queue.

Generate separate instrument set-list sheets with `npm run setlists:pdf` (using
the same `CHROME_PATH` setting). These PDFs are written to `output/pdf/setlists/`.

### Browse and play the rendered parts

Open `/score-player` on either local app (for example, http://localhost:5173/score-player), or use **Browse & play instrument scores** in the sidebar. Select an instrument and an applicable set-list song. Play sounds only that compiled part and moves a red cursor through its actual rendered note positions, scrolling inside the music panel to the next system. Pause resumes from the current position; Reset, the position slider, and Previous/Next note let you browse. Guitar also offers a chord-diagram view. Audio uses synthesized guide tones in concert pitch; trumpet notation stays in B♭ written pitch.

The page uses the PDF generator's four-system layout, including grand staves, TAB and wind fingerings. `npm run scores:web` generates the website's score pages, compiled note JSON and index under `public/rendered-scores/` without requiring Chromium. The dev and build commands generate these automatically; `npm run packets:pdf` also refreshes them. Generated website scores are ignored by Git and included in the Vite build. Drivers License includes the complete piano and melody recovered from the supplied score, including triplets and ties. Moana uses a shared 90 BPM timeline; guitar chord-sheet timing is a practice adaptation aligned to the melody’s key change and ending.

### Current rehearsal packets

The set order is Jerusalem, How Far I’ll Go, Drivers License, and Silent Night.
Drivers License has no flute assignment; How Far I’ll Go has no piano assignment.
Keys is treated as Piano, with a single export. Piano PDFs include note-sized
note-name annotations beside each notehead. Guitar chord packets use repeated
chord names and strum arrows above VexChords diagrams, with capo-relative shapes.

To generate only the selected packets (no player packets, master packet or ZIP):

```bash
CHROME_PATH=/path/to/chrome node scripts/build-packets.mjs --instruments=guitar,flute,recorder,bass,piano,drums,trumpet
```

Use `PDF_OUTPUT_DIR=output/pdf/YYYY-MM-DD` for a dated folder, or
`PDF_HTML_DIR=/tmp/music-packets` to keep verification HTML outside the PDF folder.
Generated PDFs and archives under `output/` remain local and are ignored by Git.

Recover the full Drivers License score with
`python scripts/import-drivers-pdf.py public/user-songs/sources/drivers-license-reference-score.pdf --melody`
after installing `scripts/requirements-pdf.txt`. Rebuild the official VexChords
reference catalogue with `node scripts/import-vexchords.mjs`. Source credits and
licenses are retained alongside the imported assets.
