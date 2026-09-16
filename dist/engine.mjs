export const HOLD_INTERVAL = 0.1;
const EPSILON = 1e-7;
// The start only samples whether the lane is already held; it is not a judgement.
export const holdTickCount = duration => Math.ceil(duration / HOLD_INTERVAL - EPSILON);
// A flick-hold replaces the ordinary end tick with a separate flick judgement.
export const holdBodyTickCount = n => holdTickCount(n.duration) - (n.type==='flick-hold'?1:0);
// Hold bodies never move or change width. Their start span is their full span.
export const noteSpanAt = n => ({lane:n.lane,width:n.width});
export const flickSpan = n => n.type==='flick-hold'
  ? {lane:n.flickLane??n.lane,width:n.flickWidth??n.width}
  : {lane:n.lane,width:n.width};
export const KEYS = ['KeyQ','KeyW','KeyE','KeyR','KeyT','KeyY','KeyU','KeyI','KeyO','KeyP','BracketLeft','BracketRight'];
export const LABELS = ['Q','W','E','R','T','Y','U','I','O','P','[',']'];
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
  for(const n of notes){
    if(n.type==='flick-hold')n.endFlick={lane:n.flickLane,width:n.flickWidth};
    delete n.flickLane;delete n.flickWidth;
    if(!n.durationMs)delete n.durationMs;
  }
  for(const chain of new Set(notes.map(n=>n.chain).filter(Boolean))){const linked=notes.filter(n=>n.chain===chain);if(linked.length===2)linked[0].nextId=linked[1].id;}
  for(const n of notes)delete n.chain;
  return {schemaVersion:1,metadata:{title:'First light',artist:'TWELVE',difficulty:'DEMO',laneCount:12,durationMs:40000},timing:{bpm:120,offsetMs:0,timeSignature:[4,4]},notes};
}
export function validateChartData(input) {
  if(!input||input.schemaVersion!==1||!Array.isArray(input.notes))throw new Error('schemaVersion 1 の譜面JSONを指定してください');
  const chart=structuredClone(input),ids=new Set(),types=new Set(['tap','flick','hold','flick-hold']);
  const durationMs=Number(chart.metadata?.durationMs??40000);if(!Number.isInteger(durationMs)||durationMs<1000||durationMs>86400000)throw new Error('譜面の長さは1秒〜24時間の整数msで指定してください');
  chart.metadata={title:String(chart.metadata?.title||'Untitled'),artist:String(chart.metadata?.artist||''),difficulty:String(chart.metadata?.difficulty||'EDIT'),laneCount:12,durationMs};
  const bpm=Number(chart.timing?.bpm)||120;if(bpm<20||bpm>400)throw new Error('BPMは20〜400で指定してください');
  const offsetMs=Number(chart.timing?.offsetMs??0);if(!Number.isInteger(offsetMs)||Math.abs(offsetMs)>86400000)throw new Error('オフセットは±24時間以内の整数msで指定してください');
  const timeSignature=chart.timing?.timeSignature??[4,4];if(!Array.isArray(timeSignature)||timeSignature.length!==2||timeSignature.some(value=>!Number.isInteger(value)||value<1||value>32))throw new Error('拍子は1〜32の整数2つで指定してください');
  chart.timing={bpm,offsetMs,timeSignature:[...timeSignature]};
  for(const n of chart.notes){
    if(!n||typeof n.id!=='string'||!n.id||ids.has(n.id))throw new Error('ノーツIDは重複しない文字列にしてください');ids.add(n.id);
    if(!types.has(n.type))throw new Error(`${n.id}: 未対応のノーツ種類です`);
    for(const key of ['timeMs','lane','width'])if(!Number.isInteger(n[key]))throw new Error(`${n.id}: ${key} は整数で指定してください`);
    if(n.timeMs<0||n.timeMs>durationMs||n.lane<0||n.width<1||n.lane+n.width>12)throw new Error(`${n.id}: 時刻またはレーン範囲が不正です`);
    if(n.type==='hold'||n.type==='flick-hold'){if(!Number.isInteger(n.durationMs)||n.durationMs<100||n.timeMs+n.durationMs>durationMs)throw new Error(`${n.id}: ホールド時間が不正です`);}
    else {delete n.durationMs;delete n.endFlick;delete n.nextId;}
    if(n.type==='flick-hold'){
      const f=n.endFlick;if(!f||!Number.isInteger(f.lane)||!Number.isInteger(f.width)||f.lane<0||f.width<1||f.lane+f.width>12)throw new Error(`${n.id}: 終点フリックの範囲が不正です`);
    }else delete n.endFlick;
  }
  const incoming=new Set();
  for(const n of chart.notes){if(!n.nextId)continue;const next=chart.notes.find(x=>x.id===n.nextId);if(!next||!n.durationMs||!next.durationMs)throw new Error(`${n.id}: 接続先はホールドにしてください`);if(incoming.has(next.id))throw new Error(`${next.id}: 複数のノーツからは接続できません`);incoming.add(next.id);const span=n.type==='flick-hold'?n.endFlick:n;if(next.timeMs!==n.timeMs+n.durationMs||next.lane<span.lane||next.lane+next.width>span.lane+span.width)throw new Error(`${n.id}: 接続先を終点時刻と範囲内に配置してください`);}
  for(const start of chart.notes){const seen=new Set();let n=start;while(n?.nextId){if(seen.has(n.id))throw new Error('連結を循環させることはできません');seen.add(n.id);n=chart.notes.find(x=>x.id===n.nextId);}}
  chart.notes.sort((a,b)=>a.timeMs-b.timeMs||a.lane-b.lane||a.id.localeCompare(b.id));return chart;
}
export function createChart(chartData=createDefaultChartData()) {
  const chart=validateChartData(chartData);
  return chart.notes.map((n,id)=>({time:n.timeMs/1000,lane:n.lane,width:n.width,duration:(n.durationMs||0)/1000,type:n.type,flickLane:n.endFlick?.lane??n.lane,flickWidth:n.endFlick?.width??n.width,nextId:n.nextId||null,sourceId:n.id,id,state:'pending',nextTick:0,holdHits:0,endFlick:null,endJudged:false}));
}
export class Game {
  constructor(auto=false,chartData=createDefaultChartData()) { this.auto=auto; this.notes=createChart(chartData); this.totalJudgements=this.notes.reduce((total,n)=>total+(n.duration?holdTickCount(n.duration):1),0);this.held=new Set();this.lastTime=0;this.combo=0;this.maxCombo=0;this.score=0;this.perfect=0;this.good=0;this.miss=0;this.earned=0;this.onJudge=()=>{}; }
  covers(n,lane,time=n.time) {
    return this.spanCovers(noteSpanAt(n,time),lane);
  }
  spanCovers(span,lane) {
    const center=lane+.5;
    return center>=span.lane-EPSILON&&center<span.lane+span.width+EPSILON;
  }
  finish(n,grade,at=n.time,span=noteSpanAt(n,at)) {
    if(n.state==='hit'||n.state==='miss')return;
    n.state=grade==='MISS'?'miss':'hit';
    this.record(n,grade,span);
  }
  record(n,grade,span=noteSpanAt(n,n.time)) {
    if(grade==='MISS'){this.miss++;this.combo=0;}else{this.combo++;this.maxCombo=Math.max(this.maxCombo,this.combo);if(grade==='PERFECT'){this.perfect++;this.earned+=1;}else{this.good++;this.earned+=.65;}}
    this.score=Math.round(this.earned/this.totalJudgements*1000000);this.onJudge(grade,n,span);
  }
  press(lane,t) {
    if(this.auto)return;
    const n=this.notes.filter(n=>!n.duration&&n.type!=='flick'&&n.state==='pending'&&this.covers(n,lane,n.time)&&Math.abs(n.time-t)<=.16).sort((a,b)=>Math.abs(a.time-t)-Math.abs(b.time-t))[0];
    if(!n)return;
    const grade=Math.abs(n.time-t)<=.075?'PERFECT':'GOOD';
    this.finish(n,grade,t);
  }
  flick(lanes,t) {
    if(this.auto)return;
    this.update(t,this.held);
    const flickTime=n=>n.time+(n.type==='flick-hold'?n.duration:0);
    const n=this.notes.filter(n=>(n.type==='flick'||n.type==='flick-hold')&&n.state!=='hit'&&n.state!=='miss'&&!n.endFlick&&lanes.some(lane=>this.spanCovers(flickSpan(n),lane))&&Math.abs(flickTime(n)-t)<=.16+EPSILON).sort((a,b)=>Math.abs(flickTime(a)-t)-Math.abs(flickTime(b)-t))[0];
    if(!n)return;
    const grade=Math.abs(flickTime(n)-t)<=.075+EPSILON?'PERFECT':'GOOD';
    if(n.type==='flick-hold'){
      n.endFlick={time:t,grade};
      this.update(t,this.held);
    }else this.finish(n,grade,t,flickSpan(n));
  }
  update(t,held) {
    if(t<this.lastTime-EPSILON)return;
    const currentHeld=new Set(held),events=[];
    const isHeld=(n,lanes,at)=>this.auto||[...lanes].some(lane=>this.covers(n,lane,at));
    for(const n of this.notes){
      if(n.state==='hit'||n.state==='miss')continue;
      if(n.duration){
        const count=holdBodyTickCount(n),isFlickHold=n.type==='flick-hold',endTime=n.time+n.duration;
        while(n.nextTick<count){
          const tickTime=n.time+Math.min((n.nextTick+1)*HOLD_INTERVAL,n.duration);
          if(tickTime>t+EPSILON)break;
          // A new input only applies from its event time, never to earlier ticks.
          // An accepted end flick completes the hold within the timing window;
          // releasing after it must not turn the last few ticks into misses.
          const pressed=(n.endFlick&&tickTime>=n.endFlick.time-EPSILON)||isHeld(n,tickTime<t-EPSILON?this.held:currentHeld,tickTime);
          events.push({time:tickTime,n,grade:pressed?'PERFECT':'MISS',tick:true});n.nextTick++;
        }
        if(t>=n.time-EPSILON)n.state=n.endFlick||isHeld(n,currentHeld,Math.min(t,endTime))?'holding':'waiting';
        if(isFlickHold&&!n.endJudged){
          if(t>=endTime-EPSILON&&(this.auto||n.endFlick))events.push({time:Math.max(endTime,n.endFlick?.time??endTime),n,grade:n.endFlick?.grade??'PERFECT',end:true,span:flickSpan(n)});
          else if(t>endTime+.16+EPSILON)events.push({time:endTime+.16,n,grade:'MISS',end:true,span:flickSpan(n)});
        }
      }else if(this.auto&&t>=n.time){
        events.push({time:n.time,n,grade:'PERFECT'});
      }else if(t>n.time+.16){
        events.push({time:n.time+.16,n,grade:'MISS'});
      }
    }
    events.sort((a,b)=>a.time-b.time||a.n.id-b.n.id);
    for(const event of events){
      if(event.tick){if(event.grade!=='MISS')event.n.holdHits++;this.record(event.n,event.grade,noteSpanAt(event.n,event.time));}
      else {if(event.end)event.n.endJudged=true;this.finish(event.n,event.grade,event.time,event.span);}
    }
    for(const n of this.notes)if(n.duration&&n.type!=='flick-hold'&&n.nextTick===holdBodyTickCount(n))n.state=n.holdHits?'hit':'miss';
    this.held=currentHeld;this.lastTime=t;
  }
}

// A short movement in any direction, measured in CSS pixels. Each pointer owns
// its own history; old movement and tiny pointer jitter cannot trigger a flick.
export class FlickGesture {
  constructor(x,y,t){this.samples=[{x,y,t}];}
  rest(t){
    const last=this.samples.at(-1);
    if(!last||t-last.t<16)return;
    this.samples=this.samples.filter(p=>t-p.t<=140);
    this.samples.push({x:last.x,y:last.y,t});
  }
  move(x,y,t){
    this.samples=this.samples.filter(p=>t-p.t<=140);
    const current={x,y,t};
    const origin=this.samples.find(p=>Math.hypot(x-p.x,y-p.y)>=18);
    this.samples.push(current);
    if(!origin)return null;
    this.samples=[current];
    return {fromX:origin.x,fromY:origin.y,x,y};
  }
}
