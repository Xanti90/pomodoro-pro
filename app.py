"""
POMODORO PRO — Backend Flask
Autor: Santiago Jiménez
"""

import json
import subprocess
from pathlib import Path
from datetime import datetime, date
from typing import Any, Dict, List
from flask import Flask, render_template, jsonify, request

app = Flask(__name__)

DATA_FILE = Path(__file__).parent / "data" / "sessions.json"
DATA_FILE.parent.mkdir(exist_ok=True)


# ─────────────────────────────────────────────────────────────
# PERSISTENCIA
# ─────────────────────────────────────────────────────────────

def cargar_sesiones() -> List[Dict[str, Any]]:
    if DATA_FILE.exists():
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def guardar_sesiones(sesiones: List[Dict[str, Any]]) -> None:
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(sesiones, f, ensure_ascii=False, indent=2)


# ─────────────────────────────────────────────────────────────
# NOTIFICACIONES macOS
# ─────────────────────────────────────────────────────────────

def notificar(titulo: str, mensaje: str) -> None:
    script = f'display notification "{mensaje}" with title "{titulo}" sound name "Glass"'
    try:
        subprocess.run(["osascript", "-e", script], check=False, timeout=5)
    except Exception:
        pass


# ─────────────────────────────────────────────────────────────
# ESTADÍSTICAS
# ─────────────────────────────────────────────────────────────

def calcular_stats(sesiones: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not sesiones:
        return {
            "total_pomodoros": 0,
            "total_minutos": 0,
            "por_categoria": {},
            "por_dia": {},
            "racha": 0,
            "hoy": 0,
            "semana": 0,
        }

    total_pomodoros = sum(1 for s in sesiones if s.get("tipo") == "trabajo")
    total_minutos   = sum(s.get("duracion", 0) for s in sesiones if s.get("tipo") == "trabajo")

    por_categoria: Dict[str, int] = {}
    for s in sesiones:
        if s.get("tipo") == "trabajo":
            cat = s.get("categoria", "Sin categoría")
            por_categoria[cat] = por_categoria.get(cat, 0) + s.get("duracion", 0)

    por_dia: Dict[str, int] = {}
    for s in sesiones:
        if s.get("tipo") == "trabajo":
            dia = s.get("fecha", "")[:10]
            if dia:
                por_dia[dia] = por_dia.get(dia, 0) + 1

    hoy_str  = date.today().isoformat()
    hoy      = por_dia.get(hoy_str, 0)
    semana   = sum(v for k, v in por_dia.items() if k >= hoy_str[:8] + "01")

    dias_ordenados = sorted(por_dia.keys(), reverse=True)
    racha = 0
    check = date.today()
    for dia in dias_ordenados:
        if dia == check.isoformat():
            racha += 1
            check = date.fromordinal(check.toordinal() - 1)
        else:
            break

    ultimos_7 = {}
    from datetime import timedelta
    for i in range(6, -1, -1):
        d = (date.today() - timedelta(days=i)).isoformat()
        ultimos_7[d] = por_dia.get(d, 0)

    return {
        "total_pomodoros": total_pomodoros,
        "total_minutos":   total_minutos,
        "por_categoria":   por_categoria,
        "por_dia":         ultimos_7,
        "racha":           racha,
        "hoy":             hoy,
        "semana":          semana,
    }


# ─────────────────────────────────────────────────────────────
# RUTAS
# ─────────────────────────────────────────────────────────────

@app.route("/")
def index() -> Any:
    return render_template("index.html")


@app.route("/api/sessions", methods=["GET"])
def get_sessions() -> Any:
    sesiones = cargar_sesiones()
    return jsonify(sesiones[-50:])  # Últimas 50


@app.route("/api/sessions", methods=["POST"])
def save_session() -> Any:
    data = request.get_json()
    if not data:
        return jsonify({"error": "Sin datos"}), 400
    sesiones = cargar_sesiones()
    sesiones.append({
        "id":        len(sesiones) + 1,
        "fecha":     datetime.now().isoformat(),
        "tipo":      data.get("tipo", "trabajo"),
        "categoria": data.get("categoria", "General"),
        "duracion":  data.get("duracion", 25),
        "nota":      data.get("nota", ""),
    })
    guardar_sesiones(sesiones)
    return jsonify({"ok": True})


@app.route("/api/notify", methods=["POST"])
def notify() -> Any:
    data = request.get_json() or {}
    notificar(data.get("titulo", "Pomodoro"), data.get("mensaje", ""))
    return jsonify({"ok": True})


@app.route("/api/stats", methods=["GET"])
def stats() -> Any:
    sesiones = cargar_sesiones()
    return jsonify(calcular_stats(sesiones))


if __name__ == "__main__":
    print("\n🍅 Pomodoro Pro arrancando...")
    print("   Abre tu navegador en: http://localhost:5050\n")
    app.run(debug=False, port=5050)
