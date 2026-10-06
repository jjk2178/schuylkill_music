// Interpolate through the renderer's actual note positions, including spacing
// adjustments, rather than assuming evenly spaced notes.
export function scoreTimeX(timeMs:number,startMs:number,endMs:number,left:number,right:number,positions:[number,number][]):number {
 const points=[...new Map([[startMs,left],...positions,[endMs,right]]).entries()].sort((a,b)=>a[0]-b[0]);
 const time=Math.max(startMs,Math.min(endMs,timeMs));
 for(let i=1;i<points.length;i++) {
  const [a,x]=points[i-1], [b,y]=points[i];
  if(time<=b)return x+(time-a)/Math.max(1,b-a)*(y-x);
 }
 return right;
}
export function scoreSystemIndex(timeMs:number,ranges:{startMs:number;endMs:number}[]):number {
 // During a rest between systems, keep the cursor at the previous line's end.
 let selected=0;
 for(let i=0;i<ranges.length;i++)if(timeMs>=ranges[i].startMs)selected=i;
 return selected;
}
