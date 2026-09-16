import {createDefaultChartData,validateChartData} from './engine.mjs';

const $=id=>document.getElementById(id),TYPES={tap:'タップ',flick:'フリック',hold:'ホールド','flick-hold':'フリックホールド'};
const isHold=n=>n.type==='hold'||n.type==='flick-hold';

export function initEditor({getChart,setChart,onPreview}){
  const canvas=$('editor-canvas'),ctx=canvas.getContext('2d'),scroll=$('timeline-scroll');
  const form=$('note-form'),empty=$('inspector-empty'),json=$('chart-json'),status=$('editor-status');
  let chart=structuredClone(getChart()),selectedId=null,tool='select',snap=250,zoom=1,width=0,ratio=1,initialScrollPending=true;
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
      if(n.id===selectedId){const top=Math.min(ny,endY);ctx.strokeStyle='#b9f78d';ctx.lineWidth=2;ctx.strokeRect(nx-3,top-9,nw+6,Math.max(18,duration+14));}
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
  canvas.addEventListener('click',event=>{
    const height=timelineHeight(),rect=canvas.getBoundingClientRect(),px=(event.clientX-rect.left)*width/rect.width,py=(event.clientY-rect.top)*height/rect.height,{laneW}=laneMetrics();
    if(tool==='select'){select(hitTest(px,py)?.id||null);return;}
    const lane=Math.max(0,Math.min(11,Math.floor((px-gutter)/laneW))),raw=Math.round(((timelineHeight()-20-py)/pxPerMs())/snap)*snap,timeMs=Math.max(0,Math.min(isHold({type:tool})?39000:40000,raw));
    const note={id:nextId(),type:tool,timeMs,lane,width:1};if(isHold(note))note.durationMs=1000;if(tool==='flick-hold')note.endFlick={lane,width:1};
    const next=structuredClone(chart);next.notes.push(note);if(save(next,`${TYPES[tool]}を配置しました`))select(note.id);
  });

  for(const button of document.querySelectorAll('.tool'))button.addEventListener('click',()=>{tool=button.dataset.tool;document.querySelectorAll('.tool').forEach(x=>x.classList.toggle('active',x===button));setStatus(tool==='select'?'選択ツール':'レーンをクリックして配置');});
  $('editor-snap').addEventListener('change',event=>{snap=Number(event.target.value);});
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
