import assert from 'node:assert/strict';
import {Game,validateChartData} from '../dist/engine.mjs';
import {defaultKeyboardWidths,keyboardGroups,createLanePermutation,prepareFixedKeyboardChart,FixedKeyboardTimeline,FIXED_KEYBOARD_SWEEP_SECONDS} from '../dist/fixed-keyboard.mjs';
import {sweepProgress,drawFixedKeyboardStage,drawFixedKeyboardSweeps} from '../dist/fixed-keyboard-renderer.mjs';
import {createPerspective} from '../dist/projection.mjs';
const rng=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
const identity=Array.from({length:12},(_,i)=>i);
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

// Randomization is a bijection, independent of grouping, and retains every
// contiguous body/end span. Exercise constrained and unconstrained charts.
const spans=[{lane:0,width:3},{lane:1,width:2},{lane:3,width:4},{lane:4,width:2},{lane:8,width:4}];
for(let seed=1;seed<=40;seed++){
  const permutation=createLanePermutation(spans,new Set([0]),rng(seed));assert.deepEqual([...permutation].sort((a,b)=>a-b),identity);assert.equal(permutation[0],0);
  for(const span of spans){const image=identity.slice(span.lane,span.lane+span.width).map(l=>permutation[l]);assert.equal(Math.max(...image)-Math.min(...image)+1,span.width);}
}
assert.notDeepEqual(createLanePermutation([],new Set(),rng(42)),identity);
const original=validateChartData(chart([tap('before',500,0),tap('inside',1500,1),tap('after',3000,2)]));
const snapshot=structuredClone(original),prepared=prepareFixedKeyboardChart(original,true,rng(42));
assert.deepEqual(original,snapshot);assert.deepEqual(prepared.sections[0].widths,[3,2,2,2,3]);
assert.equal(prepared.chart.notes[0].lane,0);assert.equal(prepared.chart.notes[2].lane,2);assert.equal(prepared.chart.notes[1].lane,prepared.sections[0].permutation[1]);
assert.deepEqual(prepareFixedKeyboardChart(original,false).chart,original);
const regrouped=structuredClone(original);regrouped.fixedKeyboardSections[0].widths=[6,6];assert.deepEqual(prepareFixedKeyboardChart(regrouped,true,rng(42)).sections[0].permutation,prepared.sections[0].permutation);

const parent={...hold('parent',1300,2,2,500,'flick-hold'),endFlick:{lane:1,width:5},nextId:'child'};
const child=hold('child',1800,4,2,500);
for(let seed=1;seed<=20;seed++){
  const data=validateChartData(chart([parent,child])),result=prepareFixedKeyboardChart(data,true,rng(seed));validateChartData(result.chart);
  for(const n of result.chart.notes){const source=data.notes.find(x=>x.id===n.id);assert.equal(n.width,source.width);assert.equal(n.durationMs,source.durationMs);}
}
// Boundary crossing, including an endpoint exactly on the boundary, pins the
// whole linked component. Those lane mappings stay identity in both sections.
const crossing=[{...hold('parent',700,2,2,800,'flick-hold'),endFlick:{lane:1,width:5},nextId:'child'},hold('child',1500,4,2,1800),tap('free',1800,10)];
const crossed=prepareFixedKeyboardChart(validateChartData(chart(crossing)),true,rng(42));
assert.deepEqual(crossed.chart.notes.filter(n=>n.durationMs).map(n=>[n.lane,n.width,n.endFlick]),validateChartData(chart(crossing)).notes.filter(n=>n.durationMs).map(n=>[n.lane,n.width,n.endFlick]));
for(let lane=1;lane<6;lane++)assert.equal(crossed.sections[0].permutation[lane],lane);
const exact=prepareFixedKeyboardChart(validateChartData(chart([hold('edge',2000,1,3,1000)])),true,rng(2));assert.equal(exact.chart.notes[0].lane,1);

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
const visualOnly=chart([tap('a',1500,0)],[section('one',1000,3000,[12])]);
const far=new Game(false,visualOnly);far.press(11,1.5);assert.equal(far.combo,0);
const adjacent=new Game(false,visualOnly);adjacent.press(1,1.5);assert.equal(adjacent.perfectPlus,1);
const shuffled=new Game(false,original,{randomizeFixedKeyboard:true,rng:rng(42)}),target=shuffled.notes.find(n=>n.sourceId==='inside'),permutation=[...shuffled.fixedKeyboard.sections[0].permutation];
shuffled.update(1,new Set());shuffled.press(target.lane,1.5);assert.equal(target.events[0].state,'hit');assert.equal(target.events[0].lane,target.lane);
shuffled.update(2,new Set());assert.deepEqual(shuffled.fixedKeyboard.sections[0].permutation,permutation);
shuffled.update(3,new Set());assert.equal(shuffled.fixedKeyboard.active,null);
const holds=new Game(false,validateChartData(chart([hold('h',1200,2,2,500)])),{randomizeFixedKeyboard:true,rng:rng(5)});
const h=holds.notes[0];holds.update(1.2,new Set([h.lane]));holds.update(1.7,new Set([h.lane]));assert.equal(holds.miss,0);assert.equal(h.state,'hit');
console.log('Fixed keyboard validation, randomization, boundary holds, visual-only input and independent sweep tests passed');
