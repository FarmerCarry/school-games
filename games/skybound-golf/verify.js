'use strict';
const assert=require('node:assert/strict'),P=require('./physics.js');
const half=(lv,m)=>Math.min(m,Math.round(lv/2));
const all=lv=>({power:lv,bounce:Math.min(10,lv),rockets:half(lv,5),magnet:half(lv,5),thrust:half(lv,5),aim:Math.min(4,Math.round(lv/3)),skip:Math.min(4,Math.round(lv/3)),treasure:half(lv,5)});

function shot(w=0,up={},pwr=1,bot='idle',diff='normal'){
const c=P.createCourse(w,diff),b=P.launch(c,up,pwr),ev=[];
let f=0,rise=b.vy>0;
while(!b.done&&f++<4200){
if(bot!=='idle'&&b.mode==='air'&&b.vy<0&&!b.armed){
const p=P.predictImpact(c,b,c.diff.armWindow);
if(p&&p.t<0.12)assert.equal(P.press(c,b,up).type,'arm');
}
if(bot==='rockets'&&b.mode==='air'&&b.vy>0&&b.rocketsLeft>0&&f % 9===0)assert.equal(P.press(c,b,up).type,'rocket');
if(bot==='skill'&&b.mode==='air'&&rise&&b.vy<=0&&b.rocketsLeft>0)P.press(c,b,up);
rise=b.vy>0;
ev.push(...P.step(c,b,up,1/60));
assert(Number.isFinite(b.x)&&Number.isFinite(b.y));
if(!b.done)assert(b.y>=P.heightAt(c,b.x)+b.r - 1e-6);
for(const o of P.features(c,b.x - 6,b.x+6).props)assert(Math.hypot(b.x - o.x,b.y - o.ground - o.lift)>=o.r+b.r - 0.02);
}
assert(b.done,'every shot terminates');
assert(b.time<=55.05&&ev.filter(e=>e.type==='stop').length===1);
const ids=ev.filter(e=>e.type==='coin').map(e=>e.id);
assert.equal(new Set(ids).size,ids.length);
return{ball:b,events:ev};
}

const first=shot();
assert.deepEqual(shot(),first);
assert(first.ball.maxX>=80&&first.ball.maxX<=170&&shot(0,{},0.3).ball.maxX<first.ball.maxX*0.6);
assert(first.events.some(e=>e.type==='coin'));
assert.deepEqual([1,0.9,0.8,0.5,0.2].map(p=>P.grade(p)),['perfect','perfect','great','good','weak']);
assert(P.perfectBand({},'easy')<P.perfectBand({},'normal')- 0.05&&P.perfectBand({},'hero')>P.perfectBand({},'normal'));
const nr=P.reward({maxX:300,coins:20}),hr=P.reward(Object.assign(P.launch(P.createCourse(0,'hero'),{},1),{maxX:300,coins:20}));
assert(hr.total>nr.total&&hr.hero>0);

const c0=P.createCourse(0),avg=up=>[0.85,0.95,1].reduce((s,p)=>s+shot(0,up,p).ball.maxX,0)/3;
assert(avg({power:6})>avg({})*1.8);
const b0=P.launch(c0,{},1),b1=P.launch(c0,{},1);
for(const b of[b0,b1])Object.assign(b,{x:30,y:P.heightAt(c0,30)+b.r+0.1,vx:10,vy:-15});
P.step(c0,b0,{},1/60);P.step(c0,b1,{bounce:10},1/60);
assert(b1.vy>b0.vy&&P.launch(c0,{rockets:3},1).rocketsLeft===4&&P.magnetOf({magnet:5})>P.magnetOf({magnet:0})*3);
assert.equal(P.grade(0.83),'great');assert.equal(P.grade(0.83,{aim:4}),'perfect');

const kick=th=>{const b=P.launch(c0,{thrust:th},1);for(let i=0;i<20;i++)P.step(c0,b,{thrust:th},1/60);const v=[b.vx,b.vy];P.press(c0,b,{thrust:th});return[b.vx - v[0],b.vy - v[1]];};
assert(kick(5)[1]>kick(0)[1]+12&&kick(5)[0]>kick(0)[0]+6);

const water=P.features(c0,0,4000).flats.find(f=>f.type==='water');
const onto=(skip,vx,vy,mode='air')=>{
const b=Object.assign(P.launch(c0,{skip},1),{x:water.x -(mode==='roll'?water.hw+0.2:0),mode,vx,vy,time:3});
b.y=(mode==='roll'?P.heightAt(c0,b.x):water.level)+b.r+(mode==='roll'?0:0.02);
const s=[];for(let i=0;i<30&&!b.done;i++)s.push(...P.step(c0,b,{skip},1/60).map(e=>e.type));return s;
};
assert(onto(0,7,-9).includes('splash')&&onto(4,7,-9).includes('skip')&&onto(0,12,0,'roll').includes('splash')&&onto(4,12,0,'roll').includes('skip'));
assert.equal(P.reward({maxX:300,coins:20,treasure:5}).total,nr.total+Math.floor(nr.total*0.5));

const air=P.launch(c0,{},1);for(let i=0;i<20;i++)P.step(c0,air,{},1/60);
assert.equal(P.press(c0,air,{},true).type,'none');
assert.equal(P.press(c0,air,{}).type,'rocket');
assert.equal(P.press(c0,air,{}).type,'empty');

const timed=shot(0,{},1,'timed'),scan=P.features(c0,0,4000);
assert(timed.ball.supers>=2&&timed.ball.maxX>first.ball.maxX&&scan.coins.length>80&&scan.rings.length>4&&scan.ufos.length>4&&scan.tnts.length>4&&scan.cannons.length>2);
const bTnt=Object.assign(P.launch(c0,{},1),{x:scan.tnts[0].x,y:scan.tnts[0].y,vx:8,vy:-4});
const bCan=Object.assign(P.launch(c0,{},1),{x:scan.cannons[0].x,y:scan.cannons[0].y,vx:6,vy:-2});
assert(P.step(c0,bTnt,{},1/60).some(e=>e.type==='tnt')&&bTnt.vy>20&&P.step(c0,bCan,{},1/60).some(e=>e.type==='cannon')&&bCan.vx>20);

const mx=all(12);
for(let w=0;w<P.worlds.length;w++){
if(w>0)assert(P.worlds[w].unlock>P.worlds[w - 1].unlock);
for(const d of P.diffIds){shot(w,{},0.5,'idle',d);shot(w,all(6),1,'timed',d);shot(w,mx,1,'skill',d);}
if(w<P.worlds.length - 1)assert(Math.max(...[0.9,0.95,1].map(p=>shot(w,mx,p,'skill').ball.maxX))>=P.worlds[w+1].unlock);
}
assert(shot(0,all(8),1,'rockets').ball.space);

const cl=P.sanitizeSave({coins:-20,best:NaN,world:4,difficulty:'hero',upgrades:{power:Infinity,bounce:91},shots:-7});
assert.deepEqual([cl.world,cl.difficulty,cl.coins,cl.upgrades.bounce],[4,'hero',0,10]);
const old=P.sanitizeSave({coins:100,best:640,world:2,upgrades:{power:2,bounce:1,glide:0},skins:['gold','x'],skin:'gold',shots:9});
assert.deepEqual([old.coins,old.best,old.world,old.skin,old.skins,old.tips],[310,640,2,'gold',['classic','gold'],2]);
assert.deepEqual(P.sanitizeSave(old),old);
console.log(JSON.stringify({status:'PASS',firstShot:Math.round(first.ball.maxX),timedFirstShot:Math.round(timed.ball.maxX)}));
