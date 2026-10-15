const assert = require('assert');
const R = require('../assets/rules.js');

let s = R.defaults();
const add = (team, n) => { for (let i = 0; i < n; i++) s = R.point(s, team, +1); };

// set point, deuce and win by two
add(0, 24); add(1, 22);
assert.deepStrictEqual(R.pressure(s), { team: 0, kind: 'set' });
add(1, 2); // 24-24
assert.strictEqual(R.pressure(s), null);
assert.strictEqual(R.setWinner(s), -1);
add(1, 1); // 24-25
assert.deepStrictEqual(R.pressure(s), { team: 1, kind: 'set' });
assert.strictEqual(R.setWinner(s), -1);
add(1, 1); // 24-26
assert.strictEqual(R.setWinner(s), 1);
assert.strictEqual(s.serve, 1);
s = R.closeSet(s);
assert.deepStrictEqual(s.sets, [0, 1]);
assert.deepStrictEqual(s.partials, [[24, 26]]);
assert.deepStrictEqual(s.points, [0, 0]);
assert.strictEqual(s.set, 2);
// home served first in set 1, so the visitors start set 2
assert.strictEqual(s.serve, 1);

// -1 never goes below zero and does not move the serve
s = R.point(s, 0, -1);
assert.deepStrictEqual(s.points, [0, 0]);
assert.strictEqual(s.serve, 1);

// two more sets for the home team -> 2-1, then match point in set 4
for (let k = 0; k < 2; k++) { add(0, 25); s = R.closeSet(s); }
assert.deepStrictEqual(s.sets, [2, 1]);
add(0, 24); add(1, 10);
assert.deepStrictEqual(R.pressure(s), { team: 0, kind: 'match' });
add(0, 1);
s = R.closeSet(s);
assert.strictEqual(s.finished, true);
assert.deepStrictEqual(s.sets, [3, 1]);
assert.deepStrictEqual(s.points, [25, 10]);
// no scoring after the end
const frozen = R.point(s, 1, +1);
assert.strictEqual(frozen, s);

// serve alternates set by set, starting from whoever served the first rally
s = R.defaults();
s.serve = 1; // toss won by the visitors, set with "Cambiar saque" before the first rally
add(0, 25);
assert.strictEqual(s.firstServe, 1);
s = R.closeSet(s);
assert.strictEqual(s.serve, 0);
add(1, 25);
s = R.closeSet(s);
assert.strictEqual(s.serve, 1);

// tie-break to 15
s = R.defaults();
s.set = 5; s.sets = [2, 2];
add(0, 14); add(1, 13);
assert.deepStrictEqual(R.pressure(s), { team: 0, kind: 'match' });
add(0, 1);
assert.strictEqual(R.setWinner(s), 0);
s = R.closeSet(s);
assert.strictEqual(s.finished, true);

// best of 3
s = R.defaults(); s.bestOf = 3;
add(0, 25); s = R.closeSet(s);
add(0, 24);
assert.deepStrictEqual(R.pressure(s), { team: 0, kind: 'match' });

// undo brings back the score only, not the switches or the names
const before = R.defaults();
let now = R.point(before, 0, 1);
now.show = false; now.showPartials = true; now.home = { name: 'RIBERA CF', color: '#000000' };
const undone = R.restoreScore(now, before);
assert.deepStrictEqual(undone.points, [0, 0]);
assert.strictEqual(undone.show, false);
assert.strictEqual(undone.showPartials, true);
assert.strictEqual(undone.home.name, 'RIBERA CF');

// newer-state check, including the guard against far-future clocks
const a = { v: 1, ts: 10, seq: 1 }, b = { v: 1, ts: 11, seq: 0 };
assert.ok(R.isNewer(b, a)); assert.ok(!R.isNewer(a, b)); assert.ok(!R.isNewer({ v: 2 }, a));
const T = 1_800_000_000_000;
assert.ok(R.isNewer({ v: 1, ts: T + 60_000, seq: 1 }, a, T));
assert.ok(!R.isNewer({ v: 1, ts: T + R.MAX_FUTURE_MS + 1, seq: 1 }, a, T));

// stamping never goes back in time
const ahead = { v: 1, ts: T + 5000, seq: 7 };
const st = R.stamp(R.defaults(), ahead, T);
assert.strictEqual(st.ts, T + 5001);
assert.strictEqual(st.seq, 8);
assert.strictEqual(R.stamp(R.defaults(), ahead, T + 9000).ts, T + 9000);

// sanitize: junk in, clean state out
assert.strictEqual(R.sanitize(null), null);
assert.strictEqual(R.sanitize({ v: 2 }), null);
const dirty = R.sanitize({
  v: 1, ts: '5', seq: 3, home: { name: '<img src=x onerror=alert(1)>'.repeat(3), color: 'red' },
  points: [12, '<b>'], sets: [1], partials: [['<i>', 3], 'x'], bestOf: 7, set: 9, serve: 'a', timeout: 4, show: 0,
});
assert.strictEqual(dirty.ts, 0);
assert.strictEqual(dirty.home.name.length, 16);
assert.strictEqual(dirty.home.color, '#e3161e');
assert.deepStrictEqual(dirty.points, [12, 0]);
assert.deepStrictEqual(dirty.sets, [0, 0]);
assert.deepStrictEqual(dirty.partials, [[0, 3], [0, 0]]);
assert.strictEqual(dirty.bestOf, 5);
assert.strictEqual(dirty.set, 5);
assert.strictEqual(dirty.serve, 0);
assert.strictEqual(dirty.timeout, -1);
assert.strictEqual(dirty.show, true);
const full = R.defaults(); full.ts = 99; full.seq = 4; full.partials = [[25, 20]];
assert.deepStrictEqual(R.sanitize(full), full);

console.log('rules: all tests passed');
