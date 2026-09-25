/*
 * Munch Rope levels. Logical screen is 1280x720, y grows downward.
 *   candy:  [x, y] start position
 *   munch:  [x, y] Munch's body centre (he sits on a little stand)
 *   ropes:  [{x, y, len?, move?}]  pins with a rope already tied to the candy
 *           (len defaults to the pin->candy distance, i.e. a tight rope)
 *   rings:  [{x, y, r, move?}]     rope rings: a rope ties itself on when the
 *           candy comes within r of the pin
 *   stars:  [[x, y] | {x, y, move}] exactly three
 *   bubbles:[[x, y]]               candy floats up inside; click to pop
 *   blowers:[{x, y, a}]            click to puff air in direction a (degrees, 0 = right)
 *   spikes: [{x, y, w, a, move?, spin?}]  a spiky bar (centre, length, angle deg)
 *   tramps: [{x, y, w, a}]         bouncy pad; bounces toward its top side
 *   move:   {x2, y2, period, phase} back-and-forth, or {cx, cy, r, period, phase, dir} circle
 *   tip:    short hint shown when the level starts (Arabic)
 *   hl:     which teaching highlights to show: 'bubble' 'pop' 'puff'
 */
(function (root) {
  var L = [
    /* ---------------- Box 1: Cardboard Box ---------------- */
    { name: 'أول قضمة', tip: 'اسحب الفأرة عبر الحبل لتقطعه!',
      candy: [640, 280], munch: [640, 596],
      ropes: [{ x: 640, y: 96 }],
      stars: [[640, 360], [640, 415], [640, 468]] },

    { name: 'وقت التأرجح', tip: 'اقطع الحبل عندما تتأرجح الحلوى فوق قضّوم!',
      candy: [800, 190], munch: [262, 598],
      ropes: [{ x: 520, y: 100 }],
      stars: [[520, 390], [335, 322], [252, 440]] },

    { name: 'عقدتان', tip: 'أيّ حبل ستقطع أولًا؟',
      candy: [640, 260], munch: [1050, 600],
      ropes: [{ x: 440, y: 110 }, { x: 840, y: 110 }],
      stars: [[840, 356], [990, 305], [1045, 450]] },

    { name: 'ثلاثة حبال',
      candy: [640, 300], munch: [640, 612],
      ropes: [{ x: 400, y: 120 }, { x: 640, y: 96, len: 300 }, { x: 880, y: 120 }],
      stars: [[640, 400], [540, 470], [640, 530]] },

    { name: 'أشواك حادة', tip: 'احذر الأشواك!',
      candy: [640, 250], munch: [990, 600],
      ropes: [{ x: 480, y: 110 }, { x: 800, y: 110 }],
      spikes: [{ x: 640, y: 480, w: 330, a: 0 }],
      stars: [[800, 330], [930, 300], [975, 440]] },

    { name: 'الحلقة الصيّادة', tip: 'إذا دخلت الحلوى الحلقة، تُربط بحبل جديد!',
      candy: [380, 300], munch: [650, 600],
      ropes: [{ x: 380, y: 100 }],
      rings: [{ x: 500, y: 420, r: 150 }],
      stars: [[380, 400], [500, 572], [625, 480]] },

    { name: 'حلقة بعد حلقة',
      candy: [250, 250], munch: [1060, 600],
      ropes: [{ x: 250, y: 100 }],
      rings: [{ x: 420, y: 380, r: 190 }, { x: 830, y: 300, r: 170 }],
      stars: [[420, 560], [640, 420], [830, 470]] },

    { name: 'فقاعة للأعلى', tip: 'الفقاعة ترفع الحلوى للأعلى!', hl: 'bubble',
      candy: [640, 380], munch: [640, 150],
      ropes: [{ x: 440, y: 240 }, { x: 840, y: 240 }],
      bubbles: [[640, 610]],
      stars: [[640, 500], [640, 290], [640, 235]] },

    { name: 'فرقعة!', tip: 'انقر على الفقاعة لتفرقعها!', hl: 'bubble pop',
      candy: [380, 250], munch: [640, 604],
      ropes: [{ x: 640, y: 110 }],
      bubbles: [[640, 400]],
      stars: [[480, 370], [745, 300], [650, 505]] },

    { name: 'ممر الأشواك',
      candy: [330, 330], munch: [910, 585],
      ropes: [{ x: 230, y: 200 }, { x: 430, y: 200 }],
      bubbles: [[330, 600]],
      rings: [{ x: 530, y: 230, r: 215 }],
      spikes: [{ x: 445, y: 86, w: 240, a: 0 }],
      stars: [[330, 470], [530, 445], [735, 290]] },

    { name: 'الدبوس المتحرك', tip: 'بعض الدبابيس تتحرك!',
      candy: [300, 330], munch: [940, 600],
      ropes: [{ x: 300, y: 110, move: { x2: 980, y2: 110, period: 5 } }],
      spikes: [{ x: 620, y: 600, w: 300, a: 0 }],
      stars: [[480, 330], [760, 330], [940, 470]] },

    { name: 'الدوّامة',
      candy: [640, 380], munch: [900, 596],
      ropes: [{ x: 640, y: 130, move: { cx: 640, cy: 200, r: 70, period: 4, phase: 0.75 } }],
      spikes: [{ x: 560, y: 630, w: 380, a: 0 }],
      stars: [[480, 440], [790, 400], [880, 490]] },

    { name: 'قفز الحلقات',
      candy: [400, 160], munch: [1110, 600],
      ropes: [{ x: 200, y: 100 }],
      rings: [{ x: 480, y: 380, r: 170 }, { x: 820, y: 250, r: 210, move: { x2: 940, y2: 250, period: 4 } }],
      spikes: [{ x: 640, y: 680, w: 760, a: 0 }],
      stars: [[480, 550], [640, 330], [880, 420]] },

    { name: 'ورطة الفقاعة',
      candy: [900, 290], munch: [330, 360],
      ropes: [{ x: 900, y: 90 }],
      bubbles: [[900, 560]],
      rings: [{ x: 720, y: 130, r: 200 }],
      spikes: [{ x: 760, y: 40, w: 300, a: 0 }, { x: 640, y: 690, w: 700, a: 0 }],
      stars: [[900, 450], [720, 330], [500, 260]] },

    { name: 'زعيم الكرتون',
      candy: [260, 200], munch: [900, 150],
      ropes: [{ x: 160, y: 100 }, { x: 380, y: 100 }],
      rings: [{ x: 700, y: 300, r: 200 }],
      bubbles: [[900, 600]],
      spikes: [{ x: 560, y: 690, w: 600, a: 0 }, { x: 1080, y: 420, w: 240, a: 90 }],
      stars: [[500, 260], [700, 500], [900, 430]] },

    /* ---------------- Box 2: Gift Box ---------------- */
    { name: 'نفخة نفخة', tip: 'انقر على النافخ ليدفع الفقاعة!', hl: 'bubble puff',
      candy: [300, 560], munch: [620, 165],
      ropes: [{ x: 300, y: 670 }],
      bubbles: [[300, 560]],
      blowers: [{ x: 120, y: 420, a: 0 }],
      stars: [[300, 440], [470, 405], [545, 325]] },

    { name: 'نسمة هواء',
      candy: [640, 300], munch: [1000, 590],
      ropes: [{ x: 640, y: 96 }],
      blowers: [{ x: 360, y: 300, a: 0 }],
      spikes: [{ x: 640, y: 640, w: 420, a: 0 }],
      stars: [[790, 250], [880, 330], [960, 460]] },

    { name: 'نطّة!', tip: 'النطّاطة تقذف الحلوى بعيدًا!',
      candy: [320, 250], munch: [820, 480],
      ropes: [{ x: 320, y: 100 }],
      tramps: [{ x: 320, y: 590, w: 150, a: 25 }],
      stars: [[320, 400], [560, 440], [700, 440]] },

    { name: 'بيت النطّ',
      candy: [440, 200], munch: [890, 500],
      ropes: [{ x: 640, y: 96 }],
      tramps: [{ x: 430, y: 600, w: 150, a: 28 }],
      spikes: [{ x: 660, y: 650, w: 280, a: 0 }],
      stars: [[640, 330], [450, 450], [610, 480]] },

    { name: 'نوابض وأشواك',
      candy: [120, 200], munch: [1080, 560],
      ropes: [{ x: 300, y: 96 }],
      tramps: [{ x: 490, y: 600, w: 150, a: 30 }],
      spikes: [{ x: 800, y: 640, w: 340, a: 0 }, { x: 780, y: 200, w: 260, a: 0 }],
      stars: [[300, 300], [490, 420], [800, 420]] },

    { name: 'حلقات الريح',
      candy: [200, 540], munch: [985, 600],
      ropes: [{ x: 200, y: 660 }],
      bubbles: [[200, 540]],
      blowers: [{ x: 90, y: 420, a: 0 }],
      rings: [{ x: 760, y: 220, r: 180 }],
      spikes: [{ x: 600, y: 90, w: 500, a: 0 }],
      stars: [[390, 390], [760, 400], [950, 470]] },

    { name: 'انزلق وتأرجح',
      candy: [300, 300], munch: [1070, 470],
      ropes: [{ x: 300, y: 100, move: { x2: 700, y2: 100, period: 4 } }],
      tramps: [{ x: 820, y: 610, w: 160, a: 30 }],
      spikes: [{ x: 500, y: 660, w: 400, a: 0 }],
      stars: [[850, 250], [770, 480], [985, 440]] },

    { name: 'غلاف الفقاعات',
      candy: [200, 290], munch: [1110, 170],
      ropes: [{ x: 200, y: 100 }],
      bubbles: [[200, 590]],
      blowers: [{ x: 70, y: 560, a: 0 }, { x: 1210, y: 380, a: 180 }],
      spikes: [{ x: 640, y: 330, w: 420, a: 0 }, { x: 640, y: 690, w: 900, a: 0 }],
      stars: [[200, 450], [640, 480], [1050, 350]] },

    { name: 'أشواك دوّارة',
      candy: [300, 220], munch: [1040, 600],
      ropes: [{ x: 300, y: 90 }, { x: 560, y: 90 }],
      spikes: [{ x: 700, y: 440, w: 240, a: 0, spin: 90 }],
      stars: [[450, 340], [700, 300], [920, 460]] },

    { name: 'خدعة النطّاطة',
      candy: [1160, 180], munch: [400, 505],
      ropes: [{ x: 980, y: 90 }],
      tramps: [{ x: 980, y: 600, w: 150, a: -30 }],
      spikes: [{ x: 730, y: 660, w: 300, a: 0 }, { x: 640, y: 250, w: 200, a: 0 }],
      stars: [[980, 420], [770, 420], [610, 390]] },

    { name: 'فجوة الرياح',
      candy: [480, 300], munch: [990, 590],
      ropes: [{ x: 380, y: 150 }, { x: 580, y: 150 }],
      bubbles: [[480, 610]],
      blowers: [{ x: 300, y: 560, a: 0 }],
      spikes: [{ x: 720, y: 260, w: 320, a: 90 }],
      stars: [[480, 450], [720, 510], [960, 330]] },

    { name: 'دورة كاملة',
      candy: [170, 330], munch: [1070, 600],
      ropes: [{ x: 400, y: 160, move: { cx: 400, cy: 250, r: 90, period: 3.2, phase: 0.75 } }],
      rings: [{ x: 900, y: 280, r: 170 }],
      spikes: [{ x: 620, y: 670, w: 700, a: 0 }],
      stars: [[600, 470], [880, 450], [1050, 470]] },

    { name: 'مفرقعات الحفلة',
      candy: [80, 200], munch: [1060, 240],
      ropes: [{ x: 250, y: 96 }],
      tramps: [{ x: 330, y: 600, w: 150, a: 30 }],
      bubbles: [[640, 430]],
      blowers: [{ x: 470, y: 220, a: 0 }],
      spikes: [{ x: 800, y: 60, w: 360, a: 0 }, { x: 800, y: 660, w: 500, a: 0 }],
      stars: [[250, 330], [520, 460], [860, 260]] },

    { name: 'سباق الشرائط',
      candy: [340, 150], munch: [1110, 600],
      ropes: [{ x: 150, y: 90 }],
      rings: [{ x: 420, y: 330, r: 160 }, { x: 720, y: 250, r: 150, move: { cx: 720, cy: 250, r: 50, period: 3 } }, { x: 990, y: 300, r: 160 }],
      spikes: [{ x: 640, y: 680, w: 900, a: 0 }],
      stars: [[420, 490], [720, 420], [990, 460]] },

    { name: 'الهدية الكبرى',
      candy: [200, 230], munch: [1130, 170],
      ropes: [{ x: 100, y: 110 }, { x: 300, y: 110 }],
      tramps: [{ x: 420, y: 600, w: 150, a: 30 }],
      rings: [{ x: 690, y: 370, r: 160 }],
      bubbles: [[1005, 585]],
      blowers: [{ x: 1222, y: 330, a: 180 }],
      spikes: [{ x: 700, y: 680, w: 1000, a: 0 }, { x: 700, y: 70, w: 300, a: 0 }],
      stars: [[420, 420], [690, 545], [1110, 400]] }
  ];

  var BOXES = [
    { name: 'صندوق الكرتون', theme: 'cardboard', from: 0, to: 15, need: 0 },
    { name: 'صندوق الهدايا', theme: 'gift', from: 15, to: 30, need: 24 }
  ];
  L.BOXES = BOXES;
  root.MUNCH_LEVELS = L;
  if (typeof module !== 'undefined' && module.exports) module.exports = L;
})(typeof window !== 'undefined' ? window : globalThis);
