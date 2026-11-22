// Test-only observation of Skybound Golf (3D). Installs manual/auto loop hooks,
// WebGL render draw counter, and localStorage save counter.
export function installGolfHarness({ manual = true } = {}) {
  let kit, art;
  window.golfProbe = { draws: 0, saves: 0, ready: 0 };

  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    if (String(k).includes('skybound-golf:save_v3')) window.golfProbe.saves++;
    return setItem.call(this, k, v);
  };

  Object.defineProperty(window, 'Kit', {
    configurable: true,
    get: () => kit,
    set(value) {
      kit = value;
      const realLoop = kit.loop;
      kit.loop = (update, render, options) => {
        window.golfTick = update;
        window.golfRender = render;
        render();
        window.golfProbe.ready = performance.now();
        if (!manual) return realLoop(update, render, options);
        return { stop() {}, running: true };
      };
    }
  });

  Object.defineProperty(window, 'SkyboundArt', {
    configurable: true,
    get: () => art,
    set(value) {
      art = value;
      if (!art || typeof art.createView !== 'function') return;
      const createView = art.createView;
      art.createView = (...args) => {
        const view = createView(...args);
        const realRender = view.render;
        view.render = () => {
          window.golfProbe.draws++;
          return realRender();
        };
        return view;
      };
    }
  });

  window.advanceGolfFrames = n => {
    for (let i = 0; i < n; i++) window.golfTick(1 / 60);
    window.golfRender();
  };
}
