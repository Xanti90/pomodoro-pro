/* ════════════════════════════════════════════
   FOCUMO v1.0 — Lógica Frontend
   Timer · Sonidos Web Audio API · Siri · Chat IA
   © 2026 Santiago Jiménez Téllez
   ════════════════════════════════════════════ */

// ── ESTADO ─────────────────────────────────────────────────
const MODOS = {
  'trabajo':        { duracion: 25, label: 'Enfócate', clase: '',        emoji: '' },
  'descanso-corto': { duracion: 5,  label: 'Descansa', clase: 'break-s', emoji: '' },
  'descanso-largo': { duracion: 15, label: 'Recarga',  clase: 'break-l', emoji: '' },
};

const CIRC = 804; // 2π × 128 (nuevo radio)

let modo              = 'trabajo';
let categoria         = 'Opositor';
let segundosRestantes = 25 * 60;
let segundosTotales   = 25 * 60;
let corriendo         = false;
let intervalo         = null;
let pomodorosHoy      = 0;
let rondaActual       = 1;
let chartDias         = null;
let chartCats         = null;

// Audio
let sonidoActual = 'campana';
let volumen      = 0.7;
let audioCtx     = null;

// ── DOM ────────────────────────────────────────────────────
const elTiempo   = document.getElementById('timer-time');
const elLabel    = document.getElementById('timer-label');
const elRing     = document.getElementById('ring-fill');
const elBtnPlay  = document.getElementById('btn-play');
const elPomCount = document.getElementById('pomodoro-count');
const elRonda    = document.getElementById('ronda-count');
const elCatDisp  = document.getElementById('categoria-display');
const elNota     = document.getElementById('nota-input');

// ── INICIO ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  generarTicksRing();
  actualizarDisplay();
  cargarPomodorosHoy();
  cargarCategorias();
  pedirPermisoNotificaciones();

  // Cerrar paneles al hacer clic fuera
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#sound-panel') && !e.target.closest('#btn-sonido')) {
      document.getElementById('sound-panel').classList.add('hidden');
    }
    if (!e.target.closest('.user-menu') && !e.target.closest('#user-dropdown')) {
      document.getElementById('user-dropdown').classList.add('hidden');
    }
  });
});

// ── NAVEGACIÓN ─────────────────────────────────────────────
function mostrarVista(v) {
  document.querySelectorAll('.vista').forEach(el => el.classList.add('hidden'));
  document.getElementById(`vista-${v}`).classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach((b, i) => {
    b.classList.toggle('active',
      (i === 0 && v === 'timer') ||
      (i === 1 && v === 'stats') ||
      (i === 2 && v === 'ranking')
    );
  });
  if (v === 'stats')   cargarStats();
  if (v === 'ranking') cargarRanking();
}

// ── MENÚS ──────────────────────────────────────────────────
function toggleSoundPanel() {
  document.getElementById('user-dropdown').classList.add('hidden');
  document.getElementById('sound-panel').classList.toggle('hidden');
}

function toggleUserMenu() {
  document.getElementById('sound-panel').classList.add('hidden');
  document.getElementById('user-dropdown').classList.toggle('hidden');
}

// ── CATEGORÍA ──────────────────────────────────────────────
function seleccionarCat(btn) {
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  categoria = btn.dataset.cat;
  actualizarCatDisplay();
}

function actualizarCatDisplay() {
  const btn = document.querySelector('.cat-btn.active');
  elCatDisp.textContent = btn ? btn.textContent : categoria;
}

// ── MODO ───────────────────────────────────────────────────
function cambiarModo(nuevoModo) {
  pararTimer();
  modo = nuevoModo;
  const cfg = MODOS[modo];
  segundosRestantes = cfg.duracion * 60;
  segundosTotales   = cfg.duracion * 60;

  document.querySelectorAll('.mode-pill').forEach(p => p.classList.remove('active', 'break-s', 'break-l'));
  const pill = document.getElementById(`pill-${modo}`);
  if (pill) {
    pill.classList.add('active');
    if (cfg.clase) pill.classList.add(cfg.clase);
  }

  elRing.className     = `ring-fill ${cfg.clase}`;
  elBtnPlay.className  = `btn-control btn-primary ${cfg.clase}`;
  elLabel.textContent  = cfg.label;
  actualizarDisplay();
}

// ── TIMER ──────────────────────────────────────────────────
function toggleTimer() {
  corriendo ? pararTimer() : iniciarTimer();
}

function iniciarTimer() {
  corriendo = true;
  document.getElementById('play-icon').style.display  = 'none';
  document.getElementById('pause-icon').style.display = '';
  document.getElementById('ring-container').classList.add('running');
  intervalo = setInterval(tick, 1000);
}

function pararTimer() {
  corriendo = false;
  document.getElementById('play-icon').style.display  = '';
  document.getElementById('pause-icon').style.display = 'none';
  document.getElementById('ring-container').classList.remove('running');
  clearInterval(intervalo);
}

function resetTimer() {
  pararTimer();
  segundosRestantes = MODOS[modo].duracion * 60;
  segundosTotales   = MODOS[modo].duracion * 60;
  actualizarDisplay();
}

function tick() {
  if (segundosRestantes <= 0) {
    finSesion();
    return;
  }
  segundosRestantes--;
  actualizarDisplay();
}

function actualizarDisplay() {
  const m = Math.floor(segundosRestantes / 60);
  const s = segundosRestantes % 60;
  const timeStr = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  elTiempo.textContent = timeStr;

  const pct    = segundosRestantes / segundosTotales;
  const offset = CIRC * pct;
  elRing.style.strokeDasharray  = CIRC;
  elRing.style.strokeDashoffset = offset;

  // Dot indicador en la punta del arco
  actualizarDot(pct);

  // Título de pestaña
  if (corriendo) {
    document.title = `${timeStr} — Focumo`;
  } else {
    document.title = 'Focumo — Hackea tu enfoque';
  }
}

function actualizarDot(pct) {
  const dot = document.getElementById('ring-dot');
  if (!dot) return;
  const r     = 128;
  const cx    = 150;
  const cy    = 150;
  // El arco empieza a las 12 (-90°), avanza en el sentido horario
  const angle = (1 - pct) * 2 * Math.PI - Math.PI / 2;
  dot.setAttribute('cx', cx + r * Math.cos(angle));
  dot.setAttribute('cy', cy + r * Math.sin(angle));
}

function generarTicksRing() {
  const g = document.getElementById('ring-ticks');
  if (!g) return;
  const r = 138, cx = 150, cy = 150;
  for (let i = 0; i < 60; i++) {
    const angle = (i / 60) * 2 * Math.PI - Math.PI / 2;
    const isMain = i % 5 === 0;
    const r1 = isMain ? r - 6 : r - 3;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    const x2 = cx + r1 * Math.cos(angle);
    const y2 = cy + r1 * Math.sin(angle);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1); line.setAttribute('y1', y1);
    line.setAttribute('x2', x2); line.setAttribute('y2', y2);
    line.setAttribute('stroke', 'rgba(160,110,55,0.6)');
    line.setAttribute('stroke-width', isMain ? 2 : 1);
    g.appendChild(line);
  }
}

function logoClick(e) {
  // Permitir navegación normal a /
}

function saltarSesion() {
  pararTimer();
  finSesion(true);
}

async function finSesion(saltada = false) {
  pararTimer();
  const cfg = MODOS[modo];

  if (modo === 'trabajo' && !saltada) {
    pomodorosHoy++;
    elPomCount.textContent = pomodorosHoy;

    reproducirSonido();
    mostrarSiri('', 'Sesión completada', `${cfg.duracion} min de foco en "${categoria}"`);

    await guardarSesion({ tipo: 'trabajo', categoria, duracion: cfg.duracion, nota: elNota.value.trim() });
    await enviarNotificacion('Sesión completada', `${cfg.duracion} minutos de ${categoria}.`);

    const siguienteModo = rondaActual < 4 ? 'descanso-corto' : 'descanso-largo';
    rondaActual = rondaActual < 4 ? rondaActual + 1 : 1;
    elRonda.textContent = rondaActual;
    setTimeout(() => cambiarModo(siguienteModo), 3200);

  } else if (modo !== 'trabajo' && !saltada) {
    reproducirSonido();
    mostrarSiri('', 'Descanso completado', 'Vuelve al trabajo cuando estés listo.');
    await guardarSesion({ tipo: modo, categoria: modo, duracion: cfg.duracion, nota: '' });
    await enviarNotificacion('Descanso completado', 'Vuelve al trabajo.');
    setTimeout(() => cambiarModo('trabajo'), 3200);

  } else {
    setTimeout(() => cambiarModo('trabajo'), 300);
  }
}

// ── ANIMACIÓN SIRI ─────────────────────────────────────────
function mostrarSiri(_emoji, titulo, msg) {
  // emoji param deprecated — siri-emoji now uses SVG in HTML
  document.getElementById('siri-title').textContent = titulo;
  document.getElementById('siri-msg').textContent   = msg;
  const overlay = document.getElementById('siri-overlay');
  overlay.classList.remove('hidden');
  // Auto-cierre a los 4 segundos
  clearTimeout(overlay._timer);
  overlay._timer = setTimeout(cerrarSiri, 4000);
}

function cerrarSiri() {
  document.getElementById('siri-overlay').classList.add('hidden');
}

// ── MOTOR DE SONIDOS (Web Audio API) ──────────────────────
function getAudioCtx() {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function seleccionarSonido(btn) {
  document.querySelectorAll('.sound-opt').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  sonidoActual = btn.dataset.sound;
}

function cambiarVolumen(v) {
  volumen = parseFloat(v);
}

function probarSonido() {
  reproducirSonido();
}

function reproducirSonido() {
  const sonidos = {
    campana:  playCampana,
    bocina:   playBocina,
    boing:    playBoing,
    fanfaria: playFanfaria,
    chime:    playChime,
  };
  const fn = sonidos[sonidoActual];
  if (fn) fn();
}

// ────────────────────────────────
// 🔔 CAMPANA — sine con decay suave
// ────────────────────────────────
function playCampana() {
  const ctx = getAudioCtx();
  const t   = ctx.currentTime;

  [[880, 0, 0.6], [1320, 0.02, 0.3], [2200, 0.04, 0.15]].forEach(([freq, delay, gain]) => {
    const osc  = ctx.createOscillator();
    const gNode = ctx.createGain();
    osc.connect(gNode);
    gNode.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = freq;
    gNode.gain.setValueAtTime(gain * volumen, t + delay);
    gNode.gain.exponentialRampToValueAtTime(0.001, t + delay + 2.5);
    osc.start(t + delay);
    osc.stop(t + delay + 2.5);
  });
}

// ────────────────────────────────
// 📯 BOCINA — 3 notas ascendentes sawtooth
// ────────────────────────────────
function playBocina() {
  const ctx = getAudioCtx();
  const t   = ctx.currentTime;
  const notas = [261.6, 329.6, 392.0]; // C4 - E4 - G4

  notas.forEach((freq, i) => {
    const osc   = ctx.createOscillator();
    const gNode = ctx.createGain();
    const filt  = ctx.createBiquadFilter();
    osc.connect(filt);
    filt.connect(gNode);
    gNode.connect(ctx.destination);

    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    filt.type      = 'lowpass';
    filt.frequency.value = 1200;

    const start = t + i * 0.22;
    gNode.gain.setValueAtTime(0, start);
    gNode.gain.linearRampToValueAtTime(0.35 * volumen, start + 0.04);
    gNode.gain.exponentialRampToValueAtTime(0.001, start + 0.55);
    osc.start(start);
    osc.stop(start + 0.6);
  });
}

// ────────────────────────────────
// 🐰 BOING — Bugs Bunny, sweep descendente
// ────────────────────────────────
function playBoing() {
  const ctx = getAudioCtx();
  const t   = ctx.currentTime;

  const osc   = ctx.createOscillator();
  const gNode = ctx.createGain();
  osc.connect(gNode);
  gNode.connect(ctx.destination);

  osc.type = 'sine';
  osc.frequency.setValueAtTime(900, t);
  osc.frequency.exponentialRampToValueAtTime(55, t + 0.75);

  // Vibrato
  const vibLFO  = ctx.createOscillator();
  const vibGain = ctx.createGain();
  vibLFO.frequency.value = 18;
  vibGain.gain.value     = 30;
  vibLFO.connect(vibGain);
  vibGain.connect(osc.frequency);
  vibLFO.start(t);
  vibLFO.stop(t + 0.75);

  gNode.gain.setValueAtTime(0.6 * volumen, t);
  gNode.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
  osc.start(t);
  osc.stop(t + 0.85);
}

// ────────────────────────────────
// 🎺 FANFARRIA — C mayor ascendente
// ────────────────────────────────
function playFanfaria() {
  const ctx = getAudioCtx();
  const t   = ctx.currentTime;
  const notas = [261.6, 329.6, 392.0, 523.3]; // C4-E4-G4-C5

  notas.forEach((freq, i) => {
    const osc   = ctx.createOscillator();
    const gNode = ctx.createGain();
    osc.connect(gNode);
    gNode.connect(ctx.destination);
    osc.type = 'square';

    // Filtro para suavizar el square
    const filt = ctx.createBiquadFilter();
    osc.disconnect();
    osc.connect(filt);
    filt.connect(gNode);
    filt.type = 'lowpass';
    filt.frequency.value = 800;

    osc.frequency.value = freq;
    const s = t + i * 0.18;
    gNode.gain.setValueAtTime(0, s);
    gNode.gain.linearRampToValueAtTime(0.28 * volumen, s + 0.03);
    gNode.gain.setValueAtTime(0.28 * volumen, s + 0.15);
    gNode.gain.exponentialRampToValueAtTime(0.001, s + 0.38);
    osc.start(s);
    osc.stop(s + 0.4);
  });

  // Nota final más larga
  const finOsc  = ctx.createOscillator();
  const finGain = ctx.createGain();
  const finFilt = ctx.createBiquadFilter();
  finOsc.connect(finFilt);
  finFilt.connect(finGain);
  finGain.connect(ctx.destination);
  finOsc.type = 'square';
  finFilt.type = 'lowpass';
  finFilt.frequency.value = 800;
  finOsc.frequency.value  = 523.3;
  const fs = t + 4 * 0.18;
  finGain.gain.setValueAtTime(0, fs);
  finGain.gain.linearRampToValueAtTime(0.35 * volumen, fs + 0.03);
  finGain.gain.setValueAtTime(0.35 * volumen, fs + 0.4);
  finGain.gain.exponentialRampToValueAtTime(0.001, fs + 1.2);
  finOsc.start(fs);
  finOsc.stop(fs + 1.3);
}

// ────────────────────────────────
// ✨ CHIME — cristal, alta frecuencia
// ────────────────────────────────
function playChime() {
  const ctx = getAudioCtx();
  const t   = ctx.currentTime;

  [[1046.5, 0, 0.5], [1318.5, 0.15, 0.4], [1568.0, 0.3, 0.3]].forEach(([freq, delay, gain]) => {
    const osc   = ctx.createOscillator();
    const gNode = ctx.createGain();
    osc.connect(gNode);
    gNode.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = freq;
    gNode.gain.setValueAtTime(gain * volumen, t + delay);
    gNode.gain.exponentialRampToValueAtTime(0.001, t + delay + 2.0);
    osc.start(t + delay);
    osc.stop(t + delay + 2.1);
  });
}

// ── API ───────────────────────────────────────────────────
async function guardarSesion(data) {
  try {
    await fetch('/api/sessions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    });
  } catch (e) { console.error('Error guardando sesión:', e); }
}

async function enviarNotificacion(titulo, mensaje) {
  dispararNotificacionBrowser(titulo, mensaje);
  try {
    await fetch('/api/notify', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ titulo, mensaje }),
    });
  } catch (e) { /* silencioso */ }
}

async function cargarPomodorosHoy() {
  try {
    const stats = await fetch('/api/stats').then(r => r.json());
    pomodorosHoy = stats.hoy || 0;
    elPomCount.textContent = pomodorosHoy;
    document.getElementById('racha-count').textContent = stats.racha || 0;
  } catch (e) { /* silencioso */ }
}

// ── ESTADÍSTICAS ──────────────────────────────────────────
async function cargarStats() {
  try {
    const [stats, sesiones] = await Promise.all([
      fetch('/api/stats').then(r => r.json()),
      fetch('/api/sessions').then(r => r.json()),
    ]);
    document.getElementById('stat-total').textContent = stats.total_pomodoros || 0;
    document.getElementById('stat-horas').textContent = `${Math.floor((stats.total_minutos || 0) / 60)}h`;
    document.getElementById('stat-racha').textContent = stats.racha || 0;
    document.getElementById('stat-hoy').textContent   = stats.hoy   || 0;
    renderChartDias(stats.por_dia || {});
    renderChartCats(stats.por_categoria || {});
    renderHistorial(sesiones);
    cargarHeatmap();
  } catch (e) { console.error('Error cargando stats:', e); }
}

// Colores cálidos para gráficas
const CHART_COLORS = ['#B8733A','#F2C050','#7A9E7E','#D4924F','#9A7A52','#7A90A4','#C09060'];

function renderChartDias(porDia) {
  const labels = Object.keys(porDia).map(d => {
    const [, m, dd] = d.split('-');
    return `${dd}/${m}`;
  });
  const data = Object.values(porDia);
  if (chartDias) chartDias.destroy();
  const ctx = document.getElementById('chart-dias').getContext('2d');
  chartDias = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Pomodoros',
        data,
        backgroundColor: 'rgba(184,115,58,0.55)',
        borderColor:     '#B8733A',
        borderWidth:     2,
        borderRadius:    8,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(160,110,55,0.08)' }, ticks: { color: '#9A7A52' } },
        y: { grid: { color: 'rgba(160,110,55,0.08)' }, ticks: { color: '#9A7A52', stepSize: 1 }, beginAtZero: true },
      },
    },
  });
}

function renderChartCats(porCat) {
  const labels = Object.keys(porCat);
  const data   = Object.values(porCat).map(m => Math.round(m));
  if (!labels.length) return;
  if (chartCats) chartCats.destroy();
  const ctx = document.getElementById('chart-cats').getContext('2d');
  chartCats = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: CHART_COLORS.slice(0, labels.length),
        borderWidth: 0,
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#9A7A52', padding: 12, boxWidth: 12 },
        },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} min` },
        },
      },
    },
  });
}

function renderHistorial(sesiones) {
  const lista    = document.getElementById('historial-lista');
  const trabajos = sesiones.filter(s => s.tipo === 'trabajo');

  if (!trabajos.length) {
    lista.innerHTML = '<p class="empty-msg">¡Completa tu primer Pomodoro para ver el historial!</p>';
    return;
  }

  lista.innerHTML = trabajos.slice(0, 20).map(s => {
    const fecha = new Date(s.fecha);
    const hora  = fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const dia   = fecha.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    return `
      <div class="historial-item">
        <div>
          <div class="historial-cat">🍅 ${s.categoria}</div>
          ${s.nota ? `<div class="historial-nota">${s.nota}</div>` : ''}
        </div>
        <div class="historial-dur">${s.duracion} min · ${dia} ${hora}</div>
      </div>`;
  }).join('');
}

// ── HEATMAP ───────────────────────────────────────────────
async function cargarHeatmap() {
  try {
    const data = await fetch('/api/heatmap').then(r => r.json());
    renderHeatmap(data);
  } catch (e) { console.error('Error heatmap:', e); }
}

function renderHeatmap(data) {
  const grid  = document.getElementById('heatmap-grid');
  const total = document.getElementById('heatmap-total');
  if (!grid) return;

  const hoy    = new Date();
  const dias   = 365;
  // Empezamos desde hace 364 días
  const inicio = new Date(hoy);
  inicio.setDate(inicio.getDate() - (dias - 1));
  // Retroceder hasta el lunes anterior o el mismo lunes
  const diaSemana = inicio.getDay(); // 0=Dom
  const ajuste    = (diaSemana === 0) ? 6 : diaSemana - 1; // ajuste para semana lun-dom
  inicio.setDate(inicio.getDate() - ajuste);

  const celdas = [];
  const cur = new Date(inicio);
  while (cur <= hoy) {
    const iso = cur.toISOString().slice(0, 10);
    const n   = data[iso] || 0;
    let nivel = 0;
    if (n >= 8) nivel = 4;
    else if (n >= 5) nivel = 3;
    else if (n >= 3) nivel = 2;
    else if (n >= 1) nivel = 1;
    celdas.push(`<div class="heatmap-cell hm-${nivel}" title="${iso}: ${n} pomodoros"></div>`);
    cur.setDate(cur.getDate() + 1);
  }

  grid.innerHTML = celdas.join('');

  const totalPom = Object.values(data).reduce((a, b) => a + b, 0);
  if (total) total.textContent = totalPom ? `— ${totalPom} pomodoros este año` : '';
}

// ── CATEGORÍAS PERSONALIZADAS ─────────────────────────────
async function cargarCategorias() {
  try {
    const cats = await fetch('/api/categories').then(r => r.json());
    renderCatsGrid(cats);
  } catch (e) { console.error('Error categorías:', e); }
}

function renderCatsGrid(cats) {
  const grid = document.getElementById('custom-cats-grid');
  if (!grid) return;
  grid.innerHTML = cats.map(c => `
    <button class="cat-btn custom-cat" data-cat="${c.nombre}" data-id="${c.id}"
            style="border-color:${c.color};color:${c.color}"
            onclick="seleccionarCat(this)">
      ${c.emoji} ${c.nombre}
      <span class="cat-delete" onclick="borrarCategoria(event,${c.id})">✕</span>
    </button>`).join('');
}

async function borrarCategoria(event, id) {
  event.stopPropagation();
  try {
    await fetch(`/api/categories/${id}`, { method: 'DELETE' });
    cargarCategorias();
  } catch (e) { console.error('Error borrando cat:', e); }
}

// ── MODAL CATEGORÍA ───────────────────────────────────────
function abrirCatModal() {
  document.getElementById('modal-cat').classList.remove('hidden');
}

function cerrarCatModal(event) {
  if (!event || event.target.id === 'modal-cat' || event.type !== 'click' || !event.target.closest) {
    document.getElementById('modal-cat').classList.add('hidden');
    return;
  }
  if (!event.target.closest('.modal-card')) {
    document.getElementById('modal-cat').classList.add('hidden');
  }
}

function setColor(hex) {
  document.getElementById('cat-color').value = hex;
}

async function guardarCategoria() {
  const nombre = document.getElementById('cat-nombre').value.trim();
  const color  = document.getElementById('cat-color').value;
  const emoji  = document.getElementById('cat-emoji').value.trim() || '📌';
  if (!nombre) { alert('Introduce un nombre para la categoría.'); return; }
  try {
    const res = await fetch('/api/categories', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ nombre, color, emoji }),
    });
    if (res.ok) {
      document.getElementById('cat-nombre').value = '';
      document.getElementById('cat-emoji').value  = '📌';
      document.getElementById('cat-color').value  = '#B8733A';
      document.getElementById('modal-cat').classList.add('hidden');
      cargarCategorias();
    }
  } catch (e) { console.error('Error creando cat:', e); }
}

// ── RANKING ───────────────────────────────────────────────
async function cargarRanking() {
  try {
    const ranking = await fetch('/api/leaderboard').then(r => r.json());
    renderRanking(ranking);

    const hoy = new Date();
    const mes = hoy.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
    const el  = document.getElementById('ranking-mes');
    if (el) el.textContent = `${mes.charAt(0).toUpperCase() + mes.slice(1)}`;
  } catch (e) {
    document.getElementById('ranking-lista').innerHTML =
      '<p class="empty-msg">Error cargando ranking.</p>';
  }
}

function renderRanking(ranking) {
  const lista = document.getElementById('ranking-lista');
  if (!lista) return;

  if (!ranking.length) {
    lista.innerHTML = '<p class="empty-msg">¡Sé el primero en completar un Pomodoro este mes!</p>';
    return;
  }

  const medalEmoji = { gold: '🥇', silver: '🥈', bronze: '🥉' };
  const rankIcon   = ['🥇', '🥈', '🥉'];

  lista.innerHTML = ranking.map(u => {
    const horas  = Math.floor((u.minutos || 0) / 60);
    const mins   = (u.minutos || 0) % 60;
    const tiempo = horas ? `${horas}h ${mins}m` : `${mins}m`;
    const medBadges = (u.medals || []).slice(0, 3).map(t =>
      `<span class="medal-badge medal-${t}">${medalEmoji[t]}</span>`
    ).join('');
    const avatar = u.avatar_url
      ? `<img src="${u.avatar_url}" class="rank-avatar" alt="${u.name}">`
      : `<div class="rank-avatar-text">${(u.name || 'U')[0].toUpperCase()}</div>`;
    const rankDisp = u.rank <= 3 ? rankIcon[u.rank - 1] : `#${u.rank}`;
    const yoClass  = u.es_yo ? ' rank-me' : '';
    return `
      <div class="ranking-item rank-${u.rank}${yoClass}">
        <div class="rank-pos">${rankDisp}</div>
        ${avatar}
        <div class="rank-info">
          <div class="rank-name">${u.name} ${medBadges}${u.es_yo ? ' <span class="rank-yo">(tú)</span>' : ''}</div>
          <div class="rank-time">${tiempo} de enfoque</div>
        </div>
        <div class="rank-score">${u.pomodoros} 🍅</div>
      </div>`;
  }).join('');
}

// ── NOTIFICACIONES NAVEGADOR ──────────────────────────────
function pedirPermisoNotificaciones() {
  if ('Notification' in window && Notification.permission === 'default') {
    // Pedir permiso en el primer clic del usuario (no en carga)
    document.addEventListener('click', function askOnce() {
      Notification.requestPermission();
      document.removeEventListener('click', askOnce);
    }, { once: true });
  }
}

function dispararNotificacionBrowser(titulo, mensaje) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(titulo, {
        body: mensaje,
        icon: '/static/favicon.svg',
        badge: '/static/favicon.svg',
      });
    } catch (e) { /* silencioso */ }
  }
}

// ── COMPARTIR STATS ───────────────────────────────────────
async function compartirStats() {
  try {
    const stats = await fetch('/api/stats').then(r => r.json());
    const total = stats.total_pomodoros || 0;
    const horas = Math.floor((stats.total_minutos || 0) / 60);
    const racha = stats.racha || 0;
    const hoy   = stats.hoy   || 0;

    const texto = `🎯 Mi productividad en Focumo:\n\n` +
      `✅ ${total} Pomodoros completados\n` +
      `⏱️ ${horas} horas de enfoque total\n` +
      `🔥 ${racha} días de racha\n` +
      `📅 ${hoy} Pomodoros hoy\n\n` +
      `¡Únete gratis en focumo.app 🍅\n#Focumo #ProductividadReal #PomodoroTechnique`;

    if (navigator.share) {
      await navigator.share({ title: 'Mis stats de Focumo', text: texto });
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(texto);
      mostrarToast('📋 Stats copiadas al portapapeles');
    } else {
      prompt('Copia tu resumen:', texto);
    }
  } catch (e) {
    if (e.name !== 'AbortError') console.error('Error compartiendo:', e);
  }
}

// ── MODAL BUG REPORT ──────────────────────────────────────
function abrirBugModal() {
  document.getElementById('user-dropdown').classList.add('hidden');
  document.getElementById('modal-bug').classList.remove('hidden');
}

function cerrarBugModal(event) {
  if (!event || !event.target) {
    document.getElementById('modal-bug').classList.add('hidden');
    return;
  }
  if (event.target.id === 'modal-bug' || !event.target.closest('.modal-card')) {
    document.getElementById('modal-bug').classList.add('hidden');
  }
}

async function enviarBugReport() {
  const desc = document.getElementById('bug-desc').value.trim();
  if (!desc) { alert('Describe el problema antes de enviar.'); return; }
  try {
    const res = await fetch('/api/bug-report', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ descripcion: desc }),
    });
    if (res.ok) {
      document.getElementById('bug-desc').value = '';
      document.getElementById('modal-bug').classList.add('hidden');
      mostrarToast('✅ Reporte enviado. ¡Gracias!');
    }
  } catch (e) { console.error('Error bug report:', e); }
}

// ── TOAST ─────────────────────────────────────────────────
function mostrarToast(msg) {
  let toast = document.getElementById('toast-msg');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast-msg';
    toast.style.cssText = `
      position:fixed; bottom:32px; left:50%; transform:translateX(-50%);
      background:#3A2415; color:#F2C050; padding:12px 24px; border-radius:24px;
      font-size:14px; font-weight:600; z-index:9999; opacity:0;
      transition:opacity .3s; pointer-events:none; white-space:nowrap;
      box-shadow:0 4px 20px rgba(0,0,0,.35);
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toast.style.opacity = '0'; }, 2800);
}

// ── AI CHAT WIDGET ────────────────────────────────────────
let chatAbierto = false;

function toggleChat() {
  chatAbierto = !chatAbierto;
  const panel = document.getElementById('chat-panel');
  const icon  = document.getElementById('chat-icon');
  const badge = document.getElementById('chat-badge');
  panel.classList.toggle('hidden', !chatAbierto);
  icon.textContent = chatAbierto ? '✕' : '🤖';
  badge.classList.add('hidden');
  if (chatAbierto) {
    setTimeout(() => document.getElementById('chat-input')?.focus(), 80);
  }
}

async function enviarChat() {
  const input = document.getElementById('chat-input');
  const msg   = input.value.trim();
  if (!msg) return;
  input.value = '';

  agregarMensajeChat('user', msg);
  const typing = agregarTyping();

  try {
    const res  = await fetch('/api/chat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ message: msg }),
    });
    const data = await res.json();
    typing.remove();
    agregarMensajeChat('bot', data.response || 'Lo siento, intenta de nuevo.');
  } catch (e) {
    typing.remove();
    agregarMensajeChat('bot', 'Error de conexión. Por favor, intenta más tarde.');
  }
}

function agregarMensajeChat(role, texto) {
  const container = document.getElementById('chat-messages');
  const div       = document.createElement('div');
  div.className   = `chat-msg chat-msg-${role === 'user' ? 'user' : 'bot'}`;
  const span      = document.createElement('span');
  span.textContent = texto;
  div.appendChild(span);
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

function agregarTyping() {
  const container = document.getElementById('chat-messages');
  const div       = document.createElement('div');
  div.className   = 'chat-msg chat-msg-bot chat-typing';
  div.innerHTML   = '<span><span></span><span></span><span></span></span>';
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}
