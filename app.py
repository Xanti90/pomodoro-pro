"""
FOCUMO v1.0 — Backend SaaS
Gamificación · Leaderboard · Medallas · Categorías · Referidos · IA Chat
Autor: Santiago Jiménez Téllez  |  © 2026 All rights reserved
"""

import json, os, secrets, sqlite3, subprocess
from calendar import monthrange
from datetime import date, datetime, timedelta
from functools import wraps
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode

import requests
from flask import (Flask, g, jsonify, redirect, render_template,
                   request, session, url_for)
from werkzeug.security import check_password_hash, generate_password_hash

# ─── RUTAS ────────────────────────────────────────────────────
BASE_DIR    = Path(__file__).parent
DATA_DIR    = BASE_DIR / "data"
DB_PATH     = DATA_DIR / "focumo.db"
SECRET_FILE = DATA_DIR / ".secret_key"
OLD_JSON    = DATA_DIR / "sessions.json"
OLD_DB      = DATA_DIR / "pomodoro.db"   # migración nombre antiguo
DATA_DIR.mkdir(exist_ok=True)

# Migrar nombre de DB si existe la antigua
if OLD_DB.exists() and not DB_PATH.exists():
    OLD_DB.rename(DB_PATH)

if SECRET_FILE.exists():
    _SECRET_KEY = SECRET_FILE.read_text().strip()
else:
    _SECRET_KEY = secrets.token_hex(32)
    SECRET_FILE.write_text(_SECRET_KEY)
    SECRET_FILE.chmod(0o600)

# ─── GOOGLE OAUTH ─────────────────────────────────────────────
GOOGLE_CLIENT_ID     = os.environ.get("GOOGLE_CLIENT_ID",     "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI  = os.environ.get("GOOGLE_REDIRECT_URI",
                        "http://localhost:5050/auth/google/callback")
GOOGLE_ENABLED       = bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)

# ─── STRIPE ────────────────────────────────────────────────────
STRIPE_PUBLIC_KEY     = os.environ.get("STRIPE_PUBLIC_KEY",     "")
STRIPE_SECRET_KEY     = os.environ.get("STRIPE_SECRET_KEY",     "")
STRIPE_PRICE_ID       = os.environ.get("STRIPE_PRICE_ID",       "")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

# ─── PAYPAL ────────────────────────────────────────────────────
PAYPAL_CLIENT_ID      = os.environ.get("PAYPAL_CLIENT_ID",      "")
PAYPAL_CLIENT_SECRET  = os.environ.get("PAYPAL_CLIENT_SECRET",  "")
PAYPAL_MODE           = os.environ.get("PAYPAL_MODE",           "sandbox")  # "sandbox" | "live"

# ─── DONACIONES ────────────────────────────────────────────────
COFFEE_URL = os.environ.get("COFFEE_URL", "https://ko-fi.com/focumo")

GOOGLE_AUTH_URL     = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL    = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"

# ─── APP FLASK ─────────────────────────────────────────────────
app = Flask(__name__)
app.secret_key = _SECRET_KEY
app.config["SESSION_COOKIE_SAMESITE"]    = "Lax"
app.config["SESSION_COOKIE_HTTPONLY"]    = True
app.config["SESSION_COOKIE_SECURE"]      = os.environ.get("PRODUCTION", "") == "1"
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=30)


# ══════════════════════════════════════════════════════════════
# SEGURIDAD — Cabeceras HTTP
# ══════════════════════════════════════════════════════════════

@app.after_request
def security_headers(response):
    response.headers["X-Content-Type-Options"]    = "nosniff"
    response.headers["X-Frame-Options"]           = "DENY"
    response.headers["X-XSS-Protection"]          = "1; mode=block"
    response.headers["Referrer-Policy"]           = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"]        = "geolocation=(), microphone=(), camera=()"
    response.headers["Content-Security-Policy"]   = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' cdn.jsdelivr.net cdn.tailwindcss.com cdnjs.cloudflare.com "
        "js.stripe.com www.paypal.com www.paypalobjects.com; "
        "style-src 'self' 'unsafe-inline' cdn.tailwindcss.com fonts.googleapis.com cdnjs.cloudflare.com; "
        "font-src 'self' fonts.gstatic.com; "
        "img-src 'self' data: *.googleusercontent.com lh3.googleusercontent.com www.paypalobjects.com; "
        "connect-src 'self' wttr.in api.stripe.com www.paypal.com www.sandbox.paypal.com; "
        "frame-src js.stripe.com www.paypal.com www.sandbox.paypal.com; "
        "frame-ancestors 'none';"
    )
    return response


# ══════════════════════════════════════════════════════════════
# BASE DE DATOS
# ══════════════════════════════════════════════════════════════

def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(str(DB_PATH), detect_types=sqlite3.PARSE_DECLTYPES)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db

@app.teardown_appcontext
def close_db(e: Any = None) -> None:
    db = g.pop("db", None)
    if db: db.close()

def init_db() -> None:
    db = sqlite3.connect(str(DB_PATH))
    db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id             INTEGER  PRIMARY KEY AUTOINCREMENT,
            email          TEXT     UNIQUE NOT NULL,
            password_hash  TEXT,
            google_id      TEXT     UNIQUE,
            name           TEXT     NOT NULL DEFAULT 'Usuario',
            avatar_url     TEXT     DEFAULT '',
            plan           TEXT     NOT NULL DEFAULT 'free',
            pro_expires_at TIMESTAMP,
            referral_code  TEXT     UNIQUE,
            created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS referrals (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            referrer_id  INTEGER NOT NULL,
            referred_id  INTEGER NOT NULL,
            created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            activated_at TIMESTAMP,
            pro_granted  INTEGER DEFAULT 0,
            FOREIGN KEY (referrer_id) REFERENCES users(id),
            FOREIGN KEY (referred_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS categories (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            nombre  TEXT    NOT NULL,
            color   TEXT    DEFAULT '#B8733A',
            emoji   TEXT    DEFAULT '📌',
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id        INTEGER  PRIMARY KEY AUTOINCREMENT,
            user_id   INTEGER  NOT NULL,
            fecha     TIMESTAMP NOT NULL,
            tipo      TEXT     NOT NULL DEFAULT 'trabajo',
            categoria TEXT     DEFAULT 'General',
            duracion  INTEGER  DEFAULT 25,
            nota      TEXT     DEFAULT '',
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS medals (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id   INTEGER NOT NULL,
            tipo      TEXT    NOT NULL,
            mes       TEXT    NOT NULL,
            pomodoros INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS bug_reports (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER,
            descripcion TEXT NOT NULL,
            fecha       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS chat_messages (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER,
            role       TEXT NOT NULL,
            message    TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
    """)
    # Migraciones de columnas existentes (idempotentes)
    _ensure_column(db, "users", "plan", "TEXT NOT NULL DEFAULT 'free'")
    _ensure_column(db, "users", "pro_expires_at", "TIMESTAMP")
    _ensure_column(db, "users", "referral_code", "TEXT UNIQUE")
    _ensure_column(db, "users", "country_code", "TEXT DEFAULT 'es'")
    db.commit()
    db.close()
    _migrar_json()
    _generar_codigos_referido_faltantes()
    _auto_seed_produccion()

def _ensure_column(db, table: str, col: str, col_def: str) -> None:
    cols = [r[1] for r in db.execute(f"PRAGMA table_info({table})").fetchall()]
    if col not in cols:
        try:
            db.execute(f"ALTER TABLE {table} ADD COLUMN {col} {col_def}")
        except Exception:
            pass

def _auto_seed_produccion() -> None:
    """En producción, siembra 50 bots si la DB tiene menos de 5 usuarios.
    Garantiza que el ranking y ligas tengan datos desde el primer arranque."""
    if os.environ.get("PRODUCTION") != "1":
        return
    try:
        db  = sqlite3.connect(str(DB_PATH))
        n   = db.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        db.close()
        if n >= 5:
            return
        import subprocess, sys
        seed_path = BASE_DIR / "seed.py"
        if seed_path.exists():
            subprocess.run(
                [sys.executable, str(seed_path), "--usuarios", "50", "--semanas", "12"],
                cwd=str(BASE_DIR), timeout=120
            )
    except Exception as e:
        print(f"[auto-seed] Error (no crítico): {e}")


def _generar_codigos_referido_faltantes() -> None:
    """Genera referral_code para usuarios que aún no lo tienen."""
    try:
        db = sqlite3.connect(str(DB_PATH))
        sin_codigo = db.execute(
            "SELECT id FROM users WHERE referral_code IS NULL"
        ).fetchall()
        for row in sin_codigo:
            code = secrets.token_urlsafe(8)
            db.execute("UPDATE users SET referral_code=? WHERE id=?", (code, row[0]))
        if sin_codigo:
            db.commit()
        db.close()
    except Exception:
        pass

def _migrar_json() -> None:
    if not OLD_JSON.exists(): return
    try:
        sesiones = json.loads(OLD_JSON.read_text(encoding="utf-8"))
        if not sesiones: return
        db = sqlite3.connect(str(DB_PATH))
        cur = db.execute("SELECT id FROM users WHERE email='santiago@focumo.local'")
        row = cur.fetchone()
        uid = row[0] if row else None
        if not uid:
            code = secrets.token_urlsafe(8)
            db.execute("INSERT INTO users (email,name,referral_code) VALUES (?,?,?)",
                       ("santiago@focumo.local","Santiago", code))
            db.commit()
            uid = db.execute("SELECT last_insert_rowid()").fetchone()[0]
        if db.execute("SELECT COUNT(*) FROM sessions WHERE user_id=?",(uid,)).fetchone()[0] == 0:
            for s in sesiones:
                db.execute(
                    "INSERT INTO sessions (user_id,fecha,tipo,categoria,duracion,nota) VALUES(?,?,?,?,?,?)",
                    (uid, s.get("fecha",datetime.now().isoformat()),
                     s.get("tipo","trabajo"), s.get("categoria","General"),
                     s.get("duracion",25), s.get("nota","")))
            db.commit()
        db.close()
        OLD_JSON.rename(OLD_JSON.with_suffix(".json.bak"))
    except Exception: pass


# ══════════════════════════════════════════════════════════════
# AUTH HELPERS
# ══════════════════════════════════════════════════════════════

def login_required(f):
    @wraps(f)
    def deco(*a, **kw):
        if "user_id" not in session:
            return redirect(url_for("login_page"))
        return f(*a, **kw)
    return deco

def get_current_user() -> Optional[Dict]:
    uid = session.get("user_id")
    if not uid: return None
    row = get_db().execute(
        "SELECT id,email,name,avatar_url,plan,pro_expires_at,referral_code FROM users WHERE id=?",
        (uid,)
    ).fetchone()
    return dict(row) if row else None

def user_medals(uid: int) -> List[Dict]:
    rows = get_db().execute(
        "SELECT tipo,mes,pomodoros FROM medals WHERE user_id=? ORDER BY mes DESC",
        (uid,)
    ).fetchall()
    return [dict(r) for r in rows]

def is_pro(user: Dict) -> bool:
    if user.get("plan") == "pro":
        exp = user.get("pro_expires_at")
        if exp is None: return True  # PRO permanente
        return datetime.fromisoformat(str(exp)) > datetime.now()
    return False


# ══════════════════════════════════════════════════════════════
# GAMIFICACIÓN — MEDALLAS
# ══════════════════════════════════════════════════════════════

def verificar_y_otorgar_medallas() -> None:
    today           = date.today()
    primer_dia_mes  = today.replace(day=1)
    ultimo_mes_date = primer_dia_mes - timedelta(days=1)
    mes_str         = ultimo_mes_date.strftime("%Y-%m")
    mes_inicio      = f"{mes_str}-01"
    mes_fin         = ultimo_mes_date.isoformat()

    db = get_db()
    if db.execute("SELECT COUNT(*) FROM medals WHERE mes=?", (mes_str,)).fetchone()[0]:
        return

    top3 = db.execute("""
        SELECT user_id, COUNT(*) as total
        FROM sessions WHERE tipo='trabajo'
          AND fecha >= ? AND fecha <= ?
        GROUP BY user_id ORDER BY total DESC LIMIT 3
    """, (mes_inicio, mes_fin + " 23:59:59")).fetchall()

    tipos = ["gold", "silver", "bronze"]
    for i, row in enumerate(top3):
        db.execute("INSERT INTO medals (user_id,tipo,mes,pomodoros) VALUES (?,?,?,?)",
                   (row["user_id"], tipos[i], mes_str, row["total"]))
    if top3: db.commit()


# ══════════════════════════════════════════════════════════════
# REFERIDOS
# ══════════════════════════════════════════════════════════════

def procesar_referido_tras_pomodoro(user_id: int) -> None:
    """
    Comprueba si el usuario fue referido y ha completado 3 pomodoros.
    Si es así, activa el bono PRO de 15 días para ambos.
    """
    db = get_db()
    ref = db.execute(
        "SELECT id, referrer_id, pro_granted FROM referrals "
        "WHERE referred_id=? AND pro_granted=0", (user_id,)
    ).fetchone()
    if not ref: return

    total_pom = db.execute(
        "SELECT COUNT(*) FROM sessions WHERE user_id=? AND tipo='trabajo'",
        (user_id,)
    ).fetchone()[0]

    if total_pom >= 3:
        expira = (datetime.now() + timedelta(days=15)).isoformat()
        for uid in (user_id, ref["referrer_id"]):
            db.execute(
                "UPDATE users SET plan='pro', pro_expires_at=? WHERE id=?",
                (expira, uid)
            )
        db.execute(
            "UPDATE referrals SET pro_granted=1, activated_at=? WHERE id=?",
            (datetime.now().isoformat(), ref["id"])
        )
        db.commit()


# ══════════════════════════════════════════════════════════════
# ESTADÍSTICAS
# ══════════════════════════════════════════════════════════════

def calcular_stats(user_id: int) -> Dict:
    rows = get_db().execute(
        "SELECT fecha,categoria,duracion FROM sessions WHERE user_id=? AND tipo='trabajo'",
        (user_id,)
    ).fetchall()
    if not rows:
        return {"total_pomodoros":0,"total_minutos":0,
                "por_categoria":{},"por_dia":{},"racha":0,"hoy":0}

    total_pomodoros = len(rows)
    total_minutos   = sum(r["duracion"] for r in rows)
    por_cat: Dict[str,int] = {}
    por_dia: Dict[str,int] = {}

    for r in rows:
        cat = r["categoria"] or "General"
        por_cat[cat] = por_cat.get(cat,0) + r["duracion"]
        dia = str(r["fecha"])[:10]
        por_dia[dia] = por_dia.get(dia,0) + 1

    hoy_str  = date.today().isoformat()
    ultimos7 = {(date.today()-timedelta(days=i)).isoformat():0 for i in range(6,-1,-1)}
    for d,n in por_dia.items():
        if d in ultimos7: ultimos7[d] = n

    racha = 0
    check = date.today()
    for _ in range(365):
        if por_dia.get(check.isoformat(),0)>0:
            racha+=1; check=check-timedelta(days=1)
        else: break

    return {"total_pomodoros":total_pomodoros,"total_minutos":total_minutos,
            "por_categoria":por_cat,"por_dia":ultimos7,
            "racha":racha,"hoy":por_dia.get(hoy_str,0)}


# ══════════════════════════════════════════════════════════════
# RUTAS — PÚBLICAS
# ══════════════════════════════════════════════════════════════

@app.route("/")
def landing():
    """Landing page pública. Si el usuario está logueado, va directo a la app."""
    if "user_id" in session:
        return redirect(url_for("app_page"))
    return render_template("landing.html", google_enabled=GOOGLE_ENABLED)

@app.route("/privacy")
def privacy():
    return render_template("privacy.html")

@app.route("/terms")
def terms():
    return render_template("terms.html")

@app.route("/ref/<code>")
def referral_link(code: str):
    """Guarda el código de referido en sesión antes de redirigir al registro."""
    session["referral_code"] = code[:20]
    return redirect(url_for("register_page"))


# ══════════════════════════════════════════════════════════════
# RUTAS — AUTH
# ══════════════════════════════════════════════════════════════

@app.route("/login", methods=["GET"])
def login_page():
    if "user_id" in session: return redirect(url_for("app_page"))
    return render_template("login.html", google_enabled=GOOGLE_ENABLED)

@app.route("/login", methods=["POST"])
def login_post():
    email    = (request.form.get("email") or "").strip().lower()[:254]
    password = request.form.get("password") or ""
    if not email or not password:
        return render_template("login.html", error="Completa todos los campos.",
                               google_enabled=GOOGLE_ENABLED)
    row = get_db().execute(
        "SELECT id,password_hash FROM users WHERE email=?",(email,)
    ).fetchone()
    if not row or not row["password_hash"] or \
       not check_password_hash(row["password_hash"], password):
        return render_template("login.html", error="Email o contraseña incorrectos.",
                               google_enabled=GOOGLE_ENABLED)
    session.permanent = True
    session["user_id"] = row["id"]
    return redirect(url_for("app_page"))

@app.route("/register", methods=["GET"])
def register_page():
    if "user_id" in session: return redirect(url_for("app_page"))
    return render_template("register.html", google_enabled=GOOGLE_ENABLED)

@app.route("/register", methods=["POST"])
def register_post():
    name      = (request.form.get("name") or "").strip()[:80]
    email     = (request.form.get("email") or "").strip().lower()[:254]
    password  = request.form.get("password") or ""
    password2 = request.form.get("password2") or ""
    if not name or not email or not password:
        return render_template("register.html", error="Completa todos los campos.",
                               google_enabled=GOOGLE_ENABLED)
    if password2 and password != password2:
        return render_template("register.html", error="Las contraseñas no coinciden.",
                               google_enabled=GOOGLE_ENABLED)
    if len(password) < 6:
        return render_template("register.html",
            error="Contraseña mínimo 6 caracteres.", google_enabled=GOOGLE_ENABLED)
    if "@" not in email:
        return render_template("register.html", error="Email no válido.",
                               google_enabled=GOOGLE_ENABLED)
    db = get_db()
    if db.execute("SELECT id FROM users WHERE email=?",(email,)).fetchone():
        return render_template("register.html",
            error="Ya existe una cuenta con ese email.", google_enabled=GOOGLE_ENABLED)

    referral_code = secrets.token_urlsafe(8)
    db.execute(
        "INSERT INTO users (email,password_hash,name,referral_code) VALUES (?,?,?,?)",
        (email, generate_password_hash(password, method="pbkdf2:sha256"),
         name, referral_code)
    )
    db.commit()
    uid = db.execute("SELECT id FROM users WHERE email=?",(email,)).fetchone()["id"]

    # Registrar referido si venía de un enlace
    ref_code = session.pop("referral_code", None)
    if ref_code:
        referrer = db.execute(
            "SELECT id FROM users WHERE referral_code=?", (ref_code,)
        ).fetchone()
        if referrer and referrer["id"] != uid:
            db.execute(
                "INSERT INTO referrals (referrer_id, referred_id) VALUES (?,?)",
                (referrer["id"], uid)
            )
            db.commit()

    session.permanent = True
    session["user_id"] = uid
    return redirect(url_for("app_page"))

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("landing"))

@app.route("/auth/google")
def google_auth():
    if not GOOGLE_ENABLED: return redirect(url_for("login_page"))
    state = secrets.token_urlsafe(16)
    session["oauth_state"] = state
    params = {"client_id":GOOGLE_CLIENT_ID,"redirect_uri":GOOGLE_REDIRECT_URI,
              "response_type":"code","scope":"openid email profile",
              "state":state,"access_type":"online"}
    return redirect(f"{GOOGLE_AUTH_URL}?{urlencode(params)}")

@app.route("/auth/google/callback")
def google_callback():
    if not GOOGLE_ENABLED: return redirect(url_for("login_page"))
    if request.args.get("state") != session.pop("oauth_state",None):
        return redirect(url_for("login_page"))
    code = request.args.get("code")
    if not code: return redirect(url_for("login_page"))
    try:
        tokens = requests.post(GOOGLE_TOKEN_URL, data={
            "code":code,"client_id":GOOGLE_CLIENT_ID,
            "client_secret":GOOGLE_CLIENT_SECRET,
            "redirect_uri":GOOGLE_REDIRECT_URI,"grant_type":"authorization_code"
        }, timeout=10).json()
        access_token = tokens.get("access_token")
        if not access_token: return redirect(url_for("login_page"))
        info = requests.get(GOOGLE_USERINFO_URL,
            headers={"Authorization":f"Bearer {access_token}"}, timeout=10).json()
        google_id  = info.get("sub"); email = (info.get("email") or "").lower()
        name       = info.get("name") or email
        avatar_url = info.get("picture") or ""
        if not google_id or not email: return redirect(url_for("login_page"))
        db  = get_db()
        row = db.execute(
            "SELECT id FROM users WHERE google_id=? OR email=?",(google_id,email)
        ).fetchone()
        if row:
            db.execute("UPDATE users SET google_id=?,avatar_url=? WHERE id=?",
                       (google_id,avatar_url,row["id"])); db.commit(); uid=row["id"]
        else:
            code_ref = secrets.token_urlsafe(8)
            db.execute(
                "INSERT INTO users (email,google_id,name,avatar_url,referral_code) VALUES(?,?,?,?,?)",
                (email,google_id,name,avatar_url,code_ref)
            ); db.commit()
            uid = db.execute("SELECT last_insert_rowid()").fetchone()[0]
        session.permanent = True
        session["user_id"] = uid
        return redirect(url_for("app_page"))
    except Exception: return redirect(url_for("login_page"))


# ══════════════════════════════════════════════════════════════
# RUTAS — APP PRINCIPAL
# ══════════════════════════════════════════════════════════════

@app.route("/app")
@login_required
def app_page():
    user   = get_current_user()
    medals = user_medals(session["user_id"]) if user else []
    return render_template("index.html", user=user, medals=medals,
                           google_enabled=GOOGLE_ENABLED,
                           is_pro=is_pro(user) if user else False,
                           stripe_public_key=STRIPE_PUBLIC_KEY,
                           paypal_client_id=PAYPAL_CLIENT_ID,
                           coffee_url=COFFEE_URL)

@app.route("/api/me")
@login_required
def me():
    user   = get_current_user()
    medals = user_medals(session["user_id"])
    if user:
        user["medals"] = medals
        user["is_pro"] = is_pro(user)
    return jsonify(user)

# ── Sesiones ──────────────────────────────────────────────────
@app.route("/api/sessions", methods=["GET"])
@login_required
def get_sessions():
    uid  = session["user_id"]
    rows = get_db().execute(
        "SELECT id,fecha,tipo,categoria,duracion,nota FROM sessions "
        "WHERE user_id=? ORDER BY fecha DESC LIMIT 50", (uid,)
    ).fetchall()
    return jsonify([dict(r) for r in rows])

@app.route("/api/sessions", methods=["POST"])
@login_required
def save_session():
    data = request.get_json()
    if not data: return jsonify({"error":"Sin datos"}), 400
    uid  = session["user_id"]
    tipo = data.get("tipo","trabajo")
    if tipo not in ("trabajo","descanso-corto","descanso-largo"): tipo = "trabajo"
    dur  = int(data.get("duracion",25))
    if not (1 <= dur <= 120): dur = 25
    db = get_db()
    db.execute(
        "INSERT INTO sessions (user_id,fecha,tipo,categoria,duracion,nota) VALUES(?,?,?,?,?,?)",
        (uid, datetime.now().isoformat(), tipo,
         str(data.get("categoria","General"))[:60], dur,
         str(data.get("nota",""))[:200])
    )
    db.commit()
    # Comprobar referidos
    if tipo == "trabajo":
        procesar_referido_tras_pomodoro(uid)
    return jsonify({"ok":True})

@app.route("/api/stats")
@login_required
def stats():
    return jsonify(calcular_stats(session["user_id"]))

@app.route("/api/heatmap")
@login_required
def heatmap():
    uid    = session["user_id"]
    inicio = (date.today() - timedelta(days=364)).isoformat()
    rows   = get_db().execute(
        "SELECT DATE(fecha) as dia, COUNT(*) as total "
        "FROM sessions WHERE user_id=? AND tipo='trabajo' AND fecha>=? "
        "GROUP BY dia", (uid, inicio)
    ).fetchall()
    return jsonify({r["dia"]: r["total"] for r in rows})

# ── Categorías ────────────────────────────────────────────────
@app.route("/api/categories", methods=["GET"])
@login_required
def get_categories():
    uid  = session["user_id"]
    rows = get_db().execute(
        "SELECT id,nombre,color,emoji FROM categories WHERE user_id=? ORDER BY id",
        (uid,)
    ).fetchall()
    return jsonify([dict(r) for r in rows])

@app.route("/api/categories", methods=["POST"])
@login_required
def create_category():
    data   = request.get_json() or {}
    uid    = session["user_id"]
    nombre = str(data.get("nombre","")).strip()[:50]
    color  = str(data.get("color","#B8733A"))[:7]
    emoji  = str(data.get("emoji","📌"))[:4]
    if not nombre: return jsonify({"error":"Nombre requerido"}), 400
    db = get_db()
    db.execute("INSERT INTO categories (user_id,nombre,color,emoji) VALUES(?,?,?,?)",
               (uid, nombre, color, emoji))
    db.commit()
    cid = db.execute("SELECT last_insert_rowid()").fetchone()[0]
    return jsonify({"id":cid,"nombre":nombre,"color":color,"emoji":emoji})

@app.route("/api/categories/<int:cid>", methods=["DELETE"])
@login_required
def delete_category(cid: int):
    uid = session["user_id"]
    db  = get_db()
    db.execute("DELETE FROM categories WHERE id=? AND user_id=?", (cid, uid))
    db.commit()
    return jsonify({"ok":True})

# ── Leaderboard ───────────────────────────────────────────────
@app.route("/api/leaderboard")
@login_required
def leaderboard():
    verificar_y_otorgar_medallas()
    hoy     = date.today()
    mes_ini = hoy.replace(day=1).isoformat()
    mes_fin = hoy.isoformat()
    db      = get_db()
    rows    = db.execute("""
        SELECT u.id, u.name, u.avatar_url, u.country_code, u.plan,
               COUNT(s.id) as pomodoros,
               SUM(s.duracion) as minutos
        FROM users u
        LEFT JOIN sessions s ON s.user_id = u.id
          AND s.tipo='trabajo'
          AND DATE(s.fecha) >= ? AND DATE(s.fecha) <= ?
        GROUP BY u.id ORDER BY pomodoros DESC LIMIT 20
    """, (mes_ini, mes_fin)).fetchall()

    result = []
    for i, r in enumerate(rows):
        uid      = r["id"]
        medallas = db.execute(
            "SELECT tipo FROM medals WHERE user_id=? ORDER BY mes DESC LIMIT 3", (uid,)
        ).fetchall()
        u_is_pro = (r["plan"] == "pro") if "plan" in r.keys() else False
        result.append({
            "rank":         i + 1,
            "user_id":      uid,
            "name":         r["name"],
            "avatar_url":   r["avatar_url"],
            "country_code": r["country_code"] or "es",
            "pomodoros":    r["pomodoros"] or 0,
            "minutos":      r["minutos"]   or 0,
            "medals":       [m["tipo"] for m in medallas],
            "es_yo":        uid == session["user_id"],
            "is_pro":       u_is_pro,
        })
    return jsonify(result)


@app.route("/api/world-ranking")
@login_required
def world_ranking():
    """Ranking Mundial: agrega sesiones por país, top 10 países."""
    db   = get_db()
    rows = db.execute("""
        SELECT u.country_code,
               COUNT(s.id)       AS pomodoros,
               SUM(s.duracion)   AS minutos,
               COUNT(DISTINCT u.id) AS usuarios
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.tipo = 'trabajo'
        GROUP BY u.country_code
        ORDER BY pomodoros DESC
        LIMIT 15
    """).fetchall()

    COUNTRY_FLAGS = {
        "es": "🇪🇸", "us": "🇺🇸", "mx": "🇲🇽", "gb": "🇬🇧",
        "de": "🇩🇪", "fr": "🇫🇷", "br": "🇧🇷", "ar": "🇦🇷",
        "co": "🇨🇴", "in": "🇮🇳", "jp": "🇯🇵", "kr": "🇰🇷",
        "ca": "🇨🇦", "au": "🇦🇺", "it": "🇮🇹", "pt": "🇵🇹",
        "nl": "🇳🇱", "se": "🇸🇪", "pl": "🇵🇱", "tr": "🇹🇷",
        "ua": "🇺🇦", "ng": "🇳🇬", "za": "🇿🇦", "eg": "🇪🇬",
        "cn": "🇨🇳", "ru": "🇷🇺", "id": "🇮🇩", "ph": "🇵🇭",
    }
    COUNTRY_NAMES = {
        "es": "España",       "us": "Estados Unidos", "mx": "México",
        "gb": "Reino Unido",  "de": "Alemania",        "fr": "Francia",
        "br": "Brasil",       "ar": "Argentina",       "co": "Colombia",
        "in": "India",        "jp": "Japón",            "kr": "Corea del Sur",
        "ca": "Canadá",       "au": "Australia",        "it": "Italia",
        "pt": "Portugal",     "nl": "Países Bajos",     "se": "Suecia",
        "pl": "Polonia",      "tr": "Turquía",          "ua": "Ucrania",
        "ng": "Nigeria",      "za": "Sudáfrica",        "eg": "Egipto",
        "cn": "China",        "ru": "Rusia",            "id": "Indonesia",
        "ph": "Filipinas",
    }
    result = []
    for i, r in enumerate(rows):
        cc = (r["country_code"] or "es").lower()
        result.append({
            "rank":        i + 1,
            "country_code": cc,
            "flag":        COUNTRY_FLAGS.get(cc, "🌍"),
            "name":        COUNTRY_NAMES.get(cc, cc.upper()),
            "pomodoros":   r["pomodoros"] or 0,
            "minutos":     r["minutos"]   or 0,
            "usuarios":    r["usuarios"]  or 0,
        })
    return jsonify(result)

@app.route("/api/medals")
@login_required
def get_medals():
    return jsonify(user_medals(session["user_id"]))

# ── Referidos ─────────────────────────────────────────────────
@app.route("/api/referral")
@login_required
def referral_info():
    user = get_current_user()
    if not user: return jsonify({}), 401
    db      = get_db()
    total   = db.execute(
        "SELECT COUNT(*) FROM referrals WHERE referrer_id=?",
        (user["id"],)
    ).fetchone()[0]
    activos = db.execute(
        "SELECT COUNT(*) FROM referrals WHERE referrer_id=? AND pro_granted=1",
        (user["id"],)
    ).fetchone()[0]
    base_url = request.host_url.rstrip("/")
    return jsonify({
        "code":    user["referral_code"],
        "link":    f"{base_url}/ref/{user['referral_code']}",
        "total":   total,
        "activos": activos,
        "is_pro":  is_pro(user),
    })

# ── Bug report ────────────────────────────────────────────────
@app.route("/api/bug-report", methods=["POST"])
@login_required
def bug_report():
    data = request.get_json() or {}
    desc = str(data.get("descripcion","")).strip()[:1000]
    if not desc: return jsonify({"error":"Descripción requerida"}), 400
    uid = session.get("user_id")
    db  = get_db()
    db.execute("INSERT INTO bug_reports (user_id,descripcion) VALUES(?,?)", (uid, desc))
    db.commit()
    return jsonify({"ok":True})

# ── Notificación macOS ────────────────────────────────────────
@app.route("/api/notify", methods=["POST"])
@login_required
def notify():
    data   = request.get_json() or {}
    titulo = str(data.get("titulo","Focumo"))[:100]
    msg    = str(data.get("mensaje",""))[:200]
    script = f'display notification "{msg}" with title "{titulo}"'
    try: subprocess.run(["osascript","-e",script], check=False, timeout=5)
    except Exception: pass
    return jsonify({"ok":True})

# ── AI Chat Widget ────────────────────────────────────────────
@app.route("/api/chat", methods=["POST"])
@login_required
def chat():
    """
    Endpoint del asistente IA. Por ahora responde con mensajes
    predefinidos. Listo para conectar a OpenAI/Claude API.
    """
    data    = request.get_json() or {}
    message = str(data.get("message","")).strip()[:500]
    uid     = session["user_id"]
    if not message: return jsonify({"error":"Mensaje vacío"}), 400

    # Guardar mensaje del usuario
    db = get_db()
    db.execute("INSERT INTO chat_messages (user_id,role,message) VALUES(?,?,?)",
               (uid, "user", message))

    # Respuesta placeholder (conectar API IA aquí)
    msg_lower = message.lower()
    if any(w in msg_lower for w in ["bug","error","fallo","problema","no funciona"]):
        response = ("Gracias por reportar el problema. Por favor, describe los pasos "
                    "exactos para reproducirlo y te ayudamos lo antes posible. "
                    "También puedes usar el botón 🐛 en el menú de usuario.")
    elif any(w in msg_lower for w in ["pro","premium","precio","plan"]):
        response = ("Focumo PRO incluye temas de color personalizados, sonidos exclusivos, "
                    "exportación avanzada de stats y 0 anuncios. ¡Próximamente! "
                    "También puedes conseguirlo gratis invitando a 1 amigo.")
    elif any(w in msg_lower for w in ["libro","kdp","productividad","recurso"]):
        response = ("Nuestros libros sobre productividad y el método Pomodoro están disponibles "
                    "en Amazon KDP. ¡Busca 'Focumo Productividad' próximamente!")
    elif any(w in msg_lower for w in ["pomodoro","método","técnica","funciona"]):
        response = ("El método Pomodoro divide tu trabajo en bloques de 25 minutos "
                    "con descansos cortos. Estudios demuestran que mejora el foco un 40% "
                    "y reduce la procrastinación. ¡Tú ya lo estás usando! 🍅")
    elif any(w in msg_lower for w in ["hola","buenas","hey","hi"]):
        response = "¡Hola! Soy el asistente de Focumo. ¿En qué puedo ayudarte hoy? 🎯"
    else:
        response = ("Entendido. Nuestro equipo revisará tu consulta. "
                    "Para soporte urgente escríbenos a hello@focumo.app")

    db.execute("INSERT INTO chat_messages (user_id,role,message) VALUES(?,?,?)",
               (uid, "assistant", response))
    db.commit()
    return jsonify({"response": response})

@app.route("/api/chat/history")
@login_required
def chat_history():
    uid  = session["user_id"]
    rows = get_db().execute(
        "SELECT role,message,created_at FROM chat_messages "
        "WHERE user_id=? ORDER BY created_at DESC LIMIT 20",
        (uid,)
    ).fetchall()
    return jsonify([dict(r) for r in reversed(rows)])


# ══════════════════════════════════════════════════════════════
# LIGAS
# ══════════════════════════════════════════════════════════════

def _asignar_liga(rank: int, total: int) -> str:
    """Asigna liga según posición relativa en el ranking global."""
    if total == 0:
        return "bronce"
    pct = rank / total
    if pct <= 0.05:
        return "diamante"
    if pct <= 0.20:
        return "oro"
    if pct <= 0.50:
        return "plata"
    return "bronce"


@app.route("/leagues")
@login_required
def leagues_page():
    user = get_current_user()
    return render_template("leagues.html", user=user,
                           google_enabled=GOOGLE_ENABLED,
                           is_pro=is_pro(user) if user else False,
                           stripe_public_key=STRIPE_PUBLIC_KEY,
                           paypal_client_id=PAYPAL_CLIENT_ID,
                           coffee_url=COFFEE_URL)


@app.route("/api/leagues")
@login_required
def leagues_data():
    """Ranking global con liga calculada por posición relativa."""
    db   = get_db()
    uid  = session["user_id"]

    rows = db.execute("""
        SELECT u.id, u.name, u.avatar_url, u.plan,
               COALESCE(SUM(CASE WHEN s.tipo='trabajo' THEN 1 ELSE 0 END), 0) AS pomodoros,
               COALESCE(SUM(CASE WHEN s.tipo='trabajo' THEN s.duracion ELSE 0 END), 0) AS minutos
        FROM users u
        LEFT JOIN sessions s ON s.user_id = u.id
        GROUP BY u.id
        ORDER BY pomodoros DESC
    """).fetchall()

    total   = len(rows)
    result  = []
    my_data = None

    for i, r in enumerate(rows):
        liga = _asignar_liga(i + 1, total)
        entry = {
            "rank":      i + 1,
            "user_id":   r["id"],
            "name":      r["name"],
            "avatar_url": r["avatar_url"] or "",
            "plan":      r["plan"],
            "is_pro":    r["plan"] == "pro",
            "pomodoros": r["pomodoros"],
            "minutos":   r["minutos"],
            "liga":      liga,
            "es_yo":     r["id"] == uid,
        }
        result.append(entry)
        if r["id"] == uid:
            my_data = entry

    # Calcula puntos para subir de liga
    if my_data:
        rank = my_data["rank"]
        umbral_oro      = max(1, int(total * 0.20))
        umbral_plata    = max(1, int(total * 0.50))
        liga_actual     = my_data["liga"]
        pts_actuales    = my_data["pomodoros"]

        if liga_actual == "bronce" and rank > umbral_plata:
            usuario_umbral = result[umbral_plata - 1] if umbral_plata <= len(result) else None
            my_data["pts_para_subir"] = max(0, (usuario_umbral["pomodoros"] - pts_actuales + 1)) if usuario_umbral else 0
        elif liga_actual == "plata":
            usuario_umbral = result[umbral_oro - 1] if umbral_oro <= len(result) else None
            my_data["pts_para_subir"] = max(0, (usuario_umbral["pomodoros"] - pts_actuales + 1)) if usuario_umbral else 0
        else:
            my_data["pts_para_subir"] = 0

    return jsonify({"ranking": result[:100], "yo": my_data, "total": total})


# ══════════════════════════════════════════════════════════════
# CHECKOUT / MONETIZACIÓN
# ══════════════════════════════════════════════════════════════

STRIPE_PAYMENT_LINK = os.environ.get("STRIPE_PAYMENT_LINK", "")

@app.route("/checkout")
@login_required
def checkout_page():
    """
    Inicia el flujo de pago PRO.
    Si STRIPE_PAYMENT_LINK está configurado, redirige a Stripe.
    Si no, muestra la página de mock checkout.
    """
    user = get_current_user()
    if is_pro(user):
        return redirect(url_for("app_page"))
    if STRIPE_PAYMENT_LINK:
        return redirect(STRIPE_PAYMENT_LINK)
    return render_template("checkout.html", user=user,
                           google_enabled=GOOGLE_ENABLED,
                           stripe_link=STRIPE_PAYMENT_LINK,
                           stripe_public_key=STRIPE_PUBLIC_KEY,
                           paypal_client_id=PAYPAL_CLIENT_ID)


@app.route("/checkout/mock-success")
@login_required
def checkout_mock_success():
    """
    Simula un pago exitoso en desarrollo/demo.
    Activa PRO permanente para el usuario actual.
    En producción con Stripe real, usar webhook /stripe/webhook.
    """
    uid = session["user_id"]
    db  = get_db()
    db.execute("UPDATE users SET plan='pro', pro_expires_at=NULL WHERE id=?", (uid,))
    db.commit()
    return redirect(url_for("app_page") + "?pro=activated")


@app.route("/stripe/webhook", methods=["POST"])
def stripe_webhook():
    """
    Webhook real de Stripe (para cuando se configure el key de producción).
    Valida la firma y activa plan PRO en DB.
    """
    stripe_secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
    payload       = request.get_data(as_text=True)
    sig_header    = request.headers.get("Stripe-Signature", "")

    if stripe_secret:
        try:
            import hmac, hashlib
            # Stripe usa t=timestamp,v1=signature en el header
            parts = {k: v for k, v in (p.split("=", 1) for p in sig_header.split(","))}
            ts    = parts.get("t", "")
            sig   = parts.get("v1", "")
            expected = hmac.new(
                stripe_secret.encode(), f"{ts}.{payload}".encode(), hashlib.sha256
            ).hexdigest()
            if not hmac.compare_digest(expected, sig):
                return jsonify({"error": "invalid signature"}), 400
        except Exception:
            return jsonify({"error": "webhook error"}), 400

    try:
        event = request.get_json(force=True)
        if event.get("type") == "checkout.session.completed":
            cs    = event["data"]["object"]
            email = cs.get("customer_email") or cs.get("customer_details", {}).get("email")
            if email:
                db = get_db()
                db.execute("UPDATE users SET plan='pro', pro_expires_at=NULL WHERE email=?", (email,))
                db.commit()
    except Exception as e:
        print(f"[webhook] Error: {e}")

    return jsonify({"ok": True})


@app.route("/create-checkout-session", methods=["POST"])
@login_required
def create_checkout_session():
    """
    Crea una sesión de Stripe Checkout real.
    Si STRIPE_SECRET_KEY no está configurado, redirige al mock.
    """
    user = get_current_user()
    if is_pro(user):
        return jsonify({"url": url_for("app_page", _external=True)}), 200

    if not STRIPE_SECRET_KEY or not STRIPE_PRICE_ID:
        return jsonify({"url": url_for("checkout_mock_success", _external=True)}), 200

    try:
        import stripe as stripe_lib
        stripe_lib.api_key = STRIPE_SECRET_KEY
        cs = stripe_lib.checkout.Session.create(
            mode="payment",
            line_items=[{"price": STRIPE_PRICE_ID, "quantity": 1}],
            customer_email=user["email"],
            success_url=url_for("checkout_mock_success", _external=True),
            cancel_url=url_for("checkout_page", _external=True),
            metadata={"user_id": str(user["id"])},
        )
        return jsonify({"url": cs.url}), 200
    except Exception as e:
        print(f"[stripe session] Error: {e}")
        return jsonify({"url": url_for("checkout_mock_success", _external=True)}), 200


@app.route("/paypal/create-order", methods=["POST"])
@login_required
def paypal_create_order():
    """Crea una orden de PayPal. Fallback a mock si no hay credenciales."""
    if not PAYPAL_CLIENT_ID or not PAYPAL_CLIENT_SECRET:
        return jsonify({"order_id": "MOCK-" + secrets.token_hex(8)}), 200
    try:
        import base64
        base_url = ("https://api-m.sandbox.paypal.com"
                    if PAYPAL_MODE == "sandbox" else "https://api-m.paypal.com")
        creds = base64.b64encode(
            f"{PAYPAL_CLIENT_ID}:{PAYPAL_CLIENT_SECRET}".encode()
        ).decode()
        token_r = requests.post(
            f"{base_url}/v1/oauth2/token",
            headers={"Authorization": f"Basic {creds}",
                     "Content-Type": "application/x-www-form-urlencoded"},
            data="grant_type=client_credentials", timeout=10
        )
        access_token = token_r.json()["access_token"]
        order_r = requests.post(
            f"{base_url}/v2/checkout/orders",
            headers={"Authorization": f"Bearer {access_token}",
                     "Content-Type": "application/json"},
            json={
                "intent": "CAPTURE",
                "purchase_units": [{
                    "amount": {"currency_code": "EUR", "value": "4.99"},
                    "description": "Focumo PRO — Acceso de por vida"
                }]
            }, timeout=10
        )
        order = order_r.json()
        return jsonify({"order_id": order["id"]}), 200
    except Exception as e:
        print(f"[paypal create-order] Error: {e}")
        return jsonify({"error": "Error creando orden PayPal"}), 500


@app.route("/paypal/capture", methods=["POST"])
@login_required
def paypal_capture():
    """Captura y verifica un pago de PayPal. Activa PRO."""
    data     = request.get_json() or {}
    order_id = str(data.get("order_id", ""))[:64]
    if not order_id:
        return jsonify({"error": "order_id requerido"}), 400

    uid = session["user_id"]

    if not PAYPAL_CLIENT_SECRET or order_id.startswith("MOCK-"):
        # Dev/demo: activar PRO sin verificación real
        db = get_db()
        db.execute("UPDATE users SET plan='pro', pro_expires_at=NULL WHERE id=?", (uid,))
        db.commit()
        return jsonify({"ok": True}), 200

    try:
        import base64
        base_url = ("https://api-m.sandbox.paypal.com"
                    if PAYPAL_MODE == "sandbox" else "https://api-m.paypal.com")
        creds = base64.b64encode(
            f"{PAYPAL_CLIENT_ID}:{PAYPAL_CLIENT_SECRET}".encode()
        ).decode()
        token_r = requests.post(
            f"{base_url}/v1/oauth2/token",
            headers={"Authorization": f"Basic {creds}",
                     "Content-Type": "application/x-www-form-urlencoded"},
            data="grant_type=client_credentials", timeout=10
        )
        access_token = token_r.json()["access_token"]
        cap_r = requests.post(
            f"{base_url}/v2/checkout/orders/{order_id}/capture",
            headers={"Authorization": f"Bearer {access_token}",
                     "Content-Type": "application/json"},
            timeout=10
        )
        result = cap_r.json()
        if result.get("status") in ("COMPLETED", "APPROVED"):
            db = get_db()
            db.execute("UPDATE users SET plan='pro', pro_expires_at=NULL WHERE id=?", (uid,))
            db.commit()
            return jsonify({"ok": True}), 200
        return jsonify({"error": "Pago no completado", "status": result.get("status")}), 400
    except Exception as e:
        print(f"[paypal capture] Error: {e}")
        return jsonify({"error": "Error procesando pago PayPal"}), 500


# ══════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    init_db()
    print("\n🎯 Focumo v1.0 — http://localhost:5050\n")
    app.run(debug=False, port=5050, host="0.0.0.0")
