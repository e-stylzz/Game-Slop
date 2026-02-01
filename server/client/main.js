const nameEl = document.getElementById('name');
const connectBtn = document.getElementById('connect');
const statusEl = document.getElementById('status');
function setStatus(text) {
  const el = document.getElementById('status');
  if (el) el.textContent = text;
}
const mapEl = document.getElementById('map');
const messagesEl = document.getElementById('messages');
const sayInput = document.getElementById('sayInput');
const sayBtn = document.getElementById('sayBtn');
const attackBtn = document.getElementById('attack');
const specialBtn = document.getElementById('special');
const quitBtn = document.getElementById('quit');
// client-side move costs (keep in sync with server)
const ATTACK_COST = 2;
const SPECIAL_COST = 4;
const hpBar = document.getElementById('hpBar');
const hpText = document.getElementById('hpText');
const movesEl = document.getElementById('moves');
const rollBtn = document.getElementById('roll');
const itemsContainer = document.getElementById('items');
const charNameEl = document.getElementById('charName');
const statAttackEl = document.getElementById('statAttack');
const statRangeEl = document.getElementById('statRange');
const statSpeedEl = document.getElementById('statSpeed');
const charCardTitleEl = document.getElementById('charCardTitle');

let ws = null;
let availableCharacters = {};
let selectedCharacterId = null;

function setActionControl(el, emoji, label, disabled) {
  if (!el) return;
  // if element contains emoji/label children (card), update them
  const emojiEl = el.querySelector && el.querySelector('.actionEmoji');
  const labelEl = el.querySelector && el.querySelector('.actionLabel');
  if (emojiEl) emojiEl.textContent = emoji || '';
  if (labelEl) labelEl.textContent = label || '';
  if (!emojiEl && !labelEl) {
    el.textContent = `${emoji ? emoji + ' ' : ''}${label || ''}`.trim();
  }
  // apply disabled state in an accessible way
  if (disabled) {
    if (el.tagName === 'BUTTON') el.disabled = true;
    else {
      el.setAttribute('aria-disabled', 'true');
      el.tabIndex = -1;
    }
    el.classList && el.classList.add && el.classList.add('disabled');
  } else {
    if (el.tagName === 'BUTTON') el.disabled = false;
    else {
      el.setAttribute('aria-disabled', 'false');
      if (el.getAttribute('tabindex') === '-1') el.tabIndex = 0;
    }
    el.classList && el.classList.remove && el.classList.remove('disabled');
  }
}

function updateCharacterCard(c){
  if (!c) return;
  if (charCardTitleEl) charCardTitleEl.textContent = (c.emoji ? c.emoji + ' ' : '') + 'Character - ' + (c.type || c.name || c.id || '-');
  if (charNameEl) charNameEl.textContent = c.type || c.name || c.id || '-';
  if (statAttackEl) statAttackEl.textContent = (c.attack ?? c.attack_power) ?? '-';
  if (statRangeEl) statRangeEl.textContent = (c.attack_range ?? c.range) ?? '-';
  if (statSpeedEl) statSpeedEl.textContent = (c.speed) ?? '-';
  const hp = c.health ?? c.max_hp ?? null;
  if (hp !== null && hp !== undefined) {
    if (hpBar) { hpBar.max = hp; /* set current to full on preview */ hpBar.value = hp; }
    if (hpText) hpText.textContent = `${hp}/${hp}`;
  }
  // update special control label from character definition if available
  if (specialBtn) {
    const s = c.special || {};
    const name = s.name || 'Special';
    const emoji = s.emoji || '✨';
    setActionControl(specialBtn, emoji, `${name}`, false);
  }
  // update damage/cost previews for attack and special
  const attackDamageEl = document.getElementById('attackDamage');
  const attackCostEl = document.getElementById('attackCost');
  const specialDamageEl = document.getElementById('specialDamage');
  const specialCostEl = document.getElementById('specialCost');
  const baseAtk = c.attack ?? c.attack_power ?? null;
  if (attackDamageEl) attackDamageEl.textContent = baseAtk !== null ? String(baseAtk) : '-';
  if (attackCostEl) attackCostEl.textContent = String(ATTACK_COST);
  const specialMult = (c.special && (c.special.damage_mult || c.special.damage_mult === 0)) ? c.special.damage_mult : (c.special_damage_mult || 1.5);
  if (specialDamageEl) specialDamageEl.textContent = baseAtk !== null ? String(Math.round(baseAtk * specialMult)) : '-';
  if (specialCostEl) specialCostEl.textContent = String(SPECIAL_COST);
}

function addMsg(t){
  const d = document.createElement('div');
  d.textContent = t;
  messagesEl.appendChild(d);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function connect() {
  if (!nameEl.value) { alert('Enter a name'); return }
  // connect to the same host/port the page was served from
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = proto + '://' + location.host + '/ws';
  ws = new WebSocket(url);

  ws.addEventListener('open', () => {
    setStatus('connected');
    const sel = document.querySelector('input[name="character"]:checked');
    const charId = sel ? sel.value : '';
    // persist selected character id so we can show its full stats
    selectedCharacterId = charId || selectedCharacterId;
    ws.send('join ' + nameEl.value + (charId ? ' ' + charId : ''));
    // switch UI to game view
    const lobby = document.getElementById('lobby');
    const game = document.getElementById('game');
    if (lobby) lobby.style.display = 'none';
    if (game) game.style.display = '';
    window._deathShown = false;
    // immediately update card from selected character (preview)
    if (selectedCharacterId && availableCharacters[selectedCharacterId]) updateCharacterCard(availableCharacters[selectedCharacterId]);
  });

  ws.addEventListener('message', ev => {
    try {
      const data = JSON.parse(ev.data);
      if (data.type === 'map') {
        // render map as tiles so we can highlight the player's own tile
        const rows = (data.map || '').split('\n');
        const you = data.you || null;
        let html = '';
        rows.forEach((row, r) => {
          // iterate by codepoints to keep emoji intact
          const chars = Array.from(row);
          chars.forEach((ch, c) => {
            const isYou = you && you.x === c && you.y === r;
            html += `<span class="tile${isYou ? ' you' : ''}">${ch || ' '}</span>`;
          });
          html += '\n';
        });
        mapEl.innerHTML = html;
      } else if (data.type === 'status') {
        const hp = Math.max(0, data.hp || 0);
        const max_hp = data.max_hp || 1;
        const mp = data.move_points || 0;
        if (hpBar) { hpBar.max = max_hp; hpBar.value = hp; }
        if (hpText) hpText.textContent = `${hp}/${max_hp}`;
        if (movesEl) movesEl.textContent = mp;
        // merge server status with selected character preview so card remains consistent
        const preview = selectedCharacterId ? availableCharacters[selectedCharacterId] : null;
        const merged = Object.assign({}, preview || {}, data || {});
        if (charNameEl) charNameEl.textContent = (merged.emoji ? merged.emoji + ' ' : '') + (merged.player_name || merged.name || merged.type || merged.id || '-');
        if (statAttackEl) statAttackEl.textContent = (merged.attack ?? merged.attack_power) ?? '-';
        if (statRangeEl) statRangeEl.textContent = (merged.attack_range ?? merged.range) ?? '-';
        if (statSpeedEl) statSpeedEl.textContent = (merged.speed) ?? '-';
        if (attackBtn) {
          setActionControl(attackBtn, '🎯', `Attack`, mp < ATTACK_COST);
          const atkVal = (merged.attack ?? merged.attack_power) ?? null;
          const atkDmgEl = document.getElementById('attackDamage');
          const atkCostEl = document.getElementById('attackCost');
          if (atkDmgEl) atkDmgEl.textContent = atkVal !== null ? String(atkVal) : '-';
          if (atkCostEl) atkCostEl.textContent = String(ATTACK_COST);
        }
        if (specialBtn) {
          const preview = selectedCharacterId ? availableCharacters[selectedCharacterId] : null;
          const s = (preview && preview.special) ? preview.special : null;
          const name = s && s.name ? s.name : 'Special';
          const emoji = s && s.emoji ? s.emoji : '✨';
          setActionControl(specialBtn, emoji, `${name}`, mp < SPECIAL_COST);
          const baseAtk = (merged.attack ?? merged.attack_power) ?? null;
          const specialDmgEl = document.getElementById('specialDamage');
          const specialCostEl = document.getElementById('specialCost');
          const mult = (s && (s.damage_mult || s.damage_mult === 0)) ? s.damage_mult : (merged.special_damage_mult || 1.5);
          if (specialDmgEl) specialDmgEl.textContent = baseAtk !== null ? String(Math.round(baseAtk * mult)) : '-';
          if (specialCostEl) specialCostEl.textContent = String(SPECIAL_COST);
        }
        if (hp <= 0 && !window._deathShown) {
          window._deathShown = true;
          alert('You died');
          if (ws) ws.close();
        }
      } else if (data.type === 'turn') {
        // show whose turn it is and render upcoming queue
        const current = document.getElementById('currentPlayer');
        const queueEl = document.getElementById('turnQueue');
        if (current) current.textContent = data.player_name || '-';
        if (queueEl) {
          queueEl.innerHTML = '';
          if (Array.isArray(data.queue)) {
            data.queue.forEach((q, i) => {
              const li = document.createElement('li');
              li.textContent = q.player_name + (q.player_id === window.myPlayerId ? ' (you)' : '');
              queueEl.appendChild(li);
            });
          }
        }
      } else if (data.type === 'info') {
        addMsg(data.msg);
      } else if (data.type === 'init') {
        // save my player id
        window.myPlayerId = data.player_id;
      } else if (data.type === 'turn') {
        // show whose turn it is
        if (window.myPlayerId && data.player_id === window.myPlayerId) {
            setStatus('Your turn');
          } else {
            setStatus('Waiting: ' + data.player_name);
          }
      } else {
        addMsg(JSON.stringify(data));
      }
    } catch (e) {
      addMsg(ev.data);
    }
  });

  ws.addEventListener('close', () => {
    setStatus('disconnected');
    addMsg('connection closed');
    // show lobby again
    const lobby = document.getElementById('lobby');
    const game = document.getElementById('game');
    if (lobby) lobby.style.display = '';
    if (game) game.style.display = 'none';
  });
}

async function loadCharacters() {
  const container = document.getElementById('characters');
  if (!container) return;
  container.innerHTML = '';
  try {
    const res = await fetch('/characters');
    const data = await res.json();
    data.forEach(c => {
      const card = document.createElement('label');
      card.className = 'charCard';
      card.tabIndex = 0;
      card.innerHTML = `\n        <input type="radio" name="character" value="${c.id}" style="display:none">\n        <div class="charTitle">${c.type}</div>\n        <div class="charEmoji">${c.emoji ?? ''}</div>\n        <div class="charAttrs">\n          <div>HP: ${c.health}</div>\n          <div>Attack: ${c.attack ?? '-'}</div>\n          <div>Range: ${c.attack_range ?? '-'}</div>\n          <div>Speed: ${c.speed ?? '-'}</div>\n        </div>`;
      const radio = card.querySelector('input[name="character"]');
      // save character for preview updates
      availableCharacters[c.id] = c;
      card.addEventListener('click', (e) => {
        radio.checked = true;
        document.querySelectorAll('.charCard').forEach(x => x.classList.remove('selected'));
        card.classList.add('selected');
        updateCharacterCard(c);
      });
      container.appendChild(card);
    });
    // auto-select first
    const first = container.querySelector('input[name="character"]');
    if (first) { first.checked = true; first.closest('.charCard').classList.add('selected'); updateCharacterCard(availableCharacters[first.value]); }
  } catch (e) {
    const defaults = [
      {id:'wizard',type:'Wizard',emoji:'🧙',health:50,attack_range:3,speed:2,special:{name:'Thunder Clap',emoji:'⚡'}},
      {id:'elf',type:'Elf',emoji:'🧝',health:60,attack_range:2,speed:3,special:{name:'Flaming Arrows',emoji:'🔥'}},
      {id:'barbarian',type:'Barbarian',emoji:'🪓',health:100,attack_range:1,speed:1,special:{name:'Berserker Slam',emoji:'💥'}},
      {id:'snowbeast',type:'Snow Beast',emoji:'🐺',health:120,attack_range:2,speed:1,special:{name:'Frost Bite',emoji:'❄️'}},
      ];
    defaults.forEach(c => {
      const card = document.createElement('label');
      card.className = 'charCard';
      card.innerHTML = `\n        <input type="radio" name="character" value="${c.id}" style="display:none">\n        <div class="charTitle">${c.type}</div>\n        <div class="charEmoji">${c.emoji ?? ''}</div>\n        <div class="charAttrs">\n          <div>HP: ${c.health}</div>\n          <div>Attack: ${c.attack ?? '-'}</div>\n          <div>Range: ${c.attack_range ?? '-'}</div>\n          <div>Speed: ${c.speed ?? '-'}</div>\n        </div>`;
      const radio = card.querySelector('input[name="character"]');
      availableCharacters[c.id] = c;
      card.addEventListener('click', () => {
        radio.checked = true;
        document.querySelectorAll('.charCard').forEach(x => x.classList.remove('selected'));
        card.classList.add('selected');
        updateCharacterCard(c);
      });
      container.appendChild(card);
    });
    const first = container.querySelector('input[name="character"]');
    if (first) { first.checked = true; first.closest('.charCard').classList.add('selected'); updateCharacterCard(availableCharacters[first.value]); }
  }
}

// populate character list on load
loadCharacters();

connectBtn.addEventListener('click', connect);

rollBtn.addEventListener('click', () => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return addMsg('Not connected');
  ws.send('roll');
});

// items toggle
const itemsToggle = document.getElementById('itemsToggle');
if (itemsToggle) {
  itemsToggle.addEventListener('click', () => {
    if (!itemsContainer) return;
    itemsContainer.style.display = itemsContainer.style.display === 'none' ? '' : 'none';
  });
}

async function loadItems() {
  if (!itemsContainer) return;
  try {
    const res = await fetch('/items');
    const items = await res.json();
    itemsContainer.innerHTML = '';
    itemsContainer.classList.add('itemList');
    items.forEach(it => {
      const card = document.createElement('label');
      card.className = 'itemCard';
      card.innerHTML = `\n        <div class="itemTitle">${it.name}</div>\n        <div class="itemAttrs">Moves: ${it.move_cost}</div>`;
      card.addEventListener('click', () => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return addMsg('Not connected');
        ws.send('use ' + it.id);
      });
      itemsContainer.appendChild(card);
    });
  } catch (e) {
    // fallback
    itemsContainer.innerHTML = '';
    itemsContainer.classList.add('itemList');
    const fallback = [
      {id:'berry',name:'Berry',move_cost:3},
      {id:'medkit',name:'Med Kit',move_cost:6},
    ];
    fallback.forEach(it=>{
      const card = document.createElement('label');
      card.className = 'itemCard';
      card.innerHTML = `\n        <div class="itemTitle">${it.name}</div>\n        <div class="itemAttrs">Moves: ${it.move_cost}</div>`;
      card.addEventListener('click', ()=>{ if (!ws || ws.readyState !== WebSocket.OPEN) return addMsg('Not connected'); ws.send('use ' + it.id); });
      itemsContainer.appendChild(card);
    });
  }
}

loadItems();

document.querySelectorAll('button[data-dir]').forEach(b => {
  b.addEventListener('click', () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return addMsg('Not connected');
    const dir = b.getAttribute('data-dir');
    ws.send('move ' + dir);
  });
});

sayBtn.addEventListener('click', () => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return addMsg('Not connected');
  const txt = sayInput.value.trim();
  if (!txt) return;
  ws.send('say ' + txt);
  sayInput.value = '';
});

if (quitBtn) {
  quitBtn.addEventListener('click', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    } else {
      setStatus('disconnected');
      addMsg('disconnected');
      const lobby = document.getElementById('lobby');
      const game = document.getElementById('game');
      if (lobby) lobby.style.display = '';
      if (game) game.style.display = 'none';
    }
  });
}

attackBtn.addEventListener('click', () => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return addMsg('Not connected');
  if (attackBtn.classList && attackBtn.classList.contains && attackBtn.classList.contains('disabled')) return addMsg('Not enough moves');
  if (attackBtn.getAttribute && attackBtn.getAttribute('aria-disabled') === 'true') return addMsg('Not enough moves');
  ws.send('attack');
});

specialBtn.addEventListener('click', () => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return addMsg('Not connected');
  if (specialBtn.classList && specialBtn.classList.contains && specialBtn.classList.contains('disabled')) return addMsg('Not enough moves');
  if (specialBtn.getAttribute && specialBtn.getAttribute('aria-disabled') === 'true') return addMsg('Not enough moves');
  ws.send('attack special');
});

// allow Enter to send a chat
sayInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); sayBtn.click(); }
});

// Arrow keys to move
document.addEventListener('keydown', (e) => {
  // don't capture keys while typing in inputs/textareas
  if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  let dir = null;
  // debug key hint removed
  if (e.key === 'ArrowUp') dir = 'north';
  else if (e.key === 'ArrowDown') dir = 'south';
  else if (e.key === 'ArrowLeft') dir = 'west';
  else if (e.key === 'ArrowRight') dir = 'east';
  if (dir) {
    e.preventDefault();
    ws.send('move ' + dir);
  }
});

// spacebar to attack
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    if (!ws || ws.readyState !== WebSocket.OPEN) return addMsg('Not connected');
    // don't attack if not enough move points
    const mp = parseInt(movesEl ? movesEl.textContent : '0', 10) || 0;
    if (mp < ATTACK_COST) return addMsg('Not enough moves');
    e.preventDefault();
    ws.send('attack');
  }
});

// 'S' key for special attack (when not focused in input)
document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyS') {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    if (!ws || ws.readyState !== WebSocket.OPEN) return addMsg('Not connected');
    const mp = parseInt(movesEl ? movesEl.textContent : '0', 10) || 0;
    if (mp < SPECIAL_COST) return addMsg('Not enough moves');
    e.preventDefault();
    ws.send('attack special');
  }
});
