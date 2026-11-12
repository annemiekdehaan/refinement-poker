import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import { Client } from '@microsoft/teams.api';
import { PokerEngine } from '../engine.mjs';
import { Store } from '../store.mjs';
const base=process.env.TEAMS_SIM_URL;
if (!base || !/^http:\/\/(?:127\.0\.0\.1|localhost):\d+\/teams$/.test(base)) throw new Error('Run the local Postman simulation and set TEAMS_SIM_URL to its /teams route. This test never sends to real Teams.');
const api=new Client(base), store=new Store(':memory:');let now=100000;
const engine=new PokerEngine({store,tenantId:'test-tenant',now:()=>now,connector:{create:(s,m)=>api.conversations.activities(s.conversation).create(m),update:(s,m)=>api.conversations.activities(s.conversation).update(s.messageId,m)}});
const activity={type:'message',id:'command-1',text:'/poker Checkout flow',channelId:'msteams',serviceUrl:base,conversation:{id:'test-channel-'+randomUUID()+';messageid=thread'},from:{id:'host',name:'Facilitator'},channelData:{tenant:{id:'test-tenant'}}};
try {
 const session=await engine.message(activity);assert.ok(session.messageId);
 const vote={...activity,type:'invoke',id:'vote-1',replyToId:session.messageId,from:{id:'voter',name:'Test voter'},value:{action:{data:{sessionId:session.id,round:1,action:'vote',value:'8'}}}};
 await engine.action(vote);
 const get=async()=>{const r=await fetch(base+'/records');assert.equal(r.status,200);return (await r.json()).filter(x=>x.conversation===activity.conversation.id);};
 let records=await get();assert.equal(records.length,1);assert.ok(!JSON.stringify(records[0].body).includes('Test voter'));
 await fetch(base+'/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fail:true})});
 vote.id='vote-2';vote.value.action.data.value='5';await assert.rejects(engine.action(vote));assert.equal(store.get(session.id).dirty,true);assert.equal(store.get(session.id).votes.voter.value,'5');
 await fetch(base+'/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fail:false})});await engine.tick();assert.equal(store.get(session.id).dirty,false);
 now=session.endsAt+1;await engine.tick();records=await get();assert.equal(records.length,1);assert.match(JSON.stringify(records[0].body),/Test voter/);assert.equal(store.get(session.id).phase,'revealed');
 const next={...vote,id:'next-1',from:activity.from,value:{action:{data:{sessionId:session.id,round:1,action:'next',nextTitle:'Second story'}}}};await engine.action(next);records=await get();assert.equal(records.length,2);assert.match(JSON.stringify(records[0].body),/Test voter/);assert.match(JSON.stringify(records[1].body),/Second story/);
 console.log('PASS: real Teams SDK HTTP POST/PUT, shared card creation, hidden vote, 503 persistence/recovery and deadline reveal against local Postman simulation. One card per round, retained results and no duplicate posts.');
} finally {store.close();}
