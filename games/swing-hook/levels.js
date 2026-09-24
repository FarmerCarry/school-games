(function (root) {
  var LEVELS = [
    { name: 'First Swing', par: 10, flips: 1, start: [150, 450], finish: 2300,
      hooks: [[420, 320], [820, 300], [1220, 300], [1620, 300], [2000, 320]] },
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = LEVELS;
  else root.SH_LEVELS = LEVELS;
})(typeof window !== 'undefined' ? window : this);
