import {FIXED_KEYBOARD_SWEEP_SECONDS} from './fixed-keyboard.mjs';

export function sweepProgress(view,age){
  // Reuse the same nonlinear depth projection as notes, travelling backwards
  // from beyond the near edge to beyond the horizon.
  return view.progress(view.travel*(-.35+1.65*Math.min(1,Math.max(0,age/FIXED_KEYBOARD_SWEEP_SECONDS))),0);
}
function quad(ctx,view,left,right,near,far){
  const y=p=>view.topY+(view.hitY-view.topY)*p;
  ctx.beginPath();ctx.moveTo(view.laneX(left,far),y(far));ctx.lineTo(view.laneX(right,far),y(far));ctx.lineTo(view.laneX(right,near),y(near));ctx.lineTo(view.laneX(left,near),y(near));ctx.closePath();
}
export function drawFixedKeyboardStage(ctx,view,timeline,time,{groups=true,lines=true}={}){
  const section=timeline.active;if(!section)return;
  const far=Math.max(0,sweepProgress(view,time-section.startMs/1000)),near=view.stageBottomProgress;
  if(far>=near)return;
  ctx.save();
  if(groups)section.groups.forEach((group,index)=>{ctx.fillStyle=index%2?'#a5baff12':'#70dcf81e';quad(ctx,view,group.lane,group.lane+group.width,near,far);ctx.fill();});
  const boundaries=[0,...section.groups.map(group=>group.lane+group.width)];
  if(lines)for(const lane of boundaries){quad(ctx,view,lane-.018,lane+.018,near,far);ctx.fillStyle='#b8eeff';ctx.shadowColor='#65cfff';ctx.shadowBlur=8;ctx.fill();}
  ctx.restore();
}
export function drawFixedKeyboardSweeps(ctx,view,timeline,time){
  ctx.save();
  for(const effect of timeline.effects){
    const p=sweepProgress(view,time-effect.startedAt),scale=Math.max(.1,view.laneScale(p));
    if(p<-.07||p>view.stageBottomProgress+.1)continue;
    const y=view.topY+(view.hitY-view.topY)*p,near=p+.065,far=p-.012;
    const glow=ctx.createLinearGradient(0,y-(view.hitY-view.topY)*.012,0,y+(view.hitY-view.topY)*.065);
    glow.addColorStop(0,'#d6f9ff');glow.addColorStop(.2,'#70dcf899');glow.addColorStop(1,'#70dcf800');
    quad(ctx,view,0,12,near,far);ctx.fillStyle=glow;ctx.fill();
    ctx.strokeStyle='#edfcff';ctx.lineWidth=2.5*scale;ctx.shadowColor='#70dcf8';ctx.shadowBlur=18*scale;
    ctx.beginPath();ctx.moveTo(view.laneX(0,p),y);ctx.lineTo(view.laneX(12,p),y);ctx.stroke();
    for(const group of effect.section.groups){ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(view.laneX(group.lane,p),y,3*scale,0,Math.PI*2);ctx.fill();}
  }
  ctx.restore();
}
