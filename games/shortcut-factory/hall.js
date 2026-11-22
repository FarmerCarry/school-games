/* Shortcut Factory: the factory hall (static scenery merged into one mesh), the belt and
 * the toy machine's lamps. Bright pastel walls, big windows, crates on shelves. */
(function () {
  'use strict';
  var SF = window.SF, H = SF.art;
  // Where things stand on the factory floor (world units).
  SF.LAY = { BY: 1.0, BOX_X: 6.0, BOX_Y: 0.5, NEXT_X: 8.6, NEXT_Z: -1.9, CRATE_X: SF.BELT.end - 0.7, CRATE_Z: 2.3, ARM_Z: -2.5, MX: SF.BELT.start - 1.7 };

  SF.buildHall = function (T, scene) {
    var G = H.G, P = H.P, L = SF.LAY, B = SF.BELT, BY = L.BY, out = {};
    var LIT = new T.MeshLambertMaterial({ vertexColors: true });
    var floorTex = H.canvasTex(128, 128, function (g, w, h) {
      g.fillStyle = '#cdeee6'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#bde6dc'; g.fillRect(0, 0, w / 2, h / 2); g.fillRect(w / 2, h / 2, w / 2, h / 2);
      g.strokeStyle = '#a8d8cc'; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
    }, true);
    floorTex.repeat.set(14, 9);
    var floor = new T.Mesh(new T.PlaneGeometry(56, 36), new T.MeshLambertMaterial({ map: floorTex }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(1, 0, 2);
    scene.add(floor);

    var p = [];
    // Back wall: panels, windows, columns, pipes with bolts.
    p.push(P(G.box, 0xcbb9ff, [1, 6, -8.2], null, [46, 12, 0.6]), P(G.box, 0xb19df5, [1, 0.6, -7.85], null, [46, 1.2, 0.2]));
    for (var wi = -5; wi <= 5; wi++) {
      var wx = wi * 4.4 + 1;
      p.push(P(G.box, 0xffffff, [wx, 5.4, -7.88], null, [3.3, 3.5, 0.12]), P(G.box, 0xdcf4ff, [wx, 5.4, -7.8], null, [2.9, 3.1, 0.1]),
        P(G.box, 0xffffff, [wx, 5.4, -7.74], null, [0.12, 3.1, 0.06]), P(G.box, 0xffffff, [wx, 5.4, -7.74], null, [2.9, 0.12, 0.06]),
        P(G.box, 0xa58ff0, [wx + 2.2, 4, -7.85], null, [0.4, 8, 0.3]));
    }
    p.push(P(G.cyl, 0xff6f61, [1, 8.1, -7.4], [0, 0, Math.PI / 2], [0.38, 46, 0.38]), P(G.cyl, 0x2fc7b4, [1, 7.3, -7.3], [0, 0, Math.PI / 2], [0.26, 46, 0.26]));
    for (var pj = -6; pj <= 7; pj++) p.push(P(G.cyl, 0xffd23f, [pj * 3.7, 8.1, -7.4], [0, 0, Math.PI / 2], [0.46, 0.3, 0.46]));
    // A big gear sign on the wall above the box.
    p.push(P(G.cyl, 0xffb020, [5.6, 6.3, -7.6], [Math.PI / 2, 0, 0], [1.25, 0.2, 1.25]), P(G.cyl, 0xffffff, [5.6, 6.3, -7.45], [Math.PI / 2, 0, 0], [0.55, 0.2, 0.55]));
    for (var gi = 0; gi < 8; gi++) { var ga = gi * Math.PI / 4; p.push(P(G.box, 0xffb020, [5.6 + Math.cos(ga) * 1.3, 6.3 + Math.sin(ga) * 1.3, -7.6], [0, 0, ga], [0.45, 0.45, 0.2])); }
    // Shelves of toy crates on the back left and right.
    function shelf(x, z, cols) {
      p.push(P(G.box, 0x5b6488, [x, 1.6, z], null, [3.2, 3.2, 0.9]), P(G.box, 0x7380a8, [x, 1.1, z + 0.05], null, [3.0, 0.1, 0.85]), P(G.box, 0x7380a8, [x, 2.2, z + 0.05], null, [3.0, 0.1, 0.85]));
      for (var r = 0; r < 2; r++) for (var i = 0; i < 3; i++) p.push(P(G.box, cols[(r * 3 + i) % cols.length], [x - 1 + i, 1.45 + r * 1.1, z + 0.1], [0, (i - 1) * 0.12, 0], [0.8, 0.6, 0.6]));
    }
    shelf(-6.4, -6.6, [0xff4b5c, 0x3d8bff, 0xffc928, 0x35d07f, 0xa66bff, 0xff8a1f]);
    shelf(1.6, -6.8, [0xffc928, 0xff6fb5, 0x3d8bff, 0x35d07f, 0xff4b5c, 0xa66bff]);
    shelf(11.6, -6.4, [0x35d07f, 0xffc928, 0xff6fb5, 0x3d8bff, 0xff4b5c, 0xa66bff]);
    // Safety stripes along the front of the belt.
    for (var si = -15; si <= 7; si++) p.push(P(G.box, si % 2 ? 0x2b2f45 : 0xffd23f, [si * 0.7, 0.012, 1.45], null, [0.7, 0.02, 0.16]));
    // The toy machine on the left.
    var MX = L.MX;
    p.push(P(G.box, 0xff4b5c, [MX, 1.8, 0], null, [2.6, 3.4, 2.6]), P(G.box, 0xe23a4c, [MX, 0.15, 0], null, [2.9, 0.3, 2.9]),
      P(G.cone, 0xffd23f, [MX, 4.05, 0], [Math.PI, 0, 0], [1.25, 1.1, 1.25]), P(G.cyl, 0xffe57a, [MX, 4.62, 0], null, [1.3, 0.14, 1.3]),
      P(G.box, 0x30223f, [MX + 1.27, 1.45, 0], null, [0.1, 1.0, 1.5]), P(G.box, 0xffffff, [MX + 1.31, 2.75, 0], null, [0.08, 0.6, 2.0]),
      P(G.tor, 0xffd23f, [MX + 1.32, 1.45, 0], [0, Math.PI / 2, 0], [0.82, 0.6, 0.4]), P(G.box, 0xff8a1f, [MX, 3.55, 1.31], null, [2.6, 0.18, 0.04]));
    // The belt frame: orange rails, dark legs, the end roller.
    var BL = B.end - B.start + 1.6, BC = (B.end + B.start) / 2 + 0.2;
    out.BL = BL; out.BC = BC;
    p.push(P(G.box, 0xff8a1f, [BC, BY - 0.1, 0.94], null, [BL, 0.34, 0.16]), P(G.box, 0xff8a1f, [BC, BY - 0.1, -0.94], null, [BL, 0.34, 0.16]),
      P(G.box, 0xffb862, [BC, BY + 0.08, 0.94], null, [BL, 0.04, 0.18]), P(G.box, 0xffb862, [BC, BY + 0.08, -0.94], null, [BL, 0.04, 0.18]),
      P(G.box, 0x4a5170, [BC, BY - 0.36, 0], null, [BL, 0.2, 1.72]));
    for (var li = B.start + 0.4; li < B.end + 0.6; li += 2.5) p.push(P(G.box, 0x3b425e, [li, (BY - 0.45) / 2, 0.75], null, [0.22, BY - 0.45, 0.22]), P(G.box, 0x3b425e, [li, (BY - 0.45) / 2, -0.75], null, [0.22, BY - 0.45, 0.22]));
    p.push(P(G.cyl, 0xa4afcc, [B.end + 1.0, BY - 0.12, 0], [Math.PI / 2, 0, 0], [0.22, 1.74, 0.22]));
    // The delivery platform, the waiting ramp and the storage crate.
    p.push(P(G.box, 0x3d8bff, [L.BOX_X, L.BOX_Y / 2, 0], null, [2.7, L.BOX_Y, 2.4]), P(G.box, 0x6aa8ff, [L.BOX_X, L.BOX_Y + 0.02, 0], null, [2.5, 0.04, 2.2]),
      P(G.box, 0x2f6fd6, [L.NEXT_X, 0.25, L.NEXT_Z], null, [2.6, 0.5, 2.0]));
    for (var ri = 0; ri < 5; ri++) p.push(P(G.cyl, 0xb9c4dd, [L.NEXT_X - 1.0 + ri * 0.5, 0.52, L.NEXT_Z], [Math.PI / 2, 0, 0], [0.11, 1.9, 0.11]));
    var cx = L.CRATE_X, cz = L.CRATE_Z;
    p.push(P(G.box, 0x35d07f, [cx, 0.05, cz], null, [1.7, 0.1, 1.2]), P(G.box, 0x2bb86e, [cx, 0.38, cz + 0.56], null, [1.7, 0.68, 0.1]),
      P(G.box, 0x2bb86e, [cx, 0.38, cz - 0.56], null, [1.7, 0.68, 0.1]), P(G.box, 0x2bb86e, [cx + 0.82, 0.38, cz], null, [0.1, 0.68, 1.2]),
      P(G.box, 0x2bb86e, [cx - 0.82, 0.38, cz], null, [0.1, 0.68, 1.2]), P(G.box, 0xffffff, [cx, 0.45, cz + 0.62], null, [0.9, 0.12, 0.02]));
    // The arm's pedestal.
    p.push(P(G.cyl, 0x3b4a6b, [B.arm, 0.15, L.ARM_Z], null, [1.05, 0.3, 1.05]), P(G.cyl, 0xffd23f, [B.arm, 0.33, L.ARM_Z], null, [0.95, 0.06, 0.95]));
    var hall = new T.Mesh(H.merge(p), LIT);
    hall.matrixAutoUpdate = false;
    scene.add(hall);

    // The belt surface: chevrons that scroll with the belt.
    var beltTex = H.canvasTex(64, 64, function (g, w, h) {
      g.fillStyle = '#3c4462'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#535e83'; g.lineWidth = 9; g.beginPath(); g.moveTo(14, 4); g.lineTo(40, 32); g.lineTo(14, 60); g.stroke();
    }, true);
    beltTex.repeat.set(BL / 1.1, 1);
    var belt = new T.Mesh(new T.PlaneGeometry(BL, 1.7), new T.MeshLambertMaterial({ map: beltTex }));
    belt.rotation.x = -Math.PI / 2; belt.position.set(BC, BY, 0);
    scene.add(belt);
    out.beltTex = beltTex;
    // Three lamps on the toy machine blink when a toy comes out.
    var lampGeo = H.merge([P(G.sph, null, [MX - 0.7, 3.2, 1.32], null, [0.2, 0.2, 0.2]), P(G.sph, null, [MX, 3.2, 1.32], null, [0.2, 0.2, 0.2]), P(G.sph, null, [MX + 0.7, 3.2, 1.32], null, [0.2, 0.2, 0.2])]);
    out.lampMat = new T.MeshBasicMaterial({ color: 0xfff3a0 });
    scene.add(new T.Mesh(lampGeo, out.lampMat));
    return out;
  };
})();
