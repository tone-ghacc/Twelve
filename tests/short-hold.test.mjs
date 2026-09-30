import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Game,validateChartData,createJudgementEvents,defaultHoldCheckpoints,isHoldNote,MIN_HOLD_DURATION_MS} from '../dist/engine.mjs';
import {snapHoldDuration,chartAuditionEvents} from '../dist/editor.js';

const chart=notes=>({schemaVersion:1,metadata:{durationMs:5000},timing:{bpm:120},notes});
const hold=(type,durationMs)=>({id:'short',type,timeMs:1000,durationMs,lane:2,width:2,startType:'normal',...(type==='flick-hold'?{endFlick:{lane:2,width:2}}:{})});
for(const type of ['hold','flick-hold']){
  for(const duration of [1,16,31,50,99,100,101]){
    const data=validateChartData(chart([hold(type,duration)]));
    assert.equal(data.notes[0].durationMs,duration);
    assert.deepEqual(data.notes[0].checkpoints,defaultHoldCheckpoints(duration));
    const events=createJudgementEvents(data.notes[0]);
    assert.equal(events.at(-1).timeMs,1000+duration);
    assert.equal(chartAuditionEvents(data).at(-1).timeMs,1000+duration);
    assert.deepEqual(validateChartData(JSON.parse(JSON.stringify(data))),data,'short holds survive JSON save/import');
    const game=new Game(false,data);game.update(1,new Set([2]));game.press(2,1);
    if(type==='flick-hold')game.flick([2],1+duration/1000);
    game.update(1+duration/1000,new Set([2]));
    assert.equal(game.miss,0);assert.equal(game.notes[0].state,'hit');
    assert.equal(game.perfectPlus,type==='flick-hold'?2:1);
  }
  for(const duration of [0,-1,.5,NaN])assert.throws(()=>validateChartData(chart([hold(type,duration)])),/1ms以上の整数/);
  assert.doesNotThrow(()=>validateChartData(chart([{...hold(type,1),timeMs:4999}])));
  assert.throws(()=>validateChartData(chart([{...hold(type,2),timeMs:4999}])),/終点を譜面内/);
}

// Run the actual editor drag path: shrinking the parent below 100ms also
// removes obsolete checkpoints and moves its connected child to the new end.
const source=readFileSync(new URL('../dist/editor.js',import.meta.url),'utf8');
const resizeSource=source.match(/  function resizedCheckpoints[^\r\n]+/)[0];
const dragSource=source.slice(source.indexOf('  function previewDrag('),source.indexOf('  function finishDrag('));
for(const type of ['hold','flick-hold']){
  const original=validateChartData(chart([
    {...hold(type,1000),nextId:'child'},
    {...hold('hold',500),id:'child',timeMs:2000,startType:'none'}
  ]));
  const scope=vm.createContext({chart:original,drag:{id:'short',mode:'duration',originChart:original,members:original.notes,downstream:['child'],startX:0,startY:2000},laneMetrics:()=>({laneW:40}),structuredClone,snapHoldDuration,MIN_HOLD_DURATION_MS,defaultHoldCheckpoints,sameNumbers:(a,b)=>JSON.stringify(a)===JSON.stringify(b),pointTime:y=>y,durationMs:()=>5000,snapDivision:128,renderInspector(){},draw(){}});
  vm.runInContext(resizeSource+'\n'+dragSource+'\npreviewDrag(0,1031);',scope);
  const result=validateChartData(scope.chart),parent=result.notes.find(n=>n.id==='short'),child=result.notes.find(n=>n.id==='child');
  assert.equal(parent.durationMs,31,'drag uses the small snap division without a 100ms clamp');
  assert.deepEqual(parent.checkpoints,[]);
  assert.equal(child.timeMs,1031);assert.equal(child.durationMs,500);
}
console.log('Short holds: integer-ms editing, snapping, linked resizing, JSON round trips and playback passed');
