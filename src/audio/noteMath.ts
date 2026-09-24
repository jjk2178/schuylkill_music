const A4_MIDI = 69;
const A4_HZ = 440;

export function midiToHz(midi: number): number {
  return A4_HZ * 2 ** ((midi - A4_MIDI) / 12);
}

export function hzToMidi(hz: number): number {
  return Math.round(12 * Math.log2(hz / A4_HZ) + A4_MIDI);
}

export function centsBetween(hz: number, targetHz: number): number {
  return 1200 * Math.log2(hz / targetHz);
}

export function isPitchWithinTolerance(
  detectedHz: number | null,
  expectedMidi: number[],
  toleranceCents: number,
): boolean {
  if (!detectedHz || expectedMidi.length === 0) return false;
  return expectedMidi.some(
    (midi) => Math.abs(centsBetween(detectedHz, midiToHz(midi))) <= toleranceCents,
  );
}
