export const DURATION = 40;
export const HOLD_INTERVAL = 0.1;
const EPSILON = 1e-7;
export const holdTickCount = duration => Math.ceil(duration / HOLD_INTERVAL - EPSILON) + 1;
export const KEYS = ['KeyQ','KeyW','KeyE','KeyR','KeyT','KeyY','KeyU','KeyI','KeyO','KeyP','BracketLeft','BracketRight'];
export const LABELS = ['Q','W','E','R','T','Y','U','I','O','P','[',']'];
export function createChart() {
  const notes = [];
  const add = (time,lane,width=1,duration=0,type=duration?'hold':'tap') => notes.push({time,lane,width,duration,type});
  add(2,0,2); add(2.5,3,2,0,'flick'); add(3,6,3); add(3.5,10,2);
  add(4,1,3,1.5); add(4.5,7,2); add(5,10,2); add(6,6,4,1.5); add(6.5,1,2); add(7,3,2);
  for(let block=0;block<7;block++) {
    const t=8+block*4, flip=block%2;
    add(t,flip?8:0,3); add(t+.5,flip?5:3,2); add(t+1,flip?1:8,3,1.5);
    add(t+1.5,flip?8:1,2); add(t+2,flip?5:4,2); add(t+3,flip?7:0,4,0,'flick'); add(t+3.5,flip?1:7,3);
  }
  add(36,0,4,1.5); add(36,8,4,1.5); add(38,0,12,0,'flick');
  return notes.sort((a,b)=>a.time-b.time).map((n,id)=>({...n,id,state:'pending',nextTick:0,holdHits:0}));
}
export class Game {
  constructor(auto=false) { this.auto=auto; this.notes=createChart(); this.totalJudgements=this.notes.reduce((total,n)=>total+(n.duration?holdTickCount(n.duration):1),0);this.held=new Set();this.lastTime=0;this.combo=0;this.maxCombo=0;this.score=0;this.perfect=0;this.good=0;this.miss=0;this.earned=0;this.onJudge=()=>{}; }
  covers(n,lane) { return lane>=n.lane && lane<n.lane+n.width; }
  finish(n,grade) {
    if(n.state==='hit'||n.state==='miss')return;
    n.state=grade==='MISS'?'miss':'hit';
    this.record(n,grade);
  }
  record(n,grade) {
    if(grade==='MISS'){this.miss++;this.combo=0;}else{this.combo++;this.maxCombo=Math.max(this.maxCombo,this.combo);if(grade==='PERFECT'){this.perfect++;this.earned+=1;}else{this.good++;this.earned+=.65;}}
    this.score=Math.round(this.earned/this.totalJudgements*1000000);this.onJudge(grade,n);
  }
  press(lane,t) {
    if(this.auto)return;
    const n=this.notes.filter(n=>!n.duration&&n.type!=='flick'&&n.state==='pending'&&this.covers(n,lane)&&Math.abs(n.time-t)<=.16).sort((a,b)=>Math.abs(a.time-t)-Math.abs(b.time-t))[0];
    if(!n)return;
    const grade=Math.abs(n.time-t)<=.075?'PERFECT':'GOOD';
    this.finish(n,grade);
  }
  flick(lanes,t) {
    if(this.auto)return;
    const n=this.notes.filter(n=>n.type==='flick'&&n.state==='pending'&&lanes.some(lane=>this.covers(n,lane))&&Math.abs(n.time-t)<=.16).sort((a,b)=>Math.abs(a.time-t)-Math.abs(b.time-t))[0];
    if(n)this.finish(n,Math.abs(n.time-t)<=.075?'PERFECT':'GOOD');
  }
  update(t,held) {
    if(t<this.lastTime-EPSILON)return;
    const currentHeld=new Set(held),events=[];
    const isHeld=(n,lanes)=>this.auto||[...lanes].some(lane=>this.covers(n,lane));
    for(const n of this.notes){
      if(n.state==='hit'||n.state==='miss')continue;
      if(n.duration){
        const count=holdTickCount(n.duration);
        while(n.nextTick<count){
          const tickTime=n.time+Math.min(n.nextTick*HOLD_INTERVAL,n.duration);
          if(tickTime>t+EPSILON)break;
          // A new input only applies from its event time, never to earlier ticks.
          const pressed=isHeld(n,tickTime<t-EPSILON?this.held:currentHeld);
          events.push({time:tickTime,n,grade:pressed?'PERFECT':'MISS',tick:true});n.nextTick++;
        }
        if(t>=n.time-EPSILON)n.state=isHeld(n,currentHeld)?'holding':'waiting';
      }else if(this.auto&&t>=n.time){
        events.push({time:n.time,n,grade:'PERFECT'});
      }else if(t>n.time+.16){
        events.push({time:n.time+.16,n,grade:'MISS'});
      }
    }
    events.sort((a,b)=>a.time-b.time||a.n.id-b.n.id);
    for(const event of events){
      if(event.tick){if(event.grade!=='MISS')event.n.holdHits++;this.record(event.n,event.grade);}
      else this.finish(event.n,event.grade);
    }
    for(const n of this.notes)if(n.duration&&n.nextTick===holdTickCount(n.duration))n.state=n.holdHits?'hit':'miss';
    this.held=currentHeld;this.lastTime=t;
  }
}

// A short movement in any direction, measured in CSS pixels. Each pointer owns
// its own history; old movement and tiny pointer jitter cannot trigger a flick.
export class FlickGesture {
  constructor(x,y,t){this.samples=[{x,y,t}];}
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
