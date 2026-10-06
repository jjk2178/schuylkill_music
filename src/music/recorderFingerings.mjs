// Transcribed from the user-provided American Recorder Society Baroque chart.
// Written C4–Eb6; same physical shapes for C soprano and C tenor.
// 0 = thumb; 1–3 left hand; 4–7 right hand; 6 and 7 are double holes.
// c covered, o open, h outer member covered, v vented thumb.
const rows = [
 'cccccccc','ccccccch','ccccccco','ccccccho','ccccccoo','cccccocc','ccccocco','ccccoooo',
 'cccoccho','cccooooo','ccoccooo','ccoooooo','cocooooo','occooooo','oocooooo','ooccccco',
 'vcccccho','vccccoco','vcccocoo','vcccoooo','vccocooo','vccooooo','vccoocch','vccoccoo',
 'vcooccoo','vcoccocc','vcoccocc','voccocco',
];
export function recorderFingering(midi) {
 const pattern=rows[midi-60];
 return pattern ? { midi, holes:[...pattern], coverBell:midi===85 } : null;
}
export function recorderFingeringSvg(midi, {width=24,height=82,labels=false}={}) {
 const fingering=recorderFingering(midi);
 if(!fingering)return '<span class="recorder-unavailable">?</span>';
 const circle=(x,y,r,closed)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${closed?'#111':'white'}" stroke="#111" stroke-width=".8"/>`;
 const holes=fingering.holes.map((state,i)=>{
  const y=[7,21,29,37,49,57,65,75][i];
  if(i>=6)return circle(10,y,2.5,state==='c'||state==='h')+circle(16,y,2.5,state==='c');
  const base=circle(13,y,3.2,state==='c'||state==='v');
  return base+(state==='v'?`<path d="M9.9 ${y-.8} Q13 ${y-4.2} 16.1 ${y-.8}" fill="white" stroke="none"/>`:'')+(labels?`<text x="3" y="${y+2}" font-size="5">${i}</text>`:'');
 }).join('');
 const description=fingering.holes.map((s,i)=>`${i}: ${({c:'covered',o:'open',h:'outer hole covered',v:'thumb slightly open'})[s]}`).join('; ');
 return `<svg class="recorder-fingering-svg" width="${width}" height="${height}" viewBox="0 0 26 84" role="img" aria-label="Baroque recorder ${description}${fingering.coverBell?'; cover bell':''}"><path d="M6 16 H4 V40 H6 M6 44 H4 V79 H6" stroke="#999" stroke-width=".6" fill="none"/>${holes}${fingering.coverBell?'<text x="21" y="80" font-size="8">*</text>':''}</svg>`;
}
