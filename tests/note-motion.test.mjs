import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createPerspective,perspectiveMetrics,getNoteVisibleTimeMs,NOTE_START_POSITIONS} from '../dist/projection.mjs';
import {noteSpanAt,flickSpan} from '../dist/engine.mjs';
const close=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);

for(const [width,height] of [[360,640],[1200,700]])for(const noteSpeed of [1,10,25])for(const noteStartPosition of NOTE_START_POSITIONS){
  const view=createPerspective(width,height,{noteSpeed,noteStartPosition}),judge=20,dt=view.travel*1e-5;
  close(view.project(judge,judge).y,view.hitY);close(view.project(judge,judge-view.travel).y,view.topY);
  const spawn=judge-view.visibleTimeMs/1000;close(view.project(judge,spawn).y,view.visibleY);
  assert.equal(view.visibleTimeMs,getNoteVisibleTimeMs(noteSpeed,noteStartPosition));
  let previousSpeed=0;
  for(let i=0;i<=100;i++){
    const time=spawn+(judge-spawn)*i/100,point=view.project(judge,time),velocity=(view.project(judge,time+dt).y-view.project(judge,time-dt).y)/(2*dt);
    assert.ok(velocity>0);assert.ok(velocity>=previousSpeed-1e-5,'screen speed never decreases on approach');previousSpeed=velocity;
    // The old power easing fails this: velocity / apparent lane width fell
    // by ~20% in the second half even though pixel velocity increased.
    close(velocity/point.scale,(view.hitY-view.topY)/view.travel*view.depthRate/(view.judgementWidth*(1-view.topScale)),1e-4);
    close(view.span({lane:2,width:3},judge,time).y,point.y);
  }
  const before=(view.project(judge,judge).y-view.project(judge,judge-dt).y)/dt,after=(view.project(judge,judge+dt).y-view.project(judge,judge).y)/dt;
  assert.ok(Math.abs(after/before-1)<.0001,'no velocity discontinuity at judgement');
  assert.ok(view.project(judge,judge+.001).y>view.hitY);
  assert.ok(Number.isFinite(view.project(0,86400).y),'offscreen extension stays finite for very long holds');
  // Position is sampled directly at audio time, regardless of previous frames.
  for(const fps of [30,60,120,144]){
    for(let frame=0;frame<fps;frame++)view.project(judge,spawn+(judge-spawn)*frame/fps);
    close(view.project(judge,judge).y,view.hitY);
  }
}

// Execute the real drawing function so pending hold/flick caps cannot silently
// reintroduce a clamp at the judgement line while the projection tests pass.
const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8'),drawSource=source.slice(source.indexOf('function draw(now){'),source.indexOf('function frame(now){'));
function renderedCaps(note,elapsed){
  const caps=[],ctx=new Proxy({createLinearGradient:()=>({addColorStop(){}})},{get:(object,key)=>object[key]??(()=>{}),set:(object,key,value)=>{object[key]=value;return true;}});
  const scope=vm.createContext({width:1200,height:700,playSettings:{noteSpeed:10,noteStartPosition:0,noteThickness:100},elapsed,phase:'paused',endedAt:0,ctx,game:{notes:[note],auto:false,fixedKeyboard:{update(){}}},effects:[],held:()=>new Set(),LABELS:Array(12).fill(''),createPerspective,perspectiveMetrics,noteSpanAt,flickSpan,drawFixedKeyboardStage(){},drawFixedKeyboardSweeps(){},drawKeyBeams(){},drawFlickArrows(){},fillProjectedBar:(view,span,point,height,color)=>caps.push({...point,height,color})});
  vm.runInContext(drawSource+'\ndraw(0);',scope);return caps;
}
const view=createPerspective(1200,700,{noteSpeed:10,noteStartPosition:0});
const hold={time:2,duration:2,lane:2,width:2,type:'hold',startType:'normal',events:[{id:'n:start',state:'pending'}],state:'waiting'};
for(const elapsed of [1.99,2,2.01,2.04]){
  const cap=renderedCaps(hold,elapsed).find(c=>c.color==='#70dcf8');assert.ok(cap);close(cap.y,view.project(2,elapsed).y);
}
const flickHold={...hold,type:'flick-hold',startType:'none',events:[],flickLane:1,flickWidth:4};
for(const elapsed of [3.99,4,4.01,4.04]){
  const cap=renderedCaps(flickHold,elapsed).find(c=>c.color==='#b875ff');assert.ok(cap);close(cap.y,view.project(4,elapsed).y);close(cap.scale,view.project(4,elapsed).scale);
}
console.log('Note motion: constant lane-relative speed, continuous judgement crossing, audio-time sampling and unclamped pending caps passed');
