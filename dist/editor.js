import {createDefaultChartData,validateChartData} from './engine.mjs';

const $=id=>document.getElementById(id),TYPES={tap:'タップ',flick:'フリック',hold:'ホールド','flick-hold':'フリックホールド'};
const isHold=n=>n.type==='hold'||n.type==='flick-hold';
export const EDITOR_BASE_PX_PER_MS=.16;
export function editorTimelineHeight(durationMs,zoom){return Math.max(840,40+durationMs*EDITOR_BASE_PX_PER_MS*zoom);}
export function editorCanvasWindow(totalHeight,viewportHeight,scrollTop,shift=0){const total=Math.max(1,totalHeight),viewport=Math.max(1,Math.min(total,viewportHeight||1)),overscan=Math.max(320,viewport),height=Math.min(total,viewport+overscan*2),viewportTop=Math.max(0,Math.min(total-viewport,scrollTop-shift)),top=Math.max(0,Math.min(total-height,viewportTop-overscan));return{top,height,viewportTop,overscan};}
export function editorSettledScrollTop(scrollTop,shift,scrollHeight,clientHeight){return Math.max(0,Math.min(Math.max(0,scrollHeight-clientHeight),scrollTop-shift));}
const sortedBpmChanges=timing=>(Array.isArray(timing?.bpmChanges)?timing.bpmChanges:[]).map(change=>({timeMs:Number(change.timeMs),bpm:Number(change.bpm)})).filter(change=>Number.isFinite(change.timeMs)&&Number.isFinite(change.bpm)).sort((a,b)=>a.timeMs-b.timeMs);
export function bpmAtTime(timing,timeMs=0){let bpm=Number(timing?.bpm)||120;for(const change of sortedBpmChanges(timing)){if(change.timeMs>timeMs)break;bpm=change.bpm;}return bpm;}
export function measureDurationMs(timing,timeMs=0){const [beats=4,beatUnit=4]=timing?.timeSignature||[];return 60000/bpmAtTime(timing,timeMs)*beats*4/beatUnit;}
export function timelineGridTiming(timing,division,timeMs=0){if(!Number.isInteger(division)||division<1)throw new Error('スナップは1以上の整数で指定してください');const measureMs=measureDurationMs(timing,timeMs);return{measureMs,subdivisionMs:measureMs/division};}
export function timelineGridSegments(timing,durationMs,division){if(!Number.isFinite(durationMs)||durationMs<0)throw new Error('譜面の長さが不正です');const changes=sortedBpmChanges(timing).filter(change=>change.timeMs>0&&change.timeMs<durationMs),starts=[{timeMs:0,bpm:Number(timing?.bpm)||120},...changes];return starts.map((start,index)=>{const segmentTiming={...timing,bpm:start.bpm,bpmChanges:[]},grid=timelineGridTiming(segmentTiming,division);return{startMs:start.timeMs,endMs:starts[index+1]?.timeMs??durationMs,bpm:start.bpm,...grid};});}
export function snapToMeasureDivision(value,timing,division,min=0,max=Number.POSITIVE_INFINITY){
  timelineGridTiming(timing,division);const finiteMax=Number.isFinite(max),duration=finiteMax?max:Math.max(value,min,0)+measureDurationMs(timing,value),candidates=[];
  for(const segment of timelineGridSegments(timing,duration,division)){const lower=Math.max(min,segment.startMs),upper=Math.min(max,segment.endMs),unit=segment.subdivisionMs;if(upper<lower)continue;const minIndex=Math.ceil((lower-segment.startMs)/unit-1e-9),maxIndex=Number.isFinite(upper)?Math.floor((upper-segment.startMs)/unit+1e-9):Number.POSITIVE_INFINITY;if(maxIndex<minIndex)continue;const index=Math.max(minIndex,Math.min(maxIndex,Math.round((value-segment.startMs)/unit)));candidates.push(segment.startMs+index*unit);}
  if(!candidates.length)return Math.round(Math.max(min,Math.min(max,value)));return Math.round(candidates.sort((a,b)=>Math.abs(a-value)-Math.abs(b-value)||a-b)[0]);
}
export function snapHoldDuration(startTimeMs,endTimeMs,timing,division,minDuration,maxDuration){const snappedEnd=snapToMeasureDivision(endTimeMs,timing,division,startTimeMs+minDuration,startTimeMs+maxDuration);return snappedEnd-startTimeMs;}
export function laneSpanFromDrag(startLane,endLane){const a=Math.max(0,Math.min(11,Math.trunc(startLane))),b=Math.max(0,Math.min(11,Math.trunc(endLane)));return{lane:Math.min(a,b),width:Math.abs(a-b)+1};}
export function chartAuditionEvents(chart){return chart.notes.flatMap(n=>[{timeMs:n.timeMs,type:n.type,lane:n.lane},...(n.type==='flick-hold'?[{timeMs:n.timeMs+n.durationMs,type:'flick-end',lane:n.endFlick.lane}]:[])]).sort((a,b)=>a.timeMs-b.timeMs);}

export function initEditor({getChart,setChart,onPreview,onAudioFile,onClearAudio,getAudioInfo,onAuditionStart,onAuditionStop,onAuditionHit}){
  const canvas=$('editor-canvas'),ctx=canvas.getContext('2d'),scroll=$('timeline-scroll'),content=$('timeline-content');
  const form=$('note-form'),empty=$('inspector-empty'),json=$('chart-json'),status=$('editor-status');
  const viewport=$('timeline-viewport'),playToggle=$('editor-play-toggle'),playStop=$('editor-play-stop'),playTime=$('editor-play-time');
  let chart=structuredClone(getChart()),selectedId=null,tool='select',snapDivision=16,zoom=1,width=0,ratio=1,renderTop=0,renderHeight=0,scrollFrame=0,initialScrollPending=true,drag=null,placing=null,audition={state:'stopped',timeMs:0,originTimeMs:0,startedAt:0,nextEvent:0,events:[],frame:0};
  const gutter=38,durationMs=()=>chart.metadata.durationMs,timelineHeight=()=>editorTimelineHeight(durationMs(),zoom),pxPerMs=()=>(timelineHeight()-40)/durationMs();

  function noteById(id){return chart.notes.find(n=>n.id===id);}
  function setStatus(message,kind=''){status.textContent=message;status.className=`editor-status ${kind}`;}
  function nextId(){let i=chart.notes.length+1,id;do{id=`note-${String(i++).padStart(3,'0')}`;}while(noteById(id));return id;}
  function syncAudioInfo(){const info=getAudioInfo?.();$('audio-file-info').textContent=info?`${info.fileName} · ${formatMs(info.durationMs)} · このタブのみ`:'内蔵シンセ音源';$('clear-audio-file').hidden=!info;}
  function formatMs(ms){const seconds=Math.max(0,Math.round(ms/1000)),minutes=Math.floor(seconds/60);return `${minutes}:${String(seconds%60).padStart(2,'0')}`;}
  function formatPrecise(ms){const value=Math.max(0,Math.round(ms)),minutes=Math.floor(value/60000),seconds=Math.floor(value/1000)%60;return `${minutes}:${String(seconds).padStart(2,'0')}.${String(value%1000).padStart(3,'0')}`;}
  function renderBpmChanges(){
    const list=$('bpm-change-list'),changes=chart.timing.bpmChanges||[];$('bpm-change-count').textContent=`${changes.length} EVENTS`;list.replaceChildren();
    if(!changes.length){const empty=document.createElement('div');empty.className='bpm-change-empty';empty.textContent='途中のBPM変更はありません';list.append(empty);return;}
    changes.forEach((change,index)=>{const row=document.createElement('div');row.className='bpm-change-row';const timeLabel=document.createElement('label'),timeText=document.createElement('span'),timeInput=document.createElement('input');timeText.textContent='時刻 (ms)';timeInput.type='number';timeInput.min='1';timeInput.max=String(durationMs()-1);timeInput.step='1';timeInput.value=String(change.timeMs);timeInput.setAttribute('aria-label',`BPM変更 ${index+1} の時刻`);timeLabel.append(timeText,timeInput);const bpmLabel=document.createElement('label'),bpmText=document.createElement('span'),bpmInput=document.createElement('input');bpmText.textContent='BPM';bpmInput.type='number';bpmInput.min='20';bpmInput.max='400';bpmInput.step='.01';bpmInput.value=String(change.bpm);bpmInput.setAttribute('aria-label',`BPM変更 ${index+1} のBPM`);bpmLabel.append(bpmText,bpmInput);const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.title=`${change.timeMs}ms のBPM変更を削除`;remove.setAttribute('aria-label',remove.title);timeInput.addEventListener('change',()=>{const next=structuredClone(chart);next.timing.bpmChanges[index].timeMs=Number(timeInput.value);if(!save(next,'BPM変更の時刻を更新しました'))renderBpmChanges();});bpmInput.addEventListener('change',()=>{const next=structuredClone(chart);next.timing.bpmChanges[index].bpm=Number(bpmInput.value);if(!save(next,'BPM変更を更新しました'))renderBpmChanges();});remove.addEventListener('click',()=>{const next=structuredClone(chart);next.timing.bpmChanges.splice(index,1);save(next,`${change.timeMs}ms のBPM変更を削除しました`);});row.append(timeLabel,bpmLabel,remove);list.append(row);});
  }
  function syncJson(){json.value=JSON.stringify(chart,null,2);$('editor-count').textContent=`${chart.notes.length} NOTES`;$('chart-title').value=chart.metadata.title;$('chart-bpm').value=chart.timing.bpm;$('chart-duration').value=chart.metadata.durationMs;$('chart-offset').value=chart.timing.offsetMs;renderBpmChanges();syncAudioInfo();}
  function save(next,message='譜面を更新しました'){
    if(audition.state!=='stopped')stopAudition(false,'');try{const previousDuration=durationMs(),validated=validateChartData(next),stored=setChart(validated);chart=structuredClone(stored||validated);syncJson();renderInspector();if(durationMs()===previousDuration)draw();else resize();setStatus(message,'ok');return true;}
    catch(error){setStatus(error.message,'error');return false;}
  }

  function laneMetrics(){const laneW=(width-gutter)/12;return {laneW,x:lane=>gutter+lane*laneW,y:ms=>timelineHeight()-20-ms*pxPerMs()};}
  function point(event){const rect=canvas.getBoundingClientRect();return{x:(event.clientX-rect.left)*width/rect.width,y:renderTop+(event.clientY-rect.top)*renderHeight/rect.height};}
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const pointTime=py=>(timelineHeight()-20-py)/pxPerMs();
  const snapTime=(value,min=0,max=durationMs())=>snapToMeasureDivision(value,chart.timing,snapDivision,min,max);
  const laneAt=px=>{const {laneW}=laneMetrics();return clamp(Math.floor((px-gutter)/laneW),0,11);};
  function connectedIds(id){const ids=new Set([id]);let changed=true;while(changed){changed=false;for(const n of chart.notes){if((ids.has(n.id)&&n.nextId&&!ids.has(n.nextId))||(n.nextId&&ids.has(n.nextId)&&!ids.has(n.id))){ids.add(n.id);if(n.nextId)ids.add(n.nextId);changed=true;}}}return ids;}
  function downstreamIds(n){const ids=[];let id=n.nextId;while(id){const next=noteById(id);if(!next)break;ids.push(id);id=next.nextId;}return ids;}
  function incoming(n){return chart.notes.find(x=>x.nextId===n.id);}
  function spanOf(n){return n.type==='flick-hold'?n.endFlick:n;}
  function widthLimits(n,endFlick=false){let minLeft=0,maxRight=12,requiredLeft=12,requiredRight=0;const parent=!endFlick&&incoming(n);if(parent){const span=spanOf(parent);minLeft=span.lane;maxRight=span.lane+span.width;}const child=(endFlick||n.type!=='flick-hold')&&n.nextId?noteById(n.nextId):null;if(child){requiredLeft=child.lane;requiredRight=child.lane+child.width;}return{minLeft,maxRight,requiredLeft,requiredRight};}
  function draw(){
    const height=timelineHeight(),{laneW,x,y}=laneMetrics();ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.restore();ctx.fillStyle='#0b121b';ctx.fillRect(0,renderTop,width,renderHeight);
    for(let lane=0;lane<12;lane++){ctx.fillStyle=lane%2?'#101a26':'#0e1722';ctx.fillRect(x(lane),0,laneW,height);ctx.fillStyle='#263545';ctx.fillRect(x(lane),0,1,height);}
    ctx.textAlign='right';ctx.font='11px Barlow Condensed, sans-serif';
    const segments=timelineGridSegments(chart.timing,durationMs(),snapDivision),totalMeasures=segments.reduce((sum,segment)=>sum+Math.ceil((segment.endMs-segment.startMs)/segment.measureMs),0),totalSubdivisions=totalMeasures*snapDivision;
    for(const segment of segments){const measureCount=Math.ceil((segment.endMs-segment.startMs)/segment.measureMs),subdivisionPx=segment.subdivisionMs*pxPerMs(),minorStep=Math.max(1,Math.ceil(1.5/subdivisionPx),Math.ceil(totalSubdivisions/6000));if(minorStep<snapDivision)for(let measure=0;measure<measureCount;measure++)for(let subdivision=minorStep;subdivision<snapDivision;subdivision+=minorStep){const ms=segment.startMs+measure*segment.measureMs+subdivision*segment.subdivisionMs;if(ms>=segment.endMs-1e-7||ms>durationMs()+1e-7)break;ctx.fillStyle='#202e3d';ctx.fillRect(gutter,y(ms),width-gutter,1);}const measurePx=segment.measureMs*pxPerMs(),majorStep=Math.max(1,Math.ceil(1.5/measurePx),Math.ceil(totalMeasures/4000)),labelStep=majorStep*Math.max(1,Math.ceil(30/(measurePx*majorStep)));for(let measure=0;measure<=measureCount;measure+=majorStep){const ms=segment.startMs+measure*segment.measureMs;if(ms>segment.endMs-1e-7&&segment.endMs<durationMs()||ms>durationMs()+1e-7)break;ctx.fillStyle='#3a4859';ctx.fillRect(gutter,y(ms),width-gutter,1.5);if(measure%labelStep===0){const seconds=ms/1000,minutes=Math.floor(seconds/60),within=seconds-minutes*60,label=Number.isInteger(within)?String(within).padStart(2,'0'):within.toFixed(1).padStart(4,'0');ctx.fillStyle='#7f8da0';ctx.fillText(`${minutes}:${label}`,gutter-6,y(ms)+4);}}}
    for(const segment of segments.slice(1)){ctx.fillStyle='#b9f78d';ctx.fillRect(gutter,y(segment.startMs)-1,width-gutter,2);ctx.textAlign='left';ctx.font='600 11px Barlow Condensed, sans-serif';ctx.fillText(`${segment.bpm} BPM`,gutter+6,y(segment.startMs)-5);ctx.textAlign='right';}
    for(const n of chart.notes){if(!n.nextId)continue;const next=noteById(n.nextId);if(!next)continue;const span=n.type==='flick-hold'?n.endFlick:n;ctx.strokeStyle='#b9f78d99';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x(span.lane+span.width/2),y(n.timeMs+n.durationMs));ctx.lineTo(x(next.lane+next.width/2),y(next.timeMs));ctx.stroke();}
    for(const n of chart.notes){
      const nx=x(n.lane)+3,nw=n.width*laneW-6,ny=y(n.timeMs),duration=n.durationMs?Math.max(10,n.durationMs*pxPerMs()):0,endY=isHold(n)?y(n.timeMs+n.durationMs):ny,purple=n.type==='flick'||n.type==='flick-hold';
      if(isHold(n)){ctx.fillStyle=purple?'#b875ff38':'#70dcf838';ctx.fillRect(nx,endY,nw,duration);ctx.strokeStyle=purple?'#b875ffaa':'#70dcf8aa';ctx.strokeRect(nx+.5,endY+.5,nw-1,duration-1);}
      ctx.fillStyle=purple?'#b875ff':isHold(n)?'#70dcf8':'#ff4e64';ctx.fillRect(nx,ny-5,nw,10);
      if(n.type==='flick'){ctx.fillStyle='#ead8ff';ctx.textAlign='center';ctx.font='bold 13px Barlow Condensed, sans-serif';ctx.fillText('‹‹  ››',nx+nw/2,ny-8);}
      if(n.type==='flick-hold'){const f=n.endFlick,fx=x(f.lane)+3,fw=f.width*laneW-6,fy=endY;ctx.fillStyle='#b875ff';ctx.fillRect(fx,fy-5,fw,10);ctx.fillStyle='#ead8ff';ctx.textAlign='center';ctx.font='bold 13px Barlow Condensed, sans-serif';ctx.fillText('‹‹‹  ›››',fx+fw/2,fy-8);}
      if(n.id===selectedId){
        const top=Math.min(ny,endY),midY=(ny+endY)/2;ctx.strokeStyle='#b9f78d';ctx.lineWidth=2;ctx.strokeRect(nx-3,top-9,nw+6,Math.max(18,duration+14));ctx.fillStyle='#b9f78d';ctx.fillRect(nx-7,midY-8,8,16);ctx.fillRect(nx+nw-1,midY-8,8,16);
        if(isHold(n)){const endSpan=n.type==='flick-hold'?n.endFlick:n,ex=x(endSpan.lane)+3,ew=endSpan.width*laneW-6;ctx.fillRect(ex+ew/2-8,endY-4,16,8);if(n.type==='flick-hold'){ctx.fillStyle='#ead8ff';ctx.fillRect(ex-7,endY-8,8,16);ctx.fillRect(ex+ew-1,endY-8,8,16);}}
      }
    }
    if(placing){
      const span=laneSpanFromDrag(placing.startLane,placing.currentLane),nx=x(span.lane)+3,nw=span.width*laneW-6,ny=y(placing.timeMs),hold=isHold({type:placing.type}),duration=hold?Math.max(10,1000*pxPerMs()):0,endY=hold?y(placing.timeMs+1000):ny,purple=placing.type==='flick'||placing.type==='flick-hold';
      ctx.save();ctx.globalAlpha=.78;if(hold){ctx.fillStyle=purple?'#b875ff38':'#70dcf838';ctx.fillRect(nx,endY,nw,duration);ctx.strokeStyle=purple?'#b875ffcc':'#70dcf8cc';ctx.strokeRect(nx+.5,endY+.5,nw-1,duration-1);}ctx.fillStyle=purple?'#b875ff':hold?'#70dcf8':'#ff4e64';ctx.fillRect(nx,ny-5,nw,10);ctx.strokeStyle='#f3ffd9';ctx.setLineDash([5,4]);ctx.strokeRect(nx-.5,ny-7,nw+1,14);ctx.setLineDash([]);if(placing.type==='flick'){ctx.fillStyle='#ead8ff';ctx.textAlign='center';ctx.font='bold 13px Barlow Condensed, sans-serif';ctx.fillText('‹‹  ››',nx+nw/2,ny-8);}if(placing.type==='flick-hold'){ctx.fillStyle='#b875ff';ctx.fillRect(nx,endY-5,nw,10);ctx.fillStyle='#ead8ff';ctx.textAlign='center';ctx.font='bold 13px Barlow Condensed, sans-serif';ctx.fillText('‹‹‹  ›››',nx+nw/2,endY-8);}ctx.restore();
    }
  }

  const auditionShift=()=>Math.round((audition.timeMs-audition.originTimeMs)*pxPerMs());
  function updateCanvasWindow(force=false){const total=timelineHeight(),window=editorCanvasWindow(total,scroll.clientHeight,scroll.scrollTop,auditionShift()),viewBottom=window.viewportTop+Math.max(1,Math.min(total,scroll.clientHeight||1)),inset=window.overscan*.4,sizeChanged=Math.abs(renderHeight-window.height)>.5,topGuard=renderTop<=0?0:renderTop+inset,bottomEdge=renderTop+renderHeight,bottomGuard=bottomEdge>=total?total:bottomEdge-inset;if(!force&&!sizeChanged&&window.viewportTop>=topGuard&&viewBottom<=bottomGuard)return;renderTop=window.top;renderHeight=window.height;content.style.height=`${total}px`;canvas.style.top=`${renderTop}px`;canvas.style.height=`${renderHeight}px`;canvas.width=Math.max(1,Math.round(width*ratio));canvas.height=Math.max(1,Math.round(renderHeight*ratio));ctx.setTransform(ratio,0,0,ratio,0,-renderTop*ratio);draw();}
  function resize(){content.style.height=`${timelineHeight()}px`;width=Math.max(480,scroll.clientWidth);ratio=Math.min(devicePixelRatio||1,2);canvas.style.transform=`translateY(${auditionShift()}px)`;updateCanvasWindow(true);}
  new ResizeObserver(resize).observe(scroll);
  scroll.addEventListener('scroll',()=>{if(scrollFrame)return;scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;updateCanvasWindow();});});

  function syncAuditionUi(){const playing=audition.state==='playing',paused=audition.state==='paused',atEnd=audition.timeMs>=durationMs();playToggle.textContent=playing?'Ⅱ 一時停止':paused?'▶ 続ける':atEnd?'↺ もう一度':audition.timeMs?'▶ ここから再生':'▶ 再生確認';playStop.disabled=audition.state==='stopped';playTime.value=formatPrecise(audition.timeMs);viewport.classList.toggle('auditioning',playing||paused);}
  function applyAuditionTransform(){canvas.style.transform=`translateY(${auditionShift()}px)`;updateCanvasWindow();}
  function resetAuditionPosition(){audition.timeMs=0;audition.originTimeMs=0;audition.nextEvent=0;canvas.style.transform='translateY(0px)';playTime.value=formatPrecise(0);scroll.scrollTop=Math.max(0,scroll.scrollHeight-scroll.clientHeight);updateCanvasWindow(true);}
  function settleAuditionPosition(){scroll.scrollTop=editorSettledScrollTop(scroll.scrollTop,auditionShift(),scroll.scrollHeight,scroll.clientHeight);audition.originTimeMs=audition.timeMs;canvas.style.transform='translateY(0px)';updateCanvasWindow(true);}
  function pauseAudition(message='再生確認を一時停止しました'){if(audition.state!=='playing')return;cancelAnimationFrame(audition.frame);audition.frame=0;audition.state='paused';onAuditionStop?.();syncAuditionUi();setStatus(message);}
  function stopAudition(reset=false,message){if(audition.frame)cancelAnimationFrame(audition.frame);audition.frame=0;if(audition.state==='playing'||audition.state==='paused')onAuditionStop?.();audition.state='stopped';if(reset)resetAuditionPosition();else settleAuditionPosition();syncAuditionUi();if(message) setStatus(message);else if(message===undefined)setStatus(`${formatPrecise(audition.timeMs)} で停止しました。この位置から編集できます`);}
  function auditionFrame(now){if(audition.state!=='playing')return;audition.timeMs=Math.min(durationMs(),now-audition.startedAt);const due=[];while(audition.nextEvent<audition.events.length&&audition.events[audition.nextEvent].timeMs<=audition.timeMs)due.push(audition.events[audition.nextEvent++]);if(due.length)onAuditionHit?.(due);applyAuditionTransform();playTime.value=formatPrecise(audition.timeMs);if(audition.timeMs>=durationMs()){audition.state='stopped';audition.frame=0;onAuditionStop?.(true);settleAuditionPosition();syncAuditionUi();setStatus('譜面の終端まで再生しました。この位置から編集できます','ok');return;}audition.frame=requestAnimationFrame(auditionFrame);}
  async function startAudition(){if(audition.state==='playing'){pauseAudition();return;}if(audition.state==='stopped'){if(audition.timeMs>=durationMs())resetAuditionPosition();else audition.timeMs=clamp(pointTime(scroll.scrollTop+scroll.clientHeight-20),0,durationMs());audition.originTimeMs=audition.timeMs;audition.events=chartAuditionEvents(chart);audition.nextEvent=audition.events.findIndex(event=>event.timeMs>=audition.timeMs);if(audition.nextEvent<0)audition.nextEvent=audition.events.length;}playToggle.disabled=true;try{await onAuditionStart?.(audition.timeMs);}catch(error){setStatus(`再生確認を開始できません: ${error.message}`,'error');playToggle.disabled=false;return;}playToggle.disabled=false;audition.startedAt=performance.now()-audition.timeMs;audition.state='playing';syncAuditionUi();setStatus(`${formatPrecise(audition.timeMs)} から固定ラインで再生確認中です`,'ok');audition.frame=requestAnimationFrame(auditionFrame);}
  playToggle.addEventListener('click',startAudition);playStop.addEventListener('click',()=>stopAudition(false));document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseAudition();});

  function renderInspector(){
    const n=noteById(selectedId);empty.hidden=!!n;form.hidden=!n;$('selected-id').textContent=n?n.id:'未選択';if(!n)return;
    $('note-type').value=n.type;$('note-time').max=durationMs();$('note-time').value=n.timeMs;$('note-duration').max=Math.max(100,durationMs()-n.timeMs);$('note-duration').value=n.durationMs||1000;$('note-lane').value=n.lane+1;$('note-width').value=n.width;
    $('flick-end-fields').hidden=n.type!=='flick-hold';$('next-field').hidden=!isHold(n);$('note-duration').disabled=!isHold(n);
    $('flick-lane').value=(n.endFlick?.lane??n.lane)+1;$('flick-width').value=n.endFlick?.width??n.width;
    const next=$('note-next'),value=n.nextId||'';next.replaceChildren(new Option('なし',''));for(const x of chart.notes.filter(x=>x.id!==n.id&&isHold(x)))next.add(new Option(`${x.id} · ${(x.timeMs/1000).toFixed(2)}s · ${TYPES[x.type]}`,x.id));next.value=value;
  }
  function select(id){selectedId=id;renderInspector();draw();if(id)setStatus(`${id} を選択中`);}

  function hitTest(px,py){const {laneW,x,y}=laneMetrics();return [...chart.notes].reverse().find(n=>{const nx=x(n.lane),nw=n.width*laneW,ny=y(n.timeMs),endY=isHold(n)?y(n.timeMs+n.durationMs):ny,top=Math.min(ny,endY),bottom=Math.max(ny,endY);const body=px>=nx&&px<=nx+nw&&py>=top-10&&py<=bottom+10;if(body)return true;if(n.type==='flick-hold'){const f=n.endFlick,fx=x(f.lane),fw=f.width*laneW;return px>=fx&&px<=fx+fw&&Math.abs(py-endY)<=12;}return false;});}
  function editHandle(n,px,py){
    const {laneW,x,y}=laneMetrics(),left=x(n.lane),right=x(n.lane+n.width),startY=y(n.timeMs),endY=isHold(n)?y(n.timeMs+n.durationMs):startY,top=Math.min(startY,endY),bottom=Math.max(startY,endY),nearY=py>=top-12&&py<=bottom+12;
    if(n.type==='flick-hold'){const f=n.endFlick,fLeft=x(f.lane),fRight=x(f.lane+f.width);if(Math.abs(py-endY)<=13&&Math.abs(px-fLeft)<=9)return'flick-left';if(Math.abs(py-endY)<=13&&Math.abs(px-fRight)<=9)return'flick-right';}
    if(isHold(n)){const span=n.type==='flick-hold'?n.endFlick:n,spanLeft=x(span.lane),spanRight=x(span.lane+span.width);if(Math.abs(py-endY)<=9&&px>=spanLeft&&px<=spanRight)return'duration';}
    if(nearY&&Math.abs(px-left)<=9)return'width-left';if(nearY&&Math.abs(px-right)<=9)return'width-right';return hitTest(px,py)?.id===n.id?'move':null;
  }
  function cursorFor(handle){return handle==='width-left'||handle==='width-right'||handle==='flick-left'||handle==='flick-right'?'ew-resize':handle==='duration'?'ns-resize':handle==='move'?'grab':'default';}
  function previewDrag(px,py){
    const {laneW}=laneMetrics(),next=structuredClone(drag.originChart),n=next.notes.find(x=>x.id===drag.id),origin=drag.originChart.notes.find(x=>x.id===drag.id);if(!n||!origin)return;
    if(drag.mode==='move'){
      const ids=drag.connected,minLane=Math.min(...drag.spans.map(x=>x.lane)),maxLane=Math.max(...drag.spans.map(x=>x.lane+x.width)),minTime=Math.min(...drag.members.map(x=>x.timeMs)),maxTime=Math.max(...drag.members.map(x=>x.timeMs+(x.durationMs||0)));
      const laneDelta=clamp(Math.round((px-drag.startX)/laneW),-minLane,12-maxLane),targetTime=snapTime(origin.timeMs+pointTime(py)-pointTime(drag.startY),origin.timeMs-minTime,origin.timeMs+durationMs()-maxTime),timeDelta=targetTime-origin.timeMs;
      for(const item of next.notes.filter(x=>ids.has(x.id))){item.timeMs+=timeDelta;item.lane+=laneDelta;if(item.endFlick)item.endFlick.lane+=laneDelta;}
    }else if(drag.mode==='duration'){
      const descendants=drag.downstream,currentLatest=Math.max(origin.timeMs+origin.durationMs,...drag.members.filter(x=>descendants.includes(x.id)).map(x=>x.timeMs+(x.durationMs||0))),maxDuration=origin.durationMs+durationMs()-currentLatest,newDuration=snapHoldDuration(origin.timeMs,pointTime(py),chart.timing,snapDivision,100,maxDuration),delta=newDuration-origin.durationMs;n.durationMs=newDuration;for(const item of next.notes.filter(x=>descendants.includes(x.id)))item.timeMs+=delta;
    }else{
      const endFlick=drag.mode.startsWith('flick-'),target=endFlick?n.endFlick:n,originalTarget=endFlick?origin.endFlick:origin,limits=drag.limits,boundary=Math.round((px-gutter)/laneW);
      if(drag.mode.endsWith('left')){const right=originalTarget.lane+originalTarget.width;target.lane=clamp(boundary,limits.minLeft,Math.min(right-1,limits.requiredLeft));target.width=right-target.lane;}
      else{const right=clamp(boundary,Math.max(originalTarget.lane+1,limits.requiredRight),limits.maxRight);target.lane=originalTarget.lane;target.width=right-target.lane;}
    }
    chart=next;drag.moved=drag.moved||Math.hypot(px-drag.startX,py-drag.startY)>3;renderInspector();draw();
  }
  function finishDrag(cancelled=false){
    if(!drag)return;const active=drag,changed=active.moved&&!cancelled,next=structuredClone(chart);drag=null;canvas.style.cursor='default';if(canvas.hasPointerCapture(active.pointerId))canvas.releasePointerCapture(active.pointerId);
    if(!changed){chart=active.originChart;draw();return;}chart=active.originChart;if(!save(next,'ドラッグ編集を反映しました')){chart=active.originChart;syncJson();renderInspector();draw();}
  }
  function finishPlacement(cancelled=false){
    if(!placing)return;const active=placing;placing=null;if(canvas.hasPointerCapture(active.pointerId))canvas.releasePointerCapture(active.pointerId);canvas.style.cursor=tool==='select'?'default':'crosshair';if(cancelled){draw();return;}
    const span=laneSpanFromDrag(active.startLane,active.currentLane),note={id:nextId(),type:active.type,timeMs:active.timeMs,...span};if(isHold(note))note.durationMs=1000;if(note.type==='flick-hold')note.endFlick={...span};const next=structuredClone(chart);next.notes.push(note);if(save(next,`${TYPES[note.type]}を幅${span.width}で配置しました`)){select(note.id);setStatus(`${TYPES[note.type]}を幅${span.width}で配置しました`,'ok');}
  }
  canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;if(audition.state!=='stopped')stopAudition(false,'編集のため再生確認を停止しました');const {x:px,y:py}=point(event);if(tool!=='select'){const lane=laneAt(px),timeMs=snapTime(pointTime(py),0,isHold({type:tool})?Math.max(0,durationMs()-1000):durationMs());placing={pointerId:event.pointerId,type:tool,timeMs,startLane:lane,currentLane:lane};canvas.setPointerCapture(event.pointerId);canvas.style.cursor='ew-resize';draw();event.preventDefault();return;}const hit=hitTest(px,py);if(!hit){select(null);return;}if(hit.id!==selectedId)select(hit.id);const n=noteById(hit.id),mode=editHandle(n,px,py)||'move',ids=connectedIds(n.id),members=chart.notes.filter(x=>ids.has(x.id)),spans=members.flatMap(x=>x.endFlick?[x,x.endFlick]:[x]);drag={pointerId:event.pointerId,id:n.id,mode,startX:px,startY:py,originChart:structuredClone(chart),connected:ids,members:structuredClone(members),spans:structuredClone(spans),downstream:downstreamIds(n),limits:widthLimits(n,mode.startsWith('flick-')),moved:false};canvas.setPointerCapture(event.pointerId);canvas.style.cursor=mode==='move'?'grabbing':cursorFor(mode);event.preventDefault();
  });
  canvas.addEventListener('pointermove',event=>{const {x:px,y:py}=point(event);if(placing&&event.pointerId===placing.pointerId){placing.currentLane=laneAt(px);const span=laneSpanFromDrag(placing.startLane,placing.currentLane);setStatus(`${TYPES[placing.type]} · レーン ${span.lane+1}〜${span.lane+span.width} · 幅${span.width}`);draw();event.preventDefault();return;}if(drag&&event.pointerId===drag.pointerId){previewDrag(px,py);event.preventDefault();return;}const n=noteById(selectedId);canvas.style.cursor=tool==='select'&&n?cursorFor(editHandle(n,px,py)):'crosshair';});
  canvas.addEventListener('pointerup',event=>{if(placing&&event.pointerId===placing.pointerId){placing.currentLane=laneAt(point(event).x);finishPlacement();return;}if(drag&&event.pointerId===drag.pointerId)finishDrag();});
  canvas.addEventListener('pointercancel',event=>{if(placing&&event.pointerId===placing.pointerId){finishPlacement(true);return;}if(drag&&event.pointerId===drag.pointerId)finishDrag(true);});

  for(const button of document.querySelectorAll('.tool'))button.addEventListener('click',()=>{tool=button.dataset.tool;document.querySelectorAll('.tool').forEach(x=>x.classList.toggle('active',x===button));canvas.style.cursor=tool==='select'?'default':'crosshair';setStatus(tool==='select'?'ノーツ本体・端・ホールド終端をドラッグできます':'クリックで幅1、横ドラッグで任意の幅を配置');});
  const snapInput=$('editor-snap'),snapError='1以上の整数を入力してください';
  const snapOptions=$('snap-options'),showSnapOptions=()=>{snapOptions.hidden=false;snapInput.setAttribute('aria-expanded','true');},hideSnapOptions=()=>{snapOptions.hidden=true;snapInput.setAttribute('aria-expanded','false');};
  snapInput.addEventListener('focus',showSnapOptions);snapInput.addEventListener('click',showSnapOptions);
  for(const option of snapOptions.querySelectorAll('[data-snap]'))option.addEventListener('mousedown',event=>event.preventDefault());
  for(const option of snapOptions.querySelectorAll('[data-snap]'))option.addEventListener('click',()=>{snapInput.value=option.dataset.snap;snapInput.dispatchEvent(new Event('input',{bubbles:true}));snapInput.focus();});
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('.snap-field'))hideSnapOptions();});
  snapInput.addEventListener('keydown',event=>{if(['-','+','.','e','E'].includes(event.key))event.preventDefault();});
  snapInput.addEventListener('input',()=>{const valid=/^[1-9]\d*$/.test(snapInput.value);snapInput.setCustomValidity(valid?'':snapError);if(valid){snapDivision=Number(snapInput.value);draw();setStatus(`スナップ: 1小節の${snapDivision}分の1`,'ok');}});
  snapInput.addEventListener('change',()=>{if(snapInput.checkValidity())return;snapInput.value=String(snapDivision);snapInput.setCustomValidity('');setStatus(`スナップは${snapError}`,'error');});
  $('editor-zoom').addEventListener('change',event=>{if(audition.state!=='stopped')stopAudition(false,'');const centerY=scroll.scrollTop+scroll.clientHeight/2,centerMs=Math.max(0,Math.min(durationMs(),(timelineHeight()-20-centerY)/pxPerMs())),nextZoom=Number(event.target.value);zoom=nextZoom;resize();requestAnimationFrame(()=>{const newCenterY=timelineHeight()-20-centerMs*pxPerMs();scroll.scrollTop=Math.max(0,newCenterY-scroll.clientHeight/2);});setStatus(`時間ズーム ${Math.round(zoom*100)}%`,'ok');});

  function commitInspector(){
    const current=noteById(selectedId);if(!current)return;const next=structuredClone(chart),n=next.notes.find(x=>x.id===selectedId),oldType=n.type;
    n.type=$('note-type').value;n.timeMs=Number($('note-time').value);n.lane=Number($('note-lane').value)-1;n.width=Number($('note-width').value);
    if(isHold(n)){n.durationMs=Number($('note-duration').value);n.nextId=$('note-next').value||undefined;}else{delete n.durationMs;delete n.nextId;for(const x of next.notes)if(x.nextId===n.id)delete x.nextId;}
    if(n.type==='flick-hold')n.endFlick={lane:Number($('flick-lane').value)-1,width:Number($('flick-width').value)};else delete n.endFlick;
    if(oldType!==n.type&&n.type==='flick-hold'&&!n.endFlick)n.endFlick={lane:n.lane,width:n.width};
    save(next);
  }
  for(const id of ['note-type','note-time','note-duration','note-lane','note-width','flick-lane','flick-width','note-next'])$(id).addEventListener('change',commitInspector);
  $('delete-note').addEventListener('click',()=>{if(!selectedId)return;const removed=selectedId,next=structuredClone(chart);next.notes=next.notes.filter(n=>n.id!==removed);for(const n of next.notes)if(n.nextId===removed)delete n.nextId;selectedId=null;save(next,`${removed} を削除しました`);});

  $('chart-title').addEventListener('change',()=>{const next=structuredClone(chart);next.metadata.title=$('chart-title').value;save(next,'曲名を更新しました');});
  $('chart-bpm').addEventListener('change',()=>{const next=structuredClone(chart);next.timing.bpm=Number($('chart-bpm').value);save(next,'基準BPMを更新しました');});
  $('add-bpm-change').addEventListener('click',()=>{const next=structuredClone(chart),used=new Set(next.timing.bpmChanges.map(change=>change.timeMs)),selected=noteById(selectedId),centerTime=pointTime(scroll.scrollTop+scroll.clientHeight/2);let timeMs=snapTime(selected?.timeMs??centerTime,1,durationMs()-1);while(used.has(timeMs)&&timeMs<durationMs()-1)timeMs++;while(used.has(timeMs)&&timeMs>1)timeMs--;if(used.has(timeMs)){setStatus('追加できる時刻がありません','error');return;}next.timing.bpmChanges.push({timeMs,bpm:bpmAtTime(chart.timing,timeMs)});save(next,`${timeMs}ms にBPM変更を追加しました`);});
  $('chart-duration').addEventListener('change',()=>{const next=structuredClone(chart);next.metadata.durationMs=Number($('chart-duration').value);if(!save(next,'譜面の長さを更新しました'))syncJson();});
  $('chart-offset').addEventListener('change',()=>{const next=structuredClone(chart);next.timing.offsetMs=Number($('chart-offset').value);if(!save(next,'音源オフセットを更新しました'))syncJson();});
  $('apply-json').addEventListener('click',()=>{try{const next=JSON.parse(json.value);selectedId=null;save(next,'JSONを譜面へ反映しました');}catch(error){setStatus(`JSONを読み込めません: ${error.message}`,'error');}});
  $('import-chart-file').addEventListener('click',()=>$('chart-file').click());
  $('chart-file').addEventListener('change',async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;try{const next=JSON.parse(await file.text());selectedId=null;if(save(next,`${file.name} を読み込みました`))resize();}catch(error){setStatus(`JSONを読み込めません: ${error.message}`,'error');}});
  $('import-audio-file').addEventListener('click',()=>$('audio-file').click());
  $('audio-file').addEventListener('change',async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;stopAudition(true,'');setStatus(`${file.name} を解析中…`);try{await onAudioFile(file);chart=structuredClone(getChart());syncJson();renderInspector();resize();setStatus(`${file.name} を音源として読み込みました`,'ok');}catch(error){setStatus(`音源を読み込めません: ${error.message}`,'error');}});
  $('clear-audio-file').addEventListener('click',()=>{stopAudition(true,'');onClearAudio();syncAudioInfo();setStatus('内蔵シンセ音源へ戻しました','ok');});
  $('copy-json').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(json.value);setStatus('JSONをコピーしました','ok');}catch{json.focus();json.select();setStatus('JSONを選択しました。コピーしてください');}});
  $('download-json').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([json.value],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='twelve-chart.json';a.click();URL.revokeObjectURL(url);setStatus('JSONをダウンロードしました','ok');});
  $('editor-reset').addEventListener('click',()=>{selectedId=null;save(createDefaultChartData(),'サンプル譜面へ戻しました');requestAnimationFrame(()=>{scroll.scrollTop=scroll.scrollHeight;});});
  $('editor-preview').addEventListener('click',()=>{stopAudition(true,'');onPreview(chart);});
  window.addEventListener('keydown',event=>{if($('editor-workspace').hidden||event.key!=='Delete'||event.target.matches('input,select,textarea'))return;$('delete-note').click();});

  syncJson();renderInspector();resize();syncAuditionUi();return{stop(){stopAudition(true,'');},refresh(){stopAudition(true,'');chart=structuredClone(getChart());selectedId=null;syncJson();renderInspector();resize();if(initialScrollPending){initialScrollPending=false;requestAnimationFrame(()=>{scroll.scrollTop=Math.max(0,scroll.scrollHeight-scroll.clientHeight);});}}};
}
