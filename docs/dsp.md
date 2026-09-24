# DSP Notes

The first implementation uses browser mic input through `getUserMedia` and an `AudioWorklet`.

The worklet emits compact analysis frames:

- RMS for input level
- onset candidates for plucks/strums
- approximate autocorrelation pitch
- audio context time

The gameplay layer constrains detection against the expected chart event. This makes chords
tractable for v1 without attempting general-purpose polyphonic transcription.
