import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import Ajv from '../../node_modules/ajv-draft-04/dist/index.js';
import {combinedManifest} from '../package-teams.mjs';
test('one combined manifest retains both tabs and declares slash poker against Microsoft schema',async()=>{
 const manifest=await combinedManifest('12345678-1234-4234-8234-123456789abc');const schema=JSON.parse(await readFile(new URL('../teams-schema-1.29.json',import.meta.url),'utf8'));
 const validator=new Ajv({strict:false,validateFormats:false,allErrors:true}).compile(schema);
 assert.equal(validator(manifest),true,JSON.stringify(validator.errors));assert.ok(manifest.configurableTabs.length);assert.ok(manifest.staticTabs.length);assert.equal(manifest.bots[0].commandLists[0].commands[0].title,'poker');assert.ok(manifest.bots[0].commandLists[0].triggers.includes('slash'));
 await assert.rejects(combinedManifest(''),/registration/);
});
