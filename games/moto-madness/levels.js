/*
 * Moto Madness — the 20 hand-built levels (4 worlds x 5).
 * Each level is drawn by a "pen" walking right: flat, hill, kicker, pit, loop, ...
 * (see Builder in engine.js). stars: [3-star time, 2-star time] in seconds.
 */
(function (root) {
  'use strict';
  var MM = root.MM = root.MM || {};

  MM.WORLDS = [
    { id: 'grass', name: 'Grassland', color: '#43c451' },
    { id: 'desert', name: 'Desert', color: '#ffa733' },
    { id: 'winter', name: 'Winter', color: '#59c8ff' },
    { id: 'factory', name: 'Night Factory', color: '#a45cff' }
  ];

  MM.LEVELS = [
    /* ------------------------------------------------------------ GRASSLAND */
    { name: 'First Ride', theme: 'grass', seed: 1, stars: [16, 22], build: function (b) {
      b.flat(220).sign('Hold  ↑  to GO!').flat(560)
        .hill(600, 60).flat(260)
        .sign('← →  lean the bike').flat(300)
        .hill(700, 120).flat(260)
        .bumps(3, 240, 24).flat(300)
        .checkpoint().flat(160)
        .sign('Jump! Hold ← in the air to FLIP').flat(360)
        .kicker(220, 80).flat(820)
        .to(500, 130).flat(200).crates([2, 1]).flat(160)
        .to(600, -130).flat(300)
        .checkpoint().flat(200)
        .hill(900, 170).flat(300)
        .ramp(260, 70).landing(760, 260).flat(500)
        .crates([3]).flat(300);
    } },
    { name: 'Hop Hills', theme: 'grass', seed: 2, stars: [22, 30], build: function (b) {
      b.flat(700).hill(800, 150).flat(200)
        .sign('Jump the spikes!').flat(300)
        .kicker(220, 85).pit(240, 170).flat(500)
        .hill(600, 100).hill(600, 140).flat(300)
        .checkpoint().flat(100)
        .to(500, 120).flat(200).ramp(240, 80).landing(800, 300).flat(300)
        .logs(3, 150).flat(300)
        .kicker(240, 100).pit(300, 200).flat(400)
        .checkpoint().flat(100)
        .bumps(4, 220, 32).flat(200)
        .hill(1000, 240).flat(400)
        .crates([3, 2, 1]).flat(300)
        .to(400, 100).ramp(200, 60).landing(700, 260).flat(400);
    } },
    { name: 'Mushroom Meadow', theme: 'grass', seed: 3, stars: [24, 33], build: function (b) {
      b.flat(600).sign('Bounce on the mushrooms!').flat(300)
        .mushroom(1100).flat(160).rise(220).flat(700)
        .to(500, -220).flat(300)
        .mushroom(1150).flat(60).pit(300, 200).flat(500)
        .checkpoint().flat(100)
        .hill(700, 120).flat(200).kicker(200, 80).flat(600)
        .mushroom(1250).flat(200).rise(320).flat(400).crates([2, 1]).flat(200)
        .landing(900, 320).flat(300)
        .checkpoint().flat(200)
        .mushroom(1100).flat(500)
        .mushroom(1200).flat(60).pit(320, 220).flat(300)
        .hill(800, 150).flat(300)
        .kicker(220, 90).pit(260, 180).flat(600);
    } },
    { name: 'Seesaw Park', theme: 'grass', seed: 4, stars: [28, 38], build: function (b) {
      b.flat(600).sign('Ride across the seesaw').flat(300)
        .seesaw(360).flat(500)
        .hill(600, 110).flat(300)
        .logs(4, 140).flat(300)
        .checkpoint().flat(100)
        .seesaw(400).flat(300)
        .kicker(220, 90).pit(260, 180).flat(300)
        .seesaw(380).flat(400)
        .to(500, 150).flat(300).ramp(260, 90).landing(900, 400).flat(300)
        .checkpoint().flat(200)
        .crates([4, 3, 2, 1]).flat(300)
        .bumps(3, 260, 40).flat(200)
        .seesaw(420).flat(200)
        .mushroom(1150).flat(150).rise(260).flat(500)
        .landing(700, 260).flat(300);
    } },
    { name: 'Loop Lagoon', theme: 'grass', seed: 5, stars: [26, 36], build: function (b) {
      b.flat(500).sign('TURBO! Then loop-the-loop!').flat(300)
        .boost(220).loop(170).flat(300)
        .hill(800, 160).flat(300)
        .kicker(240, 100).pit(320, 200).flat(400)
        .checkpoint().flat(200)
        .to(600, 200).flat(300)
        .ramp(280, 100).landing(1000, 480).flat(400)
        .logs(3, 160).flat(200)
        .checkpoint().flat(200)
        .seesaw(380).flat(300)
        .boost(220).loop(180).flat(200)
        .mushroom(1200).flat(150).rise(300).flat(400).crates([2, 2]).flat(200)
        .landing(900, 300).flat(400);
    } },

    /* --------------------------------------------------------------- DESERT */
    { name: 'Dune Runner', theme: 'desert', seed: 6, stars: [26, 36], build: function (b) {
      b.flat(700).sign('Big dunes = big air!').flat(200)
        .hill(900, 200).flat(100).hill(1000, 260).flat(200)
        .to(500, 150).ramp(260, 90).landing(1100, 480).flat(300)
        .checkpoint().flat(100)
        .hill(800, 180).hill(800, 220).flat(200)
        .kicker(240, 100).pit(320, 200).flat(300)
        .bumps(4, 260, 40).flat(300)
        .checkpoint().flat(100)
        .to(700, 260).flat(200).ramp(300, 110).landing(1200, 560).flat(300)
        .hill(1000, 280).flat(300)
        .crates([3, 2, 1]).flat(400);
    } },
    { name: 'Canyon Leap', theme: 'desert', seed: 7, stars: [28, 38], build: function (b) {
      b.flat(700)
        .kicker(220, 90).pit(260, 220).flat(400)
        .to(500, 180).flat(300).drop(0)
        .ramp(220, 70).pit(360, 300, -100).flat(500)
        .checkpoint().flat(100)
        .bumps(3, 240, 36).flat(200)
        .rise(80).flat(260).rise(80).flat(260).rise(80).flat(400)
        .ramp(260, 90).landing(1000, 480).flat(300)
        .checkpoint().flat(200)
        .kicker(240, 100).pit(340, 240).flat(200)
        .kicker(240, 100).pit(340, 240).flat(400)
        .mushroom(1200).flat(200).rise(300).flat(500)
        .landing(800, 300).flat(400);
    } },
    { name: 'Rolling Rocks', theme: 'desert', seed: 8, stars: [27, 37], build: function (b) {
      b.flat(600).to(700, 250).flat(300)
        .sign('Uh oh... RIDE FAST!').flat(200)
        .boulder(800, 420)
        .landing(1600, 700).flat(200)
        .hill(500, 80).flat(100)
        .kicker(220, 90).pit(260, 200).flat(300)
        .to(1200, -350).flat(400)
        .boulderStop().flat(400)
        .checkpoint().flat(200)
        .hill(700, 140).flat(300)
        .to(600, 300).flat(400)
        .checkpoint().flat(200)
        .boulder(700, 450)
        .landing(1400, 600).flat(100)
        .bumps(3, 240, 40)
        .to(1000, -250).flat(400)
        .boulderStop().flat(400)
        .crates([3, 2, 1]).flat(400);
    } },
    { name: 'Crumble Bridge', theme: 'desert', seed: 9, stars: [26, 36], build: function (b) {
      b.flat(600).sign('Keep going! The bridge falls!').flat(300)
        .bridge(520, 7).flat(500)
        .hill(700, 140).flat(300)
        .kicker(220, 90).pit(280, 200).flat(300)
        .checkpoint().flat(200)
        .bridge(700, 9).flat(400)
        .to(500, 150).flat(200)
        .bridge(600, 8).flat(300)
        .checkpoint().flat(200)
        .ramp(260, 90).landing(1000, 400).flat(300)
        .bridge(800, 10).flat(300)
        .mushroom(1150).flat(150).rise(260).flat(400)
        .landing(800, 260).flat(400);
    } },
    { name: 'Scorpion Loop', theme: 'desert', seed: 10, stars: [32, 44], build: function (b) {
      b.flat(600).hill(800, 160).flat(300)
        .boost(220).loop(180).flat(300)
        .seesaw(400).flat(400)
        .checkpoint().flat(200)
        .bridge(600, 8).flat(300)
        .mushroom(1200).flat(200).rise(320).flat(400)
        .kicker(240, 100).pit(340, 200).flat(400)
        .landing(900, 320).flat(300)
        .checkpoint().flat(200)
        .boost(220).kicker(240, 100).pit(600, 240).flat(400)
        .hill(900, 220).flat(300)
        .boost(220).loop(170).flat(300)
        .crates([4, 3, 2, 1]).flat(400);
    } },

    /* --------------------------------------------------------------- WINTER */
    { name: 'Snow Day', theme: 'winter', seed: 11, stars: [26, 36], build: function (b) {
      b.flat(600).sign('Ice is slippery!').flat(300)
        .ice(600).hill(700, 120).flat(300)
        .kicker(220, 90).pit(260, 200).flat(300)
        .ice(400).to(600, 180).flat(300)
        .checkpoint().flat(200)
        .ramp(260, 90).landing(1000, 420).flat(300)
        .ice(300).hill(600, 100).ice(300)
        .bumps(3, 260, 40).flat(300)
        .checkpoint().flat(200)
        .seesaw(380).flat(300)
        .mushroom(1150).flat(150).rise(260).flat(300).ice(300)
        .landing(900, 300).flat(300)
        .crates([3, 2, 1]).flat(400);
    } },
    { name: 'Frozen Falls', theme: 'winter', seed: 12, stars: [26, 36], build: function (b) {
      b.flat(700)
        .ramp(220, 60).drop(160).flat(500)
        .ramp(220, 60).drop(200).flat(400)
        .kicker(240, 100).pit(320, 220).flat(400)
        .checkpoint().flat(200)
        .to(800, 300).flat(200)
        .ramp(280, 100).landing(1200, 600).flat(300)
        .ice(500).flat(200)
        .checkpoint().flat(200)
        .rise(90).flat(260).rise(90).flat(260).rise(90).flat(300)
        .ramp(240, 70).drop(260).flat(300).drop(0)
        .kicker(240, 100).pit(360, 220, -120).flat(400)
        .bridge(600, 8).flat(400);
    } },
    { name: 'Ice Elevator', theme: 'winter', seed: 13, stars: [36, 50], build: function (b) {
      b.flat(600).sign('Stop on the lift! Brake with ↓').flat(400)
        .lift(280, 300, 5).flat(600)
        .landing(700, 200).flat(300)
        .sign('Ride the ferry across').flat(300)
        .ferry(760, 280, 6).flat(500)
        .checkpoint().flat(200)
        .hill(700, 140).flat(300)
        .lift(280, 340, 5, 0.5).flat(500)
        .kicker(240, 100).pit(320, 240).flat(300)
        .landing(800, 300).flat(300)
        .checkpoint().flat(200)
        .ferry(860, 280, 6, 0.3).flat(400)
        .ice(400).mushroom(1150).flat(200).rise(250).flat(400)
        .landing(800, 250).flat(400);
    } },
    { name: 'Avalanche!', theme: 'winter', seed: 14, stars: [28, 38], build: function (b) {
      b.flat(600).to(800, 320).flat(300)
        .sign('SNOWBALL! Don\'t stop!').flat(200)
        .boulder(900, 460, 70)
        .landing(1700, 760).flat(200)
        .kicker(220, 90).pit(260, 200).flat(200)
        .hill(500, 90)
        .to(1300, -380).flat(300)
        .boulderStop().flat(400)
        .checkpoint().flat(200)
        .ice(400).to(700, 320).flat(300)
        .checkpoint().flat(200)
        .boulder(800, 480, 70)
        .landing(1500, 700).flat(100)
        .bridge(520, 7).flat(200)
        .to(1100, -300).flat(300)
        .boulderStop().flat(400)
        .crates([3, 2, 1]).flat(400);
    } },
    { name: 'Double Loop Peak', theme: 'winter', seed: 15, stars: [34, 46], build: function (b) {
      b.flat(600).hill(800, 150).flat(300)
        .boost(220).loop(170).flat(100).boost(220).loop(180).flat(300)
        .checkpoint().flat(200)
        .ice(400).kicker(240, 100).pit(320, 220).flat(300)
        .to(700, 250).flat(200)
        .ramp(280, 100).landing(1200, 560).flat(300)
        .checkpoint().flat(200)
        .seesaw(400).flat(300)
        .lift(280, 300, 5).flat(400)
        .bridge(600, 8).flat(300)
        .landing(900, 300).flat(300)
        .boost(220).loop(190).flat(300)
        .crates([4, 3, 2, 1]).flat(400);
    } },

    /* -------------------------------------------------------- NIGHT FACTORY */
    { name: 'Night Shift', theme: 'factory', seed: 16, stars: [26, 36], build: function (b) {
      b.flat(600).sign('Turbo pads = super speed!').flat(300)
        .boost(220).kicker(240, 100).pit(560, 240).flat(400)
        .crates([3, 2, 1]).flat(300)
        .hill(700, 140).flat(300)
        .checkpoint().flat(200)
        .boost(220).ramp(260, 90).landing(1400, 560).flat(300)
        .rise(90).flat(260).rise(90).flat(400)
        .kicker(240, 100).pit(320, 200).flat(300)
        .checkpoint().flat(200)
        .boost(220).loop(180).flat(200)
        .crates([2, 2, 2]).flat(200)
        .landing(900, 260).flat(300)
        .boost(220).kicker(260, 110).pit(640, 260).flat(500);
    } },
    { name: 'Piston Park', theme: 'factory', seed: 17, stars: [40, 55], build: function (b) {
      b.flat(600).sign('Wait for the piston!').flat(300)
        .lift(280, 320, 5).flat(500)
        .landing(700, 240).flat(300)
        .ferry(760, 280, 6).flat(400)
        .checkpoint().flat(200)
        .kicker(240, 100).pit(320, 220).flat(300)
        .lift(280, 360, 5, 0.4).flat(400)
        .ferry(860, 280, 6, 0.2).flat(400)
        .landing(900, 300).flat(300)
        .checkpoint().flat(200)
        .boost(220).loop(180).flat(300)
        .seesaw(400).flat(300)
        .crates([3, 2, 1]).flat(400);
    } },
    { name: 'Spark Pits', theme: 'factory', seed: 18, stars: [30, 42], build: function (b) {
      b.flat(600)
        .kicker(220, 90).pit(280, 220).flat(200)
        .kicker(220, 90).pit(280, 220).flat(300)
        .seesaw(400).flat(300)
        .checkpoint().flat(200)
        .mushroom(1150).flat(60).pit(320, 220).flat(300)
        .boost(220).kicker(260, 100).pit(560, 240).flat(300)
        .seesaw(420).flat(200)
        .checkpoint().flat(200)
        .to(600, 200).flat(200).ramp(260, 90).pit(500, 300, -200).flat(400)
        .kicker(240, 100).pit(320, 220).flat(200)
        .mushroom(1200).flat(150).rise(300).flat(400)
        .landing(900, 300).flat(400);
    } },
    { name: 'Crate Crusher', theme: 'factory', seed: 19, stars: [32, 44], build: function (b) {
      b.flat(600).sign('SMASH!').flat(200)
        .crates([4, 3, 2, 1]).flat(200)
        .bridge(600, 8).flat(300)
        .crates([3, 3, 3]).flat(200)
        .to(600, 240).flat(300)
        .checkpoint().flat(200)
        .boulder(700, 460, 62)
        .landing(1500, 620).flat(100)
        .crates([2, 2]).flat(100)
        .to(900, -220).flat(300)
        .boulderStop().flat(300)
        .checkpoint().flat(200)
        .bridge(700, 9).flat(300)
        .boost(220).kicker(260, 110).pit(600, 260).flat(300)
        .crates([5, 4, 3, 2, 1]).flat(400);
    } },
    { name: 'Moto Madness', theme: 'factory', seed: 20, stars: [48, 66], build: function (b) {
      b.flat(600).sign('The ULTIMATE ride!').flat(300)
        .boost(220).loop(180).flat(300)
        .kicker(240, 100).pit(320, 220).flat(300)
        .seesaw(400).flat(300)
        .checkpoint().flat(200)
        .bridge(700, 9).flat(300)
        .mushroom(1200).flat(150).rise(300).flat(300)
        .lift(280, 300, 5).flat(400)
        .landing(900, 500).flat(300)
        .checkpoint().flat(200)
        .to(600, 240).flat(300)
        .boulder(800, 480, 64)
        .landing(1500, 620).flat(100)
        .kicker(240, 100).pit(300, 200).flat(100)
        .to(900, -200).flat(300)
        .boulderStop().flat(300)
        .checkpoint().flat(200)
        .ferry(760, 280, 6).flat(300)
        .boost(220).kicker(260, 110).pit(640, 260).flat(300)
        .boost(220).loop(190).flat(300)
        .crates([5, 4, 3, 2, 1]).flat(400);
    } }
  ];
})(typeof window !== 'undefined' ? window : globalThis);
