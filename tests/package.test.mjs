import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import Ajv from 'ajv-draft-04';
import {PNG} from 'pngjs';
const root=resolve(import.meta.dirname,'..');
test('Teams manifest matches official Microsoft 1.19 schema',async()=>{
 const schema=JSON.parse(await readFile(resolve(root,'tests/teams-schema.json'),'utf8'));
 const manifest=JSON.parse(await readFile(resolve(root,'teams/manifest.json'),'utf8'));
 const ajv=new Ajv({strict:false,validateFormats:false,allErrors:true});const validate=ajv.compile(schema);
 assert.equal(validate(manifest),true,JSON.stringify(validate.errors));
 for(const url of [manifest.developer.privacyUrl,manifest.developer.termsOfUseUrl,manifest.configurableTabs[0].configurationUrl,manifest.staticTabs[0].contentUrl])assert.ok(url.startsWith('https://annemiekdehaan.github.io/refinement-poker/'));
 assert.equal(manifest.devicePermissions,undefined);assert.equal(manifest.webApplicationInfo,undefined);
});
test('Teams icon dimensions and outline alpha follow packaging requirements',async()=>{
 const color=PNG.sync.read(await readFile(resolve(root,'teams/color.png'))),outline=PNG.sync.read(await readFile(resolve(root,'teams/outline.png')));
 assert.equal(color.width,192);assert.equal(color.height,192);assert.equal(outline.width,32);assert.equal(outline.height,32);
 let opaque=0,transparent=0;
 for(let i=0;i<outline.data.length;i+=4){if(outline.data[i+3]>0){opaque++;assert.deepEqual([...outline.data.slice(i,i+3)],[255,255,255]);}else transparent++;}
 assert.ok(opaque>30&&transparent>100);
});
test('every relative stylesheet, module, script and image URL is packaged',async()=>{
 for(const filename of ['index.html','config.html','privacy.html']){
  const html=await readFile(resolve(root,'dist',filename),'utf8');
  for(const match of html.matchAll(/(?:src|href)="([^"]+)"/g)){
   const url=match[1];if(url.startsWith('http')||url.startsWith('#')||url==='./')continue;
   await access(resolve(root,'dist',url));
  }
 }
 const app=await readFile(resolve(root,'dist/app.mjs'),'utf8');assert.ok(app.includes("from './model.mjs'"));
 for(const file of ['peerjs.min.js','teams.min.js']){const script=await readFile(resolve(root,'dist/vendor',file),'utf8');assert.ok(script.length>10000);assert.ok(!script.includes('sourceMappingURL='));}
 const styles=await readFile(resolve(root,'dist/style.css'),'utf8');assert.ok(!styles.includes('@import'));
});
