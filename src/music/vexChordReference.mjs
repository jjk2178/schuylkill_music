import sections from './vendor/vexchords/chords.json' with {type:'json'};
import {guitarChords} from './guitarChords.mjs';
export const vexChordReference = sections.flatMap(section=>section.chords.map(shape=>{
 const id=shape.name.replace(' Major','').replace(' Minor','m').replace('Maj7','maj7').replace('Maj','')+(shape.form?` (${shape.form} shape)`: '');
 const position=shape.position || 1;
 // Unspecified strings are silent unless covered by a barre.
 const frets=Array(6).fill(-1);
 shape={...shape,barres:shape.barres??[]};
 for(const b of shape.barres)for(let string=b.toString;string<=b.fromString;string++)frets[6-string]=b.fret+position-1;
 for(const [string,fret] of shape.chord)frets[6-string]=fret==='x'?-1:fret===0?0:fret+position-1;
 return {...shape,id,position,frets,pitchClasses:[...new Set(frets.flatMap((f,i)=>f<0?[]:[([40,45,50,55,59,64][i]+f)%12]))]};
}));
export const printableChordReference=[...vexChordReference.filter(c=>!c.form),...guitarChords.filter(c=>!vexChordReference.some(v=>!v.form && v.id===c.id))];
export const guitarChordReference=[...vexChordReference,...guitarChords.filter(c=>!vexChordReference.some(v=>v.id===c.id))];
// One VexChords drawing contract for React, website score pages, and PDFs.
export function vexChordData(chord) {
 const offset=chord.position===2?1:0;
 return {chord:chord.chord.map(([string,fret,...label])=>[string,typeof fret==='number' && fret>0?fret+offset:fret,...label]),position:chord.position>=3?chord.position:0,barres:chord.barres.map(b=>({...b,fret:b.fret+offset})),tuning:['E','A','D','G','B','E']};
}
export function vexChordOptions(small=false) {
 return {width:small?80:130,height:small?96:150,showTuning:!small,defaultColor:'#444',bgColor:'transparent'};
}
