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
    const files = ['index.html','teacher.html','css/site.css','css/teacher.css','js/catalog.js','js/site.js','js/teacher.js',
      'games/tic-tac-toe/index.html','games/air-hockey/game.js','shared/fonts/خط المدرسة.woff2'];
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
    fs.rmSync(path.join(source,'js','teacher.js'));
    assert.throws(() => copyClassroomSite(source,path.join(temp,'no-teacher-script')),/Distribution is missing js\/teacher.js/);
    fs.rmSync(path.join(source,'js','site.js'));
    assert.throws(() => copyClassroomSite(source,path.join(temp,'incomplete')),/Distribution is missing js\/site.js/);
  } finally { fs.rmSync(temp,{recursive:true,force:true}); }
});
