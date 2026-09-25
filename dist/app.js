import { Game, FlickGesture, KEYS, LABELS, noteSpanAt, flickSpan, createDefaultChartData, validateChartData } from './engine.mjs';
import {initEditor} from './editor.js';
import {createPerspective,perspectiveMetrics,getNoteVisibleTimeMs} from './projection.mjs';
const $=id=>document.getElementById(id),canvas=$('game'),ctx=canvas.getContext('2d');
const playbackSection=document.querySelector('.play-section');
const judgementColors={GREAT:'#ffd65a',GOOD:'#71dd83',BAD:'#673480',MISS:'#969faa',AUTO:'#70dcf8'};
let game,phase='ready',elapsed=0,epoch=0,audio,master,trackGain,scheduledStep=0,frameTime=0,judgeUntil=0,externalTrack=null,externalSource=null;
let chartData=createDefaultChartData();try{const saved=localStorage.getItem('twelve-chart-v1');if(saved)chartData=validateChartData(JSON.parse(saved));}catch{localStorage.removeItem('twelve-chart-v1');}
const PLAY_SETTINGS_KEY='twelve-play-settings-v1',defaultPlaySettings={noteSpeed:10,noteStartPosition:50,noteThickness:100};
let playSettings={...defaultPlaySettings};try{const saved=JSON.parse(localStorage.getItem(PLAY_SETTINGS_KEY)),noteSpeed=Math.round(Number(saved?.noteSpeed)*10)/10,noteStartPosition=Math.round(Number(saved?.noteStartPosition)/5)*5,noteThickness=Number(saved?.noteThickness);if(noteSpeed>=1&&noteSpeed<=25&&noteStartPosition>=0&&noteStartPosition<=100)Object.assign(playSettings,{noteSpeed,noteStartPosition});if(Number.isFinite(noteThickness)&&noteThickness>=50&&noteThickness<=200)playSettings.noteThickness=Math.round(noteThickness/10)*10;}catch{localStorage.removeItem(PLAY_SETTINGS_KEY);}
const keys=new Set(),pointers=new Map(),effects=[],voices=new Set();
const held=()=>new Set([...keys,...[...pointers.values()].map(p=>p.lane)]);
const chartDuration=()=>chartData.metadata.durationMs/1000,offsetSeconds=()=>chartData.timing.offsetMs/1000,chartDelay=()=>Math.max(0,offsetSeconds()),audioDelay=()=>Math.max(0,-offsetSeconds());
const formatTime=value=>{const seconds=Math.max(0,Math.round(value)),minutes=Math.floor(seconds/60);return `${minutes}:${String(seconds%60).padStart(2,'0')}`;};
let width=0,height=0,ratio=1;
function resize(){const r=canvas.getBoundingClientRect();width=r.width;height=r.height;ratio=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);}
new ResizeObserver(resize).observe(canvas);
const playbackMenuToggle=$('playback-menu-toggle'),playbackMenuPanel=$('playback-menu-panel');
function setPlaybackMenu(open){const active=!!open;playbackMenuPanel.hidden=!active;playbackMenuToggle.setAttribute('aria-expanded',String(active));playbackMenuToggle.setAttribute('aria-label',active?'再生メニューを閉じる':'再生メニューを開く');}
function setTheaterMode(enabled){const active=!!enabled,button=$('theater-toggle');playbackSection.classList.toggle('theater-mode',active);document.body.classList.toggle('theater-active',active);button.textContent=active?'× 全画面表示を終了':'⛶ ウィンドウ内全画面';button.setAttribute('aria-pressed',String(active));requestAnimationFrame(resize);}
function showJudgement(grade=''){const element=$('judgement'),rainbow=grade==='PERFECT+'||grade==='PERFECT';element.textContent=grade;element.classList.toggle('rainbow-judgement',rainbow);element.style.color=rainbow?'transparent':judgementColors[grade]||'';}
function newGame(){game=new Game($('auto').checked,chartData);game.onJudge=(grade,n,span,event)=>{const flick=event?.input==='flick'||n.type==='flick';$('score').textContent=String(game.score).padStart(7,'0');$('combo').textContent=game.combo;$('combo-box').style.display=game.combo>0?'block':'none';showJudgement(grade);if(event?.provisionalGrade&&event.state==='pending')$('judgement').textContent='GREAT（仮）';judgeUntil=performance.now()+550;if(grade!=='MISS')effects.push({lane:span.lane,width:span.width,start:performance.now(),hold:!!n.duration,flick,critical:!!event?.critical,beam:event?.input==='press'});};}
function audioInit(){if(!audio){audio=new (window.AudioContext||window.webkitAudioContext)();master=audio.createGain();trackGain=audio.createGain();master.gain.value=Number($('volume').value)/100*.38;trackGain.gain.value=Number($('volume').value)/100;master.connect(audio.destination);trackGain.connect(audio.destination);}return audio.resume();}
function tone(freq,at,duration,type='sine',level=.16,slide=0){const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(freq,at);if(slide)o.frequency.exponentialRampToValueAtTime(slide,at+duration);g.gain.setValueAtTime(.001,at);g.gain.exponentialRampToValueAtTime(level,at+.006);g.gain.exponentialRampToValueAtTime(.001,at+duration);o.connect(g);g.connect(master);o.start(at);o.stop(at+duration+.015);voices.add(o);o.onended=()=>{voices.delete(o);g.disconnect();o.disconnect();};}
function stopExternalSource(){if(!externalSource)return;const source=externalSource;externalSource=null;try{source.stop();}catch{}try{source.disconnect();}catch{}}
function silence(){stopExternalSource();for(const v of voices){try{v.stop();}catch{}}voices.clear();}
function stopEditorAudition(preserveHits=false){stopExternalSource();if(!preserveHits)for(const v of voices){try{v.stop();}catch{}}if(!preserveHits)voices.clear();}
async function startEditorAudition(timeMs){await audioInit();silence();if(!externalTrack)return;const position=timeMs/1000+offsetSeconds();if(position>=externalTrack.buffer.duration)return;const source=audio.createBufferSource();source.buffer=externalTrack.buffer;source.connect(trackGain);const when=audio.currentTime+Math.max(0,-position);source.start(when,Math.max(0,position));source.onended=()=>{if(externalSource===source)externalSource=null;try{source.disconnect();}catch{}};externalSource=source;}
function playEditorHit(events){if(!audio||!events.length)return;const at=audio.currentTime+.006,types=new Set(events.map(event=>event.type)),isFlick=[...types].some(type=>type.includes('flick')||type.includes('scratch')),isHold=[...types].some(type=>type.includes('hold')),count=Math.min(4,events.length);tone(isFlick?1320:isHold?760:980,at,.055,'square',.12,420);if(isHold)tone(440,at,.09,'triangle',.08,660);if(count>1)tone(980+count*90,at,.045,'sine',.035);}
function startExternalSource(){if(!externalTrack||!audio)return;const realPosition=audio.currentTime-epoch,position=realPosition-audioDelay();if(position>=externalTrack.buffer.duration)return;const source=audio.createBufferSource();source.buffer=externalTrack.buffer;source.connect(trackGain);const when=audio.currentTime+Math.max(0,-position);source.start(when,Math.max(0,position));source.onended=()=>{if(externalSource===source)externalSource=null;try{source.disconnect();}catch{}};externalSource=source;}
function schedule(){const melody=[0,7,12,14,7,12,3,7,0,10,12,7,3,7,10,14],roots=[130.81,103.83,155.56,116.54];while(2+scheduledStep*.25<elapsed+.12&&2+scheduledStep*.25<chartDuration()-.5){const step=scheduledStep++,at=epoch+chartDelay()+2+step*.25;if(at<audio.currentTime-.04)continue;const root=roots[Math.floor(step/16)%4];if(step%2===0)tone(125,at,.19,'sine',.7,35);if(step%4===2){tone(180,at,.09,'triangle',.24,70);tone(1200,at,.05,'square',.035);}tone(7200+(step%2)*1200,at,.025,'square',.018);tone(root*2*Math.pow(2,melody[step%16]/12),at,.2,'triangle',.18);if(step%4===0)tone(root/2,at,.7,'sine',.32);}}
function time(){return phase==='playing'?Math.min(chartDuration(),audio.currentTime-epoch-chartDelay()):elapsed;}
function setPhase(p){phase=p;$('state-label').textContent=({ready:'READY',playing:game.auto?'AUTO PLAY':'PLAYING',paused:'PAUSED',ended:'FINISHED'})[p];$('pause').disabled=p==='ready'||p==='ended';$('pause').textContent=p==='playing'?'Ⅱ 一時停止':'▶ 再生';$('auto').disabled=p==='playing'||p==='paused';}
async function start(){if(phase==='playing')return;if(phase==='paused'){await resume();return;}try{await audioInit();}catch{$('overlay-description').textContent='音声を開始できませんでした。もう一度お試しください。';return;}silence();keys.clear();pointers.clear();newGame();elapsed=-chartDelay();scheduledStep=0;epoch=audio.currentTime;startExternalSource();$('overlay').style.display='none';$('score').textContent='0000000';$('combo-box').style.display='none';showJudgement();setPhase('playing');}
function pause(){if(phase!=='playing')return;elapsed=time();game.update(elapsed,held());silence();setPhase('paused');keys.clear();pointers.clear();game.update(elapsed,held());showOverlay('PAUSED','ひと休み。','ホールドは途中からでも押し直せます。','▶ 続ける');}
async function resume(){try{await audioInit();}catch{return;}epoch=audio.currentTime-(elapsed+chartDelay());scheduledStep=Math.max(0,Math.ceil((elapsed-2)/.25));keys.clear();pointers.clear();startExternalSource();setPhase('playing');$('overlay').style.display='none';}
function showOverlay(label,title,description,button){$('overlay').style.display='flex';$('overlay-label').textContent=label;$('overlay-title').textContent=title;$('overlay-description').textContent=description;$('start').textContent=button;}
function reset(){silence();elapsed=0;keys.clear();pointers.clear();effects.length=0;newGame();setPhase('ready');$('score').textContent='0000000';$('combo-box').style.display='none';showJudgement();showOverlay('12 LANES. YOUR RHYTHM.','リズムを、つかもう。','赤はタップ。黄はCritical。水色は長押し。紫はフリック。','▶ プレイする');}
function resultSummary(){return `PERFECT+ ${game.perfectPlus} · PERFECT ${game.perfect} · GREAT ${game.great}\nGOOD ${game.good} · BAD ${game.bad} · MISS ${game.miss}${game.autoCount?` · AUTO ${game.autoCount}`:''}\nSCORE ${String(game.score).padStart(7,'0')} · MAX COMBO ${game.maxCombo}`;}
function end(){silence();elapsed=chartDuration();setPhase('ended');keys.clear();pointers.clear();showOverlay(game.auto?'AUTO PLAY COMPLETE':'PLAY COMPLETE',game.auto?'譜面再生が完了しました':'おつかれさま！',resultSummary(),'↺ もう一度プレイ');}
function drawFlickArrows(x,y,w,scale=1,color='#d8b1ff'){
  const metrics=perspectiveMetrics(scale,playSettings.noteThickness/100),half=w/2,count=Math.max(1,Math.floor(half/Math.max(3,13*scale))),spacing=half/count,chevronW=Math.min(6*scale,spacing*.48),center=x+half,cy=y-metrics.arrowOffset;
  ctx.strokeStyle=color;ctx.lineWidth=metrics.outlineWidth;ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();
  for(const direction of [-1,1])for(let i=0;i<count;i++){
    const tip=center+direction*(spacing*(i+.78));ctx.moveTo(tip-direction*chevronW,cy-metrics.arrowHeight);ctx.lineTo(tip,cy);ctx.lineTo(tip-direction*chevronW,cy+metrics.arrowHeight);
  }
  ctx.stroke();ctx.lineCap='butt';
}
function projectedBar(view,span,point,height,inset=3){
  const depth=Math.max(1,view.hitY-view.topY),edge=offset=>{const p=point.p+offset/depth,scale=view.laneScale(p),left=view.laneX(span.lane,p),right=view.laneX(span.lane+span.width,p),safeInset=Math.max(0,Math.min(inset*scale,(right-left)*.22));return{left:left+safeInset,right:right-safeInset,y:point.y+offset};};
  return{top:edge(-height/2),bottom:edge(height/2)};
}
function fillProjectedBar(view,span,point,height,color,inset=3){
  const bar=projectedBar(view,span,point,height,inset);ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(bar.top.left,bar.top.y);ctx.lineTo(bar.top.right,bar.top.y);ctx.lineTo(bar.bottom.right,bar.bottom.y);ctx.lineTo(bar.bottom.left,bar.bottom.y);ctx.closePath();ctx.fill();return bar;
}
function drawKeyBeams(view,now){
  for(const effect of effects){
    const age=(now-effect.start)/280;if(!effect.beam||age<0||age>=1)continue;
    const p=.12+age*.2,y=view.topY+(view.hitY-view.topY)*p,color=effect.critical?'#ffd94a':'#ff8291';
    ctx.save();ctx.globalAlpha=(1-age)*(1-age)*.65;
    const beam=ctx.createLinearGradient(0,y,0,view.hitY);beam.addColorStop(0,color+'00');beam.addColorStop(.7,color+'65');beam.addColorStop(1,color);
    ctx.fillStyle=beam;ctx.beginPath();ctx.moveTo(view.laneX(effect.lane,p),y);ctx.lineTo(view.laneX(effect.lane+effect.width,p),y);ctx.lineTo(view.laneX(effect.lane+effect.width,1),view.hitY);ctx.lineTo(view.laneX(effect.lane,1),view.hitY);ctx.closePath();ctx.fill();ctx.restore();
  }
}
function draw(now){
  const laneW=width/12,view=createPerspective(width,height,playSettings),{hitY,judgementTop,judgementBottom,judgementHeight,judgementTopProgress,judgementBottomProgress,stageBottomProgress,topY,travel,visibleY,visibleProgress}=view;
  ctx.clearRect(0,0,width,height);ctx.fillStyle='#090f18';ctx.fillRect(0,0,width,height);
  const active=held(),judgementCell=lane=>({topLeft:view.laneX(lane,judgementTopProgress),topRight:view.laneX(lane+1,judgementTopProgress),bottomLeft:view.laneX(lane,judgementBottomProgress),bottomRight:view.laneX(lane+1,judgementBottomProgress)}),traceJudgementCell=cell=>{ctx.beginPath();ctx.moveTo(cell.topLeft,judgementTop);ctx.lineTo(cell.topRight,judgementTop);ctx.lineTo(cell.bottomRight,judgementBottom);ctx.lineTo(cell.bottomLeft,judgementBottom);ctx.closePath();};if(game.auto&&phase==='playing')for(const n of game.notes)if(n.state==='holding'){const span=noteSpanAt(n,elapsed),from=Math.max(0,Math.floor(span.lane)),to=Math.min(12,Math.ceil(span.lane+span.width));for(let l=from;l<to;l++)active.add(l);}
  for(let l=0;l<12;l++){
    const topLeft=view.laneX(l,0),topRight=view.laneX(l+1,0),bottomLeft=view.laneX(l,stageBottomProgress),bottomRight=view.laneX(l+1,stageBottomProgress),cell=judgementCell(l);ctx.fillStyle=active.has(l)?'#243b39':l%2===0?'#121b28':'#101823';ctx.beginPath();ctx.moveTo(topLeft,topY);ctx.lineTo(topRight,topY);ctx.lineTo(bottomRight,height);ctx.lineTo(bottomLeft,height);ctx.closePath();ctx.fill();ctx.fillStyle=active.has(l)?'#29483d':'#111b27';traceJudgementCell(cell);ctx.fill();
  }
  for(let l=0;l<=12;l++){ctx.strokeStyle=l%3===0?'#39495d':'#263546';ctx.lineWidth=l%3===0?1.2:1;ctx.beginPath();ctx.moveTo(view.laneX(l,0),topY);ctx.lineTo(view.laneX(l,stageBottomProgress),height);ctx.stroke();}
  for(let beat=Math.floor(elapsed/.5);beat<elapsed/.5+travel*2+2;beat++){const point=view.project(beat*.5,elapsed);if(point.y<topY||point.y>hitY)continue;const left=view.laneX(0,point.p),right=view.laneX(12,point.p),lineScale=Math.max(.4,point.scale);ctx.fillStyle=beat%4===0?'#3b4d62':'#223244';ctx.fillRect(left,point.y,right-left,(beat%4===0?1.5:1)*lineScale);}
  ctx.strokeStyle='#506278';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(view.laneX(0,0),topY);ctx.lineTo(view.laneX(12,0),topY);ctx.stroke();
  drawKeyBeams(view,now);
  const fadeEnd=Math.min(hitY,visibleY+58),topFade=ctx.createLinearGradient(0,visibleY,0,Math.max(visibleY+1,fadeEnd));topFade.addColorStop(0,'#090f18');topFade.addColorStop(1,'#090f1800');
  ctx.save();ctx.beginPath();ctx.moveTo(view.laneX(0,visibleProgress),visibleY);ctx.lineTo(view.laneX(12,visibleProgress),visibleY);ctx.lineTo(width,hitY);ctx.lineTo(width,height);ctx.lineTo(0,height);ctx.lineTo(0,hitY);ctx.closePath();ctx.clip();
  for(const n of game.notes){
    if(n.state==='hit'||n.state==='miss')continue;
    const isFlickHold=n.type==='flick-hold',purple=n.type==='flick'||isFlickHold||n.startType==='scratch',startEvent=n.events.find(event=>event.id.endsWith(':start')),showStart=!n.duration||(n.startType!=='none'&&startEvent?.state==='pending');
    const startPoint=view.project(n.time,elapsed),endPoint=view.project(n.time+n.duration,elapsed),y=startPoint.y,tail=isFlickHold?Math.min(endPoint.y,hitY):endPoint.y;
    if(y<visibleY-28||tail>height+30)continue;
    const lowerTime=n.duration?Math.max(n.time,Math.min(elapsed,n.time+n.duration)):n.time;
    const lowerSpan=noteSpanAt(n,lowerTime),endSpan=noteSpanAt(n,n.time+n.duration),endFlickSpan=flickSpan(n);
    const headProjection=n.duration?view.spanAtProgress(lowerSpan,Math.min(1,view.progress(lowerTime,elapsed)),3):view.span(lowerSpan,lowerTime,elapsed,3),endProjection=view.holdSpan(endSpan,n.time+n.duration,elapsed,3),flickProjection=view.spanAtProgress(endFlickSpan,Math.min(1,endPoint.p),3),x=headProjection.x,w=headProjection.w,endX=endProjection.x,endW=endProjection.w,flickX=flickProjection.x,flickW=flickProjection.w,head=n.duration?Math.min(headProjection.y,hitY):y,headScale=headProjection.scale,endScale=endProjection.scale,headMetrics=perspectiveMetrics(headScale,playSettings.noteThickness/100),endMetrics=perspectiveMetrics(endScale,playSettings.noteThickness/100);
    if(n.duration&&headProjection.p>=visibleProgress){
      const bodyTail=endProjection.y,tint=isFlickHold?'#b875ff':'#70dcf8',body=ctx.createLinearGradient(0,Math.min(bodyTail,head-1),0,head);body.addColorStop(0,tint+'22');body.addColorStop(1,tint+(n.state==='holding'?'b0':'63'));ctx.fillStyle=body;
      ctx.beginPath();ctx.moveTo(x,head);ctx.lineTo(x+w,head);ctx.lineTo(endX+endW,bodyTail);ctx.lineTo(endX,bodyTail);ctx.closePath();ctx.fill();
      ctx.strokeStyle=tint+'7a';ctx.lineWidth=(headMetrics.outlineWidth+endMetrics.outlineWidth)/2;ctx.beginPath();ctx.moveTo(x,head);ctx.lineTo(endX,bodyTail);ctx.moveTo(x+w,head);ctx.lineTo(endX+endW,bodyTail);ctx.stroke();
      if(endPoint.p>=visibleProgress&&endPoint.p<=1)fillProjectedBar(view,endSpan,endProjection,endMetrics.accentHeight*1.5,isFlickHold?'#e5c9ff':'#a0ebff');
    }
    const color=n.critical?'#ffd94a':purple?'#b875ff':n.duration?'#70dcf8':'#ff4e64';
    if(showStart){const headHeight=headMetrics.noteHeight;ctx.shadowColor=color;ctx.shadowBlur=headMetrics.shadowBlur*(n.state==='holding'?1.65:.85);if(n.duration){fillProjectedBar(view,lowerSpan,headProjection,headHeight,color);const accentPoint={...headProjection,y:headProjection.y-headHeight/2+headMetrics.accentHeight/2,p:headProjection.p+(-headHeight/2+headMetrics.accentHeight/2)/Math.max(1,hitY-topY)};fillProjectedBar(view,lowerSpan,accentPoint,headMetrics.accentHeight,n.critical?'#fff2a5':purple?'#e5c9ff':'#c5f4ff');}else{ctx.fillStyle=color;ctx.fillRect(x,head-headHeight/2,w,headHeight);ctx.fillStyle=n.critical?'#fff2a5':purple?'#e5c9ff':'#ffb1bb';ctx.fillRect(x,head-headHeight/2,w,headMetrics.accentHeight);}ctx.shadowBlur=0;}
    if(showStart&&(n.type==='flick'||n.startType==='scratch'))drawFlickArrows(x,head,w,headScale,n.critical?'#fff7bd':'#d8b1ff');
    if(isFlickHold&&endPoint.y>=visibleY-28){
      const flickHeight=endMetrics.noteHeight;ctx.shadowColor='#b875ff';ctx.shadowBlur=endMetrics.shadowBlur;fillProjectedBar(view,endFlickSpan,flickProjection,flickHeight,'#b875ff');const accentPoint={...flickProjection,y:flickProjection.y-flickHeight/2+endMetrics.accentHeight/2,p:flickProjection.p+(-flickHeight/2+endMetrics.accentHeight/2)/Math.max(1,hitY-topY)};fillProjectedBar(view,endFlickSpan,accentPoint,endMetrics.accentHeight,'#e5c9ff');ctx.shadowBlur=0;drawFlickArrows(flickX,tail,flickW,endScale);
    }
  }
  ctx.restore();
  ctx.fillStyle=topFade;ctx.fillRect(0,visibleY,width,Math.max(1,fadeEnd-visibleY));
  const glow=ctx.createLinearGradient(0,judgementTop-12,0,judgementTop+judgementHeight+12);glow.addColorStop(0,'#b9f78d00');glow.addColorStop(.5,'#b9f78d18');glow.addColorStop(1,'#b9f78d00');ctx.fillStyle=glow;ctx.fillRect(0,judgementTop-12,width,judgementHeight+24);
  for(let i=effects.length-1;i>=0;i--){const e=effects[i],age=(now-e.start)/450;if(age>=1){effects.splice(i,1);continue;}ctx.globalAlpha=(1-age)*.8;ctx.strokeStyle=e.critical?'#ffd94a':e.flick?'#c68aff':e.hold?'#70dcf8':'#ff8291';ctx.lineWidth=2;ctx.strokeRect(e.lane*laneW+3-age*5,hitY-7-age*23,e.width*laneW-6+age*10,14+age*46);ctx.globalAlpha=1;}
  for(let l=0;l<12;l++){const cell=judgementCell(l),labelX=(cell.topLeft+cell.topRight+cell.bottomLeft+cell.bottomRight)/4;ctx.strokeStyle=active.has(l)?'#b9f78d':'#607287';ctx.lineWidth=active.has(l)?2:1.25;traceJudgementCell(cell);ctx.stroke();ctx.fillStyle=active.has(l)?'#d9ffbd':'#aab7c7';ctx.font=`600 ${Math.max(11,Math.min(16,laneW*.38))}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(LABELS[l],labelX,judgementTop+judgementHeight*.72);}ctx.textBaseline='alphabetic';
}
function frame(now){if(phase==='playing'){elapsed=time();game.update(elapsed,held());for(const p of pointers.values())p.gesture.rest(now);if(!externalTrack)schedule();if(elapsed>=chartDuration())end();}if(now>judgeUntil)$('judgement').textContent='';draw(now);if(now-frameTime>100){$('elapsed').textContent=formatTime(Math.max(0,elapsed));frameTime=now;}requestAnimationFrame(frame);}
function press(lane){if(phase==='playing'){const t=time();game.update(t,held());game.press(lane,t);}}
window.addEventListener('keydown',e=>{if(e.code==='Escape'&&!playbackMenuPanel.hidden){e.preventDefault();setPlaybackMenu(false);playbackMenuToggle.focus();return;}if(e.code==='Escape'&&playbackSection.classList.contains('theater-mode')){e.preventDefault();setTheaterMode(false);playbackMenuToggle.focus();return;}if(!$('editor-workspace').hidden||e.target.matches('input,select,button,a,textarea'))return;if(e.code==='Space'){e.preventDefault();if(!e.repeat){if(phase==='playing')pause();else if(phase==='paused')resume();else start();}return;}const lane=KEYS.indexOf(e.code);if(lane<0)return;e.preventDefault();if(!e.repeat&&!keys.has(lane)){keys.add(lane);press(lane);}});
window.addEventListener('keyup',e=>{const lane=KEYS.indexOf(e.code);if(lane>=0){keys.delete(lane);if(phase==='playing')game.update(time(),held());}});
const pointerLane=e=>Math.max(0,Math.min(11,Math.floor((e.clientX-canvas.getBoundingClientRect().left)/width*12)));
const flickLane=x=>x<0||x>=width?-1:Math.floor(x/width*12);
canvas.addEventListener('pointerdown',e=>{if(phase!=='playing'||pointers.has(e.pointerId)||(e.pointerType==='mouse'&&e.button!==0))return;e.preventDefault();canvas.setPointerCapture(e.pointerId);const lane=pointerLane(e),x=e.clientX-canvas.getBoundingClientRect().left;pointers.set(e.pointerId,{lane,gesture:new FlickGesture(x,e.clientY,e.timeStamp)});press(lane);});
const playWorkspace=$('play-workspace'),stage=$('stage'),preventBrowserGesture=event=>event.preventDefault();
for(const type of ['selectstart','contextmenu','dragstart'])stage.addEventListener(type,preventBrowserGesture);
for(const type of ['gesturestart','gesturechange','gestureend'])playWorkspace.addEventListener(type,preventBrowserGesture,{passive:false});
playWorkspace.addEventListener('touchmove',event=>{if(event.touches.length>1)event.preventDefault();},{passive:false});
let lastTouchEndAt=-Infinity;
playWorkspace.addEventListener('touchend',event=>{const now=Number.isFinite(event.timeStamp)?event.timeStamp:performance.now();if(now-lastTouchEndAt<350)event.preventDefault();lastTouchEndAt=now;},{passive:false});
playWorkspace.addEventListener('dblclick',preventBrowserGesture);
function movePointer(e){
  const p=pointers.get(e.pointerId);if(!p||phase!=='playing')return;
  const lane=pointerLane(e),x=e.clientX-canvas.getBoundingClientRect().left;
  // Sliding changes held lanes and can flick, but never creates a new press.
  if(lane!==p.lane){p.lane=lane;game.update(time(),held());}
  const flick=p.gesture.move(x,e.clientY,e.timeStamp);
  if(flick)game.flick([flickLane(flick.fromX),flickLane(flick.x)],time());
}
canvas.addEventListener('pointermove',movePointer);
function release(e){if(e.type==='pointerup')movePointer(e);pointers.delete(e.pointerId);if(phase==='playing')game.update(time(),held());}canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('blur',()=>pause());
playbackMenuToggle.onclick=()=>setPlaybackMenu(playbackMenuPanel.hidden);
document.addEventListener('pointerdown',event=>{if(!event.target.closest?.('.playback-menu'))setPlaybackMenu(false);});
$('start').onclick=()=>{start();$('start').blur();};$('pause').onclick=()=>{if(phase==='playing')pause();else resume();setPlaybackMenu(false);playbackMenuToggle.focus();};$('restart').onclick=()=>{reset();setPlaybackMenu(false);playbackMenuToggle.focus();};$('theater-toggle').onclick=()=>{setTheaterMode(!playbackSection.classList.contains('theater-mode'));setPlaybackMenu(false);playbackMenuToggle.focus();};
$('auto').onchange=()=>{if(phase==='ended')reset();else game.auto=$('auto').checked;};$('volume').oninput=()=>{const level=Number($('volume').value)/100;$('volume-value').value=`${$('volume').value}%`;if(master){master.gain.setTargetAtTime(level*.38,audio.currentTime,.02);trackGain.gain.setTargetAtTime(level,audio.currentTime,.02);}};
const speedInput=$('speed'),startPositionInput=$('note-start-position'),visibleTimeOutput=$('note-visible-time');
function syncPlaySettings(){speedInput.value=playSettings.noteSpeed.toFixed(1);startPositionInput.value=String(playSettings.noteStartPosition);visibleTimeOutput.value=`${getNoteVisibleTimeMs(playSettings.noteSpeed,playSettings.noteStartPosition)} ms`;$('note-thickness').value=String(playSettings.noteThickness);$('note-thickness-value').value=`${playSettings.noteThickness}%`;localStorage.setItem(PLAY_SETTINGS_KEY,JSON.stringify(playSettings));}
function updatePlaySetting(key,value){const number=Number(value);if(!Number.isFinite(number)){syncPlaySettings();return;}if(key==='noteSpeed')playSettings.noteSpeed=Math.max(1,Math.min(25,Math.round(number*10)/10));else playSettings.noteStartPosition=Math.max(0,Math.min(100,Math.round(number/5)*5));syncPlaySettings();}
for(const [id,key,step] of [['speed-down','noteSpeed',-.1],['speed-up','noteSpeed',.1],['note-start-down','noteStartPosition',-5],['note-start-up','noteStartPosition',5]])$(id).onclick=()=>updatePlaySetting(key,playSettings[key]+step);
speedInput.onchange=()=>updatePlaySetting('noteSpeed',speedInput.value);startPositionInput.onchange=()=>updatePlaySetting('noteStartPosition',startPositionInput.value);speedInput.onkeydown=startPositionInput.onkeydown=event=>{if(['e','E','+','-'].includes(event.key))event.preventDefault();};$('note-thickness').oninput=()=>{playSettings.noteThickness=Math.max(50,Math.min(200,Math.round(Number($('note-thickness').value)/10)*10));syncPlaySettings();};syncPlaySettings();
function syncChartMeta(){const duration=formatTime(chartDuration());$('play-title').textContent=chartData.metadata.title;$('play-difficulty').textContent=chartData.metadata.difficulty;$('track-title').textContent=chartData.metadata.title;$('track-bpm').textContent=chartData.timing.bpm;$('track-duration').textContent=duration;$('total-time').textContent=duration;$('track-source').textContent=externalTrack?externalTrack.fileName:'オリジナル・シンセデモ';}
const latestNoteEnd=chart=>Math.max(1000,...(Array.isArray(chart?.notes)?chart.notes:[]).map(n=>(Number(n?.timeMs)||0)+(Number(n?.durationMs)||0)));
function storeChart(next){const candidate=structuredClone(next);if(externalTrack){const offset=Number(candidate.timing?.offsetMs??0),audioEnd=Number.isFinite(offset)?externalTrack.durationMs-offset:0;candidate.metadata={...(candidate.metadata||{}),durationMs:Math.max(candidate.metadata?.durationMs??0,latestNoteEnd(candidate),audioEnd,1000)};}chartData=validateChartData(candidate);localStorage.setItem('twelve-chart-v1',JSON.stringify(chartData));syncChartMeta();return chartData;}
async function loadAudioFile(file){await audioInit();let buffer;try{buffer=await audio.decodeAudioData(await file.arrayBuffer());}catch{throw new Error('このブラウザーで再生できる音声形式ではありません');}if(!buffer?.duration||!Number.isFinite(buffer.duration))throw new Error('音源の長さを取得できません');const previousTrack=externalTrack,nextTrack={buffer,fileName:file.name,mimeType:file.type||'audio/*',durationMs:Math.round(buffer.duration*1000)};silence();externalTrack=nextTrack;try{storeChart(chartData);reset();}catch(error){externalTrack=previousTrack;syncChartMeta();throw error;}return{fileName:externalTrack.fileName,durationMs:externalTrack.durationMs,mimeType:externalTrack.mimeType};}
function clearAudioFile(){silence();externalTrack=null;syncChartMeta();reset();}
function getAudioInfo(){return externalTrack&&{fileName:externalTrack.fileName,durationMs:externalTrack.durationMs,mimeType:externalTrack.mimeType};}
function switchMode(mode){const editing=mode==='editor';setPlaybackMenu(false);if(editing&&phase==='playing')pause();if(editing)setTheaterMode(false);else editor.stop();$('play-workspace').hidden=editing;$('editor-workspace').hidden=!editing;$('mode-play').classList.toggle('active',!editing);$('mode-editor').classList.toggle('active',editing);document.title=`TWELVE — ${editing?'譜面制作':'譜面再生'}`;history.replaceState(null,'',editing?'#editor':location.pathname);if(editing)editor.refresh();}
const editor=initEditor({getChart:()=>chartData,setChart:storeChart,onAudioFile:loadAudioFile,onClearAudio:clearAudioFile,getAudioInfo,onAuditionStart:startEditorAudition,onAuditionStop:stopEditorAudition,onAuditionHit:playEditorHit,onPreview:next=>{storeChart(next);switchMode('play');reset();}});
$('mode-play').onclick=()=>switchMode('play');$('mode-editor').onclick=()=>switchMode('editor');
syncChartMeta();newGame();resize();requestAnimationFrame(frame);if(location.hash==='#editor')switchMode('editor');
if(document.modelContext?.registerTool){const lifecycle=new AbortController();try{Promise.resolve(document.modelContext.registerTool({name:'get_playback_state',description:'現在の譜面再生位置とスコアを読み取ります。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:input=>{if(!input||typeof input!=='object'||Object.keys(input).length)throw new Error('空のオブジェクトを指定してください');return{phase,elapsed:Math.round(elapsed*100)/100,auto:game.auto,score:game.score,combo:game.combo,judgements:{perfectPlus:game.perfectPlus,perfect:game.perfect,great:game.great,good:game.good,bad:game.bad,miss:game.miss,auto:game.autoCount}};}},{signal:lifecycle.signal})).catch(()=>{});}catch{}window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});}
