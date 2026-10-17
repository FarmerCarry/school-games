(function () {
  'use strict';
  window.Dino3D.sound = function (event) {
    var tone = Kit.audio.tone;
    if (event === 'jump') tone({ freq:260, to:560, type:'square', dur:0.105, vol:0.07 });
    else if (event === 'land') tone({ freq:110, to:65, type:'triangle', dur:0.05, vol:0.06 });
    else if (event === 'milestone') {
      tone({ freq:880, type:'square', dur:0.08, vol:0.055 });
      tone({ freq:1175, type:'square', dur:0.12, vol:0.055, delay:0.09 });
    } else if (event === 'crash') {
      tone({ freq:190, to:70, type:'triangle', dur:0.23, vol:0.2 });
      Kit.audio.noise({ dur:0.1, vol:0.09, filter:650, to:120 });
    } else if (event === 'record') {
      [523,659,784,1047].forEach(function (f, i) { tone({ freq:f, type:'triangle', dur:0.14, vol:0.09, delay:i*0.085 }); });
    }
  };
})();
