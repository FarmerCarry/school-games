(function(){
'use strict';
var K=window.Kit,P=window.GolfPhysics,A=window.GolfArt,J=K.juice,W=1280,H=720;
function el(id){return document.getElementById(id);}
function on(n,ev,fn,cap){n.addEventListener(ev,fn,!!cap);}
function ltr(v){return '\u2066'+v+'\u2069';}
function clp(v,a,b){return v<a?a:v>b?b:v;}

var cv=el('game'),ui=el('ui'),dirty=true;
if(K.art)K.art.init({canvas:cv,mode:'2d',theme:'day'});
var ctx=K.fit(cv,W,H,{maxDpr:1.5,onResize:function(v){
ui.style.left=Math.round((window.innerWidth - W*v.scale)/2)+'px';
ui.style.top=Math.round((window.innerHeight - H*v.scale)/2)+'px';
ui.style.transform='scale('+v.scale+')';dirty=true;
}}).ctx;

var hud=el('hud'),rktsEl=el('rockets'),hintEl=el('hint'),pauseBtn=el('pause'),toastEl=el('toast');
var titleEl=el('title-screen'),modalEl=el('modal'),panelEl=el('panel'),closeBtn=el('close-modal'),hdEl=el('modal-heading');
var resEl=el('result-content'),unlkEl=el('result-unlock'),shopEl=el('shop-content'),upsEl=el('upgrades');
var skWrap=el('skins-content'),skEl=el('skins'),wldsEl=el('worlds-content'),pauseEl=el('pause-content');
var againBtn=el('again'),menuBtn=el('menu'),tipEl=el('modal-tip');

ui.appendChild(K.muteButton());
var store=K.store('skybound-golf'),save=P.sanitizeSave(store.get('progress'));
var dda=K.dda?K.dda('skybound-golf',{id:'swing',target:0.68,tiers:3,start:0.5}):null;
var badge=K.saveStatus({retry:persist});
function persist(){if(store.set('progress',save))badge.saved();else badge.failed();}

var UP_META={
power:['قوة الضربة','إطلاق أسرع وأبعد','<path d="M8 28L26 10l4 4L12 32z" fill="#ffd000" stroke-width="3"/><circle cx="29" cy="11" r="5" fill="#ff3d57" stroke-width="2.5"/>'],
bounce:['ارتداد ناري','قفزات أعلى على الأرض','<path d="M6 28q8-18 14 0t14-14" fill="none" style="stroke:#00e676" stroke-width="4"/><circle cx="34" cy="12" r="4.5" fill="#ffd000" stroke-width="2.5"/>'],
rockets:['صواريخ إضافية','دفعات أكثر في الجو','<path d="M20 5c7 6 8 15 5 22H15c-3-7-2-16 5-22z" fill="#ff3d57" stroke-width="3"/><path d="M16 27l4 8 4-8z" fill="#ffd000" stroke-width="0"/>'],
magnet:['مغناطيس الذهب','يجذب العملات إليك','<path d="M11 10v10a9 9 0 0018 0V10h-5v10a4 4 0 01-8 0V10z" fill="#ff3d57" stroke-width="2.8"/>'],
thrust:['وقود التيربو','دفعة صاروخ أقوى','<path d="M20 6l9 15h-6l3 13-15-17h7z" fill="#ffd000" stroke-width="2.8"/>'],
aim:['نطاق ذهبي','منطقة ذهبية أوسع','<circle cx="20" cy="20" r="13" fill="none" style="stroke:#ffd000" stroke-width="4"/><circle cx="20" cy="20" r="5" fill="#ff3d57" stroke-width="0"/>'],
skip:['تزلج خارق','يتخطى الماء والرمال','<path d="M5 26q7-6 15 0t15 0" fill="none" style="stroke:#00e5ff" stroke-width="4"/><circle cx="20" cy="14" r="5" fill="#fff" stroke-width="2.8"/>'],
treasure:['صندوق الكنز','+10% عملات إضافية','<rect x="7" y="14" width="26" height="18" rx="4" fill="#ffb300" stroke-width="3"/><path d="M7 21h26" stroke-width="3"/>']
};
var W_STYLE=[
['linear-gradient(#2b95f0,#9be7ff)','#4ad153','<circle cx="36" cy="34" r="18" fill="#ffd000" stroke-width="3.5"/><path d="M20 52l16-22 16 22z" fill="#ff3d57" stroke-width="3"/>'],
['linear-gradient(#ff7b42,#ffe5a3)','#f2b252','<circle cx="36" cy="32" r="20" fill="#ffd600" stroke-width="3.5"/>'],
['linear-gradient(#4b9aff,#e8f5ff)','#fff','<polygon points="36,12 58,54 14,54" fill="#fff" stroke-width="3.5"/>'],
['linear-gradient(#2d113b,#e04f2e)','#633744','<polygon points="36,14 58,56 14,56" fill="#4a2538" stroke-width="3.5"/><polygon points="36,22 44,50 28,50" fill="#ff6d00" stroke-width="0"/>'],
['linear-gradient(#090724,#281b66)','#a39cd6','<ellipse cx="36" cy="36" rx="28" ry="8" fill="none" style="stroke:#ffd9a0" stroke-width="4"/><circle cx="36" cy="36" r="15" fill="#ff8f4d" stroke-width="3.5"/>']
];
var RKT_SVG='<svg viewBox="0 0 36 40" aria-hidden="true"><path d="M18 3c8 7 9 18 6 26H12C9 21 10 10 18 3z" fill="#ff3d57" stroke-width="3.2"/><circle cx="18" cy="17" r="4" fill="#00e5ff" stroke-width="2.4"/><path d="M13 29l5 9 5-9z" fill="#ffd000" stroke-width="0"/></svg>';

function tone(f,to,d,tp,v,dl){K.audio.tone({freq:f,to:to,dur:d||0.1,type:tp||'triangle',vol:v||0.2,delay:dl||0});}
var sfx={
hit:function(g){if(g==='perfect'){K.sfx.hit();tone(520,1040,0.16,'triangle',0.26);tone(780,1560,0.2,'sine',0.2,0.05);}else if(g==='great'){K.sfx.hit();tone(420,760,0.13);}else tone(260,140,0.1);},
rocket:function(){K.audio.noise({dur:0.24,vol:0.32,filter:1600,to:280});tone(240,680,0.2,'sawtooth',0.18);if(J)J.whoosh(0.9);},
tnt:function(){K.sfx.boom();tone(140,520,0.22,'sawtooth',0.24);if(J)J.impact(1);},
cannon:function(){K.sfx.hit();tone(190,880,0.22,'square',0.22);if(J)J.impact(0.85);},
ufo:function(){tone(620,1380,0.12,'sine',0.24);if(J)J.pop(0.9);},
ring:function(){tone(587,1175,0.14);if(J)J.chime(2);},
superHit:function(c){if(J)J.streak(c||1);else tone(520,960,0.15);},
bounce:function(st){if(J)J.land(st);else tone(150+st*90,80,0.07);},
buy:function(){if(J)J.select();else tone(523,988,0.12);},
empty:function(){if(J)J.error();else tone(170,110,0.08,'square',0.14);}
};

var mKind='',resKinds=[],guard={x:-999,y:-999,until:0},heldKey='';
var gaugeT=0,swingT=0,swPwr=0,landedT=0,hitStop=0,toastT=0;
function nextUnlock(best){for(var i=1;i<P.worlds.length;i++)if(best<P.worlds[i].unlock)return i;return -1;}

var s={
phase:'title',world:save.world,skin:save.skin,reduced:K.motion.reduced(),
course:P.createCourse(save.world,save.difficulty),time:0,cam:{x:10,y:4.5,zoom:1},
golfer:{angle:A.ADDRESS,jump:0,jumpT:0},gauge:{show:false,value:0,perfect:0.9},
ball:null,trail:[],particles:[],popups:[],shake:{x:0,y:0,p:0},flash:0,
reticle:null,flame:0,hints:save.tips<2,magnet:P.magnetOf(save.upgrades),
bestX:0,unlockX:0,unlockName:'',unlockedIndex:-1,prevBest:save.best,
committed:false,lastOutcome:-1,squash:null,padPulse:null,propHit:null
};

function worldId(){return P.worlds[s.world].id;}
function pBand(){var b=P.perfectBand(save.upgrades,save.difficulty);return(save.difficulty==='easy'&&dda)?clp(b -(1 - dda.level)*0.05,0.72,0.92):b;}
function gPeriod(){var p=P.diffOf(save.difficulty).gaugePeriod;return(save.difficulty==='easy'&&dda)?p*dda.value(1.14,0.96):p;}

function syncCourse(){
s.world=save.world;s.skin=save.skin;s.course=P.createCourse(save.world,save.difficulty);
s.magnet=P.magnetOf(save.upgrades);s.hints=save.tips<2;s.bestX=save.bests[worldId()]||0;
var nu=nextUnlock(save.best);
s.unlockX=nu>0?P.worlds[nu].unlock:0;s.unlockName=nu>0?P.worlds[nu].name:'';dirty=true;
}
K.motion.onChange(function(m){
s.reduced=typeof m==='boolean'?m:!!(m&&m.reduced);
if(s.reduced){s.shake.x=s.shake.y=s.shake.p=s.flash=s.golfer.jump=s.golfer.jumpT=hitStop=0;s.trail.length=s.particles.length=0;s.squash=null;}
dirty=true;
});

function armG(e){if(e&&typeof e.clientX==='number'&&(e.clientX||e.clientY)){guard.x=e.clientX;guard.y=e.clientY;guard.until=performance.now()+420;}}
function isG(e){return e&&performance.now()<guard.until&&Math.hypot(e.clientX - guard.x,e.clientY - guard.y)<18;}
function shake(p){if(!s.reduced)s.shake.p=Math.max(s.shake.p,p);}
function flash(v){if(!s.reduced)s.flash=Math.max(s.flash,v);}
function popup(txt,x,y,col,sz){s.popups.push({text:txt,x:x,y:y,color:col||'#ffd000',size:sz||28,t:0});if(s.popups.length>16)s.popups.shift();dirty=true;}
function burst(x,y,col,cnt,kind,sz){
if(s.reduced)return;
if(kind==='ring'){s.particles.push({x:x,y:y,vx:0,vy:0,rot:0,t:0,life:0.35,size:sz||44,color:col,kind:'ring'});return;}
for(var i=0;i<cnt;i++){
var a=(i/cnt)*Math.PI*2+(i % 3)*0.2,sp=4+(i % 5)*2.6;
s.particles.push({x:x,y:y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp+3,rot:a,t:0,life:0.42+(i % 3)*0.12,size:sz||9,color:col,kind:kind||'spark'});
}
if(s.particles.length>90)s.particles.splice(0,s.particles.length - 90);
}
function toast(msg){toastEl.textContent=el('announce').textContent=msg;toastEl.hidden=false;toastT=2.6;}

function syncTitle(){
el('coins').textContent=K.fmt(save.coins);el('best-meters').textContent=K.fmt(save.best);el('world-label').textContent=P.worlds[save.world].name;
var btns=el('difficulty-bar').querySelectorAll('[data-difficulty]');
for(var i=0;i<btns.length;i++)btns[i].setAttribute('aria-pressed',String(btns[i].getAttribute('data-difficulty')===save.difficulty));
var nu=nextUnlock(save.best);
el('journey').textContent=nu>0?'الوسام القادم: '+P.worlds[nu].name+' عند '+P.worlds[nu].unlock+' م (جميع العوالم مفتوحة!)':'بطل المجرة! حطّمت جميع أوسمة المسافة!';
}

function syncHud(){
var b=s.ball,pct=(clp((b?b.y:0)/P.SPACE,0,1)*100).toFixed(1)+'%';
el('meters').textContent=String(b?Math.floor(b.maxX):0);
el('run-coins').textContent=String(b?(b.coins+b.gems*5+b.rings*3+b.ufos*3+b.tnts*4+b.cannons*5):0);
el('alt-meters').textContent=String(b?Math.max(0,Math.floor(b.y)):0);
el('alt-fill').style.height=el('alt-ball').style.bottom=pct;
el('altimeter').classList.toggle('space',!!(b&&b.space));
el('hud-diff').textContent=P.diffOf(save.difficulty).label;
var tot=b?b.rockets:P.rocketsOf(save.upgrades),left=b?b.rocketsLeft:tot;
rktsEl.setAttribute('aria-label','الصواريخ: '+left+' من '+tot);
if(rktsEl.childElementCount!==tot)rktsEl.innerHTML=new Array(tot+1).join(RKT_SVG);
for(var j=0;j<rktsEl.children.length;j++)rktsEl.children[j].classList.toggle('spent',j>=left);
if(s.phase==='ready'){hintEl.hidden=false;hintEl.className='hint pulse';hintEl.textContent='اضغط في النطاق الذهبي لإطلاق الكرة الصاروخية!';}
else if(s.phase==='flight'&&b&&s.hints){
hintEl.hidden=false;hintEl.className=s.reticle?'hint pulse':'hint';
hintEl.textContent=b.rocketsLeft>0?(s.reticle?'اضغط الآن لقفزة خارقة!':'في الهواء: صاروخ · قرب الأرض: قفزة خارقة'):'اضغط قرب الأرض لقفزة خارقة!';
}else if(s.phase==='landed'){hintEl.hidden=false;hintEl.className='hint';hintEl.textContent='مسافة أو نقرة لعرض النتيجة';}
else hintEl.hidden=true;
}

function setPhase(ph){s.phase=ph;ui.dataset.phase=ph==='swing'?'flight':ph;titleEl.hidden=ph!=='title';hud.hidden=pauseBtn.hidden=(ph==='title'||ph==='result');dirty=true;}
function closeModal(){
mKind='';
if(document.activeElement&&modalEl.contains(document.activeElement))document.activeElement.blur();
modalEl.hidden=resEl.hidden=shopEl.hidden=wldsEl.hidden=pauseEl.hidden=againBtn.hidden=true;
panelEl.classList.remove('result-panel','celebrate');dirty=true;
}
function focusRes(fb){var ub=!unlkEl.hidden&&unlkEl.querySelector('button');if(ub)ub.focus();else if(fb&&!fb.disabled)fb.focus();else againBtn.focus();}

function drawUps(kinds){
el('shop-coins').textContent=K.fmt(save.coins);
var cur=upsEl.querySelectorAll('[data-upgrade]'),same=cur.length===kinds.length,i;
for(i=0;same&&i<kinds.length;i++)if(cur[i].getAttribute('data-upgrade')!==kinds[i])same=false;
if(!same){
upsEl.innerHTML='';
for(i=0;i<kinds.length;i++){
var btn=document.createElement('button');
btn.type='button';btn.className='upgrade';btn.setAttribute('data-upgrade',kinds[i]);
on(btn,'keydown',function(e){if(e.repeat&&(e.code==='Enter'||e.code==='Space'))e.preventDefault();});
on(btn,'click',buyUp);upsEl.appendChild(btn);
}
cur=upsEl.querySelectorAll('[data-upgrade]');
}
for(i=0;i<kinds.length;i++){
var k=kinds[i],m=UP_META[k],sp=P.upgrades[k],lv=save.upgrades[k]||0,c=P.cost(k,lv),mx=lv>=sp.max,can=!mx&&save.coins>=c,b=cur[i],pips='';
b.disabled=mx||!can;b.classList.toggle('maxed',mx);b.classList.toggle('can',can);
for(var p=0;p<sp.max;p++)pips+='<i class="'+(p<lv?'on':'')+'"></i>';
b.innerHTML='<span class="upgrade-icon" aria-hidden="true"><svg viewBox="0 0 40 40">'+m[2]+'</svg></span><strong>'+m[0]+'</strong><span class="explain">'+m[1]+'</span><span class="pips" aria-hidden="true">'+pips+'</span><span class="price">'+(mx?'مكتمل!':'<i class="coin-ico" aria-hidden="true"></i><span>'+K.fmt(c)+'</span>')+'</span>';
}
}

function buyUp(e){
var btn=e.currentTarget,k=btn.getAttribute('data-upgrade'),lv=save.upgrades[k]||0,c=P.cost(k,lv);
if(lv>=P.upgrades[k].max||save.coins<c)return;
save.coins-=c;save.upgrades[k]=lv+1;s.magnet=P.magnetOf(save.upgrades);s.gauge.perfect=pBand();
persist();sfx.buy();syncTitle();drawUps(mKind==='result'?resKinds:P.kinds);
if(mKind==='shop')drawSkins();
if(mKind==='result'){if(e.detail===0)focusRes(btn);else btn.blur();}
else if(e.detail===0&&btn.disabled)closeBtn.focus();
dirty=true;
}

function drawSkins(){
skEl.innerHTML='';
P.skins.forEach(function(sk){
var owned=save.skins.indexOf(sk.id)>=0,act=save.skin===sk.id,b=document.createElement('button');
b.type='button';b.className='skin';b.disabled=!(owned||save.coins>=sk.price);b.setAttribute('aria-pressed',String(act));
var scv=document.createElement('canvas');scv.width=scv.height=48;A.preview(scv.getContext('2d'),sk.id,48);b.appendChild(scv);
b.insertAdjacentHTML('beforeend','<strong>'+sk.name+'</strong><span>'+(act?'مختارة':owned?'اختر':K.fmt(sk.price))+'</span>');
on(b,'click',function(){
if(!owned){if(save.coins<sk.price)return;save.coins-=sk.price;save.skins.push(sk.id);}
save.skin=s.skin=sk.id;persist();sfx.buy();syncTitle();drawUps(P.kinds);drawSkins();dirty=true;
});
skEl.appendChild(b);
});
}

function showModal(kind,title,tip,els){
closeModal();mKind=kind;modalEl.hidden=closeBtn.hidden=menuBtn.hidden=false;
hdEl.textContent=title;tipEl.textContent=tip;
for(var i=0;i<els.length;i++)els[i].hidden=false;
}

function openShop(e){armG(e);showModal('shop','متجر الصواريخ','طوّر مضربك وصواريخك لتحطيم الأرقام القياسية!',[shopEl,skWrap]);drawUps(P.kinds);drawSkins();}

function openWorlds(e){
armG(e);showModal('worlds','اختر عالم الإطلاق','جميع العوالم مفتوحة للعب فوراً — اختر عالمك المفضل!',[wldsEl]);wldsEl.innerHTML='';
P.worlds.forEach(function(w,idx){
var ws=W_STYLE[idx],b=document.createElement('button'),wBest=save.bests[w.id]||0;
b.type='button';b.className='world-option'+(save.world===idx?' selected':'');
b.style.setProperty('--sky',ws[0]);b.style.setProperty('--ground',ws[1]);
var bdg=(!w.unlock||save.best>=w.unlock)?'أفضل: '+wBest+' م':'وسام: '+w.unlock+' م';
b.innerHTML='<svg class="world-icon" viewBox="0 0 72 72" aria-hidden="true">'+ws[2]+'</svg><strong>'+w.name+'</strong><span>'+bdg+'</span>';
on(b,'click',function(ev){if(isG(ev))return;save.world=idx;persist();K.sfx.click();syncCourse();syncTitle();armG(ev);closeModal();});
wldsEl.appendChild(b);
});
}

function resetScene(){
s.ball=s.reticle=null;s.flame=s.golfer.jump=s.golfer.jumpT=toastT=0;
s.trail.length=s.particles.length=s.popups.length=0;
s.golfer.angle=A.ADDRESS;s.cam.x=s.phase==='title'?10:9;s.cam.y=4.5;s.cam.zoom=1;toastEl.hidden=true;
}

function goTitle(e){
if(s.phase==='flight'&&!s.committed&&s.ball&&s.ball.maxX>0)commitShot();
armG(e);closeModal();syncCourse();setPhase('title');s.gauge.show=false;resetScene();syncTitle();
}

function startReady(e){
if(s.phase==='flight'&&!s.committed&&s.ball&&s.ball.maxX>0)commitShot();
armG(e);closeModal();
if(save.difficulty==='easy'&&dda&&s.lastOutcome>=0){dda.result(s.lastOutcome);s.lastOutcome=-1;}
syncCourse();s.prevBest=save.best;s.unlockedIndex=-1;s.committed=false;
gaugeT=swingT=landedT=hitStop=0;
s.gauge.show=true;s.gauge.value=0;s.gauge.perfect=pBand();
setPhase('ready');resetScene();syncHud();cv.focus({preventScroll:true});
if(K.track&&K.track.tier)K.track.tier(save.difficulty==='easy'?0:save.difficulty==='hero'?2:1,'difficulty',true);
Kit.stats.round(worldId());
}

function strike(){if(s.phase!=='ready')return;swPwr=s.gauge.value;swingT=0;s.gauge.show=false;setPhase('swing');K.sfx.whoosh();}

function launchBall(pwr){
var b=P.launch(s.course,save.upgrades,pwr);
if(save.difficulty==='easy'){
var bst=dda?dda.value(1.06,0.99):1.03;
if(b.power>=pBand()&&!b.perfect){b.perfect=true;b.grade='perfect';b.vx*=1.1;b.vy*=1.1;}
b.vx*=bst;b.vy*=bst;
}
s.ball=b;setPhase('flight');sfx.hit(b.grade);
if(b.perfect){
if(K.track&&K.track.hit)K.track.hit();
popup('ضربة ذهبية!',0,b.y+2.4,'#ffd000',34);shake(9);flash(0.28);burst(0,b.y,'#ffd000',16,'spark',11);
if(!s.reduced){hitStop=0.016;s.golfer.jumpT=0.34;}
}else if(b.grade==='great'){popup('رائعة!',0,b.y+2.2,'#69f0ae',28);shake(4);burst(0,b.y,'#69f0ae',10,'spark',9);}
else if(K.track&&K.track.miss)K.track.miss();
syncHud();
}

function flightPress(slamOnly){
if(s.phase!=='flight'||!s.ball)return;
var r=P.press(s.course,s.ball,save.upgrades,!!slamOnly);
if(r.type==='rocket'){s.flame=0.42;sfx.rocket();shake(6);burst(r.x,r.y,'#ff9100',14,'flame',10);popup('تيربو صاروخي!',r.x,r.y+2,'#ff9100',26);syncHud();}
else if(r.type==='arm'){tone(520,740,0.06,'sine',0.14);syncHud();}
else if(r.type==='late'){sfx.superHit(1);popup('دفعة أرضية!',r.x,r.y+1.8,'#69f0ae',24);syncHud();}
else if(r.type==='empty'){sfx.empty();rktsEl.classList.remove('empty');void rktsEl.offsetWidth;rktsEl.classList.add('empty');}
dirty=true;
}

var EV_FX={
tnt:['tnt',14,0.32,'#ff3d57',20,'flame','انفجار ديناميت!','#ff5252',32,0],
cannon:['cannon',12,0.24,'#ffd000',16,'flame','مدفع خارق!','#ffd000',32,0.36],
ufo:['ufo',7,0,'#76ff03',14,'spark','تحطيم مركبة!','#76ff03',28,0],
ring:['ring',0,0,'#00e5ff',1,'ring','حلقة تيربو!','#00e5ff',28,0.3],
pad:[0,0,0,'#00e676',10,'spark','منصة قفز!','#00e676',26,0],
skip:[0,0,0,'#4fc3f7',8,'spark','تزلج مائي!','#4fc3f7',25,0]
};

function handleEvents(evs){
var b=s.ball;
for(var i=0;i<evs.length;i++){
var ev=evs[i],t=ev.type,fx=EV_FX[t];
if(fx){
if(fx[0])sfx[fx[0]]();else if(t==='pad'){K.sfx.jump();s.padPulse={x:ev.x,t:0};}else K.sfx.pop();
if(fx[1])shake(fx[1]);
if(fx[2])flash(fx[2]);
if(fx[9])s.flame=Math.max(s.flame,fx[9]);
burst(ev.x,ev.y,fx[3],fx[4],fx[5],fx[5]==='ring'?56:11);
if(t==='tnt')burst(ev.x,ev.y,'#ffd000',1,'ring',68);
popup(fx[6],ev.x,ev.y+2.2,fx[7],fx[8]);
}else if(t==='coin'){K.sfx.coin();if(ev.gem)popup('+5 جوهرة!',ev.x,ev.y+1.2,'#ea80fc',24);burst(ev.x,ev.y,ev.gem?'#ea80fc':'#ffd000',6,'spark',7);}
else if(t==='super'){
sfx.superHit(ev.combo||1);shake(ev.quality==='perfect'?9:5);s.squash={t:0};burst(ev.x,ev.y,'#ffd000',14,'spark',9);
if(ev.quality==='perfect'){if(save.tips<2){save.tips++;s.hints=save.tips<2;}popup(ev.combo>1?'قفزة خارقة! '+ltr('×'+ev.combo):'قفزة خارقة!',ev.x,ev.y+2.2,'#ffd000',31);}
else popup('قفزة قوية!',ev.x,ev.y+1.8,'#69f0ae',25);
}else if(t==='bounce'){sfx.bounce(ev.strength||0.3);s.squash={t:0};if((ev.strength||0)>0.25)burst(ev.x,ev.y,'#fff',5,'dust',8);}
else if(t==='prop'){K.sfx.pop();s.propHit={id:ev.id,t:0};}
else if(t==='splash'){tone(220,70,0.2,'sine',0.24);burst(ev.x,ev.y,'#29b6f6',14,'spark',9);}
else if(t==='hole'){K.sfx.win();burst(ev.x,ev.y,'#ffd000',22,'spark',11);toast(ev.ace?'حفرة من ضربة واحدة!':'في الحفرة!');}
else if(t==='space'){K.sfx.power();toast('وصلت إلى حافة الفضاء!');}
}
if(b&&s.unlockX>0&&s.unlockedIndex<0&&b.maxX>=s.unlockX){
var idx=nextUnlock(s.prevBest);
if(idx>0&&b.maxX>=P.worlds[idx].unlock){s.unlockedIndex=idx;K.sfx.power();toast('فتحت '+P.worlds[idx].name+'!');}
}
}

function commitShot(){
if(s.committed||!s.ball)return;
s.committed=true;
var b=s.ball,dist=Math.floor(clp(b.maxX,0,20000)),parts=P.reward(b),wid=worldId();
save.coins=Math.min(9999999,save.coins+parts.total);save.shots++;
save.bests[wid]=Math.max(save.bests[wid]||0,dist);save.best=Math.max(save.best,dist);save.high=Math.max(save.high||0,Math.floor(b.maxY));
if(b.hole)save.holes++;
if(b.space)save.spaces++;
if(s.unlockedIndex<0)for(var w=P.worlds.length - 1;w>=1;w--)if(s.prevBest<P.worlds[w].unlock&&save.best>=P.worlds[w].unlock){s.unlockedIndex=w;break;}
s.lastOutcome=(b.perfect||b.supers>0||dist>=110)?1:0;
persist();
Kit.stats.end('end',dist);
}

function openResult(){
if(s.phase==='result'||!s.ball)return;
commitShot();setPhase('result');
var b=s.ball,dist=Math.floor(b.maxX),parts=P.reward(b),rec=dist>s.prevBest&&s.prevBest>0;
var title=b.ace?'حفرة من ضربة واحدة!':b.hole?'في الحفرة!':b.space?'إلى الفضاء!':(rec||s.unlockedIndex>0)?'رقم قياسي جديد!':b.reason==='water'?'سبلاش!':'رحلة رائعة!';
showModal('result',title,'اضغط مسافة أو R لضربة جديدة',[resEl,shopEl,againBtn]);
skWrap.hidden=closeBtn.hidden=true;panelEl.classList.add('result-panel');
if(rec||b.hole||b.space||s.unlockedIndex>0)panelEl.classList.add('celebrate');

var notes=[];
[['tnts','ديناميت '],['cannons','مدافع '],['ufos','مركبات '],['supers','قفزات خارقة ']].forEach(function(pr){if(b[pr[0]])notes.push(pr[1]+ltr('×'+b[pr[0]]));});
el('result-note').textContent=notes.length?notes.join(' · '):'أعلى ارتفاع: '+Math.floor(b.maxY)+' م';
el('result-meters').textContent=K.fmt(dist);

var ch='<span class="chip total"><i class="coin-ico" aria-hidden="true"></i><b>+'+K.fmt(parts.total)+'</b></span><span class="chip">المسافة '+K.fmt(parts.distance)+'</span>';
[['coins','الغنائم '],['bonus','مكافأة '],['hero','تحدي البطل '],['treasure','الكنز ']].forEach(function(pr){if(parts[pr[0]])ch+='<span class="chip">'+pr[1]+K.fmt(parts[pr[0]])+'</span>';});
el('result-coins').innerHTML=ch;

if(s.unlockedIndex>0){
var uw=P.worlds[s.unlockedIndex],goBtn=document.createElement('button');
unlkEl.hidden=false;unlkEl.innerHTML='<span>وسام جديد: '+uw.name+'!</span>';
goBtn.type='button';goBtn.className='button primary';goBtn.textContent='انطلق إلى '+uw.name;
on(goBtn,'keydown',function(e){if(e.repeat&&(e.code==='Enter'||e.code==='Space'))e.preventDefault();});
on(goBtn,'click',function(ev){save.world=s.unlockedIndex;persist();startReady(ev);});
unlkEl.appendChild(goBtn);againBtn.className='button secondary';
}else{unlkEl.hidden=true;unlkEl.innerHTML='';againBtn.className='button primary';}

resKinds=P.kinds.filter(function(k){return(save.upgrades[k]||0)<P.upgrades[k].max;})
.sort(function(a,k2){return(P.cost(a,save.upgrades[a]||0)- P.cost(k2,save.upgrades[k2]||0))||(P.kinds.indexOf(a)- P.kinds.indexOf(k2));})
.slice(0,4).sort(function(a,k2){return P.kinds.indexOf(a)- P.kinds.indexOf(k2);});
drawUps(resKinds);focusRes(null);
}

function pause(focusResume){
if(s.phase==='title'||s.phase==='result'||mKind==='pause')return;
showModal('pause','إيقاف مؤقت','اضغط P أو Esc للمتابعة',[pauseEl]);
if(focusResume)el('resume').focus();
dirty=true;
}
function resumePlay(e){if(mKind!=='pause')return;armG(e);closeModal();cv.focus({preventScroll:true});}
K.lifecycle({pause:function(){pause(false);}});

function tickFx(dt){
var act=false,i;
if(s.shake.p>0&&!s.reduced){s.shake.p=Math.max(0,s.shake.p - dt*38);s.shake.x=Math.sin(s.time*67)*s.shake.p;s.shake.y=Math.cos(s.time*53)*s.shake.p;act=true;}else s.shake.x=s.shake.y=0;
if(s.flash>0){s.flash=Math.max(0,s.flash - dt*2.4);act=true;}
if(s.flame>0){s.flame=Math.max(0,s.flame - dt);act=true;}
if(s.golfer.jumpT>0&&!s.reduced){s.golfer.jumpT=Math.max(0,s.golfer.jumpT - dt);s.golfer.jump=Math.sin((s.golfer.jumpT/0.34)*Math.PI)*18;act=true;}else s.golfer.jump=0;
if(s.squash&&(s.squash.t+=dt)>=0.22)s.squash=null;else if(s.squash)act=true;
if(s.padPulse&&(s.padPulse.t+=dt)>=0.4)s.padPulse=null;else if(s.padPulse)act=true;
if(s.propHit&&(s.propHit.t+=dt)>=0.35)s.propHit=null;else if(s.propHit)act=true;
for(i=s.particles.length - 1;i>=0;i--){var p=s.particles[i];p.t+=dt;if(p.t>=p.life)s.particles.splice(i,1);else{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy-=18*dt;act=true;}}
for(i=s.popups.length - 1;i>=0;i--){if((s.popups[i].t+=dt*1.1)>=1)s.popups.splice(i,1);else act=true;}
if(toastT>0&&(toastT-=dt)<=0)toastEl.hidden=true;
return act;
}

function update(dt){
if(!modalEl.hidden)return;
s.time+=dt;
var fx=tickFx(dt);
if(s.phase==='title'){if(!s.reduced||fx)dirty=true;return;}
if(s.phase==='ready'){
var hp=gPeriod()*0.5,cyc=((gaugeT+=dt)/hp)% 2;
s.gauge.value=cyc<=1?cyc:2 - cyc;s.gauge.perfect=pBand();s.golfer.angle=A.gaugeAngle(s.gauge.value);dirty=true;return;
}
if(s.phase==='swing'){
var k=clp((swingT+=dt)/0.08,0,1);
s.golfer.angle=A.gaugeAngle(swPwr)*(1 - k)+(A.ADDRESS - 1.15)*k;
dirty=true;if(swingT>=0.08)launchBall(swPwr);return;
}
if(s.phase==='flight'&&s.ball){
dirty=true;
if(hitStop>0&&!s.reduced){hitStop=Math.max(0,hitStop - dt);return;}
var b=s.ball,evs=P.step(s.course,b,save.upgrades,P.pace(b)*dt);
if(!s.reduced){s.trail.push({x:b.x,y:b.y});if(s.trail.length>26)s.trail.shift();}else s.trail.length=0;
var hadR=!!s.reticle;
s.reticle=(!b.done&&b.mode==='air'&&b.vy<0)?P.predictImpact(s.course,b,s.course.diff.armWindow):null;
if(!hadR&&s.reticle&&K.track&&K.track.cue)K.track.cue();
handleEvents(evs);
var tz=clp(1.04 - Math.hypot(b.vx,b.vy)*0.008 - Math.max(0,b.y - 12)*0.005,0.46,1);
s.cam.zoom+=(tz - s.cam.zoom)*Math.min(1,dt*5);
s.cam.x=b.x+clp(b.vx*0.22,2,11);
s.cam.y=Math.max(P.heightAt(s.course,b.x)+4.2/s.cam.zoom,b.y+b.vy*0.08+1.5);
syncHud();
if(b.done){s.reticle=null;landedT=0;commitShot();setPhase('landed');syncHud();}
return;
}
if(s.phase==='landed'){
landedT+=dt;s.cam.zoom+=(0.95 - s.cam.zoom)*Math.min(1,dt*4);
if(s.ball)s.cam.x+=(s.ball.x+2 - s.cam.x)*Math.min(1,dt*4);
dirty=true;if(landedT>=1.35)openResult();
}
}

on(el('play'),'click',startReady);
on(el('open-shop'),'click',openShop);
on(el('open-worlds'),'click',openWorlds);
on(pauseBtn,'click',function(){pause(true);});
on(el('resume'),'click',resumePlay);
on(el('restart'),'click',startReady);
on(againBtn,'click',startReady);
on(menuBtn,'click',goTitle);
on(closeBtn,'click',function(e){if(mKind==='pause')resumePlay(e);else{armG(e);closeModal();}});
on(el('difficulty-bar'),'click',function(e){
var btn=e.target.closest('[data-difficulty]');
if(!btn)return;
var d=btn.getAttribute('data-difficulty');
if(P.diffIds.indexOf(d)>=0){save.difficulty=d;persist();K.sfx.click();syncCourse();syncTitle();}
});
on(cv,'pointerdown',function(e){
if((e.button&&e.button!==0)||!modalEl.hidden||isG(e))return;
if(s.phase==='ready')strike();else if(s.phase==='flight')flightPress(false);else if(s.phase==='landed')openResult();
});

on(modalEl,'keydown',function(e){if((e.code==='Space'||e.code==='Enter')&&(e.repeat||heldKey===e.code)){e.preventDefault();e.stopPropagation();}},true);
on(window,'keyup',function(e){if(heldKey&&e.code===heldKey){heldKey='';if(!modalEl.hidden){e.preventDefault();e.stopPropagation();}}},true);
on(window,'blur',function(){heldKey='';});

on(window,'keydown',function(e){
if(e.isComposing||e.ctrlKey||e.altKey||e.metaKey)return;
var tag=e.target&&e.target.tagName;
if(!e.repeat&&mKind==='pause'&&(e.code==='Escape'||e.code==='KeyP')&&tag!=='INPUT'&&tag!=='TEXTAREA'&&tag!=='SELECT'){e.preventDefault();resumePlay();return;}
if(!e.repeat&&mKind==='result'&&e.code==='KeyR'&&(!K.keys.isNativeTarget(e.target)||tag==='BUTTON')){e.preventDefault();startReady();return;}
if(!K.isGameKeyEvent(e)||e.repeat)return;
if(e.code==='Escape'){
if(mKind==='shop'||mKind==='worlds'){var wk=mKind;e.preventDefault();closeModal();el(wk==='shop'?'open-shop':'open-worlds').focus();}
else if(mKind==='pause'){e.preventDefault();resumePlay();}
else if(s.phase!=='title'&&s.phase!=='result'){e.preventDefault();pause(true);}
return;
}
if(e.code==='KeyP'&&modalEl.hidden&&s.phase!=='title'&&s.phase!=='result'){e.preventDefault();pause(true);return;}
if(mKind==='result'&&(e.code==='Space'||e.code==='Enter')){
e.preventDefault();var ub=!unlkEl.hidden&&unlkEl.querySelector('button');if(ub)ub.click();else startReady();return;
}
if(!modalEl.hidden)return;
if(e.code==='Space'||e.code==='Enter'){
e.preventDefault();
if(s.phase==='title')startReady();else if(s.phase==='ready')strike();
else if(s.phase==='flight')flightPress(false);else if(s.phase==='landed'){heldKey=e.code;openResult();}
return;
}
if((e.code==='ArrowDown'||e.code==='KeyS')&&s.phase==='flight'){e.preventDefault();flightPress(true);}
});

syncCourse();setPhase('title');syncTitle();
K.loop(update,function(){if(!dirty)return;dirty=false;A.draw(ctx,s);},{hz:60});
K.ready();
})();
