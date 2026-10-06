import {describe,it,expect} from 'vitest';
import drivers from '../../public/user-songs/olivia-rodrigo-drivers-license-purchased.json';
import moana from '../../public/user-songs/how-far-ill-go.json';
import {parseChart} from '../charts/schema';
import {compileChartPart} from './parts.mjs';
import {compilePracticeChart} from './practice';
import {chordChangesForChart,guitarChordForChart} from './chordChanges.mjs';
describe('supplied guitar chord sheets',()=>{
 for(const [source,capo,count,first] of [[drivers,3,68,'G'],[moana,4,51,'C5']] as const) {
 it(`preserves ${source.title} chords and capo while sounding concert pitches`,()=>{
 const chart=parseChart(source),changes=chordChangesForChart(chart);
 expect(changes).toHaveLength(count);expect(changes[0].chord).toBe(first);
 const notes=compileChartPart(chart,'guitar'),shape=guitarChordForChart(chart,first)!;
 expect(notes[0].midi).toEqual(shape.frets.flatMap((f,i)=>f<0?[]:[[40,45,50,55,59,64][i]+f+capo]));
 const practice=compilePracticeChart(chart,'guitar');expect(practice.capo).toBe(capo);
 expect(practice.tracks[0].events[0].strings).toHaveLength(shape.frets.filter(f=>f>=0).length);
 expect(practice.tracks[0].events.map(e=>e.expected.midi)).toEqual(notes.map(n=>n.midi));
 for(const change of changes)expect(guitarChordForChart(chart,change.chord)).toBeDefined();
 });
 }
 it('keeps the final modulation and extended chords',()=>{
 expect(chordChangesForChart(parseChart(moana)).slice(-4).map(c=>c.chord)).toEqual(['E','C#m','A#m7b5','Ab']);
 expect(chordChangesForChart(parseChart(drivers)).at(-1)?.chord).toBe('Em7');
 });
});
