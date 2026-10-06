import {describe,expect,it} from 'vitest';
import {fluteFingeringRegion,fluteFingeringSvg} from './fluteFingerings.mjs';
describe('user-provided flute chart',()=>{
 it('selects each octave independently, including chromatic pitches',()=>{
  expect(fluteFingeringRegion(60)?.x).toBe(142);
  expect(fluteFingeringRegion(72)?.x).toBe(402);
  expect(fluteFingeringRegion(84)?.file).toBe('flute-chart-high.png');
  expect(fluteFingeringRegion(66)).not.toEqual(fluteFingeringRegion(78));
 });
 it('keeps every selected diagram inside its source image',()=>{
  for(let midi=59;midi<=103;midi++){
   const r=fluteFingeringRegion(midi)!;
   expect(r.x+r.width).toBeLessThanOrEqual(r.imageWidth);
   expect(r.y+r.height).toBeLessThanOrEqual(r.imageHeight);
  }
  expect(fluteFingeringRegion(58)).toBeNull();
  expect(fluteFingeringRegion(104)).toBeNull();
  expect(fluteFingeringRegion(60.5)).toBeNull();
 });
 it('uses the same diagrams in browser and local printed packets',()=>{
  expect(fluteFingeringSvg(60)).toContain('/user-songs/sources/flute-chart-low.png');
  expect(fluteFingeringSvg(60,{assetBase:'file:///tmp/'})).toContain('file:///tmp/flute-chart-low.png');
  expect(fluteFingeringSvg(60)).toContain('rotate(90)');
 });
});
