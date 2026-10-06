type Note={timeMs:number;durationMs:number;midi:number[];staff?:string;tieNext?:number[];tiePrevious?:number[]};
export function soundingNotes(notes:Note[]):Note[];
export function staffTieLinks(notes:Note[]):{from:number|null;to:number|null;fromIndices:number[];toIndices:number[]}[];
