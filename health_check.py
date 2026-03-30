"""
FOCUMO — Health Check & Auto-Healing
=====================================
Vigila el backend. Si detecta fallos, intenta reiniciarlo y
genera un informe para la sesión matutina del CEO.

Ejecutar:  python3 health_check.py
Cron:      */5 * * * * python3 /ruta/focumo/health_check.py
"""

import json
import os
import signal
import subprocess
import sys
import urllib.request
import urllib.error
from datetime import datetime
from pathlib import Path

# ── CONFIGURACIÓN ───────────────────────────────────────────
BASE_DIR     = Path(__file__).parent
LOG_DIR      = BASE_DIR / "logs"
HEALTH_LOG   = LOG_DIR  / "health.log"
REPORT_FILE  = BASE_DIR / "data" / "health_report.json"
APP_URL      = os.environ.get("FOCUMO_URL", "http://localhost:5050")
APP_SCRIPT   = BASE_DIR / "app.py"
PID_FILE     = BASE_DIR / "data" / "focumo.pid"
MAX_INTENTOS = 3

LOG_DIR.mkdir(exist_ok=True)


# ── LOGGING ─────────────────────────────────────────────────

def log(msg: str, nivel: str = "INFO") -> None:
    ts  = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    txt = f"[{ts}] [{nivel}] {msg}"
    print(txt)
    with open(HEALTH_LOG, "a") as f:
        f.write(txt + "\n")


# ── CHECKS ──────────────────────────────────────────────────

def check_http(url: str, timeout: int = 6) -> dict:
    """Hace GET a la URL y devuelve {ok, status, latencia_ms}."""
    inicio = datetime.now()
    try:
        req = urllib.request.Request(url + "/login",
                                     headers={"User-Agent": "FocumoHealthCheck/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            status = resp.status
        ms = int((datetime.now() - inicio).total_seconds() * 1000)
        return {"ok": 200 <= status < 400, "status": status, "ms": ms}
    except urllib.error.HTTPError as e:
        ms = int((datetime.now() - inicio).total_seconds() * 1000)
        return {"ok": False, "status": e.code, "ms": ms, "error": str(e)}
    except Exception as e:
        ms = int((datetime.now() - inicio).total_seconds() * 1000)
        return {"ok": False, "status": 0, "ms": ms, "error": str(e)}


def check_db() -> dict:
    """Verifica que la base de datos SQLite existe y es accesible."""
    db_path = BASE_DIR / "data" / "focumo.db"
    if not db_path.exists():
        return {"ok": False, "error": "DB no encontrada"}
    try:
        import sqlite3
        con = sqlite3.connect(str(db_path))
        con.execute("SELECT COUNT(*) FROM users").fetchone()
        con.close()
        size_kb = db_path.stat().st_size // 1024
        return {"ok": True, "size_kb": size_kb}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def check_disk() -> dict:
    """Espacio libre en disco."""
    import shutil
    stat = shutil.disk_usage(BASE_DIR)
    libre_gb  = (stat.total - stat.used) / (1024**3)
    pct_usado = stat.used / stat.total * 100
    return {
        "ok":       libre_gb > 0.5,
        "libre_gb": round(libre_gb, 2),
        "pct_uso":  round(pct_usado, 1),
    }


# ── AUTO-HEALING ─────────────────────────────────────────────

def get_pid() -> int | None:
    if PID_FILE.exists():
        try:
            return int(PID_FILE.read_text().strip())
        except ValueError:
            return None
    return None

def proceso_vivo(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except (ProcessLookupError, PermissionError):
        return False

def reiniciar_app() -> bool:
    log("Intentando reiniciar Focumo…", "WARN")
    # Matar proceso anterior si existe
    pid = get_pid()
    if pid and proceso_vivo(pid):
        try:
            os.kill(pid, signal.SIGTERM)
            log(f"Proceso {pid} terminado.", "INFO")
        except Exception as e:
            log(f"Error matando proceso {pid}: {e}", "ERROR")

    # Lanzar nuevo proceso
    try:
        proc = subprocess.Popen(
            [sys.executable, str(APP_SCRIPT)],
            cwd=str(BASE_DIR),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        PID_FILE.write_text(str(proc.pid))
        log(f"Focumo relanzado con PID {proc.pid}", "INFO")
        return True
    except Exception as e:
        log(f"No se pudo reiniciar: {e}", "ERROR")
        return False


# ── REPORTE ─────────────────────────────────────────────────

def guardar_reporte(resultado: dict) -> None:
    historial = []
    if REPORT_FILE.exists():
        try:
            historial = json.loads(REPORT_FILE.read_text())
        except Exception:
            historial = []

    historial.append(resultado)
    # Guardar solo los últimos 288 registros (24h a 5min)
    historial = historial[-288:]
    REPORT_FILE.write_text(json.dumps(historial, indent=2))


def notificar_mac(titulo: str, msg: str) -> None:
    try:
        subprocess.run(
            ["osascript", "-e", f'display notification "{msg}" with title "{titulo}"'],
            check=False, timeout=5
        )
    except Exception:
        pass


# ── MAIN ─────────────────────────────────────────────────────

def main() -> None:
    ahora = datetime.now().isoformat()
    log("=== Health Check iniciado ===")

    http  = check_http(APP_URL)
    db    = check_db()
    disco = check_disk()

    todo_ok = http["ok"] and db["ok"] and disco["ok"]

    resultado = {
        "ts":    ahora,
        "ok":    todo_ok,
        "http":  http,
        "db":    db,
        "disco": disco,
    }
    guardar_reporte(resultado)

    if todo_ok:
        log(f"✅ Todo OK — HTTP {http['status']} en {http['ms']}ms | "
            f"DB {db.get('size_kb','?')}KB | Disco {disco['libre_gb']}GB libre")
        return

    # ── Hay fallos ──────────────────────────────────────────
    if not http["ok"]:
        log(f"❌ HTTP fallo: {http.get('error','status '+str(http['status']))}", "ERROR")
        reiniciado = reiniciar_app()
        if reiniciado:
            notificar_mac("⚠️ Focumo", "La app falló y fue reiniciada automáticamente.")
        else:
            notificar_mac("🚨 Focumo CAÍDO", "No se pudo reiniciar. Revisa los logs.")

    if not db["ok"]:
        log(f"❌ DB fallo: {db.get('error','desconocido')}", "ERROR")
        notificar_mac("⚠️ Focumo DB", f"Problema con la base de datos: {db.get('error','')}")

    if not disco["ok"]:
        log(f"⚠️ Disco bajo: {disco['libre_gb']}GB libre ({disco['pct_uso']}% usado)", "WARN")
        notificar_mac("⚠️ Focumo Disco", f"Solo {disco['libre_gb']}GB libres en disco.")

    log(f"Estado final: {'OK' if todo_ok else 'FALLO'}")


if __name__ == "__main__":
    main()
