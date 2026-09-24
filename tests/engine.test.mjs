import assert from 'node:assert/strict';
import {
  Game,
  createDefaultChartData,
  createJudgementEvents,
  defaultHoldCheckpoints,
  validateChartData
} from '../dist/engine.mjs';
import {chartAuditionEvents} from '../dist/editor.js';
import {createPerspective,getNoteSpawnTimeMs,getNoteVisibleTimeMs,NOTE_START_POSITIONS,validateNoteSpeed,validateNoteStartPosition} from '../dist/projection.mjs';

const baseChart=note=>({
  schemaVersion:1,
  metadata:{title:'Test',durationMs:5000},
  timing:{bpm:120,offsetMs:0,timeSignature:[4,4]},
  notes:[note]
});

{
  const legacy=validateChartData(baseChart({id:'legacy',type:'hold',timeMs:1000,durationMs:300,lane:0,width:2}));
  assert.equal(legacy.notes[0].startType,'none');
  assert.deepEqual(legacy.notes[0].checkpoints,[100,200]);
}

{
  const normal={id:'normal',type:'hold',timeMs:1000,durationMs:300,lane:0,width:2,startType:'normal',critical:true,checkpoints:[100,200]};
  const events=createJudgementEvents(normal);
  assert.deepEqual(events.map(event=>event.kind),['critical-hold-start','hold-checkpoint','hold-checkpoint','hold-end']);
  assert.equal(events.length,4,'critical hold start is one combined judgement');
}

{
  const scratch={id:'scratch',type:'hold',timeMs:1000,durationMs:300,lane:0,width:2,startType:'scratch',critical:false,checkpoints:[100,200]};
  assert.deepEqual(createJudgementEvents(scratch).map(event=>event.kind),['scratch-start','hold-checkpoint','hold-checkpoint','hold-end']);
  assert.throws(()=>validateChartData(baseChart({...scratch,critical:true})),/スクラッチ始点にCritical属性は設定できません/);
}

{
  const none={id:'none',type:'hold',timeMs:1000,durationMs:300,lane:0,width:2,startType:'none',checkpoints:[100,200]};
  assert.deepEqual(createJudgementEvents(none).map(event=>event.kind),['hold-checkpoint','hold-checkpoint','hold-end']);
  const game=new Game(false,baseChart(none));
  game.update(1.1,new Set());
  game.update(1.2,new Set([0]));
  game.update(1.3,new Set([0]));
  assert.equal(game.totalJudgements,3);
  assert.equal(game.miss,1);
  assert.equal(game.perfect,2,'a missed beginning does not destroy later hold judgements');
}

{
  const normal={id:'normal',type:'hold',timeMs:1000,durationMs:300,lane:0,width:2,startType:'normal',checkpoints:[100,200]};
  const game=new Game(false,baseChart(normal));
  game.update(1,new Set([0]));
  game.press(0,1);
  game.update(1.1,new Set([0]));
  game.update(1.2,new Set());
  game.update(1.3,new Set([0]));
  assert.equal(game.perfectPlus,1);
  assert.equal(game.perfect,2);
  assert.equal(game.miss,1);
  assert.equal(game.notes[0].state,'hit');
}

{
  const scratch={id:'scratch',type:'hold',timeMs:1000,durationMs:200,lane:0,width:2,startType:'scratch',checkpoints:[100]};
  const game=new Game(false,baseChart(scratch));
  game.press(0,1);
  assert.equal(game.perfectPlus,0,'scratch starts do not accept a tap');
  game.flick([0],1);
  assert.equal(game.perfectPlus,1);
}

{
  const flickHold={id:'flick-hold',type:'flick-hold',timeMs:1000,durationMs:300,lane:0,width:2,startType:'none',critical:false,checkpoints:[100,200],endFlick:{lane:0,width:4}};
  const game=new Game(false,baseChart(flickHold));
  game.update(1.1,new Set([0]));
  game.update(1.2,new Set([0]));
  game.flick([3],1.3);
  assert.equal(game.totalJudgements,3);
  assert.equal(game.perfectPlus,1,'wide flick endpoints accept any covered lane');
  assert.equal(game.perfect,2);
}

{
  const tap={id:'tap',type:'tap',timeMs:1000,lane:0,width:1,critical:true};
  const game=new Game(false,baseChart(tap));
  game.press(0,1);
  assert.equal(game.score,1010000,'an all PERFECT+ chart reaches 1,010,000');
}

assert.deepEqual(defaultHoldCheckpoints(450),[100,200,300,400]);
assert.deepEqual(chartAuditionEvents(validateChartData(baseChart({id:'preview',type:'hold',timeMs:1000,durationMs:300,lane:0,width:1,startType:'none',checkpoints:[150]}))).map(event=>[event.timeMs,event.type]),[[1150,'hold-checkpoint'],[1300,'hold-end']]);
assert.doesNotThrow(()=>validateChartData(createDefaultChartData()));

assert.equal(getNoteVisibleTimeMs(10,0),740);
assert.equal(getNoteVisibleTimeMs(20,0),370);
assert.equal(getNoteVisibleTimeMs(10,50),370);
assert.equal(getNoteVisibleTimeMs(25,0),296);
assert.equal(getNoteVisibleTimeMs(10,100),0);
assert.equal(getNoteSpawnTimeMs(2000,10,50),1630);
assert.throws(()=>validateNoteSpeed(.9),RangeError);
assert.throws(()=>validateNoteSpeed(25.1),RangeError);
assert.throws(()=>validateNoteSpeed(10.15),RangeError);
assert.throws(()=>validateNoteStartPosition(52),RangeError);
for(const position of NOTE_START_POSITIONS.slice(0,-1))assert.ok(getNoteVisibleTimeMs(10,position)>=getNoteVisibleTimeMs(10,position+5));
for(let speed=10;speed<25;speed+=.1)assert.ok(getNoteVisibleTimeMs(speed,0)>=getNoteVisibleTimeMs(Math.round((speed+.1)*10)/10,0));
const fullStart=createPerspective(1200,700,{noteSpeed:20,noteStartPosition:0}),nearStart=createPerspective(1200,700,{noteSpeed:10,noteStartPosition:50});
assert.equal(fullStart.visibleTimeMs,nearStart.visibleTimeMs);
assert.equal(fullStart.visibleY,0);
assert.ok(nearStart.visibleY>0,'the same visible time can begin at a nearer lane position');
console.log('engine tests passed');
