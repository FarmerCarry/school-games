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
async function completePutt(page,offset=0) {
  await putt(page);
  await page.locator('#hit').click();
  await page.evaluate(offset=>{
    const p=golfState.putt;
    // Reproducible putts using the original deceleration and cup rules.
    p.x=.12;p.v=Math.sqrt(2*1.6*(p.target-.12+offset));
    for(let i=0;i<200 && golfState.phase==='putt-roll';i++) golfTick(1/60);
  },offset);
  assert.equal(await page.evaluate(()=>golfState.phase),'outcome');
}
const savedProgress = page => page.evaluate(()=>JSON.parse(localStorage.getItem('sg:skybound-golf:progress')));
// Reaching the green saves the flight; only a sunk putt saves again, for its bonus.
const puttSaves = name => name==='cup' ? 2 : 1;
for(const [name,offset,expected] of [['short',-.3,'لم تصل'],['overshoot',.2,'تجاوزت'],['close',-.04,'قريبة جدًا'],['cup',0,'في الحفرة']]) {
  test(`Golf ${name} feedback holds, pauses, skips once and repeats without duplicate saves`,async t=>{
    const page=await game(t);await completePutt(page,offset);
    assert.match(await page.locator('#toast').textContent(),new RegExp(expected));
    assert.equal(await page.evaluate(()=>golfProbe.saves),puttSaves(name),'completed putt saves before its animation');
    const completed = await savedProgress(page);
    await page.locator('#pause').click();
    await page.evaluate(()=>golfRender());
    const frozen=await page.evaluate(()=>({hold:golfState.putt.hold,draws:golfProbe.draws}));
    await page.evaluate(()=>advanceGolfFrames(120));
    assert.deepEqual(await page.evaluate(()=>({hold:golfState.putt.hold,draws:golfProbe.draws})),frozen);
    await page.locator('#resume').click();
    await page.locator('#continue').focus();await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(()=>golfState.phase),'result');
    assert.equal(await page.evaluate(()=>golfProbe.saves),puttSaves(name));
    assert.match(await page.locator('#result-note').textContent(),new RegExp(name==='cup'?'تسديدة ممتازة':expected));
    assert.equal(await page.locator('#modal-heading').textContent(),name==='cup'?'في الحفرة!':'رقم قياسي جديد!');
    await page.evaluate(()=>advanceGolfFrames(120));
    assert.equal(await page.evaluate(()=>golfProbe.saves),puttSaves(name));
    assert.deepEqual(await savedProgress(page),completed,'showing the result never awards the shot twice');
    await page.locator('#again').click();
    assert.equal(await page.evaluate(()=>golfState.putt),null);
    await page.locator('#hit').click();await page.locator('#pause').click();await page.locator('#restart').click();
    assert.equal(await page.evaluate(()=>golfState.phase),'ready');
    assert.equal(await page.evaluate(()=>golfProbe.saves),puttSaves(name));
  });
}
for(const [name,offset,holes] of [['cup',0,1],['miss',-.3,0]]) {
  for(const exit of ['reload','menu','restart']) {
    test(`Golf completed ${name} survives ${exit} during its outcome animation`,async t=>{
      const page=await game(t);await completePutt(page,offset);
      const completed=await savedProgress(page);
      assert(completed && completed.coins>0,'earned coins are durable before the result screen');
      assert.equal(completed.shots,1);assert.equal(completed.holes,holes);
      assert.equal(completed.best,await page.evaluate(()=>Math.floor(golfState.ball.maxX)));
      if(exit!=='reload') {
        await page.locator('#pause').click();
        await page.locator('#'+exit).click();
        assert.equal(await page.evaluate(()=>golfState.phase),exit==='menu'?'title':'ready');
        assert.equal(await page.evaluate(()=>golfProbe.saves),holes?2:1);
        assert.deepEqual(await savedProgress(page),completed);
      }
      await page.reload();
      assert.deepEqual(await savedProgress(page),completed,'reloading preserves exactly one completed shot');
      assert.equal(await page.evaluate(()=>golfProbe.saves),0,'loading a saved outcome does not re-award it');
    });
  }
}
test('Golf saves a flight that reaches the green even if putting is abandoned',async t=>{
  const page=await game(t);await putt(page);
  const distance=await page.evaluate(()=>Math.floor(golfState.ball.maxX));
  assert.equal(await page.evaluate(()=>golfProbe.saves),1,'the finished flight is saved on arrival at the green');
  assert.match(await page.locator('#star-count').textContent(),/★ [1-9]/,'this flight collects a star');
  assert.equal(await page.locator('#star-count').isVisible(),false,'on the green the toast never covers the star count');
  await page.keyboard.press('Escape');await page.locator('#restart').click();
  assert.equal(await page.evaluate(()=>golfState.phase),'ready');
  const saved=await savedProgress(page);
  assert.equal(saved.best,distance);assert.equal(saved.shots,1);assert.equal(saved.holes,0);
  assert(saved.coins>0,'the flight reward is kept');
  assert.equal(await page.evaluate(()=>golfProbe.saves),1,'restarting never saves the shot again');
});
test('Golf reports a failed save and retries it from the warning',async t=>{
  const page=await game(t);
  await page.evaluate(()=>{
    const setItem=Storage.prototype.setItem;
    window.failSaves=true;
    Storage.prototype.setItem=function(k,v){ if(window.failSaves&&k.includes('skybound-golf')) throw new Error('full'); return setItem.call(this,k,v); };
  });
  await page.evaluate(()=>advanceGolfFrames(29));await page.locator('#hit').click();
  await page.evaluate(()=>{golfState.ball.stopped=true;golfState.ball.surface='grass';golfState.ball.maxX=90;for(let i=0;i<60;i++)golfTick(1/60);});
  assert.equal(await page.evaluate(()=>golfState.phase),'result');
  assert.equal(await page.locator('.sg-save-status').isVisible(),true,'a failed write is visible');
  assert.equal(await savedProgress(page),null);
  await page.evaluate(()=>{window.failSaves=false;});
  await page.locator('.sg-save-status button').click();
  assert.equal((await savedProgress(page)).best,90,'retry writes the kept progress');
  assert.equal(await page.locator('.sg-save-status button').isVisible(),false);
});
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
  assert.equal(await page.evaluate(()=>golfProbe.saves),2);
  // Classroom or system motion changes must reach the new renderer even
  // while the result modal has stopped normal frame updates.
  for (const reduced of [false, true]) {
    const motion = await page.evaluate(reduced => {
      const before = golfProbe.draws;
      Kit.motion.setPreference(reduced ? 'reduce' : 'full');
      golfRender();
      const changed = golfProbe.draws - before;
      golfRender();
      return { reduced: golfState.reducedMotion, changed, total: golfProbe.draws - before };
    }, reduced);
    assert.deepEqual(motion, { reduced, changed: 1, total: 1 }, 'motion changes repaint once and settle');
  }
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
    assert.equal(result.saves,1,'a finished flight saves once, whether or not it reaches a green');
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
    await page.locator('#pause').click();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
    for (const surface of ['main','scenery']) {
      const restored=await page.evaluate(surface=>{
        golfRender();
        const main=document.getElementById('game'),cache=golfProbe.canvases[0];
        const target=surface==='main'?main:cache,ctx=target.getContext('2d');
        const pixels=c=>{
          const context=c.getContext('2d');
          // A fractional DPR can leave the final backing pixel partly covered;
          // sample fully painted interior pixels, independent of edge blending.
          return [[2,2],[c.width-3,2],[2,c.height-3],[c.width-3,c.height-3]].flatMap(([x,y])=>Array.from(context.getImageData(x,y,1,1).data));
        };
        const state=()=>JSON.stringify({phase:golfState.phase,time:golfState.time,ball:golfState.ball,putt:golfState.putt,cam:golfState.cam,saves:golfProbe.saves});
        const before={pixels:pixels(target),main:pixels(main),transform:Array.from(ctx.getTransform().toFloat64Array()),state:state()};
        const draws=golfProbe.draws,cacheCtx=cache.getContext('2d'),fill=cacheCtx.fillRect;
        let fills=0;
        cacheCtx.fillRect=function(){fills++;return fill.apply(this,arguments);};
        // Context restoration loses both the bitmap and drawing state.
        target.width=target.width;
        target.dispatchEvent(new Event('contextrestored'));
        golfRender();
        const changed=golfProbe.draws-draws,rebuilt=fills;
        const after={pixels:pixels(target),main:pixels(main),transform:Array.from(ctx.getTransform().toFloat64Array()),state:state()};
        for(let i=0;i<60;i++)golfRender();
        cacheCtx.fillRect=fill;
        return {before,after,changed,total:golfProbe.draws-draws,rebuilt,fills,canvases:golfProbe.canvases.length};
      },surface);
      assert.deepEqual(restored.after.transform,restored.before.transform,`${surface} restores its logical drawing transform`);
      assert.equal(restored.after.state,restored.before.state,'recovery never advances play or rewards');
      for (const key of ['pixels','main']) {
        assert(restored.after[key].every((value,i)=>i%4===3?value===255:Math.abs(value-restored.before[key][i])<=1),
          `${surface} restores visible ${key} pixels within one color level of rasterization rounding`);
      }
      assert.equal(restored.changed,1,`${surface} recovery repaints the paused scene once`);
      assert.equal(restored.total,1,'recovery leaves the paused scene idle again');
      assert.equal(restored.rebuilt,surface==='scenery'?2:0,'only a lost scenery surface rebuilds its cached background');
      assert.equal(restored.fills,restored.rebuilt,'the scenery cache stays valid after recovery');
      assert.equal(restored.canvases,1,'recovery reuses the original bounded surface');
    }
    await page.locator('#resume').click();
  }
});
