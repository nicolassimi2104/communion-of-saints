/* Game rules. Pure functions only: no DOM, no network. That makes them easy to test in Node
   (see tests/game.test.js). Every function takes the game state and returns a NEW state.
   The host's browser is the only thing that ever runs these and writes state, so there are
   no conflicts to resolve. */
(function (g) {
  var CS = g.CS;

  /* ---------- tuning knobs (change these to rebalance the game) ---------- */
  var TOTAL = 32;       // every saint gets exactly this many virtue points
  var MIN = 3;          // lowest a single virtue can be
  var MAX = 10;         // highest a single virtue can be
  var MAIN_SIG = 4;     // guaranteed points added to the main type's signature virtue
  var SIDE_SIG = 2;     // guaranteed points added to the side type's signature virtue
  var HOME_MAIN = 3;    // clash bonus when your MAIN type is favored by the arena
  var HOME_SIDE = 2;    // clash bonus when only your SIDE type is favored
  var QUESTION_BONUS = 3;   // fallback worth of a question with no difficulty tag; real values live in CS.DIFFICULTY
  var DOCTRINE_EXTRA = 4;   // Sound Doctrine adds this to a correct answer
  CS.RULES = { TOTAL: TOTAL, MIN: MIN, MAX: MAX, MAIN_SIG: MAIN_SIG, SIDE_SIG: SIDE_SIG, HOME_MAIN: HOME_MAIN, HOME_SIDE: HOME_SIDE, QUESTION_BONUS: QUESTION_BONUS, DOCTRINE_EXTRA: DOCTRINE_EXTRA };

  /* ---------- small helpers ---------- */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function shuffle(a, rng) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function d6(rng) { return 1 + Math.floor(rng() * 6); }
  function arenaById(id) { return CS.ARENAS.filter(function (a) { return a.id === id; })[0]; }
  function abilityOf(types) { var t = CS.TYPES[types && types[0]]; return t ? t.ability : { name: 'Intercession', effect: 'boost', text: '+3 to your score this clash.' }; }
  function bestVirtue(stats) {
    var best = CS.VIRTUES[0].k;
    CS.VIRTUES.forEach(function (v) { if (stats[v.k] > stats[best]) best = v.k; });
    return best;
  }

  /* ---------- dealing cards ---------- */
  /* Strength is luck, not writing. The saint's TYPE guarantees one strong virtue, then the
     remaining points are dealt at random. Random weights are drawn per saint (exponential),
     so some hands come out lopsided and some come out even. The total is always TOTAL. */
  function dealStats(types, rng) {
    rng = rng || Math.random;
    var stats = {}, pool = TOTAL - MIN * CS.VIRTUES.length;
    CS.VIRTUES.forEach(function (v) { stats[v.k] = MIN; });
    function bump(k, n) {
      var add = Math.min(n, MAX - stats[k], pool);
      stats[k] += add; pool -= add;
    }
    var main = CS.TYPES[types[0]], side = types[1] && CS.TYPES[types[1]];
    if (main) bump(main.sig, MAIN_SIG);
    if (side) bump(side.sig, SIDE_SIG);
    var w = {};
    CS.VIRTUES.forEach(function (v) { w[v.k] = -Math.log(1 - rng()); });
    while (pool > 0) {
      var open = CS.VIRTUES.filter(function (v) { return stats[v.k] < MAX; });
      var sum = 0; open.forEach(function (v) { sum += w[v.k]; });
      var r = rng() * sum, chosen = open[open.length - 1].k;
      for (var i = 0; i < open.length; i++) { r -= w[open[i].k]; if (r <= 0) { chosen = open[i].k; break; } }
      stats[chosen]++; pool--;
    }
    return stats;
  }

  function dealCards(state, players, rng) {
    rng = rng || Math.random;
    var s = clone(state);
    s.phase = 'dealt';
    s.cards = {};
    Object.keys(players).forEach(function (id) { s.cards[id] = { stats: dealStats(players[id].types || [], rng) }; });
    s.matches = []; s.history = []; s.clash = null; s.champion = null; s.cur = 0; s.roundNo = 0;
    return s;
  }

  /* ---------- tournament ---------- */
  function winsNeeded(s) { return (s.format === 'quick' && s.roundNo < s.totalRounds) ? 1 : 2; }
  function nextOpen(ms) { for (var i = 0; i < ms.length; i++) if (!ms[i].winner) return i; return -1; }
  function newMatch(a, b) { return { a: a, b: b, w: [0, 0], winner: b ? null : a, used: [false, false], vs: [] }; }

  function buildRound(s, ids, rng) {
    var list = shuffle(ids.slice(), rng), bye = null;
    if (list.length % 2) {
      var cand = list.filter(function (x) { return s.byes.indexOf(x) < 0; });
      var pool = cand.length ? cand : list;
      bye = pool[Math.floor(rng() * pool.length)];
      list = list.filter(function (x) { return x !== bye; });
      s.byes.push(bye);
    }
    var ms = [];
    for (var i = 0; i < list.length; i += 2) ms.push(newMatch(list[i], list[i + 1]));
    if (bye) ms.push(newMatch(bye, null));
    s.matches = ms; s.cur = nextOpen(ms); s.clash = null;
  }

  function beginPlay(state, rng) {
    rng = rng || Math.random;
    var s = clone(state), ids = Object.keys(s.cards);
    s.phase = 'play'; s.roundNo = 1;
    s.totalRounds = Math.max(1, Math.ceil(Math.log(ids.length) / Math.LN2 - 1e-9));
    s.usedQ = []; s.byes = []; s.history = []; s.champion = null;
    s.gid = Math.floor(rng() * 1679616).toString(36);  // makes answer keys unique per game
    buildRound(s, ids, rng);
    return s;
  }

  function questionWorth(q) { var t = CS.DIFFICULTY && CS.DIFFICULTY[(q && q.d) || 1]; return t ? t.bonus : QUESTION_BONUS; }
  /* Early rounds lean easy, the final leans hard, and the deciding clash of a match gets a push
     toward harder questions. Falls back gracefully when a tier has run out. */
  function pickQuestion(s, n, rng) {
    var all = CS.QUESTIONS.map(function (_, i) { return i; });
    var pool = all.filter(function (i) { return s.usedQ.indexOf(i) < 0; });
    if (!pool.length) { s.usedQ = []; pool = all; }
    var depth = s.totalRounds > 1 ? (s.roundNo - 1) / (s.totalRounds - 1) : 1;
    if (n >= 2 * winsNeeded(s) - 1) depth = Math.min(1, depth + 0.25);
    var w = { 1: 1.6 - 1.2 * depth, 2: 1.5, 3: 0.2 + 1.6 * depth }, tiers = [], sum = 0;
    [1, 2, 3].forEach(function (t) {
      var has = pool.filter(function (i) { return (CS.QUESTIONS[i].d || 1) === t; });
      if (has.length) { tiers.push({ t: t, has: has, w: w[t] }); sum += w[t]; }
    });
    var r = rng() * sum, pick = tiers[tiers.length - 1];
    for (var i = 0; i < tiers.length; i++) { r -= tiers[i].w; if (r <= 0) { pick = tiers[i]; break; } }
    return pick.has[Math.floor(rng() * pick.has.length)];
  }

  function startClash(state, rng) {
    rng = rng || Math.random;
    var s = clone(state), m = s.matches[s.cur];
    if (!m) return s;
    var n = m.w[0] + m.w[1] + 1;
    var free = CS.ARENAS.filter(function (a) { return m.vs.indexOf(a.id) < 0; });
    var arena = free[Math.floor(rng() * free.length)];
    m.vs.push(arena.id);
    var qid = pickQuestion(s, n, rng);
    s.usedQ.push(qid);
    s.clash = { key: s.gid + '-' + s.roundNo + '-' + s.cur + '-' + n, n: n, arena: arena.id, qid: qid, worth: questionWorth(CS.QUESTIONS[qid]), order: shuffle([0, 1, 2, 3], rng), step: 'ask' };
    return s;
  }

  function homeBonus(types, arena) {
    if (types[0] && arena.favors.indexOf(types[0]) >= 0) return HOME_MAIN;
    if (types[1] && arena.favors.indexOf(types[1]) >= 0) return HOME_SIDE;
    return 0;
  }

  /* answers: { playerId: {key, choice, ability} }  players: { id: {types:[..]} } */
  function resolveClash(state, players, answers, rng) {
    rng = rng || Math.random;
    var s = clone(state), m = s.matches[s.cur], c = s.clash;
    var arena = arenaById(c.arena), ids = [m.a, m.b];
    var side = [0, 1].map(function (i) {
      var id = ids[i], p = players[id] || { types: [] }, card = s.cards[id] || { stats: {} };
      var a = answers[id] && answers[id].key === c.key ? answers[id] : null;
      var used = !!(a && a.ability && !m.used[i]);
      return {
        id: id, types: p.types || [], stats: card.stats,
        pick: a ? a.choice : null,
        right: !!(a && c.order[a.choice] === 0),
        used: used,
        eff: used ? abilityOf(p.types || []).effect : null
      };
    });
    var worth = c.worth != null ? c.worth : QUESTION_BONUS;
    var res = { arena: arena.id, worth: worth, virtue: [], base: [], rolls: [], die: [], home: [], qb: [], adj: [0, 0], cut: [false, false], total: [], pick: [], used: [], eff: [] };
    side.forEach(function (x, i) {
      var v = x.eff === 'goforth' ? bestVirtue(x.stats) : arena.virtue;
      var nd = x.eff === 'vision' ? 3 : 1, rolls = [];
      for (var k = 0; k < nd; k++) rolls.push(d6(rng));
      var die = Math.max.apply(null, rolls);
      if (x.eff === 'steady') die = Math.max(die, 5);
      res.virtue.push(v); res.base.push(x.stats[v] || 0); res.rolls.push(rolls); res.die.push(die);
      res.home.push(homeBonus(x.types, arena));
      res.qb.push(x.right ? worth + (x.eff === 'doctrine' ? DOCTRINE_EXTRA : 0) : 0);
      res.pick.push(x.pick); res.used.push(x.used); res.eff.push(x.eff);
    });
    side.forEach(function (x, i) {
      var o = 1 - i;
      if (x.eff === 'boost') res.adj[i] += 3;
      if (x.eff === 'weaken') res.adj[o] -= 3;
      if (x.eff === 'blessing') { res.adj[i] += 1; res.adj[o] -= 2; }
      if (x.eff === 'mercy') { res.cut[o] = true; }
    });
    [0, 1].forEach(function (i) { if (res.cut[i]) { res.home[i] = 0; res.qb[i] = 0; } });
    [0, 1].forEach(function (i) { res.total.push(res.base[i] + res.die[i] + res.home[i] + res.qb[i] + res.adj[i]); });
    var win, how = 'score';
    if (res.total[0] !== res.total[1]) win = res.total[0] > res.total[1] ? 0 : 1;
    else if (res.base[0] !== res.base[1]) { win = res.base[0] > res.base[1] ? 0 : 1; how = 'virtue'; }
    else { win = rng() < 0.5 ? 0 : 1; how = 'coin'; }
    res.win = win; res.how = how;
    c.res = res; c.step = 'shown';
    m.w[win]++;
    m.used = [m.used[0] || res.used[0], m.used[1] || res.used[1]];
    if (m.w[win] >= winsNeeded(s)) m.winner = ids[win];
    return s;
  }

  /* ---------- plain-English explanations ---------- */
  function signed(n) { return n > 0 ? '+' + n : n < 0 ? '\u2212' + Math.abs(n) : '0'; }
  function vlabel(k) { var v = CS.VIRTUES.filter(function (x) { return x.k === k; })[0]; return v ? v.label : k; }
  function tlabel(k) { return CS.TYPES[k] ? CS.TYPES[k].label : k; }
  function joinAnd(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
  function tierName(c) { var q = CS.QUESTIONS[c.qid], t = CS.DIFFICULTY && CS.DIFFICULTY[(q && q.d) || 1]; return t ? t.label.toLowerCase() : 'easy'; }

  /* ctx = { saint: [a, b], person: [a, b], types: [[..], [..]] }, all indexed by seat.
     Returns the beats the reveal plays one by one, plus a one-sentence "why it was decided". */
  function explain(s, ctx) {
    var c = s.clash, r = c.res, q = CS.QUESTIONS[c.qid], arena = arenaById(r.arena), n = ctx.saint;
    var W = r.win, L = 1 - W, beats = [];
    var vText;
    if (r.virtue[0] === r.virtue[1]) vText = arena.name + ' tests ' + vlabel(r.virtue[0]) + '. ' + n[0] + ' has ' + r.base[0] + ', ' + n[1] + ' has ' + r.base[1] + '.';
    else vText = [0, 1].map(function (i) { return n[i] + ' uses ' + (r.eff[i] === 'goforth' ? 'their best virtue, ' : '') + vlabel(r.virtue[i]) + ' (' + r.base[i] + ')'; }).join('; ') + '.';
    beats.push({ k: 'virtue', label: r.virtue[0] === r.virtue[1] ? vlabel(r.virtue[0]) : 'Virtue', vals: r.base.slice(), text: vText });
    beats.push({ k: 'die', label: 'Die roll', vals: r.die.slice(), text: [0, 1].map(function (i) {
      var rolls = r.rolls[i];
      if (rolls.length > 1) return n[i] + ' rolls three dice (' + rolls.join(', ') + ') and keeps the ' + r.die[i];
      if (r.eff[i] === 'steady' && rolls[0] < 5) return n[i] + ' rolls a ' + rolls[0] + ', and Rule of Life lifts it to 5';
      return n[i] + ' rolls a ' + rolls[0];
    }).join('. ') + '.' });
    var fav = joinAnd(arena.favors.map(tlabel)), homeBits = [];
    [0, 1].forEach(function (i) {
      var would = homeBonus(ctx.types[i] || [], arena);
      if (r.cut[i] && would) homeBits.push(n[i] + ' is at home, but Works of Mercy cancels it');
      else if (would) homeBits.push(n[i] + ' is at home for ' + signed(would));
    });
    beats.push({ k: 'home', label: 'Home arena', vals: r.home.slice(), text: arena.name + ' favors ' + fav + '. ' + (homeBits.length ? homeBits.join('. ') + '.' : 'Neither saint is at home here.') });
    beats.push({ k: 'answer', label: 'Question', vals: r.qb.slice(), text: 'The answer: ' + q.o[0] + '. ' + [0, 1].map(function (i) {
      if (r.pick[i] == null) return n[i] + ' did not answer';
      var ok = c.order[r.pick[i]] === 0;
      return n[i] + ' chose ' + q.o[c.order[r.pick[i]]] + (ok ? (r.qb[i] ? ', right for ' + signed(r.qb[i]) : ', right, but the bonus is cancelled') : ', wrong');
    }).join('. ') + '.' });
    if (r.used[0] || r.used[1]) {
      var pb = [0, 1].filter(function (i) { return r.used[i]; }).map(function (i) { var a = abilityOf(ctx.types[i] || []); return n[i] + ' invokes ' + a.name + ': ' + a.text; });
      beats.push({ k: 'power', label: 'Intercession', vals: r.adj.slice(), text: pb.join(' ') });
    }
    var how = { score: '', virtue: ' The scores tied, so the higher virtue decides it.', coin: ' Everything tied, so the lot decides it.' }[r.how];
    beats.push({ k: 'total', label: 'Total', vals: r.total.slice(), text: n[W] + ' takes the clash, ' + r.total[W] + ' to ' + r.total[L] + '.' + how });
    var d = { virtue: r.base[W] - r.base[L], die: r.die[W] - r.die[L], home: r.home[W] - r.home[L], answer: r.qb[W] - r.qb[L], power: r.adj[W] - r.adj[L] };
    var top = 'virtue'; Object.keys(d).forEach(function (k) { if (d[k] > d[top]) top = k; });
    var why = {
      virtue: n[W] + ' won on strength: ' + vlabel(r.virtue[W]) + ' ' + r.base[W] + ' against ' + r.base[L] + '.',
      die: 'The dice decided it: ' + n[W] + ' rolled ' + r.die[W] + ' to ' + r.die[L] + '.',
      home: 'Home ground made the difference: ' + n[W] + ' felt at home in ' + arena.name + '.',
      answer: 'The question decided it: ' + n[W] + ' answered ' + (r.qb[L] ? 'for a bigger bonus' : 'correctly while ' + n[L] + ' did not') + '.',
      power: 'The intercession decided it: ' + n[W] + ' invoked ' + abilityOf(ctx.types[W] || []).name + '.'
    };
    var margin = r.total[W] - r.total[L];
    var summary = (d[top] > 0 ? why[top] : 'Dead even in every part of the clash.') + (margin <= 2 ? ' What a close one.' : margin >= 8 ? ' A commanding win.' : '');
    return { beats: beats, summary: summary, margin: margin };
  }

  /* Lines the host can read aloud for the current moment of the match. */
  function script(s, ctx) {
    var m = s.matches[s.cur]; if (!m) return [];
    var n = ctx.saint, p = ctx.person, need = winsNeeded(s), out = [], c = s.clash;
    function who(i) { return n[i] + ' (' + p[i] + '\u2019s patron, ' + joinAnd((ctx.types[i] || []).map(tlabel)) + ')'; }
    function best(i) { var card = s.cards[i === 0 ? m.a : m.b]; var k = card ? bestVirtue(card.stats) : null; return k ? n[i] + ' is strongest in ' + vlabel(k) + ' (' + card.stats[k] + ')' : ''; }
    if (!c) {
      out.push('Next up: ' + who(0) + ' against ' + who(1) + '.');
      out.push('First to win ' + need + ' clash' + (need > 1 ? 'es' : '') + ' takes the match.');
      out.push(best(0) + '. ' + best(1) + '.');
      out.push('Each clash has an arena that tests one virtue, a trivia question, and a die roll. Say that out loud once so everyone is following.');
      return out;
    }
    var arena = arenaById(c.arena), q = CS.QUESTIONS[c.qid], worth = c.worth != null ? c.worth : QUESTION_BONUS;
    if (c.step === 'ask') {
      out.push('Clash ' + c.n + ': ' + arena.name + '. ' + arena.flavor);
      out.push('This arena tests ' + vlabel(arena.virtue) + '. ' + joinAnd(arena.favors.map(tlabel)) + ' saints are at home here and get a bonus.');
      [0, 1].forEach(function (i) { var h = homeBonus(ctx.types[i] || [], arena); if (h) out.push(n[i] + ' is at home, so ' + signed(h) + ' to start.'); });
      out.push('This is a ' + tierName(c) + ' question, worth ' + signed(worth) + ' if answered correctly. Read it aloud: \u201C' + q.q + '\u201D');
      out.push('Players: pick A to D on your phone, decide whether to spend your once-per-match power, then lock in.');
      return out;
    }
    var e = explain(s, ctx);
    e.beats.forEach(function (b) { out.push(b.text); });
    out.push(e.summary);
    out.push('Match score: ' + n[0] + ' ' + m.w[0] + ', ' + n[1] + ' ' + m.w[1] + '.' + (m.winner ? ' That settles the match, ' + n[m.winner === m.a ? 0 : 1] + ' advances.' : ' On to the next clash.'));
    return out;
  }

  function nextClash(state, rng) { var s = clone(state); s.clash = null; return startClash(s, rng); }
  function finishMatch(state) { var s = clone(state); s.clash = null; s.cur = nextOpen(s.matches); return s; }
  function award(state, i) {
    var s = clone(state), m = s.matches[s.cur];
    if (!m || !m.b) return s;
    m.winner = i ? m.b : m.a; m.w[i] = Math.max(m.w[i], winsNeeded(s));
    s.clash = null; s.cur = nextOpen(s.matches);
    return s;
  }
  function endRound(state, rng) {
    var s = clone(state);
    s.history.push({ round: s.roundNo, matches: s.matches.map(function (m) { return { a: m.a, b: m.b, winner: m.winner }; }) });
    var winners = s.matches.map(function (m) { return m.winner; });
    if (winners.length === 1) { s.phase = 'done'; s.champion = winners[0]; s.clash = null; }
    else { s.roundNo++; buildRound(s, winners, rng || Math.random); }
    return s;
  }
  function backToLobby(state) { return { phase: 'lobby', format: state.format || 'standard' }; }

  function statusFor(s, pid) {
    var r, k, m;
    for (r = 0; r < (s.history || []).length; r++) for (k = 0; k < s.history[r].matches.length; k++) {
      m = s.history[r].matches[k];
      if (m.b && (m.a === pid || m.b === pid) && m.winner !== pid) return 'out';
    }
    for (k = 0; k < (s.matches || []).length; k++) {
      m = s.matches[k];
      if (m.b && (m.a === pid || m.b === pid) && m.winner && m.winner !== pid) return 'out';
    }
    return 'in';
  }

  function estimateMinutes(n, format) {
    if (n < 2) return 0;
    return Math.max(5, Math.round((n - 1) * (format === 'quick' ? 1.4 : 2.5)));
  }

  CS.game = {
    clone: clone, shuffle: shuffle, arenaById: arenaById, abilityOf: abilityOf, homeBonus: homeBonus,
    dealStats: dealStats, dealCards: dealCards, beginPlay: beginPlay, startClash: startClash,
    resolveClash: resolveClash, nextClash: nextClash, finishMatch: finishMatch, award: award,
    endRound: endRound, backToLobby: backToLobby, winsNeeded: winsNeeded, statusFor: statusFor,
    estimateMinutes: estimateMinutes, bestVirtue: bestVirtue, explain: explain, script: script, questionWorth: questionWorth
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = CS.game;
})(typeof window !== 'undefined' ? window : globalThis);
