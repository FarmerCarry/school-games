import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {copyClassroomSite} from '../classroom-files.mjs';

test('classroom download preserves nested files under Arabic and spaced paths', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(),'classroom-copy-test-'));
  try {
    const source = path.join(temp,'source games');
    const destination = path.join(temp,'ألعاب المدرسة','Downloaded games with spaces');
    const files = ['index.html','css/site.css','js/catalog.js','js/site.js','games/tic-tac-toe/index.html',
      'games/air-hockey/game.js','shared/fonts/خط المدرسة.woff2'];
    for (const file of files) {
      const name = path.join(source,file);fs.mkdirSync(path.dirname(name),{recursive:true});
      fs.writeFileSync(name,Buffer.from(`fixture:${file}:\u0000\u00ff`));
    }
    fs.mkdirSync(path.join(source,'node_modules'),{recursive:true});
    fs.writeFileSync(path.join(source,'node_modules','excluded.js'),'development only');
    const inventory = copyClassroomSite(source,destination);
    assert.deepEqual(inventory.map(item => item.path).sort(),files.sort());
    for(const file of files) {
      const copied = path.join(destination,file);
      assert.deepEqual(fs.readFileSync(fileURLToPath(pathToFileURL(copied))),fs.readFileSync(path.join(source,file)));
    }
    assert.equal(fs.existsSync(path.join(destination,'node_modules')),false);
    fs.rmSync(path.join(source,'js','site.js'));
    assert.throws(() => copyClassroomSite(source,path.join(temp,'incomplete')),/Distribution is missing js\/site.js/);
  } finally { fs.rmSync(temp,{recursive:true,force:true}); }
});


test('classroom fast build accepts inlined portal scripts and styles', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(),'classroom-built-test-'));
  try {
    const source = path.join(temp,'_site'), destination = path.join(temp,'ألعاب','Built games');
    fs.mkdirSync(path.join(source,'games','tic-tac-toe'),{recursive:true});
    fs.writeFileSync(path.join(source,'index.html'),'<style>body{color:black}</style><script>window.GAMES=[]</script>');
    fs.writeFileSync(path.join(source,'games','tic-tac-toe','index.html'),'<script>window.Kit={}</script>');
    const inventory = copyClassroomSite(source,destination,{mode:'build'});
    assert.deepEqual(inventory.map(item => item.path).sort(),['games/tic-tac-toe/index.html','index.html']);
    assert.throws(() => copyClassroomSite(source,path.join(temp,'source-mode')),/Distribution is missing css\/site.css/);
  } finally { fs.rmSync(temp,{recursive:true,force:true}); }
});
