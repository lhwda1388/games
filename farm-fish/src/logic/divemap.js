  // ---------- 잠수 지도 (stage 12): 24 hand-placed rooms, one screen each (data only; rules in logic/dive.js) ----------
  // x/y = grid cell for the minimap (exits always point at the grid neighbour). gate: what a diver needs to come in.
  // Every deep room also needs the 손전등 (zone rule). bubbles: refill spots [x, y]. things: { id, x, y } where id is a
  // 해저 도감 id, 'key', 'log' (+ n) or 'box' (+ box). 얕은 여 r0..r7, 난파선 w0..w7 (w0 = 열쇠 문), 심해 d0..d7.
  // Long passages: w6 → w7 and d1 → d7 have no bubbles on the way, so those two rooms are behind the 큰 산소통.
  var DIVE_ROOMS = [
    // 얕은 여: bright, open from the start; the key lies in the far room r7
    { id: 'r0', zone: 'reef', x: 2, y: 0, exits: { w: 'r1', e: 'r2', s: 'r3' }, bubbles: [[90, 150]],
      things: [{ id: 'wakame', x: 40, y: 160 }, { id: 'reefschool', x: 130, y: 70 }] },
    { id: 'r1', zone: 'reef', x: 1, y: 0, exits: { e: 'r0', s: 'r4' }, bubbles: [[40, 160]],
      things: [{ id: 'coralbit', x: 120, y: 165 }, { id: 'seagrape', x: 60, y: 90 }] },
    { id: 'r2', zone: 'reef', x: 3, y: 0, exits: { w: 'r0', e: 'r6', s: 'r5' }, bubbles: [],
      things: [{ id: 'scallop', x: 50, y: 170 }, { id: 'seahorse', x: 130, y: 150 }] },
    { id: 'r3', zone: 'reef', x: 2, y: 1, exits: { n: 'r0', w: 'r4', e: 'r5' }, bubbles: [[130, 160]],
      things: [{ id: 'coralbit', x: 45, y: 168 }, { id: 'nudibranch', x: 100, y: 172 }] },
    { id: 'r4', zone: 'reef', x: 1, y: 1, exits: { n: 'r1', e: 'r3', s: 'w0' }, bubbles: [[30, 150]],
      things: [{ id: 'wakame', x: 140, y: 165 }, { id: 'coralbit', x: 60, y: 60 }] },
    { id: 'r5', zone: 'reef', x: 3, y: 1, exits: { n: 'r2', w: 'r3', s: 'd0' }, bubbles: [[150, 150]],
      things: [{ id: 'scallop', x: 40, y: 170 }, { id: 'reefschool', x: 120, y: 60 }] },
    { id: 'r6', zone: 'reef', x: 4, y: 0, exits: { w: 'r2', s: 'r7' }, bubbles: [[140, 160]],
      things: [{ id: 'seagrape', x: 40, y: 165 }, { id: 'seahorse', x: 120, y: 80 }] },
    { id: 'r7', zone: 'reef', x: 4, y: 1, exits: { n: 'r6' }, bubbles: [[40, 150]],
      things: [{ id: 'key', x: 130, y: 172 }, { id: 'nudibranch', x: 80, y: 120 }, { id: 'coralbit', x: 150, y: 90 }] },
    // 난파선: the hull past the 열쇠 문
    { id: 'w0', zone: 'wreck', x: 1, y: 2, exits: { n: 'r4', w: 'w1', s: 'w3' }, gate: 'key', bubbles: [[140, 150]],
      things: [{ id: 'scrap', x: 50, y: 168 }, { id: 'mussel', x: 140, y: 60 }] },
    { id: 'w1', zone: 'wreck', x: 0, y: 2, exits: { e: 'w0', s: 'w2' }, bubbles: [[40, 140]],
      things: [{ id: 'box', box: 'bxhold', x: 120, y: 168 }, { id: 'wreckcrab', x: 50, y: 172 }] },
    { id: 'w2', zone: 'wreck', x: 0, y: 3, exits: { n: 'w1', e: 'w3', s: 'w5' }, bubbles: [[140, 160]],
      things: [{ id: 'log', n: 1, x: 60, y: 160 }, { id: 'scrap', x: 120, y: 70 }] },
    { id: 'w3', zone: 'wreck', x: 1, y: 3, exits: { n: 'w0', w: 'w2', e: 'w4', s: 'w6' }, bubbles: [[40, 165]],
      things: [{ id: 'wreckeel', x: 130, y: 150 }, { id: 'mussel', x: 70, y: 60 }] },
    { id: 'w4', zone: 'wreck', x: 2, y: 3, exits: { w: 'w3', e: 'd2' }, bubbles: [[90, 160]],
      things: [{ id: 'seaturtle', x: 120, y: 60 }, { id: 'pearlclam', x: 40, y: 172 }] },
    { id: 'w5', zone: 'wreck', x: 0, y: 4, exits: { n: 'w2', e: 'w6' }, bubbles: [[30, 150]],
      things: [{ id: 'log', n: 2, x: 130, y: 165 }, { id: 'scrap', x: 70, y: 172 }] },
    { id: 'w6', zone: 'wreck', x: 1, y: 4, exits: { n: 'w3', w: 'w5', e: 'w7' }, bubbles: [],
      things: [{ id: 'box', box: 'bxcabin', x: 60, y: 168 }, { id: 'wreckcrab', x: 140, y: 172 }] },
    { id: 'w7', zone: 'wreck', x: 2, y: 4, exits: { w: 'w6' }, gate: 'tank', bubbles: [[140, 150]],
      things: [{ id: 'log', n: 3, x: 100, y: 165 }, { id: 'pearlclam', x: 40, y: 172 }, { id: 'seaturtle', x: 130, y: 70 }] },
    // 심해 동굴: dark, past the 손전등
    { id: 'd0', zone: 'deep', x: 3, y: 2, exits: { n: 'r5', e: 'd1', s: 'd2' }, gate: 'light', bubbles: [[40, 160]],
      things: [{ id: 'glowshell', x: 130, y: 170 }, { id: 'lanternfish', x: 60, y: 70 }] },
    { id: 'd1', zone: 'deep', x: 4, y: 2, exits: { w: 'd0', s: 'd3', e: 'd7' }, gate: 'light', bubbles: [],
      things: [{ id: 'deepjelly', x: 90, y: 60 }, { id: 'blackcoral', x: 50, y: 172 }] },
    { id: 'd2', zone: 'deep', x: 3, y: 3, exits: { n: 'd0', w: 'w4', e: 'd3', s: 'd5' }, gate: 'light', bubbles: [[140, 160]],
      things: [{ id: 'anglerfish', x: 50, y: 80 }, { id: 'glowshell', x: 60, y: 172 }] },
    { id: 'd3', zone: 'deep', x: 4, y: 3, exits: { n: 'd1', w: 'd2', e: 'd4', s: 'd6' }, gate: 'light', bubbles: [[40, 165]],
      things: [{ id: 'gulper', x: 130, y: 70 }, { id: 'blackcoral', x: 130, y: 172 }] },
    { id: 'd4', zone: 'deep', x: 5, y: 3, exits: { w: 'd3' }, gate: 'light', bubbles: [[60, 150]],
      things: [{ id: 'log', n: 4, x: 130, y: 165 }, { id: 'glowsquid', x: 110, y: 70 }] },
    { id: 'd5', zone: 'deep', x: 3, y: 4, exits: { n: 'd2', e: 'd6' }, gate: 'light', bubbles: [[140, 150]],
      things: [{ id: 'deepjelly', x: 50, y: 70 }, { id: 'glowshell', x: 60, y: 172 }] },
    { id: 'd6', zone: 'deep', x: 4, y: 4, exits: { w: 'd5', n: 'd3' }, gate: 'light', bubbles: [[40, 165]],
      things: [{ id: 'log', n: 5, x: 130, y: 168 }, { id: 'lanternfish', x: 120, y: 60 }] },
    { id: 'd7', zone: 'deep', x: 5, y: 2, exits: { w: 'd1' }, gate: 'tank', bubbles: [[140, 150]],
      things: [{ id: 'box', box: 'bxdeep', x: 100, y: 168 }, { id: 'anglerfish', x: 60, y: 80 }, { id: 'glowsquid', x: 130, y: 60 }] }
  ];
  // room.log / room.box mirror what lies there (for the minimap and quick checks)
  DIVE_ROOMS.forEach(function (r) {
    r.things.forEach(function (t) { if (t.id === 'log') r.log = t.n; if (t.id === 'box') r.box = t.box; });
  });

  expose({ DIVE_ROOMS: DIVE_ROOMS });
