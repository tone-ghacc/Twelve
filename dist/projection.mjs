const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function createPerspective(width,height,speed=1){
  const hitY=height-68,topY=Math.max(26,Math.min(46,height*.075)),travel=3.2/Math.max(.25,Number(speed)||1),topScale=.34,depthPower=1.7;
  const progress=(at,elapsed)=>{const linear=1-(at-elapsed)/travel;return linear<0?linear:linear<=1?Math.pow(linear,depthPower):1+(linear-1)*depthPower;};
  const laneScale=p=>topScale+(1-topScale)*p;
  const laneX=(lane,p)=>width/2+(lane/12-.5)*width*laneScale(p);
  const project=(at,elapsed)=>{const p=progress(at,elapsed);return{p,y:topY+(hitY-topY)*p,scale:laneScale(p)};};
  const span=(noteSpan,at,elapsed,inset=0)=>{const point=project(at,elapsed),left=laneX(noteSpan.lane,point.p),right=laneX(noteSpan.lane+noteSpan.width,point.p),safeInset=clamp(inset,0,Math.max(0,(right-left)*.22));return{...point,x:left+safeInset,w:Math.max(0,right-left-safeInset*2)};};
  return{hitY,topY,travel,topScale,depthPower,progress,laneScale,laneX,project,span};
}
