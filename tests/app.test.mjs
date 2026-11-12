import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { JSDOM } from 'jsdom';
import * as model from '../model.mjs';
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const source = (await readFile(new URL('../app.mjs', import.meta.url), 'utf8')).replace(/^import[^\n]+\n/, '');
const tick = () => new Promise(resolve=>setTimeout(resolve,5));
async function settle(){for(let i=0;i<8;i++)await tick();}
function network() {
  const peers = new Map(), packets = [];
  class Connection extends EventEmitter {
    open=false;
    send(data){ if(!this.open)return; const copy=JSON.parse(JSON.stringify(data)); packets.push({from:this.owner.id,to:this.other.owner.id,data:copy});queueMicrotask(()=>{if(this.other.open)this.other.emit('data',copy);}); }
    close(){if(!this.open)return;this.open=false;this.other.open=false;queueMicrotask(()=>{this.emit('close');this.other.emit('close');});}
  }
  class Peer extends EventEmitter {
    destroyed=false;disconnected=false;links=[];
    constructor(id){super();this.id=typeof id==='string'?id:randomUUID();queueMicrotask(()=>{if(peers.has(this.id)){this.emit('error',{type:'unavailable-id'});return;}peers.set(this.id,this);this.emit('open',this.id);});}
    connect(id){const local=new Connection();local.owner=this;this.links.push(local);queueMicrotask(()=>{const target=peers.get(id);if(!target){this.emit('error',{type:'peer-unavailable'});return;}const remote=new Connection();remote.owner=target;local.other=remote;remote.other=local;target.links.push(remote);target.emit('connection',remote);queueMicrotask(()=>{local.open=remote.open=true;remote.emit('open');local.emit('open');});});return local;}
    destroy(){this.destroyed=true;if(peers.get(this.id)===this)peers.delete(this.id);this.links.forEach(c=>c.close());}
    reconnect(){this.disconnected=false;this.emit('open',this.id);}
  }
  return {Peer,peers,packets};
}
function page(net, fragment='') {
  const dom = new JSDOM(html,{url:'https://example.test/'+fragment,runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;Object.assign(w,model);w.Peer=net.Peer;w.scrollTo=()=>{};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const $=id=>w.document.getElementById(id);
  w.eval(source);
  return {dom,w,$,submit(id){$(id).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));},click(id){$(id).click();},vote(value){w.document.querySelector(`[data-vote="${value}"]`).click();},close(){w.close();}};
}
async function hostPage(net,name='Annemiek') {const p=page(net);p.$('name').value=name;p.submit('entry-form');await settle();return p;}
async function guestPage(net,host,name='Collega'){const p=page(net,host.w.location.hash);p.$('name').value=name;p.submit('entry-form');await settle();return p;}

test('real app handlers: two independent DOM clients vote, hide, reveal, save, reset and reject guest controls', async t=>{
  const net=network(),h=await hostPage(net),g=await guestPage(net,h,'<img src=x onerror=alert(1)>');t.after(()=>{h.close();g.close();});
  assert.equal(h.$('room').hidden,false);assert.equal(g.$('room').hidden,false);assert.equal(h.$('member-count').textContent,'2');
  assert.equal(h.w.document.querySelectorAll('#member-list img').length,0);
  h.$('story-title').value='FEE-42 — Een duidelijkere flow';h.submit('story-form');await settle();
  assert.equal(g.$('story-display').textContent,'FEE-42 — Een duidelijkere flow');
  h.vote('8');g.vote('3');await settle();
  assert.match(h.$('vote-progress').textContent,/2 of 2/);
  assert.equal(h.w.document.querySelector('[data-vote="8"]').getAttribute('aria-pressed'),'true');
  assert.equal(g.$('participant-cards').textContent.includes('8'),false);
  const stateToGuest=net.packets.filter(p=>p.data.type==='state'&&p.to!==p.from).at(-1).data.view;
  assert.equal(stateToGuest.members[0].vote,null);
  assert.equal(stateToGuest.members.some(m=>'token'in m),false);
  const guestPeer=[...net.peers.values()].find(p=>!p.id.startsWith('rp-v1-'));
  guestPeer.links[0].send({type:'action',action:{type:'reveal',round:1}});await settle();
  assert.equal(h.$('results').hidden,true);
  h.click('reveal');await settle();assert.equal(g.$('results').hidden,false);
  assert.match(g.$('participant-cards').textContent,/8/);assert.match(g.$('participant-cards').textContent,/3/);
  assert.match(h.$('result-summary').textContent,/5\.5/);
  h.$('final-estimate').value='5';h.submit('save-result');await settle();assert.match(g.$('history').textContent,/FEE-42/);
  h.click('next-round');await settle();assert.match(g.$('timer').textContent,/2:00|1:59/);assert.equal(g.$('results').hidden,true);assert.match(h.$('vote-progress').textContent,/0 of 2/);
  guestPeer.links[0].send({type:'action',action:{type:'vote',round:1,value:'21'}});await settle();assert.match(h.$('vote-progress').textContent,/0 of 2/);
});

test('spectator status, vote withdrawal, timer and reconnect keep UI and session consistent', async t=>{
  const net=network(),h=await hostPage(net),g=await guestPage(net,h);t.after(()=>{h.close();g.close();});
  g.vote('5');await settle();g.vote('5');await settle();assert.match(h.$('vote-progress').textContent,/0 of 2/);
  g.$('spectator').checked=true;g.$('spectator').dispatchEvent(new g.w.Event('change'));await settle();
  assert.match(h.$('vote-progress').textContent,/0 of 1/);assert.equal(g.w.document.querySelector('[data-vote="5"]').disabled,true);
  assert.match(g.$('timer').textContent,/2:00|1:59/); h.click('timer-start');await settle();assert.match(g.$('timer').textContent,/No timer/);
  const guestPeer=[...net.peers.values()].find(p=>!p.id.startsWith('rp-v1-'));guestPeer.links[0].close();await settle();
  assert.equal(h.$('member-count').textContent,'1');assert.match(g.$('network-status').textContent,/Disconnected/);
  g.$('guest-wait').querySelector('button').click();await settle();
  assert.equal(h.$('member-count').textContent,'2');assert.equal(g.$('network-status').textContent,'Connected');
});

test('missing rooms and malformed codes show useful errors and re-enable entry controls', async t=>{
  const net=network(),p=page(net);t.after(()=>p.close());p.$('name').value='Collega';p.click('join-tab');p.$('room-code').value='bad';p.submit('entry-form');
  assert.match(p.$('connection-message').textContent,/12-character/);
  p.$('room-code').value='123456-ABCDEF';p.submit('entry-form');await settle();
  assert.match(p.$('connection-message').textContent,/not active/);assert.equal(p.$('join-room').disabled,false);assert.equal(p.$('room').hidden,true);
});

test('signaling reconnect does not reset a running round', async t=>{
  const net=network(),h=await hostPage(net),g=await guestPage(net,h);t.after(()=>{h.close();g.close();});
  h.vote('8');await settle();
  const hostPeer=[...net.peers.values()].find(p=>p.id.startsWith('rp-v1-'));
  hostPeer.disconnected=true;hostPeer.emit('disconnected');await settle();
  assert.equal(h.$('member-count').textContent,'2');assert.match(h.$('vote-progress').textContent,/1 of 2/);
  assert.equal(h.w.document.querySelector('[data-vote="8"]').getAttribute('aria-pressed'),'true');
});

test('Teams configured room automatically elects one host for simultaneous starters', async t=>{
  const net=network(),a=page(net,'#room=ABCDEF123456&auto=1'),b=page(net,'#room=ABCDEF123456&auto=1');t.after(()=>{a.close();b.close();});
  a.$('name').value='A';b.$('name').value='B';a.submit('entry-form');b.submit('entry-form');await settle();
  assert.equal(a.$('room').hidden,false);assert.equal(b.$('room').hidden,false);
  assert.equal(a.$('member-count').textContent,'2');assert.equal(b.$('member-count').textContent,'2');
  assert.equal([...net.peers.keys()].filter(id=>id.startsWith('rp-v1-')).length,1);
});

test('host leaving disconnects guests and clears recoverable session', async t=>{
  const net=network(),h=await hostPage(net),g=await guestPage(net,h);t.after(()=>{h.close();g.close();});
  h.click('leave-room');assert.equal(h.$('leave-dialog').open,true);h.click('leave-confirm');await settle();
  assert.equal(h.$('room').hidden,true);assert.equal(h.w.sessionStorage.getItem('rp-host'),null);
  assert.match(g.$('network-status').textContent,/Disconnected/);assert.equal(g.w.document.querySelector('[data-vote="5"]').disabled,true);
});

test('Teams configuration sets a shared room and requires nonempty tab name', async t=>{
  const configHtml=await readFile(new URL('../config.html',import.meta.url),'utf8');
  const configSource=(await readFile(new URL('../config.mjs',import.meta.url),'utf8')).replace(/^import[^\n]+\n/,'');
  const dom=new JSDOM(configHtml,{url:'https://example.test/config.html',runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());
  Object.assign(w,model);Object.defineProperty(w,'parent',{value:{}});
  let saveHandler,configData,valid;
  w.microsoftTeams={app:{initialize:async()=>{},notifySuccess(){}},pages:{config:{setValidityState(v){valid=v;},registerOnSaveHandler(cb){saveHandler=cb;},async setConfig(data){configData=data;}}}};
  w.eval(configSource);await settle();assert.equal(valid,true);
  const field=w.document.getElementById('tab-name');field.value='';field.dispatchEvent(new w.Event('input'));assert.equal(valid,false);
  field.value='Onze refinement';field.dispatchEvent(new w.Event('input'));let saved=false;
  await saveHandler({notifySuccess(){saved=true;},notifyFailure(){throw Error('failed');}});
  assert.equal(saved,true);assert.equal(configData.suggestedDisplayName,'Onze refinement');
  assert.match(configData.contentUrl,/#room=[A-F0-9]{12}&auto=1$/);assert.equal(configData.contentUrl,configData.websiteUrl);
});

 test('facilitator can restart voting with a fresh timer while preserving the topic', async t=>{
 const net=network(),h=await hostPage(net),g=await guestPage(net,h);t.after(()=>{h.close();g.close();});
 h.$('story-title').value='Keep this story';h.submit('story-form');h.vote('5');await settle();
 assert.match(h.$('timer').textContent,/2:00|1:59/);assert.match(h.$('next-round').textContent,/Restart round/);assert.equal(g.$('next-round').hidden,true);
 h.click('next-round');await settle();assert.match(g.$('vote-progress').textContent,/0 of 2/);assert.equal(g.$('story-display').textContent,'Keep this story');assert.match(g.$('timer').textContent,/2:00|1:59/);
 });
