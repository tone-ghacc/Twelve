import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Game,FlickGesture,KEYS} from '../dist/engine.mjs';

const tap=(id,lane,timeMs=1000,width=1)=>({id,type:'tap',lane,width,timeMs});
const chart=notes=>({schemaVersion:1,metadata:{durationMs:5000},timing:{bpm:120},notes});
const makeGame=notes=>new Game(false,chart(notes));
const note=(game,id)=>game.notes.find(n=>n.sourceId===id);
const state=(game,id)=>note(game,id).events[0].state;

// Adjacent lanes, wide notes, and both ends of the 12-lane playfield.
for(const [lane,width,inputs] of [[0,1,[0,1]],[2,1,[1,2,3]],[11,1,[10,11]],[3,4,[2,3,4,5,6,7]]]){
  for(let input=-1;input<=12;input++){
    const game=makeGame([tap('target',lane,1000,width)]);
    game.press(input,1);
    assert.equal(game.perfectPlus,Number(inputs.includes(input)),`span ${lane}/${width}, input ${input}`);
  }
}
for(const lane of [NaN,Infinity,.5]){
  const game=makeGame([tap('target',0)]);game.press(lane,1);assert.equal(game.perfectPlus,0);
}

{
  const game=makeGame([tap('own',2,1100),tap('adjacent',3,1000)]);
  game.press(2,1.01);
  assert.equal(state(game,'adjacent'),'hit','nearest time takes priority over the actual lane');
  assert.equal(state(game,'own'),'pending','one press only consumes one event');
}
{
  const game=makeGame([tap('left',2),tap('right',3)]);
  game.press(3,1);
  assert.equal(state(game,'left'),'pending');
  assert.equal(state(game,'right'),'hit','actual lane wins a same-time tie despite later chart order');
  game.press(2,1);
  assert.equal(game.perfectPlus,2,'separate inputs can hit both adjacent notes');
}
{
  const game=makeGame([tap('earlier-adjacent',2,1000),tap('later-own',3,1100)]);
  game.press(3,1.05);
  assert.equal(state(game,'later-own'),'hit','floating-point equality also prefers the actual lane');
  assert.equal(state(game,'earlier-adjacent'),'pending');
}
{
  const game=makeGame([tap('right',4),tap('left',2)]);
  game.press(3,1);
  assert.equal(state(game,'left'),'hit','remaining ties follow the normalized chart order');
  assert.equal(state(game,'right'),'pending');
}
{
  const game=makeGame([tap('too-late',2,1200),tap('available',3,1000)]);
  game.press(2,1);game.press(2,1);
  assert.equal(game.perfectPlus,1,'judged and out-of-window notes are not candidates');
  assert.equal(state(game,'too-late'),'pending');
}

// Existing timing grades and timeout behavior are unchanged for adjacent hits.
for(const [offset,grade] of [[0,'PERFECT+'],[.025,'PERFECT+'],[.04,'PERFECT'],[.07,'GREAT'],[.1,'GOOD'],[.125,'BAD'],[.16,'MISS']]){
  for(const sign of [-1,1]){
    const game=makeGame([tap('target',2)]);game.press(3,1+sign*offset);
    assert.equal(note(game,'target').events[0].grade,grade);
  }
}
{
  const game=makeGame([tap('target',2)]);game.press(3,.839);game.press(3,1.161);
  assert.equal(state(game,'target'),'pending');game.update(1.161,new Set());assert.equal(game.miss,1);
}

{
  const game=makeGame([{...tap('left',2),type:'flick'},{...tap('right',3),type:'flick'}]);
  game.press(3,1);assert.equal(game.perfectPlus,0);assert.equal(game.great,1,'press reserves GREAT while flick can upgrade it');
  game.flick([3],1);assert.equal(state(game,'right'),'hit');assert.equal(state(game,'left'),'pending');
  game.flick([1],1);assert.equal(game.perfectPlus,2,'flicks accept adjacent lanes');
}
{
  const game=makeGame([{...tap('edge',0),type:'flick'}]);
  game.flick([-1,12],1);assert.equal(game.perfectPlus,0,'out-of-playfield flick coordinates stay invalid');
}
{
  const game=makeGame([{id:'hold',type:'hold',lane:3,width:2,timeMs:1000,durationMs:300,startType:'normal',checkpoints:[100,200]}]);
  game.press(2,1);game.update(1.1,new Set([2]));game.update(1.2,new Set([5]));game.update(1.3,new Set([5]));
  assert.equal(game.perfectPlus,1,'hold starts use the new press range');
  assert.equal(game.perfect,3,'checkpoints and ordinary endpoints accept either neighboring lane');
}
{
  const game=makeGame([{id:'hold',type:'hold',lane:3,width:2,timeMs:1000,durationMs:200,startType:'none',checkpoints:[100]}]);
  game.update(1.1,new Set([1]));game.update(1.2,new Set([6]));assert.equal(game.miss,2,'two lanes beyond a hold stay outside');
}
{
  const game=makeGame([{id:'wide',type:'flick-hold',lane:4,width:1,timeMs:1000,durationMs:300,startType:'scratch',checkpoints:[],endFlick:{lane:2,width:5}}]);
  game.flick([3],1);game.flick([7],1.3);assert.equal(game.perfectPlus,2,'scratch starts and wide flick endpoints extend their own spans');
}
{
  const game=new Game(true,chart([tap('auto',2)]));game.press(3,1);game.flick([3],1);game.update(1,new Set());
  assert.equal(game.autoCount,1);assert.equal(game.score,0);assert.equal(game.perfectPlus,0);
}

// Execute the actual browser input listeners with minimal event targets and a
// controllable clock. This checks routing as well as the engine; no DOM rendering
// or simulated browser automation is needed for these input regression cases.
const appSource=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const inputSource=appSource.slice(appSource.indexOf('function press(lane)'),appSource.indexOf("document.addEventListener('visibilitychange'"));
assert.ok(inputSource.includes("canvas.addEventListener('pointermove',movePointer)"));
function inputHarness(notes){
  const target=()=>({handlers:new Map(),addEventListener(type,fn){this.handlers.set(type,fn);},setPointerCapture(){},getBoundingClientRect(){return{left:0};},emit(type,extra={}){this.handlers.get(type)?.({type,button:0,pointerType:'touch',pointerId:1,clientY:600,timeStamp:now*1000,preventDefault(){},target:{matches:()=>false},...extra});}});
  let now=0;const game=makeGame(notes),canvas=target(),window=target(),keys=new Set(),pointers=new Map(),elements={'play-workspace':target(),stage:target(),'editor-workspace':{hidden:true}};
  vm.runInNewContext(inputSource,{game,canvas,window,keys,pointers,KEYS,FlickGesture,width:1200,phase:'playing',time:()=>now,held:()=>new Set([...keys,...[...pointers.values()].map(p=>p.lane)]),$:id=>elements[id]});
  return{game,pointers,keys,pointer(type,lane,t,id=1){now=t;canvas.emit(type,{clientX:(lane+.5)*100,pointerId:id});},key(type,lane,t,repeat=false){now=t;window.emit(type,{code:KEYS[lane],repeat});}};
}
{
  const input=inputHarness([tap('target',2)]);
  input.pointer('pointerdown',1,.5);
  input.pointer('pointermove',2,1);
  input.pointer('pointermove',2,1.01);
  assert.equal(state(input.game,'target'),'pending','sliding and holding do not create presses');
  input.pointer('pointerup',2,1.01);
  assert.equal(state(input.game,'target'),'pending','release does not create a press');
  input.pointer('pointerdown',2,1.02);
  assert.equal(input.game.perfectPlus,1,'release followed by a new press can hit');
}
{
  const input=inputHarness([tap('left',2),tap('right',3)]);
  input.pointer('pointerdown',3,1,1);
  assert.equal(state(input.game,'left'),'pending');
  input.pointer('pointerdown',3,1,1);
  assert.equal(state(input.game,'left'),'pending','duplicate down from one pointer is ignored');
  input.pointer('pointerdown',2,1,2);
  assert.equal(input.game.perfectPlus,2,'independent fingers can hit both notes');
}
{
  const input=inputHarness([tap('first',2),tap('second',2,1100)]);
  input.key('keydown',3,1);input.key('keydown',3,1.1,true);input.key('keydown',3,1.1);
  assert.equal(state(input.game,'second'),'pending','held keys and repeated down events do not retrigger');
  input.key('keyup',3,1.1);input.key('keydown',3,1.1);assert.equal(input.game.perfectPlus,2);
}
{
  const input=inputHarness([{...tap('flick',2),type:'flick'}]);
  input.pointer('pointerdown',1,.95);input.pointer('pointermove',2,1);
  assert.equal(input.game.perfectPlus,1,'dragging still produces flick input');
}
{
  const input=inputHarness([{id:'hold',type:'hold',lane:3,width:1,timeMs:1000,durationMs:200,startType:'none',checkpoints:[100]}]);
  input.pointer('pointerdown',0,.9);input.pointer('pointermove',2,1.1);input.pointer('pointermove',4,1.2);
  assert.equal(input.game.perfect,2,'sliding continues to update held lanes');
  input.pointer('pointercancel',4,1.21);assert.equal(input.pointers.size,0);
}
{
  const input=inputHarness([
    {id:'source',type:'flick-hold',timeMs:1000,durationMs:1000,lane:1,width:1,startType:'none',checkpoints:[980],endFlick:{lane:0,width:10},nextId:'next'},
    {id:'next',type:'flick-hold',timeMs:2000,durationMs:800,lane:2,width:1,startType:'none',checkpoints:[100,200],endFlick:{lane:2,width:1}}
  ]);
  input.pointer('pointerdown',1,1.8);input.pointer('pointermove',1,1.9);
  input.pointer('pointermove',9,1.98);
  input.pointer('pointermove',9,2.1);
  assert.equal(input.game.miss,0,'pointer routing must register the flick handoff before updating checkpoints');
  assert.equal(input.game.perfectPlus,1);assert.equal(input.game.perfect,2);
  input.pointer('pointermove',2,2.14);input.pointer('pointermove',2,2.2);
  assert.equal(input.game.perfect,3,'returning to the next body restores ordinary held input');
}
for(const releaseType of ['pointerup','pointercancel','lostpointercapture']){
  const input=inputHarness([
    {id:'source',type:'flick-hold',timeMs:1000,durationMs:1000,lane:1,width:1,startType:'none',checkpoints:[],endFlick:{lane:0,width:10},nextId:'next'},
    {id:'next',type:'flick-hold',timeMs:2000,durationMs:800,lane:2,width:1,startType:'none',checkpoints:[100],endFlick:{lane:2,width:1}}
  ]);
  input.pointer('pointerdown',1,1.8);input.pointer('pointermove',1,1.9);input.pointer('pointermove',9,1.98);
  input.pointer(releaseType,9,2.04);input.pointer('pointerdown',9,2.1);
  assert.equal(input.game.miss,1,`${releaseType} ends the pointer handoff, including reused pointer IDs`);
}
console.log('Input judgement and event routing tests passed');
