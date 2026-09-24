# Chart Format

The v1 chart format is JSON validated by `src/charts/schema.ts`.

Charts contain tuning, tempo map, time signatures, section markers, and one or more guitar tracks.
Each guitar event has a stable `id`, time, duration, tab string/fret positions, and expected audio
targets.

Importers should normalize external formats into this schema before rendering or gameplay.
