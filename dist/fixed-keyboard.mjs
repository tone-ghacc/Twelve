const LANES=12;
export const FIXED_KEYBOARD_SWEEP_SECONDS=.65;
const identity=(count=LANES)=>Array.from({length:count},(_,lane)=>lane);
export function keyboardGroups(widths){let lane=0;return widths.map(width=>{const group={lane,width};lane+=width;return group;});}
export function defaultKeyboardWidths(count){
  if(!Number.isInteger(count)||count<1||count>6)throw new Error('分割数は1〜6で指定してください');
  const widths=Array(count).fill(Math.floor(LANES/count));
  // Distribute remainder from both outside edges, e.g. five keys => 3,2,2,2,3.
  for(let i=0;i<LANES%count;i++)widths[i%2?count-1-Math.floor(i/2):Math.floor(i/2)]++;
  return widths;
}
export function validateFixedKeyboardSections(value,durationMs){
  if(value===undefined)return [];
  if(!Array.isArray(value))throw new Error('fixedKeyboardSections は配列で指定してください');
  const ids=new Set();
  const sections=value.map((section,index)=>{
    const prefix=`固定鍵盤区間 ${index+1}`,{id,startMs,endMs,widths}=section??{};
    if(typeof id!=='string'||!id||ids.has(id))throw new Error(`${prefix}: IDは重複しない文字列にしてください`);
    ids.add(id);
    if(!Number.isInteger(startMs)||!Number.isInteger(endMs)||startMs<0||endMs<=startMs||endMs>durationMs)throw new Error(`${prefix}: 開始・終了は譜面内の整数msで、開始 < 終了にしてください`);
    if(!Array.isArray(widths)||widths.length<1||widths.length>6||widths.some(n=>!Number.isInteger(n)||n<1)||widths.reduce((a,b)=>a+b,0)!==LANES)throw new Error(`${prefix}: 分割配列は1〜6個の正整数、合計12にしてください`);
    return{id,startMs,endMs,widths:[...widths]};
  }).sort((a,b)=>a.startMs-b.startMs);
  for(let i=1;i<sections.length;i++)if(sections[i].startMs<sections[i-1].endMs)throw new Error('固定鍵盤区間の時間範囲を重ねることはできません');
  return sections;
}
const shuffle=(values,rng)=>{const result=[...values];for(let i=result.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;};
const spansOf=note=>[note,...(note.endFlick?[note.endFlick]:[])];
export const matchingKeyboardGroup=(groups,span)=>groups.findIndex(group=>group.lane===span.lane&&group.width===span.width);

export function validateFixedKeyboardNotes(chart){
  const byId=new Map(chart.notes.map(n=>[n.id,n]));
  for(const section of chart.fixedKeyboardSections){
    const groups=keyboardGroups(section.widths),contains=time=>time>=section.startMs&&time<section.endMs;
    const requireGroup=(span,n,label)=>{
      const index=matchingKeyboardGroup(groups,span);
      if(index<0)throw new Error(`${n.id}: 固定鍵盤区間 ${section.id} の${label}は1つの鍵盤の左端・幅に一致させてください（${groups.map(g=>`レーン${g.lane+1}〜${g.lane+g.width}・幅${g.width}`).join(' / ')}）`);
      return index;
    };
    for(const n of chart.notes){
      const end=n.timeMs+(n.durationMs||0);
      if(n.timeMs<section.endMs&&end>=section.startMs)requireGroup(n,n,n.durationMs?'ホールド本体':'ノーツ');
      if(n.endFlick&&contains(end))requireGroup(n.endFlick,n,'終点フリック');
      if(n.nextId&&contains(end)){
        const next=byId.get(n.nextId),sourceGroup=requireGroup(n,n,'連結元'),endGroup=requireGroup(n.endFlick??n,n,'連結終点'),nextGroup=requireGroup(next,next,'連結先');
        if(sourceGroup!==endGroup||sourceGroup!==nextGroup)throw new Error(`${n.id} → ${next.id}: 固定鍵盤区間 ${section.id} では異なる鍵盤をまたぐ連結はできません`);
      }
    }
  }
}

export function createGroupPermutation(count,pinned=new Set(),rng=Math.random){
  const map=identity(count),movable=map.filter(index=>!pinned.has(index)),targets=shuffle(movable,rng);
  movable.forEach((source,index)=>{map[source]=targets[index];});return map;
}

export function prepareFixedKeyboardChart(chart,randomize=false,rng=Math.random){
  const notes=structuredClone(chart.notes),byId=new Map(notes.map(n=>[n.id,n]));
  const parents=new Map(notes.filter(n=>n.nextId).map(n=>[n.nextId,n.id]));
  const sectionFor=note=>chart.fixedKeyboardSections.find(s=>note.timeMs>=s.startMs&&note.timeMs+(note.durationMs||0)<s.endMs);
  // Keep entire connected components stationary when they cross a boundary.
  const stationary=new Set();
  for(const note of notes){
    if(parents.has(note.id))continue;
    const chain=[];let current=note;
    while(current){chain.push(current);current=byId.get(current.nextId);}
    const section=sectionFor(note);
    if(chain.some(n=>sectionFor(n)!==section)||chain.some(n=>n.durationMs&&chart.fixedKeyboardSections.some(s=>n.timeMs<s.endMs&&n.timeMs+n.durationMs>=s.startMs&&sectionFor(n)!==s)))for(const n of chain)stationary.add(n.id);
  }
  const sections=chart.fixedKeyboardSections.map(section=>{
    const intersects=n=>n.timeMs<section.endMs&&n.timeMs+(n.durationMs||0)>=section.startMs;
    const relevant=chart.notes.filter(intersects),groups=keyboardGroups(section.widths),pinned=new Set();
    for(const n of relevant)if(stationary.has(n.id)||sectionFor(n)!==section)for(const span of spansOf(n))groups.forEach((group,index)=>{if(span.lane<group.lane+group.width&&span.lane+span.width>group.lane)pinned.add(index);});
    const groupPermutation=randomize?createGroupPermutation(groups.length,pinned,rng):identity(groups.length);
    return{...section,groups,groupPermutation};
  });
  for(const note of notes){
    const section=sections.find(s=>note.timeMs>=s.startMs&&note.timeMs+(note.durationMs||0)<s.endMs);
    if(!section||stationary.has(note.id))continue;
    for(const span of spansOf(note)){const source=matchingKeyboardGroup(section.groups,span),target=section.groups[section.groupPermutation[source]];Object.assign(span,target);}
  }
  return{chart:{...chart,notes},sections};
}

export class FixedKeyboardTimeline{
  constructor(sections=[]){this.sections=sections;this.effects=[];this.cursor=0;this.lastTime=-Infinity;this.active=null;}
  sectionAt(time){return this.sections.find(s=>time>=s.startMs/1000&&time<s.endMs/1000)??null;}
  update(time){
    if(time<this.lastTime){this.cursor=0;this.effects=[];}
    while(this.cursor<this.sections.length&&this.sections[this.cursor].startMs/1000<=time){
      const section=this.sections[this.cursor++],startedAt=section.startMs/1000;
      if(time<startedAt+FIXED_KEYBOARD_SWEEP_SECONDS)this.effects.push({section,startedAt});
    }
    this.effects=this.effects.filter(effect=>time<effect.startedAt+FIXED_KEYBOARD_SWEEP_SECONDS);
    this.active=this.sectionAt(time);this.lastTime=time;
  }
}
