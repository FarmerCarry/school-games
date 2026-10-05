/* Arabic arcade golf. UI and simulation share a fixed logical 1280 × 720 view.
 * No requests or module loader: this also runs directly from a downloaded folder.
 */
(function () {
  'use strict';
  var P = window.GolfPhysics, A = window.GolfArt, K = window.Kit;
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('game'), ui = $('ui');
  var view = K.fit(canvas, 1280, 720, { maxDpr: 1.5 });
  var ctx = view.ctx, storage = K.store('skybound-golf');
  var save = P.sanitizeSave(storage.get('progress', {}));
  var reducedMotion = K.motion.reduced();
  K.motion.onChange(function (reduced) { reducedMotion = reduced; });
  var s = { world:save.world, course:P.createCourse(save.world), phase:'title', time:0,
    cam:{x:-45,y:0,zoom:1}, ball:null, trail:[], particles:[], shotAge:0,
    quality:0, best:save.best, putt:null };
  var modalMode = '', paused = false, meterTime = 0, meter = 0, toastTime = 0;
  var finishDelay = -1, resultCommitted = false, speed = 1, uiClock = 0;
  var lastFocus = null, lastDistance = -1, lastAriaValue = -1;
  var mute = K.muteButton(); ui.appendChild(mute);
  var upgradeNames = { power:'قوة الضربة', bounce:'الارتداد', glide:'الانسياب' };
  var upgradeExplain = { power:'انطلق بقوة أكبر', bounce:'اقفز لمسافة أبعد', glide:'مقاومة هواء أقل' };
  var icons = {
    power:'<path d="M20 2 8 18h10l-4 13 15-19H18z" fill="#ef7753" stroke="#ab5030" stroke-width="2" stroke-linejoin="round"/>',
    bounce:'<path d="M4 27Q10 1 17 20Q22 7 29 24" fill="none" stroke="#56a773" stroke-width="4" stroke-linecap="round"/><circle cx="28" cy="24" r="4" fill="#ffe56a" stroke="#44885a" stroke-width="2"/>',
    glide:'<path d="M4 11h18q8 0 5-6M3 17h20q9 0 5 7M8 24h9" fill="none" stroke="#419eab" stroke-width="4" stroke-linecap="round"/>'
  };

  function resize() {
    var scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    ui.style.left = Math.round((window.innerWidth - 1280 * scale) / 2) + 'px';
    ui.style.top = Math.round((window.innerHeight - 720 * scale) / 2) + 'px';
    ui.style.transform = 'scale(' + scale + ')';
  }
  window.addEventListener('resize', resize); resize();
  function persist() { storage.set('progress', save); }
  function announce(text) { $('announce').textContent = text; }
  function button(id, fn) {
    $(id).addEventListener('click', function () { K.audio.unlock(); K.sfx.click(); this.blur(); fn(); });
  }
  function stats() {
    $('coins').textContent = K.fmt(save.coins);
    $('best-meters').textContent = K.fmt(save.best);
    $('world-label').textContent = P.worlds[save.world].name;
    var next = P.worlds.filter(function(w) { return w.unlock > save.best; })[0];
    $('journey').textContent = next ? next.name + ' تنتظرك عند ' + next.unlock + ' متر' : 'وصلت إلى القمر… حطّم رقمك القياسي!';
    s.best = save.best;
  }
  function toast(text, duration) {
    $('toast').textContent = text; $('toast').hidden = false; toastTime = duration || 1.5;
    announce(text);
  }
  function resetScene() {
    s.world = save.world; s.course = P.createCourse(save.world);
    s.cam = {x:-45,y:0,zoom:1}; s.ball = {x:0,y:P.heightAt(s.course,0)+.7,r:.7,vx:0,vy:0,maxX:0};
    s.trail = []; s.particles = []; s.putt = null; s.shotAge = 10; s.quality = 0;
    resultCommitted = false; finishDelay = -1; speed = 1; lastDistance = -1;
    toastTime = 0; $('toast').hidden = true;
  }
  function controls() {
    var playing = s.phase !== 'title' && s.phase !== 'result';
    $('title-screen').hidden = s.phase !== 'title' || !!modalMode;
    $('pause').hidden = !playing;
    $('distance').hidden = s.phase === 'title' || s.phase === 'result';
    $('swing-controls').hidden = !(s.phase === 'ready' || s.phase === 'putting') || !!modalMode;
    $('flight-hint').hidden = s.phase !== 'flight' || !!modalMode || finishDelay >= 0;
    $('flight-hint').textContent = speed === 1 ? 'سرّع الرحلة · مسافة' : 'عودة للسرعة العادية · مسافة';
    $('hit').textContent = s.phase === 'putting' ? 'سدّد' : 'اضرب';
    $('meter-hint').textContent = s.phase === 'putting' ? 'أوقف المؤشر في المنطقة الخضراء' : 'انقر في المنتصف لضربة مثالية';
    $('meter-track').setAttribute('aria-label', s.phase === 'putting' ? 'قوة التسديد' : 'توقيت الضربة');
    var target = s.phase === 'putting' && s.putt ? s.putt.targetPower : .5;
    $('sweet-zone').style.left = ((target - .045) * 100) + '%';
    $('sweet-zone').style.width = '9%';
    $('meter-track').style.background = s.phase === 'putting' ? 'linear-gradient(90deg,#ffe47b,#ffb845 65%,#f46b50)' : '';
  }
  function closeModal() {
    modalMode = ''; $('modal').hidden = true; paused = false;
    controls();
    if (lastFocus && !lastFocus.hidden && lastFocus.offsetParent) lastFocus.focus({preventScroll:true});
    else canvas.focus({preventScroll:true});
  }
  function openModal(mode, focus) {
    if (!modalMode) lastFocus = document.activeElement;
    modalMode = mode; $('modal').hidden = false;
    $('panel').className = 'panel ' + mode + '-panel';
    $('result-content').hidden = mode !== 'result';
    $('worlds-content').hidden = mode !== 'worlds';
    $('upgrades-content').hidden = mode !== 'upgrades' && mode !== 'result';
    $('pause-content').hidden = mode !== 'pause';
    $('again').hidden = mode !== 'result';
    $('close-modal').hidden = mode === 'result';
    $('modal-heading').textContent = mode === 'worlds' ? 'اختر عالمك' : mode === 'upgrades' ? 'طوّر ضربتك' : mode === 'pause' ? 'استراحة قصيرة' : 'ضربة رائعة!';
    $('modal-tip').textContent = mode === 'result' ? 'مسافة أو Enter أو R لضربة أخرى' : mode === 'pause' ? 'P أو Esc للمتابعة' : 'عملاتك وتطويراتك محفوظة تلقائيًا';
    if (mode === 'result' || mode === 'upgrades') renderUpgrades();
    if (mode === 'worlds') renderWorlds();
    controls();
    if (focus !== false) (mode === 'result' ? $('again') : mode === 'pause' ? $('resume') : $('close-modal')).focus({preventScroll:true});
  }
  function menu() {
    s.phase = 'title'; closeModal(); resetScene(); stats(); controls();
    $('play').focus({preventScroll:true});
  }
  function start() {
    closeModal(); resetScene(); s.phase = 'ready'; meterTime = -.48; meter = .08;
    stats(); controls(); canvas.focus({preventScroll:true}); announce('أوقف المؤشر في المنتصف واضرب الكرة');
  }
  function pause(focus) {
    if (modalMode || s.phase === 'title' || s.phase === 'result') return;
    paused = true; openModal('pause', focus);
  }
  function togglePause() {
    if (modalMode === 'pause') closeModal();
    else pause();
  }
  function burst(x,y,color,count) {
    if (reducedMotion) count = Math.min(4, count);
    for (var i=0;i<count;i++) {
      var angle = Math.random()*Math.PI*2, velocity = 4+Math.random()*12;
      s.particles.push({x:x,y:y,vx:Math.cos(angle)*velocity,vy:Math.sin(angle)*velocity+8,
        life:.5+Math.random()*.4,max:.9,color:color,size:.35+Math.random()*.65});
    }
    if(s.particles.length>140) s.particles.splice(0,s.particles.length-140);
  }
  function strike() {
    if (modalMode || paused) return;
    if (s.phase === 'ready') {
      // The marked 9% central band is a forgiving perfect-shot window.
      s.quality = Math.abs(meter-.5) <= .045 ? 1 : Math.max(0,1-Math.abs(meter-.5)*2);
      s.ball = P.launch(s.course,save.upgrades,s.quality); s.phase = 'flight'; s.shotAge = 0;
      K.sfx.whoosh(); K.audio.tone({freq:240,to:90,type:'triangle',dur:.1,vol:.4});
      if(s.ball.perfect) { K.sfx.power(); toast('ضربة مثالية!',1.6); burst(0,2,'#ffe75c',24); }
      else toast(s.quality>.7 ? 'ضربة قوية!' : 'هيا… طر!',1.1);
      controls();
    } else if (s.phase === 'putting') {
      s.putt.power = Math.abs(meter-s.putt.targetPower)<=.045 ? s.putt.targetPower : meter;
      s.putt.v = s.putt.power * 1.8; s.putt.rolling = true;
      s.putt.elapsed = 0; s.phase = 'putt-roll'; s.shotAge = 0;
      K.audio.tone({freq:650,to:340,type:'triangle',dur:.09,vol:.25}); controls();
    }
  }
  function toggleSpeed() { if(s.phase==='flight' && !modalMode) { speed = speed===1 ? 3 : 1; controls(); } }
  function startPutting() {
    s.phase = 'putting'; speed = 1; finishDelay = -1; s.trail = []; s.particles = [];
    var target = .62 + ((Math.floor(s.ball.maxX) % 37) / 37) * .19;
    s.putt = {active:true,x:.12,target:target,power:0,rolling:false,v:0,elapsed:0,
      targetPower:Math.sqrt(2*1.6*(target-.12))/1.8};
    s.shotAge = 10; meterTime = -.5;
    toast('وصلت إلى منطقة الحفرة!',1.7); controls();
  }
  function finish(sunk,putted) {
    if(resultCommitted) return;
    resultCommitted = true; finishDelay = -1;
    var distance = Math.floor(s.ball.maxX), oldBest = save.best;
    var earned = P.reward(distance,sunk,s.ball.perfect);
    save.coins = Math.min(9999999,save.coins+earned);
    save.best = Math.max(save.best,distance); save.shots++; if(sunk) save.holes++;
    persist(); stats(); s.phase = 'result'; openModal('result');
    var record = distance > oldBest;
    $('modal-heading').textContent = sunk ? 'في الحفرة!' : record ? 'رقم قياسي جديد!' : 'رحلة جميلة!';
    $('result-note').textContent = sunk ? 'تسديدة ممتازة… مكافأة إضافية!' : putted ? 'قريبة جدًا! جرّب قوة مختلفة في المرة القادمة' : s.ball.surface==='sand' ? 'الرمال أوقفت الكرة… الضربة القادمة أبعد!' : 'طوّر ضربتك وانطلق أبعد';
    $('result-meters').textContent = K.fmt(distance);
    $('result-coins').textContent = '+ ' + K.fmt(earned) + ' عملة' + (sunk ? ' · مكافأة الحفرة' : '');
    var unlocked = P.worlds.filter(function(w) { return w.unlock>oldBest && w.unlock<=save.best; });
    $('result-unlock').hidden = !unlocked.length;
    $('result-unlock').textContent = 'عالم جديد: ' + unlocked.map(function(w){return w.name;}).join('، ') + ' — اختره من قائمة العوالم';
    if(record || sunk) K.sfx.win(); else K.sfx.coin();
    announce($('modal-heading').textContent + '، ' + distance + ' متر، ' + earned + ' عملة');
  }
  function renderUpgrades() {
    var focusKind = document.activeElement && document.activeElement.dataset.upgrade;
    var host = $('upgrades'); host.textContent = '';
    ['power','bounce','glide'].forEach(function(kind) {
      var level = save.upgrades[kind], price = P.cost(kind,level), maxed = level>=10;
      var b = document.createElement('button'); b.type='button'; b.className='upgrade'; b.dataset.upgrade=kind;
      b.disabled = maxed || save.coins<price;
      b.innerHTML='<span class="upgrade-icon" aria-hidden="true"><svg viewBox="0 0 34 34">'+icons[kind]+'</svg></span><strong>'+upgradeNames[kind]+'</strong><span class="level">المستوى <bdi dir="ltr">'+level+' / 10</bdi></span><span class="price">'+(maxed?'مكتمل':K.fmt(price)+' عملة')+'</span><span class="explain">'+upgradeExplain[kind]+'</span>';
      b.setAttribute('aria-label',upgradeNames[kind]+', المستوى '+level+(maxed?'، مكتمل':', تطوير مقابل '+price+' عملة'+(save.coins<price?'، العملات غير كافية':'')));
      b.addEventListener('click',function() {
        var currentPrice=P.cost(kind,save.upgrades[kind]);
        if(save.upgrades[kind]>=10 || save.coins<currentPrice) return;
        save.coins-=currentPrice; save.upgrades[kind]++; persist(); stats(); K.sfx.power();
        announce('تم تطوير '+upgradeNames[kind]+' إلى المستوى '+save.upgrades[kind]);
        renderUpgrades();
      });
      host.appendChild(b);
    });
    if(focusKind) {
      var replacement=host.querySelector('[data-upgrade="'+focusKind+'"]');
      if(replacement && !replacement.disabled) replacement.focus({preventScroll:true});
      else (modalMode==='result'?$('again'):$('close-modal')).focus({preventScroll:true});
    }
  }
  function renderWorlds() {
    var host=$('worlds-content'); host.textContent='';
    P.worlds.forEach(function(w,i) {
      var b=document.createElement('button'); b.type='button';
      b.className='world-option'+(i===save.world?' selected':''); b.disabled=save.best<w.unlock;
      b.innerHTML='<strong>'+w.name+'</strong><span>'+(b.disabled?'تفتح عند '+w.unlock+' متر':i===save.world?'العالم الحالي':'العب هنا')+'</span>';
      b.setAttribute('aria-pressed',i===save.world?'true':'false');
      b.addEventListener('click',function(){save.world=i;persist();menu();K.sfx.power();}); host.appendChild(b);
    });
  }
  function updatePutt(dt) {
    var p=s.putt, old=p.x; p.elapsed+=dt;
    var nextV=Math.max(0,p.v-1.6*dt); p.x+=(p.v+nextV)*.5*dt; p.v=nextV;
    var crossed=old<=p.target && p.x>=p.target;
    if((crossed || Math.abs(p.x-p.target)<.017) && p.v<.48) {
      p.x=p.target; p.v=0; p.sunk=true; p.rolling=false; finish(true,true); return;
    }
    if(p.v<=0 || p.x>1.03 || p.elapsed>3) { p.rolling=false; finish(false,true); }
  }
  function step(dt) {
    if(paused || document.hidden) return;
    s.time+=dt; s.shotAge+=dt;
    if(toastTime>0) {toastTime-=dt;if(toastTime<=0) $('toast').hidden=true;}
    if(!modalMode && (s.phase==='ready'||s.phase==='putting')) {
      meterTime+=dt; meter=(Math.sin(meterTime*3.6)+1)/2;
      $('needle').style.left=(meter*100)+'%';
      var aria=Math.round(meter*10)*10;
      if(aria!==lastAriaValue) {$('meter-track').setAttribute('aria-valuenow',aria);lastAriaValue=aria;}
    }
    if(s.phase==='flight' && !modalMode) {
      var events=[];
      for(var n=0;n<speed;n++) events=events.concat(P.step(s.course,s.ball,save.upgrades,dt));
      events.forEach(function(e) {
        if(e.type==='bounce') {K.sfx.land();burst(e.x,e.y,e.surface==='sand'?'#f3cf79':'#e4f37b',8);}
        if(e.type==='tree') {K.sfx.pop();burst(e.x,e.y,'#96d450',12);}
        if(e.type==='pad') {K.sfx.jump();burst(e.x,e.y,'#ffe76b',16);toast('قفزة إضافية!',.9);}
      });
      s.trail.push({x:s.ball.x,y:s.ball.y}); if(s.trail.length>42) s.trail.shift();
      var desiredZoom=Math.max(.32,Math.min(1,120/(110+Math.max(0,s.ball.y))));
      s.cam.zoom+=(desiredZoom-s.cam.zoom)*Math.min(1,dt*3.2);
      var targetX=Math.max(-45,s.ball.x-65/s.cam.zoom);
      var targetY=Math.max(0,s.ball.y-57/s.cam.zoom);
      s.cam.x+=(targetX-s.cam.x)*Math.min(1,dt*6);
      s.cam.y+=(targetY-s.cam.y)*Math.min(1,dt*4);
      if(s.ball.stopped && finishDelay<0) {finishDelay=.65;controls();}
      if(finishDelay>=0) {
        finishDelay-=dt;
        if(finishDelay<=0) { if(s.ball.surface==='green') startPutting(); else finish(false,false); }
      }
    }
    if(s.phase==='putt-roll' && !modalMode) updatePutt(dt);
    for(var i=s.particles.length-1;i>=0;i--) {
      var p=s.particles[i];p.life-=dt;
      if(p.life<=0){s.particles.splice(i,1);continue;}
      p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy-=30*dt;
    }
    uiClock+=dt;
    if(uiClock>.08) {
      uiClock=0;var d=s.ball?Math.floor(s.ball.maxX||0):0;
      if(d!==lastDistance){$('meters').textContent=K.fmt(d);lastDistance=d;}
    }
    K.keys.endFrame();
  }
  function render() {
    ctx.setTransform(view.scale*view.dpr,0,0,view.scale*view.dpr,0,0);
    A.draw(ctx,s);
  }

  button('play',start);button('hit',strike);button('pause',togglePause);button('resume',closeModal);
  button('restart',start);button('again',start);button('menu',menu);button('close-modal',closeModal);
  button('open-worlds',function(){openModal('worlds');});button('open-upgrades',function(){openModal('upgrades');});
  button('flight-hint',toggleSpeed);
  canvas.addEventListener('pointerdown',function(e){if(e.button===0)strike();});
  window.addEventListener('keydown',function(e) {
    if(e.repeat || e.isComposing || e.ctrlKey || e.altKey || e.metaKey) return;
    // The modal focuses a button when opened. Keep its advertised P/R shortcuts
    // without intercepting native Enter/Space activation or editable controls.
    var modalShortcut = ((modalMode==='pause' && e.code==='KeyP') || (modalMode==='result' && e.code==='KeyR')) &&
      !e.defaultPrevented && !e.target.isContentEditable && e.target.closest && e.target.closest('button');
    if(!K.isGameKeyEvent(e) && !modalShortcut) return;
    if(e.code==='Escape'||e.code==='KeyP') {
      e.preventDefault();
      if(modalMode==='upgrades'||modalMode==='worlds') closeModal();else togglePause();return;
    }
    if(e.code==='KeyR' && s.phase==='result') {e.preventDefault();start();return;}
    if(e.code==='Space'||e.code==='Enter') {
      e.preventDefault();
      if(modalMode==='result')start();
      else if(!modalMode) {
        if(s.phase==='title')start();else if(s.phase==='flight')toggleSpeed();else strike();
      }
    }
  });
  // Losing the frame must neither resume an existing pause nor pull focus back
  // from the portal into the newly displayed pause dialog.
  document.addEventListener('visibilitychange',function(){if(document.hidden)pause(false);});
  window.addEventListener('blur',function(){if(!document.hidden)pause(false);});
  resetScene(); stats(); controls(); K.loop(step,render);
  Kit.lifecycle({ pause: function () { pause(false); } });
  Kit.ready();
})();

