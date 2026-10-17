(function (D) {
  'use strict';
  // Original world dimensions. Feet rest at y=0; the track approaches along +z.
  D.config = Object.freeze({
    startSpeed: 15, maxSpeed: 35, scoreRate: 10,
    jumpSpeed: 19, gravity: 60, releaseGravity: 40,
    holdAfter: 0.2, holdRelief: 20, fastFallGravity: 120,
    playerBottom: 0.24, playerTop: 2.45, duckTop: 1.18,
    playerHalfDepth: 0.48, playerWidth: 0.75,
    spawnDistance: 70, firstDistance: 48, removeDistance: 9,
    maxObstacles: 8, birdScore: 400,
    // Full held flight lasts <0.82 s; this leaves recovery before the next jump.
    recoveryTime: 1.08, dayDuration: 60, nightDuration: 20, transitionTime: 5
  });
  D.palette = Object.freeze({
    sky: 0xd9f1e8, fog: 0xe7ebc9, sand: 0xeab351,
    sandLight: 0xf8cd69, sandDark: 0xca873a, water: 0x36bec0,
    dino: 0x59ae68, dinoLight: 0x84c879, dinoDark: 0x32855b,
    cactus: 0x45976b, flower: 0xe873a0, rock: 0xb28458,
    bird: 0xa96eaa, birdLight: 0xd79fc4
  });
})(globalThis.Dino3D = globalThis.Dino3D || {});
