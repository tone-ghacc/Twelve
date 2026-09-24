import assert from 'node:assert/strict';
import {notesInEditorRect} from '../dist/editor.js';

const metrics={laneW:40,x:lane=>38+lane*40,y:ms=>1000-ms*.2};
const notes=[
  {id:'tap',type:'tap',timeMs:1000,lane:0,width:2},
  {id:'hold',type:'hold',timeMs:2000,durationMs:1000,lane:4,width:2},
  {id:'wide',type:'flick-hold',timeMs:3500,durationMs:500,lane:8,width:1,endFlick:{lane:7,width:4}}
];
assert.deepEqual(notesInEditorRect(notes,{x:40,y:790},{x:100,y:820},metrics),['tap']);
assert.deepEqual(notesInEditorRect(notes,{x:210,y:450},{x:230,y:470},metrics),['hold'],'crossing the middle of a hold selects it');
assert.deepEqual(notesInEditorRect(notes,{x:450,y:195},{x:470,y:202},metrics),['wide'],'wide flick endpoint can be selected outside the hold body');
assert.deepEqual(notesInEditorRect(notes,{x:210,y:250},{x:230,y:270},metrics),[]);
assert.deepEqual(notesInEditorRect(notes,{x:30,y:390},{x:300,y:820},metrics),['tap','hold']);
assert.deepEqual(notesInEditorRect(notes,{x:300,y:820},{x:30,y:390},metrics),['tap','hold'],'dragging in reverse selects the same notes');
console.log('Editor range selection tests passed');
