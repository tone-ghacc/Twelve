const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export const NOTE_SPEED_MIN=1;
export const NOTE_SPEED_MAX=25;
export const NOTE_SPEED_STEP=.1;
export const NOTE_START_POSITIONS=Object.freeze(Array.from({length:21},(_,index)=>index*5));
export const NOTE_DISTANCE=Object.freeze({
  0:7400,5:7050,10:20000/3,15:6300,20:17800/3,25:16700/3,30:15550/3,
  35:14450/3,40:4450,45:12250/3,50:3700,55:10000/3,60:8900/3,
  65:2600,70:6650/3,75:1850,80:4450/3,85:3350/3,90:2200/3,95:1100/3,100:0
});

export function validateNoteSpeed(value){
  const speed=Number(value),scaled=Math.round(speed*10);
  if(!Number.isFinite(speed)||speed<NOTE_SPEED_MIN||speed>NOTE_SPEED_MAX||Math.abs(speed*10-scaled)>1e-7)throw new RangeError('noteSpeed must be 1.0..25.0 in increments of 0.1');
  return scaled/10;
}

export function validateNoteStartPosition(value){
  const position=Number(value);
  if(!Number.isInteger(position)||!NOTE_START_POSITIONS.includes(position))throw new RangeError('noteStartPosition must be 0..100 in increments of 5');
  return position;
}

export function roundToEvenMilliseconds(value){return Math.round(value/2)*2;}

export function getNoteVisibleTimeMs(noteSpeed,noteStartPosition){
  const speed=validateNoteSpeed(noteSpeed),position=validateNoteStartPosition(noteStartPosition);
  return roundToEvenMilliseconds(NOTE_DISTANCE[position]/speed);
}

export function getNoteSpawnTimeMs(judgeTimeMs,noteSpeed,noteStartPosition){
  if(!Number.isFinite(judgeTimeMs))throw new RangeError('judgeTimeMs must be finite');
  return judgeTimeMs-getNoteVisibleTimeMs(noteSpeed,noteStartPosition);
}

export function perspectiveMetrics(scale,thickness=1){
  const value=clamp(scale,.2,1.15),size=clamp(Number(thickness)||1,.5,2);return{noteHeight:12*value*size,accentHeight:Math.max(.5,2*value*size),outlineWidth:Math.max(.75,2*value),arrowOffset:(10+6*size)*value,arrowHeight:Math.max(1.5,4*value),shadowBlur:12*value,tickHeight:Math.max(.75,value)};
}

export function createPerspective(width,height,settings={}){
  const noteSpeed=validateNoteSpeed(settings.noteSpeed??10),noteStartPosition=validateNoteStartPosition(settings.noteStartPosition??50),visibleTimeMs=getNoteVisibleTimeMs(noteSpeed,noteStartPosition),fullTravelTimeMs=getNoteVisibleTimeMs(noteSpeed,0),travel=Math.max(.001,fullTravelTimeMs/1000),visibleLinear=fullTravelTimeMs?clamp(1-visibleTimeMs/fullTravelTimeMs,0,1):1;
  const judgementHeight=Math.max(18,Math.min(80,width/24)),hitY=height*.8,bottomGap=height-hitY-judgementHeight/2,judgementTop=hitY-judgementHeight/2,judgementBottom=judgementTop+judgementHeight,topY=0,judgementTopProgress=(judgementTop-topY)/(hitY-topY),judgementBottomProgress=(judgementBottom-topY)/(hitY-topY),stageBottomProgress=(height-topY)/(hitY-topY),topScale=1/6,depthPower=2.2,entrySlope=.28,exitSlope=entrySlope+(1-entrySlope)*depthPower;
  const projectProgress=linear=>linear<0?linear*entrySlope:linear<=1?entrySlope*linear+(1-entrySlope)*Math.pow(linear,depthPower):1+(linear-1)*exitSlope;
  const progress=(at,elapsed)=>projectProgress(1-(at-elapsed)/travel);
  const visibleProgress=projectProgress(visibleLinear),visibleY=topY+(hitY-topY)*visibleProgress;
  const laneScale=p=>topScale+(1-topScale)*p;
  const laneX=(lane,p)=>width/2+(lane/12-.5)*width*laneScale(p);
  const project=(at,elapsed)=>{const p=progress(at,elapsed);return{p,y:topY+(hitY-topY)*p,scale:laneScale(p)};};
  const spanAtProgress=(noteSpan,p,inset=0)=>{const point={p,y:topY+(hitY-topY)*p,scale:laneScale(p)},left=laneX(noteSpan.lane,p),right=laneX(noteSpan.lane+noteSpan.width,p),safeInset=clamp(inset*point.scale,0,Math.max(0,(right-left)*.22));return{...point,x:left+safeInset,w:Math.max(0,right-left-safeInset*2)};};
  const span=(noteSpan,at,elapsed,inset=0)=>spanAtProgress(noteSpan,progress(at,elapsed),inset);
  // Clip depth before computing widths: far-offscreen endpoints can otherwise
  // have negative scale and distort even the visible portion of a long hold.
  const holdSpan=(noteSpan,at,elapsed,inset=0)=>spanAtProgress(noteSpan,clamp(progress(at,elapsed),visibleProgress,1),inset);
  return{hitY,judgementTop,judgementBottom,judgementHeight,judgementTopProgress,judgementBottomProgress,stageBottomProgress,bottomGap,topY,travel,fullTravelTimeMs,visibleTimeMs,visibleLinear,visibleProgress,visibleY,noteSpeed,noteStartPosition,topScale,depthPower,entrySlope,progress,laneScale,laneX,project,span,spanAtProgress,holdSpan};
}
