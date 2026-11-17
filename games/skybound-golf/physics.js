(function(root){
'use strict';
var CHUNK=80,SPACE=250,RAD=0.55,T_MAX=55,A_WIN=0.6,P_WIN=0.2,L_WIN=0.1;
var P_PWR=0.9,G_PWR=0.72,OK_PWR=0.45,BLEND=5,LIM=1e7;

var DIFFS={
easy:{id:'easy',name:'سهل',label:'سهل (5–7)',gaugePeriod:1.75,perfectBonus:0.08,armWindow:0.8,perfectWindow:0.28,rocketBoost:1.18,gravityMul:0.92,wind:1.1,coinMul:1},
normal:{id:'normal',name:'متوسط',label:'متوسط',gaugePeriod:1.3,perfectBonus:0,armWindow:A_WIN,perfectWindow:P_WIN,rocketBoost:1,gravityMul:1,wind:0,coinMul:1},
hero:{id:'hero',name:'بطل',label:'بطل ×1.35',gaugePeriod:0.94,perfectBonus:-0.02,armWindow:0.52,perfectWindow:0.16,rocketBoost:1.05,gravityMul:1.08,wind:-2.0,coinMul:1.35}
};
var DIFF_IDS=['easy','normal','hero'];
var worlds=[
{id:'meadow',name:'سهول الصواريخ',unlock:0,gravity:19,hills:[3.2,1.6,5],ground:'grass',prop:'tree',slots:{green:3,sand:3,water:2,pad:4,prop:4,none:2}},
{id:'desert',name:'وادي الرمال',unlock:250,gravity:17.5,hills:[4.5,2,7],ground:'dune',prop:'cactus',slots:{green:3,sand:5,water:2,pad:3,prop:4,none:2}},
{id:'snow',name:'قمم الثلج',unlock:550,gravity:16,hills:[5.5,2.4,10],ground:'snow',prop:'pine',slots:{green:3,ice:4,sand:1,pad:4,prop:4,none:2}},
{id:'volcano',name:'جبل البركان',unlock:900,gravity:15.2,hills:[4.6,2.5,8.2],ground:'rock',prop:'spire',slots:{green:2,sand:2,water:3,pad:4,prop:4,none:2}},
{id:'space',name:'مدار المجرة',unlock:1400,gravity:13.5,hills:[3,2.2,6],ground:'moon',prop:'crystal',slots:{green:3,crater:4,pad:4,prop:3,none:2}}
];
var SURF={grass:[0,0.88,6.5],dune:[-0.02,0.86,7],snow:[-0.03,0.87,6],rock:[0.03,0.9,5.2],moon:[-0.01,0.91,4.5],green:[-0.08,0.85,4.5],sand:[-0.3,0.45,26],ice:[-0.05,0.98,1.2],pad:[0,0.9,6]};
var PROPS={tree:[6.0,2.4,0.38],cactus:[3.8,1.55,0.42],pine:[5.5,2.1,0.35],spire:[4.6,1.9,0.65],crystal:[3.4,1.6,0.8]};
var skins=[
{id:'classic',name:'كلاسيكية',price:0},{id:'gold',name:'ذهبية',price:250},
{id:'rocket',name:'صاروخية',price:550},{id:'fire',name:'كرة اللهب',price:950},
{id:'dino',name:'ديناصور',price:1500},{id:'cyber',name:'سايبر',price:2400}
];
var UPS={
power:{max:12,base:30,growth:1.36},bounce:{max:10,base:25,growth:1.4},
rockets:{max:5,base:60,growth:1.9},magnet:{max:5,base:40,growth:1.8},
thrust:{max:5,base:50,growth:1.75},aim:{max:4,base:45,growth:1.8},
skip:{max:4,base:35,growth:1.7},treasure:{max:5,base:80,growth:2}
};
var KINDS=['power','bounce','rockets','magnet','thrust','aim','skip','treasure'];

function clp(x,a,b){return x<a?a:x>b?b:x;}
function fin(x,fb){return typeof x==='number'&&Number.isFinite(x)?x:fb;}
function sm(v){return v*v*(3 - 2*v);}
function diffOf(id){return DIFFS[id]||DIFFS.normal;}
function hsh(c,n){var x=Math.sin(n*127.1+c.seed*311.7)*43758.5453;return x - Math.floor(x);}

function createCourse(idx,diff){
idx=clp(Math.floor(fin(idx,0)),0,worlds.length - 1);
var d=diffOf(diff);
return{worldIndex:idx,world:worlds[idx],diff:d,difficulty:d.id,seed:11+idx*29,chunks:{},cached:0,layouts:{},laidOut:0};
}

function baseH(c,x){
if(x<=22)return 0;
var a=c.world.hills,s=c.seed,f=sm(clp((x - 22)/70,0,1));
return f*(a[0]*Math.sin(x*0.019+s*0.37)+a[1]*Math.sin(x*0.053+s*1.3)+a[2]*(Math.sin(x*0.0061+s)- Math.sin(s)));
}

function mkFlat(c,t,x,hw){
var f={type:t,x:x,hw:hw,level:baseH(c,x)-(t==='water'?0.7:0)};
if(t==='green')f.holeX=x+2.2;
if(t==='crater')f.depth=1.6+hw*0.18;
return f;
}

function layout(c,i){
var g=c.layouts[i];
if(g)return g;
g={flats:[],spots:[]};
var x0=i*CHUNK,sl=c.world.slots,r=function(k){return hsh(c,i*31+k);};
if(i===0)g.flats.push(mkFlat(c,'pad',62,2.2));
else for(var n=0;n<4;n++){
var sx=x0+10+n*20+(r(n)- 0.5)*5,tot=0,k,t='none';
for(k in sl)tot+=sl[k];
var rl=r(n+10)*tot;
for(k in sl){rl-=sl[k];if(rl<0){t=k;break;}}
if(i===1&&(t==='water'||t==='sand'))t='prop';
if(t==='prop')g.spots.push({n:n,x:sx});
else if(t!=='none')g.flats.push(mkFlat(c,t,sx,t==='green'?8:t==='pad'?2.2:t==='water'?5+r(n+20)*2:t==='crater'?6+r(n+20)*3:4.5+r(n+20)*2.5));
}
if(c.laidOut>400){c.layouts={};c.laidOut=0;}
c.layouts[i]=g;c.laidOut++;
return g;
}

function hAt(c,x){
x=clp(fin(x,0),-LIM,LIM);
var h=baseH(c,x),i=Math.floor(x/CHUNK);
for(var j=i - 1;j<=i+1;j++)if(j>=0){
var fl=layout(c,j).flats;
for(var n=0;n<fl.length;n++){
var f=fl[n],d=Math.abs(x - f.x);
if(d>=f.hw+BLEND)continue;
if(f.type==='crater'){if(d<f.hw){var q=d/f.hw;h-=f.depth*(1 - q*q)*(1 - q*q);}continue;}
var t=d<=f.hw?1:1 - sm((d - f.hw)/BLEND);
h=h*(1 - t)+f.level*t;
}
}
return h;
}

function sAt(c,x){
x=clp(fin(x,0),-LIM,LIM);
var i=Math.floor(x/CHUNK);
for(var j=i - 1;j<=i+1;j++)if(j>=0){
var fl=layout(c,j).flats;
for(var n=0;n<fl.length;n++)if(fl[n].type!=='crater'&&Math.abs(x - fl[n].x)<=fl[n].hw)return fl[n];
}
return null;
}
function sType(c,x){var f=sAt(c,x);return f?f.type:c.world.ground;}
function slp(c,x){return(hAt(c,x+0.08)- hAt(c,x - 0.08))/0.16;}

function chunk(c,i){
var ch=c.chunks[i];
if(ch)return ch;
var gr=layout(c,i),x0=i*CHUNK,w=c.world,n,k,h;
ch={flats:gr.flats,props:[],coins:[],rings:[],ufos:[],tnts:[],cannons:[]};
var r=function(m){return hsh(c,i*31+m);};
if(i===0){
for(k=0;k<6;k++)ch.coins.push({id:0,x:9+k*2.5,y:3.4+k*1.45 - k*k*0.12,gem:false});
for(k=0;k<5;k++){var ax=30+k*4;ch.coins.push({id:0,x:ax,y:0.95*ax - 0.0142*ax*ax,gem:false});}
}else{
for(n=0;n<gr.spots.length;n++){
var sp=gr.spots[n],p=PROPS[w.prop],sc=0.85+r(sp.n+30)*0.35;
ch.props.push({id:i*8+sp.n,type:w.prop,x:sp.x,ground:hAt(c,sp.x),lift:p[0]*sc,r:p[1]*sc,k:p[2]});
}
var groups=2+(r(40)>0.52?1:0);
for(n=0;n<groups;n++){
var gx=x0+6+n*24+r(41+n)*12,band=r(43+n),far=clp(i/12,0,1);
var base,gem=false,pat=Math.floor(r(47+n)*4),flr=hAt(c,gx);
if(band<0.3){base=-1;if(pat===2)pat=1;}
else if(band<0.72 - far*0.12||i<3)base=5+r(45+n)*14;
else if(band<0.9 - far*0.05||i<5)base=24+r(45+n)*36;
else{base=80+r(45+n)*180*far;gem=true;pat=2;}
for(k=0;k<7&&!(gem&&k>4);k++){
var px=gx+(pat===0?k*2.5:pat===1?k*2.3:pat===2?k*1.9:k*2);
var py=pat===0?Math.sin(k/6*Math.PI)*3.6:pat===1?0:pat===2?k*1.8:k*1.4;
var un=hAt(c,px);
h=base<0?un+1.6+py:Math.max(flr+base+py,un+2);
ch.coins.push({id:0,x:px,y:h,gem:gem});
}
}
if(r(50)<(i===1?0.65:0.42)){var rx=x0+22+r(51)*38;ch.rings.push({id:i*4,x:rx,y:hAt(c,rx)+10+r(52)*(26+i*1.4),r:3.3});}
if(r(53)<0.5){var ux=x0+16+r(55)*48;ch.ufos.push({id:i*4+1,x:ux,y:hAt(c,ux)+14+r(54)*(28+Math.min(120,i*6)),r:1.75,kind:Math.floor(r(56)*3)});}
if(r(60)<0.54){var tx=i===1?x0+54+r(61)*14:x0+14+r(61)*50,st=sType(c,tx);if(st!=='water'&&st!=='green')ch.tnts.push({id:i*4+2,x:tx,y:hAt(c,tx)+1.2,r:1.5});}
if(i>=2&&r(64)<0.42){
var cx=x0+34+r(65)*32,cst=sType(c,cx);
if(cst!=='water'&&cst!=='green'&&(!ch.tnts.length||Math.abs(cx - ch.tnts[0].x)>10))ch.cannons.push({id:i*4+3,x:cx,y:hAt(c,cx)+1.4,r:1.8});
}
}
for(k=0;k<ch.coins.length;k++)ch.coins[k].id=i*64+k;
if(c.cached>160){c.chunks={};c.cached=0;}
c.chunks[i]=ch;c.cached++;
return ch;
}

function features(c,minX,maxX){
minX=clp(fin(minX,0),-LIM,LIM);maxX=clp(fin(maxX,minX+200),-LIM,LIM);
var out={flats:[],props:[],coins:[],rings:[],ufos:[],tnts:[],cannons:[]};
if(maxX<minX)return out;
var first=Math.max(0,Math.floor((minX - 12)/CHUNK)),last=Math.min(Math.floor((maxX+12)/CHUNK),first+40);
for(var i=first;i<=last;i++){var ch=chunk(c,i);for(var k in out)for(var n=0;n<ch[k].length;n++)out[k].push(ch[k][n]);}
return out;
}

function lvs(raw){
raw=raw&&typeof raw==='object'?raw:{};
var out={};
for(var i=0;i<KINDS.length;i++){var k=KINDS[i];out[k]=clp(Math.floor(fin(raw[k],0)),0,UPS[k].max);}
return out;
}
function bncOf(u){return 0.36+u.bounce*0.02;}
function magOf(raw){return 1.3+lvs(raw).magnet*0.7;}
function rktOf(raw){return 1+lvs(raw).rockets;}
function pBand(raw,diff){return clp(P_PWR - 0.025*lvs(raw).aim - diffOf(diff).perfectBonus,0.73,0.94);}
function skimSp(u){return 9 - 1.5*u.skip;}
function grade(p,raw,diff){p=clp(fin(p,0),0,1);return p>=pBand(raw,diff)?'perfect':p>=G_PWR?'great':p>=OK_PWR?'good':'weak';}

function launch(c,raw,pwr){
var u=lvs(raw),d=c&&c.diff?c.diff:DIFFS.normal;
pwr=clp(fin(pwr,0),0,1);
var g=grade(pwr,raw,d.id),pf=g==='perfect',rk=rktOf(u);
var sp=(33+u.power*4.6)*(0.4+0.6*pwr)*(pf?1.1:1),ang=(36+8*pwr)*Math.PI/180,y=hAt(c,0)+RAD;
return{
x:0,y:y,vx:Math.cos(ang)*sp,vy:Math.sin(ang)*sp,r:RAD,
mode:'air',done:false,reason:null,time:0,maxX:0,maxY:y,power:pwr,grade:g,perfect:pf,
rockets:rk,rocketsLeft:rk,armed:false,armAge:0,combo:0,bestCombo:0,
supers:0,bounces:0,skips:0,coins:0,gems:0,pops:0,rings:0,ufos:0,tnts:0,cannons:0,
got:{},used:{},treasure:u.treasure,coinMul:d.coinMul,
lastPad:-1,lateUntil:-1,lateOut:0,space:false,hole:false,ace:false,surface:null,trackVy:0
};
}

function bisectX(c,ox,oy,x,y,r){
var lo=0,hi=1;
for(var it=0;it<10;it++){var m=(lo+hi)/2;if(oy+(y - oy)*m>=hAt(c,ox+(x - ox)*m)+r)lo=m;else hi=m;}
return ox+(x - ox)*lo;
}

function predImp(c,b,maxT){
if(!b||b.done||b.mode!=='air')return null;
var d=c&&c.diff?c.diff:DIFFS.normal,g=c.world.gravity*d.gravityMul,wind=d.wind;
var x=b.x,y=b.y,vx=b.vx,vy=b.vy,t=0;
maxT=fin(maxT,d.armWindow);
while(t<maxT+1e-9){
var cnt=Math.max(4,Math.ceil(Math.hypot(vx,vy)/30)),h=1/(60*cnt);
for(var k=0;k<cnt;k++){
if(t+h>maxT+1e-9)return null;
var ox=x,oy=y;
vy-=g*h;if(wind)vx+=wind*0.35*h;
var dr=Math.exp(-(0.01+0.0009*Math.hypot(vx,vy))*h);
vx*=dr;vy*=dr;x+=vx*h;y+=vy*h;
if(x<0){x=0;vx=Math.abs(vx)*0.5;}
t+=h;
if(y<=hAt(c,x)+b.r){x=bisectX(c,ox,oy,x,y,b.r);return{t:t,x:x,y:hAt(c,x)};}
}
}
return null;
}

function perfT(t,c){return t<=(c&&c.diff?c.diff.perfectWindow:P_WIN)+1e-9;}

function press(c,b,raw,slamOnly){
if(!b||b.done)return{type:'none'};
var u=lvs(raw),d=c&&c.diff?c.diff:DIFFS.normal;
if(b.mode==='air'&&b.time<=b.lateUntil&&!b.armed){
b.vy+=b.lateOut*0.1*Math.pow(0.92,b.supers)/Math.max(0.1,bncOf(u));
b.supers++;b.combo=0;b.lateUntil=-1;
return{type:'late',x:b.x,y:b.y - b.r};
}
if(b.mode==='air'&&b.vy<0){
var p=predImp(c,b,d.armWindow);
if(p){if(b.armed)return{type:'armed'};b.armed=true;b.armAge=0;return{type:'arm',t:p.t};}
}
if(slamOnly)return{type:'none'};
if(b.rocketsLeft>0){
b.rocketsLeft--;
if(b.mode==='roll'){b.mode='air';b.y+=0.05;}
b.armed=false;
b.vy=Math.max(b.vy,0)+(18+3*u.thrust)*d.rocketBoost;
b.vx=Math.max(b.vx,0)+(6+1.5*u.thrust)*d.rocketBoost;
return{type:'rocket',left:b.rocketsLeft,x:b.x,y:b.y,thrust:u.thrust};
}
return{type:'empty'};
}

function finish(c,b,evs,rsn){
b.vx=b.vy=0;b.done=true;b.mode='stop';b.reason=rsn;b.armed=false;
if(rsn!=='hole')b.y=Math.max(b.y,hAt(c,b.x)+b.r);
b.maxX=Math.max(b.maxX,b.x);b.surface=sType(c,b.x);
evs.push({type:'stop',x:b.x,y:b.y,reason:rsn,surface:b.surface});
}

function padHit(b,u,f,evs){
if(b.lastPad===f.x)return false;
b.lastPad=f.x;b.mode='air';b.armed=false;
b.vy=Math.max(17.5+u.bounce*0.65,Math.abs(b.vy)*0.86);
b.vx=Math.max(b.vx,9.5)+4.2;b.y=f.level+b.r+0.05;
evs.push({type:'pad',x:b.x,y:b.y});
return true;
}

function impact(c,b,u,evs){
var f=sAt(c,b.x),type=f?f.type:c.world.ground;
if(type==='pad'&&padHit(b,u,f,evs))return;
var sp=Math.hypot(b.vx,b.vy);
if(type==='green'&&Math.abs(b.x - f.holeX)<0.75&&sp<32){
b.ace=b.bounces===0&&b.supers===0;b.hole=true;b.x=f.holeX;b.y=f.level - 0.3;
evs.push({type:'hole',x:b.x,y:f.level,ace:b.ace});finish(c,b,evs,'hole');return;
}
if(type==='water'){
if(b.armed||(b.vx>skimSp(u)&&-b.vy<b.vx*(1.1+0.25*u.skip))){
b.skips++;b.armed=false;b.vy=Math.abs(b.vy)*0.5+2.5+0.5*u.skip;
b.vx*=0.84+0.03*u.skip;b.y=f.level+b.r+0.02;
evs.push({type:'skip',x:b.x,y:f.level,count:b.skips});return;
}
b.y=f.level;evs.push({type:'splash',x:b.x,y:f.level});finish(c,b,evs,'water');return;
}
var sf=SURF[type]||SURF.grass,s=slp(c,b.x),inv=1/Math.sqrt(1+s*s);
var nx=-s*inv,ny=inv,tx=inv,ty=s*inv,vn=b.vx*nx+b.vy*ny,vt=b.vx*tx+b.vy*ty;
var keep=type==='sand'?Math.min(0.85,sf[1]+u.skip*0.08):sf[1];
var e=clp(bncOf(u)+sf[0]+(type==='sand'?u.skip*0.05:0),0.06,0.9),kind='bounce',q='';
if(b.armed&&-vn>4){
var tire=Math.pow(0.92,b.supers);
if(perfT(b.armAge,c)){q='perfect';e=Math.max(e,(0.86+u.bounce*0.008)*tire);keep=Math.max(keep,0.95);}
else{q='good';e=Math.max(e,e+0.1*tire);keep=Math.max(keep,0.9);}
if(type==='sand')e=Math.min(e,0.32+u.skip*0.08);
}
b.armed=false;b.bounces++;
var out=-vn*e;
if(out<2.6){
b.combo=0;b.mode='roll';b.vx=Math.max(-4,vt*keep)*tx;b.vy=0;
b.trackVy=b.vx*slp(c,b.x);b.y=hAt(c,b.x)+b.r;
evs.push({type:'roll',x:b.x,y:b.y,surface:type});return;
}
if(q){kind='super';b.supers++;b.combo=q==='perfect'?b.combo+1:0;b.bestCombo=Math.max(b.bestCombo,b.combo);}
else b.combo=0;
b.vx=vt*keep*tx+out*nx;b.vy=vt*keep*ty+out*ny;
if(kind==='bounce'&&type!=='sand'){b.lateUntil=b.time+L_WIN;b.lateOut=out;}
if(q==='perfect')b.vx=Math.max(b.vx,Math.min(out*0.9,sp*0.9));
b.y+=0.01;
evs.push({type:kind,quality:q,combo:b.combo,x:b.x,y:b.y - b.r,strength:Math.min(1,-vn/35),surface:type});
}

function collect(c,b,u,ox,evs){
var i=Math.floor(b.x/CHUNK),reach=magOf(u);
for(var j=Math.max(0,i - 1);j<=i+1;j++){
var ch=chunk(c,j),n,o,key;
for(n=0;n<ch.coins.length;n++){
o=ch.coins[n];
if(b.got[o.id]||Math.abs(o.x - b.x)>reach||Math.abs(o.y - b.y)>reach||Math.hypot(o.x - b.x,o.y - b.y)>reach)continue;
b.got[o.id]=1;if(o.gem)b.gems++;else b.coins++;
evs.push({type:'coin',id:o.id,x:o.x,y:o.y,gem:o.gem});
}
for(n=0;n<ch.rings.length;n++){
o=ch.rings[n];key='r'+o.id;
if(b.used[key]||(ox - o.x)*(b.x - o.x)>0||Math.abs(b.y - o.y)>o.r)continue;
b.used[key]=1;b.rings++;
var sp=Math.hypot(b.vx,b.vy)||1,bst=(sp+9.5)/sp;
b.vx*=bst;b.vy=b.vy*bst+3.2;b.armed=false;
evs.push({type:'ring',id:o.id,x:o.x,y:o.y});
}
for(n=0;n<ch.ufos.length;n++){
o=ch.ufos[n];key='u'+o.id;
if(b.used[key]||Math.hypot(o.x - b.x,o.y - b.y)>o.r+b.r)continue;
b.used[key]=1;b.ufos++;b.pops++;b.vy=Math.max(b.vy,0)+15;b.vx+=2.6;b.armed=false;
evs.push({type:'ufo',id:o.id,x:o.x,y:o.y,kind:o.kind});
}
for(n=0;n<ch.tnts.length;n++){
o=ch.tnts[n];key='t'+o.id;
if(b.used[key]||Math.hypot(o.x - b.x,o.y - b.y)>o.r+b.r)continue;
b.used[key]=1;b.tnts++;b.pops++;b.mode='air';b.armed=false;
b.vy=Math.max(Math.abs(b.vy)*0.85,21+u.bounce*0.6);b.vx=Math.max(b.vx,11)+5.5;b.y=Math.max(b.y,o.y+0.2);
evs.push({type:'tnt',id:o.id,x:o.x,y:o.y});
}
for(n=0;n<ch.cannons.length;n++){
o=ch.cannons[n];key='c'+o.id;
if(b.used[key]||Math.hypot(o.x - b.x,o.y - b.y)>o.r+b.r)continue;
b.used[key]=1;b.cannons++;b.mode='air';b.armed=false;
var bl=Math.max(Math.hypot(b.vx,b.vy)*1.12,29+u.power*1.1);
b.vx=bl*0.79;b.vy=bl*0.61;b.x=o.x+1.2;b.y=Math.max(o.y+1.0,hAt(c,o.x+1.2)+b.r+0.2);
evs.push({type:'cannon',id:o.id,x:o.x,y:o.y});
}
for(n=0;n<ch.props.length;n++){
o=ch.props[n];
var px=o.x,py=o.ground+o.lift,dx=b.x - px,dy=b.y - py,dist=Math.hypot(dx,dy);
if(dist>o.r+b.r||dist===0)continue;
var nx=dx/dist,ny=dy/dist,vn=b.vx*nx+b.vy*ny;
b.x=px+nx*(o.r+b.r+0.01);b.y=py+ny*(o.r+b.r+0.01);
if(vn>=0)continue;
b.vx-=(1+o.k)*vn*nx;b.vy-=(1+o.k)*vn*ny;
if(o.k<1){b.vx*=0.85;b.vy*=0.85;}
if(b.mode==='roll')b.mode='air';
if(ny>0.5&&-vn<3){
var sd=nx<-0.05?-1:1,sx=ny*sd,sy=-nx*sd,al=b.vx*sx+b.vy*sy;
if(al<2){b.vx+=(2 - al)*sx;b.vy+=(2 - al)*sy;}
}
if(-vn>=3)evs.push({type:'prop',id:o.id,x:b.x - nx*b.r,y:b.y - ny*b.r,prop:o.type,strength:Math.min(1,-vn/25)});
}
}
}

function step(c,b,raw,dt){
var evs=[];
if(!b||b.done)return evs;
var u=lvs(raw),d=c&&c.diff?c.diff:DIFFS.normal,g=c.world.gravity*d.gravityMul,wind=d.wind;
dt=clp(fin(dt,1/60),0,0.1);
var cnt=Math.max(1,Math.ceil(dt/(1/240)),Math.ceil(Math.hypot(b.vx,b.vy)*dt/0.5)),h=dt/cnt;
for(var k=0;k<cnt&&!b.done;k++){
b.time+=h;
var ox=b.x,oy=b.y;
if(b.armed&&(b.armAge+=h)>d.armWindow+0.15)b.armed=false;
if(b.mode==='roll'){
var f=sAt(c,b.x),type=f?f.type:c.world.ground;
if(type==='pad'&&padHit(b,u,f,evs))continue;
if(type==='water'){
if(u.skip&&b.vx>skimSp(u)){
b.skips++;b.mode='air';b.armed=false;b.vy=3+u.skip;b.vx*=0.84+0.03*u.skip;b.y=f.level+b.r+0.05;
evs.push({type:'skip',x:b.x,y:f.level,count:b.skips});continue;
}
evs.push({type:'splash',x:b.x,y:f.level});b.y=f.level;finish(c,b,evs,'water');break;
}
var s=slp(c,b.x),br=(SURF[type]||SURF.grass)[2];
var fr=type==='sand'?Math.max(9,br - u.skip*3.5):br,al=-g*s/Math.sqrt(1+s*s),nx=b.vx+al*h;
if(Math.abs(nx)<=fr*h+0.06&&Math.abs(al)<fr){finish(c,b,evs,'rest');break;}
b.vx=nx - Math.sign(nx)*fr*h;
b.x=Math.max(0,b.x+b.vx*h);
if(b.x===0&&b.vx<0){finish(c,b,evs,'rest');break;}
if(type==='green'&&(ox - f.holeX)*(b.x - f.holeX)<=0&&Math.abs(b.vx)<3.6){
b.hole=true;b.x=f.holeX;b.y=f.level - 0.3;evs.push({type:'hole',x:b.x,y:f.level,ace:false});finish(c,b,evs,'hole');break;
}
var gr=hAt(c,b.x)+b.r,vyG=(gr - oy)/h;
if(vyG<b.trackVy - g*h*1.2&&Math.abs(b.vx)>6){b.mode='air';b.vy=b.trackVy;b.y=oy+b.vy*h;}
else{b.y=gr;b.trackVy=vyG;}
}else{
b.vy-=g*h;if(wind)b.vx+=wind*0.35*h;
var dr=Math.exp(-(0.01+0.0009*Math.hypot(b.vx,b.vy))*h);
b.vx*=dr;b.vy*=dr;b.x+=b.vx*h;b.y+=b.vy*h;
if(b.x<0){b.x=0;b.vx=Math.abs(b.vx)*0.5;}
if(b.y<=hAt(c,b.x)+b.r){b.x=bisectX(c,ox,oy,b.x,b.y,b.r);b.y=hAt(c,b.x)+b.r;impact(c,b,u,evs);}
}
if(!b.done)collect(c,b,u,ox,evs);
if(!b.done&&b.mode!=='roll'){var un=hAt(c,b.x)+b.r;if(b.y<un)b.y=un;}
b.maxX=Math.max(b.maxX,b.x);b.maxY=Math.max(b.maxY,b.y);
if(!b.space&&b.y>=SPACE){b.space=true;evs.push({type:'space',x:b.x,y:b.y});}
if(!b.done&&(b.time>T_MAX||b.x>20000))finish(c,b,evs,'limit');
}
return evs;
}

function pace(b){
if(!b||b.done)return 1;
var sp=Math.hypot(b.vx,b.vy);
return(b.mode==='roll'&&sp<12)||(sp<7&&!b.armed)?1.7:1;
}

function reward(ball){
var d=Math.floor(clp(fin(ball&&ball.maxX,0),0,20000)),b=ball||{};
var smsh=(b.ufos||b.tnts||b.cannons)?(b.ufos | 0)*3+(b.tnts | 0)*4+(b.cannons | 0)*5:(b.pops | 0)*2;
var p={
coins:(b.coins | 0)+(b.gems | 0)*5+(b.rings | 0)*3+smsh,
distance:Math.floor(d/10),
bonus:(b.perfect?5:0)+(b.supers | 0)+(b.hole?(b.ace?150:40)+Math.floor(d/10):0)+(b.space?100:0)
};
var mul=fin(b.coinMul,1),sub=p.coins+p.distance+p.bonus;
p.hero=mul>1?Math.round(sub*(mul - 1)):0;
p.total=sub+p.hero;
p.treasure=Math.floor(p.total*0.1*clp(Math.floor(fin(b.treasure,0)),0,UPS.treasure.max));
p.total+=p.treasure;
return p;
}

function cost(kind,lv){
var sp=UPS[kind];
if(!sp)return Infinity;
lv=clp(Math.floor(fin(lv,0)),0,sp.max);
return lv>=sp.max?Infinity:Math.round(sp.base*Math.pow(sp.growth,lv)/5)*5;
}

function sanitizeSave(raw){
raw=raw&&typeof raw==='object'?raw:{};
var leg=raw.v!==2&&raw.upgrades&&typeof raw.upgrades==='object'&&'glide'in raw.upgrades;
var coins=clp(Math.floor(fin(raw.coins,0)),0,9999999);
if(leg){
var bs={power:65,bounce:50,glide:55},ref=0;
for(var bk in bs)for(var n=0,lv=clp(Math.floor(fin(raw.upgrades[bk],0)),0,10);n<lv;n++)ref+=Math.round(bs[bk]*Math.pow(1.46,n)/5)*5;
coins=Math.min(9999999,coins+ref);
}
var best=Math.floor(clp(fin(raw.best,0),0,20000)),rb=raw.bests&&typeof raw.bests==='object'?raw.bests:{},bests={};
for(var i=0;i<worlds.length;i++){
var wid=worlds[i].id,alt=wid==='volcano'?rb.clouds:wid==='space'?rb.moon:0;
bests[wid]=Math.max(Math.floor(clp(fin(rb[wid],0),0,20000)),Math.floor(clp(fin(alt,0),0,20000)));
best=Math.max(best,bests[wid]);
}
var owned=skins.filter(function(k){return !k.price||(Array.isArray(raw.skins)&&raw.skins.indexOf(k.id)>=0);}).map(function(k){return k.id;});
var cnt=function(v){return clp(Math.floor(fin(v,0)),0,999999);};
return{
v:2,coins:coins,best:best,bests:bests,high:Math.floor(clp(fin(raw.high,0),0,99999)),
world:clp(Math.floor(fin(raw.world,0)),0,worlds.length - 1),
difficulty:DIFF_IDS.indexOf(raw.difficulty)>=0?raw.difficulty:'normal',
upgrades:leg?lvs({}):lvs(raw.upgrades),
shots:cnt(raw.shots),holes:cnt(raw.holes),spaces:cnt(raw.spaces),
tips:clp(Math.floor(fin(raw.tips,leg||raw.shots>0?2:0)),0,2),
skins:owned,skin:owned.indexOf(raw.skin)>=0?raw.skin:'classic'
};
}

var api={
worlds:worlds,skins:skins,upgrades:UPS,kinds:KINDS,difficulties:DIFFS,diffIds:DIFF_IDS,diffOf:diffOf,
CHUNK:CHUNK,SPACE:SPACE,ARM_WINDOW:A_WIN,PERFECT_WINDOW:P_WIN,
bands:{perfect:P_PWR,great:G_PWR,good:OK_PWR},
createCourse:createCourse,heightAt:hAt,surfaceType:sType,features:features,
levels:lvs,grade:grade,launch:launch,press:press,predictImpact:predImp,
perfectTiming:perfT,step:step,pace:pace,reward:reward,cost:cost,
sanitizeSave:sanitizeSave,magnetOf:magOf,rocketsOf:rktOf,perfectBand:pBand
};
root.GolfPhysics=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
