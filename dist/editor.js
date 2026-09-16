import {createDefaultChartData,validateChartData} from './engine.mjs';

const $=id=>document.getElementById(id),TYPES={tap:'タップ',flick:'フリック',hold:'ホールド','flick-hold':'フリックホールド'};
const isHold=n=>n.type==='hold'||n.type==='flick-hold';
export function measureDurationMs(timing){const [beats=4,beatUnit=4]=timing?.timeSignature||[];return 60000/(Number(timing?.bpm)||120)*beats*4/beatUnit;}
export function snapToMeasureDivision(value,timing,division,min=0,max=40000){
  if(!Number.isInteger(division)||division<1)throw new Error('スナップは1以上の整数で指定してください');
  const unit=measureDurationMs(timing)/division,minIndex=Math.ceil(min/unit-1e-9),maxIndex=Math.floor(max/unit+1e-9);if(maxIndex<minIndex)return Math.round(Math.max(min,Math.min(max,value)));const index=Math.max(minIndex,Math.min(maxIndex,Math.round(value/unit)));
  return Math.round(index*unit);
}

export function initEditor({getChart,setChart,onPreview}){
  const canvas=$('editor-canvas'),ctx=canvas.getContext('2d'),scroll=$('timeline-scroll');
  const form=$('note-form'),empty=$('inspector-empty'),json=$('chart-json'),status=$('editor-status');
  let chart=structuredClone(getChart()),selectedId=null,tool='select',snapDivision=16,zoom=1,width=0,ratio=1,initialScrollPending=true,drag=null;
  const gutter=38,basePxPerMs=.04,timelineHeight=()=>40+40000*basePxPerMs*zoom,pxPerMs=()=>basePxPerMs*zoom;

  function noteById(id){return chart.notes.find(n=>n.id===id);}
  function setStatus(message,kind=''){status.textContent=message;status.className=`editor-status ${kind}`;}
  function nextId(){let i=chart.notes.length+1,id;do{id=`note-${String(i++).padStart(3,'0')}`;}while(noteById(id));return id;}
  function syncJson(){json.value=JSON.stringify(chart,null,2);$('editor-count').textContent=`${chart.notes.length} NOTES`;$('chart-title').value=chart.metadata.title;$('chart-bpm').value=chart.timing.bpm;}
  function save(next,message='譜面を更新しました'){
    try{chart=validateChartData(next);setChart(chart);syncJson();renderInspector();draw();setStatus(message,'ok');return true;}
    catch(error){setStatus(error.message,'error');return false;}
  }

  function laneMetrics(){const laneW=(width-gutter)/12;return {laneW,x:lane=>gutter+lane*laneW,y:ms=>timelineHeight()-20-ms*pxPerMs()};}
  function point(event){const height=timelineHeight(),rect=canvas.getBoundingClientRect();return{x:(event.clientX-rect.left)*width/rect.width,y:(event.clientY-rect.top)*height/rect.height};}
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const pointTime=py=>(timelineHeight()-20-py)/pxPerMs();
  const snapTime=(value,min=0,max=40000)=>snapToMeasureDivision(value,chart.timing,snapDivision,min,max);
  function connectedIds(id){const ids=new Set([id]);let changed=true;while(changed){changed=false;for(const n of chart.notes){if((ids.has(n.id)&&n.nextId&&!ids.has(n.nextId))||(n.nextId&&ids.has(n.nextId)&&!ids.has(n.id))){ids.add(n.id);if(n.nextId)ids.add(n.nextId);changed=true;}}}return ids;}
  function downstreamIds(n){const ids=[];let id=n.nextId;while(id){const next=noteById(id);if(!next)break;ids.push(id);id=next.nextId;}return ids;}
  function incoming(n){return chart.notes.find(x=>x.nextId===n.id);}
  function spanOf(n){return n.type==='flick-hold'?n.endFlick:n;}
  function widthLimits(n,endFlick=false){let minLeft=0,maxRight=12,requiredLeft=12,requiredRight=0;const parent=!endFlick&&incoming(n);if(parent){const span=spanOf(parent);minLeft=span.lane;maxRight=span.lane+span.width;}const child=(endFlick||n.type!=='flick-hold')&&n.nextId?noteById(n.nextId):null;if(child){requiredLeft=child.lane;requiredRight=child.lane+child.width;}return{minLeft,maxRight,requiredLeft,requiredRight};}
  function draw(){
    const height=timelineHeight(),{laneW,x,y}=laneMetrics();ctx.clearRect(0,0,width,height);ctx.fillStyle='#0b121b';ctx.fillRect(0,0,width,height);
    for(let lane=0;lane<12;lane++){ctx.fillStyle=lane%2?'#101a26':'#0e1722';ctx.fillRect(x(lane),0,laneW,height);ctx.fillStyle='#263545';ctx.fillRect(x(lane),0,1,height);}
    ctx.textAlign='right';ctx.font='11px Barlow Condensed, sans-serif';
    for(let ms=0;ms<=40000;ms+=500){const py=y(ms),major=ms%2000===0;ctx.fillStyle=major?'#3a4859':'#202e3d';ctx.fillRect(gutter,py,width-gutter,major?1.5:1);if(major){ctx.fillStyle='#7f8da0';ctx.fillText(`${Math.floor(ms/60000)}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}`,gutter-6,py+4);}}
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
  }

  function resize(){const height=timelineHeight();width=Math.max(480,canvas.clientWidth);ratio=Math.min(devicePixelRatio||1,2);canvas.style.height=`${height}px`;canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);draw();}
  new ResizeObserver(resize).observe(canvas);

  function renderInspector(){
    const n=noteById(selectedId);empty.hidden=!!n;form.hidden=!n;$('selected-id').textContent=n?n.id:'未選択';if(!n)return;
    $('note-type').value=n.type;$('note-time').value=n.timeMs;$('note-duration').value=n.durationMs||1000;$('note-lane').value=n.lane+1;$('note-width').value=n.width;
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
      const laneDelta=clamp(Math.round((px-drag.startX)/laneW),-minLane,12-maxLane),targetTime=snapTime(origin.timeMs+pointTime(py)-pointTime(drag.startY),origin.timeMs-minTime,origin.timeMs+40000-maxTime),timeDelta=targetTime-origin.timeMs;
      for(const item of next.notes.filter(x=>ids.has(x.id))){item.timeMs+=timeDelta;item.lane+=laneDelta;if(item.endFlick)item.endFlick.lane+=laneDelta;}
    }else if(drag.mode==='duration'){
      const descendants=drag.downstream,currentLatest=Math.max(origin.timeMs+origin.durationMs,...drag.members.filter(x=>descendants.includes(x.id)).map(x=>x.timeMs+(x.durationMs||0))),maxDuration=origin.durationMs+40000-currentLatest,newDuration=snapTime(pointTime(py)-origin.timeMs,100,maxDuration),delta=newDuration-origin.durationMs;n.durationMs=newDuration;for(const item of next.notes.filter(x=>descendants.includes(x.id)))item.timeMs+=delta;
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
  canvas.addEventListener('pointerdown',event=>{
    if(tool!=='select'||event.button!==0)return;const {x:px,y:py}=point(event),hit=hitTest(px,py);if(!hit){select(null);return;}if(hit.id!==selectedId)select(hit.id);const n=noteById(hit.id),mode=editHandle(n,px,py)||'move',ids=connectedIds(n.id),members=chart.notes.filter(x=>ids.has(x.id)),spans=members.flatMap(x=>x.endFlick?[x,x.endFlick]:[x]);drag={pointerId:event.pointerId,id:n.id,mode,startX:px,startY:py,originChart:structuredClone(chart),connected:ids,members:structuredClone(members),spans:structuredClone(spans),downstream:downstreamIds(n),limits:widthLimits(n,mode.startsWith('flick-')),moved:false};canvas.setPointerCapture(event.pointerId);canvas.style.cursor=mode==='move'?'grabbing':cursorFor(mode);event.preventDefault();
  });
  canvas.addEventListener('pointermove',event=>{const {x:px,y:py}=point(event);if(drag&&event.pointerId===drag.pointerId){previewDrag(px,py);event.preventDefault();return;}const n=noteById(selectedId);canvas.style.cursor=tool==='select'&&n?cursorFor(editHandle(n,px,py)):'crosshair';});
  canvas.addEventListener('pointerup',event=>{if(drag&&event.pointerId===drag.pointerId)finishDrag();});
  canvas.addEventListener('pointercancel',event=>{if(drag&&event.pointerId===drag.pointerId)finishDrag(true);});
  canvas.addEventListener('click',event=>{
    const height=timelineHeight(),rect=canvas.getBoundingClientRect(),px=(event.clientX-rect.left)*width/rect.width,py=(event.clientY-rect.top)*height/rect.height,{laneW}=laneMetrics();
    if(tool==='select')return;
    const lane=Math.max(0,Math.min(11,Math.floor((px-gutter)/laneW))),timeMs=snapTime(pointTime(py),0,isHold({type:tool})?39000:40000);
    const note={id:nextId(),type:tool,timeMs,lane,width:1};if(isHold(note))note.durationMs=1000;if(tool==='flick-hold')note.endFlick={lane,width:1};
    const next=structuredClone(chart);next.notes.push(note);if(save(next,`${TYPES[tool]}を配置しました`))select(note.id);
  });

  for(const button of document.querySelectorAll('.tool'))button.addEventListener('click',()=>{tool=button.dataset.tool;document.querySelectorAll('.tool').forEach(x=>x.classList.toggle('active',x===button));canvas.style.cursor=tool==='select'?'default':'crosshair';setStatus(tool==='select'?'ノーツ本体・端・ホールド終端をドラッグできます':'レーンをクリックして配置');});
  const snapInput=$('editor-snap'),snapError='1以上の整数を入力してください';
  const snapOptions=$('snap-options'),showSnapOptions=()=>{snapOptions.hidden=false;snapInput.setAttribute('aria-expanded','true');},hideSnapOptions=()=>{snapOptions.hidden=true;snapInput.setAttribute('aria-expanded','false');};
  snapInput.addEventListener('focus',showSnapOptions);snapInput.addEventListener('click',showSnapOptions);
  for(const option of snapOptions.querySelectorAll('[data-snap]'))option.addEventListener('mousedown',event=>event.preventDefault());
  for(const option of snapOptions.querySelectorAll('[data-snap]'))option.addEventListener('click',()=>{snapInput.value=option.dataset.snap;snapInput.dispatchEvent(new Event('input',{bubbles:true}));snapInput.focus();});
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('.snap-field'))hideSnapOptions();});
  snapInput.addEventListener('keydown',event=>{if(['-','+','.','e','E'].includes(event.key))event.preventDefault();});
  snapInput.addEventListener('input',()=>{const valid=/^[1-9]\d*$/.test(snapInput.value);snapInput.setCustomValidity(valid?'':snapError);if(valid){snapDivision=Number(snapInput.value);setStatus(`スナップ: 1小節の${snapDivision}分の1`,'ok');}});
  snapInput.addEventListener('change',()=>{if(snapInput.checkValidity())return;snapInput.value=String(snapDivision);snapInput.setCustomValidity('');setStatus(`スナップは${snapError}`,'error');});
  $('editor-zoom').addEventListener('change',event=>{const centerY=scroll.scrollTop+scroll.clientHeight/2,centerMs=Math.max(0,Math.min(40000,(timelineHeight()-20-centerY)/pxPerMs())),nextZoom=Number(event.target.value);zoom=nextZoom;resize();requestAnimationFrame(()=>{const newCenterY=timelineHeight()-20-centerMs*pxPerMs();scroll.scrollTop=Math.max(0,newCenterY-scroll.clientHeight/2);});setStatus(`時間ズーム ${Math.round(zoom*100)}%`,'ok');});

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
  $('chart-bpm').addEventListener('change',()=>{const next=structuredClone(chart);next.timing.bpm=Number($('chart-bpm').value);save(next,'BPMを更新しました');});
  $('apply-json').addEventListener('click',()=>{try{const next=JSON.parse(json.value);selectedId=null;save(next,'JSONを譜面へ反映しました');}catch(error){setStatus(`JSONを読み込めません: ${error.message}`,'error');}});
  $('copy-json').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(json.value);setStatus('JSONをコピーしました','ok');}catch{json.focus();json.select();setStatus('JSONを選択しました。コピーしてください');}});
  $('download-json').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([json.value],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='twelve-chart.json';a.click();URL.revokeObjectURL(url);setStatus('JSONをダウンロードしました','ok');});
  $('editor-reset').addEventListener('click',()=>{selectedId=null;save(createDefaultChartData(),'サンプル譜面へ戻しました');requestAnimationFrame(()=>{scroll.scrollTop=scroll.scrollHeight;});});
  $('editor-preview').addEventListener('click',()=>onPreview(chart));
  window.addEventListener('keydown',event=>{if($('editor-workspace').hidden||event.key!=='Delete'||event.target.matches('input,select,textarea'))return;$('delete-note').click();});

  syncJson();renderInspector();resize();return{refresh(){chart=structuredClone(getChart());selectedId=null;syncJson();renderInspector();draw();if(initialScrollPending){initialScrollPending=false;requestAnimationFrame(()=>{scroll.scrollTop=Math.max(0,scroll.scrollHeight-scroll.clientHeight);});}}};
}
