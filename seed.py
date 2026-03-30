"""
FOCUMO — Script de Seed (Inyección de Datos de Prueba)
======================================================
Genera usuarios bot y sesiones históricas realistas para
llenar el heatmap, gráficos y ranking desde el día uno.

Uso:
    python3 seed.py                  # 50 usuarios, 12 semanas
    python3 seed.py --usuarios 100   # 100 usuarios
    python3 seed.py --wipe           # limpia bots antes de sembrar
    python3 seed.py --wipe --usuarios 30 --semanas 8
"""

import argparse
import random
import sqlite3
from datetime import date, datetime, timedelta
from pathlib import Path

from werkzeug.security import generate_password_hash

# ── CONFIG ───────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent
DB_PATH  = BASE_DIR / "data" / "focumo.db"

NOMBRES = [
    "Marta G.", "Javi R.", "Lucía P.", "Carlos M.", "Ana S.",
    "Pedro L.", "Elena V.", "Sergio F.", "Isabel C.", "Rubén T.",
    "Nuria A.", "Diego H.", "Carmen B.", "Óscar N.", "Silvia O.",
    "Adrián Q.", "Raquel E.", "Miguel I.", "Laura W.", "Pablo K.",
    "Cristina D.", "Jorge Z.", "Patricia X.", "Álvaro J.", "Beatriz Y.",
    "Iván U.", "Rosa M.", "Fernando G.", "Natalia P.", "Tomás R.",
    "Gloria S.", "Héctor L.", "Verónica V.", "Andrés F.", "Pilar C.",
    "Roberto T.", "Mónica A.", "Guillermo H.", "Teresa B.", "Eduardo N.",
    "Amparo O.", "Rafael Q.", "Dolores E.", "Ignacio I.", "Concepción W.",
    "Manuel K.", "Encarna D.", "Antonio Z.", "Mercedes X.", "Francisco J.",
    "Leire A.", "Unai B.", "Iker C.", "Amaia D.", "Joseba E.",
    "Eneko F.", "Naia G.", "Aritz H.", "Olatz I.", "Mikel J.",
    "Sofía K.", "Hugo L.", "Emma M.", "Lucas N.", "Valeria O.",
    "Martín P.", "Daniela Q.", "Alejandro R.", "Valentina S.", "Mateo T.",
]

CATEGORIAS = [
    "Estudio", "Programación", "Idiomas", "Oposiciones",
    "Trabajo", "Lectura", "Proyectos IA", "Diseño",
]

LIGAS = ["bronce", "bronce", "bronce", "bronce", "plata", "plata", "oro", "diamante"]

PASSWORD_HASH = generate_password_hash("focumo123", method="pbkdf2:sha256")


def _parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--usuarios", type=int, default=50)
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
    """Elimina todos los usuarios cuyo email termina en @focumo.bot"""
    rows = con.execute("SELECT id FROM users WHERE email LIKE '%@focumo.bot'").fetchall()
    ids  = [r["id"] for r in rows]
    if not ids:
        print("  No había bots previos.")
        return
    placeholders = ",".join("?" * len(ids))
    con.execute(f"DELETE FROM sessions WHERE user_id IN ({placeholders})", ids)
    con.execute(f"DELETE FROM medals   WHERE user_id IN ({placeholders})", ids)
    con.execute(f"DELETE FROM users    WHERE id       IN ({placeholders})", ids)
    con.commit()
    print(f"  {len(ids)} bots eliminados.")


def _generar_sesiones(user_id: int, semanas: int, perfil: str) -> list:
    """Genera sesiones con distribución realista según perfil de usuario."""
    sesiones = []
    hoy      = date.today()
    inicio   = hoy - timedelta(weeks=semanas)

    # Parámetros por perfil
    config = {
        "intensivo": {"dias_activos": 0.85, "por_dia": (4, 10)},
        "regular":   {"dias_activos": 0.55, "por_dia": (2, 6)},
        "casual":    {"dias_activos": 0.30, "por_dia": (1, 3)},
    }[perfil]

    delta = (hoy - inicio).days
    for offset in range(delta):
        dia = inicio + timedelta(days=offset)
        # Menos actividad fines de semana
        if dia.weekday() >= 5:
            if random.random() > 0.4:
                continue
        # Probabilidad de actividad según perfil
        if random.random() > config["dias_activos"]:
            continue

        n_sesiones = random.randint(*config["por_dia"])
        for _ in range(n_sesiones):
            hora    = random.randint(8, 22)
            minuto  = random.randint(0, 59)
            duracion = 50 if random.random() < 0.15 else 25
            ts = datetime(dia.year, dia.month, dia.day, hora, minuto)
            sesiones.append({
                "user_id":  user_id,
                "fecha":    ts.isoformat(),
                "tipo":     "trabajo",
                "categoria": random.choice(CATEGORIAS),
                "duracion": duracion,
                "nota":     "",
            })

    return sesiones


def main():
    args = _parse_args()
    con  = _connect()

    print(f"\n🌱 Focumo Seed — {args.usuarios} usuarios, {args.semanas} semanas\n")

    if args.wipe:
        print("🗑  Limpiando bots anteriores…")
        _wipe_bots(con)

    # Verificar cuántos bots ya existen
    ya_existen = con.execute(
        "SELECT COUNT(*) FROM users WHERE email LIKE '%@focumo.bot'"
    ).fetchone()[0]
    if ya_existen > 0 and not args.wipe:
        print(f"⚠  Ya existen {ya_existen} bots. Usa --wipe para limpiar primero.")

    nombres_usados = set()
    usuarios_creados = 0

    for i in range(args.usuarios):
        nombre = random.choice(NOMBRES)
        # Evitar nombres duplicados añadiendo sufijo numérico
        nombre_base = nombre
        sufijo = 2
        while nombre in nombres_usados:
            nombre = f"{nombre_base.split('.')[0]}{sufijo}."
            sufijo += 1
        nombres_usados.add(nombre)

        slug  = nombre.lower().replace(" ", "").replace(".", "")
        email = f"{slug}{i}@focumo.bot"
        liga  = random.choice(LIGAS)
        plan  = "pro" if liga in ("oro", "diamante") else "free"
        perfil = (
            "intensivo" if liga == "diamante" else
            "regular"   if liga in ("oro", "plata") else
            "casual"
        )
        referral = f"bot{i:04d}"

        cols = [r[1] for r in con.execute("PRAGMA table_info(users)").fetchall()]
        try:
            if "referral_code" in cols:
                cur = con.execute(
                    """INSERT INTO users (email, password_hash, name, plan, referral_code)
                       VALUES (?, ?, ?, ?, ?)""",
                    (email, PASSWORD_HASH, nombre, plan, referral)
                )
            else:
                cur = con.execute(
                    """INSERT INTO users (email, password_hash, name, plan)
                       VALUES (?, ?, ?, ?)""",
                    (email, PASSWORD_HASH, nombre, plan)
                )
            uid = cur.lastrowid
        except sqlite3.IntegrityError:
            continue  # email duplicado, saltar

        # Asegurar columna liga si existe
        try:
            con.execute("UPDATE users SET liga=? WHERE id=?", (liga, uid))
        except Exception:
            pass  # columna puede no existir aún

        sesiones = _generar_sesiones(uid, args.semanas, perfil)
        con.executemany(
            """INSERT INTO sessions (user_id, fecha, tipo, categoria, duracion, nota)
               VALUES (:user_id, :fecha, :tipo, :categoria, :duracion, :nota)""",
            sesiones
        )
        usuarios_creados += 1

        if (i + 1) % 10 == 0:
            print(f"  ✓ {i + 1}/{args.usuarios} usuarios creados…")

    con.commit()
    con.close()

    print(f"\n✅ Seed completado: {usuarios_creados} usuarios nuevos con sesiones históricas.")
    print(f"   Ejecuta la app y verifica el ranking en /leagues\n")


if __name__ == "__main__":
    main()
