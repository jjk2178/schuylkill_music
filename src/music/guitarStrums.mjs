import {chordChangesForChart} from './chordChanges.mjs';
import {measureBoundaries,meterAt,tempoAt} from './measures.mjs';
// Source sheets specify a repeating pattern, while chord durations are practice timing.
export function guitarStrumsForChart(chart,endMs) {
 const changes=chordChangesForChart(chart), a=chart.guitarArrangement;
 const bars=measureBoundaries(chart,endMs).filter(t=>t<endMs-.01);bars.push(endMs);
 return bars.slice(0,-1).flatMap((start,index)=>{
   const quarter=60000/tempoAt(chart,start),meter=meterAt(chart,start),length=meter.beats*4/meter.beatUnit;
   const initial=changes.filter(c=>c.timeMs<=start+.01).at(-1);
   const pattern=a?.strumming.find(p=>/bridge/i.test(p.label)&&/bridge/i.test(initial?.section??''))??a?.strumming[0];
   const tokens=pattern?.pattern.split(/\s+/)??Array(meter.beats).fill('D');
   const step=length/tokens.length;
   const result=[];
   for(let slot=0;start+slot*step*quarter<bars[index+1]-.01;slot++){
     const timeMs=start+slot*step*quarter, change=changes.filter(c=>c.timeMs<=timeMs+.01).at(-1),direction=tokens[slot%tokens.length];
     result.push({timeMs,chord:direction==='D'||direction==='U'?change?.chord:undefined,direction:change?direction:"–",beat:1+slot*step,bar:index+1});
   }
   return result;
 });
}
