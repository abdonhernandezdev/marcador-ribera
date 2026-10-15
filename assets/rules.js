/* Volleyball scoring rules and match state for the AD Voleibol Ribera scoreboard.
   Pure functions: every action returns a new state. Works in the browser (window.Rules)
   and in Node (module.exports) for tests. */
(function (root) {
  'use strict';

  // a state stamped further than this into the future is ignored (broken clock or junk message)
  const MAX_FUTURE_MS = 12 * 60 * 60 * 1000;
  // what "Deshacer" brings back: the score, never the display switches or the settings
  const SCORE_FIELDS = ['set', 'points', 'sets', 'partials', 'serve', 'firstServe', 'finished'];

  function defaults() {
    return {
      v: 1,
      seq: 0,
      ts: 0,
      home: { name: 'RIBERA', color: '#e3161e', crest: 'ribera' },
      away: { name: 'A7', color: '#e41194', crest: 'a7' },
      label: 'SENIOR MASCULINO · JORNADA 1',
      bestOf: 5,
      target: 25,
      tieTarget: 15,
      set: 1,
      points: [0, 0],
      sets: [0, 0],
      partials: [],
      serve: 0,
      firstServe: 0,
      show: true,
      showPartials: false,
      timeout: -1,
      timeoutUntil: 0,
      finished: false,
    };
  }

  function clone(s) {
    return JSON.parse(JSON.stringify(s));
  }

  function setsToWin(s) {
    return Math.floor(s.bestOf / 2) + 1;
  }

  function isTieBreak(s) {
    return s.set === s.bestOf;
  }

  function target(s) {
    return isTieBreak(s) ? s.tieTarget : s.target;
  }

  /* Team that has won the current set (by 2, at or above the target), or -1. */
  function setWinner(s) {
    const t = target(s);
    const [a, b] = s.points;
    if (a >= t && a - b >= 2) return 0;
    if (b >= t && b - a >= 2) return 1;
    return -1;
  }

  /* Set point / match point for one team, or null. */
  function pressure(s) {
    if (s.finished || setWinner(s) >= 0) return null;
    const t = target(s);
    for (const i of [0, 1]) {
      const me = s.points[i];
      const op = s.points[1 - i];
      if (me >= t - 1 && me > op) {
        return { team: i, kind: s.sets[i] === setsToWin(s) - 1 ? 'match' : 'set' };
      }
    }
    return null;
  }

  /* +1 / -1 for a team. The team that wins the rally serves next. */
  function point(s, team, delta) {
    if (s.finished) return s;
    const n = clone(s);
    if (delta > 0 && n.points[0] === 0 && n.points[1] === 0) n.firstServe = s.serve;
    n.points[team] = Math.max(0, n.points[team] + delta);
    if (delta > 0) n.serve = team;
    return n;
  }

  /* Close the current set if someone has won it. The next set starts with the serve of the
     team that did not serve first in this one. On the deciding set the match ends and the
     final points stay on screen. */
  function closeSet(s) {
    const w = setWinner(s);
    if (w < 0 || s.finished) return s;
    const n = clone(s);
    n.partials.push([n.points[0], n.points[1]]);
    n.sets[w] += 1;
    n.timeout = -1;
    if (n.sets[w] >= setsToWin(n)) {
      n.finished = true;
    } else {
      n.set += 1;
      n.points = [0, 0];
      n.serve = 1 - n.firstServe;
      n.firstServe = n.serve;
    }
    return n;
  }

  function newMatch(s) {
    const n = defaults();
    n.home = clone(s.home);
    n.away = clone(s.away);
    n.label = s.label;
    n.bestOf = s.bestOf;
    n.target = s.target;
    n.tieTarget = s.tieTarget;
    n.show = s.show;
    return n;
  }

  /* Undo: take the score from an earlier state, keep everything else as it is now. */
  function restoreScore(current, earlier) {
    const n = clone(current);
    SCORE_FIELDS.forEach((k) => {
      if (k in earlier) n[k] = clone(earlier[k]);
    });
    return n;
  }

  /* Messages arrive from a public server: rebuild them field by field so nothing unexpected
     (wrong types, HTML, huge numbers) reaches the screen. Returns null if it is not a state. */
  function sanitize(s) {
    if (!s || typeof s !== 'object' || s.v !== 1) return null;
    const d = defaults();
    const int = (x, lo, hi, def) => (typeof x === 'number' && isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x))) : def);
    const str = (x, max, def) => (typeof x === 'string' ? x.slice(0, max) : def);
    const color = (x, def) => (typeof x === 'string' && /^#[0-9a-f]{6}$/i.test(x) ? x : def);
    const crest = (x, def) => (typeof x === 'string' && /^[a-z0-9-]{0,24}$/.test(x) ? x : def);
    const team = (t, def) => ({
      name: str(t && t.name, 16, def.name),
      color: color(t && t.color, def.color),
      crest: crest(t && t.crest, def.crest),
    });
    const pair = (p) => (Array.isArray(p) && p.length === 2 ? [int(p[0], 0, 99, 0), int(p[1], 0, 99, 0)] : [0, 0]);
    const BIG = Number.MAX_SAFE_INTEGER;
    return {
      v: 1,
      seq: int(s.seq, 0, BIG, 0),
      ts: int(s.ts, 0, BIG, 0),
      home: team(s.home, d.home),
      away: team(s.away, d.away),
      label: str(s.label, 48, d.label),
      bestOf: s.bestOf === 3 ? 3 : 5,
      target: int(s.target, 5, 99, d.target),
      tieTarget: int(s.tieTarget, 5, 99, d.tieTarget),
      set: int(s.set, 1, 5, 1),
      points: pair(s.points),
      sets: pair(s.sets),
      partials: Array.isArray(s.partials) ? s.partials.slice(0, 5).map(pair) : [],
      serve: s.serve === 1 ? 1 : 0,
      firstServe: s.firstServe === 1 ? 1 : 0,
      show: s.show !== false,
      showPartials: !!s.showPartials,
      timeout: s.timeout === 0 || s.timeout === 1 ? s.timeout : -1,
      timeoutUntil: int(s.timeoutUntil, 0, BIG, 0),
      finished: !!s.finished,
    };
  }

  /* Accept an incoming state only if it is newer than the one we hold. */
  function isNewer(incoming, current, now) {
    if (!incoming || typeof incoming !== 'object' || incoming.v !== 1) return false;
    if (typeof now === 'number' && incoming.ts > now + MAX_FUTURE_MS) return false;
    if (!current) return true;
    if (incoming.ts !== current.ts) return incoming.ts > current.ts;
    return incoming.seq > current.seq;
  }

  /* Stamp a new version. Never goes backwards in time, even if another phone's clock runs ahead. */
  function stamp(next, previous, now) {
    const n = clone(next);
    n.seq = ((previous && previous.seq) || 0) + 1;
    n.ts = Math.max(now, ((previous && previous.ts) || 0) + 1);
    return n;
  }

  const api = {
    defaults, clone, setsToWin, isTieBreak, target, setWinner, pressure, point, closeSet, newMatch,
    restoreScore, sanitize, isNewer, stamp, MAX_FUTURE_MS,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Rules = api;
})(typeof window !== 'undefined' ? window : globalThis);
