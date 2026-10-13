(function (D) {
  'use strict';
  const C = D.config, EPS = 1e-9, TICK = 1 / 120;

  function seedNumber(seed) {
    if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0 || 0xd1a03d;
    let hash = 2166136261;
    for (const c of String(seed === undefined ? 'dino-3d' : seed)) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
    return hash >>> 0 || 0xd1a03d;
  }

  // Find the first vertical overlap during the longitudinal sweep. Splitting at
  // roots covers both jump directions, the apex, and a landing within the frame.
  function heightContact(y, vy, gravity, low, high, from, to) {
    const cuts = [from, to];
    function roots(level) {
      const disc = vy * vy - 2 * gravity * (y - level);
      if (disc < 0) return;
      const root = Math.sqrt(disc);
      for (const t of [(-vy - root) / gravity, (-vy + root) / gravity]) {
        if (t > from && t < to) cuts.push(t);
      }
    }
    roots(low); roots(high); roots(0);
    cuts.sort((a, b) => a - b);
    const inside = t => {
      const feet = Math.max(0, y + vy * t + gravity * t * t / 2);
      return feet > low + EPS && feet < high - EPS;
    };
    for (let i = 0; i < cuts.length; i++) {
      if (inside(cuts[i])) return cuts[i];
      if (i + 1 < cuts.length && inside((cuts[i] + cuts[i + 1]) / 2)) return cuts[i];
    }
    return null;
  }

  D.createEngine = function (seed) {
    let s, randomState, originalSeed = seedNumber(seed), nextId, pending, gap;
    const engine = { state: null, step, reset };
    function random() {
      randomState ^= randomState << 13;
      randomState ^= randomState >>> 17;
      randomState ^= randomState << 5;
      return (randomState >>> 0) / 4294967296;
    }
    function shape() {
      if (s.score >= C.birdScore && random() < 0.29) {
        const variant = Math.floor(random() * 3);
        return { type: 'bird', width: 1.65, depth: 1.35, height: 0.62,
          bottom: [0.65, 1.55, 3.4][variant], variant };
      }
      const variant = Math.floor(random() * 4);
      return { type: 'cactus', width: [0.8, 1.25, 1.5, 1.05][variant],
        depth: [0.72, 0.9, 1.7, 0.85][variant], height: [1.3, 1.65, 1.45, 2][variant], bottom: 0, variant };
    }
    function queue(last) {
      pending = shape();
      // Use the fastest possible encounter speed, including score acceleration
      // while this gap approaches. Edge-to-edge spacing includes both colliders.
      const encounterScore = s.score + 40 * C.spawnDistance / s.speed;
      const encounterSpeed = Math.min(C.maxSpeed, C.startSpeed + Math.floor(encounterScore / 100));
      gap = encounterSpeed * (C.recoveryTime + random() * 0.43) +
        (last.depth + pending.depth) / 2 + C.playerHalfDepth * 2;
    }
    function spawn() {
      let last = s.obstacles[s.obstacles.length - 1];
      if (!last) {
        last = { ...shape(), id: nextId++, z: -C.firstDistance };
        s.obstacles.push(last); queue(last);
      }
      while (s.obstacles.length < C.maxObstacles && last.z - gap >= -C.spawnDistance) {
        last = { ...pending, id: nextId++, z: last.z - gap };
        s.obstacles.push(last); queue(last);
      }
    }
    function reset(newSeed) {
      if (newSeed !== undefined) originalSeed = seedNumber(newSeed);
      randomState = originalSeed; nextId = 1;
      s = { alive: true, elapsed: 0, distance: 0, speed: C.startSpeed,
        score: 0, points: 0, night: 0, seed: originalSeed,
        player: { y: 0, vy: 0, duck: false, jumpAge: 0 }, obstacles: [] };
      engine.state = s;
      // A small first cactus and a clear approach teach the initial jump.
      s.obstacles.push({ id: nextId++, type: 'cactus', z: -C.firstDistance,
        width: 0.8, depth: 0.72, height: 1.3, bottom: 0, variant: 0 });
      queue(s.obstacles[0]); spawn();
      return s;
    }
    function tick(dt, input, events) {
      const p = s.player;
      p.duck = !!input.duck;
      if (p.y <= EPS && input.jump && !p.duck) {
        p.vy = C.jumpSpeed; p.jumpAge = 0; events.push('jump');
      }
      let gravity = -C.gravity;
      if (!input.jump) gravity -= C.releaseGravity;
      else if (p.jumpAge >= C.holdAfter - EPS) gravity += C.holdRelief;
      if (p.duck) gravity -= C.fastFallGravity;
      const top = p.duck ? C.duckTop : C.playerTop;
      let duration = dt, crashed = false;
      for (const o of s.obstacles) {
        const reach = o.depth / 2 + C.playerHalfDepth;
        const enter = Math.max(0, (-reach - o.z) / s.speed);
        const leave = Math.min(duration, (reach - o.z) / s.speed);
        if (leave < enter || leave < 0 || enter > duration) continue;
        const hit = heightContact(p.y, p.vy, gravity,
          o.bottom - top, o.bottom + o.height - C.playerBottom, enter, leave);
        if (hit !== null && hit <= duration) { duration = hit; crashed = true; }
      }
      const nextY = p.y + p.vy * duration + gravity * duration * duration / 2;
      if (nextY <= 0) {
        if (p.y > EPS) events.push('land');
        p.y = 0; p.vy = 0; p.jumpAge = 0;
      } else {
        p.y = nextY; p.vy += gravity * duration; p.jumpAge += duration;
      }
      const advance = s.speed * duration;
      s.distance += advance; s.elapsed += duration;
      for (const o of s.obstacles) o.z += advance;
      const previousMilestone = Math.floor(s.score / 100);
      s.points += (s.score >= 3000 ? 40 : s.score >= 1000 ? 20 : C.scoreRate) * duration;
      s.score = Math.floor(s.points + EPS);
      s.speed = Math.min(C.maxSpeed, C.startSpeed + Math.floor(s.score / 100));
      if (Math.floor(s.score / 100) > previousMilestone) events.push('milestone');
      const phase = s.elapsed % (C.dayDuration + C.nightDuration);
      s.night = phase < C.dayDuration
        ? Math.max(0, (phase - C.dayDuration + C.transitionTime) / C.transitionTime)
        : Math.min(1, (C.dayDuration + C.nightDuration - phase) / C.transitionTime);
      if (crashed) { s.alive = false; events.push('crash'); return; }
      while (s.obstacles.length && s.obstacles[0].z > C.removeDistance) s.obstacles.shift();
      spawn();
    }
    function step(dt, input) {
      const events = [];
      if (!s.alive || !Number.isFinite(dt) || dt <= 0) return events;
      // The host uses a fixed 60 Hz loop. Smaller internal steps also keep the
      // held-jump boundary consistent when tests or a host supply 30/120 Hz.
      let remaining = Math.min(dt, 0.25);
      input = input || {};
      while (remaining > EPS && s.alive) {
        let slice = Math.min(TICK, remaining);
        const boundary = C.holdAfter - s.player.jumpAge;
        if (input.jump && s.player.y > 0 && boundary > EPS) slice = Math.min(slice, boundary);
        tick(slice, input, events); remaining -= slice;
      }
      return events;
    }
    reset();
    return engine;
  };
})(globalThis.Dino3D = globalThis.Dino3D || {});
