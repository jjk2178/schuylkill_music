// Exact key diagrams from the user-provided Karen Evans Moratz / Dummies chart.
// Embedded images are extracted without resampling. Each view selects one note;
// no pitch-class folding or invented chromatic fallback is used.
export function fluteFingeringRegion(midi) {
  if (!Number.isInteger(midi) || midi < 59 || midi > 103) return null;
  const high = midi >= 83;
  const offset = midi - (high ? 83 : 59);
  const right = offset >= 12;
  const row = offset % 12;
  return {
    file: high ? 'flute-chart-high.png' : 'flute-chart-low.png',
    imageWidth:535, imageHeight:high ? 699 : 806,
    x:right ? 402 : 142, y:Math.round(row * (high ? 58.2 : 58.15)),
    width:130, height:56,
  };
}
export function fluteFingeringSvg(midi, {width=28,height=82,assetBase='/user-songs/sources/'}={}) {
  const region=fluteFingeringRegion(midi);
  if(!region)return '<span class="flute-unavailable" aria-label="Flute fingering outside reference range">?</span>';
  const src=(assetBase+region.file).replaceAll('&','&amp;').replaceAll('"','&quot;');
  // Rotate the horizontal chart so LH keys are above RH keys under the staff.
  return `<svg class="flute-fingering-svg" width="${width}" height="${height}" viewBox="0 0 56 130" role="img" aria-label="Flute fingering for MIDI ${midi}, thumb, left hand, right hand and footjoint keys; Dummies reference"><g transform="translate(56 0) rotate(90)"><svg width="130" height="56" viewBox="${region.x} ${region.y} ${region.width} ${region.height}" overflow="hidden"><image href="${src}" width="${region.imageWidth}" height="${region.imageHeight}"/></svg></g></svg>`;
}
