/* Dossier engine: soul counter, purchase ledger, ability readouts, match mode, rival cards.
   Hero-specific data and formulas come from window.HERO, defined on each hero page before this script. */
(() => {
  const HERO = window.HERO;
  if (!HERO) return;

  // ---- shared game data (heroes.vdata, build of 9 Oct 2026) ----
  const LEVEL_GOLD = [0,200,500,900,1400,2000,2600,3200,3900,4600,5300,6000,6800,7600,8400,9200,10100,11000,11900,12800,13800,14900,16100,17400,18900,20600,22500,24600,26900,29400,32100,35000,38100,41400,44900,48600];
  const UNLOCK_LEVELS = new Set([1,3,5,8]); // every other level from 2 gives 1 ability point
  const INV = {
    vit: [[800,9],[1600,12],[2400,15],[3200,20],[4800,38],[6400,42],[8000,46],[11200,50],[16000,54],[22400,60],[28800,66]],
    spi: [[800,7],[1600,11],[2400,15],[3200,19],[4800,38],[6400,45],[8000,52],[11200,59],[16000,66],[22400,75],[28800,100]],
    wpn: [[800,9],[1600,12],[2400,15],[3200,18],[4800,46],[6400,54],[8000,62],[11200,74],[16000,86],[22400,100],[28800,115]]
  };
  // Every hero starts with 600 souls. All of them can be spent, but levels count only the souls collected on top:
  // the game files store level thresholds without the starting souls (wiki: level 0 = 600, level 1 = 800, ...).
  // MAX: 49 200 is where levels end; a hero whose full build costs more sets maxSouls (souls keep coming after the last level).
  const MIN = 600, MAX = HERO.maxSouls || 49200;
  const {ITEMS, PHASES, UPG, UPG_NAME, UNLOCK_ORDER, RIVALS} = HERO;
  const KEY = k => `${HERO.id}-${k}`;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(KEY(k)); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(KEY(k), v); } catch (e) {} }
  };

  // purchase sequence with cumulative cost (an upgrade only costs the difference)
  const SEQ = []; PHASES.forEach((ph, pi) => ph.buys.forEach(b => SEQ.push({id: b[0], pi})));
  let cum = 0; const owned0 = new Set();
  SEQ.forEach(s => {
    const it = ITEMS[s.id];
    const add = it.from && owned0.has(it.from) ? it.p - ITEMS[it.from].p : it.p;
    if (it.from) owned0.delete(it.from);
    owned0.add(s.id); cum += add; s.add = add; s.cum = cum; s.full = it.p !== add;
  });

  const fmt = n => Math.round(n).toLocaleString('ru-RU');
  const fmt1 = n => (Math.round(n * 10) / 10).toLocaleString('ru-RU');
  const $ = s => document.querySelector(s);
  const out = (k, v) => document.querySelectorAll(`[data-o="${k}"]`).forEach(e => { e.textContent = v; });
  const invBonus = (cat, amt) => { let b = 0; for (const [g, v] of INV[cat]) if (amt >= g) b = v; return b; };
  const invNext = (cat, amt) => INV[cat].find(([g]) => amt < g);
  const util = {fmt, fmt1};

  // ---- static scaffolding ----
  $('#phases').innerHTML = PHASES.map((ph, pi) => `
    <div class="phase" data-phase="${pi}">
      <h3>${ph.t}<span>${ph.r}</span></h3>
      <ul class="buys">${ph.buys.map(([id, what, why]) => {
        const s = SEQ.find(x => x.id === id), it = ITEMS[id];
        return `<li class="buy" data-buy="${id}">
          <span class="cost">${s.full ? '+' : ''}${fmt(s.add)}<small>всего ${fmt(s.cum)}</small></span>
          <span class="name"><i class="cat ${it.c}"></i>${it.n}${it.from ? ` <span class="typed" style="font-weight:400;font-size:.8rem">из ${ITEMS[it.from].n}</span>` : ''}<br><span style="font-weight:400">${what}</span></span>
          <span class="mark"></span>
          <span class="why">${why}</span></li>`; }).join('')}</ul>
    </div>`).join('');
  document.querySelectorAll('[data-meter]').forEach(m => {
    m.innerHTML = INV.vit.map(([g]) => `<i class="${g === 4800 ? 'big' : ''}" title="${fmt(g)} душ"></i>`).join('');
  });
  $('#ap-list').innerHTML = UPG.map(([k, c]) => `<li data-ap="${k}">${UPG_NAME[k[0]]} T${k[1]} <span style="opacity:.7">(${c})</span></li>`).join('');

  const slider = $('#souls'), toggle = $('#kev');

  function state(earned) {
    const collected = Math.max(0, earned - MIN);
    let lvl = 1; LEVEL_GOLD.forEach((g, i) => { if (collected >= g) lvl = i + 1; });
    const boons = lvl - 1;
    const unlocks = []; let apTotal = 0;
    for (let l = 1; l <= lvl; l++) { if (UNLOCK_LEVELS.has(l)) unlocks.push(UNLOCK_ORDER[unlocks.length]); else apTotal++; }
    const have = new Set(); let ap = apTotal;
    for (const [k, c] of UPG) { if (!unlocks.includes(k[0]) || ap < c) break; have.add(k); ap -= c; }
    const budget = earned, owned = new Set(), gone = new Set(); let nextBuy = null;
    for (const s of SEQ) {
      if (budget >= s.cum) { const it = ITEMS[s.id]; if (it.from) { owned.delete(it.from); gone.add(it.from); } owned.add(s.id); }
      else { nextBuy = s; break; }
    }
    let vit = 0, spi = 0, wpn = 0, flatSp = 0, itemHp = 0, spPct = 0;
    owned.forEach(id => {
      const it = ITEMS[id];
      if (it.c === 'vit') vit += it.p; else if (it.c === 'wpn') wpn += it.p; else spi += it.p;
      flatSp += it.sp || 0; itemHp += it.hp || 0; spPct += it.spPct || 0;
    });
    const tg = HERO.toggle;
    const toggleOn = !!(tg && owned.has(tg.item) && toggle && toggle.checked);
    let sp = (boons * HERO.spPerBoon + flatSp + invBonus('spi', spi)) * (1 + spPct / 100);
    if (toggleOn) sp += tg.sp || 0;
    const hp = HERO.baseHp + HERO.hpPerBoon * boons + itemHp + (HERO.hpFromUpg ? HERO.hpFromUpg(have) : 0);
    return {lvl, boons, unlocks, apTotal, have, owned, gone, nextBuy, vit, spi, wpn, sp, toggleOn, hp, budget, invBonus};
  }

  function render() {
    const earned = +slider.value, s = state(earned);
    $('#souls-out').textContent = fmt(earned);
    out('lvl', `ур. ${s.lvl - 1}`); out('ap', `AP ${s.apTotal}`); out('sp', `дух ${fmt(s.sp)}`); out('hp', `HP ${fmt(s.hp)} +${invBonus('vit', s.vit)} %`);
    const tw = $('#kev-wrap'); if (tw) tw.hidden = !(HERO.toggle && s.owned.has(HERO.toggle.item));
    document.querySelectorAll('#presets button[data-v]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.v === earned)));

    // abilities: the hero page owns the formulas
    const vals = HERO.compute(s, util);
    Object.entries(vals).forEach(([k, v]) => out(k, v));
    HERO.abilityCards.forEach(([id, k]) => { const el = document.getElementById(id); if (el) el.classList.toggle('locked', !s.unlocks.includes(k)); });
    document.querySelectorAll('[data-t]').forEach(li => li.classList.toggle('on', s.have.has(li.dataset.t)));
    document.querySelectorAll('[data-ap]').forEach((li, i) => { li.classList.toggle('done', s.have.has(li.dataset.ap)); li.classList.toggle('skip', i === UPG.length - 1 && !s.have.has(li.dataset.ap)); });

    // ledger
    document.querySelectorAll('[data-buy]').forEach(li => {
      const id = li.dataset.buy, own = s.owned.has(id), gone = s.gone.has(id), next = s.nextBuy && s.nextBuy.id === id;
      li.classList.toggle('owned', own); li.classList.toggle('gone', gone); li.classList.toggle('next', !!next);
      li.querySelector('.mark').textContent = own ? 'куплено' : gone ? 'улучшено' : next ? `ещё ${fmt(s.nextBuy.cum - s.budget)}` : '';
    });
    const curPhase = s.nextBuy ? s.nextBuy.pi : PHASES.length - 1;
    document.querySelectorAll('[data-phase]').forEach(p => p.classList.toggle('now', +p.dataset.phase === curPhase));
    const ownedList = SEQ.map(x => x.id).filter(id => s.owned.has(id));
    $('#slots').innerHTML = Array.from({length: 12}, (_, i) => {
      const id = ownedList[i], flex = i >= 9 ? ' flex' : '';
      return id ? `<div class="slot ${ITEMS[id].c}${flex}">${ITEMS[id].n}</div>` : `<div class="slot${flex}"></div>`;
    }).join('');
    [['vit', s.vit, 'v'], ['spi', s.spi, 'sp'], ['wpn', s.wpn, 'w']].forEach(([cat, amt, k]) => {
      const cells = document.querySelectorAll(`[data-meter="${cat}"] i`);
      INV[cat].forEach(([g], i) => { if (cells[i]) cells[i].classList.toggle('on', amt >= g); });
      const unit = cat === 'spi' ? ' духа' : ' %';
      out(`${k}-bonus`, `+${invBonus(cat, amt)}${unit} · ${fmt(amt)} душ`);
      const nx = invNext(cat, amt);
      out(`${k}-next`, nx ? `Следующий порог: ${fmt(nx[0])} душ → +${nx[1]}${unit}` : 'Максимум достигнут.');
    });
    if (!katka.hidden) renderKatka();
  }

  // ---- rivals ----
  const LVL = {3: ['Опасен', 'l3'], 2: ['Осторожно', 'l2'], 1: ['Удобная цель', 'l1']};
  $('#rivals').innerHTML = RIVALS.map(r => `
    <article class="sheet rival">
      <header><div><h3>${r.n}</h3><span class="role">${r.role}</span></div><span class="stamp ${LVL[r.lvl][1]}">${LVL[r.lvl][0]}</span></header>
      <h4>Чего бояться</h4><ul>${r.fear.map(x => `<li>${x}</li>`).join('')}</ul>
      <h4 class="play">Как играть</h4><ul>${r.play.map(x => `<li>${x}</li>`).join('')}</ul>
      <p class="buy-line">Что купить: <b>${r.buy}</b></p>
    </article>`).join('');

  // ---- match mode ----
  const katka = $('#katka');
  let picked = new Set();
  try { picked = new Set(JSON.parse(store.get('rivals', '[]'))); } catch (e) {}
  const chips = $('#k-chips');
  chips.innerHTML = RIVALS.map(r => `<button type="button" data-r="${r.id}" aria-pressed="false">${r.n}</button>`).join('');
  function renderTips() {
    chips.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(picked.has(b.dataset.r))));
    const list = RIVALS.filter(r => picked.has(r.id));
    $('#k-tips').innerHTML = list.length
      ? list.map(r => `<div class="k-tip"><b>${r.n}</b><p>${r.tip} Купить: ${r.buy}.</p></div>`).join('')
      : '<p class="k-empty">Отметь героев из вражеской команды, и здесь останутся подсказки против них.</p>';
  }
  chips.addEventListener('click', e => {
    const b = e.target.closest('button[data-r]'); if (!b) return;
    picked.has(b.dataset.r) ? picked.delete(b.dataset.r) : picked.add(b.dataset.r);
    store.set('rivals', JSON.stringify([...picked]));
    renderTips();
  });
  const k = (key, v) => { const el = katka.querySelector(`[data-k="${key}"]`); if (el) el.textContent = v; };

  // ---- soul line: the build as a cardiograph strip ----
  // Every build event is one heartbeat in the order it happens: a purchase (tall spike), a new ability (diamond)
  // or an ability upgrade (small blip). The recorder pen sits on the player's current souls.
  const SL = {STEP: 64, PAD: 40, BASE: 200, H: 280, AMP: {item: 92, unlock: 58, up: 26}};
  const EV = [];
  {
    SEQ.forEach((sq, i) => EV.push({s: sq.cum, type: 'item', id: sq.id, idx: i}));
    let prev = state(MIN);
    prev.unlocks.forEach(key => EV.push({s: MIN, type: 'unlock', key}));
    for (let v = MIN + 100; v <= MAX; v += 100) {
      const cur = state(v);
      cur.unlocks.filter(key => !prev.unlocks.includes(key)).forEach(key => EV.push({s: v, type: 'unlock', key}));
      UPG.filter(([id]) => cur.have.has(id) && !prev.have.has(id)).forEach(([id, cost]) => EV.push({s: v, type: 'up', id, cost}));
      prev = cur;
    }
    const rank = {unlock: 0, up: 1, item: 2};
    EV.sort((a, b) => a.s - b.s || rank[a.type] - rank[b.type]);
  }
  const abName = key => (HERO.ABN && HERO.ABN[key]) || UPG_NAME[key];
  const tierText = id => { const el = document.querySelector(`[data-t="${id}"] span:last-child`); return el ? el.textContent.replace(/\.$/, '') : ''; };
  const slSvg = $('[data-sl-svg]'), slScroll = $('[data-sl-scroll]'), slPaper = $('[data-sl-paper]'), slPenT = $('[data-sl-pen-t]');
  // the tape moves under a fixed pen in the middle of the window, like paper in a cardiograph.
  // OFF pads both ends so the first and the last spike can reach the pen.
  let OFF = 0, drawnFor = 0;
  const xOf = i => OFF + SL.PAD + i * SL.STEP;
  const X0 = () => xOf(0), X1 = () => xOf(EV.length - 1);
  const ITEM_EV = EV.map((e, i) => ({...e, i})).filter(e => e.type === 'item');
  const snap = v => Math.max(MIN, Math.min(MAX, Math.round(v / 100) * 100));
  // souls <-> x: spikes are evenly spaced, souls interpolate between neighbouring events
  function soulsAt(x) {
    if (x <= X0()) return EV[0].s;
    for (let i = 0; i < EV.length - 1; i++) if (x < xOf(i + 1)) return EV[i].s + (x - xOf(i)) / SL.STEP * (EV[i + 1].s - EV[i].s);
    return EV[EV.length - 1].s;
  }
  function xAt(s) {
    let kx = 0; EV.forEach((e, i) => { if (e.s <= s) kx = i; });
    if (kx === EV.length - 1) return xOf(kx);
    const a = EV[kx], b = EV[kx + 1];
    return xOf(kx) + (s - a.s) / (b.s - a.s) * SL.STEP;
  }
  function drawLine() {
    const cw = slScroll.clientWidth;
    if (!slSvg || !cw || cw === drawnFor) return;
    drawnFor = cw; OFF = Math.max(0, cw / 2 - SL.PAD);
    const W = OFF * 2 + SL.PAD * 2 + SL.STEP * (EV.length - 1), {BASE, H, AMP} = SL;
    slPaper.style.width = W + 'px';
    slSvg.setAttribute('viewBox', `0 0 ${W} ${H}`); slSvg.setAttribute('width', W); slSvg.setAttribute('height', H);
    let d = `M0 ${BASE}`;
    EV.forEach((e, i) => {
      const x = xOf(i), a = AMP[e.type];
      d += ` L${x - 20} ${BASE} Q${x - 15} ${BASE - 6} ${x - 10} ${BASE} L${x - 4} ${BASE} L${x - 1.5} ${BASE + a * .18} L${x} ${BASE - a} L${x + 2.5} ${BASE + a * .28} L${x + 5} ${BASE} Q${x + 13} ${BASE - a * .14} ${x + 21} ${BASE}`;
    });
    d += ` L${W} ${BASE}`;
    let h = `<defs><clipPath id="sl-past"><rect data-sl-past x="0" y="0" width="0" height="${H}"/></clipPath><clipPath id="sl-fut"><rect data-sl-fut x="0" y="0" width="${W}" height="${H}"/></clipPath></defs>`
      + `<path d="${d}" fill="none" stroke="#7d7268" stroke-width="1.3" stroke-dasharray="3 3" clip-path="url(#sl-fut)"/>`
      + `<path d="${d}" fill="none" stroke="#1d1a17" stroke-width="1.9" stroke-linejoin="round" clip-path="url(#sl-past)"/>`;
    EV.forEach((e, i) => {
      const x = xOf(i);
      if (e.type === 'item') {
        const it = ITEMS[e.id], col = it.c === 'vit' ? '#3f6d3b' : it.c === 'wpn' ? '#b0601e' : '#6a3f86';
        h += `<rect class="sl-hit" data-sl-i="${e.idx}" x="${x - 16}" y="${BASE - AMP.item - 70}" width="32" height="${AMP.item + 80}"><title>Купил всё до ${it.n}</title></rect>`
          + `<text class="sl-item" data-sl-i="${e.idx}" fill="${col}" transform="translate(${x + 3} ${BASE - AMP.item - 6}) rotate(-38)">${it.n}</text>`;
      } else if (e.type === 'unlock') {
        h += `<rect x="${x - 6}" y="${BASE - AMP.unlock - 16}" width="12" height="12" fill="#a8281f" transform="rotate(45 ${x} ${BASE - AMP.unlock - 10})"/>`
          + `<text class="sl-up" style="fill:#a8281f" transform="translate(${x + 4} ${BASE - AMP.unlock - 22}) rotate(-38)">${abName(e.key)}</text>`;
      } else {
        h += `<text class="sl-up" x="${x}" y="${BASE + 30}" text-anchor="middle">${UPG_NAME[e.id[0]]} T${e.id[1]}</text>`;
      }
      h += `<text class="sl-souls" x="${x}" y="${BASE + 52 + (i % 2) * 12}" text-anchor="middle">${fmt(e.s)}</text>`;
    });
    slSvg.innerHTML = h;
  }
  function paintPast(x) {
    if (!drawnFor) return;
    slSvg.querySelector('[data-sl-past]').setAttribute('width', x);
    slSvg.querySelector('[data-sl-fut]').setAttribute('x', x);
  }

  // scrolling sets the souls; buttons and taps set the souls and roll the tape there.
  // While the tape rolls to a target, the scroll position must not overwrite that exact number
  // (one pixel at the end of the build is worth ~250 souls).
  // lock: the souls were set by a button, a tap or a key; only the player's own gesture on the tape unlocks them.
  let lock = true, fromScroll = false, raf = 0, settle = 0, saveT = 0;
  const center = () => slScroll.scrollLeft + slScroll.clientWidth / 2;
  const release = () => { lock = false; };
  function rollTo(left, instant) {
    left = Math.max(0, Math.min(left, slScroll.scrollWidth - slScroll.clientWidth));
    lock = true; clearTimeout(settle);
    if (Math.abs(left - slScroll.scrollLeft) < 1) return;
    const far = Math.abs(left - slScroll.scrollLeft) > slScroll.clientWidth;
    slScroll.scrollTo({left, behavior: instant || far || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
  }
  function setSouls(v) {
    slider.value = snap(v); store.set('souls', slider.value);
    render();
  }
  function onScroll() {
    raf = 0;
    if (katka.hidden || !drawnFor) return;
    const c = center();
    paintPast(Math.min(Math.max(c, X0()), X1()));
    if (lock) return;
    // round down: the pen counts a purchase only once it has reached that spike
    const v = Math.max(MIN, Math.min(MAX, Math.floor(soulsAt(c) / 100 + 1e-6) * 100));
    if (v !== +slider.value) {
      slider.value = v; fromScroll = true; render(); fromScroll = false;
      clearTimeout(saveT); saveT = setTimeout(() => store.set('souls', slider.value), 300);
    }
    clearTimeout(settle); settle = setTimeout(magnet, 160);
  }
  function magnet() { // the tape catches on a purchase spike it stops next to
    if (lock || katka.hidden) return;
    const c = center(), near = ITEM_EV.find(e => Math.abs(xOf(e.i) - c) < 14);
    if (near) { setSouls(near.s); return; }
    // events with equal souls leave a flat stretch between their spikes; the pen never rests inside one
    for (let i = 0; i < EV.length - 1; i++) {
      if (EV[i].s !== EV[i + 1].s || c <= xOf(i) || c >= xOf(i + 1)) continue;
      let a = i, b = i + 1;
      while (a > 0 && EV[a - 1].s === EV[i].s) a--;
      while (b < EV.length - 1 && EV[b + 1].s === EV[i].s) b++;
      setSouls(c - xOf(a) > xOf(b) - c ? EV[i].s : EV[i].s - 100);
      return;
    }
  }
  if (slScroll) {
    slScroll.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(onScroll); }, {passive: true});
    ['pointerdown', 'wheel', 'touchstart'].forEach(ev => slScroll.addEventListener(ev, release, {passive: true}));
    slScroll.addEventListener('keydown', e => {
      const d = {ArrowRight: 100, ArrowLeft: -100, PageUp: 1000, PageDown: -1000}[e.key];
      if (d) { e.preventDefault(); setSouls(+slider.value + (e.shiftKey ? d * 10 : d)); }
      else if (e.key === 'Home') { e.preventDefault(); setSouls(MIN); }
      else if (e.key === 'End') { e.preventDefault(); setSouls(MAX); }
    });
  }

  // the two text blocks get the height of their longest variant, so the buttons never move
  function fillBuy(next, total) {
    if (next) {
      const it = ITEMS[next.id], left = Math.max(0, next.cum - total);
      k('buy', it.n); k('buy-desc', it.s || '');
      const need = next.pi === HERO.flexPhase && !it.from ? ' · нужен доп. слот' : '';
      katka.querySelector('[data-k="buy-sub"]').innerHTML = `${next.full ? `доплатить ${fmt(next.add)} за ${ITEMS[it.from].n}` : `цена ${fmt(next.add)}`} · ещё <b>${fmt(left)}</b>${need}`;
    } else { k('buy', 'Билд собран'); k('buy-desc', 'Свободный слот закрой под соперника: варианты на листе VI'); k('buy-sub', ''); }
  }
  function fillAp(ab, total) {
    if (ab) {
      if (ab.type === 'unlock') { k('ap', abName(ab.key)); k('ap-desc', 'новая способность: открой её'); }
      else { k('ap', `${abName(ab.id[0])} T${ab.id[1]}`); k('ap-desc', tierText(ab.id)); }
      k('ap-when', `на ${fmt(ab.s)} душ · уровень ${state(ab.s).lvl - 1} · ещё ${fmt(Math.max(0, ab.s - total))}`);
    } else { k('ap', 'Всё прокачано'); k('ap-when', ''); k('ap-desc', ''); }
  }
  let fitFor = 0;
  function fitHeights() {
    const main = katka.querySelector('.kc-main'), ap = katka.querySelector('.kc-ap');
    if (!main || !ap || main.clientWidth === fitFor) return;
    fitFor = main.clientWidth;
    main.style.minHeight = ''; ap.style.minHeight = '';
    let hb = 0, ha = 0;
    [...SEQ, null].forEach(sq => { fillBuy(sq, 0); hb = Math.max(hb, main.offsetHeight); });
    [...EV.filter(e => e.type !== 'item'), null].forEach(e => { fillAp(e, 0); ha = Math.max(ha, ap.offsetHeight); });
    main.style.minHeight = hb + 'px'; ap.style.minHeight = ha + 'px';
  }

  function renderKatka() {
    drawLine(); fitHeights();
    const total = +slider.value;
    if (slSvg && !fromScroll) {
      const x = xAt(total);
      paintPast(x);
      rollTo(x - slScroll.clientWidth / 2);
    }
    if (slPenT) slPenT.textContent = `${fmt(total)} душ`;
    const bought = SEQ.filter(x => x.cum <= total).length, next = SEQ[bought];
    k('head', `куплено ${bought} из ${SEQ.length}`);
    fillBuy(next, total);
    fillAp(EV.find(e => e.type !== 'item' && e.s > total), total);
    $('#k-buy').disabled = !next; $('#k-undo').disabled = total <= MIN;
  }
  $('#k-buy').addEventListener('click', () => { const n = SEQ.find(x => x.cum > +slider.value); if (n) setSouls(n.cum); });
  $('#k-undo').addEventListener('click', () => { const v = +slider.value, p = SEQ.filter(x => x.cum < v).pop(); setSouls(p ? p.cum : MIN); });
  if (slSvg) slSvg.addEventListener('click', e => { const t = e.target.closest('[data-sl-i]'); if (t) setSouls(SEQ[+t.dataset.slI].cum); });
  { let down = false, sx = 0, sl0 = 0;
    slScroll.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' || e.target.closest('[data-sl-i]')) return; down = true; sx = e.clientX; sl0 = slScroll.scrollLeft; });
    addEventListener('pointermove', e => { if (down) slScroll.scrollLeft = sl0 - (e.clientX - sx); });
    addEventListener('pointerup', () => { down = false; }); }
  addEventListener('resize', () => { if (katka.hidden) return; drawnFor = 0; fitFor = 0; renderKatka(); });
  function openK() { katka.hidden = false; document.body.style.overflow = 'hidden'; renderKatka(); renderTips(); $('#k-close').focus(); }
  function closeK() {
    katka.hidden = true; document.body.style.overflow = '';
    if (location.hash === '#katka') history.replaceState(null, '', location.pathname + location.search);
    $('#k-open').focus();
  }
  $('#k-open').addEventListener('click', openK);
  $('#k-close').addEventListener('click', closeK);
  addEventListener('keydown', e => { if (e.key === 'Escape' && !katka.hidden) closeK(); });

  // ---- case menu: every dossier from the shared registry ----
  const caseBtn = $('#case-btn'), caseMenu = $('#case-menu');
  if (caseBtn && caseMenu && window.DOSSIERS) {
    const root = HERO.root || '';
    caseMenu.innerHTML = `<p class="cm-title">Картотека</p><ul>${window.DOSSIERS.map(d => `
      <li><a href="${root}${d.path}" ${d.id === HERO.id ? 'aria-current="page"' : ''} style="--f:${d.folder};--fi:${d.ink}">
        <span class="cm-folder">№ ${d.num}</span><span class="cm-name">${d.name}</span><span class="cm-role">${d.role}</span></a></li>`).join('')}</ul>
      <a class="cm-all" href="${root}index.html">Вся картотека →</a>`;
    const setOpen = open => { caseMenu.hidden = !open; caseBtn.setAttribute('aria-expanded', String(open)); };
    caseBtn.addEventListener('click', e => { e.stopPropagation(); setOpen(caseMenu.hidden); });
    document.addEventListener('click', e => { if (!caseMenu.hidden && !caseMenu.contains(e.target)) setOpen(false); });
    addEventListener('keydown', e => { if (e.key === 'Escape' && !caseMenu.hidden) { setOpen(false); caseBtn.focus(); } });
  }

  // ---- counter wiring ----
  slider.addEventListener('input', render);
  slider.addEventListener('change', () => store.set('souls', slider.value));
  if (toggle) toggle.addEventListener('change', render);
  $('#presets').addEventListener('click', e => {
    const b = e.target.closest('button[data-v]'); if (!b) return;
    slider.value = b.dataset.v; store.set('souls', slider.value); render();
  });
  const saved = store.get('souls', null);
  if (saved !== null && !isNaN(+saved)) slider.value = Math.max(MIN, +saved);
  render();
  if (location.hash === '#katka') openK();
  addEventListener('hashchange', () => { if (location.hash === '#katka') openK(); });

  // ---- section highlight in the folder spine ----
  const links = [...document.querySelectorAll('.spine .nums a')];
  const secs = links.map(a => document.querySelector(a.getAttribute('href')));
  const nowEl = $('.spine [data-now]');
  const spy = () => {
    let cur = -1; secs.forEach((sec, i) => { if (sec && sec.getBoundingClientRect().top < 140) cur = i; });
    links.forEach((a, i) => a.setAttribute('aria-current', String(i === cur)));
    if (nowEl) nowEl.textContent = cur < 0 ? 'обложка' : `${links[cur].querySelector('b').textContent} · ${links[cur].querySelector('small').textContent}`;
  };
  addEventListener('scroll', spy, {passive: true}); spy();

  // ---- red string between pins on the combo board (string under the pins, both above the notes) ----
  const board = $('.board');
  const SVGNS = 'http://www.w3.org/2000/svg';
  const drawString = () => {
    if (!board) return;
    const svg = board.querySelector('.string'); if (!svg) return;
    if (!svg.querySelector('defs')) {
      svg.insertAdjacentHTML('afterbegin', '<defs><radialGradient id="pin-grad" cx="35%" cy="35%" r="65%"><stop offset="0" stop-color="#e6564b"/><stop offset=".6" stop-color="#a8281f"/><stop offset="1" stop-color="#5d140f"/></radialGradient></defs>');
      const g = document.createElementNS(SVGNS, 'g'); g.setAttribute('class', 'pins'); svg.appendChild(g);
    }
    const r = board.getBoundingClientRect();
    const pts = [...board.querySelectorAll('.pin-dot')].map(p => { const q = p.getBoundingClientRect(); return [q.left - r.left, q.top - r.top + 7]; });
    svg.querySelector('polyline').setAttribute('points', pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '));
    svg.querySelector('.pins').innerHTML = pts.map(([x, y]) =>
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="url(#pin-grad)" style="filter:drop-shadow(1px 2px 1.5px rgba(0,0,0,.5))"/>`).join('');
  };
  addEventListener('resize', drawString); addEventListener('load', drawString); drawString();
  if (document.fonts) document.fonts.ready.then(drawString);
})();
