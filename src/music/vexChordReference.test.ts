import {it,expect} from 'vitest';
import {vexChordReference,vexChordData} from './vexChordReference.mjs';
it('ingests the official demo open chords and both barre-shape families',()=>{
 expect(vexChordReference).toHaveLength(242);
 expect(vexChordReference.find(c=>c.id==='D')?.chord).toContainEqual([1,2,2]);
 expect(vexChordReference.some(c=>c.id==='F13 (E shape)')).toBe(true);
 expect(vexChordReference.some(c=>c.id==='C#7b9 (A shape)')).toBe(true);
 for(const chord of vexChordReference){expect(chord.frets).toHaveLength(6);expect(chord.frets.some(f=>f>=0)).toBe(true);expect(vexChordData(chord)).toHaveProperty('barres',chord.barres.map(b=>({...b,fret:b.fret+(chord.position===2?1:0)})));}
});

it('includes fret one for position two without changing the sounding fingering',()=>{
 const chord=vexChordReference.find(c=>c.id==='F# (E shape)')!;
 expect(chord.position).toBe(2);
 const data=vexChordData(chord) as {position:number;chord:[number,number|string][];barres:{fret:number}[]};
 expect(data.position).toBe(0);expect(data.barres[0].fret).toBe(2);
 expect(data.chord).toContainEqual([3,3]);
 expect((vexChordData(vexChordReference.find(c=>c.id==='G (E shape)')!) as {position:number}).position).toBe(3);
});
