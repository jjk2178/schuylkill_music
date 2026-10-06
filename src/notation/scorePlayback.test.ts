import {describe,expect,it} from 'vitest';
import {scoreTimeX,scoreSystemIndex} from './scorePlayback';
describe('rendered score playback',()=>{
 it('follows real note positions through uneven engraving',()=>{
  const positions:[number,number][]=[[100,110],[500,350],[900,550]];
  expect(scoreTimeX(500,0,1000,84,656,positions)).toBe(350);
  expect(scoreTimeX(300,0,1000,84,656,positions)).toBe(230);
  expect(scoreTimeX(2000,0,1000,84,656,positions)).toBe(656);
  expect(scoreTimeX(-100,0,1000,84,656,positions)).toBe(84);
 });
 it('switches lines at their start and holds at the end during gaps',()=>{
  const ranges=[{startMs:0,endMs:800},{startMs:1000,endMs:1900},{startMs:2000,endMs:3000}];
  expect(scoreSystemIndex(900,ranges)).toBe(0);
  expect(scoreSystemIndex(1000,ranges)).toBe(1);
  expect(scoreSystemIndex(3000,ranges)).toBe(2);
 });
});
