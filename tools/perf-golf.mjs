#!/usr/bin/env node
// Deterministic fixed-step golf rendering probe. Run sequentially on the same
// machine/root pair. JS submission time is not GPU frame time or HDD readiness.
// SG_ROOT=/path/to/build node tools/perf-golf.mjs /tmp/report.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { launchChromium } from './browser.mjs';
import { startTestServer } from './test-server.mjs';
import { installGolfHarness } from './golf-harness.mjs';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=process.env.SG_ROOT?path.resolve(repo,process.env.SG_ROOT):repo;
const server=await startTestServer(root,{cacheControl:'max-age=600'});
const browser=await launchChromium();
const output={root,browser:browser.version(),coldReady:[],warmReady:[],shots:[],errors:[]};
try {
  for(let run=0;run<7;run++) {
    const context=await browser.newContext({viewport:{width:1100,height:620}});
    await context.addInitScript(installGolfHarness,{manual:true});
    const page=await context.newPage();
    page.on('pageerror',e=>output.errors.push(e.message));
    await page.goto(server.origin+'/games/skybound-golf/');
    await page.waitForFunction(()=>window.golfProbe?.ready);
    output.coldReady.push(await page.evaluate(()=>golfProbe.ready));
    await page.reload();
    await page.waitForFunction(()=>window.golfProbe?.ready);
    output.warmReady.push(await page.evaluate(()=>golfProbe.ready));
    if(run===6) {
      await page.locator('#play').click();
      for(let world=0;world<4;world++) for(const level of [0,5,10]) for(const speed of [1,3]) {
        output.shots.push(await page.evaluate(({world,level,speed})=>{
          const P=GolfPhysics,s=golfState,u={power:level,bounce:level,glide:level};
          s.world=world;s.course=P.createCourse(world);s.ball=P.launch(s.course,u,1);s.phase='flight';s.putt=null;
          s.trail=[];s.particles=[];s.cam={x:-45,y:0,zoom:1};
          const times=[];let frames=0;
          while(!s.ball.stopped && frames<3400) {
            for(let n=0;n<speed;n++) P.step(s.course,s.ball,u,1/60);
            s.cam.zoom=Math.max(.32,Math.min(1,120/(110+Math.max(0,s.ball.y))));
            s.cam.x=Math.max(-45,s.ball.x-65/s.cam.zoom);s.cam.y=Math.max(0,s.ball.y-68/s.cam.zoom);
            s.time+=1/60;
            if(frames%60===0) {const start=performance.now();golfRender();times.push(performance.now()-start);} frames++;
          }
          times.sort((a,b)=>a-b);
          return {world,level,speed,frames,distance:s.ball.maxX,p95SubmitMs:times[Math.floor(times.length*.95)]};
        },{world,level,speed}));
        console.error(`world=${world} level=${level} speed=${speed}`);
      }
    }
    await context.close();
  }
  const files=['index.html','style.css','game.js','art.js','physics.js'].filter(f=>fs.existsSync(path.join(root,'games/skybound-golf',f)));
  output.payload=Object.fromEntries(files.map(f=>{const b=fs.readFileSync(path.join(root,'games/skybound-golf',f));return [f,{bytes:b.length,gzip:gzipSync(b).length,brotli:brotliCompressSync(b).length}];}));
  console.log(JSON.stringify(output,null,2));
  if(process.argv[2]) fs.writeFileSync(process.argv[2],JSON.stringify(output,null,2));
  if(output.errors.length) process.exitCode=1;
} finally {await browser.close();await server.close();}
