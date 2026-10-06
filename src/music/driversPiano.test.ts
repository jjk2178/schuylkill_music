import {describe,expect,it} from 'vitest';
import supplied from '../../public/user-songs/olivia-rodrigo-drivers-license-purchased.json';
import {parseChart,getChartDurationMs} from '../charts/schema';
import {compileChartPart} from './parts.mjs';
import {compilePracticeChart} from './practice';
import {soundingNotes,staffTieLinks} from './ties.mjs';
const chart=parseChart(supplied);
describe('drivers license piano from the supplied score',()=>{
 it('preserves both source piano staves across all 70 measures',()=>{
  const notes=compileChartPart(chart,'piano');
  expect(notes.filter(n=>n.midi.length).flatMap(n=>n.midi)).toHaveLength(1216);
  expect([...new Set(notes.map(n=>n.measure))]).toHaveLength(70);
  expect(notes.filter(n=>n.staff==='treble').flatMap(n=>n.midi)).toHaveLength(965);
  expect(getChartDurationMs(chart)).toBeCloseTo(231666.666667,3);
  expect(notes.find(n=>n.staff==="treble")).toMatchObject({timeMs:0,midi:[58,70],staff:'treble',durationMs:416.666667});
  expect(notes.find(n=>n.staff==='bass'&&n.midi.length)).toMatchObject({midi:[41,46,50,53],timeMs:1666.666667,durationMs:3333.333333});
 });
 it('keeps low right-hand notes in treble and preserves overlapping voices',()=>{
  const notes=compileChartPart(chart,'piano');
  expect(notes.some(n=>n.staff==='treble'&&n.midi.includes(53))).toBe(true);
  const voices=notes.filter(n=>n.measure===23&&n.staff==='bass');
  expect(voices.find(n=>n.midi.includes(39))?.durationMs).toBeCloseTo(3333.333333);
  expect(voices.filter(n=>n.midi.includes(51))).toHaveLength(8);
 });
 it('uses the same pitches, hand assignments and durations for practice',()=>{
  const notes=compileChartPart(chart,'piano');
  const practice=compilePracticeChart(chart,'keys');
  expect(practice.tracks[0].events.map(e=>[e.timeMs,e.durationMs,e.staff,e.expected.midi])).toEqual(notes.map(n=>[n.timeMs,n.durationMs,n.staff,n.midi]));
 });
 it('sustains tied pitches across measures without retriggering them',()=>{
  const notes=compileChartPart(chart,'piano');
  expect(notes.reduce((sum,n)=>sum+(n.tieNext?.length??0),0)).toBe(29);
  expect(soundingNotes(notes)).toHaveLength(1216-29);
  expect(staffTieLinks(notes.filter(n=>n.staff==='bass')).filter(link=>link.from!==null&&link.to!==null).length).toBe(29);
 });
});
