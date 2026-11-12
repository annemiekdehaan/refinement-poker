import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { act, createRoom, joinMember, viewFor, results, historyCsv, normalizeRoom, validRoom, newRoomCode } from '../model.mjs';
const identity = name => ({ id: randomUUID(), token: randomUUID(), name });
function fixture() { const host = identity('Host'), guest = identity('Guest'); const room = createRoom('ABC123DEF456', host); joinMember(room, guest); return { room, host, guest }; }
test('room codes are valid and user formatting is normalized', () => {
  assert.equal(normalizeRoom('abc123-def456'), 'ABC123DEF456');
  assert.equal(validRoom('short'), false);
  for (let i=0;i<100;i++) assert.equal(validRoom(newRoomCode()), true);
});
test('hidden ballots never include another participant vote or token', () => {
  const {room, host, guest} = fixture();
  act(room, host.id, {type:'vote',value:'8',round:1}); act(room, guest.id, {type:'vote',value:'3',round:1});
  const view = viewFor(room, guest.id);
  assert.equal(view.members[0].vote, null); assert.equal(view.members[0].hasVoted, true);
  assert.equal(view.members[1].vote, '3');
  assert.equal(JSON.stringify(view).includes(host.token), false);
  assert.equal(JSON.stringify(view).includes(guest.token), false);
  act(room, host.id, {type:'reveal',round:1});
  assert.deepEqual(viewFor(room, guest.id).members.map(m=>m.vote), ['8','3']);
});
test('only host controls stories, reveal, rounds, timers and saved estimates', () => {
  const {room, guest} = fixture();
  for (const action of [{type:'title',value:'fake'}, {type:'reveal'}, {type:'next'}, {type:'timer',seconds:60}, {type:'save',value:'5'}]) assert.equal(act(room,guest.id,{...action,round:1}),false);
  assert.equal(room.title, ''); assert.equal(room.round,1);
});
test('round changes clear votes; delayed old votes and invalid values are rejected', () => {
  const {room,host,guest}=fixture();
  assert.equal(act(room,guest.id,{type:'vote',value:'8',round:1}),true);
  act(room,host.id,{type:'next',round:1,clearTitle:true});
  for(const action of [{type:'vote',value:'8',round:1},{type:'vote',value:'100',round:2},{type:'vote',value:8,round:2},null]) assert.equal(act(room,guest.id,action),false);
  assert.equal(room.members[1].vote,null);
});
test('spectators cannot vote, mode changes clear ballots and reveal locks ballots', () => {
  const {room,host,guest}=fixture();
  act(room,guest.id,{type:'vote',value:'5',round:1});
  act(room,guest.id,{type:'spectator',value:true,round:1});
  assert.equal(room.members[1].vote,null);
  assert.equal(act(room,guest.id,{type:'vote',value:'5',round:1}),false);
  assert.equal(act(room,host.id,{type:'reveal',round:1}),false);
  act(room,host.id,{type:'vote',value:'3',round:1}); act(room,host.id,{type:'reveal',round:1});
  assert.equal(act(room,host.id,{type:'vote',value:'8',round:1}),false);
  assert.equal(act(room,guest.id,{type:'spectator',value:false,round:1}),false);
});
test('reconnect requires a secret, cannot impersonate host, and max 12 online', () => {
  const {room,host,guest}=fixture();
  assert.equal(joinMember(room,{...host}),false);
  assert.equal(joinMember(room,{...guest,token:randomUUID()}),false);
  room.members[1].online=false;
  assert.equal(joinMember(room,guest),true);
  assert.equal(room.members.length,2);
  for(let i=0;i<10;i++) assert.equal(joinMember(room,identity('Guest')),true);
  assert.equal(joinMember(room,identity('Overflow')),false);
  assert.equal(joinMember(room,{id:'x',token:'y',name:''}),false);
});
test('results exclude spectators, offline members, uncertain and coffee from mean', () => {
  const members=['½','3','?','☕'].map(v=>({online:true,spectator:false,vote:v}));
  members.push({online:false,vote:'21'},{online:true,spectator:true,vote:'13'});
  const summary=results(members);
  assert.equal(summary.average,1.75); assert.equal(summary.suggestion,null); assert.equal(summary.consensus,false);
  assert.equal(results([{online:true,vote:'5'},{online:true,vote:'5'}]).consensus,true);
  assert.equal(results([{online:true,vote:'?'}]).average,null);
});
test('timer uses authoritative time and rounds reset it', () => {
  const {room,host}=fixture();
  act(room,host.id,{type:'timer',seconds:120,round:1},1000);
  assert.equal(room.endsAt,121000);
  assert.equal(act(room,host.id,{type:'timer',seconds:999,round:1}),false);
  act(room,host.id,{type:'next',round:1}); assert.equal(room.endsAt,null);
});
test('history stores agreed value once, includes ballot record and resists CSV formula injection', () => {
  const {room,host}=fixture();
  assert.equal(act(room,host.id,{type:'save',value:'3',round:1}),false);
  act(room,host.id,{type:'title',value:'=HYPERLINK("bad")',round:1});
  act(room,host.id,{type:'vote',value:'5',round:1}); act(room,host.id,{type:'reveal',round:1});
  assert.equal(act(room,host.id,{type:'save',value:'3',round:1}),true);
  assert.equal(act(room,host.id,{type:'save',value:'8',round:1}),false);
  assert.equal(room.history[0].estimate,'3'); assert.equal(room.history[0].votes[0].vote,'5');
  assert.match(historyCsv(room.history), /'\=HYPERLINK/);
  assert.match(historyCsv(room.history), /""bad""/);
});
test('unknown, disconnected and malformed actions are rejected', () => {
  const {room,host,guest}=fixture(); room.members[1].online=false;
  assert.equal(act(room,guest.id,{type:'vote',value:'5',round:1}),false);
  assert.equal(act(room,randomUUID(),{type:'reveal',round:1}),false);
  assert.equal(act(room,host.id,{type:'title',value:'x'.repeat(4000),round:1}),false);
  assert.equal(act(room,host.id,{type:'unknown',round:1}),false);
});
