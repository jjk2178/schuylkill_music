export type RecorderFingering = {midi:number;holes:string[];coverBell:boolean};
export function recorderFingering(midi:number):RecorderFingering|null;
export function recorderFingeringSvg(midi:number, options?:{width?:number;height?:number;labels?:boolean}):string;
