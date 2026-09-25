import assert from 'node:assert/strict';
import {Game} from '../dist/engine.mjs';
const flick=(id='f',lane=2,timeMs=1000)=>({id,type:'flick',lane,width:1,timeMs});
const game=notes=>new Game(false,{schemaVersion:1,metadata:{durationMs:5000},timing:{bpm:120},notes});
for(const [offset,grade,score] of [[0,'PERFECT+',1010000],[.035,'PERFECT',1000000],[.06,'GREAT',800000],[.09,'GREAT',800000],[.12,'GREAT',800000],[.15,'GREAT',800000]]){
  const g=game([flick()]);g.press(3,.95);
  assert.equal(g.great,1);assert.equal(g.score,800000);assert.equal(g.combo,1);
  assert.equal(g.notes[0].events[0].state,'pending');
  g.flick([2],1+offset);
  assert.equal(g.notes[0].events[0].grade,grade);assert.equal(g.score,score);
  assert.equal(g.combo,1);assert.equal(g.maxCombo,1);
  assert.equal(g.great+g.perfect+g.perfectPlus,1);
  g.update(2,new Set());assert.equal(g.miss,0);assert.equal(g.combo,1);
}
{
  const g=game([flick()]);g.press(2,1);g.press(2,1.01);g.update(1.161,new Set());
  assert.equal(g.great,1);assert.equal(g.notes[0].state,'hit');assert.equal(g.combo,1);
  g.flick([2],1.2);assert.equal(g.score,800000,'expired provisional results cannot be upgraded');
}
{
  const g=game([flick()]);g.press(2,.839);assert.equal(g.great,0);g.update(1.161,new Set());assert.equal(g.miss,1);
}
{
  const g=game([flick(),{id:'tap',type:'tap',lane:3,width:1,timeMs:1000}]);
  g.press(3,1);assert.equal(g.perfectPlus,1);assert.equal(g.great,0,'one press cannot hit a tap and reserve a flick');
  g.press(2,1);assert.equal(g.great,1);g.flick([2],1);assert.equal(g.perfectPlus,2);assert.equal(g.combo,2);assert.equal(g.score,1010000);
}
{
  const g=game([flick(),{id:'tap',type:'tap',lane:9,width:1,timeMs:900}]);
  g.press(2,.95);g.press(9,1);assert.equal(g.combo,0);
  g.flick([2],1.02);assert.equal(g.combo,0,'upgrading a reserved note must not restore a combo broken afterward');assert.equal(g.maxCombo,1);
}
for(const startType of ['scratch','none']){
  const g=game([{id:'h',type:'flick-hold',lane:2,width:1,timeMs:1000,durationMs:300,startType,checkpoints:[100,200],endFlick:{lane:1,width:4}}]);
  if(startType==='scratch'){g.press(2,1);g.flick([2],1.02);assert.equal(g.perfectPlus,1);}
  g.press(5,1.15);assert.equal(g.great,1);
  g.update(1.2,new Set());assert.equal(g.miss,2,'provisional endpoint does not grant unheld checkpoints');
  g.flick([5],1.3);assert.equal(g.great,0);assert.equal(g.notes[0].events.at(-1).grade,'PERFECT+');
}
console.log('Provisional flick tests passed');
