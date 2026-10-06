import {describe, expect, it} from 'vitest';
import {recorderFingering, recorderFingeringSvg} from './recorderFingerings.mjs';
describe('Baroque recorder reference',()=>{
 it('covers the chromatic written range with eight hole states',()=>{
  for(let midi=60;midi<=87;midi++)expect(recorderFingering(midi)?.holes).toHaveLength(8);
  expect(recorderFingering(59)).toBeNull();
  expect(recorderFingering(88)).toBeNull();
 });
 it('preserves forked, partial and vented fingerings across registers',()=>{
  expect(recorderFingering(65)?.holes.join('')).toBe('cccccocc');
  expect(recorderFingering(61)?.holes[7]).toBe('h');
  expect(recorderFingering(76)?.holes[0]).toBe('v');
  expect(recorderFingering(60)).not.toEqual(recorderFingering(72));
  expect(recorderFingering(85)?.coverBell).toBe(true);
  expect(recorderFingering(86)?.coverBell).toBe(false);
 });
 it('labels partial holes and bell closure accessibly',()=>{
  expect(recorderFingeringSvg(61)).toContain('outer hole covered');
  expect(recorderFingeringSvg(85)).toContain('cover bell');
 });
});
