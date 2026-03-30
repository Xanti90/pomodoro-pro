# Focumo — Roadmap & Ideas
> Ecosistema de productividad gamificada. Modelo: Duolingo meets Deep Work.
> Última actualización: 2026-03-31 (v3 — arquitectura estratégica, modelo freemium, ecosistema B2B)

---

## VISIÓN DEL CEO

> **"Un cronómetro Pomodoro lo programa un estudiante en una tarde. Focumo va a ser un ecosistema."**

Nuestra meta es replicar el modelo de retención de Duolingo adaptado al alto rendimiento: psicología de la dopamina, comunidad social real y monetización en capas. Cada feature se evalúa con una sola pregunta: **¿esto hace que el usuario vuelva mañana?**

### Los 4 pilares inamovibles del producto
1. **Dopamina** — Ligas, rachas, objetivos diarios, ascensos. El usuario debe sentir que pierde algo si no entra.
2. **Social real** — No solo ranking. Salas de estudio donde la gente conecta, estudia junta y socializa en los descansos.
3. **Ecosistema KDP** — El asistente IA hace upselling del libro "El Método Focumo". El libro lleva al producto. El producto lleva al libro.
4. **Diseño sin rastro de IA** — Indiscutiblemente profesional. Si alguien lo mira y piensa "esto lo hizo una IA", hemos fallado.

---

## ARQUITECTURA ESTRATÉGICA (v3 — 2026-03-31)

### Producto 1: Focumo.app — API-First / PWA

**Modelo de monetización Freemium:**
- Features PRO visibles pero con efecto `blur` en la UI → generan deseo antes de la conversión
- **PRO:** pago único de **4,99€** → insignia/coronita visible en perfil y ranking (señal de estatus social)
- **Donaciones:** botón "Invítame a un café" → enlace externo PayPal/Ko-fi
- Arquitectura preparada para **MCP de Stripe** (pagos en la plataforma sin salir de la app)

**Protocolo de desarrollo:**
- Prohibido improvisar código: toda feature nueva requiere Plan de Ataque aprobado
- Frontend: Tailwind avanzado, UI/UX Silicon Valley, copy persuasivo libre de rastro IA
- Backend: API-First → cada endpoint diseñado para ser consumido también por apps móviles

### Producto 2: Agencia Matriz B2B
- Vende soluciones de digitalización de alto ticket
- Focumo.app actúa como **caso de éxito principal** en pitches B2B
- Naming en evaluación: ver sección "Decisiones de Marca"

---

## FASE BETA (arranque 2026-03-31)

### Prioridad inmediata
- [ ] **Paso 7 OAuth:** Actualizar Google Cloud Console → añadir `https://focumo.app/auth/google/callback`
- [ ] **Plan Ligas:** Presentar arquitectura y diseño del sistema de ligas/ranking
- [ ] **Audit de diseño:** Revisar toda la UI contra estándar Silicon Valley
- [ ] **Blur PRO:** Identificar features que recibirán efecto blur en UI Freemium

---

## DIRECTRICES ESTRATÉGICAS

### 1. Gamificación Agresiva — Sistema de Ligas (Modelo Duolingo)

**Concepto:** Ligas semanales con ascenso/descenso automático.

| Liga | Icono | Condición de acceso |
|------|-------|---------------------|
| Bronce | 🥉 | Todos los nuevos usuarios |
| Plata | 🥈 | Top 50% de Bronce al fin de semana |
| Oro | 🥇 | Top 50% de Plata al fin de semana |
| Diamante | 💎 | Top 25% de Oro al fin de semana |

**Mecánica:**
- Puntos por Pomodoro completado (×1 base, ×1.5 en racha, ×2 en objetivo diario cumplido)
- Al domingo 23:59, top usuarios suben; bottom 25% bajan
- Notificación el viernes: "Estás en posición X, faltan 48h para el cierre de liga"
- Badge permanente en perfil del máximo nivel alcanzado

**DB schema necesario:**
```sql
CREATE TABLE leagues (id, name, min_rank, max_rank, icon);
CREATE TABLE user_league_history (user_id, week_start, league_id, points, final_rank);
```

---

### 2. Factor Social — Salas de Enfoque Compartido ("Study with Me")

**Concepto:** Usuarios hacen Pomodoros simultáneos en salas virtuales. El objetivo va más allá de estudiar — es **conectar**. Bibliotecas, universidades, coworking. La gente viene a enfocarse y se queda por la comunidad.

**Arquitectura:**
- Salas públicas (listado discoverable por tema: Oposiciones, Programación, Idiomas…) y privadas (código de invitación)
- Capacidad: 2–20 personas por sala
- Temporizador sincronizado (el host controla el ciclo)
- Chat habilitado SOLO durante descansos (5 min entre Pomodoros) — el silencio forzado durante el trabajo es parte del ritual
- "Aura de sala" — fondo visual compartido (lluvia, café, biblioteca, lo-fi)
- Perfiles visibles en sala: avatar, racha actual, liga, Pomodoros totales
- **Dimensión social:** en los descansos el chat es libre. La sala se convierte en espacio de conexión genuina.

**Tech stack recomendado:**
- WebSockets (Flask-SocketIO) para sincronización en tiempo real
- Room state en Redis o SQLite con polling cada 5s (MVP)
- Fase 2: migrar a WebSockets puros

**Tablas necesarias:**
```sql
CREATE TABLE focus_rooms (id, name, host_id, is_public, invite_code, status, created_at);
CREATE TABLE room_members (room_id, user_id, joined_at);
CREATE TABLE room_messages (room_id, user_id, message, sent_at);
```

---

### 3. Retención y Psicología — Sistema de Rachas + Notificaciones

**Streaks:**
- Racha diaria: completar el objetivo diario de Pomodoros (configurable: 2/4/6/8)
- Contador visible en dashboard: "🔥 Racha: 14 días"
- "Streak Shield" PRO: protege la racha 1 vez por semana si fallas un día
- Animación de fuego al llegar a rachas de 7, 30, 100, 365 días

**Notificaciones de retención:**
- Push (browser/PWA): "⏰ Te quedan 2h para mantener tu racha de 14 días"
- Email recordatorio si no se ha hecho ningún Pomodoro a las 20:00
- Email de "regreso" si el usuario lleva 3 días sin entrar: "Te echamos de menos 😢"

**Tech stack:**
- Celery + Redis para emails programados (o cron job ligero en MVP)
- Service Worker para push notifications en PWA

---

### 4. Versión Móvil — Mobile-First, PWA

**Objetivos:**
- Sentirse como app nativa en Safari iOS y Chrome Android
- Bottom navigation bar en móvil (en lugar de sidebar)
- Botón de inicio de sesión con Face ID / Touch ID (WebAuthn futuro)
- Añadir a pantalla de inicio: `manifest.json` + Service Worker

**Checklist de responsive:**
- [ ] Timer centrado, botones grandes (min 44px tap target)
- [ ] Heatmap scroll horizontal en móvil
- [ ] Chat widget colapsable en pantallas < 768px
- [ ] Ranking con scroll infinito
- [ ] Modo no molestar: silencia notificaciones durante Pomodoro activo

---

### 5. Monetización y Ecosistema

**Capas de monetización:**

| Tier | Precio | Features |
|------|--------|---------|
| Free | 0€/mes | Timer, 3 categorías, ranking básico, ligas Bronce/Plata |
| PRO | 4.99€/mes | Ligas Oro/Diamante, Streak Shield, estadísticas avanzadas, salas privadas, sin ads |
| Team | 12€/mes/equipo | Hasta 10 usuarios, sala dedicada, dashboard de equipo |

**Integración con el libro "El Método Focumo" (Amazon KDP):**
- El asistente IA hace upselling natural: cuando un usuario alcanza 100 Pomodoros, el bot sugiere el libro como "el siguiente nivel"
- Banner en dashboard Free: "El método detrás de Focumo → libro en Amazon KDP"
- Usuarios PRO reciben capítulo gratuito en PDF (lead magnet de conversión)
- Landing page: sección dedicada al libro con enlace Amazon
- QR en contraportada del libro → código de descuento PRO exclusivo (flywheel: libro → app → PRO)
- El libro da credibilidad al producto. El producto da ventas al libro.

**Nombre del libro:** "El Método Focumo" — Amazon KDP, autor: Santiago Jiménez Téllez

---

## ESTÁNDAR DE DISEÑO — "Limpieza del rastro de IA"

**Estándar obligatorio:** Indiscutiblemente profesional. Si alguien lo mira y piensa "esto lo hizo una IA o una plantilla", hemos fallado.

### Identidad visual
- **Modo oscuro:** Fondo `#0D0D0D` con cards `#1A1A1A`, acentos caramelo `#D4924F` — no gris plano genérico
- **Glassmorphism:** `backdrop-filter: blur(20px)` + bordes `rgba(255,255,255,0.08)` + sombra sutil
- **Tipografía:** Inter o Geist cargada desde CDN — nunca `system-ui` sin personalizar
- **Micro-interacciones:** spring animations en botones, flip counter en timer, pulse en rachas activas
- **Iconografía:** SVG personalizados o Lucide con stroke customizado — nunca Font Awesome genérico

### Lo que está prohibido
- Cualquier componente que parezca "Bootstrap de 2018"
- Textos como "¡Bienvenido! Estamos felices de tenerte aquí" — copy humano, directo, con personalidad
- Paletas de color genéricas (azul #007bff, verde #28a745)
- Bordes radius uniformes en todo (cada componente tiene su propia personalidad)
- Animaciones CSS de ejemplo (bounce/spin por defecto) sin customizar

### Auditoría visual (tarea 2026-03-31)
- [ ] Revisión Mobile-First completa en Safari iOS y Chrome Android
- [ ] Maquetación del sistema de Ligas con perfil social
- [ ] Dark mode toggle persistente (localStorage)
- [ ] Landing page — eliminar cualquier párrafo que suene a IA generada

---

## STACK TECNOLÓGICO TARGET

```
Frontend:   Tailwind CSS 3 + Alpine.js (o Vanilla JS optimizado)
Backend:    Flask 3.x + SQLite (→ PostgreSQL cuando supere 10k usuarios)
Realtime:   Flask-SocketIO (MVP) → dedicated WebSocket server (escala)
Cache/Jobs: Redis + Celery (email/notificaciones)
Deploy:     Render.com (Free → Starter → Standard según crecimiento)
PWA:        manifest.json + Service Worker (Workbox)
Analytics:  Plausible (privacy-first, sin cookies)
Email:      Resend.com o Mailgun (transaccional)
```

---

## KPIs DE ÉXITO BETA

| Métrica | Target 30 días | Target 90 días |
|---------|---------------|----------------|
| Usuarios registrados | 500 | 5.000 |
| DAU/MAU ratio | > 20% | > 35% |
| Racha media usuarios activos | 5 días | 12 días |
| Conversión Free → PRO | 2% | 5% |
| Churn mensual PRO | < 10% | < 5% |

---

---

## DECISIONES DE MARCA

### Naming Agencia B2B — DECIDIDO: Foco Studio
- Footer de toda la app actualizado: "© 2026 Santiago Jiménez Téllez & Foco Studio"
- Foco Studio = agencia B2B matriz. Focumo.app = producto estrella / caso de éxito principal.

### Login con Apple — Prioridad Alta (fase nativa)
- Añadir Sign in with Apple para la fase de app nativa (iOS/PWA)
- Requiere: Apple Developer Account ($99/año), entitlements en app, JWT con clave privada ES256
- Prioridad: alta para conversión en iOS una vez lanzada la PWA

### Monetización Web — Stripe + PayPal (FASE 2)
- Stripe y PayPal en web para eludir comisiones App Store
- Arquitectura: MCP de Stripe → webhook valida pago → actualiza `plan='pro'` en DB
- PRO: pago único 4,99€. Coronita en perfil. Sin suscripción.
- Apple Pay: disponible via Stripe Web (no requiere Apple Developer Account separada en web)

### Login con Apple (FASE 2)
- Sign in with Apple para fase nativa/PWA
- Requiere Apple Developer Account ($99/año), JWT ES256

### Gamificación Fase 2 — Ascensos/Descensos Semanales
- Cuenta atrás visible del cierre semanal de liga (domingo 23:59)
- Sistema de puntos multiplicados: ×1 base, ×1.5 en racha activa, ×2 con objetivo diario cumplido
- Tareas Sociales: +pts por añadir amigos, estudiar en salas compartidas
- El modelo social hace el sistema viral: la liga de tus amigos es la liga que importa

---

## AGENDA HOY (2026-03-31) — En este orden

1. **Google OAuth producción** — Google Cloud Console, 2 min. Sin esto el login con Google falla.
2. **Auditoría visual Mobile-First** — Safari iOS + Chrome Android. Identificar todo lo roto.
3. **Maquetación Ligas + Perfil Social** — Presentar diseño antes de tocar código.
4. **"Limpieza del rastro de IA"** — Copy, tipografía, componentes. Que ningún elemento grite plantilla.

---

*"Un cronómetro Pomodoro lo programa un estudiante en una tarde. Focumo va a ser un ecosistema."*
*"Mañana hacemos historia." — CEO, 2026-03-30*
