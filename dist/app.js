import { Game, FlickGesture, KEYS, LABELS, DURATION, HOLD_INTERVAL, holdBodyTickCount, noteSpanAt } from './engine.mjs';
const $=id=>document.getElementById(id),canvas=$('game'),ctx=canvas.getContext('2d');
let game,phase='ready',elapsed=0,epoch=0,audio,master,scheduledStep=0,frameTime=0,judgeUntil=0;
const keys=new Set(),pointers=new Map(),effects=[],voices=new Set();
const held=()=>new Set([...keys,...[...pointers.values()].map(p=>p.lane)]);
let width=0,height=0,ratio=1;
function resize(){const r=canvas.getBoundingClientRect();width=r.width;height=r.height;ratio=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);}
new ResizeObserver(resize).observe(canvas);
function newGame(){game=new Game($('auto').checked);game.onJudge=(grade,n,span)=>{const purple=n.type==='flick'||n.type==='flick-hold';$('score').textContent=String(game.score).padStart(7,'0');$('combo').textContent=game.combo;$('combo-box').style.display=game.combo>0?'block':'none';$('judgement').textContent=grade;$('judgement').style.color=grade==='MISS'?'#ff8291':purple?'#c68aff':n.duration?'#70dcf8':'#b9f78d';judgeUntil=performance.now()+550;if(grade!=='MISS')effects.push({lane:span.lane,width:span.width,start:performance.now(),hold:!!n.duration,flick:purple});};}
function audioInit(){if(!audio){audio=new (window.AudioContext||window.webkitAudioContext)();master=audio.createGain();master.gain.value=Number($('volume').value)/100*.38;master.connect(audio.destination);}return audio.resume();}
function tone(freq,at,duration,type='sine',level=.16,slide=0){const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(freq,at);if(slide)o.frequency.exponentialRampToValueAtTime(slide,at+duration);g.gain.setValueAtTime(.001,at);g.gain.exponentialRampToValueAtTime(level,at+.006);g.gain.exponentialRampToValueAtTime(.001,at+duration);o.connect(g);g.connect(master);o.start(at);o.stop(at+duration+.015);voices.add(o);o.onended=()=>{voices.delete(o);g.disconnect();o.disconnect();};}
function silence(){for(const v of voices){try{v.stop();}catch{}}voices.clear();}
function schedule(){const melody=[0,7,12,14,7,12,3,7,0,10,12,7,3,7,10,14],roots=[130.81,103.83,155.56,116.54];while(2+scheduledStep*.25<elapsed+.12&&2+scheduledStep*.25<39){const step=scheduledStep++,at=epoch+2+step*.25;if(at<audio.currentTime-.04)continue;const root=roots[Math.floor(step/16)%4];if(step%2===0)tone(125,at,.19,'sine',.7,35);if(step%4===2){tone(180,at,.09,'triangle',.24,70);tone(1200,at,.05,'square',.035);}tone(7200+(step%2)*1200,at,.025,'square',.018);tone(root*2*Math.pow(2,melody[step%16]/12),at,.2,'triangle',.18);if(step%4===0)tone(root/2,at,.7,'sine',.32);}}
function time(){return phase==='playing'?Math.min(DURATION,audio.currentTime-epoch):elapsed;}
function setPhase(p){phase=p;$('state-label').textContent=({ready:'READY',playing:game.auto?'AUTO PLAY':'PLAYING',paused:'PAUSED',ended:'FINISHED'})[p];$('pause').disabled=p==='ready'||p==='ended';$('pause').textContent=p==='playing'?'Ⅱ 一時停止':'▶ 再生';$('auto').disabled=p==='playing'||p==='paused';}
async function start(){if(phase==='playing')return;if(phase==='paused'){await resume();return;}try{await audioInit();}catch{$('overlay-description').textContent='音声を開始できませんでした。もう一度お試しください。';return;}silence();keys.clear();pointers.clear();newGame();elapsed=0;scheduledStep=0;epoch=audio.currentTime;$('overlay').style.display='none';$('score').textContent='0000000';$('combo-box').style.display='none';$('judgement').textContent='';setPhase('playing');}
function pause(){if(phase!=='playing')return;elapsed=time();game.update(elapsed,held());silence();setPhase('paused');keys.clear();pointers.clear();game.update(elapsed,held());showOverlay('PAUSED','ひと休み。','ホールドは途中からでも押し直せます。','▶ 続ける');}
async function resume(){try{await audioInit();}catch{return;}epoch=audio.currentTime-elapsed;scheduledStep=Math.max(0,Math.ceil((elapsed-2)/.25));keys.clear();pointers.clear();setPhase('playing');$('overlay').style.display='none';}
function showOverlay(label,title,description,button){$('overlay').style.display='flex';$('overlay-label').textContent=label;$('overlay-title').textContent=title;$('overlay-description').textContent=description;$('start').textContent=button;}
function reset(){silence();elapsed=0;keys.clear();pointers.clear();effects.length=0;newGame();setPhase('ready');$('score').textContent='0000000';$('combo-box').style.display='none';$('judgement').textContent='';showOverlay('12 LANES. YOUR RHYTHM.','リズムを、つかもう。','赤はタップ。水色は長押し。紫はフリック。','▶ プレイする');}
function end(){elapsed=DURATION;setPhase('ended');keys.clear();pointers.clear();showOverlay(game.auto?'AUTO PLAY COMPLETE':'PLAY COMPLETE',game.auto?'譜面再生が完了しました':'おつかれさま！',`PERFECT ${game.perfect} · GOOD ${game.good} · MISS ${game.miss} / MAX COMBO ${game.maxCombo}`,'↺ もう一度プレイ');}
function drawFlickArrows(x,y,w){
  const half=w/2,count=Math.max(1,Math.floor(half/13)),spacing=half/count,chevronW=Math.min(6,spacing*.48),center=x+half,cy=y-16;
  ctx.strokeStyle='#d8b1ff';ctx.lineWidth=2;ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();
  for(const direction of [-1,1])for(let i=0;i<count;i++){
    const tip=center+direction*(spacing*(i+.78));
    ctx.moveTo(tip-direction*chevronW,cy-4);ctx.lineTo(tip,cy);ctx.lineTo(tip-direction*chevronW,cy+4);
  }
  ctx.stroke();ctx.lineCap='butt';
}
function draw(now){
  const laneW=width/12,hitY=height-68,travel=3.2/Number($('speed').value),pps=(hitY-20)/travel;
  ctx.clearRect(0,0,width,height);
  const active=held();if(game.auto&&phase==='playing')for(const n of game.notes)if(n.state==='holding'){const span=noteSpanAt(n,elapsed),from=Math.max(0,Math.floor(span.lane)),to=Math.min(12,Math.ceil(span.lane+span.width));for(let l=from;l<to;l++)active.add(l);}
  for(let l=0;l<12;l++){ctx.fillStyle=active.has(l)?'#243b39':l%2===0?'#121b28':'#101823';ctx.fillRect(l*laneW,0,laneW,height);ctx.fillStyle=l%3===0?'#324051':'#223040';ctx.fillRect(l*laneW,0,1,height);}
  for(let beat=Math.floor(elapsed/.5);beat<elapsed/.5+travel*2+2;beat++){const y=hitY-(beat*.5-elapsed)*pps;if(y<0||y>hitY)continue;ctx.fillStyle=beat%4===0?'#324052':'#1e2c3a';ctx.fillRect(0,y,width,1);}
  const topFade=ctx.createLinearGradient(0,0,0,85);topFade.addColorStop(0,'#0c121c');topFade.addColorStop(1,'#0c121c00');
  for(const n of game.notes){
    if(n.state==='hit'||n.state==='miss')continue;
    const isFlickHold=n.type==='flick-hold',purple=n.type==='flick'||isFlickHold;
    const y=hitY-(n.time-elapsed)*pps,rawTail=hitY-(n.time+n.duration-elapsed)*pps,tail=isFlickHold?Math.min(rawTail,hitY):rawTail;
    if(y<-20||tail>height)continue;
    const lowerTime=n.duration?Math.max(n.time,Math.min(elapsed,n.time+n.duration)):n.time;
    const lowerSpan=noteSpanAt(n,lowerTime),endSpan=noteSpanAt(n,n.time+n.duration);
    const x=lowerSpan.lane*laneW+3,w=lowerSpan.width*laneW-6,endX=endSpan.lane*laneW+3,endW=endSpan.width*laneW-6,head=n.duration?Math.min(y,hitY):y;
    if(n.duration){
      const tint=isFlickHold?'#b875ff':'#70dcf8',body=ctx.createLinearGradient(0,Math.min(tail,head-1),0,head);body.addColorStop(0,tint+'22');body.addColorStop(1,tint+(n.state==='holding'?'b0':'63'));ctx.fillStyle=body;
      ctx.beginPath();ctx.moveTo(x,head);ctx.lineTo(x+w,head);ctx.lineTo(endX+endW,tail);ctx.lineTo(endX,tail);ctx.closePath();ctx.fill();
      ctx.strokeStyle=tint+'7a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,head);ctx.lineTo(endX,tail);ctx.moveTo(x+w,head);ctx.lineTo(endX+endW,tail);ctx.stroke();
      ctx.fillStyle=isFlickHold?'#e5c9ff':'#a0ebff';ctx.fillRect(endX,tail,endW,3);
    }
    if(n.duration){ctx.fillStyle=isFlickHold?(n.state==='holding'?'#e5c9ff80':'#b875ff40'):(n.state==='holding'?'#bcefff80':'#70dcf840');for(let tick=n.nextTick;tick<holdBodyTickCount(n);tick++){const tickTime=n.time+Math.min(tick*HOLD_INTERVAL,n.duration),tickY=hitY-(tickTime-elapsed)*pps,span=noteSpanAt(n,tickTime),tickX=span.lane*laneW+6,tickW=span.width*laneW-12;if(tickY>=0&&tickY<head-7)ctx.fillRect(tickX,tickY,Math.max(0,tickW),1);}}
    const color=purple?'#b875ff':n.duration?'#70dcf8':'#ff4e64';
    ctx.shadowColor=color;ctx.shadowBlur=n.state==='holding'?20:10;ctx.fillStyle=color;ctx.fillRect(x,head-6,w,12);ctx.shadowBlur=0;ctx.fillStyle=purple?'#e5c9ff':n.duration?'#c5f4ff':'#ffb1bb';ctx.fillRect(x,head-6,w,2);
    if(n.type==='flick')drawFlickArrows(x,head,w);
    if(isFlickHold){
      ctx.shadowColor='#b875ff';ctx.shadowBlur=12;ctx.fillStyle='#b875ff';ctx.fillRect(endX,tail-6,endW,12);ctx.shadowBlur=0;ctx.fillStyle='#e5c9ff';ctx.fillRect(endX,tail-6,endW,2);drawFlickArrows(endX,tail,endW);
    }
  }
  ctx.fillStyle=topFade;ctx.fillRect(0,0,width,85);
  const glow=ctx.createLinearGradient(0,hitY-25,0,hitY+15);glow.addColorStop(0,'#b9f78d00');glow.addColorStop(.65,'#b9f78d20');glow.addColorStop(1,'#b9f78d00');ctx.fillStyle=glow;ctx.fillRect(0,hitY-25,width,40);ctx.fillStyle='#b9f78d';ctx.fillRect(0,hitY,width,2);
  for(let i=effects.length-1;i>=0;i--){const e=effects[i],age=(now-e.start)/450;if(age>=1){effects.splice(i,1);continue;}ctx.globalAlpha=(1-age)*.8;ctx.strokeStyle=e.flick?'#c68aff':e.hold?'#70dcf8':'#ff8291';ctx.lineWidth=2;ctx.strokeRect(e.lane*laneW+3-age*5,hitY-7-age*23,e.width*laneW-6+age*10,14+age*46);ctx.globalAlpha=1;}
  for(let l=0;l<12;l++){ctx.fillStyle=active.has(l)?'#b9f78d':'#8392a6';ctx.font=`500 ${Math.max(12,Math.min(16,laneW*.4))}px sans-serif`;ctx.textAlign='center';ctx.fillText(LABELS[l],laneW*(l+.5),height-33);ctx.fillStyle='#65758c';ctx.font='10px sans-serif';ctx.fillText(String(l+1).padStart(2,'0'),laneW*(l+.5),height-14);}
}
function frame(now){if(phase==='playing'){elapsed=time();game.update(elapsed,held());for(const p of pointers.values())p.gesture.rest(now);schedule();if(elapsed>=DURATION)end();}if(now>judgeUntil)$('judgement').textContent='';draw(now);if(now-frameTime>100){$('elapsed').textContent=`0:${String(Math.floor(elapsed)).padStart(2,'0')}`;$('progress-fill').style.width=`${elapsed/DURATION*100}%`;document.querySelector('.progress').setAttribute('aria-valuenow',String(Math.floor(elapsed)));frameTime=now;}requestAnimationFrame(frame);}
function press(lane){if(phase==='playing'){const t=time();game.update(t,held());game.press(lane,t);}}
window.addEventListener('keydown',e=>{if(e.target.matches('input,select,button,a'))return;if(e.code==='Space'){e.preventDefault();if(!e.repeat){if(phase==='playing')pause();else if(phase==='paused')resume();else start();}return;}const lane=KEYS.indexOf(e.code);if(lane<0)return;e.preventDefault();if(!e.repeat){keys.add(lane);press(lane);}});
window.addEventListener('keyup',e=>{const lane=KEYS.indexOf(e.code);if(lane>=0){keys.delete(lane);if(phase==='playing')game.update(time(),held());}});
const pointerLane=e=>Math.max(0,Math.min(11,Math.floor((e.clientX-canvas.getBoundingClientRect().left)/width*12)));
const flickLane=x=>x<0||x>=width?-1:Math.floor(x/width*12);
canvas.addEventListener('pointerdown',e=>{if(phase!=='playing'||(e.pointerType==='mouse'&&e.button!==0))return;e.preventDefault();canvas.setPointerCapture(e.pointerId);const lane=pointerLane(e),x=e.clientX-canvas.getBoundingClientRect().left;pointers.set(e.pointerId,{lane,gesture:new FlickGesture(x,e.clientY,e.timeStamp)});press(lane);});
function movePointer(e){
  const p=pointers.get(e.pointerId);if(!p||phase!=='playing')return;
  const lane=pointerLane(e),x=e.clientX-canvas.getBoundingClientRect().left;
  if(lane!==p.lane){p.lane=lane;press(lane);}
  const flick=p.gesture.move(x,e.clientY,e.timeStamp);
  if(flick)game.flick([flickLane(flick.fromX),flickLane(flick.x)],time());
}
canvas.addEventListener('pointermove',movePointer);
function release(e){if(e.type==='pointerup')movePointer(e);pointers.delete(e.pointerId);if(phase==='playing')game.update(time(),held());}canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('blur',()=>pause());
$('start').onclick=()=>{start();$('start').blur();};$('pause').onclick=()=>{if(phase==='playing')pause();else resume();$('pause').blur();};$('restart').onclick=()=>{reset();$('restart').blur();};
$('auto').onchange=()=>{if(phase==='ended')reset();else game.auto=$('auto').checked;};$('volume').oninput=()=>{$('volume-value').value=`${$('volume').value}%`;if(master)master.gain.setTargetAtTime(Number($('volume').value)/100*.38,audio.currentTime,.02);};
newGame();resize();requestAnimationFrame(frame);
if(document.modelContext?.registerTool){const lifecycle=new AbortController();try{Promise.resolve(document.modelContext.registerTool({name:'get_playback_state',description:'現在の譜面再生位置とスコアを読み取ります。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:input=>{if(!input||typeof input!=='object'||Object.keys(input).length)throw new Error('空のオブジェクトを指定してください');return{phase,elapsed:Math.round(elapsed*100)/100,auto:game.auto,score:game.score,combo:game.combo};}},{signal:lifecycle.signal})).catch(()=>{});}catch{}window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});}
