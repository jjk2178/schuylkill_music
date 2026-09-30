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
