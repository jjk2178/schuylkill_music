# Architecture

Pluck n Play is split into domain modules so the game loop can be tested without a browser mic.

- `charts`: validated chart format and demo fixtures.
- `notation`: VexFlow rendering plus an overlay layout map for cursor and hit effects.
- `gameplay`: transport, sticky cursor, hit windows, score, streak, and event states.
- `audio`: mic startup and AudioWorklet-based analysis.
- `library`: IndexedDB persistence for charts and scores.

The chart model is the source of truth. VexFlow is only a renderer, and every rendered event keeps
an overlay anchor so gameplay visuals do not depend on mutating VexFlow SVG internals.
