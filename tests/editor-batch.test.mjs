import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {resizeEditorSelection,duplicateEditorSelection,snapToMeasureDivision} from '../dist/editor.js';
import {validateChartData,defaultHoldCheckpoints,isHoldNote} from '../dist/engine.mjs';

const tap=(id,lane,width=1)=>({id,type:'tap',lane,width,timeMs:1000});
const hold=(id,type,timeMs,lane,width=2)=>({id,type,timeMs,lane,width,durationMs:1000,startType:'normal',checkpoints:[],...(type==='flick-hold'?{endFlick:{lane,width}}:{})});
const chart=notes=>validateChartData({schemaVersion:1,metadata:{durationMs:8000},timing:{bpm:120},notes});
const original=chart([tap('a',2,2),hold('b','hold',2000,5),hold('c','flick-hold',3500,8)]),snapshot=structuredClone(original);
const grown=resizeEditorSelection(original,['a','b','c'],'right',1);
assert.deepEqual(grown.notes.map(n=>[n.lane,n.width]),[[2,3],[5,3],[8,3]]);
assert.deepEqual(grown.notes[2].endFlick,{lane:8,width:2},'body width and endpoint width remain separate');
assert.deepEqual(resizeEditorSelection(original,['a','b'],'left',-1).notes.slice(0,2).map(n=>[n.lane,n.width]),[[1,3],[4,3]]);
assert.deepEqual(resizeEditorSelection(original,['a','b','c'],'right',1,true).notes[2].endFlick,{lane:8,width:3});
assert.equal(resizeEditorSelection(original,['a','b','c'],'right',1,true).notes[0].width,2);
assert.throws(()=>resizeEditorSelection(original,['a','b','c'],'right',-2),/幅は1レーン以上/);
assert.throws(()=>resizeEditorSelection(original,['a','b','c'],'right',3),/12レーン内/);
assert.deepEqual(original,snapshot,'successful and failed edits never mutate their source');
const linked=chart([{...hold('parent','hold',1000,2),nextId:'child'},hold('child','flick-hold',2000,2),tap('note-004',9)]);
assert.throws(()=>resizeEditorSelection(linked,['parent'],'right',-1),/接続先/);
assert.doesNotThrow(()=>resizeEditorSelection(linked,['parent','child'],'right',-1));
const fixed=validateChartData({...chart([tap('fixed',0,3)]),fixedKeyboardSections:[{id:'k',startMs:0,endMs:4000,widths:[3,3,3,3]}]});
assert.throws(()=>resizeEditorSelection(fixed,['fixed'],'right',1),/固定鍵盤/);

const duplicate=duplicateEditorSelection(linked,['child','note-004']);
assert.equal(duplicate.chart.notes.length,6);
assert.equal(new Set(duplicate.chart.notes.map(n=>n.id)).size,6);
const copyParent=duplicate.chart.notes.find(n=>n.id===duplicate.idMap.get('parent'));
assert.equal(copyParent.nextId,duplicate.idMap.get('child'));
assert.equal(duplicate.chart.notes.find(n=>n.id==='parent').nextId,'child');
assert.deepEqual([...duplicate.selectedIds],[duplicate.idMap.get('child'),duplicate.idMap.get('note-004')]);
copyParent.checkpoints.push(200);assert.deepEqual(linked.notes[0].checkpoints,[],'copy data is independent');
assert.doesNotThrow(()=>validateChartData(duplicate.chart));

// Exercise the real pointer routing, drag preview and commit/cancel paths.
const source=readFileSync(new URL('../dist/editor.js',import.meta.url),'utf8');
const pointerSource=source.slice(source.indexOf("  canvas.addEventListener('pointerdown',event=>"),source.indexOf('  for(const button of document.querySelectorAll'));
const dragSource=source.slice(source.indexOf('  function previewDrag('),source.indexOf('  function placementSpan('));
const resizeSource=source.match(/  function resizedCheckpoints[^\r\n]+/)[0];
function harness(data,selected){
  const handlers=new Map(),canvas={style:{},addEventListener:(name,fn)=>handlers.set(name,fn),setPointerCapture(){},hasPointerCapture:()=>false};
  const scope=vm.createContext({chart:structuredClone(data),selectedIds:new Set(selected),selectedId:selected.length===1?selected[0]:null,tool:'select',drag:null,placing:null,marquee:null,audition:{state:'stopped'},canvas,structuredClone,duplicateEditorSelection,resizeEditorSelection,isHold:isHoldNote,defaultHoldCheckpoints,sameNumbers:(a,b)=>JSON.stringify(a)===JSON.stringify(b),point:e=>({x:e.clientX,y:e.clientY}),hitTest:(x,y)=>scope.chart.notes.find(n=>n.id===scope.hitId),laneMetrics:()=>({laneW:40}),pointTime:y=>y,durationMs:()=>8000,clamp:(v,min,max)=>Math.max(min,Math.min(max,v)),snapTime:(v,min,max)=>snapToMeasureDivision(v,data.timing,16,min,max),noteById:id=>scope.chart.notes.find(n=>n.id===id),selectionHandle:()=>scope.handle||'move',cursorFor:()=>'',widthLimits:()=>({}),connectedIds:id=>new Set(duplicateEditorSelection(scope.chart,[id]).idMap.keys()),downstreamIds:()=>[],renderInspector(){},draw(){},syncJson(){},setStatus(){},selectionStatus(){},save(next){try{scope.chart=validateChartData(next);scope.saved=true;return true;}catch{scope.saved=false;return false;}},select(id){scope.selectedIds=new Set([id]);},hitId:selected[0]});
  vm.runInContext(resizeSource+'\n'+dragSource+'\n'+pointerSource,scope);
  return{scope,event(type,x,y,extra={}){handlers.get(type)({button:0,pointerId:1,clientX:x,clientY:y,preventDefault(){},...extra});}};
}
{
  const h=harness(linked,['child']);h.event('pointerdown',100,2000,{ctrlKey:true});
  const copiedId=[...h.scope.selectedIds][0];
  assert.equal(h.scope.drag.mode,'move');
  h.event('pointermove',140,2250);h.event('pointerup',140,2250);
  assert.equal(h.scope.chart.notes.length,5);assert.equal(h.scope.saved,true);
  const parent=h.scope.chart.notes.find(n=>n.nextId===copiedId),child=h.scope.chart.notes.find(n=>n.id===copiedId);
  assert.equal(parent.timeMs,1250);assert.equal(child.timeMs,2250);assert.equal(parent.lane,3);assert.equal(child.lane,3);
  assert.equal(h.scope.chart.notes.find(n=>n.id==='parent').timeMs,1000);
}
for(const cancel of ['pointercancel','lostpointercapture','pointerup']){
  const h=harness(linked,['child']);h.event('pointerdown',100,2000,{ctrlKey:true});
  if(cancel!=='pointerup')h.event('pointermove',140,2250);
  h.event(cancel,140,2250);
  assert.deepEqual(h.scope.chart,linked,'cancel and Ctrl-click without dragging leave no copies');
  assert.deepEqual([...h.scope.selectedIds],['child']);
}
{
  const h=harness(fixed,['fixed']);h.event('pointerdown',100,1000,{ctrlKey:true});
  h.event('pointermove',140,1000);h.event('pointerup',140,1000);
  assert.equal(h.scope.saved,false,'invalid fixed-group copies cannot be committed');
  assert.deepEqual(h.scope.chart,fixed);assert.deepEqual([...h.scope.selectedIds],['fixed']);
}
{
  const h=harness(original,['a','b']);h.scope.handle='width-right';
  h.event('pointerdown',100,1000);h.event('pointermove',140,1000);h.event('pointerup',140,1000);
  assert.equal(h.scope.saved,true);assert.deepEqual(h.scope.chart.notes.slice(0,2).map(n=>n.width),[3,3]);
}
for(const type of ['hold','flick-hold']){
  const placingSource=source.slice(source.indexOf('  function finishPlacement('),source.indexOf("  canvas.addEventListener('pointerdown',event=>"));
  const scope=vm.createContext({placing:{pointerId:1,type,timeMs:1000,startLane:2,currentLane:3},tool:type,chart:chart([]),canvas:{style:{},hasPointerCapture:()=>false},placementSpan:()=>({lane:2,width:2}),isHold:isHoldNote,nextId:()=>type,structuredClone,TYPES:{[type]:type},save(next){scope.chart=validateChartData(next);return true;},select(){},setStatus(){},draw(){}});
  vm.runInContext(placingSource+'\nfinishPlacement();',scope);
  const note=scope.chart.notes[0];assert.deepEqual(note.checkpoints,[]);
  const resizeScope=vm.createContext({defaultHoldCheckpoints,sameNumbers:(a,b)=>JSON.stringify(a)===JSON.stringify(b),note});
  vm.runInContext(resizeSource+'\nresult=resizedCheckpoints(note,2000);',resizeScope);assert.deepEqual([...resizeScope.result],[]);
}
console.log('Editor batch widths, connected copies, Ctrl drag commit/cancel and checkpoint-free placement passed');
