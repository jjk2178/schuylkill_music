import {it,expect} from 'vitest';
import drivers from '../../public/user-songs/olivia-rodrigo-drivers-license-purchased.json';
import moana from '../../public/user-songs/how-far-ill-go.json';
import {parseChart} from '../charts/schema';
import {chartForInstrument,chordChangesForChart} from './chordChanges.mjs';
import {guitarStrumsForChart} from './guitarStrums.mjs';
it('repeats the held chord for every eighth-note downstroke and honors bridge skips',()=>{
 const chart=chartForInstrument(parseChart(drivers),'guitar');
 const strums=guitarStrumsForChart(chart,231666.67);
 const first=strums.filter(s=>s.timeMs>=1666.66&&s.timeMs<8333.32);
 expect(first).toHaveLength(16);expect(first.every(s=>s.chord==='G'&&s.direction==='D')).toBe(true);
 const bridge=chordChangesForChart(chart).find(c=>(c as {section?:string}).section==='Bridge 1')!;
 expect(strums.filter(s=>s.timeMs>=bridge.timeMs-.01&&s.timeMs<bridge.timeMs+3333.32).map(s=>s.direction)).toEqual(['D','–','D','D','D','–','D','D']);
});
it('repeats Moana chords only at played sixteenth-note slots',()=>{
 const chart=chartForInstrument(parseChart(moana),'guitar');const bar=guitarStrumsForChart(chart,2666.6667);
 expect(bar).toHaveLength(16);expect(bar.filter(s=>s.chord)).toHaveLength(11);
 expect(bar.filter(s=>s.chord).every(s=>s.chord==='C5')).toBe(true);
 expect(bar.filter(s=>s.direction==='–').every(s=>s.chord===undefined)).toBe(true);
});
