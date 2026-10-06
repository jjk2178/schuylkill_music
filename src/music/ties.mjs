export function staffTieLinks(notes) {
 const links=[];
 notes.forEach((note,index)=>{
  for(const pitch of note.tiePrevious??[]) {
   const prior=notes.findIndex(n=>(n.tieNext??[]).includes(pitch)&&n.midi.includes(pitch)&&Math.abs(n.timeMs+n.durationMs-note.timeMs)<1);
   links.push({from:prior<0?null:prior,to:index,fromIndices:[prior<0?0:notes[prior].midi.indexOf(pitch)],toIndices:[note.midi.indexOf(pitch)]});
  }
  for(const pitch of note.tieNext??[]) {
   const next=notes.findIndex(n=>(n.tiePrevious??[]).includes(pitch)&&n.midi.includes(pitch)&&Math.abs(note.timeMs+note.durationMs-n.timeMs)<1);
   if(next<0)links.push({from:index,to:null,fromIndices:[note.midi.indexOf(pitch)],toIndices:[0]});
  }
 });
 return links;
}
export function soundingNotes(notes) {
 const result=[],tails=new Map();
 for(const note of [...notes].sort((a,b)=>a.timeMs-b.timeMs))for(const pitch of note.midi) {
  const key=`${note.staff??''}:${pitch}`,prior=tails.get(key);
  if((note.tiePrevious??[]).includes(pitch)&&prior&&(prior.tieNext??[]).includes(pitch)&&Math.abs(prior.timeMs+prior.durationMs-note.timeMs)<1) {
   prior.durationMs=note.timeMs+note.durationMs-prior.timeMs;prior.tieNext=note.tieNext;
  }else {
   const sound={...note,midi:[pitch]};result.push(sound);tails.set(key,sound);
  }
 }
 return result;
}
