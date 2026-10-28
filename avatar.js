/* Draws a saint as an inline SVG from a small "look" object (see CS.LOOK in data.js). Pure string
   building, no images to load. CS.avatar(look) returns markup, or '' when there is no look yet. */
(function (g) {
  var CS = (g.CS = g.CS || {});

  function idx(list, i) { i = Math.floor(Number(i)); return (i >= 0 && i < list.length) ? i : 0; }
  function norm(look) {
    var d = CS.LOOK_DEFAULT, L = CS.LOOK, o = {};
    look = look || {};
    o.order = CS.ORDERS[look.order] ? look.order : d.order;
    ['skin', 'hairc', 'robe', 'trim', 'hair', 'face', 'head', 'item', 'halo'].forEach(function (k) { o[k] = idx(L[k], look[k] == null ? d[k] : look[k]); });
    return o;
  }
  function randomLook(order) {
    var L = CS.LOOK, r = function (n) { return Math.floor(Math.random() * n); };
    return { order: order || 'lay', skin: r(L.skin.length), hairc: r(L.hairc.length), robe: r(L.robe.length), trim: r(L.trim.length), hair: r(L.hair.length), face: r(L.face.length), head: r(L.head.length), item: 1 + r(L.item.length - 1), halo: r(L.halo.length) };
  }

  var GOLD = '#e2b84b', INK = '#2a1a12';

  CS.avatar = function (look) {
    if (!look || !look.order || !CS.ORDERS) return '';
    var v = norm(look), L = CS.LOOK, O = CS.ORDERS[v.order];
    var skin = L.skin[v.skin], hc = L.hairc[v.hairc], trim = L.trim[v.trim];
    var lay = v.order === 'lay', robe = lay ? L.robe[v.robe] : O.robe, over = lay ? L.robe[v.robe] : O.over;
    var hood = v.order === 'dominican' ? O.over : robe;      // hoods and veils follow the habit
    var light = v.order === 'dominican' || v.order === 'carmelite' || lay;
    var veil = light ? '#f2ede0' : '#1b1b22';
    var s = [];
    var P = function (d, fill, extra) { s.push('<path d="' + d + '" fill="' + fill + '"' + (extra || '') + '/>'); };
    var C = function (cx, cy, r, fill, extra) { s.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + fill + '"' + (extra || '') + '/>'); };
    var stroke = function (d, col, w, extra) { s.push('<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + w + '" stroke-linecap="round"' + (extra || '') + '/>'); };

    // halo, behind everything
    if (v.halo === 0) C(50, 30, 25, 'none', ' stroke="' + GOLD + '" stroke-width="3"');
    else if (v.halo === 1) {
      for (var a = 0; a < 12; a++) {
        var t = a * Math.PI / 6;
        stroke('M' + (50 + Math.cos(t) * 25).toFixed(1) + ' ' + (30 + Math.sin(t) * 25).toFixed(1) + ' L' + (50 + Math.cos(t) * 33).toFixed(1) + ' ' + (30 + Math.sin(t) * 33).toFixed(1), GOLD, 2.4);
      }
      C(50, 30, 24, 'none', ' stroke="' + GOLD + '" stroke-width="2"');
    } else if (v.halo === 2) { C(50, 30, 32, GOLD, ' opacity=".22"'); C(50, 30, 26, GOLD, ' opacity=".28"'); }

    // things behind the head
    var hairOn = v.head === 0 || v.head === 3 || v.head === 4 || v.head === 5;
    if (hairOn && v.hair === 2) P('M29 36 Q28 10 50 10 Q72 10 71 36 L75 84 Q50 76 25 84Z', hc);
    if (hairOn && v.hair === 3) P('M29 36 Q28 10 50 10 Q72 10 71 36 L72 56 Q50 50 28 56Z', hc);
    if (v.head === 1) P('M26 44 Q24 8 50 8 Q76 8 74 44 L82 70 Q50 60 18 70Z', hood);
    if (v.head === 2) P('M25 46 Q24 6 50 6 Q76 6 75 46 L80 82 Q50 70 20 82Z', veil);

    // neck and body
    s.push('<rect x="44" y="50" width="12" height="18" fill="' + skin + '"/>');
    P('M30 64 Q50 56 70 64 L88 118 L12 118Z', robe);
    P('M30 64 L14 98 Q20 108 29 100 L40 76Z', robe);
    P('M70 64 L86 98 Q80 108 71 100 L60 76Z', robe);

    // the habit
    if (v.order === 'dominican') {
      P('M30 64 Q38 60 44 66 L40 118 L12 118Z', over); P('M70 64 Q62 60 56 66 L60 118 L88 118Z', over);
      stroke('M32 90 Q50 99 68 90', '#8a6a3a', 4, ' stroke-dasharray="0.1 5.2"');
    } else if (v.order === 'franciscan') {
      stroke('M31 88 Q50 96 69 88', trim, 3.2); stroke('M58 92 L60 112', trim, 2.6); C(59, 101, 2.2, trim); C(59.6, 108, 2.2, trim);
    } else if (v.order === 'benedictine') {
      P('M43 62 L57 62 L61 118 L39 118Z', over); stroke('M32 90 Q50 95 68 90', '#4a4a58', 3);
    } else if (v.order === 'augustinian') {
      s.push('<rect x="31" y="85" width="38" height="6" fill="#7a4a22"/><rect x="47" y="84" width="7" height="8" fill="' + GOLD + '"/>'); stroke('M62 91 L64 112', '#7a4a22', 3);
    } else if (v.order === 'carmelite') {
      P('M24 66 Q50 54 76 66 L84 110 L50 98 L16 110Z', over); stroke('M32 92 Q50 98 68 92', '#4a3220', 3);
    } else if (v.order === 'jesuit') {
      for (var b = 0; b < 5; b++) C(50, 76 + b * 8, 1.7, '#5a5a66');
      P('M44 62 L56 62 L53 71 L47 71Z', '#f2ede0');
    } else { stroke('M40 62 Q50 74 60 62', trim, 3.4); stroke('M31 90 Q50 97 69 90', trim, 4); }

    // head
    C(31, 38, 4, skin); C(69, 38, 4, skin); C(50, 36, 19, skin);
    var fc = v.face;
    if (fc === 0) { s.push('<ellipse cx="43" cy="37" rx="2.2" ry="2.9" fill="' + INK + '"/><ellipse cx="57" cy="37" rx="2.2" ry="2.9" fill="' + INK + '"/>'); stroke('M44 46 Q50 51 56 46', INK, 1.8); }
    else if (fc === 1) { stroke('M40 38 Q43 33 46 38', INK, 2); stroke('M54 38 Q57 33 60 38', INK, 2); P('M43 44 Q50 55 57 44Z', '#8a2f3a'); }
    else if (fc === 2) { stroke('M40 37 Q43 40 46 37', INK, 2); stroke('M54 37 Q57 40 60 37', INK, 2); stroke('M46 47 Q50 49 54 47', INK, 1.8); }
    else { s.push('<ellipse cx="43" cy="38" rx="2.2" ry="2.7" fill="' + INK + '"/><ellipse cx="57" cy="38" rx="2.2" ry="2.7" fill="' + INK + '"/>'); stroke('M38 32 L47 34.5', INK, 2.2); stroke('M62 32 L53 34.5', INK, 2.2); stroke('M45 47 L55 47', INK, 1.8); }
    C(38, 43, 3, '#e57d7d', ' opacity=".3"'); C(62, 43, 3, '#e57d7d', ' opacity=".3"');

    // hair on top
    if (hairOn && v.hair > 0) {
      if (v.hair === 4) { [[36, 22], [44, 17], [52, 16], [60, 18], [66, 24], [32, 31], [68, 31]].forEach(function (p) { C(p[0], p[1], 7, hc); }); }
      else { P('M31 36 Q30 13 50 13 Q70 13 69 36 Q63 25 50 25 Q37 25 31 36Z', hc); if (v.hair === 5) C(50, 9, 7, hc); }
    }
    // headwear
    if (v.head === 1) P('M29 42 Q28 11 50 11 Q72 11 71 42 Q68 27 50 24 Q32 27 29 42Z', hood);
    else if (v.head === 2) { P('M28 44 Q27 9 50 9 Q73 9 72 44 Q67 28 50 26 Q33 28 28 44Z', veil); if (!light) stroke('M31 30 Q50 22 69 30', '#f2ede0', 3); }
    else if (v.head === 3) { P('M34 25 L50 -2 L66 25Z', '#f2ede0', ' stroke="' + GOLD + '" stroke-width="1.5"'); s.push('<rect x="34" y="23" width="32" height="4" fill="' + GOLD + '"/>'); stroke('M50 8 L50 18 M46 12 L54 12', GOLD, 1.8); }
    else if (v.head === 4) { [[34, 24, '#f4a6c2'], [40, 18, '#f2ede0'], [47, 15, '#f4a6c2'], [54, 15, '#f2ede0'], [61, 18, '#f4a6c2'], [67, 24, '#f2ede0']].forEach(function (p) { C(p[0], p[1], 3.6, p[2]); C(p[0], p[1], 1.2, GOLD); }); }
    else if (v.head === 5) P('M35 24 Q50 6 65 24 Q50 19 35 24Z', '#7b1e3a');

    // hands, then the held item
    var it = v.item;
    if (it === 1) {
      s.push('<rect x="33" y="80" width="34" height="26" rx="2" fill="#7b1e3a"/><rect x="36" y="83" width="28" height="20" fill="#f2ede0"/><rect x="49" y="83" width="2" height="20" fill="#bfb6a0"/>');
      stroke('M43 88 L43 98 M39 92 L47 92', '#7b1e3a', 1.6); C(34, 98, 5.5, skin); C(66, 98, 5.5, skin);
    } else if (it === 3) {
      stroke('M37 68 Q50 124 63 68', '#8a6a3a', 4, ' stroke-dasharray="0.1 5.4"'); stroke('M50 104 L50 114 M46 108 L54 108', GOLD, 2.2); C(21, 104, 5.5, skin); C(79, 104, 5.5, skin);
    } else {
      C(21, 104, 5.5, skin);
      if (it === 2) { s.push('<rect x="80" y="22" width="3.6" height="92" fill="#a9794a"/><rect x="73" y="32" width="17" height="3.6" fill="#a9794a"/>'); }
      else if (it === 4) { stroke('M82 114 L82 30 Q82 14 69 17', '#c9a05a', 3.6); }
      else if (it === 5) { stroke('M82 114 Q79 80 82 48', '#3f9d5a', 2.6); [-35, 0, 35].forEach(function (rot) { s.push('<ellipse cx="82" cy="40" rx="3.6" ry="9" fill="#f6f1e6" stroke="#cfc6b0" stroke-width=".6" transform="rotate(' + rot + ' 82 48)"/>'); }); C(82, 46, 2, GOLD); }
      else if (it === 6) { P('M80 112 L88 30 Q98 56 85 76Z', '#f2ede0', ' stroke="#b9b09a" stroke-width=".8"'); stroke('M80 112 L88 32', '#b9b09a', 1); }
      else if (it === 7) { s.push('<path d="M82 20 L86.5 27 L86.5 82 L77.5 82 L77.5 27Z" fill="#cfd6e4" stroke="#8d97ad" stroke-width=".8"/><rect x="72" y="82" width="20" height="4" fill="' + GOLD + '"/><rect x="80" y="86" width="4" height="16" fill="#6b3f22"/>'); C(82, 105, 3, GOLD); }
      else if (it === 8) { stroke('M82 114 L82 50', '#6b8e3a', 2.6); [-60, -30, 0, 30, 60].forEach(function (rot) { s.push('<ellipse cx="82" cy="40" rx="3.2" ry="13" fill="#6b9e45" transform="rotate(' + rot + ' 82 52)"/>'); }); }
      if (it >= 2) C(80, 104, 5.5, skin);
    }
    return '<svg class="avatar" viewBox="-2 -4 104 124" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Your saint">' + s.join('') + '</svg>';
  };
  CS.avatarNorm = norm;
  CS.randomLook = randomLook;
  if (typeof module !== 'undefined' && module.exports) module.exports = CS;
})(typeof window !== 'undefined' ? window : globalThis);
