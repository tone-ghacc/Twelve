import assert from 'node:assert/strict';
import {createPerspective,perspectiveMetrics,STAGE_PERSPECTIVE,getNoteVisibleTimeMs} from '../dist/projection.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

for(const [width,height] of [[710,372],[360,640],[1200,700],[1920,1080]]){
  const view=createPerspective(width,height,{noteSpeed:10,noteStartPosition:0});
  const stageWidth=p=>view.laneX(12,p)-view.laneX(0,p);
  close(stageWidth(0)/width,.10);close(stageWidth(1)/width,.78);close(stageWidth(view.stageBottomProgress)/width,1);
  close(view.hitY/height,(.78-.10)/(1-.10));
  close(view.laneX(0,view.stageBottomProgress),0);close(view.laneX(12,view.stageBottomProgress),width);
  // Straight lane sides, note spans and hold edges share exactly the same
  // transform at every screen height, not just at the three reference rows.
  for(let i=0;i<=100;i++){
    const y=height*i/100,p=y/view.hitY;
    close(view.laneScale(p),.10+.90*y/height);
    for(const span of [{lane:0,width:1},{lane:3,width:4},{lane:10,width:2}]){
      const note=view.spanAtProgress(span,p,3),far=view.spanAtProgress(span,0,3),near=view.spanAtProgress(span,view.stageBottomProgress,3);
      close(note.x,view.laneX(span.lane,p)+3*note.scale);
      close(note.x+note.w,view.laneX(span.lane+span.width,p)-3*note.scale);
      close(note.x,far.x+(near.x-far.x)*y/height);
    }
  }
  for(let lane=0;lane<12;lane++){
    assert.equal(view.laneAtX(view.laneX(lane+.5,1)),lane);
    assert.equal(view.laneAtX(view.laneX(lane+.001,1)),lane);
    assert.equal(view.laneAtX(view.laneX(lane+.999,1)),lane);
  }
  assert.equal(view.laneAtX(view.laneX(0,1)-1),-1);
  assert.equal(view.laneAtX(view.laneX(12,1)+1),-1);
  assert.equal(view.laneAtX(-100,true),0);assert.equal(view.laneAtX(width+100,true),11);
  assert.equal(view.laneAtX(NaN),-1);
  close(perspectiveMetrics(.10).noteHeight/perspectiveMetrics(1).noteHeight,.10);
  // Geometry adjustments never change scheduled appearance or hit times.
  assert.equal(view.visibleTimeMs,getNoteVisibleTimeMs(10,0));
  close(view.project(5,5).y,view.hitY);close(view.project(5,5-view.travel).y,0);
}
assert.deepEqual(STAGE_PERSPECTIVE,{farWidth:.10,judgementWidth:.78,nearWidth:1});
console.log('Perspective widths, straight edges, note/hold alignment and judgement input coordinates passed');
