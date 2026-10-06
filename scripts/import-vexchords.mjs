import {readFileSync,writeFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
// Pinned upstream demo: https://github.com/0xfe/vexchords/blob/master/static/demo.html
// Retain its MIT license alongside the source. No network needed to rebuild.
const source=readFileSync(new URL('../src/music/vendor/vexchords/demo.html',import.meta.url),'utf8');
const expression=source.match(/const chordChart = ([\s\S]*?);\s*const chords/)[1];
const sections=runInNewContext(expression,Object.create(null),{timeout:1000});
const {build}=await import('../src/music/vendor/vexchords/builder.mjs');
for(const form of ['E','A']) {
 const keys=source.match(new RegExp("var keys_"+form+" = (\\[[^;]+\\]);"))[1];
 const shapes=source.match(new RegExp("var shapes_"+form+" = (\\[[^;]+\\]);"))[1];
 for(const key of runInNewContext(keys))sections.push({section:`${key} Chords (${form} Shape)`,description:`Official VexChords ${form}-shape barre voicings.`,chords:runInNewContext(shapes).map(shape=>({...build(key,form,shape),form}))});
}
writeFileSync(new URL('../src/music/vendor/vexchords/chords.json',import.meta.url),JSON.stringify(sections,null,2)+'\n');
console.log(`Ingested ${sections.reduce((n,s)=>n+s.chords.length,0)} official VexChords demo shapes`);
