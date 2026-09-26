import assert from 'node:assert/strict';
import {connectEditorHolds} from '../dist/editor.js';
import {validateChartData} from '../dist/engine.mjs';
const hold=(id,type,timeMs,durationMs,lane=2,width=2)=>({id,type,timeMs,durationMs,lane,width,startType:'none',checkpoints:[100,350],...(type==='flick-hold'?{endFlick:{lane:1,width:5}}:{})});
const chart=(notes)=>validateChartData({schemaVersion:1,metadata:{durationMs:20000},timing:{bpm:120,bpmChanges:[{timeMs:10200,bpm:173}]},notes});
const get=(c,id)=>c.notes.find(n=>n.id===id);
for(const aType of ['hold','flick-hold'])for(const bType of ['hold','flick-hold']){
  const original=chart([hold('a',aType,9000,1000),hold('b',bType,10500,1500)]),snapshot=structuredClone(original);
  const result=connectEditorHolds(original,'a','b'),b=get(result,'b');
  assert.deepEqual(original,snapshot,'source chart must not be mutated');
  assert.equal(get(result,'a').nextId,'b');assert.equal(b.timeMs,10000);assert.equal(b.durationMs,2000);
  assert.equal(b.timeMs+b.durationMs,12000,'original end remains fixed');
  assert.deepEqual(b.checkpoints,[100,200,300,400,500,600,850],'new section gains ticks, existing absolute timings remain fixed');
  assert.equal(b.lane,2);assert.equal(b.width,2);assert.deepEqual(b.endFlick,get(original,'b').endFlick);
}
{
  const original=chart([hold('a','hold',9000,1000),hold('b','hold',10000,1000)]);
  const result=connectEditorHolds(original,'a','b');assert.deepEqual(get(result,'b'),get(original,'b'),'equal times do not change the target');
}
{
  const original=chart([hold('a','flick-hold',9000,1000,1,1),hold('b','hold',10053,1000,4,1)]);
  const b=get(connectEditorHolds(original,'a','b'),'b');
  assert.equal(b.timeMs,10000,'connection time is exact, independent of BPM and snap');assert.equal(b.durationMs,1053);assert.deepEqual(b.checkpoints,[153,403]);
}
{
  const original=chart([hold('a','hold',9000,1000,1,4),{...hold('b','hold',10500,1000),nextId:'c'},hold('c','hold',11500,1000)]);
  const result=connectEditorHolds(original,'a','b');assert.deepEqual(get(result,'c'),get(original,'c'),'downstream connections keep their positions');
}
function rejectsUnchanged(original,from,to,pattern){const snapshot=structuredClone(original);assert.throws(()=>connectEditorHolds(original,from,to),pattern);assert.deepEqual(original,snapshot);}
rejectsUnchanged(chart([hold('a','hold',9000,1000),hold('b','hold',9500,1500)]),'a','b',/時間範囲が重なって/);
rejectsUnchanged(chart([hold('a','hold',9000,1000),hold('b','hold',10500,1500,1)]),'a','b',/左端レーン/);
rejectsUnchanged(chart([hold('a','hold',9000,1000),hold('b','hold',10500,1500,3,2)]),'a','b',/ノーツ幅.*右端/);
rejectsUnchanged(chart([hold('a','hold',9000,1000),hold('b','hold',10500,1500),{...hold('other','hold',10000,500),nextId:'b'}]),'a','b',/すでに other から/);
rejectsUnchanged(chart([{...hold('a','hold',9000,1000),nextId:'b'},hold('b','hold',10000,1000)]),'b','a',/循環/);
rejectsUnchanged(chart([hold('a','hold',9000,1000)]),'a','a',/同じノーツ/);
rejectsUnchanged(chart([hold('a','hold',9000,1000),{id:'tap',type:'tap',timeMs:10500,lane:2,width:2}]),'a','tap',/接続先はホールド/);
{
  const original=chart([{...hold('a','hold',9000,1000),nextId:'old'},hold('old','hold',10000,1000),hold('invalid','hold',10500,1000,8)]);
  rejectsUnchanged(original,'a','invalid',/左端レーン/);
  const disconnected=connectEditorHolds(original,'a','');assert.equal(get(disconnected,'a').nextId,undefined);assert.deepEqual(get(disconnected,'old'),get(original,'old'));
}
{
  const original=chart([hold('a','hold',9000,1000),hold('b','hold',10500,1500)]);get(original,'b').startType='invalid';
  rejectsUnchanged(original,'a','b',/startType/);
}
console.log('Editor hold connection tests passed');
