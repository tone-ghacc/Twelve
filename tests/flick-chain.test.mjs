import assert from 'node:assert/strict';
import {Game} from '../dist/engine.mjs';
const notes=()=>[
  {id:'a',type:'flick-hold',timeMs:1000,durationMs:1000,lane:1,width:1,startType:'none',checkpoints:[980],endFlick:{lane:0,width:10},nextId:'b'},
  {id:'b',type:'flick-hold',timeMs:2000,durationMs:800,lane:2,width:1,startType:'none',checkpoints:[100,200,300],endFlick:{lane:2,width:1}}
];
const make=(list=notes())=>new Game(false,{schemaVersion:1,metadata:{durationMs:5000},timing:{bpm:120},notes:list});
const touch=(id,lane)=>new Map([[id,{lane}]]);
const advance=(g,t,lane=9,id=1)=>g.update(t,lane===null?new Set():new Set([lane]),lane===null?new Map():touch(id,lane));
const event=(g,id,kind)=>g.notes.find(n=>n.sourceId===id).events.find(e=>e.id.endsWith(kind));
const connect=g=>{advance(g,1.9,1);g.flick([1,9],1.98,{pointerId:1,pointers:touch(1,9),held:new Set([9])});};
{
  const g=make();connect(g);
  assert.equal(g.miss,0,'the same flick event must not miss the preceding final checkpoint');
  assert.equal(g.perfectPlus,1);advance(g,2.1);
  assert.equal(event(g,'b','checkpoint-100').grade,'PERFECT','wide endpoint displacement receives short handoff');
  advance(g,2.15,2);advance(g,2.2,2);advance(g,2.3,2);
  g.flick([2],2.8,{pointerId:1,pointers:touch(1,2),held:new Set([2])});
  assert.equal(g.miss,0);assert.equal(g.combo,g.totalJudgements);
}
{
  const g=make();connect(g);advance(g,2.1);advance(g,2.2);
  assert.equal(event(g,'b','checkpoint-100').grade,'PERFECT');
  assert.equal(event(g,'b','checkpoint-200').grade,'MISS','holding outside cannot keep the whole continuation');
}
{
  const g=make();connect(g);advance(g,2.04,null);advance(g,2.1,9,2);
  assert.equal(event(g,'b','checkpoint-100').grade,'MISS','another finger cannot inherit a released pointer');
}
{
  const g=make();connect(g);advance(g,2.04,2);advance(g,2.06,9);advance(g,2.1);
  assert.equal(event(g,'b','checkpoint-100').grade,'MISS','reentering the actual continuation ends the grace');
}
{
  const list=notes();delete list[0].nextId;const g=make(list);connect(g);advance(g,2.1);
  assert.equal(event(g,'b','checkpoint-100').grade,'MISS','unlinked neighbors are unchanged');
}
{
  const list=notes();list[1].startType='scratch';const g=make(list);connect(g);advance(g,2.1);
  assert.equal(g.handoffs.size,0,'an explicitly requested start still needs its own input');
  assert.equal(event(g,'b','start').state,'pending');
}
{
  const g=make();advance(g,1.9,1);g.press(9,1.98);advance(g,2.1);
  assert.equal(g.handoffs.size,0);assert.equal(event(g,'b','checkpoint-100').grade,'MISS','provisional GREAT alone does not count as a connecting flick');
}
{
  const g=make();advance(g,1.9,1);g.flick([1,9],1.98);advance(g,2.1);
  assert.equal(event(g,'b','checkpoint-100').grade,'MISS','no pointer identity means no handoff');
}
{
  const list=notes();list.push({id:'unrelated',type:'hold',timeMs:2000,durationMs:400,lane:5,width:1,startType:'none',checkpoints:[100]});
  const g=make(list);connect(g);advance(g,2.1);
  assert.equal(event(g,'b','checkpoint-100').grade,'PERFECT');assert.equal(event(g,'unrelated','checkpoint-100').grade,'MISS');
}
{
  const g=make();connect(g);advance(g,2.25);
  assert.equal(event(g,'b','checkpoint-100').grade,'PERFECT');assert.equal(event(g,'b','checkpoint-200').grade,'MISS','frame gaps evaluate each checkpoint at its own time');
}
console.log('Flick hold chain handoff tests passed');
