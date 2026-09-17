const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function perspectiveMetrics(scale){
  const value=clamp(scale,.2,1.15);return{noteHeight:12*value,accentHeight:Math.max(1,2*value),outlineWidth:Math.max(.75,2*value),arrowOffset:16*value,arrowHeight:Math.max(1.5,4*value),shadowBlur:12*value,tickHeight:Math.max(.75,value)};
}

export function createPerspective(width,height,speed=1){
  const judgementHeight=Math.max(18,Math.min(80,width/24)),bottomGap=Math.max(28,Math.min(52,height*.07)),hitY=height-bottomGap-judgementHeight/2,judgementTop=hitY-judgementHeight/2,judgementBottom=judgementTop+judgementHeight,topY=Math.max(26,Math.min(46,height*.075)),judgementTopProgress=(judgementTop-topY)/(hitY-topY),judgementBottomProgress=(judgementBottom-topY)/(hitY-topY),stageBottomProgress=(height-topY)/(hitY-topY),travel=1.6/Math.max(.25,Number(speed)||1),topScale=1/6,depthPower=2.2,entrySlope=.28,exitSlope=entrySlope+(1-entrySlope)*depthPower;
  const progress=(at,elapsed)=>{const linear=1-(at-elapsed)/travel;return linear<0?linear*entrySlope:linear<=1?entrySlope*linear+(1-entrySlope)*Math.pow(linear,depthPower):1+(linear-1)*exitSlope;};
  const laneScale=p=>topScale+(1-topScale)*p;
  const laneX=(lane,p)=>width/2+(lane/12-.5)*width*laneScale(p);
  const project=(at,elapsed)=>{const p=progress(at,elapsed);return{p,y:topY+(hitY-topY)*p,scale:laneScale(p)};};
  const span=(noteSpan,at,elapsed,inset=0)=>{const point=project(at,elapsed),left=laneX(noteSpan.lane,point.p),right=laneX(noteSpan.lane+noteSpan.width,point.p),safeInset=clamp(inset*point.scale,0,Math.max(0,(right-left)*.22));return{...point,x:left+safeInset,w:Math.max(0,right-left-safeInset*2)};};
  return{hitY,judgementTop,judgementBottom,judgementHeight,judgementTopProgress,judgementBottomProgress,stageBottomProgress,bottomGap,topY,travel,topScale,depthPower,entrySlope,progress,laneScale,laneX,project,span};
}
