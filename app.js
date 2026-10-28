/* The app: screens, buttons, and the polling loop.
   How it works in one paragraph: the HOST's browser owns the game. It deals the cards, runs the
   rules in game.js, and saves the resulting game state to the backend. PHONES only ever (1) join,
   (2) lock in an answer, and (3) poll the backend every second or two to see the latest state and
   draw it. Because only the host writes state, there is nothing to merge or conflict. */
(function () {
  'use strict';
  var CS = window.CS, G = CS.game, TYPES = CS.TYPES, VIRTUES = CS.VIRTUES;
  var VMAP = {}; VIRTUES.forEach(function (v) { VMAP[v.k] = v; });
  var TYPE_KEYS = Object.keys(TYPES);
  var EFFECT_TAGS = { boost: '+3 to you', weaken: '−3 to foe', doctrine: 'Answer +7', vision: 'Three dice', goforth: 'Best virtue', steady: 'Die 5+', blessing: '+1 you, −2 foe', mercy: 'Cancels bonuses' };

  /* ---------- small helpers ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var toastT = 0;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 3800); }
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  function rid(bytes) {
    var a = new Uint8Array(bytes); (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function uuid() {
    var h = rid(16);
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-4' + h.slice(13, 16) + '-a' + h.slice(17, 20) + '-' + h.slice(20, 32);
  }
  function randCode() { var L = 'ABCDEFGHJKLMNPQRSTUVWXYZ', s = '', a = new Uint8Array(4); crypto.getRandomValues(a); for (var i = 0; i < 4; i++) s += L[a[i] % L.length]; return s; }
  function initials(s) {
    var w = String(s).replace(/\b(saint|st|san|santa|of|de|the|blessed)\b\.?/gi, ' ').split(/[\s-]+/).filter(Boolean);
    return ((w[0] || '?').charAt(0) + (w[1] ? w[1].charAt(0) : '')).toUpperCase();
  }
  function topVirtue(stats) { var b = VIRTUES[0].k; VIRTUES.forEach(function (v) { if (stats[v.k] > stats[b]) b = v.k; }); return b; }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ---------- who am I, which game ---------- */
  var api = CS.makeApi(window.COS_CONFIG);
  var params = new URLSearchParams(location.search);
  var CODE = (params.get('g') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  if (CODE.length !== 4) CODE = '';
  var MOCK_EXTRA = /[?&]mock(=1|=true|&|$)/.test(location.search) ? '&mock=1' : '';
  function baseUrl() { return location.href.split(/[?#]/)[0]; }

  // A host recovery link looks like ?g=ABCD&h=1#k=<hostkey>. Store the key, then tidy the address bar.
  (function adoptHostKey() {
    var m = /[#&]k=([a-f0-9]{16,})/.exec(location.hash || '');
    if (m && CODE) { store.set('cos.hk.' + CODE, m[1]); try { history.replaceState(null, '', '?g=' + CODE + '&h=1' + MOCK_EXTRA); } catch (e) {} }
  })();

  var S = {
    code: CODE, hostKey: CODE ? store.get('cos.hk.' + CODE) : null, isHost: false,
    me: null, myAns: null,
    players: {}, order: [], state: null, answers: {},
    online: true, missing: false, loaded: false, stateLoaded: false, saveErr: false
  };
  S.isHost = !!(S.hostKey && params.get('h') === '1');
  var ui = { sel: {}, ov: {}, confirm: '', busy: false };

  function tabId() { try { var t = sessionStorage.getItem('cos.tab'); if (!t) { t = rid(4); sessionStorage.setItem('cos.tab', t); } return t; } catch (e) { return 'x'; } }
  // In test mode every browser tab acts as its own phone, so identity is per tab. For real games it is per browser.
  function meKey() { return 'cos.pl.' + CODE + '.' + (api.kind === 'mock' ? tabId() : ''); }
  function ansKey() { return 'cos.ans.' + CODE + '.' + (api.kind === 'mock' ? tabId() : ''); }
  if (CODE && !S.isHost) {
    try { S.me = JSON.parse(store.get(meKey())); } catch (e) { S.me = null; }
    try { S.myAns = JSON.parse(store.get(ansKey())); } catch (e) { S.myAns = null; }
  }
  function ensureMe() {
    if (!S.me) { S.me = { id: uuid(), secret: rid(16) }; store.set(meKey(), JSON.stringify(S.me)); }
    return S.me;
  }

  /* ---------- reading the game ---------- */
  var phaseOf = function () { return (S.state && S.state.phase) || 'lobby'; };
  var sn = function (id) { return S.players[id] ? S.players[id].saint : '(left)'; };
  var pn = function (id) { return S.players[id] ? S.players[id].name : ''; };
  function cardOf(id) {
    var p = S.players[id]; if (!p) return null;
    var c = S.state && S.state.cards && S.state.cards[id];
    return { p: p, stats: c ? c.stats : null, types: p.types || [], ability: G.abilityOf(p.types || []) };
  }
  function ansFor(pid, key) {
    var a = S.isHost ? S.answers[pid] : (S.me && pid === S.me.id ? S.myAns : null);
    return a && a.key === key ? a : null;
  }
  function selFor(pid, key) {
    var s = ui.sel[pid];
    if (!s || s.key !== key) s = ui.sel[pid] = { key: key, pick: null, abil: false };
    return s;
  }

  /* ---------- card markup ---------- */
  function typeChips(types, arena) {
    return '<div class="tchips">' + (types || []).map(function (k, i) {
      var home = arena && arena.favors.indexOf(k) >= 0;
      return '<span class="tchip' + (i === 0 ? ' main' : '') + (home ? ' home' : '') + '">' + esc(TYPES[k] ? TYPES[k].label : k) + '</span>';
    }).join('') + '</div>';
  }
  function pips(n) { var s = ''; for (var i = 1; i <= 10; i++) s += '<i' + (i <= n ? ' class="on"' : '') + '></i>'; return s; }
  function cardHTML(id, o) {
    o = o || {};
    var c = cardOf(id);
    if (!c) return '<article class="card ghost"><p>This saint has left the Communion.</p></article>';
    var p = c.p, arena = o.arena || null;
    var cls = 'card' + (o.compact ? ' compact' : '') + (o.state ? ' ' + o.state : '') + (c.stats ? '' : ' back');
    var tone = c.stats ? 'var(--' + topVirtue(c.stats) + ')' : 'var(--gold-deep)';
    var head = '<div class="chead"><div class="medal" aria-hidden="true">' + esc(initials(p.saint)) + '</div><div class="cname"><h3>' + esc(p.saint) + '</h3>' + typeChips(c.types, arena) + '</div></div>';
    if (!c.stats) {
      return '<article class="' + cls + '" style="--tone:' + tone + '">' + head
        + '<p class="flavor">' + esc(p.blurb || (TYPES[c.types[0]] ? TYPES[c.types[0]].motto : '')) + '</p>'
        + '<p class="by">Confirmation saint of ' + esc(p.name) + '</p><p class="note" style="margin:10px 6px 0">Strength is dealt when the host begins.</p></article>';
    }
    var stats = VIRTUES.map(function (v) {
      var n = c.stats[v.k];
      return '<li class="stat' + (o.hot === v.k ? ' hot' : '') + '" style="--c:var(--' + v.k + ')"><span class="sl">' + v.label + '</span><span class="pips">' + pips(n) + '</span><b>' + n + '</b></li>';
    }).join('');
    var wins = '';
    if (o.wins) { wins = '<div class="wins" aria-label="Clashes won">'; for (var i = 0; i < o.wins[1]; i++) wins += '<i' + (i < o.wins[0] ? ' class="on"' : '') + '></i>'; wins += '</div>'; }
    var ab = c.ability;
    var flavor = p.blurb || (TYPES[c.types[0]] ? TYPES[c.types[0]].motto : '');
    return '<article class="' + cls + '" style="--tone:' + tone + '">' + wins + head
      + '<ul class="stats">' + stats + '</ul>'
      + '<div class="abil"><div class="ah"><b>' + esc(ab.name) + '</b><span class="tag' + (o.spent ? ' spent' : '') + '">' + (o.spent ? 'Spent' : esc(EFFECT_TAGS[ab.effect] || '')) + '</span></div><p>' + esc(ab.text) + '</p></div>'
      + '<p class="flavor">“' + esc(flavor) + '”</p>'
      + '<p class="by">Confirmation saint of ' + esc(p.name) + '</p></article>';
  }
  function rosterHTML(o) {
    o = o || {};
    if (!S.order.length) return '<div class="panel muted">No saints yet. Cards appear here as people join.</div>';
    return '<div class="roster' + (o.deal ? ' deal' : '') + '">' + S.order.map(function (id, i) {
      var tools = o.tools ? '<div class="cardtools"><button class="btn sm danger" data-act="kick" data-id="' + esc(id) + '">Remove</button></div>' : '';
      return '<div class="cardwrap" style="--i:' + i + '">' + cardHTML(id, {}) + tools + '</div>';
    }).join('') + '</div>';
  }

  /* ---------- stage markup ---------- */
  function arenaHTML(c) {
    var a = G.arenaById(c.arena), v = VMAP[a.virtue];
    return '<div class="arena"><h4>Clash ' + c.n + '</h4><h2>' + esc(a.name) + '</h2><p class="flavor" style="margin:0 0 8px">' + esc(a.flavor) + '</p>'
      + '<p class="small" style="margin:0">Tests <b>' + v.label + '</b>. At home here:</p><div class="tchips">'
      + a.favors.map(function (k) { return '<span class="tchip home">' + esc(TYPES[k].label) + '</span>'; }).join('') + '</div></div>';
  }
  function optsHTML(c, o) {
    var q = CS.QUESTIONS[c.qid], shown = c.step === 'shown', res = c.res, m = o.m;
    var tagName = o.interactive ? 'div' : 'ol';
    return '<' + tagName + ' class="opts">' + c.order.map(function (oi, pos) {
      var cls = 'opt', who = '';
      if (o.interactive && o.pick === pos) cls += ' sel';
      if (shown) {
        if (oi === 0) cls += ' right';
        else if (res && (res.pick[0] === pos || res.pick[1] === pos)) cls += ' wrong';
        if (res) who = '<span class="who">' + [0, 1].map(function (i) { return res.pick[i] === pos ? '<span class="chip">' + esc(initials(sn(i ? m.b : m.a))) + '</span>' : ''; }).join('') + '</span>';
      }
      var inner = '<span class="ltr">' + 'ABCD'.charAt(pos) + '</span><span>' + esc(q.o[oi]) + '</span>' + who;
      if (o.interactive) return '<button class="' + cls + '" data-act="pick" data-pid="' + esc(o.pid) + '" data-pos="' + pos + '"' + (o.locked ? ' disabled' : '') + '>' + inner + '</button>';
      return '<li class="' + cls + '">' + inner + '</li>';
    }).join('') + '</' + tagName + '>';
  }
  function resHTML(m, c) {
    var r = c.res, ids = [m.a, m.b];
    function signed(n) { return n ? (n > 0 ? '+' : '−') + Math.abs(n) : '0'; }
    function col(i) {
      var cut = r.cut[i];
      return '<div class="rc' + (r.win === i ? ' w' : '') + '"><div class="rn">' + esc(sn(ids[i])) + '</div><dl>'
        + '<div><dt>' + VMAP[r.virtue[i]].label + '</dt><dd>' + r.base[i] + '</dd></div>'
        + '<div><dt>Die</dt><dd>' + (r.rolls[i].length > 1 ? r.rolls[i].join(' / ') + ' → ' : '') + r.die[i] + '</dd></div>'
        + '<div><dt>Home arena</dt><dd' + (cut ? ' class="cut">cancelled' : '>' + signed(r.home[i])) + '</dd></div>'
        + '<div><dt>Question</dt><dd' + (cut ? ' class="cut">cancelled' : '>' + signed(r.qb[i])) + '</dd></div>'
        + '<div><dt>Intercession</dt><dd>' + signed(r.adj[i]) + '</dd></div>'
        + '</dl><div class="tot">' + r.total[i] + '</div></div>';
    }
    var how = { score: '', virtue: ' Scores tied, so the higher virtue decides it.', coin: ' Everything tied, so the lot decides it.' }[r.how];
    return '<div class="res">' + col(0) + col(1) + '</div><div class="banner">' + esc(sn(ids[r.win])) + ' takes the clash.' + how + '</div>';
  }
  function overrideHTML(pid, c) {
    var s = selFor(pid, c.key), open = ui.ov[pid], cd = cardOf(pid);
    var head = '<button class="btn sm" data-act="ovtoggle" data-pid="' + esc(pid) + '">' + (open ? 'Hide' : 'Answer for them') + '</button>';
    if (!open) return '<div class="ovr">' + head + '</div>';
    return '<div class="ovr">' + head + '<div class="row">'
      + [0, 1, 2, 3].map(function (p) { return '<button class="btn sm' + (s.pick === p ? ' primary' : '') + '" data-act="pick" data-pid="' + esc(pid) + '" data-pos="' + p + '">' + 'ABCD'.charAt(p) + '</button>'; }).join('')
      + (cd ? '<button class="btn sm' + (s.abil ? ' primary' : '') + '" data-act="abil" data-pid="' + esc(pid) + '">' + esc(cd.ability.name) + '</button>' : '')
      + '<button class="btn sm primary" data-act="lock" data-pid="' + esc(pid) + '">Lock in</button></div></div>';
  }
  function stageHTML(g, mode) {
    var m = g.matches[g.cur], need = G.winsNeeded(g), c = g.clash;
    var head = '<p class="eyebrow">Round ' + g.roundNo + ' of ' + g.totalRounds + (m ? ' · Match ' + (g.cur + 1) + ' of ' + g.matches.length : '') + ' · first to ' + need + '</p>';
    if (g.cur === -1) {
      var last = g.matches.length === 1;
      var winners = g.matches.map(function (mm) { return '<li>' + esc(sn(mm.winner)) + ' <small>' + esc(pn(mm.winner)) + '</small></li>'; }).join('');
      return '<section class="panel gold">' + head + '<h2>' + (last ? 'The final is decided' : 'Round ' + g.roundNo + ' is complete') + '</h2><div class="rnd"><ul>' + winners + '</ul></div>'
        + (mode === 'host' ? '<div class="ctl"><button class="btn primary big" data-act="round">' + (last ? 'Crown the champion' : 'Draw round ' + (g.roundNo + 1)) + '</button></div>' : '<p class="muted">Waiting for the host to draw the next round.</p>') + '</section>';
    }
    var ids = [m.a, m.b], shown = c && c.step === 'shown', res = shown ? c.res : null;
    var arena = c ? G.arenaById(c.arena) : null;
    var duel = '<div class="duel">' + [0, 1].map(function (i) {
      return cardHTML(ids[i], { compact: true, hot: arena ? arena.virtue : null, arena: arena, wins: [m.w[i], need], spent: m.used[i], state: res ? (res.win === i ? 'win' : 'lose') : '' });
    }).join('<div class="vs">VS</div>') + '</div>';
    var body = '';
    if (!c) {
      body = '<div class="qbox"><p class="muted" style="margin:0">' + esc(sn(m.a)) + ' and ' + esc(sn(m.b)) + ' step forward.</p></div>';
    } else {
      var q = CS.QUESTIONS[c.qid];
      body = arenaHTML(c) + '<div class="qbox"><h4>The question</h4><p class="q">' + esc(q.q) + '</p>';
      if (mode === 'play') {
        var pid = S.me.id, i = m.a === pid ? 0 : 1, s = selFor(pid, c.key), mine = ansFor(pid, c.key), cd = cardOf(pid);
        var locked = !!mine || shown, pickPos = mine ? mine.choice : s.pick;
        body += optsHTML(c, { interactive: true, pid: pid, pick: pickPos, locked: locked, m: m });
        if (!shown) {
          var spent = m.used[i], on = mine ? mine.ability : s.abil;
          body += '<div class="ctl"><button class="btn' + (on ? ' primary' : '') + '" data-act="abil" data-pid="' + esc(pid) + '"' + ((spent || mine) ? ' disabled' : '') + '>'
            + (spent ? 'Intercession spent' : (on ? 'Invoking: ' : 'Invoke: ') + esc(cd.ability.name) + ' (' + esc(EFFECT_TAGS[cd.ability.effect]) + ')') + '</button>'
            + '<button class="btn primary" data-act="lock" data-pid="' + esc(pid) + '"' + (mine ? ' disabled' : '') + '>' + (mine ? 'Locked in' : 'Lock in answer') + '</button></div>'
            + '<p class="note">' + (mine ? 'Locked in. The host reveals the clash when both saints are ready.' : 'Your intercession works once per match. Pick an answer, decide, then lock in.') + '</p>';
        }
      } else {
        body += optsHTML(c, { interactive: false, m: m });
        if (!shown && mode === 'host') {
          body += '<div class="status">' + [0, 1].map(function (i) {
            var a = ansFor(ids[i], c.key);
            return '<div class="' + (a ? 'ok' : '') + '"><b>' + esc(sn(ids[i])) + '</b><br>' + (a ? 'Locked in' + (a.ability ? ' · intercession' : '') : 'Thinking…') + (a ? '' : overrideHTML(ids[i], c)) + '</div>';
          }).join('') + '</div>';
        }
      }
      if (shown) body += resHTML(m, c) + '<p class="note">' + esc(q.n) + '</p>';
      body += '</div>';
    }
    var ctl = '';
    if (mode === 'host') {
      var lockedN = c && c.step === 'ask' ? ids.filter(function (id) { return ansFor(id, c.key); }).length : 0, btn;
      if (!c) btn = '<button class="btn primary big" data-act="open">Open clash ' + (m.w[0] + m.w[1] + 1) + '</button>';
      else if (c.step === 'ask') btn = '<button class="btn primary big" data-act="reveal">Reveal the clash (' + lockedN + '/2 locked)</button>';
      else if (m.winner) btn = '<button class="btn primary big" data-act="finish">' + esc(sn(m.winner)) + ' wins the match. Continue</button>';
      else btn = '<button class="btn primary big" data-act="next">Next clash</button>';
      ctl = '<div class="ctl">' + btn + '</div><details><summary>Host tools</summary><div class="row" style="margin-top:8px">'
        + '<button class="btn sm" data-act="award" data-i="0">Award match to ' + esc(sn(m.a)) + '</button>' + (m.b ? '<button class="btn sm" data-act="award" data-i="1">Award match to ' + esc(sn(m.b)) + '</button>' : '') + '</div></details>';
    }
    return '<section class="panel gold">' + head + duel + body + ctl + '</section>';
  }
  function bracketHTML(g) {
    var rounds = (g.history || []).slice();
    if (g.phase === 'play') rounds.push({ round: g.roundNo, matches: g.matches, live: true });
    if (!rounds.length) return '';
    var lab = function (id) { return esc(sn(id)) + ' <small>' + esc(pn(id)) + '</small>'; };
    return '<section class="panel"><h4>The bracket</h4>' + rounds.map(function (r) {
      return '<div class="rnd"><h4 style="color:var(--muted)">Round ' + r.round + (r.live ? ' · now' : '') + '</h4><ul>' + r.matches.map(function (m, i) {
        var now = r.live && g.cur === i;
        if (!m.b) return '<li>' + lab(m.a) + ' <small>draws a bye</small></li>';
        var cls = function (id) { return m.winner ? (m.winner === id ? 'w' : 'l') : ''; };
        var score = (r.live && m.w && !m.winner && (m.w[0] + m.w[1])) ? ' <small>(' + m.w[0] + '–' + m.w[1] + ')</small>' : '';
        return '<li class="' + (now ? 'now' : '') + '"><span class="' + cls(m.a) + '">' + lab(m.a) + '</span> vs <span class="' + cls(m.b) + '">' + lab(m.b) + '</span>' + score + '</li>';
      }).join('') + '</ul></div>';
    }).join('') + '</section>';
  }
  function champHTML(g) {
    return '<section class="panel gold"><div class="champ"><p class="eyebrow">Champion of the Communion</p><h2>' + esc(sn(g.champion)) + '</h2>'
      + cardHTML(g.champion, { state: 'win' }) + '<p class="muted">Confirmed as ' + esc(pn(g.champion)) + '’s patron, and the last saint standing.</p></div></section>';
  }
  function allCards() { return '<details><summary>Every saint’s card</summary>' + rosterHTML() + '</details>'; }

  /* ---------- join / QR panel ---------- */
  var qrCache = {};
  function qrSvg(url) {
    if (qrCache[url]) return qrCache[url];
    try { var q = qrcode(0, 'M'); q.addData(url); q.make(); qrCache[url] = q.createSvgTag({ cellSize: 4, margin: 4, scalable: true }); }
    catch (e) { qrCache[url] = ''; }
    return qrCache[url];
  }
  function joinUrl() { return baseUrl() + '?g=' + CODE + MOCK_EXTRA; }
  function hostUrl() { return baseUrl() + '?g=' + CODE + '&h=1' + MOCK_EXTRA + '#k=' + S.hostKey; }
  function joinPanelHTML() {
    var url = joinUrl();
    return '<section class="panel gold"><div class="qrbox"><div class="qr" aria-label="QR code to join">' + qrSvg(url) + '</div><div>'
      + '<p class="eyebrow">Join the Communion</p><div class="code" aria-label="Game code">' + esc(CODE) + '</div>'
      + '<p class="url">Scan the code, or open<br><b>' + esc(url.replace(/^https?:\/\//, '')) + '</b></p>'
      + '<div class="row"><button class="btn sm" data-act="copy" data-v="join">Copy join link</button></div></div></div></section>';
  }

  /* ---------- views ---------- */
  function badges() {
    var b = [];
    if (api.kind === 'mock') b.push('<span class="badge warn">Test mode</span>');
    if (CODE) b.push('<span class="badge on">' + (S.isHost ? 'Host' : 'Pilgrim') + '</span>');
    if (CODE && S.loaded) b.push('<span class="badge">' + ({ lobby: 'Gathering', dealt: 'Dealt', play: 'Round ' + (S.state && S.state.roundNo), done: 'Concluded' }[phaseOf()] || '') + '</span>');
    if (!S.online) b.push('<span class="badge warn">Reconnecting</span>');
    if (S.saveErr) b.push('<span class="badge warn">Not saved</span>');
    $('badges').innerHTML = b.join('');
  }
  function setForm(show, o) {
    var fs = $('formSection'); fs.hidden = !show; if (!show) return;
    o = o || {};
    $('formTitle').textContent = o.title; $('formLead').textContent = o.lead || '';
    $('nameLbl').textContent = o.nameLbl || 'Your name';
    $('fGo').textContent = o.go || 'Join the Communion';
  }
  function landing() {
    var test = api.kind === 'mock' ? '<section class="panel test"><b>Test mode.</b> Games are stored in this browser only, so every tab on this computer can be a different player. Fill in <code>config.js</code> to play across phones.</section>' : '';
    $('top').innerHTML = test + '<div class="landing">'
      + '<section class="panel gold"><p class="eyebrow">Run the game</p><h2>Host a game</h2><p class="muted">You get a code and a QR for everyone to scan. Put this screen on the projector.</p><button class="btn primary big" data-act="newgame">Host a new game</button></section>'
      + '<section class="panel"><p class="eyebrow">Take your seat</p><h2>Join with a code</h2><div class="fld"><label for="codeIn">Game code</label><input type="text" id="codeIn" class="codein" maxlength="4" autocapitalize="characters" autocomplete="off" placeholder="ABCD"></div><button class="btn big" data-act="joincode">Join</button></section></div>';
    $('bottom').innerHTML = ''; setForm(false);
  }
  function hostView(g, phase) {
    var top = $('top'), bottom = $('bottom'), n = S.order.length;
    if (phase === 'lobby') {
      $('main').className = 'hostlobby';
      var fmt = g.format || 'standard';
      top.innerHTML = joinPanelHTML()
        + '<section class="panel"><p class="eyebrow">Gathering the saints</p><h2>' + n + ' saint' + (n === 1 ? '' : 's') + ' in the Communion</h2>'
        + '<div class="seg" role="group" aria-label="Match length"><button class="segbtn' + (fmt === 'standard' ? ' on' : '') + '" data-act="format" data-v="standard">Best of 3 every match</button><button class="segbtn' + (fmt === 'quick' ? ' on' : '') + '" data-act="format" data-v="quick">Quick: one clash until the final</button></div>'
        + (n >= 2 ? '<p class="small muted">About ' + G.estimateMinutes(n, fmt) + ' minutes for ' + (n - 1) + ' matches.</p>' : '<p class="small muted">Waiting for at least two saints.</p>')
        + '<div class="row"><button class="btn primary big" data-act="deal"' + (n < 2 ? ' disabled' : '') + '>Deal the cards</button>'
        + (n ? (ui.confirm === 'clear' ? '<button class="btn danger" data-act="clear">Confirm: remove everyone</button>' : '<button class="btn" data-act="clear">Remove all saints</button>') : '') + '</div>'
        + '<details><summary>Host recovery link</summary><p class="small muted">Opens this game as host on another device or after clearing your browser. Keep it private.</p><button class="btn sm" data-act="copy" data-v="host">Copy host link</button></details></section>';
      bottom.innerHTML = rosterHTML({ tools: true });
      setForm(true, { title: 'Add a saint for someone', lead: 'Use this for a player without a phone. Everyone else joins by scanning the code.', nameLbl: 'Their name', go: 'Add this saint' });
      return;
    }
    setForm(false);
    if (phase === 'dealt') {
      top.innerHTML = '<section class="panel gold"><p class="eyebrow">The cards are dealt</p><h2>Look at what the saints were given</h2><p class="muted">Each saint’s type guarantees one strong virtue. The rest was luck. Not happy with the draw? Deal again.</p>'
        + '<div class="ctl"><button class="btn primary big" data-act="begin">Begin round 1</button><button class="btn" data-act="deal">Deal again</button><button class="btn" data-act="reset">Back to the lobby</button></div></section>';
      bottom.innerHTML = rosterHTML({ deal: true });
    } else if (phase === 'play') {
      top.innerHTML = stageHTML(g, 'host');
      bottom.innerHTML = bracketHTML(g) + allCards() + '<div class="row">' + (ui.confirm === 'reset' ? '<button class="btn danger" data-act="reset">Confirm: back to the lobby</button>' : '<button class="btn sm" data-act="reset">End game and return to lobby</button>') + '</div>';
    } else {
      top.innerHTML = champHTML(g);
      bottom.innerHTML = bracketHTML(g) + '<div class="row"><button class="btn primary" data-act="reset">Play again with the same saints</button></div>';
    }
  }
  function playerView(g, phase) {
    var top = $('top'), bottom = $('bottom'), me = S.me && S.players[S.me.id];
    if (!me) {
      if (phase === 'lobby') {
        top.innerHTML = '<section class="panel"><p class="eyebrow">Welcome, pilgrim</p><h2>Who is your confirmation saint?</h2><p class="muted" style="margin:0">Enter your saint and pick what kind of saint they were. Your strength is dealt by luck, so there is nothing to optimize. Just describe your saint honestly.</p></section>';
        setForm(true, { title: 'Enter your saint', lead: '', go: 'Join the Communion' });
        bottom.innerHTML = S.order.length ? '<h4>Already in the hall</h4>' + rosterHTML() : '';
        return;
      }
      setForm(false);
      top.innerHTML = '<section class="panel"><p class="muted" style="margin:0">The tournament has already begun, so you are watching from the pews.</p></section>' + (phase === 'play' ? stageHTML(g, 'watch') : phase === 'done' ? champHTML(g) : '');
      bottom.innerHTML = (phase === 'play' ? bracketHTML(g) : '') + rosterHTML();
      return;
    }
    setForm(false);
    var pid = S.me.id;
    if (phase === 'lobby') {
      top.innerHTML = '<section class="panel gold"><p class="eyebrow">Your saint</p><h2>You are in, ' + esc(me.name) + '</h2><p class="muted">Waiting for the host to deal the cards.</p>'
        + '<div class="roster" style="grid-template-columns:minmax(0,340px)">' + cardHTML(pid) + '</div>'
        + '<div class="row" style="margin-top:14px"><button class="btn sm" data-act="leave">Choose a different saint</button></div></section>';
      bottom.innerHTML = '<h4>In the hall</h4>' + rosterHTML();
    } else if (phase === 'dealt') {
      top.innerHTML = '<section class="panel gold"><p class="eyebrow">Your saint is dealt</p><h2>Here is what you were given</h2><p class="muted">Your type sets your strongest virtue and your special power. The rest is luck. Waiting for the host to begin.</p><div class="roster" style="grid-template-columns:minmax(0,340px)">' + cardHTML(pid) + '</div></section>';
      bottom.innerHTML = '<h4>The whole hall</h4>' + rosterHTML({ deal: true });
    } else if (phase === 'play') {
      var m = g.matches[g.cur], mine = m && m.b && (m.a === pid || m.b === pid), st = G.statusFor(g, pid), line = '';
      if (st === 'out') line = 'Your saint has fallen in the contest, but the Communion is cheering them on. Watch the rest from here.';
      else if (g.cur !== -1 && !mine) { var bye = g.matches.some(function (x) { return !x.b && x.a === pid; }); line = bye ? 'Your saint draws a bye this round.' : 'Your match is coming up. Watch the stage and get ready.'; }
      top.innerHTML = (line ? '<section class="panel"><p style="margin:0">' + esc(line) + '</p></section>' : '') + stageHTML(g, mine && g.cur !== -1 ? 'play' : 'watch');
      bottom.innerHTML = bracketHTML(g) + allCards();
    } else {
      top.innerHTML = champHTML(g); bottom.innerHTML = bracketHTML(g);
    }
  }
  function paint() {
    badges();
    var main = $('main'); main.className = '';
    if (!CODE) { landing(); return; }
    if (!S.loaded) { $('top').innerHTML = '<div class="panel muted">Lighting the candles…</div>'; $('bottom').innerHTML = ''; setForm(false); return; }
    if (S.missing) {
      $('top').innerHTML = '<section class="panel"><h2>No game with code ' + esc(CODE) + '</h2><p class="muted">Check the code, or ask the host for a fresh QR. Old games are cleared after a few days.</p><a class="btn" href="./' + (MOCK_EXTRA ? '?mock=1' : '') + '">Back to start</a></section>';
      $('bottom').innerHTML = ''; setForm(false); return;
    }
    var g = S.state || { phase: 'lobby', format: 'standard' };
    if (S.isHost) hostView(g, phaseOf()); else playerView(g, phaseOf());
  }
  var raf = 0;
  function render() {
    if (raf) return;
    raf = requestAnimationFrame(function () { raf = 0; paint(); });
    setTimeout(function () { if (raf) { cancelAnimationFrame(raf); raf = 0; paint(); } }, 150);
  }

  /* ---------- polling ---------- */
  var lastSig = '', timer = 0;
  async function refreshAnswers() {
    if (!S.isHost) return;
    var list = await api.getAnswers(CODE, S.hostKey), m = {};
    (list || []).forEach(function (a) { m[a.player_id] = { key: a.key, choice: a.choice, ability: a.ability }; });
    S.answers = m;
  }
  async function tick() {
    if (!CODE) return;
    clearTimeout(timer);
    try {
      var data = await api.getGame(CODE);
      S.online = true;
      if (!data) { S.missing = true; }
      else {
        S.missing = false;
        var pl = {}, order = [];
        data.players.forEach(function (p) { pl[p.id] = p; order.push(p.id); });
        S.players = pl; S.order = order;
        if (S.isHost) { if (!S.stateLoaded) { S.state = data.state; S.stateLoaded = true; } }   // the host is the source of truth after the first load
        else S.state = data.state;
        if (S.isHost && S.state && S.state.phase === 'play' && S.state.clash && S.state.clash.step === 'ask') await refreshAnswers();
        if (S.isHost && S.saveErr && S.state) saveState(S.state);
      }
      S.loaded = true;
    } catch (e) { S.online = false; S.loaded = S.loaded || false; }
    var sig = JSON.stringify([S.players, S.order, S.state, S.answers, S.online, S.missing, S.loaded, S.saveErr, S.myAns, S.me && S.me.id]);
    if (sig !== lastSig) { lastSig = sig; render(); }
    timer = setTimeout(tick, S.online ? 1500 : 3500);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && CODE) tick(); });

  /* ---------- host actions ---------- */
  var saving = Promise.resolve();
  function saveState(s) {
    S.state = s; S.stateLoaded = true; render();
    saving = saving.then(async function () {
      for (var i = 0; i < 3; i++) {
        try { await api.setState(CODE, S.hostKey, s); S.saveErr = false; return; }
        catch (e) { if (i === 2) { S.saveErr = true; toast('Could not save: ' + e.message); render(); } else await wait(600); }
      }
    });
  }
  function cur() { return S.state || { phase: 'lobby', format: 'standard' }; }
  async function revealClash() {
    try { await refreshAnswers(); } catch (e) { toast('Could not read answers. Reveal anyway uses what the host screen has.'); }
    saveState(G.resolveClash(S.state, S.players, S.answers));
  }
  async function hostLock(pid) {
    var c = S.state.clash, s = selFor(pid, c.key);
    if (s.pick == null) { toast('Pick an answer first.'); return; }
    try { await api.hostAnswer(CODE, S.hostKey, pid, c.key, s.pick, s.abil); S.answers[pid] = { key: c.key, choice: s.pick, ability: s.abil }; render(); }
    catch (e) { toast(e.message); }
  }

  /* ---------- player actions ---------- */
  async function lockMe() {
    var c = S.state && S.state.clash; if (!c || !S.me) return;
    var s = selFor(S.me.id, c.key);
    if (s.pick == null) { toast('Pick an answer first.'); return; }
    try {
      await api.submitAnswer(CODE, S.me.id, S.me.secret, c.key, s.pick, s.abil);
      S.myAns = { key: c.key, choice: s.pick, ability: s.abil }; store.set(ansKey(), JSON.stringify(S.myAns)); render();
    } catch (e) { toast(e.message || 'Could not lock in. Try again.'); }
  }

  /* ---------- form ---------- */
  function buildPickers() {
    $('mainPick').innerHTML = TYPE_KEYS.map(function (k) {
      return '<label class="topt"><input class="sr" type="radio" name="mainType" value="' + k + '"><b>' + esc(TYPES[k].label) + '</b><span class="h">' + esc(TYPES[k].hint) + '</span></label>';
    }).join('');
    $('sidePick').innerHTML = '<label class="topt on"><input class="sr" type="radio" name="sideType" value="" checked><b>None</b></label>' + TYPE_KEYS.map(function (k) {
      return '<label class="topt"><input class="sr" type="radio" name="sideType" value="' + k + '"><b>' + esc(TYPES[k].label) + '</b></label>';
    }).join('');
  }
  $('joinForm').addEventListener('change', function (e) {
    if (e.target.type !== 'radio') return;
    Array.prototype.forEach.call($('joinForm').querySelectorAll('input[name="' + e.target.name + '"]'), function (r) { r.closest('.topt').classList.toggle('on', r.checked); });
  });
  $('joinForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    if (ui.busy || !CODE) return;
    var name = $('fName').value.trim(), saint = $('fSaint').value.trim(), blurb = $('fBlurb').value.trim();
    var main = ($('joinForm').querySelector('input[name="mainType"]:checked') || {}).value;
    var side = ($('joinForm').querySelector('input[name="sideType"]:checked') || {}).value;
    var msg = $('fMsg'); msg.className = 'msg';
    if (!name) { msg.textContent = 'Enter a name.'; msg.className = 'msg bad'; return; }
    if (!saint) { msg.textContent = 'Enter a saint.'; msg.className = 'msg bad'; return; }
    if (!main) { msg.textContent = 'Pick a main type for your saint.'; msg.className = 'msg bad'; return; }
    var types = [main]; if (side && side !== main) types.push(side);
    ui.busy = true; $('fGo').disabled = true; msg.textContent = 'Joining…';
    try {
      if (S.isHost) {
        await api.hostAddPlayer(CODE, S.hostKey, { id: uuid(), name: name, saint: saint, types: types, blurb: blurb });
        $('fName').value = ''; $('fSaint').value = ''; $('fBlurb').value = '';
        Array.prototype.forEach.call($('joinForm').querySelectorAll('input[type=radio]'), function (r) { r.checked = (r.value === ''); r.closest('.topt').classList.toggle('on', r.checked); });
        msg.textContent = 'Added.'; toast('A saint joins the Communion.');
      } else {
        var me = ensureMe();
        await api.join(CODE, { id: me.id, secret: me.secret, name: name, saint: saint, types: types, blurb: blurb });
        store.set('cos.name', name);
        msg.textContent = '';
      }
      tick();
    } catch (err) { msg.textContent = err.message || 'Could not join. Try again.'; msg.className = 'msg bad'; }
    ui.busy = false; $('fGo').disabled = false;
  });

  /* ---------- clicks ---------- */
  document.addEventListener('click', async function (e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var act = b.getAttribute('data-act'), id = b.getAttribute('data-id'), pid = b.getAttribute('data-pid'), g = S.state;
    if (act === 'newgame') {
      b.disabled = true; var hk = rid(16);
      for (var i = 0; i < 8; i++) {
        var code = randCode();
        try { await api.createGame(code, hk); store.set('cos.hk.' + code, hk); location.href = '?g=' + code + '&h=1' + MOCK_EXTRA; return; }
        catch (err) { if (!/duplicate|unique|already/i.test(err.message || '')) { toast(err.message || 'Could not create the game.'); b.disabled = false; return; } }
      }
      b.disabled = false; toast('Could not find a free code. Try again.'); return;
    }
    if (act === 'joincode') { var v = ($('codeIn').value || '').toUpperCase().replace(/[^A-Z]/g, ''); if (v.length !== 4) { toast('Codes are four letters.'); return; } location.href = '?g=' + v + MOCK_EXTRA; return; }
    if (act === 'copy') {
      var text = b.getAttribute('data-v') === 'host' ? hostUrl() : joinUrl();
      try { await navigator.clipboard.writeText(text); toast('Link copied.'); } catch (err) { toast(text); }
      return;
    }
    if (act === 'pick') { if (!g || !g.clash) return; selFor(pid, g.clash.key).pick = Number(b.getAttribute('data-pos')); render(); return; }
    if (act === 'abil') { if (!g || !g.clash) return; var s2 = selFor(pid, g.clash.key); s2.abil = !s2.abil; render(); return; }
    if (act === 'lock') { if (S.isHost) hostLock(pid); else lockMe(); return; }
    if (act === 'ovtoggle') { ui.ov[pid] = !ui.ov[pid]; render(); return; }
    if (act === 'leave') { try { await api.leave(CODE, S.me.id, S.me.secret); tick(); } catch (err) { toast(err.message); } return; }
    if (!S.isHost) return;
    // everything below is host-only
    if (act === 'format') saveState({ phase: 'lobby', format: b.getAttribute('data-v') });
    else if (act === 'deal') saveState(G.dealCards(cur(), S.players));
    else if (act === 'begin') saveState(G.beginPlay(S.state));
    else if (act === 'open') saveState(G.startClash(S.state));
    else if (act === 'reveal') revealClash();
    else if (act === 'next') saveState(G.nextClash(S.state));
    else if (act === 'finish') saveState(G.finishMatch(S.state));
    else if (act === 'round') saveState(G.endRound(S.state));
    else if (act === 'award') saveState(G.award(S.state, Number(b.getAttribute('data-i'))));
    else if (act === 'reset') {
      if (phaseOf() === 'play' && ui.confirm !== 'reset') { ui.confirm = 'reset'; render(); return; }
      ui.confirm = ''; saveState(G.backToLobby(cur()));
    }
    else if (act === 'kick') { try { await api.kick(CODE, S.hostKey, id); tick(); } catch (err) { toast(err.message); } }
    else if (act === 'clear') {
      if (ui.confirm !== 'clear') { ui.confirm = 'clear'; render(); return; }
      ui.confirm = ''; try { await api.clearPlayers(CODE, S.hostKey); tick(); } catch (err) { toast(err.message); }
    }
  });

  /* ---------- boot ---------- */
  buildPickers();
  var savedName = store.get('cos.name'); if (savedName && !S.isHost) $('fName').value = savedName;
  paint();
  if (CODE) tick();
})();
