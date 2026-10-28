/* Talks to the backend. Two interchangeable versions with the same methods:
     - supabase: real, shared between phones (used when config.js has your project details)
     - mock:     fake, stored in this browser's localStorage, so every tab on ONE computer shares a game.
                 This is test mode: add ?mock=1 to the address. No accounts, no setup.
   Everything the app needs is a function below, so the rest of the code never knows which one it is using. */
(function (g) {
  var CS = g.CS;

  /* ---------- real backend (Supabase over plain fetch, no library needed) ---------- */
  function supabaseApi(url, key) {
    url = url.replace(/\/+$/, '');
    var headers = { 'Content-Type': 'application/json', apikey: key };
    // Legacy "anon" keys are JWTs and want a Bearer header. New "sb_publishable_" keys do not.
    if (key.indexOf('sb_') !== 0) headers.Authorization = 'Bearer ' + key;
    function call(fn, args) {
      return fetch(url + '/rest/v1/rpc/' + fn, { method: 'POST', headers: headers, body: JSON.stringify(args || {}) })
        .then(function (r) {
          return r.text().then(function (t) {
            var body = null;
            try { body = t ? JSON.parse(t) : null; } catch (e) { body = null; }
            if (!r.ok) {
              var e = new Error((body && (body.message || body.hint)) || ('Request failed (' + r.status + ')'));
              e.status = r.status; throw e;
            }
            return body;
          });
        });
    }
    return {
      kind: 'supabase',
      createGame: function (code, hostKey) { return call('create_game', { p_code: code, p_host_key: hostKey }); },
      getGame: function (code) { return call('get_game', { p_code: code }); },
      join: function (code, p) { return call('join_game', { p_code: code, p_id: p.id, p_secret: p.secret, p_name: p.name, p_saint: p.saint, p_types: p.types, p_blurb: p.blurb || '' }); },
      leave: function (code, id, secret) { return call('leave_game', { p_code: code, p_id: id, p_secret: secret }); },
      submitAnswer: function (code, id, secret, key, choice, ability) { return call('submit_answer', { p_code: code, p_id: id, p_secret: secret, p_key: key, p_choice: choice, p_ability: !!ability }); },
      setState: function (code, hk, state) { return call('set_state', { p_code: code, p_host_key: hk, p_state: state }); },
      getAnswers: function (code, hk) { return call('get_answers', { p_code: code, p_host_key: hk }); },
      hostAddPlayer: function (code, hk, p) { return call('host_add_player', { p_code: code, p_host_key: hk, p_id: p.id, p_name: p.name, p_saint: p.saint, p_types: p.types, p_blurb: p.blurb || '' }); },
      hostAnswer: function (code, hk, pid, key, choice, ability) { return call('host_answer', { p_code: code, p_host_key: hk, p_player_id: pid, p_key: key, p_choice: choice, p_ability: !!ability }); },
      kick: function (code, hk, id) { return call('kick_player', { p_code: code, p_host_key: hk, p_id: id }); },
      clearPlayers: function (code, hk) { return call('clear_players', { p_code: code, p_host_key: hk }); }
    };
  }

  /* ---------- test-mode backend (localStorage) ---------- */
  function mockApi() {
    var KEY = 'cos.mock.v1';
    function load() { try { return JSON.parse(localStorage.getItem(KEY)) || { games: {} }; } catch (e) { return { games: {} }; } }
    function save(db) { localStorage.setItem(KEY, JSON.stringify(db)); }
    function run(fn) {
      return new Promise(function (resolve, reject) {
        try { var db = load(); var out = fn(db); save(db); resolve(out === undefined ? null : out); }
        catch (e) { reject(e); }
      });
    }
    function game(db, code) { var gm = db.games[code]; if (!gm) throw new Error('No game with that code.'); return gm; }
    function host(db, code, hk) { var gm = game(db, code); if (!hk || gm.hostKey !== hk) throw new Error('Not the host.'); return gm; }
    function phase(gm) { return (gm.state && gm.state.phase) || 'lobby'; }
    function checkPerson(p) {
      var name = (p.name || '').trim(), saint = (p.saint || '').trim();
      if (!name || name.length > 40) throw new Error('Enter a name (40 characters max).');
      if (!saint || saint.length > 60) throw new Error('Enter a saint (60 characters max).');
      if ((p.blurb || '').length > 160) throw new Error('Keep the line about your saint under 160 characters.');
      var t = p.types || [];
      if (t.length < 1 || t.length > 2) throw new Error('Pick one or two saint types.');
      t.forEach(function (x) { if (!CS.TYPES[x]) throw new Error('Unknown saint type.'); });
    }
    function upsertAnswer(gm, pid, key, choice, ability) { gm.answers[pid] = { player_id: pid, key: key, choice: choice, ability: !!ability }; }
    return {
      kind: 'mock',
      createGame: function (code, hk) { return run(function (db) { if (db.games[code]) throw new Error('duplicate'); db.games[code] = { hostKey: hk, state: { phase: 'lobby', format: 'standard' }, players: [], answers: {} }; }); },
      getGame: function (code) {
        return run(function (db) {
          var gm = db.games[code]; if (!gm) return null;
          return { state: gm.state, players: gm.players.map(function (p) { return { id: p.id, name: p.name, saint: p.saint, types: p.types, blurb: p.blurb }; }) };
        });
      },
      join: function (code, p) {
        return run(function (db) {
          var gm = game(db, code);
          if (phase(gm) !== 'lobby') throw new Error('The game has already started.');
          checkPerson(p);
          var ex = gm.players.filter(function (x) { return x.id === p.id; })[0];
          if (ex) { if (ex.secret !== p.secret) throw new Error('That seat belongs to someone else.'); ex.name = p.name.trim(); ex.saint = p.saint.trim(); ex.types = p.types; ex.blurb = p.blurb || ''; }
          else { if (gm.players.length >= 40) throw new Error('This game is full.'); gm.players.push({ id: p.id, secret: p.secret, name: p.name.trim(), saint: p.saint.trim(), types: p.types, blurb: (p.blurb || '').trim() }); }
        });
      },
      leave: function (code, id, secret) { return run(function (db) { var gm = game(db, code); if (phase(gm) === 'lobby') gm.players = gm.players.filter(function (x) { return !(x.id === id && x.secret === secret); }); }); },
      submitAnswer: function (code, id, secret, key, choice, ability) {
        return run(function (db) {
          var gm = game(db, code);
          if (!gm.players.some(function (x) { return x.id === id && x.secret === secret; })) throw new Error('Not a player in this game.');
          upsertAnswer(gm, id, key, choice, ability);
        });
      },
      setState: function (code, hk, state) { return run(function (db) { host(db, code, hk).state = state; }); },
      getAnswers: function (code, hk) { return run(function (db) { var gm = host(db, code, hk); return Object.keys(gm.answers).map(function (k) { return gm.answers[k]; }); }); },
      hostAddPlayer: function (code, hk, p) {
        return run(function (db) {
          var gm = host(db, code, hk);
          if (phase(gm) !== 'lobby') throw new Error('The game has already started.');
          checkPerson(p);
          gm.players.push({ id: p.id, secret: 'host-added', name: p.name.trim(), saint: p.saint.trim(), types: p.types, blurb: (p.blurb || '').trim() });
        });
      },
      hostAnswer: function (code, hk, pid, key, choice, ability) { return run(function (db) { upsertAnswer(host(db, code, hk), pid, key, choice, ability); }); },
      kick: function (code, hk, id) { return run(function (db) { var gm = host(db, code, hk); gm.players = gm.players.filter(function (x) { return x.id !== id; }); }); },
      clearPlayers: function (code, hk) { return run(function (db) { host(db, code, hk).players = []; }); }
    };
  }

  /* Pick the backend. Test mode is on when the address has ?mock=1, or when config.js is not filled in yet. */
  CS.makeApi = function (config) {
    var qs = (typeof location !== 'undefined' ? location.search : '') || '';
    var forceMock = /[?&]mock(=1|=true|&|$)/.test(qs);
    var ready = config && config.SUPABASE_URL && config.SUPABASE_KEY && config.SUPABASE_URL.indexOf('YOUR-PROJECT') < 0 && config.SUPABASE_KEY.indexOf('YOUR-') < 0;
    return (forceMock || !ready) ? mockApi() : supabaseApi(config.SUPABASE_URL, config.SUPABASE_KEY);
  };
  CS._supabaseApi = supabaseApi; // exposed for tests
})(typeof window !== 'undefined' ? window : globalThis);
