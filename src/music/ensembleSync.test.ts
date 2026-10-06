import {expect,it} from 'vitest';
import drivers from '../../public/user-songs/olivia-rodrigo-drivers-license-purchased.json';
import moana from '../../public/user-songs/how-far-ill-go.json';
import {parseChart,getChartDurationMs} from '../charts/schema';
import {compileChartPart} from './parts.mjs';
import {chordChangesForChart,chartForInstrument} from './chordChanges.mjs';
it('recovers every Drivers License melody measure on the full piano timeline',()=>{
 const chart=parseChart(drivers),melody=chart.tracks[0];
 expect(melody.id).toBe('drivers-pdf-melody');expect(new Set(melody.events.map(e=>e.measure)).size).toBe(70);
 expect(melody.events.filter(e=>e.tuplet===3)).toHaveLength(90);
 for(const instrument of ['recorder','bass','drums','piano','guitar']){
  const notes=compileChartPart(chart,instrument);
  expect(notes.some(n=>n.timeMs>220000)).toBe(true);
  expect(Math.max(...notes.map(n=>n.timeMs+n.durationMs))).toBeCloseTo(getChartDurationMs(chart),-1);
 }
});
it('aligns Moana tempo, final key lift and song end across guitar and melody',()=>{
 const chart=parseChart(moana);expect(chart.tempoMap[0].bpm).toBe(90);
 const guitar=chartForInstrument(chart,'guitar');
 const lift=chordChangesForChart(guitar).find(c=>c.chord==='C#')!;
 expect(Math.abs(lift.timeMs-chart.keySignatures[1].timeMs)).toBeLessThan(1);
 const notes=compileChartPart(guitar,'guitar');
 expect(Math.abs(Math.max(...notes.map(n=>n.timeMs+n.durationMs))-getChartDurationMs(chart))).toBeLessThan(1);
});
