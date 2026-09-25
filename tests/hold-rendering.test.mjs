import assert from 'node:assert/strict';
import {createPerspective} from '../dist/projection.mjs';
import {createDefaultChartData,validateChartData,createJudgementEvents} from '../dist/engine.mjs';

const legacy={schemaVersion:1,metadata:{durationMs:5000},timing:{bpm:120},notes:[{id:'old-flick',type:'flick',timeMs:1000,lane:1,width:2,critical:true}]};
const migrated=validateChartData(legacy);
assert.equal(migrated.notes[0].critical,false);
assert.equal(legacy.notes[0].critical,true,'migration must not mutate the input');
assert.deepEqual(createJudgementEvents(legacy.notes[0]).map(e=>[e.kind,e.critical]),[['flick',false]]);
assert.ok(createDefaultChartData().notes.filter(n=>n.type==='flick').every(n=>!n.critical));
const criticalHold={id:'hold',type:'flick-hold',timeMs:1000,durationMs:1000,lane:1,width:2,critical:true,startType:'normal',checkpoints:[100],endFlick:{lane:0,width:4}};
assert.deepEqual(createJudgementEvents(criticalHold).map(e=>e.critical),[true,false,false],'Critical belongs only to the tap start, never to checkpoints or end flick');

for(const noteSpeed of [1,10,25])for(const noteStartPosition of [0,50,95])for(const lane of [0,5,10]){
  const view=createPerspective(1200,700,{noteSpeed,noteStartPosition}),span={lane,width:2},start=2,end=12;
  for(const elapsed of [start-view.visibleTimeMs/2000,start,start+.3,end,end+.1]){
    const head=view.holdSpan(span,start,elapsed,3),tail=view.holdSpan(span,end,elapsed,3);
    for(const point of [head,tail]){
      assert.ok(point.p>=view.visibleProgress&&point.p<=1);
      assert.ok(point.w>0);
      assert.ok(Math.abs(point.x-(view.laneX(lane,point.p)+3*point.scale))<1e-8);
      assert.ok(Math.abs(point.x+point.w-(view.laneX(lane+2,point.p)-3*point.scale))<1e-8);
    }
    // Both edges must remain on the projected lane boundaries throughout the
    // visible body, even when the real endpoint lies beyond the vanishing point.
    for(const ratio of [.25,.5,.75]){
      const p=tail.p+(head.p-tail.p)*ratio,x=tail.x+(head.x-tail.x)*ratio;
      assert.ok(Math.abs(x-(view.laneX(lane,p)+3*view.laneScale(p)))<1e-8);
    }
  }
}
console.log('Hold rendering and Critical Flick migration tests passed');
