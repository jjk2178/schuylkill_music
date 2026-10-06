import sys,json,math,collections
import pymupdf
from pathlib import Path
import hashlib
ROOT=Path(__file__).resolve().parents[1]
SOURCE=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'public/user-songs/sources/drivers-license-reference-score.pdf'
D=pymupdf.open(SOURCE)
allrecords=[]; failures=[];measurebase=0;allcurves=[]

def ishead(d):
 r=d['rect'];return (len(d['items'])==8 and ((6.9<r.width<7.2 and 5.4<r.height<5.8) or ('--melody' in sys.argv and 5.2<r.width<5.35 and 4.15<r.height<4.3)) and all(it[0]=='c' for it in d['items'])) or (len(d['items']) in [15,17] and ((7<r.width<9.1 and 5.3<r.height<6.1) or ("--melody" in sys.argv and 5.3<r.width<5.5 and 4.3<r.height<4.6)))

for pi,p in enumerate(D):
 ds=p.get_drawings(); lines=[d['rect'] for d in ds if len(d['items'])==1 and d['items'][0][0]=='re' and abs(d['rect'].height-.54)<.03 and d['rect'].width>50]
 ys=sorted(set(round(r.y0,2) for r in lines));staves=[];i=0
 while i<len(ys):
  if i+4<len(ys) and all(abs(ys[i+j]-ys[i]-j*5.4)<.03 for j in range(5)):
   staves.append(ys[i]);i+=5
  else:i+=1
 assert len(staves)%3==0,(pi,staves)
 assigned={t:[] for t in staves};current=None
 for d in ds:
  r=d['rect']
  if len(d['items'])==1 and d['items'][0][0]=='re' and abs(r.height-.54)<.03 and r.width>50:
   current=min(staves,key=lambda t:abs((r.y0)-(t+10.8)))
  if current is not None:assigned[current].append(d)
 for si in range(0,len(staves),3):
  top=staves[si];segments=sorted(set((round(r.x0,2),round(r.x1,2)) for r in lines if abs(r.y0-top)<.03));
  systemstart=measurebase
  for staffindex,st in enumerate(staves[si:si+3]):
   if staffindex==0 and "--melody" not in sys.argv:continue
   bottom=st+21.6
   region=assigned[st]
   heads=[d for d in region if ishead(d)]
   beams=[d['rect'] for d in region if len(d['items'])==4 and all(it[0]=='l' for it in d['items']) and d['rect'].width>5 and 1.5<d['rect'].height<14]
   stems=[d['rect'] for d in region if len(d['items'])==1 and d['items'][0][0]=='re' and .6<d['rect'].width<1.1 and d['rect'].height>10]
   dots=[d['rect'] for d in region if len(d['items'])==4 and all(it[0]=='c' for it in d['items']) and 1.9<d['rect'].width<2.2 and 1.9<d['rect'].height<2.2]
   for d in region:
    if len(d['items'])==4 and all(it[0]=='c' for it in d['items']) and d['rect'].width>4:
     a=d['items'][0][1];b=d['items'][1][-1]
     allcurves.append({'page':pi+1,'system':si//3,'staff':staffindex,'left':(a.x,a.y),'right':(b.x,b.y),'staffLeft':segments[0][0],'staffRight':segments[-1][1]})
   items=[]
   for h in heads:
    r=h['rect'];x=(r.x0+r.x1)/2;y=(r.y0+r.y1)/2
    candidates=[s for s in stems if min(abs(s.x0-r.x0),abs(s.x1-r.x1))<1.3 and s.y0-4<y<s.y1+4]
    stem=min(candidates,key=lambda s:min(abs(s.x0-r.x0),abs(s.x1-r.x1))) if candidates else None
    if len(h['items'])!=8:duration=2 if stem else 4
    else:
     levels=0
     if stem:
      sy=stem.y0 if abs(stem.x1-r.x1)<abs(stem.x0-r.x0) else stem.y1
      levels=sum(b.x0-1.2<=stem.x1<=b.x1+1.2 and min(abs(b.y0-sy),abs(b.y1-sy))<11 for b in beams)
      flags=[d for d in region if len(d['items']) in [16,26] and 5<d['rect'].width<7 and 15<d['rect'].height<19 and abs(d['rect'].x0-stem.x0)<3 and min(abs(d['rect'].y0-sy),abs(d['rect'].y1-sy))<2]
      if flags:levels=max(levels,2 if len(flags[0]['items'])==26 else 1)
     duration=1/(2**levels)
    if any(x+4<d.x0<x+13 and abs((d.y0+d.y1)/2-y)<3.1 for d in dots):duration*=1.5
    base=(4*7+2) if staffindex<2 else (2*7+4)
    step=round((bottom-y)/2.7)
    ordinal=base+step;octave,letter=divmod(ordinal,7);pc=[0,2,4,5,7,9,11][letter]
    if letter in [2,6]:pc-=1
    midi=(octave+1)*12+pc
    items.append({'x':x,'y':y,'duration':duration,'midi':midi,'kind':'note','headWidth':r.width,'stem':('up' if stem and abs(stem.x1-r.x1)<abs(stem.x0-r.x0) else 'down') if stem else None})
   for d in region:
    r=d['rect'];n=len(d['items']);duration=None
    if (n==14 and 5.5<r.width<5.75 and 9.9<r.height<10.2):duration=.5
    if (n==20 and 5.5<r.width<5.75 and 16.2<r.height<16.6):duration=1
    if (n==25 and 7<r.width<7.4 and 15.2<r.height<15.6):duration=.25
    if n==4 and all(it[0]=='l' for it in d['items']) and 6.80<r.width<6.86 and abs(r.height-2.7)<.05:
     duration=4 if abs(r.y0-(st+5.4))<.1 else 2
    if duration:
     x=(r.x0+r.x1)/2;y=(r.y0+r.y1)/2
     if any(r.x1+1<dot.x0<r.x1+8 and r.y0-4<dot.y0<r.y1+4 for dot in dots):duration*=1.5
     items.append({'x':x,'y':y,'duration':duration,'midi':None,'kind':'rest'})
   for mi,(left,right) in enumerate(segments):
    values=sorted([v for v in items if left+2<v['x']<right-1],key=lambda v:v['x'])
    buckets=[]
    for v in values:
     if buckets and abs(buckets[-1]['x']-v['x'])<2:
      buckets[-1]['notes'].append(v);buckets[-1]['duration']=min(buckets[-1]['duration'],v['duration'])
     else:buckets.append({'x':v['x'],'duration':v['duration'],'notes':[v]})
    if staffindex==0:
     # Whole-measure rest fills the two-quarter opening pickup.
     if systemstart+mi==0 and len(buckets)==1 and buckets[0]['notes'][0]['kind']=='rest':
      buckets[0]['duration']=2;buckets[0]['notes'][0]['duration']=2
     # Explicit eighth-note triplet groups in the supplied violin melody.
     triplet_count=12 if systemstart+mi+1 in [22,24,39,41,65,67] else 9 if systemstart+mi+1 in [29,69] else 0
     for b in buckets[:triplet_count]:
      b['duration']*=2/3
      for n in b['notes']:n['duration']*=2/3;n['tuplet']=True
    total=sum(b['duration'] for b in buckets)
    expected=2 if systemstart+mi==0 else 4
    if abs(total-expected)>.01:failures.append({'page':pi+1,'system':si//3,'staff':staffindex,'measure':systemstart+mi+1,'sum':total,'left':left,'right':right,'buckets':buckets})
    cursor=0
    for b in buckets:
     for v in b['notes']:
      v.update({'quarter':(0 if systemstart+mi==0 else 2+(systemstart+mi-1)*4)+cursor,'staff':staffindex,'measure':systemstart+mi+1,'page':pi+1,'system':si//3});allrecords.append(v)
     cursor+=b['duration']
  measurebase+=len(segments)

assert measurebase==70, f'Expected 70 measures, found {measurebase}'
if failures:
 Path('/tmp/drivers-measure-failures.json').write_text(json.dumps(failures))
 raise AssertionError([(f['page'],f['measure'],f['staff'],f['sum']) for f in failures])
notes=[v for v in allrecords if v['kind']=='note']
assert len([n for n in notes if n['staff']>0])==1216, 'Piano note count mismatch'
# Resolve ties only between identical pitches whose sounding durations touch.
# Curves at a system edge must have a matching incoming curve in the next system.
def near(note,point,side):
 offset=6.3 if note['headWidth']>8 else .675
 return abs(point[0]-(note['x']+offset*side))<2.5 and abs(point[1]-note['y'])<5
for curve in allcurves:
 local=[n for n in notes if all(n[k]==curve[k] for k in ('page','system','staff'))]
 left=[n for n in local if near(n,curve['left'],1)]
 right=[n for n in local if near(n,curve['right'],-1)]
 pairs=[(a,b) for a in left for b in right if a['midi']==b['midi'] and abs(a['quarter']+a['duration']-b['quarter'])<.001]
 if pairs:
  a,b=min(pairs,key=lambda pair:abs(pair[0]['y']-curve['left'][1])+abs(pair[1]['y']-curve['right'][1]))
  a['tieNext']=True;b['tiePrevious']=True
 else:
  if abs(curve['right'][0]-curve['staffRight'])<2:
   for n in left:n['edgeOut']=True
  if abs(curve['left'][0]-curve['staffLeft'])<20:
   for n in right:n['edgeIn']=True
for a in notes:
 if not a.get('edgeOut'):continue
 candidates=[b for b in notes if b.get('edgeIn') and b['staff']==a['staff'] and b['midi']==a['midi'] and abs(a['quarter']+a['duration']-b['quarter'])<.001]
 if candidates:a['tieNext']=True;candidates[0]['tiePrevious']=True
# Preserve polyphonic rhythms, staff assignments, and original pitch registers.
groups=collections.defaultdict(list)
for n in allrecords:groups[(n['staff'],n['quarter'],n['duration'],n.get('stem'))].append(n)
tracks=[]
for staff,label in ([(0,'Melody')] if '--melody' in sys.argv else [])+[(1,'Right hand'),(2,'Left hand')]:
 events=[]
 for (st,q,dur,stem),members in sorted(groups.items(),key=lambda item:(item[0][1],-item[0][2],item[0][0])):
  if st!=staff:continue
  pitches=sorted(set(n['midi'] for n in members if n['midi'] is not None))
  assert len(pitches)<=4
  events.append({'id':f'drivers-pdf-{staff}-{len(events)+1}','timeMs':round(q*60000/72,6),'durationMs':round(dur*60000/72,6),'strings':[],
   'tuplet':3 if members[0].get('tuplet') else None,'staff':'treble' if staff<2 else 'bass','voice':2 if stem=='down' else 1,'stemDirection':stem,'measure':members[0]['measure'],
   'tieNext':sorted(set(n['midi'] for n in members if n.get('tieNext'))),'tiePrevious':sorted(set(n['midi'] for n in members if n.get('tiePrevious'))),
   'expected':{'kind':'rest' if not pitches else 'chord' if len(pitches)>1 else 'note','midi':pitches,'toleranceCents':70,'timingWindowMs':{'early':180,'late':200}}})
 tracks.append({'id':f'drivers-pdf-piano-{staff}','name':f'Piano — {label}','instrument':'piano','clef':'treble' if staff==1 else 'bass','role':'piano-accompaniment','events':events})
chart_path=ROOT/'public/user-songs/olivia-rodrigo-drivers-license-purchased.json'
chart=json.loads(chart_path.read_text())
if '--melody' in sys.argv:
 melody=tracks.pop(0);melody.update({'id':'drivers-pdf-melody','name':'Full score melody','instrument':'vocals','clef':'treble'});melody.pop('role',None)
 chart['tracks']=[melody]+[t for t in chart['tracks'] if t.get('role')!='piano-accompaniment' and t['id']!='drivers-pdf-melody']+tracks
else:chart['tracks']=[t for t in chart['tracks'] if t.get('role')!='piano-accompaniment']+tracks
chart['tempoMap']=[{'timeMs':0,'bpm':72}]
# The PDF opens with a two-beat pickup, then 4/4 at q=72.
chart['timeSignatures']=[{'timeMs':0,'beats':4,'beatUnit':4}]
chart['pickupQuarters']=2
chart['assets']['sourceUrl']='/user-songs/sources/drivers-license-reference-score.pdf'
chart['assets']['license']='User-supplied score reference; no open license claimed'
chart_path.write_text(json.dumps(chart,indent=2)+'\n')
provenance={'source':str(SOURCE),'sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'method':'Vector glyph recovery, full melody and piano' if '--melody' in sys.argv else 'Vector glyph recovery, piano staves only','pages':len(D),'measures':70,'pianoNoteheads':len([n for n in notes if n['staff']>0]),'eventsByHand':[len(t['events']) for t in tracks],'tiedNotes':sum(bool(n.get('tieNext')) for n in notes),'durationMs':round(278*60000/72,6),'validation':'All 210 melody and piano measures pass duration checks; explicit triplets and reduced-size cue chords preserved' if '--melody' in sys.argv else 'All 140 piano staff measures pass duration checks','melody':'Full supplied score melody recovered and validated' if '--melody' in sys.argv else 'Previous encoded reference retained'}
(ROOT/'public/user-songs/sources/drivers-license-piano-recovery.json').write_text(json.dumps(provenance,indent=2)+'\n')
print(json.dumps(provenance,indent=2))
