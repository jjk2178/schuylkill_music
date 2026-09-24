# Pluck n Play

Retro web guitar play-along trainer with tab rendering, sticky practice progression, scoring,
mic analysis, and Guitar Hero-style feedback.

## Run

```bash
npm install
npm run dev
```

Open the localhost URL. Use `Mock hit` or click note hotspots to play without a mic.

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
