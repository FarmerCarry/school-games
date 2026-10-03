import assert from 'node:assert/strict';
import { before,after,test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';
import { installGolfHarness } from '../golf-harness.mjs';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
let browser,server;
before(async()=>{server=await startTestServer(process.env.SG_ROOT?path.resolve(repo,process.env.SG_ROOT):repo);browser=await launchChromium();});
after(async()=>{await browser?.close();await server?.close();});
async function game(t,reducedMotion='no-preference',deviceScaleFactor=1) {
  const context=await browser.newContext({viewport:{width:995,height:560},reducedMotion,deviceScaleFactor});
  await context.addInitScript(installGolfHarness,{manual:true});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  t.after(async()=>{await context.close();assert.deepEqual(errors,[]);});
  await page.goto(server.origin+'/games/skybound-golf/');
  await page.locator('#play').click();
  return page;
}
async function putt(page) {
  await page.evaluate(()=>advanceGolfFrames(29));
  await page.locator('#hit').click();
  await page.evaluate(()=>{
    // Run the real first shot, including landing and camera settle.
    for(let i=0;i<3400 && golfState.phase==='flight';i++) golfTick(1/60);
  });
  assert.equal(await page.evaluate(()=>golfState.phase),'putting');
}
for(const [name,offset,expected] of [['short',-.3,'لم تصل'],['overshoot',.2,'تجاوزت'],['close',-.04,'قريبة جدًا'],['cup',0,'في الحفرة']]) {
  test(`Golf ${name} feedback holds, pauses, skips once and repeats without duplicate saves`,async t=>{
    const page=await game(t);await putt(page);
    await page.locator('#hit').click();
    await page.evaluate(offset=>{
      const p=golfState.putt;
      // Reproducible putts using the original deceleration and cup rules.
      p.x=.12;p.v=Math.sqrt(2*1.6*(p.target-.12+offset));
      for(let i=0;i<200 && golfState.phase==='putt-roll';i++) golfTick(1/60);
    },offset);
    assert.equal(await page.evaluate(()=>golfState.phase),'outcome');
    assert.match(await page.locator('#toast').textContent(),new RegExp(expected));
    assert.equal(await page.evaluate(()=>golfProbe.saves),0,'hold does not save');
    await page.locator('#pause').click();
    await page.evaluate(()=>golfRender());
    const frozen=await page.evaluate(()=>({hold:golfState.putt.hold,draws:golfProbe.draws}));
    await page.evaluate(()=>advanceGolfFrames(120));
    assert.deepEqual(await page.evaluate(()=>({hold:golfState.putt.hold,draws:golfProbe.draws})),frozen);
    await page.locator('#resume').click();
    await page.locator('#continue').focus();await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(()=>golfState.phase),'result');
    assert.equal(await page.evaluate(()=>golfProbe.saves),1);
    await page.evaluate(()=>advanceGolfFrames(120));
    assert.equal(await page.evaluate(()=>golfProbe.saves),1);
    await page.locator('#again').click();
    assert.equal(await page.evaluate(()=>golfState.putt),null);
    await page.locator('#hit').click();await page.locator('#pause').click();await page.locator('#restart').click();
    assert.equal(await page.evaluate(()=>golfState.phase),'ready');
    assert.equal(await page.evaluate(()=>golfProbe.saves),1);
  });
}
test('Golf needle aligns with original LTR target and reduced motion still completes a cup',async t=>{
  const page=await game(t,'reduce');
  await page.evaluate(()=>advanceGolfFrames(29));
  const alignment=await page.evaluate(()=>{
    const needle=document.querySelector('#needle').getBoundingClientRect(),zone=document.querySelector('#sweet-zone').getBoundingClientRect();
    return {delta:Math.abs(needle.x+needle.width/2-zone.x-zone.width/2),direction:getComputedStyle(document.querySelector('#meter-track')).direction};
  });
  assert(alignment.delta<3);assert.equal(alignment.direction,'ltr');
  await page.locator('#hit').click();await page.locator('#flight-hint').click();
  await page.evaluate(()=>{for(let i=0;i<1200 && golfState.phase==='flight';i++) golfTick(1/60);});
  assert.equal(await page.evaluate(()=>golfState.phase),'putting');
  await page.locator('#hit').click();
  await page.evaluate(()=>{const p=golfState.putt;p.v=p.targetPower*1.8;for(let i=0;i<250;i++) golfTick(1/60);});
  assert.equal(await page.evaluate(()=>golfState.phase),'result');
  assert.equal(await page.evaluate(()=>golfState.putt.sunk),true);
  assert.equal(await page.evaluate(()=>golfProbe.saves),1);
});

test('Golf real UI shots across worlds/upgrades preserve 60Hz results at normal and triple speed',async t=>{
  const page=await game(t);
  for(let world=0;world<4;world++) for(const level of [0,5,10]) for(const speed of [1,3]) {
    await page.evaluate(({world,level})=>localStorage.setItem('sg:skybound-golf:progress',JSON.stringify({world,best:2000,coins:0,shots:0,holes:0,upgrades:{power:level,bounce:level,glide:level}})),{world,level});
    await page.reload();await page.locator('#play').click();
    await page.evaluate(()=>advanceGolfFrames(29));await page.locator('#hit').click();
    if(speed===3) await page.locator('#flight-hint').click();
    const result=await page.evaluate(({world,level})=>{
      const u={power:level,bounce:level,glide:level},P=GolfPhysics,c=P.createCourse(world),b=P.launch(c,u,1);
      while(!b.stopped) P.step(c,b,u,1/60);
      for(let i=0;i<3500&&golfState.phase==='flight';i++) golfTick(1/60);
      golfRender();
      return {actual:golfState.ball.maxX,expected:b.maxX,r:golfState.ball.r,phase:golfState.phase,saves:golfProbe.saves};
    },{world,level});
    assert.equal(result.actual,result.expected,`world ${world}, level ${level}, speed ${speed}`);
    assert.equal(result.r,.7,'visual ball sizing must not change collision radius');
    assert(['putting','result'].includes(result.phase));
    assert.equal(result.saves,result.phase==='result'?1:0);
  }
});


test('Golf keeps one small scenery surface across worlds and high-DPR resizes',async t=>{
  const page=await game(t,'no-preference',2);
  for (const viewport of [{width:995,height:560},{width:1920,height:1080},{width:1100,height:620}]) {
    await page.setViewportSize(viewport);
    const caches=await page.evaluate(()=>{
      for(let i=0;i<16;i++) {
        golfState.world=i%4;golfState.course=GolfPhysics.createCourse(i%4);
        advanceGolfFrames(1);
      }
      return golfProbe.canvases.map(c=>({bytes:c.width*c.height*4,attached:c.isConnected}));
    });
    assert.equal(caches.length,1,'reuse the same surface instead of accumulating world/DPR variants');
    assert(caches[0].bytes<=1024*1024,'distant scenery stays under a 1MiB backing-store budget');
    assert.equal(caches[0].attached,false);
  }
});
