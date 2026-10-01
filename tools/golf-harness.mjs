// Test-only observation of the real game. No production debug globals.
export function installGolfHarness({ manual = true } = {}) {
  let kit, art;
  window.golfProbe = { draws: 0, saves: 0, ready: 0 };
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function(k,v) {
    if (k.includes('skybound-golf')) golfProbe.saves++;
    return setItem.call(this,k,v);
  };
  Object.defineProperty(window,'Kit',{configurable:true,get:()=>kit,set(value){
    kit=value;
    const loop=kit.loop;
    kit.loop=(update,render,options)=>{
      window.golfTick=update; window.golfRender=render;
      render(); golfProbe.ready=performance.now();
      if(!manual) return loop(update,render,options);
      return {stop(){},running:true};
    };
  }});
  Object.defineProperty(window,'GolfArt',{configurable:true,get:()=>art,set(value){
    art=value; const draw=art.draw;
    art.draw=(ctx,state)=>{ window.golfState=state; golfProbe.draws++; return draw(ctx,state); };
  }});
  window.advanceGolfFrames=(n)=>{for(let i=0;i<n;i++) golfTick(1/60); golfRender();};
}
