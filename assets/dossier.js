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
  const MIN = 600, MAX = 49200;
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
  // souls at which the hero has collected n ability points in total
  const soulsForAP = n => {
    let ap = 0;
    for (let l = 1; l <= LEVEL_GOLD.length; l++) { if (!UNLOCK_LEVELS.has(l)) ap++; if (ap >= n) return [LEVEL_GOLD[l - 1] + MIN, l - 1]; }
    return null;
  };
  // souls at which the k-th ability (0-based) unlocks
  const soulsForUnlock = k => { const lv = [...UNLOCK_LEVELS].sort((a, b) => a - b)[k]; return [LEVEL_GOLD[lv - 1] + MIN, lv - 1]; };
  const plural = (n, one, few, many) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many; };

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
  function renderKatka() {
    const earned = +slider.value, s = state(earned);
    $('#k-souls-out').textContent = fmt(earned);
    const bar = katka.querySelector('[data-k-bar]'), barBox = bar && bar.parentElement;
    // next purchase: full price, what is paid now (an upgrade costs only the difference), and progress towards it
    if (s.nextBuy) {
      const it = ITEMS[s.nextBuy.id], ph = PHASES[s.nextBuy.pi].buys.find(b => b[0] === s.nextBuy.id);
      const pay = s.nextBuy.add, saved = Math.max(0, pay - (s.nextBuy.cum - s.budget)), left = pay - saved;
      k('buy', it.n);
      k('buy-price', s.nextBuy.full ? `Цена ${fmt(it.p)} · улучшение ${ITEMS[it.from].n}, доплатить ${fmt(pay)}` : `Цена ${fmt(pay)}`);
      k('buy-progress', `Накоплено ${fmt(saved)} из ${fmt(pay)} · не хватает ${fmt(left)}`);
      if (bar) { const pct = Math.round(saved / pay * 100); bar.style.width = pct + '%'; barBox.setAttribute('aria-valuenow', pct); barBox.hidden = false; }
      k('buy-what', ph[1] + '.');
      const after = SEQ[SEQ.indexOf(s.nextBuy) + 1];
      const needSlot = s.nextBuy.pi === HERO.flexPhase && !it.from ? 'Нужен доп. слот: без него пропусти. ' : '';
      k('buy-then', needSlot + (after ? `Затем: ${ITEMS[after.id].n}.` : 'Это последний предмет билда.'));
    } else {
      k('buy', 'Билд собран'); k('buy-price', ''); k('buy-progress', ''); k('buy-what', 'Свободный слот закрой под соперника: варианты на листе VI.'); k('buy-then', '');
      if (barBox) barBox.hidden = true;
    }
    // ability points: what to take next, its cost, how many points are free and when the rest arrive
    const used = UPG.filter(([id]) => s.have.has(id)).reduce((a, [, c]) => a + c, 0);
    const spare = s.apTotal - used, idx = UPG.findIndex(([id]) => !s.have.has(id)), next = UPG[idx];
    const pips = katka.querySelector('[data-k-pips]');
    if (next) {
      const [id, cost] = next, key = id[0];
      k('ap', `${UPG_NAME[key]} T${id[1]}`);
      k('ap-cost', `Стоит ${cost} ${plural(cost, 'очко', 'очка', 'очков')} · свободно ${spare}`);
      if (pips) pips.innerHTML = Array.from({length: cost}, (_, i) => `<i class="${i < spare ? 'on' : ''}"></i>`).join('');
      if (!s.unlocks.includes(key)) {
        const [g, lv] = soulsForUnlock(UNLOCK_ORDER.indexOf(key));
        k('ap-note', `Сначала нужно открыть саму способность: это будет на ${fmt(g)} душ (уровень ${lv}).`);
      } else if (spare >= cost) {
        k('ap-note', `Хватает: вложи ${cost} ${plural(cost, 'очко', 'очка', 'очков')} сейчас.`);
      } else {
        const need = cost - spare, at = soulsForAP(used + cost);
        k('ap-note', `Не хватает ${need} ${plural(need, 'очка', 'очков', 'очков')}${at ? `: наберутся на ${fmt(at[0])} душ (уровень ${at[1]})` : ''}. Не трать их на другое.`);
      }
      const later = UPG.slice(idx + 1, idx + 3).map(([u]) => `${UPG_NAME[u[0]]} T${u[1]}`);
      k('ap-then', later.length ? `Затем: ${later.join(', ')}.` : '');
    } else {
      k('ap', 'Всё прокачано'); k('ap-cost', ''); k('ap-note', ''); k('ap-then', '');
      if (pips) pips.innerHTML = '';
    }
    k('ap-lvl', `Уровень ${s.lvl - 1} · очков получено ${s.apTotal}, вложено ${used} · дух ${fmt(s.sp)}`);
  }
  function openK() { katka.hidden = false; document.body.style.overflow = 'hidden'; renderKatka(); renderTips(); $('#k-close').focus(); }
  function closeK() {
    katka.hidden = true; document.body.style.overflow = '';
    if (location.hash === '#katka') history.replaceState(null, '', location.pathname + location.search);
    $('#k-open').focus();
  }
  $('#k-open').addEventListener('click', openK);
  $('#k-close').addEventListener('click', closeK);
  addEventListener('keydown', e => { if (e.key === 'Escape' && !katka.hidden) closeK(); });
  $('#k-steps').addEventListener('click', e => {
    const b = e.target.closest('button[data-d]'); if (!b) return;
    slider.value = Math.max(MIN, Math.min(MAX, +slider.value + +b.dataset.d));
    store.set('souls', slider.value);
    render();
  });

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
