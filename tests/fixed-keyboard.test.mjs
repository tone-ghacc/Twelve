import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {connectEditorHolds} from '../dist/editor.js';
import {Game,validateChartData} from '../dist/engine.mjs';
import {defaultKeyboardWidths,keyboardGroups,createGroupPermutation,prepareFixedKeyboardChart,FixedKeyboardTimeline,FIXED_KEYBOARD_SWEEP_SECONDS} from '../dist/fixed-keyboard.mjs';
import {sweepProgress,drawFixedKeyboardStage,drawFixedKeyboardSweeps} from '../dist/fixed-keyboard-renderer.mjs';
import {createPerspective} from '../dist/projection.mjs';
const rng=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
const identity=Array.from({length:5},(_,i)=>i);
const tap=(id,timeMs,lane,width=1)=>({id,type:'tap',timeMs,lane,width});
const hold=(id,timeMs,lane,width,durationMs,type='hold')=>({id,type,timeMs,lane,width,durationMs,startType:'none',...(type==='flick-hold'?{endFlick:{lane,width}}:{})});
const section=(id,startMs,endMs,widths=[3,2,2,2,3])=>({id,startMs,endMs,widths});
const chart=(notes=[],sections=[section('a',1000,3000)])=>({schemaVersion:1,metadata:{durationMs:8000},timing:{bpm:120},notes,fixedKeyboardSections:sections});
for(let count=1;count<=6;count++){
  const widths=defaultKeyboardWidths(count);assert.equal(widths.length,count);assert.equal(widths.reduce((a,b)=>a+b),12);
  const data=validateChartData(chart([], [section('a',0,1000,widths)]));assert.deepEqual(data.fixedKeyboardSections[0].widths,widths);
}
assert.deepEqual(defaultKeyboardWidths(5),[3,2,2,2,3]);
assert.deepEqual(keyboardGroups([3,2,2,2,3]).map(g=>g.lane),[0,3,5,7,9]);
const legacy=chart();delete legacy.fixedKeyboardSections;assert.deepEqual(validateChartData(legacy).fixedKeyboardSections,[]);
for(const invalid of [null,{},[section('a',2000,1000)],[section('a',0,9000)],[section('a',.5,2000)],[section('a',0,1000,[])],[section('a',0,1000,[1,1,1,1,1,1,6])],[section('a',0,1000,[6,0,6])],[section('a',0,1000,[5,6])],[section('a',0,1000,[5.5,6.5])],[section('a',0,1000),section('a',2000,3000)],[section('a',0,1500),section('b',1000,2000)]])assert.throws(()=>validateChartData(chart([],invalid)));
assert.equal(validateChartData(chart([],[section('a',0,1000),section('b',1000,2000)])).fixedKeyboardSections.length,2);

// Permute whole keyboard groups, adapting lane AND width to the target.
for(let count=1;count<=6;count++)for(let seed=1;seed<=40;seed++){
  const permutation=createGroupPermutation(count,new Set([0]),rng(seed));assert.deepEqual([...permutation].sort((a,b)=>a-b),Array.from({length:count},(_,i)=>i));assert.equal(permutation[0],0);
}
assert.deepEqual(createGroupPermutation(5,new Set(),()=>0),[1,2,3,4,0]);
const original=validateChartData(chart([tap('before',500,0),tap('inside',1500,0,3),tap('widen',2000,7,2),tap('after',3000,2)]));
const snapshot=structuredClone(original),prepared=prepareFixedKeyboardChart(original,true,()=>0);
assert.deepEqual(original,snapshot);assert.deepEqual(prepared.sections[0].widths,[3,2,2,2,3]);
assert.equal(prepared.chart.notes[0].lane,0);assert.equal(prepared.chart.notes[3].lane,2);
assert.deepEqual([prepared.chart.notes[1].lane,prepared.chart.notes[1].width],[3,2],'3-wide group becomes 2-wide');
assert.deepEqual([prepared.chart.notes[2].lane,prepared.chart.notes[2].width],[9,3],'2-wide group becomes 3-wide');
assert.deepEqual(prepareFixedKeyboardChart(original,false).chart,original);
validateChartData(prepared.chart);
for(const invalidNote of [tap('narrow',1500,0,2),tap('shifted',1500,1,3),tap('straddles',1500,0,5),hold('bad-body',1500,1,2,500),{...hold('bad-end',1500,0,3,500,'flick-hold'),endFlick:{lane:0,width:2}},hold('cross-start',500,1,2,700)]){
  const input=chart([invalidNote]),copy=structuredClone(input);assert.throws(()=>validateChartData(input),/固定鍵盤区間/);assert.deepEqual(input,copy);
}
// End is exclusive for ordinary taps; boundary-crossing holds must align with
// every section they overlap, and remain stationary throughout their duration.
validateChartData(chart([tap('end-outside',3000,1,1)]));
const parent={...hold('parent',1300,0,3,500,'flick-hold'),nextId:'child'},child=hold('child',1800,0,3,500,'flick-hold');
const chain=validateChartData(chart([parent,child]));
for(let seed=1;seed<=20;seed++){
  const result=prepareFixedKeyboardChart(chain,true,rng(seed));validateChartData(result.chart);
  const [a,b]=result.chart.notes;assert.deepEqual([a.lane,a.width],[b.lane,b.width]);assert.deepEqual(a.endFlick,{lane:b.lane,width:b.width});assert.deepEqual(b.endFlick,a.endFlick);assert.equal(a.durationMs,parent.durationMs);assert.deepEqual(a.checkpoints,chain.notes[0].checkpoints);
}
const narrowedChain=prepareFixedKeyboardChart(chain,true,()=>0);assert.equal(narrowedChain.chart.notes[0].width,2);
const badLink=chart([{...parent,endFlick:{lane:3,width:2}},{...child,lane:3,width:2,endFlick:{lane:3,width:2}}]);
assert.throws(()=>validateChartData(badLink),/異なる鍵盤をまたぐ連結/);
validateChartData({...badLink,fixedKeyboardSections:[]});
const gapLink=structuredClone(badLink);delete gapLink.notes[0].nextId;gapLink.notes[1].timeMs=2200;const gapCopy=structuredClone(gapLink);
assert.throws(()=>connectEditorHolds(gapLink,'parent','child'),/異なる鍵盤をまたぐ連結/);assert.deepEqual(gapLink,gapCopy);
const crossing=[{...hold('parent',700,0,3,800,'flick-hold'),nextId:'child'},hold('child',1500,0,3,1800),tap('free',1800,5,2)];
const crossed=prepareFixedKeyboardChart(validateChartData(chart(crossing)),true,()=>0);
assert.deepEqual(crossed.chart.notes.filter(n=>n.durationMs),validateChartData(chart(crossing)).notes.filter(n=>n.durationMs));
assert.equal(crossed.sections[0].groupPermutation[0],0);
const exact=prepareFixedKeyboardChart(validateChartData(chart([hold('edge',2000,0,3,1000)])),true,rng(2));assert.equal(exact.chart.notes[0].lane,0);
assert.throws(()=>validateChartData(chart([hold('across-layouts',1500,0,3,1000)],[section('a',1000,2000),section('b',2000,3000,[2,2,2,2,2,2])])),/ホールド本体/);
// Legacy drafts stay loadable for repair, but cannot be played or saved under
// the new restrictions until corrected. The optional bypass is load-only.
const legacyDraft=validateChartData(chart([tap('old',1500,0,1)]),{checkFixedKeyboardNotes:false});
assert.equal(legacyDraft.notes[0].width,1);assert.throws(()=>new Game(false,legacyDraft),/固定鍵盤区間/);

// Active state ends immediately; an already-started light has its own life.
const sections=prepareFixedKeyboardChart(validateChartData(chart([],[section('short',1000,1100),section('next',1200,2400)]))).sections;
const timeline=new FixedKeyboardTimeline(sections);timeline.update(.99);assert.equal(timeline.active,null);assert.equal(timeline.effects.length,0);
timeline.update(1);assert.equal(timeline.active.id,'short');assert.equal(timeline.effects.length,1);
timeline.update(1.1);assert.equal(timeline.active,null);assert.equal(timeline.effects.length,1);
timeline.update(1.2);assert.equal(timeline.active.id,'next');assert.equal(timeline.effects.length,2);
timeline.update(1.2);assert.equal(timeline.effects.length,2,'no duplicate lights on repeated frames');
timeline.update(1+FIXED_KEYBOARD_SWEEP_SECONDS);assert.equal(timeline.effects.length,1);
timeline.update(2.4);assert.equal(timeline.active,null);assert.equal(timeline.effects.length,0);
timeline.update(.5);timeline.update(1.01);assert.equal(timeline.effects.length,1,'rewind/restart recreates the effect');
timeline.update(100);assert.equal(timeline.effects.length,0,'long frame skips do not resurrect expired effects');
const finalTimeline=new FixedKeyboardTimeline(prepareFixedKeyboardChart(validateChartData(chart([],[section('final',7900,8000)]))).sections);
finalTimeline.update(8.1);assert.equal(finalTimeline.active,null);assert.equal(finalTimeline.effects.length,1,'a light survives the end of the entire chart');
const drawCalls=[],ctx=new Proxy({createLinearGradient:()=>({addColorStop(){}})},{get:(target,key)=>target[key]??((...args)=>drawCalls.push([key,...args])),set:(target,key,value)=>{target[key]=value;return true;}});
const renderView=createPerspective(1200,700);
drawFixedKeyboardStage(ctx,renderView,finalTimeline,8.1);assert.equal(drawCalls.length,0,'expired sections leave no partition lines');
drawFixedKeyboardSweeps(ctx,renderView,finalTimeline,8.1);assert.ok(drawCalls.some(([method])=>method==='stroke'),'their light is still rendered');
for(const size of [[360,640],[1200,700]]){
  const view=createPerspective(...size);assert.ok(sweepProgress(view,0)>view.stageBottomProgress);assert.ok(sweepProgress(view,FIXED_KEYBOARD_SWEEP_SECONDS)<0);
  let previous=Infinity;for(let t=0;t<=FIXED_KEYBOARD_SWEEP_SECONDS;t+=.01){const p=sweepProgress(view,t);assert.ok(p<previous);previous=p;}
}

// The existing 12-lane + adjacent-lane input rules remain in force, even in a
// one-group section. Rendering and judgement use the same transformed notes.
const visualOnly=chart([tap('a',1500,0,3)]);
const far=new Game(false,visualOnly);far.press(11,1.5);assert.equal(far.combo,0);
const adjacent=new Game(false,visualOnly);adjacent.press(3,1.5);assert.equal(adjacent.perfectPlus,1);
const shuffled=new Game(false,original,{randomizeFixedKeyboard:true,rng:rng(42)}),target=shuffled.notes.find(n=>n.sourceId==='inside'),permutation=[...shuffled.fixedKeyboard.sections[0].groupPermutation];
shuffled.update(1,new Set());shuffled.press(target.lane,1.5);assert.equal(target.events[0].state,'hit');assert.equal(target.events[0].lane,target.lane);
shuffled.update(2,new Set());assert.deepEqual(shuffled.fixedKeyboard.sections[0].groupPermutation,permutation);
shuffled.update(3,new Set());assert.equal(shuffled.fixedKeyboard.active,null);
const holds=new Game(false,validateChartData(chart([hold('h',1200,0,3,500)])),{randomizeFixedKeyboard:true,rng:rng(5)});
const h=holds.notes[0];assert.equal(h.events[0].width,h.width);holds.update(1.2,new Set([h.lane]));holds.update(1.7,new Set([h.lane]));assert.equal(holds.miss,0);assert.equal(h.state,'hit');
console.log('Fixed keyboard validation, randomization, boundary holds, visual-only input and independent sweep tests passed');


// Exercise the actual saved-chart bootstrap: a previously valid draft is kept
// in localStorage and the play screen reports the issue instead of crashing.
const app=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8'),writes=[],overlays=[];
const context=vm.createContext({validateChartData,createDefaultChartData:()=>chart([]),Game,localStorage:{getItem:()=>JSON.stringify(legacyDraft),removeItem:key=>writes.push(key),setItem:key=>writes.push(key)},playSettings:{randomizeFixedKeyboard:false},game:null,$:()=>({checked:false}),showOverlay:(...args)=>overlays.push(args)});
vm.runInContext(app.slice(app.indexOf("let chartValidationError="),app.indexOf('const PLAY_SETTINGS_KEY')),context);
vm.runInContext(app.slice(app.indexOf('function showChartError('),app.indexOf('function audioInit('))+'\nnewGame();',context);
assert.deepEqual(writes,[]);assert.equal(vm.runInContext('chartData.notes[0].width',context),1);assert.equal(context.game.totalJudgements,0);assert.match(overlays[0][2],/保存済みの譜面は保持/);
