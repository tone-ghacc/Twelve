export const DURATION = 40;
export const KEYS = ['KeyQ','KeyW','KeyE','KeyR','KeyT','KeyY','KeyU','KeyI','KeyO','KeyP','BracketLeft','BracketRight'];
export const LABELS = ['Q','W','E','R','T','Y','U','I','O','P','[',']'];
export function createChart() {
  const notes = [];
  const add = (time,lane,width=1,duration=0) => notes.push({time,lane,width,duration});
  add(2,0,2); add(2.5,3,2); add(3,6,3); add(3.5,10,2);
  add(4,1,3,1.5); add(4.5,7,2); add(5,10,2); add(6,6,4,1.5); add(6.5,1,2); add(7,3,2);
  for(let block=0;block<7;block++) {
    const t=8+block*4, flip=block%2;
    add(t,flip?8:0,3); add(t+.5,flip?5:3,2); add(t+1,flip?1:8,3,1.5);
    add(t+1.5,flip?8:1,2); add(t+2,flip?5:4,2); add(t+3,flip?7:0,4); add(t+3.5,flip?1:7,3);
  }
  add(36,0,4,1.5); add(36,8,4,1.5); add(38,0,12);
  return notes.sort((a,b)=>a.time-b.time).map((n,id)=>({...n,id,state:'pending'}));
}
export class Game {
  constructor(auto=false) { this.auto=auto; this.notes=createChart(); this.combo=0;this.maxCombo=0;this.score=0;this.perfect=0;this.good=0;this.miss=0;this.earned=0;this.onJudge=()=>{}; }
  covers(n,lane) { return lane>=n.lane && lane<n.lane+n.width; }
  finish(n,grade) {
    if(n.state==='hit'||n.state==='miss')return;
    n.state=grade==='MISS'?'miss':'hit';
    if(grade==='MISS'){this.miss++;this.combo=0;}else{this.combo++;this.maxCombo=Math.max(this.maxCombo,this.combo);if(grade==='PERFECT'){this.perfect++;this.earned+=1;}else{this.good++;this.earned+=.65;}}
    this.score=Math.round(this.earned/this.notes.length*1000000);this.onJudge(grade,n);
  }
  press(lane,t) {
    if(this.auto)return;
    const n=this.notes.filter(n=>n.state==='pending'&&this.covers(n,lane)&&Math.abs(n.time-t)<=.16).sort((a,b)=>Math.abs(a.time-t)-Math.abs(b.time-t))[0];
    if(!n)return;
    const grade=Math.abs(n.time-t)<=.075?'PERFECT':'GOOD';
    if(n.duration){n.state='holding';n.grade=grade;this.onJudge('HOLD',n);}else this.finish(n,grade);
  }
  update(t,held) {
    for(const n of this.notes){
      if(this.auto&&n.state==='pending'&&t>=n.time){if(n.duration){n.state='holding';n.grade='PERFECT';this.onJudge('HOLD',n);}else this.finish(n,'PERFECT');}
      if(n.state==='pending'&&t>n.time+.16)this.finish(n,'MISS');
      if(n.state==='holding'){
        if(t>=n.time+n.duration)this.finish(n,n.grade);
        else if(!this.auto&&t>(this.graceUntil??-1)&&![...held].some(lane=>this.covers(n,lane)))this.finish(n,'MISS');
      }
    }
  }
}
