"""
FOCUMO — Script de Seed Internacional (v2)
==========================================
Genera 100 usuarios bot de múltiples países con sesiones
históricas realistas. Usa Faker para nombres auténticos
por locale y country_code para banderas en el ranking mundial.

Uso:
    python3 seed.py                   # 100 usuarios, 12 semanas
    python3 seed.py --usuarios 50     # 50 usuarios
    python3 seed.py --wipe            # limpia bots antes de sembrar
    python3 seed.py --wipe --usuarios 100 --semanas 16
"""

import argparse
import random
import sqlite3
from datetime import date, datetime, timedelta
from pathlib import Path

from werkzeug.security import generate_password_hash

try:
    from faker import Faker
    _FAKER_OK = True
except ImportError:
    _FAKER_OK = False

# ── CONFIG ───────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent
DB_PATH  = BASE_DIR / "data" / "focumo.db"

# Distribución internacional: (locale_faker, country_code, peso)
LOCALES = [
    ("es_ES", "es", 28),   # España — mercado principal
    ("es_MX", "mx", 14),   # México
    ("en_US", "us", 14),   # Estados Unidos
    ("en_GB", "gb",  8),   # Reino Unido
    ("es_AR", "ar",  6),   # Argentina
    ("pt_BR", "br",  6),   # Brasil
    ("de_DE", "de",  5),   # Alemania
    ("fr_FR", "fr",  5),   # Francia
    ("it_IT", "it",  4),   # Italia
    ("pt_PT", "pt",  4),   # Portugal
    ("es_CO", "co",  3),   # Colombia
    ("en_IN", "in",  3),   # India
]

# Fallback de nombres por país si Faker no está disponible
NOMBRES_FALLBACK = {
    "es": ["Marta G.", "Javi R.", "Lucía P.", "Carlos M.", "Ana S.", "Pedro L.",
           "Elena V.", "Sergio F.", "Isabel C.", "Rubén T.", "Nuria A.", "Diego H.",
           "Carmen B.", "Óscar N.", "Silvia O.", "Adrián Q.", "Raquel E.", "Miguel I.",
           "Laura W.", "Pablo K.", "Cristina D.", "Jorge Z.", "Patricia X.", "Álvaro J."],
    "mx": ["Sofía R.", "Diego M.", "Valentina L.", "Emiliano G.", "Isabella T.",
           "Santiago V.", "Camila F.", "Mateo C.", "Daniela H.", "Sebastián A."],
    "us": ["Tyler W.", "Ashley B.", "Brandon K.", "Megan H.", "Cody M.", "Brittany F.",
           "Kyle J.", "Kayla R.", "Josh L.", "Nicole T.", "Ryan S.", "Amanda C."],
    "gb": ["Oliver S.", "Emma W.", "Jack B.", "Sophie T.", "Harry M.", "Olivia J.",
           "George F.", "Lily C.", "Charlie H.", "Grace R."],
    "ar": ["Tomás B.", "Valentina C.", "Facundo M.", "Luciana G.", "Nicolás R.",
           "Agustina F.", "Leandro V.", "Florencia A."],
    "br": ["Gabriel S.", "Julia M.", "Lucas F.", "Ana C.", "Pedro R.", "Maria T.",
           "Rafael B.", "Beatriz G."],
    "de": ["Lukas M.", "Hannah S.", "Tim W.", "Laura K.", "Felix B.", "Sarah J."],
    "fr": ["Hugo D.", "Chloé M.", "Lucas B.", "Emma G.", "Maxime F.", "Camille R."],
    "it": ["Lorenzo R.", "Giulia M.", "Marco B.", "Sofia G.", "Luca F.", "Martina C."],
    "pt": ["João S.", "Maria A.", "Pedro F.", "Ana C.", "Tiago M.", "Beatriz R."],
    "co": ["Juan D.", "Valentina M.", "Santiago R.", "Daniela G."],
    "in": ["Arjun S.", "Priya M.", "Rohit K.", "Ananya G.", "Vikram T.", "Neha R."],
}

CATEGORIAS = [
    "Estudio", "Programación", "Idiomas", "Oposiciones",
    "Trabajo", "Lectura", "Proyectos IA", "Diseño",
]

LIGAS = ["bronce", "bronce", "bronce", "bronce", "plata", "plata", "oro", "diamante"]

PASSWORD_HASH = generate_password_hash("focumo123", method="pbkdf2:sha256")

# Instancias de Faker por locale (lazy, solo si Faker está instalado)
_fakers: dict = {}


def _get_faker(locale: str):
    if not _FAKER_OK:
        return None
    if locale not in _fakers:
        _fakers[locale] = Faker(locale)
        Faker.seed(42 + len(_fakers))
    return _fakers[locale]


def _nombre_para(locale: str, country_code: str, idx: int) -> str:
    """Genera un nombre realista según el locale."""
    fk = _get_faker(locale)
    if fk:
        try:
            return fk.name()
        except Exception:
            pass
    # fallback
    nombres = NOMBRES_FALLBACK.get(country_code, NOMBRES_FALLBACK["es"])
    return nombres[idx % len(nombres)]


def _parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--usuarios", type=int, default=100)
    p.add_argument("--semanas",  type=int, default=12)
    p.add_argument("--wipe",     action="store_true")
    return p.parse_args()


def _connect() -> sqlite3.Connection:
    if not DB_PATH.exists():
        print(f"[ERROR] DB no encontrada en {DB_PATH}. Arranca la app al menos una vez primero.")
        raise SystemExit(1)
    con = sqlite3.connect(str(DB_PATH))
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


def _wipe_bots(con: sqlite3.Connection) -> None:
    rows = con.execute("SELECT id FROM users WHERE email LIKE '%@focumo.bot'").fetchall()
    ids  = [r["id"] for r in rows]
    if not ids:
        print("  No habia bots previos.")
        return
    placeholders = ",".join("?" * len(ids))
    con.execute(f"DELETE FROM sessions WHERE user_id IN ({placeholders})", ids)
    con.execute(f"DELETE FROM medals   WHERE user_id IN ({placeholders})", ids)
    con.execute(f"DELETE FROM users    WHERE id       IN ({placeholders})", ids)
    con.commit()
    print(f"  {len(ids)} bots eliminados.")


def _generar_sesiones(user_id: int, semanas: int, perfil: str) -> list:
    sesiones = []
    hoy      = date.today()
    inicio   = hoy - timedelta(weeks=semanas)

    config = {
        "intensivo": {"dias_activos": 0.85, "por_dia": (4, 10)},
        "regular":   {"dias_activos": 0.55, "por_dia": (2, 6)},
        "casual":    {"dias_activos": 0.30, "por_dia": (1, 3)},
    }[perfil]

    delta = (hoy - inicio).days
    for offset in range(delta):
        dia = inicio + timedelta(days=offset)
        if dia.weekday() >= 5 and random.random() > 0.4:
            continue
        if random.random() > config["dias_activos"]:
            continue
        for _ in range(random.randint(*config["por_dia"])):
            hora    = random.randint(8, 22)
            minuto  = random.randint(0, 59)
            duracion = 50 if random.random() < 0.15 else 25
            ts = datetime(dia.year, dia.month, dia.day, hora, minuto)
            sesiones.append({
                "user_id":   user_id,
                "fecha":     ts.isoformat(),
                "tipo":      "trabajo",
                "categoria": random.choice(CATEGORIAS),
                "duracion":  duracion,
                "nota":      "",
            })
    return sesiones


def _build_locale_pool(n_usuarios: int) -> list:
    """Crea una lista de (locale, country_code) con la distribución definida."""
    pool = []
    for locale, cc, peso in LOCALES:
        count = max(1, round(n_usuarios * peso / 100))
        pool.extend([(locale, cc)] * count)
    random.shuffle(pool)
    # Truncar o rellenar hasta n_usuarios exacto
    while len(pool) < n_usuarios:
        pool.append(random.choice([(l, c) for l, c, _ in LOCALES]))
    return pool[:n_usuarios]


def main():
    args = _parse_args()
    con  = _connect()

    mode = "Faker" if _FAKER_OK else "fallback (instala faker>=20)"
    print(f"\nFocumo Seed Internacional v2 — {args.usuarios} usuarios, {args.semanas} semanas [{mode}]\n")

    if args.wipe:
        print("Limpiando bots anteriores...")
        _wipe_bots(con)

    ya_existen = con.execute(
        "SELECT COUNT(*) FROM users WHERE email LIKE '%@focumo.bot'"
    ).fetchone()[0]
    if ya_existen > 0 and not args.wipe:
        print(f"AVISO: Ya existen {ya_existen} bots. Usa --wipe para limpiar primero.")

    # Verificar columna country_code
    cols = [r[1] for r in con.execute("PRAGMA table_info(users)").fetchall()]
    has_country  = "country_code" in cols
    has_referral = "referral_code" in cols

    pool = _build_locale_pool(args.usuarios)
    locale_idx: dict = {}   # para variar nombres por locale
    usuarios_creados = 0

    for i, (locale, cc) in enumerate(pool):
        liga   = random.choice(LIGAS)
        plan   = "pro" if liga in ("oro", "diamante") else "free"
        perfil = (
            "intensivo" if liga == "diamante" else
            "regular"   if liga in ("oro", "plata") else
            "casual"
        )
        idx = locale_idx.get(locale, 0)
        locale_idx[locale] = idx + 1
        nombre = _nombre_para(locale, cc, idx)

        slug  = "".join(c for c in nombre.lower() if c.isalnum())[:16]
        email = f"{slug}{i}@focumo.bot"

        try:
            if has_country and has_referral:
                cur = con.execute(
                    """INSERT INTO users (email, password_hash, name, plan, referral_code, country_code)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (email, PASSWORD_HASH, nombre, plan, f"bot{i:04d}", cc)
                )
            elif has_country:
                cur = con.execute(
                    """INSERT INTO users (email, password_hash, name, plan, country_code)
                       VALUES (?, ?, ?, ?, ?)""",
                    (email, PASSWORD_HASH, nombre, plan, cc)
                )
            elif has_referral:
                cur = con.execute(
                    """INSERT INTO users (email, password_hash, name, plan, referral_code)
                       VALUES (?, ?, ?, ?, ?)""",
                    (email, PASSWORD_HASH, nombre, plan, f"bot{i:04d}")
                )
            else:
                cur = con.execute(
                    """INSERT INTO users (email, password_hash, name, plan)
                       VALUES (?, ?, ?, ?)""",
                    (email, PASSWORD_HASH, nombre, plan)
                )
            uid = cur.lastrowid
        except sqlite3.IntegrityError:
            continue

        try:
            con.execute("UPDATE users SET liga=? WHERE id=?", (liga, uid))
        except Exception:
            pass

        sesiones = _generar_sesiones(uid, args.semanas, perfil)
        con.executemany(
            """INSERT INTO sessions (user_id, fecha, tipo, categoria, duracion, nota)
               VALUES (:user_id, :fecha, :tipo, :categoria, :duracion, :nota)""",
            sesiones
        )
        usuarios_creados += 1
        if (i + 1) % 20 == 0:
            print(f"  {i + 1}/{args.usuarios} usuarios ({cc.upper()})...")

    con.commit()
    con.close()

    print(f"\nSeed completado: {usuarios_creados} usuarios internacionales con sesiones.")
    print(f"Paises: {', '.join(sorted(set(cc for _, cc in pool[:usuarios_creados])))}")
    print(f"Verifica el Ranking Mundial en la app.\n")


if __name__ == "__main__":
    main()
