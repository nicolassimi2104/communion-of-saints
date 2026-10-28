// Run with: node tests/game.test.js
const assert = require('assert');
require('../data.js');
require('../game.js');
const CS = globalThis.CS, G = CS.game, R = CS.RULES;

// small seeded RNG so failures are reproducible
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}

// 1. every card has the same total and stays inside min/max
const rng = mulberry(1);
const typeKeys = Object.keys(CS.TYPES);
for (let i = 0; i < 5000; i++) {
  const main = typeKeys[Math.floor(rng()*8)], side = rng()<.5 ? typeKeys[Math.floor(rng()*8)] : null;
  const s = G.dealStats(side ? [main, side] : [main], rng);
  const vals = Object.values(s);
  assert.strictEqual(vals.reduce((a,b)=>a+b,0), R.TOTAL, 'total must be '+R.TOTAL);
  vals.forEach(v => assert(v >= R.MIN && v <= R.MAX, 'stat out of range '+v));
}
console.log('ok  5000 hands: total always', R.TOTAL, ', every stat within', R.MIN, '-', R.MAX);

// 2. what does a hand look like? and how much does type matter vs luck?
const hands = {};
typeKeys.forEach(t => {
  const sums = {faith:0,courage:0,wisdom:0,charity:0,perseverance:0}; const N=4000;
  let topIsSig = 0, spread = 0;
  for (let i=0;i<N;i++){ const s=G.dealStats([t],rng); for(const k in s) sums[k]+=s[k];
    const best=G.bestVirtue(s); if(best===CS.TYPES[t].sig) topIsSig++;
    const v=Object.values(s).sort((a,b)=>b-a); spread += v[0]-v[4]; }
  hands[t] = {avg: Object.fromEntries(Object.entries(sums).map(([k,v])=>[k,(v/N).toFixed(1)])), sigIsBest: (100*topIsSig/N).toFixed(0)+'%', avgHighLow: (spread/N).toFixed(1)};
});
console.log('\nAverage hand by main type (luck fills the rest), how often the signature virtue is the saint\'s top virtue, and average high-low spread:');
console.table(Object.fromEntries(typeKeys.map(t=>[t, Object.assign({sig:CS.TYPES[t].sig, sigIsBest:hands[t].sigIsBest, spread:hands[t].avgHighLow}, hands[t].avg)])));

// 3. sample hands so you can eyeball the luck
console.log('Ten random Martyr hands (faith, courage, wisdom, charity, perseverance):');
for (let i=0;i<10;i++){ const s=G.dealStats(['martyr'],rng); console.log('  ', CS.VIRTUES.map(v=>s[v.k]).join(' ')); }

// 4. arena fairness: how often does each type get a home bonus across arenas
const home = {}; typeKeys.forEach(t => home[t] = CS.ARENAS.filter(a=>a.favors.includes(t)).length);
console.log('\nArenas that favor each type:', JSON.stringify(home));
Object.values(home).forEach(n => assert(n >= 2, 'every type should be at home somewhere'));

// 5. simulate whole tournaments with random players, abilities used at random, and check invariants
const tiers = {}, byRound = {};
function sim(nPlayers, format, seed) {
  const r = mulberry(seed);
  const players = {};
  for (let i=0;i<nPlayers;i++){
    const t=[typeKeys[Math.floor(r()*8)]]; if(r()<.4) t.push(typeKeys[Math.floor(r()*8)]);
    players['p'+i] = { name:'P'+i, saint:'S'+i, types:t };
  }
  let s = G.dealCards({phase:'lobby', format}, players, r);
  assert.strictEqual(Object.keys(s.cards).length, nPlayers);
  s = G.beginPlay(s, r);
  let clashes = 0, matches = 0, guard = 0, abilitiesUsed = {};
  while (s.phase === 'play' && guard++ < 2000) {
    if (s.cur === -1) { s = G.endRound(s, r); continue; }
    const m = s.matches[s.cur];
    if (!s.clash) s = G.startClash(s, r);
    const c = s.clash;
    const answers = {};
    [m.a, m.b].forEach(id => { answers[id] = { key: c.key, choice: Math.floor(r()*4), ability: r() < .5 }; });
    s = G.resolveClash(s, players, answers, r);
    clashes++;
    const res = s.clash.res;
    res.eff.forEach(e => { if (e) abilitiesUsed[e] = (abilitiesUsed[e]||0)+1; });
    [0,1].forEach(i => assert.strictEqual(res.total[i], res.base[i]+res.die[i]+res.home[i]+res.qb[i]+res.adj[i]));
    // the plain-English explanation and the host script must always read cleanly
    const ids = [m.a, m.b], ctx = { saint: ids.map(i => players[i].saint), person: ids.map(i => players[i].name), types: ids.map(i => players[i].types) };
    const ex = G.explain(s, ctx);
    assert(ex.beats.length >= 5 && ex.summary, 'explain gives beats and a summary');
    const said = ex.beats.map(b => b.text).concat(ex.summary, G.script(s, ctx));
    said.flat().forEach(t => assert(typeof t === 'string' && t && !/undefined|NaN|null/.test(t), 'bad narration line: ' + t));
    tiers[res.worth] = (tiers[res.worth] || 0) + 1;
    (byRound[s.roundNo + '/' + s.totalRounds] = byRound[s.roundNo + '/' + s.totalRounds] || []).push(res.worth);
    if (s.matches[s.cur].winner) { s = G.finishMatch(s); matches++; }
    else s = G.nextClash(s, r);
  }
  assert.strictEqual(s.phase, 'done', 'tournament must finish');
  assert(players[s.champion], 'champion must be a real player');
  return { clashes, matches, rounds: s.history.length, abilitiesUsed };
}
const all = {};
[2,3,5,6,7,8,9,10,13,16].forEach(n => ['standard','quick'].forEach(f => {
  const out = sim(n, f, n*7 + f.length);
  all[n+' '+f] = { rounds: out.rounds, matches: out.matches, clashes: out.clashes };
  Object.keys(out.abilitiesUsed).forEach(k => all._abil = Object.assign(all._abil||{}, {[k]:true}));
}));
delete all._abil;
console.log('\nSimulated tournaments (every one finished with a champion):'); console.table(all);

// 7. questions: every one is tagged, harder ones are worth more, and the final leans harder than round 1
CS.QUESTIONS.forEach(q => assert([1,2,3].includes(q.d), 'question needs d: ' + q.q));
assert.deepStrictEqual(Object.keys(CS.DIFFICULTY).map(k => CS.DIFFICULTY[k].bonus), [3,5,7]);
Object.keys(tiers).forEach(w => assert([3,5,7].includes(+w), 'unexpected question worth ' + w));
const avg = a => a.reduce((x,y)=>x+y,0)/a.length;
const early = [].concat(...Object.keys(byRound).filter(k => k.startsWith('1/')&&!k.endsWith('/1')).map(k => byRound[k]));
const late = [].concat(...Object.keys(byRound).filter(k => k.split('/')[0] === k.split('/')[1] && k.split('/')[1] > 1).map(k => byRound[k]));
console.log('Average question worth: first round', avg(early).toFixed(2), '| final round', avg(late).toFixed(2), '| overall tiers', JSON.stringify(tiers));
assert(avg(late) > avg(early), 'finals should draw harder questions than round one');

// 6. every ability effect actually gets exercised and changes the result as described
// Player "a" uses the ability; player "b" does not. Seats are shuffled, so look up a's slot.
function oneClash(types, seed) {
  const r = mulberry(seed);
  const players = { a:{types:[types[0]]}, b:{types:[types[1]]} };
  let s = G.dealCards({phase:'lobby',format:'standard'}, players, r);
  s = G.beginPlay(s, r);
  s = G.startClash(s, r);
  const c = s.clash, m = s.matches[s.cur];
  const answers = { a:{key:c.key,choice:c.order.indexOf(0),ability:true}, b:{key:c.key,choice:c.order.indexOf(0),ability:false} };
  const out = G.resolveClash(s, players, answers, r);
  const ia = m.a === 'a' ? 0 : 1;
  return { res: out.clash.res, ia, ib: 1 - ia, cards: out.cards };
}
for (let seed = 1; seed <= 20; seed++) {
  let o = oneClash(['martyr','doctor'], seed);    assert.strictEqual(o.res.adj[o.ia], 3);
  o = oneClash(['warrior','doctor'], seed);       assert.strictEqual(o.res.adj[o.ib], -3);
  o = oneClash(['shepherd','doctor'], seed);      assert.strictEqual(o.res.adj[o.ia], 1); assert.strictEqual(o.res.adj[o.ib], -2);
  o = oneClash(['servant','doctor'], seed);       assert.strictEqual(o.res.cut[o.ib], true); assert.strictEqual(o.res.qb[o.ib], 0); assert.strictEqual(o.res.home[o.ib], 0);
  o = oneClash(['doctor','martyr'], seed);        assert.strictEqual(o.res.qb[o.ia], o.res.worth + R.DOCTRINE_EXTRA);
  o = oneClash(['mystic','martyr'], seed);        assert.strictEqual(o.res.rolls[o.ia].length, 3); assert.strictEqual(o.res.die[o.ia], Math.max(...o.res.rolls[o.ia]));
  o = oneClash(['founder','martyr'], seed);       assert(o.res.die[o.ia] >= 5);
  o = oneClash(['missionary','martyr'], seed);    assert.strictEqual(o.res.base[o.ia], Math.max(...Object.values(o.cards.a.stats)));
}
console.log('\nok  all eight ability effects behave as described (20 seeds each)');
console.log('\nALL TESTS PASSED');
