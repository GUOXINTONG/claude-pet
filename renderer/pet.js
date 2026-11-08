'use strict';
(() => {
  const api = window.petBridge || null;
  const $ = (s) => document.querySelector(s);
  const bubble = $('#bubble');
  const bubbleText = $('#bubble-text');
  const badge = $('#badge');
  const skinImg = $('#skin');
  const STATE_LABEL = {
    idle: 'Idle', thinking: 'Thinking', working: 'Working', waiting: 'Needs you',
    done: 'Done', error: 'Error', oops: 'Oops', sleeping: 'Resting',
  };

  let cur = { state: 'sleeping', list: [] };
  let hovering = false;
  let over = false;
  let confettiTimer = null;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function updateBubble() {
    if (hovering) {
      const list = cur.list || [];
      bubbleText.innerHTML = list.length
        ? `<div class="title">Claude Code sessions</div>` + list.map((i) =>
            `<div class="row"><i class="dot ${esc(i.state)}"></i><b>${esc(i.project)}</b><span>${esc(i.label || STATE_LABEL[i.state] || '')}</span></div>`).join('')
        : '<div class="row"><span>No Claude Code sessions yet</span></div>';
      bubble.className = 'show list';
      return;
    }
    let text = cur.label || '';
    if (text && cur.total > 1 && cur.project) text = `${cur.project} · ${text}`;
    if (!text) { bubble.className = ''; return; }
    bubbleText.textContent = text;
    bubble.className = `show ${cur.state}`;
  }

  function burst() {
    const box = $('#confetti');
    box.innerHTML = '';
    const colors = ['#FFD23F', '#E8705A', '#5BC0EB', '#9BC53D', '#C77DFF', '#FF6F91'];
    for (let i = 0; i < 26; i++) {
      const a = (-90 + (Math.random() * 150 - 75)) * Math.PI / 180;
      const dist = 45 + Math.random() * 60;
      const el = document.createElement('i');
      el.style.setProperty('--dx', `${Math.cos(a) * dist}px`);
      el.style.setProperty('--dy', `${Math.sin(a) * dist}px`);
      el.style.setProperty('--r', `${Math.random() * 540 - 270}deg`);
      el.style.setProperty('--c', colors[i % colors.length]);
      el.style.setProperty('--d', `${Math.random() * 0.15}s`);
      box.appendChild(el);
    }
  }

  function render(s) {
    const prev = cur.state;
    cur = s;
    document.body.dataset.state = s.state;
    if (s.scale) document.body.style.setProperty('--s', String(s.scale));

    const skin = s.skins && (s.skins[s.state] || (s.state === 'oops' && s.skins.error) || s.skins.idle);
    if (skin) {
      if (skinImg.dataset.src !== skin) { skinImg.src = skin; skinImg.dataset.src = skin; }
      document.body.classList.add('has-skin');
    } else {
      document.body.classList.remove('has-skin');
    }

    if (s.active > 1) { badge.textContent = String(s.active); badge.classList.add('show'); }
    else badge.classList.remove('show');

    updateBubble();

    if (s.state === 'done' && prev !== 'done') {
      burst();
      clearTimeout(confettiTimer);
      confettiTimer = setTimeout(() => { if (cur.state === 'done') burst(); }, 2200);
    }
  }

  // ---- mouse: click-through except on the pet itself ----
  const isPet = (t) => !!(t && t.closest && t.closest('.hit, #skin, #bubble.show'));
  function setOver(v) {
    if (v === over) return;
    over = v;
    hovering = v;
    if (api) api.setIgnore(!v);
    updateBubble();
  }
  document.addEventListener('mousemove', (e) => setOver(isPet(e.target)));
  document.addEventListener('mouseleave', () => setOver(false));

  // small pixel-art skins: scale up crisp instead of blurry
  skinImg.addEventListener('load', () => {
    document.body.classList.toggle('pixel', skinImg.naturalWidth > 0 && skinImg.naturalWidth <= 128);
  });

  let pressed = false;
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !isPet(e.target)) return;
    pressed = true;
    if (api) api.dragStart();
  });
  window.addEventListener('pointerup', () => {
    if (!pressed) return;
    pressed = false;
    if (api) api.dragEnd();
  });
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (api) api.menu();
  });

  if (api) {
    api.onState(render);
  } else {
    // Browser preview: index.html?state=working&label=...
    const q = new URLSearchParams(location.search);
    window.__render = render;
    render({
      state: q.get('state') || 'idle',
      label: q.get('label') || '',
      project: q.get('project') || '',
      active: Number(q.get('active') || 1),
      total: Number(q.get('total') || 1),
      list: [],
      skins: q.get('skin') ? { [q.get('skinState') || 'idle']: q.get('skin') } : {},
      scale: Number(q.get('s') || 0.6),
    });
  }
})();
