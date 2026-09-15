export const DURATION = 40;
export const HOLD_INTERVAL = 0.1;
const EPSILON = 1e-7;
export const holdTickCount = duration => Math.ceil(duration / HOLD_INTERVAL - EPSILON) + 1;
// A flick-hold replaces the ordinary end tick with a separate flick judgement.
export const holdBodyTickCount = n => holdTickCount(n.duration) - (n.type==='flick-hold'?1:0);
export function noteSpanAt(n,time) {
  if(!n.duration)return {lane:n.lane,width:n.width};
  const progress=Math.max(0,Math.min(1,(time-n.time)/n.duration));
  return {
    lane:n.lane+((n.endLane??n.lane)-n.lane)*progress,
    width:n.width
  };
}
export const flickSpan = n => n.type==='flick-hold'
  ? {lane:n.flickLane??n.endLane??n.lane,width:n.flickWidth??n.width}
  : {lane:n.lane,width:n.width};
export const KEYS = ['KeyQ','KeyW','KeyE','KeyR','KeyT','KeyY','KeyU','KeyI','KeyO','KeyP','BracketLeft','BracketRight'];
export const LABELS = ['Q','W','E','R','T','Y','U','I','O','P','[',']'];
export function createChart() {
  const notes = [];
  const add = (time,lane,width=1,duration=0,type=duration?'hold':'tap',endLane=lane,flickLane=endLane,flickWidth=width,chain=null) => notes.push({time,lane,width,duration,type,endLane,flickLane,flickWidth,chain});
  add(2,0,2); add(2.5,3,2,0,'flick'); add(3,6,3); add(3.5,10,2);
  add(4,1,3,1.5); add(4.5,7,2); add(5,10,2);
  add(6,6,3,1.5,'flick-hold',6,3,8,'wide-chain');
  add(6.5,1,2); add(7,3,2);
  add(7.5,7,2,.5,'flick-hold',5,5,4,'wide-chain');
  for(let block=0;block<7;block++) {
    const t=8+block*4, flip=block%2;
    add(t,flip?8:0,3); add(t+.5,flip?5:3,2); add(t+1,flip?1:8,3,1.5,flip?'flick-hold':'hold');
    add(t+1.5,flip?8:1,2); add(t+2,flip?5:4,2); add(t+3,flip?7:0,4,0,'flick'); add(t+3.5,flip?1:7,3);
  }
  add(36,0,4,1.5); add(36,8,4,1.5,'flick-hold'); add(38,0,12,0,'flick');
  return notes.sort((a,b)=>a.time-b.time).map((n,id)=>({...n,id,state:'pending',nextTick:0,holdHits:0,endFlick:null,endJudged:false}));
}
export class Game {
  constructor(auto=false) { this.auto=auto; this.notes=createChart(); this.totalJudgements=this.notes.reduce((total,n)=>total+(n.duration?holdTickCount(n.duration):1),0);this.held=new Set();this.lastTime=0;this.combo=0;this.maxCombo=0;this.score=0;this.perfect=0;this.good=0;this.miss=0;this.earned=0;this.onJudge=()=>{}; }
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
          const tickTime=n.time+Math.min(n.nextTick*HOLD_INTERVAL,n.duration);
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
