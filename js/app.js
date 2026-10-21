(function () {
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  const $ = (id) => document.getElementById(id);
  const LETTERS = 'ABCD';
  const LEVEL = ['', 'Easy', 'Medium', 'Hard'];
  const isMath = (q) => MATH_DOMAINS.includes(q.d);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  /* ---------- Choice order ----------
     Questions are written with the answer wherever it fell. Spread the answers
     across A–D with a fixed per-question order (stable between visits).
     Numeric choices stay in ascending order, as on the real test.
     {A}–{D} in an explanation refer to the written order and are relabelled. */
  const numericChoice = /^[−\-$]?[\d.,/]+[%°]?$|^[\d]*[√π][\d]*$|^\d+\/\d+$/;
  function seeded(id) {
    let h = 2166136261;
    for (const ch of id + 's14') { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
  }
  QUESTIONS.forEach((q) => {
    if (q.num) return;
    const order = q.c.map((_, i) => i);
    if (!q.c.every((c) => numericChoice.test(c.replace(/\s/g, '')))) {
      const rnd = seeded(q.id);
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    }
    q.c = order.map((i) => q.c[i]);
    q.a = order.indexOf(q.a);
    q.w = q.w.replace(/\{([ABCD])\}/g, (_, L) => 'ABCD'[order.indexOf('ABCD'.indexOf(L))]);
  });

  /* ---------- Countdown (dates are in India time, as in the plan) ---------- */
  const todayISO = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
  const daysLeft = Math.round((Date.parse('2026-11-07') - Date.parse(todayISO)) / 86400000);
  $('countdown').innerHTML =
    daysLeft > 1 ? `<b>${daysLeft}</b> days to go` :
    daysLeft === 1 ? '<b>1</b> day to go' :
    daysLeft === 0 ? '<b>Today.</b> Good luck.' : 'Scores out 20 November';

  /* ---------- Routing ---------- */
  const PAGES = ['overview', 'plan', 'notes', 'bank', 'timed', 'cards', 'testday'];
  const navLinks = [...document.querySelectorAll('.nav a')];
  let current = null;

  function showPage(page) {
    if (!PAGES.includes(page)) page = 'overview';
    PAGES.forEach((p) => { $('page-' + p).hidden = p !== page; });
    navLinks.forEach((a) => {
      if (a.dataset.page === page) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    if (page !== current) {
      current = page;
      if (page === 'overview') renderOverview();
      if (page === 'bank') renderBank();
    }
  }

  function route() {
    const h = decodeURIComponent(location.hash.slice(1));
    const note = h && document.getElementById(h);
    if (note && note.classList.contains('note')) {
      showPage('notes');
      note.scrollIntoView({ block: 'start' });
      note.classList.add('flash');
      setTimeout(() => note.classList.remove('flash'), 1200);
      return;
    }
    showPage(h || store.get('sat-page', 'overview'));
    window.scrollTo(0, 0);
    if (PAGES.includes(h)) store.set('sat-page', h);
  }
  window.addEventListener('hashchange', route);

  /* ---------- Shared answer state ---------- */
  let answers = store.get('sat-ans', {});
  const saveAnswers = () => store.set('sat-ans', answers);

  function checkTyped(q, raw) {
    const v = String(raw).trim().replace(/\s+/g, '').replace(/−/g, '-');
    if (!v) return null;
    const val = (s) => {
      if (/^-?\d+\/\d+$/.test(s)) { const [n, d] = s.split('/'); return +n / +d; }
      return s === '' ? NaN : +s;
    };
    return q.num.some((a) => a === v || (!isNaN(val(v)) && Math.abs(val(a) - val(v)) < 1e-9));
  }

  /* ---------- Overview ---------- */
  function renderOverview() {
    const done = Object.values(store.get('sat-plan', {})).filter(Boolean).length;
    const ids = Object.keys(answers).filter((k) => QUESTIONS.some((q) => q.id === k));
    const ok = ids.filter((k) => answers[k].ok).length;
    const sessions = store.get('sat-sessions', []);
    $('overviewProgress').innerHTML = `<h4>Your progress</h4>
      <p>Study plan: ${done} of ${PLAN.length} days done.<br>
      Question bank: ${ids.length} of ${QUESTIONS.length} answered${ids.length ? `, ${Math.round((ok / ids.length) * 100)}% correct` : ''}.<br>
      Timed sets completed: ${sessions.length}.</p>
      <p><a href="#plan">Open today’s plan</a> · <a href="#timed">Start a timed set</a></p>`;
  }

  /* ---------- Study plan ---------- */
  const planDone = store.get('sat-plan', {});
  function renderPlan() {
    const n = Object.values(planDone).filter(Boolean).length;
    $('planMeter').textContent = `${n} of ${PLAN.length} days done.`;
    $('planList').innerHTML = PLAN.map(([dt, title, kind, tasks]) => {
      const d = new Date(dt + 'T12:00:00Z');
      const wd = d.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
      const dm = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
      const done = !!planDone[dt];
      const today = dt === todayISO;
      return `<div class="day${today ? ' today' : ''}${done ? ' done' : ''}">
        <input type="checkbox" data-d="${dt}" ${done ? 'checked' : ''} aria-label="Mark ${dm} done">
        <div class="dt"><b>${dm}</b>${wd}${today ? ' · today' : ''}</div>
        <div class="body"><h4>${title}<span class="kind">${esc(kind)}</span></h4>
        <ul>${tasks.map((t) => `<li>${t}</li>`).join('')}</ul></div>
      </div>`;
    }).join('');
  }
  $('planList').addEventListener('change', (e) => {
    const d = e.target.dataset.d;
    if (!d) return;
    planDone[d] = e.target.checked;
    store.set('sat-plan', planDone);
    renderPlan();
  });
  renderPlan();

  /* ---------- Question bank ---------- */
  const filter = { sec: 'all', dom: 'all', diff: 'all', stat: 'all' };
  const qlist = $('qlist');
  const numberOf = (q) => QUESTIONS.indexOf(q) + 1;

  function fillDomainSelect() {
    const keys = Object.keys(DOMAINS).filter((k) =>
      filter.sec === 'all' || (filter.sec === 'math') === MATH_DOMAINS.includes(k));
    if (!keys.includes(filter.dom)) filter.dom = 'all';
    $('fDom').innerHTML = '<option value="all">All topics</option>' +
      keys.map((k) => `<option value="${k}" ${filter.dom === k ? 'selected' : ''}>${esc(DOMAINS[k])}</option>`).join('');
  }

  function choicesHTML(q, picked, reveal, act) {
    return `<div class="choices">${q.c.map((c, i) => {
      let cls = '';
      if (reveal) { if (i === q.a) cls = ' right'; else if (i === picked) cls = ' wrong'; }
      else if (i === picked) cls = ' selected';
      return `<button class="ch${cls}" data-act="${act}" data-i="${i}" ${reveal ? 'disabled' : ''}><span class="L">${LETTERS[i]}</span><span>${c}</span></button>`;
    }).join('')}</div>`;
  }

  function feedbackHTML(q, r, withRetry) {
    const right = q.num ? q.num[0].replace('-', '−') : LETTERS[q.a];
    const acts = [];
    if (q.see) acts.push(`<a href="#${q.see}">Read the note</a>`);
    if (withRetry) acts.push('<button class="btn link" data-act="retry">Try again</button>');
    return `<div class="fb ${r.ok ? 'ok' : 'no'}" role="status"><b>${r.ok ? 'Correct.' : `Not quite. The answer is ${right}.`}</b>${q.w}
      ${acts.length ? `<div class="acts">${acts.join('')}</div>` : ''}</div>`;
  }

  function headHTML(q, label) {
    return `<div class="q-h"><span class="num">${label}</span><span>${esc(DOMAINS[q.d])}</span><span class="lvl">${LEVEL[q.v]}</span></div>`;
  }

  function bankCard(q) {
    const r = answers[q.id];
    let body;
    if (q.num) {
      body = `<div class="numrow"><input id="in-${q.id}" inputmode="decimal" autocomplete="off" placeholder="Type your answer" value="${r ? esc(r.p) : ''}" ${r ? 'disabled' : ''} aria-label="Answer for question ${numberOf(q)}"><button class="btn" data-act="num" ${r ? 'disabled' : ''}>Check</button></div>`;
    } else {
      body = choicesHTML(q, r ? r.p : null, !!r, 'pick');
    }
    return `<article class="q" data-id="${q.id}">${headHTML(q, 'Question ' + numberOf(q))}
      <div class="stem">${q.s}</div>${body}${r ? feedbackHTML(q, r, true) : ''}</article>`;
  }

  function visibleQuestions() {
    return QUESTIONS.filter((q) => {
      if (filter.sec === 'math' && !isMath(q)) return false;
      if (filter.sec === 'rw' && isMath(q)) return false;
      if (filter.dom !== 'all' && q.d !== filter.dom) return false;
      if (filter.diff !== 'all' && q.v !== +filter.diff) return false;
      if (filter.stat === 'new' && answers[q.id]) return false;
      if (filter.stat === 'miss' && !(answers[q.id] && !answers[q.id].ok)) return false;
      return true;
    });
  }

  function renderBank() {
    const list = visibleQuestions();
    $('countLine').textContent = `Showing ${list.length} of ${QUESTIONS.length} questions.`;
    qlist.innerHTML = list.length ? list.map(bankCard).join('') :
      `<div class="empty">${filter.stat === 'miss' ? 'No missed questions here.' : 'Nothing matches these filters.'}</div>`;
    renderStats();
  }

  function renderStats() {
    const ids = Object.keys(answers).filter((k) => QUESTIONS.some((q) => q.id === k));
    const ok = ids.filter((k) => answers[k].ok).length;
    const pct = ids.length ? Math.round((ok / ids.length) * 100) : 0;
    $('stats').innerHTML = `<p class="total"><b>${ids.length ? pct + '%' : '–'}</b> correct · ${ok} of ${ids.length} answered right · ${QUESTIONS.length - ids.length} not yet tried</p>
      <div class="dstats">${Object.keys(DOMAINS).map((dk) => {
        const qs = QUESTIONS.filter((q) => q.d === dk);
        const done = qs.filter((q) => answers[q.id]);
        const right = done.filter((q) => answers[q.id].ok).length;
        const wrong = done.length - right;
        return `<div class="ds"><span>${esc(DOMAINS[dk])}</span><span>${right} right, ${wrong} wrong / ${qs.length}</span>
          <div class="trk"><i style="width:${(right / qs.length) * 100}%"></i><s style="width:${(wrong / qs.length) * 100}%"></s></div></div>`;
      }).join('')}</div>`;
  }

  function recordBank(q, p, ok) {
    answers[q.id] = { p, ok };
    saveAnswers();
    const el = qlist.querySelector(`[data-id="${q.id}"]`);
    if (el) el.outerHTML = bankCard(q);
    renderStats();
  }

  function checkBankTyped(q) {
    const inp = $('in-' + q.id);
    const ok = checkTyped(q, inp.value);
    if (ok === null) { inp.focus(); return; }
    recordBank(q, inp.value.trim(), ok);
  }

  qlist.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const q = QUESTIONS.find((x) => x.id === b.closest('.q').dataset.id);
    if (b.dataset.act === 'pick') { const i = +b.dataset.i; recordBank(q, i, i === q.a); }
    else if (b.dataset.act === 'num') checkBankTyped(q);
    else if (b.dataset.act === 'retry') {
      delete answers[q.id];
      saveAnswers();
      qlist.querySelector(`[data-id="${q.id}"]`).outerHTML = bankCard(q);
      renderStats();
    }
  });
  qlist.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('input[id^="in-"]')) checkBankTyped(QUESTIONS.find((x) => x.id === e.target.id.slice(3)));
  });

  [['fSec', 'sec'], ['fDom', 'dom'], ['fDiff', 'diff'], ['fStat', 'stat']].forEach(([id, key]) => {
    $(id).addEventListener('change', (e) => {
      filter[key] = e.target.value;
      if (key === 'sec') fillDomainSelect();
      renderBank();
    });
  });
  fillDomainSelect();

  $('resetWrap').addEventListener('click', (e) => {
    const w = $('resetWrap');
    if (e.target.id === 'resetBtn') w.innerHTML = '<span class="muted">Clear all answers?</span><button class="btn" id="resetYes">Clear</button><button class="btn ghost" id="resetNo">Keep</button>';
    else if (e.target.id === 'resetYes') { answers = {}; saveAnswers(); renderBank(); w.innerHTML = '<button class="btn link" id="resetBtn">Reset answers</button>'; }
    else if (e.target.id === 'resetNo') w.innerHTML = '<button class="btn link" id="resetBtn">Reset answers</button>';
  });

  /* ---------- Timed practice ---------- */
  const timedBox = $('timedBox');
  let run = null;
  let tick = null;

  function renderSetup() {
    clearInterval(tick);
    run = null;
    const sessions = store.get('sat-sessions', []);
    timedBox.innerHTML = `<p class="lead">Questions one at a time, with a clock, like the real test. You see the answers only at the end. Real pace: about 71 seconds per Reading &amp; Writing question and 95 seconds per Math question.</p>
      <form class="setup" id="setupForm">
        <fieldset><legend>Section</legend>
          <label><input type="radio" name="sec" value="math" checked> Math</label>
          <label><input type="radio" name="sec" value="rw"> Reading &amp; Writing</label>
          <label><input type="radio" name="sec" value="all"> Both</label>
        </fieldset>
        <fieldset><legend>Number of questions</legend>
          <label><input type="radio" name="n" value="10" checked> 10</label>
          <label><input type="radio" name="n" value="20"> 20</label>
          <label><input type="radio" name="n" value="30"> 30</label>
        </fieldset>
        <fieldset><legend>Which questions</legend>
          <label><input type="radio" name="pool" value="any" checked> Any</label>
          <label><input type="radio" name="pool" value="new"> Not answered yet</label>
          <label><input type="radio" name="pool" value="miss"> Ones I missed</label>
          <label><input type="radio" name="pool" value="hard"> Hard only</label>
        </fieldset>
        <div><button class="btn" type="submit">Start</button> <span class="muted" id="setupMsg"></span></div>
      </form>
      ${sessions.length ? `<h3>Past sets</h3><table class="tbl history"><tr><th>Date</th><th>Section</th><th>Score</th><th>Time</th></tr>
        ${sessions.slice(-10).reverse().map((s) => `<tr><td>${esc(s.date)}</td><td>${esc(s.sec)}</td><td>${s.right} / ${s.total}</td><td>${fmtTime(s.secs)}</td></tr>`).join('')}</table>` : ''}`;
    $('setupForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      startRun(f.get('sec'), +f.get('n'), f.get('pool'));
    });
  }

  function startRun(sec, n, pool) {
    let qs = QUESTIONS.filter((q) => sec === 'all' || (sec === 'math') === isMath(q));
    if (pool === 'new') qs = qs.filter((q) => !answers[q.id]);
    if (pool === 'miss') qs = qs.filter((q) => answers[q.id] && !answers[q.id].ok);
    if (pool === 'hard') qs = qs.filter((q) => q.v === 3);
    if (!qs.length) { $('setupMsg').textContent = 'No questions match. Pick another option.'; return; }
    qs = shuffle(qs).slice(0, n);
    // R&W comes first on the real test.
    if (sec === 'all') qs.sort((a, b) => isMath(a) - isMath(b));
    const pace = qs.reduce((t, q) => t + (isMath(q) ? 95 : 71), 0);
    run = { sec, qs, i: 0, picks: {}, flags: {}, start: Date.now(), pace, done: false };
    tick = setInterval(updateTimer, 1000);
    renderRun();
  }

  const elapsed = () => Math.floor((Date.now() - run.start) / 1000);

  function updateTimer() {
    const el = $('runTimer');
    if (!el || !run) return;
    const s = elapsed();
    el.textContent = fmtTime(s);
    el.classList.toggle('over', s > run.pace);
  }

  function renderRun() {
    const q = run.qs[run.i];
    const p = run.picks[q.id];
    const body = q.num
      ? `<div class="numrow"><input id="runIn" inputmode="decimal" autocomplete="off" placeholder="Type your answer" value="${p != null ? esc(p) : ''}" aria-label="Your answer"></div>`
      : choicesHTML(q, p, false, 'runpick');
    const answered = Object.keys(run.picks).length;
    timedBox.innerHTML = `<div class="run-bar"><span>Question ${run.i + 1} of ${run.qs.length} · ${answered} answered</span>
        <span>Time <span class="timer" id="runTimer">${fmtTime(elapsed())}</span> <span class="muted">/ target ${fmtTime(run.pace)}</span></span></div>
      <div class="dots">${run.qs.map((x, k) => `<button data-go="${k}" class="${run.picks[x.id] != null && run.picks[x.id] !== '' ? 'answered' : ''}${k === run.i ? ' current' : ''}${run.flags[x.id] ? ' flagged' : ''}" aria-label="Go to question ${k + 1}">${k + 1}</button>`).join('')}</div>
      <article class="q">${headHTML(q, 'Question ' + (run.i + 1))}<div class="stem">${q.s}</div>${body}</article>
      <div class="run-nav">
        <div><button class="btn ghost" data-nav="prev" ${run.i === 0 ? 'disabled' : ''}>Back</button>
          <button class="btn ghost" data-nav="flag">${run.flags[q.id] ? 'Unflag' : 'Flag for review'}</button></div>
        <div>${run.i < run.qs.length - 1 ? '<button class="btn" data-nav="next">Next</button>' : ''}
          <button class="btn ${run.i < run.qs.length - 1 ? 'ghost' : ''}" data-nav="finish">Finish</button></div>
      </div>
      <p class="muted" style="margin-top:14px"><button class="btn link" data-nav="quit">Quit without saving</button></p>`;
    updateTimer();
  }

  function saveTyped() {
    const inp = $('runIn');
    if (inp && run) run.picks[run.qs[run.i].id] = inp.value.trim();
  }

  function finishRun() {
    clearInterval(tick);
    const secs = elapsed();
    let right = 0;
    const results = run.qs.map((q) => {
      const p = run.picks[q.id];
      const blank = p == null || p === '';
      const ok = !blank && (q.num ? !!checkTyped(q, p) : p === q.a);
      if (ok) right++;
      if (!blank) answers[q.id] = { p, ok };
      return { q, p, ok, blank };
    });
    saveAnswers();
    const secName = { math: 'Math', rw: 'Reading & Writing', all: 'Both' }[run.sec];
    const sessions = store.get('sat-sessions', []);
    sessions.push({ date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), sec: secName, right, total: run.qs.length, secs });
    store.set('sat-sessions', sessions);

    const perQ = Math.round(secs / run.qs.length);
    timedBox.innerHTML = `<div class="result-head"><p class="big">${right} / ${run.qs.length}</p>
        <p>Time: ${fmtTime(secs)} (target ${fmtTime(run.pace)}). About ${perQ} seconds per question.</p>
        <button class="btn" id="again">New set</button></div>
      <h3>Review</h3>
      <div class="qlist">${results.map((r, k) => {
        let body;
        if (r.q.num) body = `<p>Your answer: <b>${r.blank ? '(blank)' : esc(r.p)}</b></p>`;
        else body = choicesHTML(r.q, r.blank ? null : r.p, true, 'none');
        return `<article class="q">${headHTML(r.q, 'Question ' + (k + 1))}<div class="stem">${r.q.s}</div>${body}
          ${r.blank ? `<div class="fb no"><b>Left blank. The answer is ${r.q.num ? r.q.num[0].replace('-', '−') : LETTERS[r.q.a]}.</b>${r.q.w}${r.q.see ? `<div class="acts"><a href="#${r.q.see}">Read the note</a></div>` : ''}</div>` : feedbackHTML(r.q, r, false)}</article>`;
      }).join('')}</div>`;
    run = null;
    $('again').addEventListener('click', () => { renderSetup(); window.scrollTo(0, 0); });
    window.scrollTo(0, 0);
  }

  timedBox.addEventListener('click', (e) => {
    if (!run) return;
    const pick = e.target.closest('[data-act="runpick"]');
    if (pick) { run.picks[run.qs[run.i].id] = +pick.dataset.i; renderRun(); return; }
    const go = e.target.closest('[data-go]');
    if (go) { saveTyped(); run.i = +go.dataset.go; renderRun(); return; }
    const nav = e.target.closest('[data-nav]');
    if (!nav) return;
    saveTyped();
    const a = nav.dataset.nav;
    if (a === 'prev') run.i--;
    else if (a === 'next') run.i++;
    else if (a === 'flag') run.flags[run.qs[run.i].id] = !run.flags[run.qs[run.i].id];
    else if (a === 'finish') {
      const blanks = run.qs.filter((q) => run.picks[q.id] == null || run.picks[q.id] === '').length;
      if (blanks && !nav.dataset.sure) {
        nav.dataset.sure = '1';
        nav.textContent = `${blanks} blank. Finish anyway?`;
        return;
      }
      finishRun();
      return;
    } else if (a === 'quit') { renderSetup(); return; }
    renderRun();
  });
  timedBox.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'runIn' && run) {
      saveTyped();
      if (run.i < run.qs.length - 1) { run.i++; renderRun(); }
    }
  });
  renderSetup();

  /* ---------- Flashcards ---------- */
  const fcState = store.get('sat-fc', {}); // front -> 'known' | 'learning'
  let deck = [];
  let pos = 0;
  let flipped = false;

  function buildDeck(shuffled) {
    const v = $('fcDeck').value;
    deck = FLASHCARDS.filter(([front, tag]) =>
      v === 'all' ? true : v === 'learning' ? fcState[front] !== 'known' : tag === v);
    if (shuffled) deck = shuffle(deck);
    pos = 0;
    flipped = false;
    renderCard();
  }

  function renderCard() {
    const known = FLASHCARDS.filter(([f]) => fcState[f] === 'known').length;
    if (!deck.length) {
      $('fcBox').innerHTML = `<div class="empty">No cards here. You marked all ${known} as known. Pick another deck.</div>`;
      return;
    }
    const [front, tag, back] = deck[pos];
    const mark = fcState[front];
    $('fcBox').innerHTML = `<div class="fc-wrap">
      <button class="fc${flipped ? ' back' : ''}" id="fcCard" aria-label="${flipped ? 'Show front' : 'Show answer'}">
        <span class="tag">${esc(tag)}${mark ? ' · ' + (mark === 'known' ? 'known' : 'still learning') : ''}</span>
        ${flipped ? `<span class="answer">${esc(back)}</span>` : `<span class="front">${esc(front)}</span><span class="hint">Click or press space to flip</span>`}
      </button>
      <div class="fc-ctrl">
        <button class="btn ghost" data-fc="prev" ${pos === 0 ? 'disabled' : ''}>Previous</button>
        <span class="fc-pos">${pos + 1} of ${deck.length} · ${known} known</span>
        <button class="btn ghost" data-fc="next" ${pos === deck.length - 1 ? 'disabled' : ''}>Next</button>
      </div>
      <div class="fc-ctrl"><span></span><div class="mid">
        <button class="btn ghost" data-fc="learning">Still learning</button>
        <button class="btn" data-fc="known">I know this</button>
      </div><span></span></div>
    </div>`;
  }

  $('fcBox').addEventListener('click', (e) => {
    if (e.target.closest('#fcCard')) { flipped = !flipped; renderCard(); return; }
    const b = e.target.closest('[data-fc]');
    if (!b || !deck.length) return;
    const a = b.dataset.fc;
    if (a === 'prev') pos--;
    else if (a === 'next') pos++;
    else {
      fcState[deck[pos][0]] = a;
      store.set('sat-fc', fcState);
      if (pos < deck.length - 1) pos++;
    }
    flipped = false;
    renderCard();
  });
  document.addEventListener('keydown', (e) => {
    if (current !== 'cards' || e.target.matches('input, select, textarea')) return;
    if (e.key === 'ArrowRight' && pos < deck.length - 1) { pos++; flipped = false; renderCard(); }
    else if (e.key === 'ArrowLeft' && pos > 0) { pos--; flipped = false; renderCard(); }
    else if (e.key === ' ' && !e.target.closest('button')) { e.preventDefault(); flipped = !flipped; renderCard(); }
  });
  $('fcDeck').addEventListener('change', () => buildDeck(false));
  $('fcShuffle').addEventListener('click', () => buildDeck(true));
  buildDeck(false);

  /* ---------- Test day checklist ---------- */
  const bag = store.get('sat-bag', {});
  $('bag').innerHTML = BAG.map((x, i) => `<li><label><input type="checkbox" data-i="${i}" ${bag[i] ? 'checked' : ''}><span>${x}</span></label></li>`).join('');
  $('bag').addEventListener('change', (e) => { bag[e.target.dataset.i] = e.target.checked; store.set('sat-bag', bag); });

  route();
})();
