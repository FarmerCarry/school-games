(function(){
'use strict';
var P=window.GolfPhysics,W=1280,H=720,PPM=24,INK='#1b1640',TAU=Math.PI*2,ADDR=Math.PI*0.5;
var TH=[
[['#2b95f0','#c2f2ff'],'#7ec4de','#4fbe74','#359e56',0,'#9c5630','#68d84b','#29b6f6',0],
[['#ff7b42','#ffe5a3'],'#e8935c','#f2b266','#df984b',1,'#cc7c3f','#fad275','#26c6da',1],
[['#4b9aff','#e8f5ff'],'#9fb8e8','#5884b5','#d4e9ff',2,'#7385b5','#ffffff','#4dd0e1',2],
[['#2d113b','#e04f2e'],'#4f2039','#6e2832','#471b28',2,'#38202c','#633744','#ff9100',3],
[['#090724','#281b66'],'#3f3778','#524a8f','#665fa6',2,'#7872ab','#cbc6eb','#b388ff',4]
];
var TRL={classic:'#ffffff',gold:'#ffe055',rocket:'#ff5252',fire:'#ff9100',dino:'#69f0ae',cyber:'#18ffff'};

function clp(v,a,b){return v<a?a:v>b?b:v;}
function hsh(n){var x=Math.sin(n*127.1+311.7)*43758.5453;return x - Math.floor(x);}
function mix(a,b,t){
var x=parseInt(a.slice(1),16),y=parseInt(b.slice(1),16);
return '#'+((1<<24)|(Math.round(((x>>16)& 255)*(1 - t)+((y>>16)& 255)*t)<<16)|(Math.round(((x>>8)& 255)*(1 - t)+((y>>8)& 255)*t)<<8)| Math.round((x & 255)*(1 - t)+(y & 255)*t)).toString(16).slice(1);
}
function circ(c,x,y,r){c.beginPath();c.arc(x,y,Math.max(0.1,r),0,TAU);}
function sf(c,fill,lw){c.fillStyle=fill;c.fill();c.lineWidth=lw||3.5;c.strokeStyle=INK;c.lineJoin=c.lineCap='round';c.stroke();}
function rr(c,x,y,w,h,r){
r=Math.max(0,Math.min(r,w/2,h/2));
c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();
}
function poly(c,pts){c.beginPath();for(var i=0;i<pts.length;i+=2)c[i?'lineTo':'moveTo'](pts[i],pts[i+1]);c.closePath();}
function fnt(c,sz){c.font='700 '+sz+'px Fredoka,sans-serif';c.textAlign='center';c.textBaseline='middle';}

var STR=[],CLD=[];
for(var si=0;si<90;si++)STR.push([hsh(si*3+1),hsh(si*3+2),hsh(si*3+3)]);
for(var ci=0;ci<18;ci++)CLD.push([hsh(ci+40)*2600,14+ci*12+hsh(ci+70)*8,0.65+hsh(ci+90)*0.6]);

var vw={k:PPM,ox:0,oy:0,minX:0,maxX:0},txB=new Float32Array(180),tyB=new Float32Array(180);
function sx(x){return vw.ox+x*vw.k;}
function sy(y){return vw.oy - y*vw.k;}
function gAng(v){return ADDR+0.14+clp(v,0,1)*3.08;}

function ballArt(c,id,cx,cy,r){
var g=c.createRadialGradient(cx - r*0.3,cy - r*0.32,r*0.12,cx,cy,r);
var st=id==='gold'?['#fff7b2','#ffd000','#d48806']:id==='fire'?['#fff59d','#ff6d00','#bf1616']:id==='dino'?['#a7ff83','#2ecc71','#146b3a']:id==='cyber'?['#6272a4','#282a36','#141622']:['#fff','#eef4ff','#b8c4e0'];
g.addColorStop(0,st[0]);g.addColorStop(0.6,st[1]);g.addColorStop(1,st[2]);
circ(c,cx,cy,r);c.fillStyle=g;c.fill();
c.save();circ(c,cx,cy,r - 1.5);c.clip();
if(id==='rocket'){
c.fillStyle='#ff3d57';c.fillRect(cx - r,cy - r,r*2,r*0.52);c.fillRect(cx - r,cy+r*0.42,r*2,r*0.26);
circ(c,cx,cy+1,r*0.28);sf(c,'#29b6f6',2.5);
}else if(id==='fire'){
c.fillStyle='#ffd600';c.beginPath();c.moveTo(cx - r,cy+r*0.2);c.quadraticCurveTo(cx - r*0.3,cy - r*0.6,cx,cy+r*0.15);c.quadraticCurveTo(cx+r*0.4,cy - r*0.7,cx+r,cy+r*0.3);c.lineTo(cx+r,cy+r);c.lineTo(cx - r,cy+r);c.closePath();c.fill();
}else if(id==='dino'){
poly(c,[cx - r,cy - r*0.35,cx - r*0.3,cy - r*0.05,cx+r*0.15,cy - r*0.5,cx+r,cy - r*0.2,cx+r,cy - r,cx - r,cy - r]);c.fillStyle='#0f522d';c.fill();
circ(c,cx+r*0.22,cy - r*0.05,r*0.28);sf(c,'#ffd600',2);
}else if(id==='cyber'){
c.strokeStyle='#00e5ff';c.lineWidth=3.5;c.beginPath();c.moveTo(cx - r,cy);c.lineTo(cx+r,cy);c.stroke();
circ(c,cx+r*0.15,cy,r*0.32);c.fillStyle='#00e5ff';c.fill();circ(c,cx+r*0.15,cy,r*0.15);c.fillStyle='#fff';c.fill();
}else if(id==='gold'){
c.beginPath();for(var k=0;k<10;k++){var a=-Math.PI/2+k*Math.PI/5,R=k % 2?r*0.22:r*0.52;c[k?'lineTo':'moveTo'](cx+Math.cos(a)*R,cy+Math.sin(a)*R);}
c.closePath();c.fillStyle='#fff59d';c.fill();
}else{
c.fillStyle='rgba(130,155,195,.45)';
var pts=[-0.25,-0.35,0.22,-0.38,0.42,0.02,0.1,0.38,-0.34,0.22];
for(var d=0;d<pts.length;d+=2){circ(c,cx+pts[d]*r,cy+pts[d+1]*r,r*0.13);c.fill();}
}
c.fillStyle='rgba(255,255,255,.65)';c.beginPath();c.ellipse(cx - r*0.32,cy - r*0.34,r*0.28,r*0.16,-0.6,0,TAU);c.fill();
c.restore();circ(c,cx,cy,r);c.lineWidth=4;c.strokeStyle=INK;c.stroke();
}

function spr(kind){
var A=window.Kit&&window.Kit.art;
if(!A)return null;
var mk=function(k,w,h,fn,p){return A.sprite(k,w,h,fn,{pad:p||6});};
if(kind.indexOf('ball:')===0){var id=TRL[kind.slice(5)]?kind.slice(5):'classic';return mk('ball:'+id,56,56,function(c){ballArt(c,id,28,28,23);});}
if(kind==='tnt')return mk('obj:tnt',68,68,function(c){
rr(c,8,12,52,50,9);sf(c,'#e53935',4);rr(c,8,26,52,20,4);sf(c,'#fff3cd',3.5);
fnt(c,16);c.fillStyle=INK;c.fillText('TNT',34,37);
c.strokeStyle=INK;c.lineWidth=3.5;c.beginPath();c.moveTo(34,12);c.quadraticCurveTo(40,2,48,5);c.stroke();circ(c,49,5,5);c.fillStyle='#ffd600';c.fill();
});
if(kind==='cannon')return mk('obj:cannon',88,74,function(c){
c.save();c.translate(42,42);c.rotate(-0.66);rr(c,-26,-16,58,32,12);sf(c,'#37474f',4);rr(c,22,-19,12,38,5);sf(c,'#ffd000',3.5);c.restore();
rr(c,16,48,44,18,7);sf(c,'#8d5524',4);circ(c,28,58,11);sf(c,'#ffb300',4);circ(c,50,58,11);sf(c,'#ffb300',4);
});
if(kind==='ring')return mk('obj:ring',52,100,function(c){
c.beginPath();c.ellipse(26,50,17,44,0,0,TAU);c.lineWidth=14;c.strokeStyle=INK;c.stroke();c.lineWidth=8;c.strokeStyle='#00e5ff';c.stroke();
c.beginPath();c.ellipse(26,50,17,44,0,-1.1,1.1);c.lineWidth=5;c.strokeStyle='#ffd000';c.stroke();
});
if(kind.indexOf('ufo:')===0){
var u=+kind.slice(4)||0,bc=['#ab47bc','#26c6da','#ff7043'][u % 3],lc=['#76ff03','#ffd600','#00e5ff'][u % 3];
return mk('obj:'+kind,78,54,function(c){
c.beginPath();c.arc(39,25,17,Math.PI,TAU);c.closePath();sf(c,'#b3e5fc',3.5);circ(c,39,20,6);c.fillStyle='#69f0ae';c.fill();
c.beginPath();c.ellipse(39,29,34,12,0,0,TAU);sf(c,bc,4);
for(var lx=-18;lx<=18;lx+=18){circ(c,39+lx,30,4.2);sf(c,lc,2.5);}
});
}
if(kind==='pad')return mk('obj:pad',98,38,function(c){
c.strokeStyle='#cfd8dc';c.lineWidth=5;c.beginPath();c.moveTo(26,30);c.lineTo(38,16);c.lineTo(60,30);c.lineTo(72,16);c.stroke();
rr(c,12,26,74,9,4);sf(c,'#455a64',3.5);rr(c,8,8,82,14,7);sf(c,'#00e676',4);
});
if(kind==='coin')return mk('obj:coin',34,34,function(c){circ(c,17,17,13);sf(c,'#ffd000',3.5);circ(c,17,17,7.5);c.lineWidth=2.5;c.strokeStyle='#e69500';c.stroke();},4);
if(kind==='gem')return mk('obj:gem',42,42,function(c){poly(c,[21,4,37,17,29,37,13,37,5,17]);sf(c,'#e040fb',3.5);poly(c,[21,9,31,18,21,31,11,18]);c.fillStyle='#f3b8ff';c.fill();},4);
if(kind==='hero')return mk('hero:mech',90,112,function(c){
rr(c,12,44,22,34,7);sf(c,'#ff5252',4);rr(c,28,82,16,22,6);sf(c,'#283593',4);rr(c,50,82,16,22,6);sf(c,'#283593',4);
rr(c,25,96,23,11,5);sf(c,'#fff',3.5);rr(c,48,96,23,11,5);sf(c,'#fff',3.5);
rr(c,26,42,40,44,13);sf(c,'#00b0ff',4);c.fillStyle='#ffd000';c.fillRect(29,64,34,8);
circ(c,47,25,20);sf(c,'#fff',4);c.beginPath();c.arc(47,24,20,Math.PI*1.05,Math.PI*1.95);c.closePath();sf(c,'#ff3d57',3.5);
rr(c,42,17,24,13,6);sf(c,'#18ffff',3.5);
});
if(kind==='club')return mk('hero:club',96,42,function(c){rr(c,6,17,68,7,3.5);sf(c,'#eceff1',3);rr(c,66,6,24,28,7);sf(c,'#ffd000',3.5);});
if(kind.indexOf('prop:')===0){
var t=kind.slice(5);
return mk(kind,96,116,function(c){
if(t==='tree'){rr(c,40,62,16,48,5);sf(c,'#8d5524',4);circ(c,48,44,34);sf(c,'#38c759',4);}
else if(t==='cactus'){rr(c,38,22,20,88,10);sf(c,'#2ecc71',4);rr(c,16,46,16,32,8);sf(c,'#2ecc71',4);rr(c,64,36,16,32,8);sf(c,'#2ecc71',4);}
else if(t==='pine'){rr(c,41,82,14,28,4);sf(c,'#6d4c41',4);for(var lv=0;lv<3;lv++){var y0=14+lv*22,w=24+lv*9;poly(c,[48,y0,48+w,y0+34,48 - w,y0+34]);sf(c,lv?'#26a69a':'#fff',4);}}
else if(t==='spire'){poly(c,[48,10,78,108,18,108]);sf(c,'#4a2538',4);poly(c,[48,22,58,98,40,98]);c.fillStyle='#ff6d00';c.fill();}
else{poly(c,[48,12,76,56,66,108,30,108,20,56]);sf(c,'#b388ff',4);}
});
}
return null;
}

function planet(c,x,y,r,al){
c.save();c.globalAlpha=al;
c.beginPath();c.ellipse(x,y,r*1.85,r*0.44,-0.24,Math.PI,TAU);c.lineWidth=9;c.strokeStyle='#ffd9a0';c.stroke();
circ(c,x,y,r);sf(c,'#ff8f4d',4);
c.beginPath();c.ellipse(x,y,r*1.85,r*0.44,-0.24,0,Math.PI);c.lineWidth=9;c.strokeStyle='#ffd9a0';c.stroke();
c.restore();
}

function ridge(c,off,base,amp,wl,kind,col){
if(base - amp*1.2>H)return;
c.beginPath();c.moveTo(-16,H+16);
for(var x=-16;x<=W+24;x+=24){
var u=(x+off)/wl,sh=kind===2?0.85*(1 - 2*Math.abs((u/2.2)- Math.floor(u/2.2)- 0.5))*2 - 0.85:kind===1?clp(1.6*Math.sin(u*0.8)+0.25*Math.sin(u*2.6),-1,0.62):0.6*Math.sin(u)+0.3*Math.sin(u*2.2+1.5);
c.lineTo(x,base - amp*sh);
}
c.lineTo(W+24,H+16);c.closePath();c.fillStyle=col;c.fill();
}

function flag(c,wx,wy,col,txt){
var x=sx(wx),y=sy(wy);
if(x<-120||x>W+120)return;
c.strokeStyle=INK;c.lineWidth=4;c.beginPath();c.moveTo(x,y);c.lineTo(x,y - 54);c.stroke();
rr(c,x - 56,y - 78,112,26,8);sf(c,col,3);fnt(c,13);c.fillStyle=INK;c.fillText(txt,x,y - 65);
}

function draw(c,s){
var th=TH[clp(s.world | 0,0,TH.length - 1)],A=window.Kit&&window.Kit.art,red=s.reduced,i,o;
c.save();
vw.k=PPM*s.cam.zoom;vw.ox=W/2 - s.cam.x*vw.k;vw.oy=H/2+s.cam.y*vw.k;
vw.minX=-vw.ox/vw.k;vw.maxX=(W - vw.ox)/vw.k;

var alt=s.world===4?1:clp((s.cam.y - 30)/(P.SPACE - 40),0,1);
if(A&&alt===0){var sk=A.sky('w'+s.world,32,256,th[0]);if(sk&&sk.canvas)c.drawImage(sk.canvas,0,0,W,H);}
else{
var g=c.createLinearGradient(0,0,0,H);
g.addColorStop(0,mix(th[0][0],'#07051c',s.world===4?0:alt));
g.addColorStop(1,mix(th[0][1],'#22155c',s.world===4?0:Math.min(1,alt*1.2)));
c.fillStyle=g;c.fillRect(0,0,W,H);
}
var stA=s.world===4?1:clp((alt - 0.2)/0.5,0,1),tm=red?0:s.time;
if(stA>0){
c.fillStyle='#fff9db';
for(i=0;i<STR.length;i++){
var st=STR[i],x=((st[0]*1500 - s.cam.x*0.6)% 1500+1500)% 1500 - 110,y=((st[1]*840+s.cam.y*1.1)% 840+840)% 840 - 60;
c.globalAlpha=stA*(0.45+0.55*Math.abs(Math.sin(tm*(0.7+st[2])+i)));
var sz=st[2]>0.88?3:1.6;c.fillRect(x,y,sz,sz);
}
c.globalAlpha=1;
}
var syB=128+(s.cam.y - 4)*0.85,sxB=s.phase==='title'?540:1070;
if(syB<H+100){
if(th[8]===4)planet(c,1020,145+(s.cam.y - 4)*0.35,52,1);
else if(1 - alt*1.6>0.02){
c.save();c.globalAlpha=clp(1 - alt*1.6,0,1);
var rad=th[8]===1?64:46;
circ(c,sxB,syB,rad*1.38);c.fillStyle='rgba(255,235,140,.32)';c.fill();
circ(c,sxB,syB,rad);c.fillStyle=th[8]===3?'#ff9100':th[8]===2?'#fffde7':'#ffd600';c.fill();
c.restore();
}
}
if(alt>0.35&&s.world!==4)planet(c,310,150+(1 - alt)*260,48,clp((alt - 0.35)/0.3,0,1));
if(!red&&(s.shake.x||s.shake.y))c.translate(s.shake.x,s.shake.y);

var lift=(s.cam.y - 4)*PPM,cxP=s.cam.x*PPM;
ridge(c,cxP*0.06,460+lift*0.12,115,250,th[4],th[1]);
ridge(c,cxP*0.16+280,520+lift*0.25,68,155,th[4],th[2]);
if(s.world!==4){
c.fillStyle=s.world===3?'rgba(255,180,150,.32)':'rgba(255,255,255,.82)';
for(i=0;i<CLD.length;i++){
var cl=CLD[i],cy=H/2 -(cl[1]- s.cam.y)*PPM*0.45,cx=((cl[0]- cxP*0.28+tm*7)% 2600+2600)% 2600 - 240;
if(cy<-60||cy>H+50||cx<-200||cx>W+200)continue;
c.beginPath();c.arc(cx - 36*cl[2],cy+6,22*cl[2],0,TAU);c.arc(cx,cy - 6,30*cl[2],0,TAU);c.arc(cx+38*cl[2],cy+6,22*cl[2],0,TAU);c.fill();
}
}
ridge(c,cxP*0.35+820,578+lift*0.42,40,185,0,th[3]);
var spY=sy(P.SPACE);
if(spY>-40&&spY<H+40){
c.save();c.setLineDash([14,10]);c.lineWidth=3;c.strokeStyle='#ffd000';c.beginPath();c.moveTo(0,spY);c.lineTo(W,spY);c.stroke();
c.font='700 20px Fredoka,sans-serif';c.fillStyle='#ffd000';c.fillText('★ حافة الفضاء 250 م',28,spY - 10);c.restore();
}

var feat=P.features(s.course,vw.minX - 8,vw.maxX+8),n=0,sc=vw.k/PPM;
for(var x0=-12;x0<=W+16&&n<180;x0+=8){txB[n]=x0;tyB[n]=sy(P.heightAt(s.course,vw.minX+(x0/W)*(vw.maxX - vw.minX)));n++;}
c.beginPath();c.moveTo(txB[0],H+20);for(i=0;i<n;i++)c.lineTo(txB[i],tyB[i]);c.lineTo(txB[n - 1],H+20);c.closePath();c.fillStyle=th[5];c.fill();
var cr=Math.max(8,Math.min(22,vw.k*0.65));
c.beginPath();for(i=0;i<n;i++)c[i?'lineTo':'moveTo'](txB[i],tyB[i]);c.lineWidth=cr;c.strokeStyle=th[6];c.lineCap=c.lineJoin='round';c.stroke();
c.beginPath();for(i=0;i<n;i++)c[i?'lineTo':'moveTo'](txB[i],tyB[i]- cr*0.36);c.lineWidth=4;c.strokeStyle=INK;c.stroke();

var padS=spr('pad');
for(i=0;i<feat.flats.length;i++){
var f=feat.flats[i];
if(f.type==='crater')continue;
var fx0=sx(f.x - f.hw),fx1=sx(f.x+f.hw),fy=sy(f.level),fw=fx1 - fx0;
if(fx1<-60||fx0>W+60)continue;
if(f.type==='water'){rr(c,fx0,fy - 4,fw,26,8);sf(c,th[7],3.5);}
else if(f.type==='sand'){rr(c,fx0,fy - 6,fw,16,8);sf(c,'#ffe082',3);}
else if(f.type==='ice'){rr(c,fx0,fy - 6,fw,14,7);sf(c,'#80deea',3);}
else if(f.type==='green'){
rr(c,fx0,fy - 6,fw,14,7);sf(c,'#76ff03',3);var hx=sx(f.holeX);c.fillStyle=INK;c.fillRect(hx - 8,fy - 5,16,8);
c.strokeStyle='#fff';c.lineWidth=3;c.beginPath();c.moveTo(hx,fy - 4);c.lineTo(hx,fy - 48);c.stroke();poly(c,[hx,fy - 48,hx+22,fy - 39,hx,fy - 30]);sf(c,'#ff3d57',2.5);
}else if(f.type==='pad'&&A&&padS){
var pl=s.padPulse&&Math.abs(s.padPulse.x - f.x)<1?1+0.25*Math.sin(s.padPulse.t*20):1;
A.blit(c,padS,sx(f.x),fy - 7.4*sc,{sx:sc*0.92,sy:sc*0.92*pl});
}
}
var tx=sx(0),ty=sy(P.heightAt(s.course,0));
if(tx>-80&&tx<W+80){rr(c,tx - 38,ty - 6,76,14,6);sf(c,'#00e676',3.5);}
if(s.bestX>5)flag(c,s.bestX,P.heightAt(s.course,s.bestX),'#ffd000','أفضل: '+Math.floor(s.bestX)+'م');
if(s.unlockX>5)flag(c,s.unlockX,P.heightAt(s.course,s.unlockX),'#b388ff','وسام '+s.unlockName);

var b=s.ball,used=b?b.used:{},got=b?b.got:{};
if(A){
for(i=0;i<feat.props.length;i++){
o=feat.props[i];var px=sx(o.x);if(px<-100||px>W+100)continue;
var ps=sc*(o.r/2.1);A.blit(c,spr('prop:'+o.type),px,sy(o.ground+o.lift*0.72),{sx:ps,sy:ps,rot:s.propHit&&s.propHit.id===o.id?Math.sin(s.propHit.t*28)*0.16:0});
}
var tntS=spr('tnt'),canS=spr('cannon'),ringS=spr('ring'),coinS=spr('coin'),gemS=spr('gem');
for(i=0;i<feat.tnts.length;i++){o=feat.tnts[i];if(!used['t'+o.id]&&Math.abs(sx(o.x)- W/2)<W/2+80)A.blit(c,tntS,sx(o.x),sy(o.y),{sx:sc*1.05,sy:sc*1.05});}
for(i=0;i<feat.cannons.length;i++){o=feat.cannons[i];if(!used['c'+o.id]&&Math.abs(sx(o.x)- W/2)<W/2+90)A.blit(c,canS,sx(o.x),sy(o.y),{sx:sc*1.08,sy:sc*1.08});}
for(i=0;i<feat.rings.length;i++){
o=feat.rings[i];if(used['r'+o.id])continue;
var rx=sx(o.x),ry=sy(o.y);if(rx<-80||rx>W+80||ry<-100||ry>H+100)continue;
var rp=sc*1.35*(1+(red?0:0.06*Math.sin(tm*5+i)));A.blit(c,ringS,rx,ry,{sx:rp,sy:rp});
}
for(i=0;i<feat.ufos.length;i++){
o=feat.ufos[i];if(used['u'+o.id])continue;
var ux=sx(o.x),uy=sy(o.y+(red?0:Math.sin(tm*3.2+o.id)*0.55));
if(ux<-90||ux>W+90||uy<-80||uy>H+80)continue;
A.blit(c,spr('ufo:'+(o.kind % 3)),ux,uy,{sx:sc*1.15,sy:sc*1.15,rot:red?0:Math.sin(tm*2.5+i)*0.08});
}
for(i=0;i<feat.coins.length;i++){
o=feat.coins[i];if(got[o.id])continue;
var kx=sx(o.x),ky=sy(o.y);if(kx<-40||kx>W+40||ky<-40||ky>H+40)continue;
A.blit(c,o.gem?gemS:coinS,kx,ky,{sx:sc*(red?1:0.72+0.28*Math.cos(tm*4.5+o.x*0.3)),sy:sc});
}
}

var gx=sx(-1.5),gy=ty -(s.golfer.jump||0);
if(gx>-180&&gx<W+180){
if(s.gauge&&s.gauge.show){
var gcx=gx+34*sc,gcy=gy - 44*sc,R=68*sc,a0=Math.PI*0.78,spn=Math.PI*1.38;
c.save();c.lineCap='round';c.beginPath();c.arc(gcx,gcy,R,a0,a0+spn);c.lineWidth=22*sc;c.strokeStyle=INK;c.stroke();
var bs=[[0,0.45,'#4fc3f7'],[0.45,0.72,'#69f0ae'],[0.72,s.gauge.perfect,'#ff9100'],[s.gauge.perfect,1,'#ffd000']];
for(i=0;i<4;i++){c.beginPath();c.arc(gcx,gcy,R,a0+spn*bs[i][0],a0+spn*bs[i][1]);c.lineWidth=13*sc;c.strokeStyle=bs[i][2];c.stroke();}
var na=a0+spn*clp(s.gauge.value,0,1);
circ(c,gcx+Math.cos(na)*R,gcy+Math.sin(na)*R,10*sc);sf(c,s.gauge.value>=s.gauge.perfect?'#fff59d':'#fff',3.5);c.restore();
}
if(A){
A.blit(c,spr('hero'),gx,gy - 48*sc,{sx:sc,sy:sc});
var clb=spr('club');c.save();c.translate(gx+10*sc,gy - 54*sc);c.rotate(s.golfer.angle - 0.25);
if(clb&&clb.canvas)c.drawImage(clb.canvas,-8*sc,-20*sc,92*sc,40*sc);c.restore();
if(!b&&(s.phase==='title'||s.phase==='ready'||s.phase==='swing')){
var bSc=Math.max(0.45,(vw.k*1.1)/23);A.blit(c,spr('ball:'+s.skin),tx,sy(P.heightAt(s.course,0)+0.55),{sx:bSc,sy:bSc});
}
}
}

if(s.trail.length>1&&!red){
c.save();c.lineCap='round';
for(i=1;i<s.trail.length;i++){
var tk=i/s.trail.length;c.beginPath();c.moveTo(sx(s.trail[i - 1].x),sy(s.trail[i - 1].y));c.lineTo(sx(s.trail[i].x),sy(s.trail[i].y));
c.globalAlpha=tk*0.58;c.lineWidth=Math.max(2,vw.k*0.9*tk);c.strokeStyle=s.flame>0?'#ff9100':(TRL[s.skin]||'#fff');c.stroke();
}
c.restore();
}

if(s.reticle){
var rrx=sx(s.reticle.x),rry=sy(s.reticle.y),gold=P.perfectTiming(s.reticle.t,s.course)||(b&&b.armed);
var radR=(16+clp(s.reticle.t/0.6,0,1)*44)*Math.max(0.7,s.cam.zoom);
c.save();c.beginPath();c.ellipse(rrx,rry,radR,radR*0.42,0,0,TAU);c.lineWidth=gold?6:4;c.strokeStyle=gold?'#ffd000':'#fff';c.stroke();
circ(c,rrx,rry,7);sf(c,gold?'#ffd000':'#00e5ff',3);
if(s.hints){
var cue=gold?'اضغط الآن!':'استعد للقفزة';
fnt(c,20);c.lineWidth=5;c.strokeStyle=INK;c.strokeText(cue,rrx,rry - 26);c.fillStyle=gold?'#ffd000':'#fff';c.fillText(cue,rrx,rry - 26);
}
c.restore();
}

if(b){
var bx=sx(b.x),by=sy(b.y),bR=Math.max(9,b.r*vw.k);
if(s.magnet>1.5&&!b.done){circ(c,bx,by,Math.min(95,s.magnet*vw.k*0.55));c.strokeStyle='rgba(255,214,0,.22)';c.lineWidth=2.5;c.stroke();}
if(s.flame>0&&!red){
c.save();c.translate(bx,by);c.rotate(-Math.atan2(b.vy,b.vx));
poly(c,[-bR*0.6,-bR*0.75,-bR*(2.6+s.flame*2.2),0,-bR*0.6,bR*0.75]);c.fillStyle='#ff6d00';c.fill();
poly(c,[-bR*0.5,-bR*0.42,-bR*1.8,0,-bR*0.5,bR*0.42]);c.fillStyle='#fff59d';c.fill();c.restore();
}
var sq=s.squash&&s.squash.t<0.22&&!red?Math.sin((1 - s.squash.t/0.22)*Math.PI)*0.28:0,bScale=bR/23;
if(A)A.blit(c,spr('ball:'+s.skin),bx,by,{sx:bScale*(1+sq),sy:bScale*(1 - sq*0.75),rot:red?0:b.x*0.9});
}

for(i=0;i<s.particles.length;i++){
var p=s.particles[i],lk=clp(1 - p.t/p.life,0,1),ppx=sx(p.x),ppy=sy(p.y);
c.save();c.globalAlpha=lk;
if(p.kind==='ring'){circ(c,ppx,ppy,p.size*(1.15 - lk*0.85));c.lineWidth=5*lk+1;c.strokeStyle=p.color;c.stroke();}
else{c.translate(ppx,ppy);c.rotate(p.rot);var psz=p.size*(lk*0.9+0.2);c.fillStyle=p.color;c.fillRect(-psz/2,-psz/2,psz,psz*0.72);}
c.restore();
}
for(i=0;i<s.popups.length;i++){
var pop=s.popups[i],ux2=pop.screen?pop.x:sx(pop.x),uy2=(pop.screen?pop.y:sy(pop.y))-(red?0:pop.t*36);
c.save();c.globalAlpha=pop.t<0.7?1:clp((1 - pop.t)/0.3,0,1);
fnt(c,Math.round(pop.size));c.lineWidth=6;c.strokeStyle=INK;c.lineJoin='round';c.strokeText(pop.text,ux2,uy2);c.fillStyle=pop.color;c.fillText(pop.text,ux2,uy2);c.restore();
}
if(s.flash>0&&!red){c.fillStyle='rgba(255,255,255,'+Math.min(0.45,s.flash)+')';c.fillRect(-20,-20,W+40,H+40);}
c.restore();
}

function preview(pctx,id,sz){pctx.clearRect(0,0,sz,sz);ballArt(pctx,id,sz/2,sz/2,sz*0.41);}
window.GolfArt={draw:draw,preview:preview,gaugeAngle:gAng,ADDRESS:ADDR,PPM:PPM};
})();
