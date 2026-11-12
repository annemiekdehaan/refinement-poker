import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../store.mjs';
import { PokerEngine, commandTitle } from '../engine.mjs';
import { cardFor } from '../cards.mjs';
import { createBot } from '../app.mjs';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tenant='11111111-1111-4111-8111-111111111111';
const activity=(more={})=>({type:'message',id:randomUUID(),channelId:'msteams',serviceUrl:'https://smba.trafficmanager.net/emea/',conversation:{id:'channel;messageid=thread'},channelData:{tenant:{id:tenant}},from:{id:'host',name:'Annemiek'},text:'/poker FEE-42',...more});
function fixture(store=new Store(':memory:')){let now=100000;const sent=[];let fail=false;const connector={async create(s,b){if(fail)throw Error('503');sent.push(structuredClone(b));return {id:'public-card'};},async update(s,b){if(fail)throw Error('503');sent.push(structuredClone(b));}};const engine=new PokerEngine({store,connector,tenantId:tenant,now:()=>now});return {engine,store,sent,setNow:n=>now=n,setFail:v=>fail=v};}
function click(s,action,value,actor='host',extra={}){return activity({type:'invoke',name:'adaptiveCard/action',replyToId:s.messageId,from:{id:actor,name:actor},value:{action:{verb:'poker',data:{sessionId:s.id,round:s.round,action,value,...extra}}}});}
test('parses slash, mention and title without treating ordinary chat as a command',()=>{assert.equal(commandTitle('/poker FEE-42'),'FEE-42');assert.equal(commandTitle('<at>Poker</at> poker my story'),'my story');assert.equal(commandTitle('hello poker'),null);});
test('start publishes a public card, hidden votes remain private, and host reveals results',async t=>{
 const f=fixture();t.after(()=>f.store.close());const s=await f.engine.message(activity());
 assert.equal(f.sent[0].recipient,undefined);assert.equal(s.endsAt,220000);assert.equal(s.owner,'host');
 assert.equal(f.sent[0].attachments[0].content.body.filter(x=>x.type==='ActionSet')[0].actions[0].data.action,'vote');
 const ack=await f.engine.action(click(s,'vote','8','guest'));assert.match(ack.value,/Your vote 8/);
 assert.equal(f.store.get(s.id).votes.guest.value,'8');assert.ok(!JSON.stringify(f.sent.at(-1)).includes('"name":"guest"'));
 const blocked=await f.engine.action(click(s,'reveal',null,'guest'));assert.match(blocked.value,/Only the person/);assert.equal(f.store.get(s.id).phase,'voting');
 await f.engine.action(click(s,'reveal'));const latest=f.store.get(s.id);assert.equal(latest.phase,'revealed');assert.match(JSON.stringify(cardFor(latest)),/guest/);assert.equal(latest.history.length,1);
});
test('vote changes, expiry, stale cards and cross-conversation attacks',async t=>{
 const f=fixture();t.after(()=>f.store.close());const s=await f.engine.message(activity());
 await f.engine.action(click(s,'vote','3','g'));await f.engine.action(click(s,'vote','5','g'));assert.equal(Object.keys(f.store.get(s.id).votes).length,1);
 const forged=click(s,'vote','21','attacker');forged.conversation.id='other';await f.engine.action(forged);assert.equal(f.store.get(s.id).votes.attacker,undefined);
 f.setNow(s.endsAt);await f.engine.tick();assert.equal(f.store.get(s.id).phase,'revealed');
 await f.engine.action(click(s,'next',null,'host',{nextTitle:'Next story'}));const next=f.store.get(s.id);assert.equal(next.round,2);assert.equal(next.title,'Next story');assert.equal(next.endsAt,s.endsAt+120000);assert.deepEqual(next.votes,{});
 await f.engine.action(click(s,'vote','21','g'));assert.deepEqual(f.store.get(s.id).votes,{});
});
test('duplicate command delivery never posts another card and bad tenants are rejected',async t=>{
 const f=fixture();t.after(()=>f.store.close());const a=activity();await Promise.all([f.engine.message(a),f.engine.message(a)]);assert.equal(f.sent.length,1);
 const bad=activity();bad.channelData.tenant.id='wrong';await assert.rejects(f.engine.message(bad),/Wrong tenant/);
});
test('outbound failure preserves state and retries idempotent updates without duplicating posts',async t=>{
 const f=fixture();t.after(()=>f.store.close());const s=await f.engine.message(activity());f.setFail(true);await assert.rejects(f.engine.action(click(s,'vote','13','g')));assert.equal(f.store.get(s.id).dirty,true);assert.equal(f.store.get(s.id).votes.g.value,'13');
 f.setFail(false);await f.engine.tick();assert.equal(f.store.get(s.id).dirty,false);assert.equal(f.sent.length,2);
});
test('pending deadlines and hidden votes survive process restart on disk',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'poker-test-'));try{const file=join(dir,'state.sqlite');const first=fixture(new Store(file));const s=await first.engine.message(activity());await first.engine.action(click(s,'vote','5','g'));first.store.close();const second=fixture(new Store(file));second.setNow(s.endsAt+1);await second.engine.tick();assert.equal(second.store.get(s.id).phase,'revealed');assert.equal(second.store.get(s.id).votes.g.value,'5');second.store.close();}finally{await rm(dir,{recursive:true,force:true});}
});
test('production startup requires registration and HTTP endpoint rejects unauthenticated activity',async t=>{
 await assert.rejects(createBot(),/registration is required/);
 const bot=await createBot({clientId:randomUUID(),tenantId:tenant,clientSecret:'test-only-not-a-real-secret',dbPath:':memory:'});
 const server=bot.http.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(async()=>{await new Promise(resolve=>server.close(resolve));await bot.close();});
 const base=`http://127.0.0.1:${server.address().port}`;
 assert.equal((await fetch(base+'/health')).status,200);
 assert.equal((await fetch(base+'/api/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(activity())})).status,401);
 assert.equal((await fetch(base+'/api/messages',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer forged'},body:JSON.stringify(activity({channelData:{tenant:{id:'wrong'}}}))})).status,403);
 assert.equal((await fetch(base+'/api/messages',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer forged'},body:JSON.stringify(activity())})).status,401);
});
