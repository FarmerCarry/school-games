/* Original, code-built voxel desert. No textures, models, network or render loop. */
(function (root) {
  'use strict';
  var api = root.Dino3D = root.Dino3D || {};

  api.createRenderer = function (canvas) {
    var T = root.THREE;
    if (!T) throw new Error('Three.js unavailable');
    var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 1.5));
    var scene = new T.Scene();
    scene.background = new T.Color(0xe8b55c);
    scene.fog = new T.Fog(0xe8b55c, 36, 105);
    var camera = new T.PerspectiveCamera(45, 16 / 9, 0.1, 220);
    var sky = new T.HemisphereLight(0xffebbd, 0x9e744a, 2.0);
    var sun = new T.DirectionalLight(0xfff0d0, 2.25);
    sun.position.set(-12, 23, 10);
    scene.add(sky, sun);
    var material = new T.MeshLambertMaterial({ vertexColors: true });
    var waterMaterial = new T.MeshBasicMaterial({ color: 0x69acb9 });
    var edgeMaterial = new T.MeshBasicMaterial({ vertexColors: true });
    var shadowMaterial = new T.MeshBasicMaterial({ color: 0x795728, transparent: true, opacity: 0.19, depthWrite: false });
    var waveMaterial = new T.MeshBasicMaterial({ color: 0x99e5da, transparent: true, opacity: 0.3, depthWrite: false });
    var geometries = [], materials = [material, waterMaterial, edgeMaterial, shadowMaterial, waveMaterial];
    var objects = [], instanceGroups = [], obstacles = new Map(), cactusPool = [], birdPool = [];
    var temp = new T.Object3D(), color = new T.Color();
    var lastWidth = 0, lastHeight = 0, lastQuality = '', disposed = false;
    var dayColor = new T.Color(0xe8b55c), nightColor = new T.Color(0x233d59);
    var daySky = new T.Color(0xffebbd), nightSky = new T.Color(0x90b9d5);
    var daySun = new T.Color(0xfff0d0), nightSun = new T.Color(0xb8d5ec);
    var green = 0x68ad43, bright = 0x82bb4d, dark = 0x47813b, belly = 0xa4c569;

    function geometry(boxes) {
      var vertices = [], normals = [], colors = [];
      // Box faces are emitted once into a single BufferGeometry for each model.
      var faces = [
        [[1,0,0], [1,-1,-1], [1,1,-1], [1,1,1], [1,-1,1]],
        [[-1,0,0], [-1,-1,1], [-1,1,1], [-1,1,-1], [-1,-1,-1]],
        [[0,1,0], [-1,1,-1], [-1,1,1], [1,1,1], [1,1,-1]],
        [[0,-1,0], [-1,-1,1], [-1,-1,-1], [1,-1,-1], [1,-1,1]],
        [[0,0,1], [1,-1,1], [1,1,1], [-1,1,1], [-1,-1,1]],
        [[0,0,-1], [-1,-1,-1], [-1,1,-1], [1,1,-1], [1,-1,-1]]
      ];
      boxes.forEach(function (b) {
        color.setHex(b[6]);
        faces.forEach(function (f) {
          [1,2,3,1,3,4].forEach(function (i) {
            vertices.push(b[0] + f[i][0] * b[3] / 2, b[1] + f[i][1] * b[4] / 2, b[2] + f[i][2] * b[5] / 2);
            normals.push(f[0][0], f[0][1], f[0][2]);
            colors.push(color.r, color.g, color.b);
          });
        });
      });
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
      g.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
      g.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
      g.computeBoundingSphere();
      geometries.push(g);
      return g;
    }
    function mesh(boxes, parent) {
      var m = new T.Mesh(geometry(boxes), material);
      (parent || scene).add(m);
      return m;
    }
    function group(parent) { var g = new T.Group(); (parent || scene).add(g); return g; }
    function box(x,y,z,w,h,d,c) { return [x,y,z,w,h,d,c]; }
    function hash(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
    function wrap(z, distance, length) { return ((z + distance) % length + length) % length - length + 17; }

    // The course is a continuous, stepped river terrace; only its details recycle.
    mesh([
      box(0,-1.35,-55,220,1,190,0x9a824a),
      box(0,-0.34,-58,6.4,0.68,165,0xb89856),
      box(3.50,-0.22,-58,0.72,0.44,165,0xcbb98a),
      box(4.18,-0.48,-58,0.7,0.6,165,0x8e7947),
      box(10.5,-0.35,-58,12,0.5,165,0x947e4f),
      box(26,-0.24,-58,20,0.75,165,0x9a8250),
      box(-3.66,-0.27,-58,0.9,0.44,165,0xccaf71),
      box(-4.32,-0.49,-58,0.55,0.35,165,0xab8847),
      box(-5.22,-0.68,-58,1.25,0.22,165,0xcab17a),
      box(-11.4,-0.62,-58,2.5,0.38,165,0xcab17a),
      box(-19,-0.42,-58,13,0.7,165,0xae9355),
      box(-28,-0.28,-58,6,0.98,165,0xb7a168),
      box(-39,-0.13,-58,16,1.22,165,0xc2a970),
      box(-73,0.02,-58,52,1.5,165,0xb49a60)
    ]);
    var waterGeometry = new T.BoxGeometry(4.3, 0.07, 170);
    geometries.push(waterGeometry);
    var water = new T.Mesh(waterGeometry, waterMaterial);
    water.position.set(-8.0, -0.68, -57); scene.add(water);

    // One draw per repeated shape, independent of the number of decorations.
    function repeated(g, count, mat, placement) {
      var m = new T.InstancedMesh(g, mat || material, count);
      m.instanceMatrix.setUsage(T.DynamicDrawUsage);
      m.frustumCulled = false;
      var entries = [];
      for (var i=0; i<count; i++) entries.push(placement(i));
      scene.add(m);
      var result = { mesh:m, entries:entries, span:126 };
      instanceGroups.push(result);
      return result;
    }
    var pebbleGeo = geometry([box(0,0.025,0,0.18,0.05,0.23,0xba8e4d)]);
    repeated(pebbleGeo, 95, null, function(i) {
      return { x:(hash(i+17)-0.5)*6.1, y:0, z:hash(i+63)*126, s:0.45+hash(i+87)*0.9, r:hash(i+37)*6.28 };
    });
    var edgeGeo = geometry([
      box(0,-0.04,0,0.70,0.21,1.08,0xf4f0e5),
      box(0.20,-0.16,0.38,0.43,0.24,0.54,0xe7e2d7)
    ]);
    repeated(edgeGeo, 108, edgeMaterial, function(i) { return {x:3.10+(i%3)*0.055,y:0,z:i*1.167,s:1,r:0}; });
    var bankGeo = geometry([
      box(0,-0.32,0,1.2,0.45,2.3,0xc9aa6b),
      box(0.42,-0.48,0.2,0.9,0.35,1.3,0xae8d4b)
    ]);
    repeated(bankGeo, 22, null, function(i) { return {x:-4.25-hash(i+174)*0.4,y:0,z:i*5.72,s:0.6+hash(i+56)*0.8,r:0}; });
    var mesaGeo = geometry([
      box(0,0.14,0,6.8,0.7,8.4,0xc68e40),
      box(-0.6,0.70,-0.3,5.6,0.48,6.8,0xecc178),
      box(-0.85,1.11,-0.6,4.5,0.34,5.6,0xd5a052),
      box(-1.1,1.55,-0.9,3.6,0.55,4.9,0xedbe6f),
      box(-1.1,1.91,-0.9,3.6,0.17,4.9,0xf5cf88)
    ]);
    var mesas = repeated(mesaGeo, 13, null, function(i) {
      return {x:18+hash(i+90)*36,y:-0.3,z:i*9.7,s:0.9+hash(i+75)*0.7,sx:1.45,sy:0.40,sz:1.65,r:Math.floor(hash(i+76)*4)*Math.PI/2};
    });
    var rockGeo = geometry([
      box(0,0.14,0,0.6,0.28,0.55,0x947b58),
      box(-0.07,0.32,-0.03,0.39,0.16,0.4,0xc2a37b),
      box(0.35,0.08,0.22,0.2,0.16,0.26,0xab8e63)
    ]);
    var dryGeo = geometry([
      box(0,0.22,0,0.10,0.44,0.1,0xb1783c),
      box(-0.15,0.35,0,0.35,0.10,0.1,0xc99145),
      box(0.16,0.50,0,0.30,0.10,0.1,0xc99145),
      box(-0.29,0.49,0,0.09,0.33,0.1,0xd09c51),
      box(0.3,0.66,0,0.1,0.37,0.1,0xd09c51)
    ]);
    var skullGeo = geometry([
      box(0,0.22,0,0.49,0.34,0.58,0xf3dfb3),
      box(0,0.10,-0.36,0.29,0.16,0.36,0xffebbf),
      box(-0.13,0.29,-0.30,0.11,0.11,0.03,0x7e674a),
      box(0.13,0.29,-0.30,0.11,0.11,0.03,0x7e674a),
      box(-0.36,0.32,0.03,0.26,0.09,0.10,0xe2c898),
      box(0.36,0.32,0.03,0.26,0.09,0.10,0xe2c898)
    ]);
    var tumbleBoxes = [];
    for(var tb=0;tb<7;tb++) {
      var az=tb*Math.PI/7;
      tumbleBoxes.push(box(Math.sin(az)*0.19,0.25+Math.cos(az)*0.16,0,0.06,0.07,0.52,0xb38444));
      tumbleBoxes.push(box(0,0.25+Math.sin(az)*0.17,Math.cos(az)*0.18,0.47,0.07,0.065,0xcc9951));
    }
    var tumbleGeo=geometry(tumbleBoxes);
    var flowerGeo=geometry([
      box(0,0.18,0,0.08,0.36,0.08,0x698043),
      box(-0.09,0.15,0,0.20,0.07,0.11,0x799247),
      box(0,0.37,0,0.24,0.10,0.24,0xe49077),
      box(0,0.45,0,0.11,0.06,0.11,0xf6d785)
    ]);
    [rockGeo,dryGeo,skullGeo,tumbleGeo,flowerGeo].forEach(function(g,j){
      repeated(g,j===2?7:17,null,function(i){
        var n=i+j*100, left=i%4===0;
        var x=left?-12.2-hash(n+60)*9:4.7+hash(n+60)*9;
        return {x:x,y:left?(x>-12.5?-0.43:-0.07):-0.10,z:hash(n+89)*126,s:0.55+hash(n+44)*1.15,r:hash(n+21)*6.28};
      });
    });
    var waveGeo=new T.BoxGeometry(0.7,0.01,0.08); geometries.push(waveGeo);
    var waves=repeated(waveGeo,38,waveMaterial,function(i){
      return {x:-6.2-hash(i+160)*3.6,y:-0.636,z:hash(i+32)*126,s:0.6+hash(i+78)*2.5,r:0};
    });

    // The T-rex is assembled from broad voxel masses, with tiny face pixels.
    var dino=group(), body=group(dino);
    mesh([
      box(0,1.12,0.13,0.79,0.91,1.03,green),
      box(0,0.88,0.35,0.88,0.46,0.86,dark),
      box(0,1.54,-0.27,0.66,0.62,0.65,bright),
      box(0,1.91,-0.46,0.48,0.70,0.51,green),
      box(0,2.36,-0.72,0.85,0.68,0.78,bright),
      box(0,2.28,-1.23,0.85,0.47,0.77,green),
      box(0,2.56,-1.24,0.77,0.12,0.74,bright),
      box(0,2.015,-1.11,0.73,0.14,0.94,dark),
      box(0,1.39,-0.633,0.42,0.54,0.025,belly),
      box(0,1.78,-0.72,0.29,0.35,0.025,belly),
      box(0,1.58,0.45,0.16,0.20,0.19,dark),
      box(0,1.37,0.73,0.16,0.16,0.16,dark),
      box(-0.429,2.24,-1.25,0.016,0.048,0.64,0x254d37),
      box(0.429,2.24,-1.25,0.016,0.048,0.64,0x254d37),
      box(-0.429,2.46,-1.48,0.016,0.064,0.072,0x2c6236),
      box(0.429,2.46,-1.48,0.016,0.064,0.072,0x2c6236),
      box(-0.433,2.21,-1.10,0.018,0.09,0.075,0xf2e7bb),
      box(0.433,2.21,-1.10,0.018,0.09,0.075,0xf2e7bb),
      box(-0.434,2.48,-0.87,0.018,0.25,0.22,0xfbf5d9),
      box(0.434,2.48,-0.87,0.018,0.25,0.22,0xfbf5d9)
    ],body);
    var eyes=mesh([
      box(-0.445,2.49,-0.92,0.021,0.135,0.086,0x172e2b),
      box(0.445,2.49,-0.92,0.021,0.135,0.086,0x172e2b)
    ],body);
    var crashEyes=mesh([
      box(-0.445,2.50,-0.87,0.021,0.046,0.16,0x172e2b),
      box(-0.445,2.56,-0.94,0.021,0.05,0.04,0x172e2b),
      box(-0.445,2.43,-0.79,0.021,0.05,0.04,0x172e2b),
      box(0.445,2.50,-0.87,0.021,0.046,0.16,0x172e2b),
      box(0.445,2.56,-0.94,0.021,0.05,0.04,0x172e2b),
      box(0.445,2.43,-0.79,0.021,0.05,0.04,0x172e2b)
    ],body); crashEyes.visible=false;
    var tail=group(body); tail.position.set(0,1.14,0.59);
    mesh([
      box(0,0,0.20,0.64,0.55,0.62,green),
      box(0,0.02,0.69,0.47,0.39,0.55,green),
      box(0,0.14,1.12,0.32,0.29,0.45,bright),
      box(0,0.26,1.47,0.2,0.22,0.42,bright),
      box(0,0.29,0.3,0.14,0.14,0.17,dark),
      box(0,0.25,0.73,0.13,0.10,0.16,dark)
    ],tail);
    var legs=[],arms=[];
    [-1,1].forEach(function(side){
      var leg=group(dino);leg.position.set(side*0.34,0.86,0.28);
      mesh([
        box(0,-0.18,0,0.31,0.48,0.43,green),
        box(0,-0.53,0.055,0.22,0.41,0.24,dark),
        box(0,-0.78,-0.09,0.32,0.15,0.59,green),
        box(-0.10,-0.785,-0.38,0.064,0.07,0.095,0xc2c58b),
        box(0.02,-0.785,-0.38,0.064,0.07,0.095,0xc2c58b),
        box(0.12,-0.785,-0.38,0.055,0.07,0.095,0xc2c58b)
      ],leg);legs.push(leg);
      var arm=group(body);arm.position.set(side*0.43,1.52,-0.43);
      mesh([
        box(side*0.04,-0.1,0,0.15,0.32,0.18,green),
        box(side*0.04,-0.23,-0.10,0.15,0.14,0.32,bright),
        box(side*0.0,-0.25,-0.27,0.045,0.10,0.11,0xc2c58b),
        box(side*0.09,-0.25,-0.27,0.045,0.10,0.11,0xc2c58b)
      ],arm);arms.push(arm);
    });
    var circleGeo=new T.CircleGeometry(1,12);geometries.push(circleGeo);
    var dinoShadow=new T.Mesh(circleGeo,shadowMaterial);
    dinoShadow.rotation.x=-Math.PI/2;dinoShadow.position.set(0,0.014,0.23);dinoShadow.scale.set(0.83,1.42,1);scene.add(dinoShadow);

    // Cactus models are normalized to their collision dimensions; flowers fit too.
    var cactusGeometries=[];
    for(var cv=0;cv<3;cv++) {
      var cb=[
        box(0,0.48,0,0.33,0.96,0.68,0x46884f),
        box(-0.105,0.48,-0.35,0.045,0.86,0.025,0x77a95b),
        box(0.105,0.48,-0.35,0.045,0.86,0.025,0x77a95b),
        box(0.18,0.40,0,0.32,0.18,0.59,0x4c9251),
        box(0.39,0.58,0,0.22,0.52,0.55,0x5b9c55),
        box(-0.22,0.58,0,0.30,0.17,0.56,0x4c9251),
        box(-0.40,0.72,0,0.2,0.40,0.52,0x669f56),
        box(0,0.972,0,0.30,0.048,0.45,0xde8ba2),
        box(0,1.00,0,0.11,0.005,0.15,0xf1c593)
      ];
      if(cv===1) {
        cb[3][1]=0.28;cb[4][1]=0.44;cb[4][4]=0.48;
        cb.push(box(-0.4,0.933,0,0.21,0.075,0.31,0xd991a3));
      }
      if(cv===2) {
        cb[5][1]=0.36;cb[6][1]=0.49;cb[6][4]=0.40;
        cb.push(box(0.39,0.855,0,0.24,0.065,0.34,0xe4a0af));
      }
      // Match the visible cactus depth to its normalized collision envelope.
      cb.forEach(function(b){b[2]/=0.70;b[5]/=0.70;});
      if(cv===2) {
        var pair=[];
        cb.forEach(function(b){
          pair.push(box(b[0]*0.55-0.19,b[1]*0.78,b[2]*0.43+0.28,b[3]*0.55,b[4]*0.78,b[5]*0.43,b[6]));
          pair.push(box(b[0]*0.55+0.20,b[1],b[2]*0.43-0.26,b[3]*0.55,b[4],b[5]*0.43,b[6]));
        });
        cb=pair;
      }
      cactusGeometries.push(geometry(cb));
    }
    repeated(cactusGeometries[1],13,null,function(i){return{x:5.7+hash(i+67)*7,y:-0.10,z:hash(i+313)*126,s:0.75+hash(i+87)*0.7,r:hash(i+44)*6.28};});
    var birdBodyGeo=geometry([
      box(0,0.32,0,0.26,0.31,0.42,0x85684e),
      box(0,0.40,0.23,0.27,0.26,0.29,0xa4835a),
      box(0,0.34,0.43,0.17,0.12,0.29,0xe6b56b),
      box(0,0.42,-0.23,0.10,0.15,0.25,0x675543),
      box(-0.14,0.44,0.28,0.013,0.072,0.08,0x262f31),
      box(0.14,0.44,0.28,0.013,0.072,0.08,0x262f31),
      box(-0.07,0.08,-0.13,0.06,0.18,0.09,0xbe915a),
      box(0.07,0.08,-0.13,0.06,0.18,0.09,0xbe915a)
    ]);
    var birdWingGeo=geometry([
      box(0.20,0,0,0.40,0.075,0.32,0x886449),
      box(0.44,0,-0.06,0.12,0.07,0.27,0xb88860),
      box(0.48,0,-0.16,0.04,0.07,0.13,0xd0a374)
    ]);
    function obstacle(type) {
      var pool=type==='bird'?birdPool:cactusPool;
      if(pool.length) return pool.pop();
      var g=group();g.visible=false;
      var o={group:g,type:type,wings:[]};
      if(type==='bird') {
        g.add(new T.Mesh(birdBodyGeo,material));
        [-1,1].forEach(function(side){var wing=new T.Mesh(birdWingGeo,material);wing.position.set(side*0.10,0.36,-0.03);wing.scale.x=side;g.add(wing);o.wings.push(wing);});
      } else {o.mesh=new T.Mesh(cactusGeometries[0],material);g.add(o.mesh);}
      var shadow=new T.Mesh(circleGeo,shadowMaterial);shadow.rotation.x=-Math.PI/2;shadow.position.y=0.018;scene.add(shadow);o.shadow=shadow;
      objects.push(o);return o;
    }

    var dustGeo=geometry([box(0,0,0,0.095,0.095,0.095,0xf4ce8c)]);
    var dust=new T.InstancedMesh(dustGeo,material,12);dust.frustumCulled=false;dust.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(dust);
    // No real-time shadow maps or postprocessing: voxel shading does the work.
    function resize(w,h) {
      if(disposed)return;
      w=Math.max(1,Math.floor(w||canvas.clientWidth||1100));h=Math.max(1,Math.floor(h||canvas.clientHeight||620));
      lastWidth=w;lastHeight=h;renderer.setSize(w,h,false);camera.aspect=w/h;
      if(camera.aspect<1.15){camera.position.set(8.3,8.0,15.5);camera.lookAt(0,0.8,-6.5);camera.fov=49;}
      else {camera.position.set(9.5,5.2,9.5);camera.lookAt(0,1.25,-9.7);camera.fov=45;}
      camera.updateProjectionMatrix();
    }
    function render(state, options) {
      if(disposed)return;
      options=options||{};state=state||{};
      var elapsed=Math.max(0,state.elapsed||0),distance=state.distance||0,player=state.player||{};
      var mode=options.mode||'ready',reduced=!!options.reducedMotion;
      var low=options.quality==='low';
      if(lastQuality!==options.quality){
        renderer.setPixelRatio(Math.min(root.devicePixelRatio||1,low?1:1.5));
        if(lastWidth)renderer.setSize(lastWidth,lastHeight,false);lastQuality=options.quality;
      }
      var phase=elapsed%80,night=phase<55?0:phase<60?(phase-55)/5:phase<75?1:1-(phase-75)/5;
      night=night*night*(3-2*night);
      scene.background.copy(dayColor).lerp(nightColor,night);scene.fog.color.copy(scene.background);
      sky.color.copy(daySky).lerp(nightSky,night);sky.intensity=2.0-night*0.85;sun.intensity=2.25-night*1.25;
      sun.color.copy(daySun).lerp(nightSun,night);
      waterMaterial.color.setHex(0x69acb9).lerp(color.setHex(0x27566d),night*0.72);
      edgeMaterial.color.setHex(0xffffff).lerp(color.setHex(0x798691),night);
      for(var j=0;j<instanceGroups.length;j++) {
        var batch=instanceGroups[j];batch.mesh.visible=!(low&&(batch===waves||batch===mesas));
        if(!batch.mesh.visible)continue;
        for(var i=0;i<batch.entries.length;i++) {
          var e=batch.entries[i];temp.position.set(e.x,e.y,wrap(e.z,distance,batch.span));temp.rotation.set(0,e.r,0);temp.scale.set(e.s*(e.sx||1),e.s*(e.sy||1),e.s*(e.sz||1));temp.updateMatrix();batch.mesh.setMatrixAt(i,temp.matrix);
        }
        batch.mesh.instanceMatrix.needsUpdate=true;
      }
      var air=(player.y||0)>0.035,duck=!!player.duck,over=mode==='over'||state.alive===false;
      var moving=mode==='playing'&&!over;
      var stride=distance*1.06,run=moving&&!air?Math.sin(stride):0;
      dino.position.set(0,Math.max(0,player.y||0)+(moving&&!air?Math.abs(run)*0.045:0),0);
      dino.scale.set(1,duck?0.46:1,duck?1.12:1);
      dino.rotation.z=over?-0.075:0;body.rotation.x=air?-0.07:0;
      legs[0].rotation.x=air?-0.55:run*0.63;legs[1].rotation.x=air?0.35:-run*0.63;
      arms[0].rotation.x=air?-0.4:-run*0.10;arms[1].rotation.x=air?-0.4:run*0.10;
      tail.rotation.y=reduced?0:Math.sin(stride*0.5)*0.04;tail.rotation.x=air?-0.08:0;
      eyes.visible=!over;crashEyes.visible=over;
      var sh=1-Math.min(0.55,(player.y||0)*0.10);dinoShadow.scale.set(0.83*sh,1.42*sh,1);
      dust.visible=moving&&!air&&!reduced&&!low;
      if(dust.visible){
        for(var di=0;di<12;di++){
          var t=(distance*0.12+di/12)%1;
          temp.position.set((hash(di+660)-0.5)*(0.45+t*0.7),0.08+Math.sin(t*Math.PI)*0.3,0.6+t*2.2);
          temp.rotation.set(t*3,di,t*2);temp.scale.setScalar((1-t)*0.85);temp.updateMatrix();dust.setMatrixAt(di,temp.matrix);
        }dust.instanceMatrix.needsUpdate=true;
      }
      var active=state.obstacles||[],seen=new Set();
      for(var oi=0;oi<active.length;oi++){
        var source=active[oi],key=source.id==null?oi:source.id;seen.add(key);
        var ob=obstacles.get(key);
        if(ob&&ob.type!==source.type){ob.group.visible=false;ob.shadow.visible=false;(ob.type==='bird'?birdPool:cactusPool).push(ob);obstacles.delete(key);ob=null;}
        if(!ob){ob=obstacle(source.type);obstacles.set(key,ob);}
        ob.group.visible=true;ob.group.position.set(0,source.bottom||0,source.z);
        var width=source.width||1,height=source.height||1.7,depth=source.depth||0.8;
        ob.group.scale.set(width,source.type==='bird'?height/0.62:height,source.type==='bird'?depth/1.35:depth);
        if(source.type==='bird'){
          var flap=reduced?0:Math.sin(elapsed*12+oi*2)*0.48;
          ob.wings[0].rotation.z=-flap;ob.wings[1].rotation.z=flap;
        }else ob.mesh.geometry=cactusGeometries[Math.abs(source.variant||0)%3];
        ob.shadow.visible=true;ob.shadow.position.set(0,0.018,source.z);ob.shadow.scale.set(width*0.67,depth*0.69,1);
      }
      obstacles.forEach(function(ob,key){if(!seen.has(key)){ob.group.visible=false;ob.shadow.visible=false;(ob.type==='bird'?birdPool:cactusPool).push(ob);obstacles.delete(key);}});
      renderer.render(scene,camera);
    }
    function dispose(){
      if(disposed)return;disposed=true;
      geometries.forEach(function(g){g.dispose();});materials.forEach(function(m){m.dispose();});
      instanceGroups.forEach(function(b){b.mesh.dispose();});dust.dispose();renderer.dispose();
      obstacles.clear();cactusPool.length=0;birdPool.length=0;objects.length=0;
    }
    resize();
    return {render:render,resize:resize,dispose:dispose,info:renderer.info};
  };
})(typeof window!=='undefined'?window:globalThis);
