/* ════════════════════════════════════════════
   FOCUMO v1.0 — Lógica Frontend
   Timer · Sonidos Web Audio API · Siri · Chat IA
   © 2026 Santiago Jiménez Téllez
   ════════════════════════════════════════════ */

// ── i18n ───────────────────────────────────────────────────
const _LANG = navigator.language?.startsWith('es') ? 'es' : 'en';
const _LOCALE_DATE = _LANG === 'es' ? 'es-ES' : 'en-US';

const _TR = {
  es: {
    modoTrabajo:     'Enfócate',
    modoDescansoC:   'Descansa',
    modoDescansoL:   'Recarga',
    sesionCompletada:'Sesión completada',
    minFocusIn:      (min, cat) => `${min} min de foco en "${cat}"`,
    notifSesion:     (min, cat) => `${min} minutos de ${cat}.`,
    descansoCompletado: 'Descanso completado',
    vuelveTrabajo:   'Vuelve al trabajo cuando estés listo.',
    notifDescanso:   'Vuelve al trabajo.',
    tiempoEnfoque:   'de enfoque',
    tuIndicador:     '(tú)',
    rankingVacio:    '¡Sé el primero en completar un Pomodoro este mes!',
    rankingError:    'Error cargando ranking.',
    historialVacio:  '¡Completa tu primer Pomodoro para ver el historial!',
    heatmapTitle:    (iso, n) => `${iso}: ${n} pomodoros`,
    heatmapTotal:    (n) => `— ${n} pomodoros este año`,
    statsCopiadas:   'Stats copiadas al portapapeles',
    shareTitle:      'Mis stats de Focumo',
    shareText:       (total, horas, racha, hoy) =>
      `Mi productividad en Focumo:\n\n` +
      `${total} Pomodoros completados\n` +
      `${horas} horas de enfoque total\n` +
      `${racha} dias de racha\n` +
      `${hoy} Pomodoros hoy\n\n` +
      `Unete gratis en focumo.app\n#Focumo #ProductividadReal #PomodoroTechnique`,
    mundialVacio:    'Aun no hay suficientes datos internacionales.',
    mundialError:    'Error cargando ranking mundial.',
    mundialHoras:    (h) => `${h}h de enfoque`,
  },
  en: {
    modoTrabajo:     'Focus',
    modoDescansoC:   'Short Break',
    modoDescansoL:   'Long Break',
    sesionCompletada:'Session complete',
    minFocusIn:      (min, cat) => `${min} min of focus on "${cat}"`,
    notifSesion:     (min, cat) => `${min} minutes of ${cat}.`,
    descansoCompletado: 'Break complete',
    vuelveTrabajo:   'Back to work when you\'re ready.',
    notifDescanso:   'Back to work.',
    tiempoEnfoque:   'of focus',
    tuIndicador:     '(you)',
    rankingVacio:    'Be the first to complete a Pomodoro this month!',
    rankingError:    'Error loading ranking.',
    historialVacio:  'Complete your first Pomodoro to see history!',
    heatmapTitle:    (iso, n) => `${iso}: ${n} pomodoros`,
    heatmapTotal:    (n) => `— ${n} pomodoros this year`,
    statsCopiadas:   'Stats copied to clipboard',
    shareTitle:      'My Focumo stats',
    shareText:       (total, horas, racha, hoy) =>
      `My productivity on Focumo:\n\n` +
      `${total} Pomodoros completed\n` +
      `${horas} hours of total focus\n` +
      `${racha} day streak\n` +
      `${hoy} Pomodoros today\n\n` +
      `Join free at focumo.app\n#Focumo #RealProductivity #PomodoroTechnique`,
    mundialVacio:    'Not enough international data yet.',
    mundialError:    'Error loading world ranking.',
    mundialHoras:    (h) => `${h}h of focus`,
  },
};

function t(key, ...args) {
  const val = _TR[_LANG]?.[key] ?? _TR['es'][key];
  return typeof val === 'function' ? val(...args) : val;
}

// Aplica traducciones a atributos data-i18n del DOM
function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const translation = t(key);
    if (translation && typeof translation === 'string') el.textContent = translation;
  });
}

// ── ESTADO ─────────────────────────────────────────────────
const MODOS = {
  'trabajo':        { duracion: 25, label: t('modoTrabajo'),   clase: '',        emoji: '' },
  'descanso-corto': { duracion: 5,  label: t('modoDescansoC'), clase: 'break-s', emoji: '' },
  'descanso-largo': { duracion: 15, label: t('modoDescansoL'), clase: 'break-l', emoji: '' },
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
  applyI18n();
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
  const target = document.getElementById(`vista-${v}`);
  if (target) target.classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach((b, i) => {
    b.classList.toggle('active',
      (i === 0 && v === 'timer')   ||
      (i === 1 && v === 'stats')   ||
      (i === 2 && v === 'ranking') ||
      (i === 3 && v === 'mundial')
    );
  });
  if (v === 'stats')   cargarStats();
  if (v === 'ranking') cargarRanking();
  if (v === 'mundial') cargarMundial();
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

// ── TIMER — rAF smooth ring + setInterval logic ─────────────
let rafId          = null;
let rafStartTime   = null;
let rafStartSecs   = null;   // segundos al arrancar el rAF loop
let visualOffset   = CIRC;   // offset actual del ring (suavizado)

function toggleTimer() {
  corriendo ? pararTimer() : iniciarTimer();
}

function iniciarTimer() {
  corriendo      = true;
  rafStartTime   = performance.now();
  rafStartSecs   = segundosRestantes;
  document.getElementById('play-icon').style.display  = 'none';
  document.getElementById('pause-icon').style.display = '';
  document.getElementById('ring-container').classList.add('running');
  intervalo = setInterval(tick, 1000);
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(rafFrame);
  timerStartPulse();
}

function pararTimer() {
  corriendo = false;
  document.getElementById('play-icon').style.display  = '';
  document.getElementById('pause-icon').style.display = 'none';
  document.getElementById('ring-container').classList.remove('running');
  clearInterval(intervalo);
  cancelAnimationFrame(rafId);
  rafId = null;
}

function resetTimer() {
  pararTimer();
  segundosRestantes = MODOS[modo].duracion * 60;
  segundosTotales   = MODOS[modo].duracion * 60;
  visualOffset      = CIRC;
  actualizarDigits(segundosRestantes);
  elRing.style.strokeDasharray  = CIRC;
  elRing.style.strokeDashoffset = CIRC;
  actualizarDot(1);
  document.title = 'Focumo — Hackea tu enfoque';
}

function tick() {
  if (segundosRestantes <= 0) {
    finSesion();
    return;
  }
  segundosRestantes--;
  // Solo actualizamos los dígitos — el ring lo maneja rAF
  actualizarDigits(segundosRestantes);
  if (corriendo) document.title = `${elTiempo.textContent} — Focumo`;
}

/* requestAnimationFrame loop: actualiza el ring cada frame (~60fps)
   usando tiempo real para interpolación sub-segundo suave */
function rafFrame(now) {
  if (!corriendo) return;

  const elapsedSec  = (now - rafStartTime) / 1000;
  const visualSecs  = Math.max(0, rafStartSecs - elapsedSec);
  const targetPct   = visualSecs / segundosTotales;
  const targetOff   = CIRC * targetPct;

  // Lerp suavizado: 12% del camino restante por frame → curva fluida
  visualOffset += (targetOff - visualOffset) * 0.12;

  elRing.style.strokeDasharray  = CIRC;
  elRing.style.strokeDashoffset = visualOffset;
  actualizarDot(visualOffset / CIRC);

  rafId = requestAnimationFrame(rafFrame);
}

function actualizarDigits(segs) {
  const m = Math.floor(segs / 60);
  const s = segs % 60;
  elTiempo.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function actualizarDisplay() {
  actualizarDigits(segundosRestantes);
  const pct = segundosRestantes / segundosTotales;
  visualOffset = CIRC * pct;
  elRing.style.strokeDasharray  = CIRC;
  elRing.style.strokeDashoffset = visualOffset;
  actualizarDot(pct);
  document.title = corriendo
    ? `${elTiempo.textContent} — Focumo`
    : 'Focumo — Hackea tu enfoque';
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
    ringCompletionPulse();
    mostrarSiri('', t('sesionCompletada'), t('minFocusIn', cfg.duracion, categoria));

    await guardarSesion({ tipo: 'trabajo', categoria, duracion: cfg.duracion, nota: elNota.value.trim() });
    await enviarNotificacion(t('sesionCompletada'), t('notifSesion', cfg.duracion, categoria));

    const siguienteModo = rondaActual < 4 ? 'descanso-corto' : 'descanso-largo';
    rondaActual = rondaActual < 4 ? rondaActual + 1 : 1;
    elRonda.textContent = rondaActual;
    setTimeout(() => cambiarModo(siguienteModo), 3200);

  } else if (modo !== 'trabajo' && !saltada) {
    reproducirSonido();
    mostrarSiri('', t('descansoCompletado'), t('vuelveTrabajo'));
    await guardarSesion({ tipo: modo, categoria: modo, duracion: cfg.duracion, nota: '' });
    await enviarNotificacion(t('descansoCompletado'), t('notifDescanso'));
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
    lista.innerHTML = `<p class="empty-msg">${t('historialVacio')}</p>`;
    return;
  }

  lista.innerHTML = trabajos.slice(0, 20).map(s => {
    const fecha = new Date(s.fecha);
    const hora  = fecha.toLocaleTimeString(_LOCALE_DATE, { hour: '2-digit', minute: '2-digit' });
    const dia   = fecha.toLocaleDateString(_LOCALE_DATE, { day: '2-digit', month: 'short' });
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
    celdas.push(`<div class="heatmap-cell hm-${nivel}" title="${t('heatmapTitle', iso, n)}"></div>`);
    cur.setDate(cur.getDate() + 1);
  }

  grid.innerHTML = celdas.join('');

  const totalPom = Object.values(data).reduce((a, b) => a + b, 0);
  if (total) total.textContent = totalPom ? t('heatmapTotal', totalPom) : '';
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
    const mes = hoy.toLocaleString(_LOCALE_DATE, { month: 'long', year: 'numeric' });
    const el  = document.getElementById('ranking-mes');
    if (el) el.textContent = `${mes.charAt(0).toUpperCase() + mes.slice(1)}`;
  } catch (e) {
    document.getElementById('ranking-lista').innerHTML =
      `<p class="empty-msg">${t('rankingError')}</p>`;
  }
}

function renderRanking(ranking) {
  const lista = document.getElementById('ranking-lista');
  if (!lista) return;

  if (!ranking.length) {
    lista.innerHTML = `<p class="empty-msg">${t('rankingVacio')}</p>`;
    return;
  }

  const rankMedalSVG = {
    gold:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="#FCD34D" stroke="#D97706" stroke-width="1.2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>`,
    silver: `<svg width="18" height="18" viewBox="0 0 24 24" fill="#CBD5E1" stroke="#64748B" stroke-width="1.2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>`,
    bronze: `<svg width="18" height="18" viewBox="0 0 24 24" fill="#FCA880" stroke="#C2510A" stroke-width="1.2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>`,
  };
  const rankPodium = [rankMedalSVG.gold, rankMedalSVG.silver, rankMedalSVG.bronze];

  const countryFlag = (cc) => {
    if (!cc) return '';
    const flags = { es:'🇪🇸',us:'🇺🇸',mx:'🇲🇽',gb:'🇬🇧',de:'🇩🇪',fr:'🇫🇷',
                    br:'🇧🇷',ar:'🇦🇷',co:'🇨🇴',in:'🇮🇳',jp:'🇯🇵',kr:'🇰🇷',
                    ca:'🇨🇦',au:'🇦🇺',it:'🇮🇹',pt:'🇵🇹',nl:'🇳🇱',se:'🇸🇪',
                    pl:'🇵🇱',tr:'🇹🇷',ua:'🇺🇦',ng:'🇳🇬',za:'🇿🇦',cn:'🇨🇳' };
    return flags[cc.toLowerCase()] || '';
  };

  lista.innerHTML = ranking.map(u => {
    const horas    = Math.floor((u.minutos || 0) / 60);
    const mins     = (u.minutos || 0) % 60;
    const tiempo   = horas ? `${horas}h ${mins}m` : `${mins}m`;
    const medBadges = (u.medals || []).slice(0, 3).map(m =>
      `<span class="medal-badge medal-${m}">${rankMedalSVG[m] || ''}</span>`
    ).join('');
    const flag     = u.country_code ? `<span class="rank-flag">${countryFlag(u.country_code)}</span>` : '';
    const proBadge = u.is_pro ? `<span class="pro-crown" title="Focumo PRO"><svg width="12" height="12" viewBox="0 0 24 24" fill="#FBBF24" stroke="#F59E0B" stroke-width="1.5"><path d="M3 18h18l-2-8-4 4-3-8-3 8-4-4z"/></svg></span>` : '';
    const avatar   = u.avatar_url
      ? `<img src="${u.avatar_url}" class="rank-avatar" alt="${u.name}">`
      : `<div class="rank-avatar-text">${(u.name || 'U')[0].toUpperCase()}</div>`;
    const rankDisp = u.rank <= 3 ? rankPodium[u.rank - 1] : `<span class="rank-num">#${u.rank}</span>`;
    const yoClass  = u.es_yo ? ' rank-me' : '';
    return `
      <div class="ranking-item rank-${u.rank}${yoClass}">
        <div class="rank-pos">${rankDisp}</div>
        ${avatar}
        <div class="rank-info">
          <div class="rank-name">${flag}${u.name}${proBadge} ${medBadges}${u.es_yo ? ` <span class="rank-yo">${t('tuIndicador')}</span>` : ''}</div>
          <div class="rank-time">${tiempo} ${t('tiempoEnfoque')}</div>
        </div>
        <div class="rank-score">${u.pomodoros}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--primary)" stroke="none" style="vertical-align:middle;margin-left:2px"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/></svg>
        </div>
      </div>`;
  }).join('');
}

// ── RANKING MUNDIAL ───────────────────────────────────────
let _mundialLoaded = false;

async function cargarMundial() {
  if (_mundialLoaded) return;
  try {
    const data = await fetch('/api/world-ranking').then(r => r.json());
    renderMundial(data);
    _mundialLoaded = true;
  } catch (e) {
    const el = document.getElementById('mundial-lista');
    if (el) el.innerHTML = `<p class="empty-msg">${t('mundialError')}</p>`;
  }
}

function renderMundial(data) {
  const lista = document.getElementById('mundial-lista');
  if (!lista) return;

  if (!data.length) {
    lista.innerHTML = `<p class="empty-msg">${t('mundialVacio')}</p>`;
    return;
  }

  const maxPom = data[0].pomodoros || 1;

  lista.innerHTML = data.map((c, idx) => {
    const horas   = Math.floor((c.minutos || 0) / 60);
    const barPct  = Math.round((c.pomodoros / maxPom) * 100);
    const podColor = idx === 0 ? '#FCD34D' : idx === 1 ? '#CBD5E1' : idx === 2 ? '#FCA880' : 'var(--primary)';
    return `
      <div class="mundial-item" style="--delay:${idx * 60}ms">
        <div class="mundial-rank" style="color:${podColor}">${idx < 3 ? ['1st','2nd','3rd'][idx] : `#${idx+1}`}</div>
        <div class="mundial-flag">${c.flag}</div>
        <div class="mundial-info">
          <div class="mundial-name">${c.name}</div>
          <div class="mundial-bar-wrap">
            <div class="mundial-bar" style="width:${barPct}%;background:${podColor}"></div>
          </div>
          <div class="mundial-sub">${t('mundialHoras', horas)} · ${c.usuarios} usuarios</div>
        </div>
        <div class="mundial-score">${c.pomodoros.toLocaleString()}</div>
      </div>`;
  }).join('');

  // Animar barras con GSAP si disponible
  if (typeof gsap !== 'undefined') {
    gsap.fromTo('.mundial-bar',
      { scaleX: 0, transformOrigin: 'left center' },
      { scaleX: 1, duration: 0.8, ease: 'power3.out', stagger: 0.06 }
    );
    gsap.fromTo('.mundial-item',
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', stagger: 0.07 }
    );
  }
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

    const texto = t('shareText', total, horas, racha, hoy);

    if (navigator.share) {
      await navigator.share({ title: t('shareTitle'), text: texto });
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(texto);
      mostrarToast(t('statsCopiadas'));
    } else {
      prompt(t('shareTitle') + ':', texto);
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

// ══════════════════════════════════════════════════════════════
// GSAP ANIMATION ENGINE
// Inicializa después de que el DOM + GSAP estén listos
// ══════════════════════════════════════════════════════════════

function initGSAP() {
  if (typeof gsap === 'undefined') return;

  // ── 1. SPRING PHYSICS en todos los botones ────────────────
  const springTargets = [
    '.btn-control',
    '.btn-auth',
    '.btn-primary-auth',
    '.cat-btn',
    '.mode-pill',
    '.liga-filter-btn',
    '.nav-btn',
    '.btn-kofi',
    '.pro-lock-btn',
    '.chat-send',
  ].join(',');

  document.querySelectorAll(springTargets).forEach(btn => {
    btn.addEventListener('mouseenter', () =>
      gsap.to(btn, { scale: 1.06, duration: 0.35, ease: 'back.out(2.5)' })
    );
    btn.addEventListener('mouseleave', () =>
      gsap.to(btn, { scale: 1, duration: 0.35, ease: 'back.out(2)' })
    );
    btn.addEventListener('mousedown', () =>
      gsap.to(btn, { scale: 0.91, duration: 0.08, ease: 'power3.in' })
    );
    btn.addEventListener('mouseup', () =>
      gsap.to(btn, { scale: 1, duration: 0.45, ease: 'elastic.out(1.3, 0.45)' })
    );
  });

  // ── 2. PLAY BUTTON — elastic spring especial ─────────────
  const playBtn = document.getElementById('btn-play');
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      gsap.fromTo(playBtn,
        { scale: 0.82 },
        { scale: 1, duration: 0.6, ease: 'elastic.out(1.4, 0.5)' }
      );
    });
  }

  // ── 3. LOGO — bounce + rotate on hover ───────────────────
  const logoLink = document.getElementById('logo-link');
  if (logoLink) {
    const logoImg = logoLink.querySelector('img');
    if (logoImg) {
      logoImg.style.transformOrigin = 'center';
      // Micro-float continuo (subtle)
      gsap.to(logoImg, {
        y: -2,
        duration: 2.2,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });
      logoLink.addEventListener('mouseenter', () => {
        gsap.to(logoImg, { rotation: -10, scale: 1.22, duration: 0.4, ease: 'back.out(3)' });
      });
      logoLink.addEventListener('mouseleave', () => {
        gsap.to(logoImg, { rotation: 0, scale: 1, duration: 0.45, ease: 'elastic.out(1.2, 0.4)' });
      });
      logoLink.addEventListener('click', (e) => {
        gsap.to(logoImg, {
          rotation: 360, scale: 1.3, duration: 0.5, ease: 'back.out(2)',
          onComplete: () => gsap.set(logoImg, { rotation: 0, scale: 1 }),
        });
      });
    }
  }

  // ── 4. STAT CARDS — tilt 3D ───────────────────────────────
  initTilt('.stat-card');
  initTilt('.ranking-row');

  // ── 5. ENTRADA del timer al cargar ────────────────────────
  const timerCard = document.querySelector('.timer-card');
  if (timerCard) {
    gsap.from(timerCard, { y: 20, opacity: 0, duration: 0.6, ease: 'power3.out', delay: 0.1 });
  }
  gsap.from('.category-card', { y: 14, opacity: 0, duration: 0.5, ease: 'power2.out', delay: 0.05 });

  // ── 6. Ring container — pop al cargar ────────────────────
  const ringContainer = document.getElementById('ring-container');
  if (ringContainer) {
    gsap.from(ringContainer, { scale: 0.88, opacity: 0, duration: 0.7, ease: 'elastic.out(1, 0.6)', delay: 0.2 });
  }

  // ── 7. TIMER — Magnetic hover en el ring ─────────────────
  const ringWrap = document.getElementById('ring-container');
  if (ringWrap) {
    ringWrap.addEventListener('mousemove', (e) => {
      const rect = ringWrap.getBoundingClientRect();
      const cx   = rect.left + rect.width  / 2;
      const cy   = rect.top  + rect.height / 2;
      const dx   = (e.clientX - cx) / (rect.width  / 2);
      const dy   = (e.clientY - cy) / (rect.height / 2);
      gsap.to(ringWrap, {
        x: dx * 6, y: dy * 4,
        rotateX: -dy * 5, rotateY: dx * 5,
        transformPerspective: 800,
        duration: 0.4, ease: 'power2.out',
      });
    });
    ringWrap.addEventListener('mouseleave', () => {
      gsap.to(ringWrap, {
        x: 0, y: 0, rotateX: 0, rotateY: 0,
        duration: 0.7, ease: 'elastic.out(1, 0.5)',
      });
    });
  }

  // ── 8. MODE PILLS — spring + color flash ─────────────────
  document.querySelectorAll('.mode-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      gsap.fromTo(pill,
        { scale: 0.88 },
        { scale: 1, duration: 0.5, ease: 'elastic.out(1.4, 0.5)' }
      );
    });
  });

  // ── 9. Category buttons — subtle pop ─────────────────────
  document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      gsap.fromTo(btn,
        { scale: 0.9 },
        { scale: 1, duration: 0.45, ease: 'elastic.out(1.3, 0.5)' }
      );
    });
  });

  // ── 10. Tilt en ranking items (lazy, cuando aparecen) ─────
  initTilt('.ranking-item');
}

// ── TILT 3D helper ────────────────────────────────────────────
function initTilt(selector) {
  if (typeof gsap === 'undefined') return;
  document.querySelectorAll(selector).forEach(el => {
    el.style.transformStyle = 'preserve-3d';
    el.style.willChange = 'transform';

    el.addEventListener('mousemove', (e) => {
      const rect = el.getBoundingClientRect();
      const cx   = rect.left + rect.width  / 2;
      const cy   = rect.top  + rect.height / 2;
      const dx   = (e.clientX - cx) / (rect.width  / 2);
      const dy   = (e.clientY - cy) / (rect.height / 2);
      gsap.to(el, {
        rotateX:             -dy * 7,
        rotateY:              dx * 7,
        transformPerspective: 900,
        duration:             0.25,
        ease:                 'power2.out',
      });
    });

    el.addEventListener('mouseleave', () => {
      gsap.to(el, {
        rotateX: 0, rotateY: 0,
        duration: 0.55,
        ease: 'elastic.out(1, 0.5)',
      });
    });
  });
}

// ── SPA TRANSITIONS — fade suave entre vistas ─────────────────
const _mostrarVistaOriginal = mostrarVista;
mostrarVista = function(v) {
  if (typeof gsap === 'undefined') {
    _mostrarVistaOriginal(v);
    return;
  }

  const current = document.querySelector('.vista:not(.hidden)');
  const next    = document.getElementById(`vista-${v}`);
  if (!next || current === next) return;

  // Actualizar nav buttons
  document.querySelectorAll('.nav-btn').forEach((b, i) => {
    b.classList.toggle('active',
      (i === 0 && v === 'timer')   ||
      (i === 1 && v === 'stats')   ||
      (i === 2 && v === 'ranking') ||
      (i === 3 && v === 'mundial')
    );
  });

  gsap.to(current, {
    opacity: 0,
    y: -6,
    duration: 0.16,
    ease: 'power2.in',
    onComplete: () => {
      current.classList.add('hidden');
      gsap.set(current, { opacity: 1, y: 0 });
      next.classList.remove('hidden');
      gsap.fromTo(next,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.28, ease: 'power3.out' }
      );
    },
  });

  if (v === 'stats')   cargarStats();
  if (v === 'ranking') cargarRanking();
  if (v === 'mundial') cargarMundial();
};

// ── Ring pulse al completar una sesión ───────────────────────
function ringCompletionPulse() {
  if (typeof gsap === 'undefined') return;
  const ring     = document.getElementById('ring-container');
  const ringFill = document.getElementById('ring-fill');
  const dot      = document.getElementById('ring-dot');
  const label    = document.getElementById('timer-label');
  if (!ring) return;

  // Secuencia: expand → contraction → settle
  const tl = gsap.timeline();
  tl.to(ring,     { scale: 1.07, duration: 0.22, ease: 'power2.out' })
    .to(ring,     { scale: 0.96, duration: 0.14, ease: 'power3.in' })
    .to(ring,     { scale: 1,    duration: 0.6,  ease: 'elastic.out(1.2, 0.5)' });

  // Ring fill flash → green momentáneo
  if (ringFill) {
    gsap.fromTo(ringFill,
      { filter: 'drop-shadow(0 0 18px #7ecb7e) brightness(1.6)' },
      { filter: 'drop-shadow(0 0 0px transparent) brightness(1)', duration: 1.2, ease: 'power2.out', delay: 0.05 }
    );
  }
  // Dot burst
  if (dot) {
    gsap.fromTo(dot, { r: 9 }, { r: 16, duration: 0.18, ease: 'power3.out', yoyo: true, repeat: 1 });
  }
  // Label shake
  if (label) {
    gsap.fromTo(label,
      { y: 0 },
      { y: -6, duration: 0.12, ease: 'power2.out', yoyo: true, repeat: 3 }
    );
  }
}

// ── Timer start burst ─────────────────────────────────────────
function timerStartPulse() {
  if (typeof gsap === 'undefined') return;
  const playBtn  = document.getElementById('btn-play');
  const ringWrap = document.getElementById('ring-container');
  if (playBtn)  gsap.fromTo(playBtn,  { scale: 0.82 }, { scale: 1, duration: 0.55, ease: 'elastic.out(1.5, 0.45)' });
  if (ringWrap) gsap.fromTo(ringWrap, { scale: 0.97 }, { scale: 1, duration: 0.4,  ease: 'back.out(2.5)' });
}

// ── Arranque del motor GSAP ───────────────────────────────────
// GSAP carga con defer, esperamos a que esté disponible
(function waitForGSAP() {
  if (typeof gsap !== 'undefined') {
    initGSAP();
  } else {
    setTimeout(waitForGSAP, 50);
  }
})();
