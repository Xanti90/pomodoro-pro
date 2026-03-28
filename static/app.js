/* ══════════════════════════════════════
   POMODORO PRO — Lógica frontend
   ══════════════════════════════════════ */

// ── Estado ──
const MODOS = {
  'trabajo':         { duracion: 25, label: 'Trabaja', clase: '',        emoji: '🍅' },
  'descanso-corto':  { duracion: 5,  label: 'Descansa', clase: 'break-s', emoji: '☕' },
  'descanso-largo':  { duracion: 15, label: 'Recarga', clase: 'break-l',  emoji: '🌿' },
};

const CIRCUNFERENCIA = 754; // 2 * PI * 120

let modo           = 'trabajo';
let categoria      = 'Certificación IA';
let segundosRestantes = 25 * 60;
let segundosTotales   = 25 * 60;
let corriendo      = false;
let intervalo      = null;
let pomodorosHoy   = 0;
let rondaActual    = 1;
let chartDias      = null;
let chartCats      = null;

// ── Elementos DOM ──
const elTiempo    = document.getElementById('timer-time');
const elLabel     = document.getElementById('timer-label');
const elRing      = document.getElementById('ring-fill');
const elBtnPlay   = document.getElementById('btn-play');
const elPomCount  = document.getElementById('pomodoro-count');
const elRonda     = document.getElementById('ronda-count');
const elCatDisp   = document.getElementById('categoria-display');
const elNota      = document.getElementById('nota-input');

// ── Inicialización ──
document.addEventListener('DOMContentLoaded', () => {
  actualizarDisplay();
  cargarPomodorosHoy();
});

// ── Navegación ──
function mostrarVista(v) {
  document.querySelectorAll('.vista').forEach(el => el.classList.add('hidden'));
  document.getElementById(`vista-${v}`).classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach((b, i) => {
    b.classList.toggle('active', (i === 0 && v === 'timer') || (i === 1 && v === 'stats'));
  });
  if (v === 'stats') cargarStats();
}

// ── Categoría ──
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

// ── Modo ──
function cambiarModo(nuevoModo) {
  pararTimer();
  modo = nuevoModo;
  const cfg = MODOS[modo];
  segundosRestantes = cfg.duracion * 60;
  segundosTotales   = cfg.duracion * 60;

  document.querySelectorAll('.mode-pill').forEach(p => p.classList.remove('active', 'break-s', 'break-l'));
  const pill = document.getElementById(`pill-${modo}`);
  if (pill) { pill.classList.add('active'); if (cfg.clase) pill.classList.add(cfg.clase); }

  elRing.className = `ring-fill ${cfg.clase}`;
  elBtnPlay.className = `btn-control btn-primary ${cfg.clase}`;
  elLabel.textContent = cfg.label;
  actualizarDisplay();
}

// ── Timer ──
function toggleTimer() {
  corriendo ? pararTimer() : iniciarTimer();
}

function iniciarTimer() {
  corriendo = true;
  elBtnPlay.textContent = '⏸';
  intervalo = setInterval(tick, 1000);
}

function pararTimer() {
  corriendo = false;
  elBtnPlay.textContent = '▶';
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
  elTiempo.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

  const progreso = segundosRestantes / segundosTotales;
  const offset   = CIRCUNFERENCIA * progreso;
  elRing.style.strokeDashoffset = offset;
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

    await guardarSesion({
      tipo:      'trabajo',
      categoria: categoria,
      duracion:  cfg.duracion,
      nota:      elNota.value.trim(),
    });

    await enviarNotificacion(
      '🍅 ¡Pomodoro completado!',
      `${cfg.duracion} minutos de ${categoria}. Tómate un descanso.`
    );

    if (rondaActual < 4) {
      rondaActual++;
      elRonda.textContent = rondaActual;
      setTimeout(() => cambiarModo('descanso-corto'), 600);
    } else {
      rondaActual = 1;
      elRonda.textContent = rondaActual;
      await enviarNotificacion('🌿 ¡Ronda completa!', '4 Pomodoros completados. Tómate un descanso largo.');
      setTimeout(() => cambiarModo('descanso-largo'), 600);
    }

  } else if (modo !== 'trabajo' && !saltada) {
    await guardarSesion({ tipo: 'descanso', categoria: modo, duracion: cfg.duracion, nota: '' });
    await enviarNotificacion('⚡ ¡Descanso terminado!', 'Es hora de volver al trabajo.');
    setTimeout(() => cambiarModo('trabajo'), 600);
  } else {
    setTimeout(() => cambiarModo('trabajo'), 300);
  }
}

// ── API ──
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
    const res   = await fetch('/api/stats');
    const stats = await res.json();
    pomodorosHoy = stats.hoy || 0;
    elPomCount.textContent = pomodorosHoy;
  } catch (e) { /* silencioso */ }
}

// ── ESTADÍSTICAS ──
async function cargarStats() {
  try {
    const [statsRes, sesionesRes] = await Promise.all([
      fetch('/api/stats'),
      fetch('/api/sessions'),
    ]);
    const stats    = await statsRes.json();
    const sesiones = await sesionesRes.json();

    document.getElementById('stat-total').textContent = stats.total_pomodoros || 0;
    document.getElementById('stat-horas').textContent = `${Math.floor((stats.total_minutos || 0) / 60)}h`;
    document.getElementById('stat-racha').textContent = stats.racha || 0;
    document.getElementById('stat-hoy').textContent   = stats.hoy   || 0;

    renderChartDias(stats.por_dia  || {});
    renderChartCats(stats.por_categoria || {});
    renderHistorial(sesiones);
  } catch (e) { console.error('Error cargando stats:', e); }
}

function renderChartDias(porDia) {
  const labels = Object.keys(porDia).map(d => {
    const [,m,dd] = d.split('-');
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
        backgroundColor: 'rgba(255,107,107,0.6)',
        borderColor:     '#ff6b6b',
        borderWidth:     2,
        borderRadius:    8,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#6b6b8a' } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#6b6b8a', stepSize: 1 }, beginAtZero: true },
      },
    },
  });
}

function renderChartCats(porCat) {
  const COLORES = ['#7c3aed','#ff6b6b','#4ecdc4','#45b7d1','#f5a623','#a78bfa'];
  const labels  = Object.keys(porCat);
  const data    = Object.values(porCat).map(m => Math.round(m));

  if (!labels.length) return;

  if (chartCats) chartCats.destroy();
  const ctx = document.getElementById('chart-cats').getContext('2d');
  chartCats = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: COLORES.slice(0, labels.length),
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
          labels: { color: '#6b6b8a', padding: 12, boxWidth: 12 },
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.parsed} min`,
          },
        },
      },
    },
  });
}

function renderHistorial(sesiones) {
  const lista = document.getElementById('historial-lista');
  const trabajos = sesiones.filter(s => s.tipo === 'trabajo').reverse();

  if (!trabajos.length) {
    lista.innerHTML = '<p class="empty-msg">Aún no hay sesiones. ¡Empieza tu primer Pomodoro!</p>';
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
