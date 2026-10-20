/* Carrier Companion · product page interactions (demo data).
   Dispatch: drag a load onto a driver's day, with a hazmat guardrail.
   POD: tap Delivered on the driver app; POD, invoice and settlement land on the load.
   Hub: click a tool to connect it. */
(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, reduce ? 0 : ms));

  function toast(root, msg, kind) {
    const t = root.querySelector('.ix-toast');
    t.textContent = msg; t.className = 'ix-toast show ' + (kind || '');
    clearTimeout(t._h); t._h = setTimeout(() => { t.className = 'ix-toast'; }, 3800);
  }

  /* ---------- Dispatch board ---------- */
  document.querySelectorAll('[data-ix="dispatch"]').forEach((root) => {
    const tray = root.querySelector('.dx-tray');
    const initial = root.querySelector('.dx-stage').innerHTML;
    let selected = null, ghost = null, drag = null;

    const cells = () => [...root.querySelectorAll('.dx-cell')];
    const verdict = (load, cell) => {
      const row = cell.closest('.dx-row'), driver = row.dataset.driver, day = cell.dataset.day;
      if (cell.querySelector('.dx-trip')) {
        return { ok: false, msg: `${driver} already has ${cell.querySelector('.dx-trip b').textContent} on ${day}.` };
      }
      if (load.dataset.hazmat === '1' && row.dataset.hazmat !== '1') {
        return { ok: false, msg: `Blocked. Trip ${load.dataset.trip} is hazmat and ${driver} has no hazmat endorsement.` };
      }
      return { ok: true, msg: `Assigned. ${load.querySelector('b').textContent} to ${driver}, ${day}. Logged to the audit trail.` };
    };
    const clearMarks = () => cells().forEach((c) => c.classList.remove('ok', 'no', 'target'));
    const preview = (load) => cells().forEach((c) => c.classList.add(verdict(load, c).ok ? 'target' : 'dim'));
    const unpreview = () => cells().forEach((c) => c.classList.remove('target', 'dim'));

    function place(load, cell) {
      const v = verdict(load, cell);
      clearMarks(); unpreview();
      if (!v.ok) {
        cell.classList.add('no'); setTimeout(() => cell.classList.remove('no'), 700);
        load.classList.add('bounce'); setTimeout(() => load.classList.remove('bounce'), 600);
        toast(root, v.msg, 'warn'); return;
      }
      const trip = document.createElement('div');
      trip.className = 'dx-trip new';
      trip.innerHTML = `<b>${load.querySelector('b').textContent}</b><span>Trip ${load.dataset.trip}</span>`;
      cell.appendChild(trip); load.remove(); selected = null;
      toast(root, v.msg, 'ok');
      if (!root.querySelector('.dx-load')) {
        root.querySelector('.dx-empty').hidden = false;
      }
    }

    function select(load) {
      if (selected === load) { load.classList.remove('selected'); selected = null; unpreview(); return; }
      root.querySelectorAll('.dx-load').forEach((l) => l.classList.remove('selected'));
      selected = load; load.classList.add('selected'); unpreview(); preview(load);
    }

    root.addEventListener('pointerdown', (e) => {
      const load = e.target.closest('.dx-load'); if (!load || e.button > 0) return;
      drag = { load, x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
      load.setPointerCapture(e.pointerId);
    });
    root.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 6) return;
      if (!drag.moved) {
        drag.moved = true; const r = drag.load.getBoundingClientRect();
        ghost = drag.load.cloneNode(true); ghost.classList.add('ghost');
        Object.assign(ghost.style, { width: r.width + 'px', left: r.left + 'px', top: r.top + 'px' });
        document.body.appendChild(ghost); drag.ox = drag.x - r.left; drag.oy = drag.y - r.top;
        drag.load.classList.add('lifted'); preview(drag.load);
      }
      ghost.style.left = e.clientX - drag.ox + 'px'; ghost.style.top = e.clientY - drag.oy + 'px';
      ghost.hidden = true; const under = document.elementFromPoint(e.clientX, e.clientY); ghost.hidden = false;
      const cell = under && under.closest('.dx-cell');
      clearMarks();
      if (cell && root.contains(cell)) cell.classList.add(verdict(drag.load, cell).ok ? 'ok' : 'no');
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag; drag = null;
      if (!d.moved) { select(d.load); return; }
      ghost.hidden = true; const under = document.elementFromPoint(e.clientX, e.clientY); ghost.remove(); ghost = null;
      d.load.classList.remove('lifted');
      const cell = under && under.closest('.dx-cell');
      if (cell && root.contains(cell)) place(d.load, cell); else { clearMarks(); unpreview(); }
    };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', (e) => { if (drag && ghost) { ghost.remove(); ghost = null; drag.load.classList.remove('lifted'); } drag = null; clearMarks(); unpreview(); });

    // tap a load, then tap a day (touch and keyboard friendly)
    root.addEventListener('click', (e) => {
      const cell = e.target.closest('.dx-cell');
      if (cell && selected) place(selected, cell);
    });
    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const load = e.target.closest('.dx-load'), cell = e.target.closest('.dx-cell');
      if (load) { e.preventDefault(); select(load); }
      else if (cell && selected) { e.preventDefault(); place(selected, cell); }
    });
    root.querySelector('.ix-reset').addEventListener('click', () => {
      root.querySelector('.dx-stage').innerHTML = initial; selected = null;
      toast(root, 'Board reset.', '');
    });
  });

  /* ---------- POD to invoice ---------- */
  document.querySelectorAll('[data-ix="pod"]').forEach((root) => {
    const btn = root.querySelector('.pd-btn'), replay = root.querySelector('.ix-reset');
    const steps = [...root.querySelectorAll('.pd-step')];
    let running = false;
    btn.addEventListener('click', async () => {
      if (running) return; running = true;
      btn.disabled = true; btn.textContent = 'Uploading POD…';
      root.querySelector('.pd-photo').classList.add('snap');
      await wait(650);
      for (const s of steps) {
        s.classList.add('done'); s.querySelector('.st').textContent = s.dataset.done;
        await wait(520);
      }
      btn.textContent = 'Delivered'; btn.classList.add('ok');
      root.querySelector('.pd-pill').textContent = 'Delivered';
      root.querySelector('.pd-pill').classList.add('ok');
      replay.hidden = false; running = false;
    });
    replay.addEventListener('click', () => {
      steps.forEach((s) => { s.classList.remove('done'); s.querySelector('.st').textContent = s.dataset.wait; });
      root.querySelector('.pd-photo').classList.remove('snap');
      btn.disabled = false; btn.classList.remove('ok'); btn.textContent = 'Mark delivered';
      root.querySelector('.pd-pill').textContent = 'At delivery'; root.querySelector('.pd-pill').classList.remove('ok');
      replay.hidden = true;
    });
  });

  /* ---------- Integrations hub ---------- */
  document.querySelectorAll('[data-ix="hub"]').forEach((root) => {
    const stage = root.querySelector('.hb-stage'), svg = root.querySelector('.hb-lines');
    const core = root.querySelector('.hb-core'), tools = [...root.querySelectorAll('.hb-tool')];
    const count = root.querySelector('.hb-count');
    const NS = 'http://www.w3.org/2000/svg';
    const bases = tools.map(() => { const p = document.createElementNS(NS, 'path'); p.setAttribute('class', 'base'); svg.appendChild(p); return p; });
    const paths = tools.map(() => { const p = document.createElementNS(NS, 'path'); svg.appendChild(p); return p; });
    function draw() {
      const s = stage.getBoundingClientRect(); svg.setAttribute('viewBox', `0 0 ${s.width} ${s.height}`);
      const c = core.getBoundingClientRect(), cx = c.left + c.width / 2 - s.left, cy = c.top + c.height / 2 - s.top;
      tools.forEach((t, i) => {
        const r = t.getBoundingClientRect();
        const tx = r.left + r.width / 2 - s.left, ty = (r.top + r.height / 2 - s.top);
        const ex = tx + (cx - tx) * 0.0, ey = ty < cy ? r.bottom - s.top : r.top - s.top;
        const mx = (ex + cx) / 2;
        const d = `M${ex},${ey} C${ex},${(ey + cy) / 2} ${mx},${cy} ${cx},${cy}`;
        paths[i].setAttribute('d', d); bases[i].setAttribute('d', d);
        const len = paths[i].getTotalLength(); paths[i].style.strokeDasharray = len; paths[i].dataset.len = len;
        if (!t.classList.contains('on')) paths[i].style.strokeDashoffset = len;
      });
    }
    function update() {
      const n = tools.filter((t) => t.classList.contains('on')).length;
      count.textContent = n === tools.length ? 'All tools connected' : `${n} of ${tools.length} connected`;
      core.classList.toggle('live', n > 0);
    }
    tools.forEach((t, i) => t.addEventListener('click', () => {
      const on = t.classList.toggle('on');
      t.setAttribute('aria-pressed', on);
      t.querySelector('.hb-st').textContent = on ? 'Connected' : 'Available';
      paths[i].classList.toggle('on', on);
      paths[i].style.strokeDashoffset = on ? 0 : paths[i].dataset.len;
      update();
    }));
    draw(); update();
    if ('ResizeObserver' in window) new ResizeObserver(draw).observe(stage); else window.addEventListener('resize', draw);
  });
})();
