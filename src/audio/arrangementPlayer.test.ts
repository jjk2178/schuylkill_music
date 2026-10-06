import {beforeEach,describe,expect,it,vi} from 'vitest';
import {ArrangementAudioPlayer} from './arrangementPlayer';
import {demoChart} from '../charts/demoChart';

describe('compiled score audio clock',()=>{
 let context:any;
 const nodes:any[]=[];
 beforeEach(()=>{
  nodes.length=0;
  context={currentTime:10,destination:{},resume:vi.fn().mockResolvedValue(undefined),close:vi.fn().mockResolvedValue(undefined),createOscillator:()=>{const node={frequency:{setValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn()},connect:vi.fn().mockReturnThis(),start:vi.fn(),stop:vi.fn()};nodes.push(node);return node;},createGain:()=>({gain:{setValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn(),cancelScheduledValues:vi.fn()},connect:vi.fn().mockReturnThis()})};
  vi.stubGlobal('AudioContext',class{constructor(){return context;}});
 });
 it('plays only the supplied compiled notes and reports audio time',async()=>{
  const chart={...demoChart,instrument:'flute' as const,tracks:[{...demoChart.tracks[0],events:[{...demoChart.tracks[0].events[0],timeMs:0,durationMs:1000,expected:{...demoChart.tracks[0].events[0].expected,midi:[69]}}]}]};
  const player=new ArrangementAudioPlayer();await player.start(chart,0,true);
  expect(nodes).toHaveLength(1);expect(nodes[0].frequency.setValueAtTime).toHaveBeenCalledWith(440,10.04);
  expect(player.getPlaybackTimeMs()).toBe(0);context.currentTime=10.54;expect(player.getPlaybackTimeMs()).toBeCloseTo(500);
  player.stop();expect(nodes[0].stop).toHaveBeenCalled();expect(player.getPlaybackTimeMs()).toBeNull();player.dispose();
 });
 it('cancels a pending start when the selected score changes',async()=>{
  const player=new ArrangementAudioPlayer();await player.start(demoChart,0,true,()=>false);
  expect(nodes).toHaveLength(0);expect(player.getPlaybackTimeMs()).toBeNull();player.dispose();
 });
 it('does not replay a note that ended exactly at the seek position',async()=>{
  const event={...demoChart.tracks[0].events[0],timeMs:0,durationMs:100};
  const chart={...demoChart,tracks:[{...demoChart.tracks[0],events:[event]}]};
  const player=new ArrangementAudioPlayer();await player.start(chart,100,true);expect(nodes).toHaveLength(0);player.dispose();
 });
});
