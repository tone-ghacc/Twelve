import {validateFixedKeyboardNotes,validateFixedKeyboardSections,prepareFixedKeyboardChart,FixedKeyboardTimeline} from './fixed-keyboard.mjs';

export const MIN_HOLD_DURATION_MS = 1;
export const HOLD_INTERVAL = 0.1;
export const HOLD_INTERVAL_MS = Math.round(HOLD_INTERVAL * 1000);
export const FLICK_HANDOFF_SECONDS = .16;
const EPSILON = 1e-7;
export const HOLD_START_TYPES = Object.freeze(['none','normal','scratch']);
export const JUDGEMENT_WINDOWS = Object.freeze([
  ['PERFECT+',.025],['PERFECT',.04],['GREAT',.07],['GOOD',.1],['BAD',.125],['MISS',.16]
]);
export const SCORE_MULTIPLIERS = Object.freeze({'PERFECT+':1.01,PERFECT:1,GREAT:.8,GOOD:.5,BAD:0,MISS:0,AUTO:0});
export const timingGrade = difference => JUDGEMENT_WINDOWS.find(([,limit])=>Math.abs(difference)<=limit+EPSILON)?.[0]??null;
export const isHoldNote = n => n.type==='hold'||n.type==='flick-hold';

// Checkpoints are relative millisecond offsets. The endpoint is always a
// separate judgement, so it is deliberately excluded from this list.
export function defaultHoldCheckpoints(durationMs,intervalMs=HOLD_INTERVAL_MS){
  const result=[];
  for(let offset=intervalMs;offset<durationMs;offset+=intervalMs)result.push(offset);
  return result;
}

export const holdTickCount = duration => defaultHoldCheckpoints(Math.round(duration*1000)).length+1;
export const holdBodyTickCount = n => Array.isArray(n.checkpoints)?n.checkpoints.length:defaultHoldCheckpoints(Math.round(n.duration*1000)).length;
// Hold bodies never move or change width. Their start span is their full span.
export const noteSpanAt = n => ({lane:n.lane,width:n.width});
export const flickSpan = n => n.type==='flick-hold'
  ? {lane:n.flickLane??n.endFlick?.lane??n.lane,width:n.flickWidth??n.endFlick?.width??n.width}
  : {lane:n.lane,width:n.width};
export const KEYS = ['KeyQ','KeyW','KeyE','KeyR','KeyT','KeyY','KeyU','KeyI','KeyO','KeyP','BracketLeft','BracketRight'];
export const LABELS = ['Q','W','E','R','T','Y','U','I','O','P','[',']'];

export function createJudgementEvents(note){
  const events=[];
  const push=(suffix,kind,timeMs,input,span={lane:note.lane,width:note.width})=>events.push({id:`${note.id}:${suffix}`,noteId:note.id,kind,timeMs,input,lane:span.lane,width:span.width,critical:input==='press'&&!!note.critical});
  if(!isHoldNote(note)){
    push('note',note.type==='flick'?'flick':(note.critical?'critical-tap':'tap'),note.timeMs,note.type==='flick'?'flick':'press');
    return events;
  }
  if(note.startType==='normal')push('start',note.critical?'critical-hold-start':'hold-start',note.timeMs,'press');
  else if(note.startType==='scratch')push('start','scratch-start',note.timeMs,'flick');
  for(const offset of note.checkpoints??defaultHoldCheckpoints(note.durationMs))push(`checkpoint-${offset}`,'hold-checkpoint',note.timeMs+offset,'hold');
  const endTime=note.timeMs+note.durationMs;
  if(note.type==='flick-hold')push('end','flick-end',endTime,'flick',note.endFlick);
  else push('end','hold-end',endTime,'hold');
  return events;
}

export function createDefaultChartData() {
  const notes = [];
  const add = (time,lane,width=1,duration=0,type=duration?'hold':'tap',flickLane=lane,flickWidth=width,chain=null) => notes.push({timeMs:Math.round(time*1000),lane,width,durationMs:Math.round(duration*1000),type,flickLane,flickWidth,chain});
  add(2,0,2); add(2.5,3,2,0,'flick'); add(3,6,3); add(3.5,10,2);
  add(4,1,3,1.5); add(4.5,7,2); add(5,10,2);
  add(6,6,3,1.5,'flick-hold',3,8,'wide-chain');
  add(6.5,1,2); add(7,3,2);
  add(7.5,7,2,.5,'flick-hold',5,4,'wide-chain');
  for(let block=0;block<7;block++) {
    const t=8+block*4, flip=block%2;
    add(t,flip?8:0,3); add(t+.5,flip?5:3,2);
    if(flip){const chain=`wide-chain-${block}`;add(t+1,1,3,1.5,'flick-hold',0,6,chain);add(t+2.5,4,2,.4,block===3?'flick-hold':'hold',3,4,chain);}
    else {const chain=`hold-chain-${block}`;add(t+1,8,3,1.5,'hold',8,3,chain);add(t+2.5,9,2,.4,block%4===2?'flick-hold':'hold',8,4,chain);}
    add(t+1.5,flip?8:1,2); add(t+2,flip?5:4,2); add(t+3,flip?7:0,4,0,'flick'); add(t+3.5,flip?1:7,3);
  }
  add(36,0,4,1.5); add(36,8,4,1.5,'flick-hold'); add(38,0,12,0,'flick');
  notes.sort((a,b)=>a.timeMs-b.timeMs||a.lane-b.lane).forEach((n,index)=>n.id=`note-${String(index+1).padStart(3,'0')}`);
  let holdIndex=0;
  for(const [index,n] of notes.entries()){
    if(n.type==='flick-hold')n.endFlick={lane:n.flickLane,width:n.flickWidth};
    delete n.flickLane;delete n.flickWidth;
    if(n.durationMs){
      n.startType=['normal','scratch','none'][holdIndex%3];
      n.checkpoints=defaultHoldCheckpoints(n.durationMs);
      if(n.startType==='normal'&&holdIndex%2===0)n.critical=true;
      holdIndex++;
    }else{
      if(n.type==='tap'&&index%11===2)n.critical=true;
      delete n.durationMs;
    }
  }
  for(const chain of new Set(notes.map(n=>n.chain).filter(Boolean))){const linked=notes.filter(n=>n.chain===chain);if(linked.length===2){linked[0].nextId=linked[1].id;linked[1].startType='none';}}
  for(const n of notes)delete n.chain;
  return {schemaVersion:1,metadata:{title:'First light',artist:'TWELVE',difficulty:'DEMO',laneCount:12,durationMs:40000},timing:{bpm:120,bpmChanges:[{timeMs:20000,bpm:180}],offsetMs:0,timeSignature:[4,4]},notes};
}

export function validateChartData(input,{checkFixedKeyboardNotes=true}={}) {
  if(!input||input.schemaVersion!==1||!Array.isArray(input.notes))throw new Error('schemaVersion 1 の譜面JSONを指定してください');
  const chart=structuredClone(input),ids=new Set(),types=new Set(['tap','flick','hold','flick-hold']);
  const durationMs=Number(chart.metadata?.durationMs??40000);if(!Number.isInteger(durationMs)||durationMs<1000||durationMs>86400000)throw new Error('譜面の長さは1秒〜24時間の整数msで指定してください');
  chart.metadata={title:String(chart.metadata?.title||'Untitled'),artist:String(chart.metadata?.artist||''),difficulty:String(chart.metadata?.difficulty||'EDIT'),laneCount:12,durationMs};
  const bpm=Number(chart.timing?.bpm??120);if(!Number.isFinite(bpm)||bpm<20||bpm>400)throw new Error('BPMは20〜400で指定してください');
  const offsetMs=Number(chart.timing?.offsetMs??0);if(!Number.isInteger(offsetMs)||Math.abs(offsetMs)>86400000)throw new Error('オフセットは±24時間以内の整数msで指定してください');
  const timeSignature=chart.timing?.timeSignature??[4,4];if(!Array.isArray(timeSignature)||timeSignature.length!==2||timeSignature.some(value=>!Number.isInteger(value)||value<1||value>32))throw new Error('拍子は1〜32の整数2つで指定してください');
  const rawBpmChanges=chart.timing?.bpmChanges??[];if(!Array.isArray(rawBpmChanges))throw new Error('BPM変更は配列で指定してください');
  const bpmChangeTimes=new Set(),bpmChanges=rawBpmChanges.map((change,index)=>{const timeMs=Number(change?.timeMs),nextBpm=Number(change?.bpm);if(!Number.isInteger(timeMs)||timeMs<=0||timeMs>=durationMs)throw new Error(`BPM変更 ${index+1}: 時刻は譜面の途中の整数msで指定してください`);if(!Number.isFinite(nextBpm)||nextBpm<20||nextBpm>400)throw new Error(`BPM変更 ${index+1}: BPMは20〜400で指定してください`);if(bpmChangeTimes.has(timeMs))throw new Error(`BPM変更 ${index+1}: 同じ時刻に複数のBPMは設定できません`);bpmChangeTimes.add(timeMs);return{timeMs,bpm:nextBpm};}).sort((a,b)=>a.timeMs-b.timeMs);
  chart.timing={bpm,bpmChanges,offsetMs,timeSignature:[...timeSignature]};
  chart.fixedKeyboardSections=validateFixedKeyboardSections(chart.fixedKeyboardSections,durationMs);
  for(const n of chart.notes){
    if(!n||typeof n.id!=='string'||!n.id||ids.has(n.id))throw new Error('ノーツIDは重複しない文字列にしてください');ids.add(n.id);
    if(!types.has(n.type))throw new Error(`${n.id}: 未対応のノーツ種類です`);
    for(const key of ['timeMs','lane','width'])if(!Number.isInteger(n[key]))throw new Error(`${n.id}: ${key} は整数で指定してください`);
    if(n.timeMs<0||n.timeMs>durationMs||n.lane<0||n.width<1||n.lane+n.width>12)throw new Error(`${n.id}: 時刻またはレーン範囲が不正です`);
    // Migrate saved charts from the old unsupported Critical Flick variant.
    n.critical=n.type!=='flick'&&n.critical===true;
    if(isHoldNote(n)){
      if(!Number.isInteger(n.durationMs)||n.durationMs<MIN_HOLD_DURATION_MS||n.timeMs+n.durationMs>durationMs)throw new Error(`${n.id}: ホールド時間は1ms以上の整数で、終点を譜面内に指定してください`);
      n.startType=n.startType??'none';
      if(!HOLD_START_TYPES.includes(n.startType))throw new Error(`${n.id}: startType は none / normal / scratch で指定してください`);
      if(n.startType==='scratch'&&n.critical)throw new Error(`${n.id}: スクラッチ始点にCritical属性は設定できません`);
      n.checkpoints=n.checkpoints??defaultHoldCheckpoints(n.durationMs);
      if(!Array.isArray(n.checkpoints)||n.checkpoints.some(value=>!Number.isInteger(value)||value<=0||value>=n.durationMs))throw new Error(`${n.id}: checkpoints は始点より後、終点より前の相対整数msで指定してください`);
      if(new Set(n.checkpoints).size!==n.checkpoints.length)throw new Error(`${n.id}: checkpoints を重複させることはできません`);
      n.checkpoints.sort((a,b)=>a-b);
    }else {delete n.durationMs;delete n.endFlick;delete n.nextId;delete n.startType;delete n.checkpoints;}
    if(n.type==='flick-hold'){
      const f=n.endFlick;if(!f||!Number.isInteger(f.lane)||!Number.isInteger(f.width)||f.lane<0||f.width<1||f.lane+f.width>12)throw new Error(`${n.id}: 終点フリックの範囲が不正です`);
      n.endFlick={lane:f.lane,width:f.width};
    }else delete n.endFlick;
  }
  const incoming=new Set();
  for(const n of chart.notes){if(!n.nextId)continue;const next=chart.notes.find(x=>x.id===n.nextId);if(!next||!isHoldNote(n)||!isHoldNote(next))throw new Error(`${n.id}: 接続先はホールドにしてください`);if(incoming.has(next.id))throw new Error(`${next.id}: 複数のノーツからは接続できません`);incoming.add(next.id);const span=n.type==='flick-hold'?n.endFlick:n;if(next.timeMs!==n.timeMs+n.durationMs||next.lane<span.lane||next.lane+next.width>span.lane+span.width)throw new Error(`${n.id}: 接続先を終点時刻と範囲内に配置してください`);}
  for(const start of chart.notes){const seen=new Set();let n=start;while(n?.nextId){if(seen.has(n.id))throw new Error('連結を循環させることはできません');seen.add(n.id);n=chart.notes.find(x=>x.id===n.nextId);}}
  if(checkFixedKeyboardNotes)validateFixedKeyboardNotes(chart);
  chart.notes.sort((a,b)=>a.timeMs-b.timeMs||a.lane-b.lane||a.id.localeCompare(b.id));return chart;
}

export function createChart(chartData=createDefaultChartData()) {
  const chart=validateChartData(chartData);
  return chart.notes.map((n,id)=>({
    time:n.timeMs/1000,lane:n.lane,width:n.width,duration:(n.durationMs||0)/1000,type:n.type,
    flickLane:n.endFlick?.lane??n.lane,flickWidth:n.endFlick?.width??n.width,nextId:n.nextId||null,
    sourceId:n.id,id,critical:!!n.critical,startType:n.startType??null,checkpoints:n.checkpoints??[],
    events:createJudgementEvents(n).map(event=>({...event,time:event.timeMs/1000,state:'pending',judgedAt:null,grade:null})),
    state:'pending',holdHits:0
  }));
}

export class Game {
  constructor(auto=false,chartData=createDefaultChartData(),{randomizeFixedKeyboard=false,rng=Math.random}={}) {
    const prepared=prepareFixedKeyboardChart(validateChartData(chartData),randomizeFixedKeyboard,rng);
    this.fixedKeyboard=new FixedKeyboardTimeline(prepared.sections);
    this.auto=auto;this.notes=createChart(prepared.chart);this.totalJudgements=this.notes.reduce((total,n)=>total+n.events.length,0);this.held=new Set();this.lastTime=0;this.combo=0;this.maxCombo=0;this.score=0;this.perfectPlus=0;this.perfect=0;this.great=0;this.good=0;this.bad=0;this.miss=0;this.autoCount=0;this.earned=0;this.onJudge=()=>{};
    this.pointers=new Map();this.handoffs=new Map();this.notesById=new Map(this.notes.map(n=>[n.sourceId,n]));
  }
  covers(n,lane){return this.spanCovers(noteSpanAt(n),lane);}
  spanCovers(span,lane,padding=0){return Number.isInteger(lane)&&lane>=0&&lane<KEYS.length&&lane>=Math.max(0,span.lane-padding)&&lane<Math.min(KEYS.length,span.lane+span.width+padding);}
  eventSpan(event){return{lane:event.lane,width:event.width};}
  eventCovers(event,lane,padding=0){return this.spanCovers(this.eventSpan(event),lane,padding);}
  finishEvent(n,event,grade,at=event.time){
    if(!event||event.state!=='pending'||!grade)return;
    const previousGrade=event.provisionalGrade??null;
    if(previousGrade&&SCORE_MULTIPLIERS[grade]<SCORE_MULTIPLIERS[previousGrade])grade=previousGrade;
    event.state=grade==='MISS'?'miss':'hit';event.grade=grade;event.judgedAt=at;
    if(event.input==='hold'&&grade!=='MISS')n.holdHits++;
    if(grade!==previousGrade)this.record(n,grade,this.eventSpan(event),event,previousGrade);
    this.updateNoteState(n);
  }
  // Backward-compatible helper for callers that finish a standalone note.
  finish(n,grade,at=n.time){this.finishEvent(n,n.events.find(event=>event.state==='pending'),grade,at);}
  updateNoteState(n){
    if(n.events.every(event=>event.state!=='pending')){n.state=n.events.some(event=>event.state==='hit')?'hit':'miss';return;}
    if(n.duration&&this.lastTime>=n.time-EPSILON&&this.lastTime<=n.time+n.duration+EPSILON)n.state=this.isSpanHeld(n,this.held)?'holding':'waiting';
    else n.state='pending';
  }
  record(n,grade,span=noteSpanAt(n),event=null,previousGrade=null) {
    const counter={['PERFECT+']:'perfectPlus',PERFECT:'perfect',GREAT:'great',GOOD:'good',BAD:'bad',MISS:'miss',AUTO:'autoCount'}[grade];
    if(counter)this[counter]++;
    if(previousGrade)this.great--;
    else if(grade==='GOOD'||grade==='BAD'||grade==='MISS')this.combo=0;else{this.combo++;this.maxCombo=Math.max(this.maxCombo,this.combo);}
    this.earned+=(SCORE_MULTIPLIERS[grade]??0)-(SCORE_MULTIPLIERS[previousGrade]??0);
    this.score=this.totalJudgements?Math.round(this.earned/this.totalJudgements*1000000):0;this.onJudge(grade,n,span,event);
  }
  isSpanHeld(n,lanes,t=this.lastTime,pointers=this.pointers){
    if(this.auto||[...lanes].some(lane=>this.spanCovers(noteSpanAt(n),lane,1)))return true;
    const handoff=this.handoffs.get(n.sourceId);
    return !!handoff&&t>=n.time-EPSILON&&t<=handoff.until+EPSILON&&pointers.has(handoff.pointerId);
  }
  pointerSnapshot(pointers){return new Map([...pointers].map(([id,p])=>[id,typeof p==='number'?p:p.lane]));}
  prepareFlickHandoff(hit,t,pointerId,pointers){
    if(pointerId===null||!pointers.has(pointerId)||hit.event.kind!=='flick-end'||hit.n.type!=='flick-hold')return;
    const next=this.notesById.get(hit.n.nextId);
    // Explicit start judgements still require their own input. Only the
    // no-start continuation of this exact linked hold receives the grace.
    if(!next||next.type!=='flick-hold'||next.startType!=='none')return;
    const grade=timingGrade(hit.event.time-t);
    if(grade==='MISS'&&!hit.event.provisionalGrade)return;
    this.handoffs.set(next.sourceId,{pointerId,sourceId:hit.n.sourceId,judgedAt:t,until:Math.min(next.time+next.duration,Math.max(next.time,t)+FLICK_HANDOFF_SECONDS)});
  }
  // One input resolves one pending event. Near-equal times prefer the actual
  // note span, then keep the chart/event traversal order as a stable tie-break.
  selectInputCandidate(input,lanes,t){
    if(!Number.isFinite(t))return null;
    let best=null;
    for(const n of this.notes)for(const event of n.events){
      const accepts=input==='press'?(event.input==='press'||(event.input==='flick'&&!event.provisionalGrade)):event.input===input;
      if(event.state!=='pending'||!accepts)continue;
      const distance=Math.abs(event.time-t);
      if(distance>.16+EPSILON||!lanes.some(lane=>this.eventCovers(event,lane,1)))continue;
      const direct=lanes.some(lane=>this.eventCovers(event,lane));
      if(!best||distance<best.distance-EPSILON||(Math.abs(distance-best.distance)<=EPSILON&&direct&&!best.direct))best={n,event,distance,direct};
    }
    return best;
  }
  press(lane,t) {
    if(this.auto)return;
    const hit=this.selectInputCandidate('press',[lane],t);
    if(!hit)return;
    if(hit.event.input==='flick'){
      // Keep the event pending for a flick, but book its minimum result now so
      // subsequent notes and combo breaks retain their actual input order.
      hit.event.provisionalGrade='GREAT';hit.event.provisionalAt=t;
      this.record(hit.n,'GREAT',this.eventSpan(hit.event),hit.event);
    }else this.finishEvent(hit.n,hit.event,timingGrade(hit.event.time-t),t);
  }
  flick(lanes,t,{pointerId=null,pointers=this.pointers,held=this.held}={}) {
    if(this.auto)return;
    const hit=this.selectInputCandidate('flick',lanes,t);
    // Register before settling due checkpoints in this same pointer event.
    // No finished MISS is revived, and the flick still consumes one event.
    if(hit)this.prepareFlickHandoff(hit,t,pointerId,this.pointerSnapshot(pointers));
    this.update(t,held,pointers);
    if(hit)this.finishEvent(hit.n,hit.event,timingGrade(hit.event.time-t),t);
  }
  update(t,held,pointers=this.pointers) {
    if(t<this.lastTime-EPSILON)return;
    this.fixedKeyboard.update(t);
    const currentHeld=new Set(held),currentPointers=this.pointerSnapshot(pointers),due=[];
    for(const n of this.notes){
      const acceptedEndFlick=n.events.find(event=>event.kind==='flick-end'&&event.state==='hit')??[...this.handoffs.values()].find(handoff=>handoff.sourceId===n.sourceId);
      for(const event of n.events){
        if(event.state!=='pending')continue;
        if(this.auto&&t>=event.time-EPSILON){due.push({n,event,grade:'AUTO',at:event.time});continue;}
        if(event.input==='hold'&&t>=event.time-EPSILON){
          const lanes=event.time<t-EPSILON?this.held:currentHeld;
          const pointerState=event.time<t-EPSILON?this.pointers:currentPointers;
          const heldNow=(acceptedEndFlick&&event.kind==='hold-checkpoint'&&event.time>=acceptedEndFlick.judgedAt-EPSILON)||this.isSpanHeld(n,lanes,event.time,pointerState);
          due.push({n,event,grade:heldNow?'PERFECT':'MISS',at:event.time});
        }else if((event.input==='press'||event.input==='flick')&&t>event.time+.16+EPSILON)due.push({n,event,grade:event.provisionalGrade??'MISS',at:event.time+.16});
      }
    }
    due.sort((a,b)=>a.at-b.at||a.n.id-b.n.id||a.event.id.localeCompare(b.event.id));
    for(const item of due)this.finishEvent(item.n,item.event,item.grade,item.at);
    this.held=currentHeld;this.pointers=currentPointers;this.lastTime=t;
    for(const [id,handoff] of this.handoffs){
      const next=this.notesById.get(id),lane=currentPointers.get(handoff.pointerId);
      if(lane===undefined||t>handoff.until+EPSILON||(t>=next.time-EPSILON&&this.spanCovers(noteSpanAt(next),lane,1)))this.handoffs.delete(id);
    }
    for(const n of this.notes)this.updateNoteState(n);
  }
}

// A short movement in any direction, measured in CSS pixels. Each pointer owns
// its own history; old movement and tiny pointer jitter cannot trigger a flick.
export class FlickGesture {
  constructor(x,y,t){this.samples=[{x,y,t}];}
  rest(t){const last=this.samples.at(-1);if(!last||t-last.t<16)return;this.samples=this.samples.filter(p=>t-p.t<=140);this.samples.push({x:last.x,y:last.y,t});}
  move(x,y,t){this.samples=this.samples.filter(p=>t-p.t<=140);const current={x,y,t};const origin=this.samples.find(p=>Math.hypot(x-p.x,y-p.y)>=18);this.samples.push(current);if(!origin)return null;this.samples=[current];return {fromX:origin.x,fromY:origin.y,x,y};}
}
