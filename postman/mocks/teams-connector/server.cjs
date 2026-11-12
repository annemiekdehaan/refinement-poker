const http=require('node:http');
const records=new Map();let serial=0,fail=false;
http.createServer(async(req,res)=>{
 let body='';if(!req.body)for await(const chunk of req)body+=chunk;let data={};try{data=req.body||(body?JSON.parse(body):{});}catch{res.writeHead(400).end();return;}
 res.setHeader('Content-Type','application/json');
 if(req.url==='/control'){fail=!!data.fail;res.end('{}');return;}
 if(req.url==='/records'){res.end(JSON.stringify([...records.values()]));return;}
 if(fail){res.writeHead(503).end(JSON.stringify({error:{code:'ServiceUnavailable'}}));return;}
 const m=/^\/v3\/conversations\/([^/]+)\/activities(?:\/([^/]+))?$/.exec(req.url);
 if(!m){res.writeHead(501).end('{}');return;}
 const conv=decodeURIComponent(m[1]);
 if(req.method==='POST'&&!m[2]){const id='activity-'+(++serial);records.set(conv+':'+id,{id,conversation:conv,body:data});res.writeHead(201).end(JSON.stringify({id}));return;}
 if(req.method==='PUT'&&m[2]){const id=decodeURIComponent(m[2]);if(!records.has(conv+':'+id)){res.writeHead(404).end('{}');return;}records.set(conv+':'+id,{id,conversation:conv,body:data});res.end(JSON.stringify({id}));return;}
 res.writeHead(501).end('{}');
}).listen(process.env.PORT);
