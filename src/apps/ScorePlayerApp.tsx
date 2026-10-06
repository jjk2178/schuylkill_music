import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrangementAudioPlayer} from '../audio/arrangementPlayer';
import {parseChart,type Chart} from '../charts/schema';
import {scoreSystemIndex,scoreTimeX} from '../notation/scorePlayback';
import {midiName} from '../arrangements/arranger';
import {writtenPitches} from '../music/parts.mjs';
import '../app/styles.css';

type ScoreEntry={instrument:string;label:string;songId:string;title:string;artist?:string;url:string;chordsUrl?:string;chartUrl:string;durationMs:number};
type Transport='idle'|'playing'|'paused'|'complete';
const formatTime=(ms:number)=>`${Math.floor(ms/60000)}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}`;

export function ScorePlayerApp() {
 const [entries,setEntries]=useState<ScoreEntry[]>([]);
 const [instrument,setInstrument]=useState('trumpet');
 const [songId,setSongId]=useState('');
 const [mode,setMode]=useState('music');
 const [chart,setChart]=useState<Chart|null>(null);
 const [error,setError]=useState('');
 const [ready,setReady]=useState(false);
 const [transport,setTransport]=useState<Transport>('idle');
 const [playhead,setPlayhead]=useState(0);
 const [starting,setStarting]=useState(false);
 const player=useRef(new ArrangementAudioPlayer());
 const frame=useRef<HTMLIFrameElement>(null);
 const request=useRef(0);
 const scrolledSystem=useRef<HTMLElement|null>(null);
 const songs=useMemo(()=>entries.filter(e=>e.instrument===instrument),[entries,instrument]);
 const entry=songs.find(e=>e.songId===songId)??songs[0];
 const instruments=[...new Map(entries.map(e=>[e.instrument,e.label])).entries()];
 const duration=entry?.durationMs??0;
 const url=mode==='chords'&&entry?.chordsUrl?entry.chordsUrl:entry?.url;
 const notes=chart?.tracks[0].events??[];
 const active=notes.find(e=>e.timeMs<=playhead&&e.timeMs+e.durationMs>playhead);

 function stop(next:Transport='paused') {
  request.current++;
  const time=player.current.getPlaybackTimeMs();
  if(time!==null)setPlayhead(Math.min(duration,time));
  player.current.stop();setStarting(false);setTransport(next);
 }
 function seek(time:number) {
  stop();setPlayhead(Math.max(0,Math.min(duration,time)));
 }
 useEffect(()=>{
  const controller=new AbortController();
  fetch('/rendered-scores/index.json',{signal:controller.signal}).then(r=>{if(!r.ok)throw Error('Unable to load rendered scores');return r.json();}).then((data:ScoreEntry[])=>{
   setEntries(data);
   if(!data.some(e=>e.instrument==='trumpet'))setInstrument(data[0]?.instrument??'');
  }).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
  return()=>controller.abort();
 },[]);
 useEffect(()=>{
  request.current++;player.current.stop();setTransport('idle');setPlayhead(0);setChart(null);setReady(false);setStarting(false);setError('');scrolledSystem.current=null;
  if(!entry)return;
  const controller=new AbortController();
  fetch(entry.chartUrl,{signal:controller.signal}).then(r=>{if(!r.ok)throw Error('Unable to load instrument notes');return r.json();}).then(data=>{if(!controller.signal.aborted)setChart(parseChart(data));}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
  return()=>controller.abort();
 },[entry]);
 useEffect(()=>()=>{request.current++;player.current.dispose();},[]);
 useEffect(()=>{
  if(transport!=='playing')return;
  let raf=0;
  const tick=()=>{
   const time=Math.min(duration,player.current.getPlaybackTimeMs()??0);
   setPlayhead(time);
   if(time>=duration){player.current.stop();setTransport('complete');return;}
   raf=requestAnimationFrame(tick);
  };
  raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf);
 },[transport,duration]);
 // Wait until the frame has finished VexFlow rendering before enabling playback.
 useEffect(()=>{
  setReady(false);scrolledSystem.current=null;
  if(!url)return;
  let attempts=0;
  const timer=window.setInterval(()=>{
   const doc=frame.current?.contentDocument;
   if(doc?.documentElement.dataset.vexflowReady==='true'&&frame.current?.contentWindow?.location.pathname===url){setReady(true);clearInterval(timer);}
   else if(++attempts>200){setError('Score rendering did not finish. Reload the page to try again.');clearInterval(timer);}
  },100);
  return()=>clearInterval(timer);
 },[url]);
 useEffect(()=>{
  if(!ready)return;
  const doc=frame.current?.contentDocument;if(!doc)return;
  const systems=Array.from(doc.querySelectorAll<HTMLElement>('.music-system:not(.empty-system)'));
  const staffs=systems.map(s=>s.querySelector<HTMLElement>('.vf-staff, .guitar-strum-grid'));
  const index=scoreSystemIndex(playhead,staffs.map(s=>({startMs:Number(s?.dataset.timeStart??0),endMs:Number(s?.dataset.timeEnd??0)})));
  systems.forEach((system,i)=>{
   let cursor=system.querySelector<HTMLElement>('.score-playhead');
   if(!cursor){cursor=doc.createElement('div');cursor.className='score-playhead';system.append(cursor);}
   cursor.hidden=i!==index;
   const staff=staffs[i];if(i!==index||!staff)return;
   const x=scoreTimeX(playhead,Number(staff.dataset.timeStart),Number(staff.dataset.timeEnd),Number(staff.dataset.activeStart??84),Number(staff.dataset.activeEnd??656),JSON.parse(staff.dataset.positions??'[]'));
   cursor.style.left=`${staff.offsetLeft+x+5}px`;
   if(scrolledSystem.current!==system){const viewport=frame.current?.contentWindow;
    if(viewport)viewport.scrollTo({top:Math.max(0,system.getBoundingClientRect().top+viewport.scrollY-(viewport.innerHeight-system.offsetHeight)/2),behavior:'instant'});
    scrolledSystem.current=system;}
  });
 },[ready,playhead,url]);
 async function play() {
  if(!chart||!ready||starting)return;
  const id=++request.current;setStarting(true);setError('');
  const offset=playhead>=duration?0:playhead;
  try {
   await player.current.start(chart,offset,true,()=>request.current===id);
   if(request.current!==id)return;
   setPlayhead(offset);setTransport('playing');
  }catch(e){setError(e instanceof Error?e.message:'Unable to start audio');}
  finally{if(request.current===id)setStarting(false);}
 }
 function step(direction:number) {
  const next=direction>0?notes.find(e=>e.timeMs>playhead+1):[...notes].reverse().find(e=>e.timeMs<playhead-1);
  seek(next?.timeMs??(direction>0?duration:0));
 }
 return <main className="score-player-shell">
  <header className="score-player-heading"><div><p className="eyebrow">Set list music</p><h1>Score player</h1><p>Browse your instrument part and listen as the red line follows the notes.</p></div><a href="/">Back to app</a></header>
  <section className="score-player-controls" aria-label="Score player controls">
   <label>Instrument<select aria-label="Instrument" value={instrument} onChange={e=>{stop('idle');setInstrument(e.target.value);setSongId('');setMode('music');}}>{instruments.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
   <label>Song<select aria-label="Song" value={entry?.songId??''} onChange={e=>{stop('idle');setSongId(e.target.value);}}>{songs.map(e=><option key={e.songId} value={e.songId}>{e.title}</option>)}</select></label>
   {entry?.chordsUrl&&<label>Guitar score<select aria-label="Guitar score" value={mode} onChange={e=>{stop();setMode(e.target.value);}}><option value="music">Staff + TAB</option><option value="chords">Chords + strumming</option></select></label>}
   <div className="score-player-buttons">
    <button type="button" disabled={!chart||!ready||starting||transport==='playing'} onClick={()=>void play()}>{starting?'Starting…':'Play'}</button>
    <button type="button" disabled={transport!=='playing'} onClick={()=>stop()}>Pause</button>
    <button type="button" disabled={!chart} onClick={()=>{seek(0);setTransport('idle');}}>Reset</button>
    <button type="button" disabled={!chart} onClick={()=>step(-1)}>Previous note</button>
    <button type="button" disabled={!chart} onClick={()=>step(1)}>Next note</button>
   </div>
   <label className="score-player-seek">Position<input aria-label="Playback position" type="range" min="0" max={duration||1} step="1" value={playhead} disabled={!chart} onChange={e=>seek(Number(e.target.value))}/></label>
   <div className="score-player-status" role="status"><span>{!entries.length?'Loading scores…':!chart||!ready?'Loading music…':transport==='complete'?'Finished':transport==='playing'?'Playing':transport==='paused'?'Paused':'Ready'}</span><span>{formatTime(playhead)} / {formatTime(duration)}</span><span>{active?writtenPitches(active.expected.midi,instrument).map(midiName).join(' · '):'Rest'}</span></div>
  </section>
  {instrument==="guitar" && chart?.guitarArrangement && <p>Capo {chart.guitarArrangement.capo} · chord shapes relative to capo · estimated practice timing. <a href={chart.guitarArrangement.sourceUrl} target="_blank" rel="noreferrer">Supplied chord sheet</a></p>}
  {error&&<p role="alert">{error}</p>}
  {!entry&&entries.length>0&&<p>No compiled songs for this instrument.</p>}
  {url&&<iframe key={url} ref={frame} title={`${entry?.title} — ${entry?.label} rendered score`} className="score-player-frame" src={url}/>}
 </main>;
}
