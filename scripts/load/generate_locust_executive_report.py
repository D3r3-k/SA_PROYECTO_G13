#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import html
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def to_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    text = str(value).strip().replace("%", "").replace(",", "")
    if text == "":
        return default
    try:
        return float(text)
    except ValueError:
        return default


def to_int(value: Any, default: int = 0) -> int:
    return int(round(to_float(value, float(default))))


def get(row: Dict[str, Any], *names: str, default: str = "") -> str:
    for name in names:
        if name in row and str(row[name]).strip() != "":
            return str(row[name]).strip()
    return default


def read_csv(path: str) -> List[Dict[str, str]]:
    if not path or not os.path.exists(path):
        return []
    with open(path, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def endpoint_label(raw_name: str) -> str:
    name = raw_name.lower()
    if "/api/health" in name:
        return "Disponibilidad general del API"
    if "/api/auth/me" in name:
        return "Validación de sesión y protección de rutas"
    if "/api/catalog/search" in name:
        return "Búsqueda de contenido en catálogo"
    if "/api/catalog/[contentid]/download" in name or "/download" in name:
        return "Solicitud de descarga de contenido"
    if "/api/catalog" in name:
        return "Consulta del catálogo de contenido"
    if "/api/recommendations" in name:
        return "Consulta de recomendaciones"
    if "/api/watch-party/rooms" in name:
        return "Creación o validación de salas Watch Party"
    if "aggregated" in name:
        return "Resultado consolidado de la prueba"
    return raw_name.replace("ROUTE CHECK ", "").strip()


def endpoint_purpose(raw_name: str, mode: str) -> str:
    name = raw_name.lower()
    if "/api/health" in name:
        return "Confirma que el backend o gateway está disponible antes y durante la carga."
    if "/api/auth/me" in name:
        return "Valida que las rutas protegidas respondan de forma controlada cuando no hay sesión activa."
    if "/api/catalog/search" in name:
        return "Simula búsquedas frecuentes realizadas por usuarios al explorar contenido."
    if "/api/catalog/[contentid]/download" in name or "/download" in name:
        return "Verifica que la ruta de descarga exista y aplique sus validaciones de seguridad o plan."
    if "/api/catalog" in name:
        return "Mide la respuesta del catálogo, una de las pantallas principales del sistema."
    if "/api/recommendations" in name:
        return "Valida que el servicio de recomendaciones responda sin degradar el sistema."
    if "/api/watch-party/rooms" in name:
        return "Verifica disponibilidad y protección de la creación de Watch Party."
    if mode == "route-check":
        return "Ruta validada como parte de la revisión de disponibilidad y protección del API."
    return "Ruta validada dentro del flujo funcional de carga."


def interpretation(failures: int, requests: int, avg_ms: float, p95_ms: float, max_ms: float) -> str:
    if requests <= 0:
        return "Sin tráfico registrado para esta ruta."
    error_rate = (failures / requests) * 100 if requests else 0
    if failures > 0:
        return f"Revisar: presentó {failures} fallos ({error_rate:.2f}% de error)."
    if p95_ms <= 200:
        return "Estable: la mayoría de respuestas fue rápida y sin fallos."
    if p95_ms <= 500:
        return "Aceptable: responde sin fallos, aunque conviene vigilar tiempos altos."
    return "Lento: no falló, pero el tiempo de respuesta alto requiere revisión."


def badge_class(failures: int, requests: int, p95_ms: float) -> str:
    if requests <= 0:
        return "neutral"
    if failures > 0:
        return "bad"
    if p95_ms <= 200:
        return "good"
    if p95_ms <= 500:
        return "warn"
    return "bad"


def fmt_ms(value: float) -> str:
    return f"{value:.0f} ms"


def fmt_num(value: float) -> str:
    if abs(value - round(value)) < 0.005:
        return str(int(round(value)))
    return f"{value:.2f}"


def find_aggregate(rows: List[Dict[str, str]]) -> Optional[Dict[str, str]]:
    for row in rows:
        if get(row, "Name").lower() == "aggregated":
            return row
    return rows[-1] if rows else None


def build_report(args: argparse.Namespace) -> str:
    rows = read_csv(args.stats)
    failure_rows = read_csv(args.failures)
    aggregate = find_aggregate(rows)

    endpoint_rows = [r for r in rows if get(r, "Name").lower() != "aggregated"]

    total_requests = to_int(get(aggregate or {}, "Request Count"))
    total_failures = to_int(get(aggregate or {}, "Failure Count"))
    avg_ms = to_float(get(aggregate or {}, "Average Response Time"))
    min_ms = to_float(get(aggregate or {}, "Min Response Time"))
    max_ms = to_float(get(aggregate or {}, "Max Response Time"))
    rps = to_float(get(aggregate or {}, "Requests/s"))
    p95_ms = to_float(get(aggregate or {}, "95%", "95%ile"))
    error_rate = (total_failures / total_requests) * 100 if total_requests else 0.0

    successful = total_requests > 0 and total_failures == 0
    status_text = "Prueba exitosa" if successful else "Prueba con observaciones"
    status_class = "good" if successful else "warn"

    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    mode_note = (
        "El modo route-check valida disponibilidad, enrutamiento y protección de rutas. "
        "En rutas protegidas, respuestas como 401/403 pueden ser esperadas y se contabilizan como correctas si el sistema responde de forma controlada."
        if args.mode == "route-check"
        else
        "El modo full-flow valida flujos autenticados con usuarios de prueba reales, incluyendo reglas de plan, perfiles y acciones funcionales."
    )

    rows_html = []
    for row in endpoint_rows:
        raw_name = get(row, "Name")
        method = get(row, "Type")
        req = to_int(get(row, "Request Count"))
        fails = to_int(get(row, "Failure Count"))
        row_avg = to_float(get(row, "Average Response Time"))
        row_p95 = to_float(get(row, "95%", "95%ile"))
        row_max = to_float(get(row, "Max Response Time"))
        row_error = (fails / req) * 100 if req else 0
        label = endpoint_label(raw_name)
        purpose = endpoint_purpose(raw_name, args.mode)
        interp = interpretation(fails, req, row_avg, row_p95, row_max)
        cls = badge_class(fails, req, row_p95)
        rows_html.append(f"""
          <tr>
            <td><strong>{html.escape(label)}</strong><br><span>{html.escape(purpose)}</span></td>
            <td><code>{html.escape(method)} {html.escape(raw_name.replace('ROUTE CHECK ', ''))}</code></td>
            <td class="num">{req}</td>
            <td class="num">{fails}</td>
            <td class="num">{row_error:.2f}%</td>
            <td class="num">{fmt_ms(row_avg)}</td>
            <td class="num">{fmt_ms(row_p95)}</td>
            <td class="num">{fmt_ms(row_max)}</td>
            <td><span class="badge {cls}">{html.escape(interp)}</span></td>
          </tr>
        """)

    if failure_rows:
        failure_table = "".join(
            f"""
            <tr>
              <td><code>{html.escape(get(row, 'Method', 'Type'))} {html.escape(get(row, 'Name'))}</code></td>
              <td>{html.escape(get(row, 'Error'))}</td>
              <td class="num">{html.escape(get(row, 'Occurrences', 'Count', default=''))}</td>
            </tr>
            """
            for row in failure_rows
        )
    else:
        failure_table = """
            <tr>
              <td colspan="3" class="empty">No se registraron fallos en la ejecución.</td>
            </tr>
        """

    conclusion = (
        f"El ambiente {args.environment} respondió correctamente durante la prueba ligera. "
        f"Se procesaron {total_requests} solicitudes con {total_failures} fallos, un tiempo promedio de {fmt_ms(avg_ms)} "
        f"y un percentil 95 de {fmt_ms(p95_ms)}."
        if successful
        else
        f"La prueba generó {total_failures} fallos sobre {total_requests} solicitudes. Se recomienda revisar la tabla de fallos y logs del backend antes de repetir la prueba."
    )

    return f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Reporte ejecutivo Locust - {html.escape(args.environment)}</title>
  <style>
    :root {{ --bg:#f6f7fb; --card:#fff; --text:#172033; --muted:#667085; --line:#e5e7eb; --good:#067647; --good-bg:#ecfdf3; --warn:#b54708; --warn-bg:#fffaeb; --bad:#b42318; --bad-bg:#fef3f2; --neutral:#344054; --neutral-bg:#f2f4f7; }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; font-family:Arial, Helvetica, sans-serif; background:var(--bg); color:var(--text); line-height:1.45; }}
    header {{ background:#111827; color:white; padding:32px 40px; }}
    header h1 {{ margin:0 0 8px; font-size:28px; }}
    header p {{ margin:0; color:#d1d5db; }}
    main {{ padding:28px 40px 44px; max-width:1280px; margin:0 auto; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:16px; margin:22px 0; }}
    .card {{ background:var(--card); border:1px solid var(--line); border-radius:14px; padding:18px; box-shadow:0 1px 2px rgba(16,24,40,.06); }}
    .card .label {{ color:var(--muted); font-size:13px; margin-bottom:6px; }}
    .card .value {{ font-size:26px; font-weight:700; }}
    .section {{ background:var(--card); border:1px solid var(--line); border-radius:14px; padding:22px; margin-top:18px; box-shadow:0 1px 2px rgba(16,24,40,.06); }}
    h2 {{ margin:0 0 12px; font-size:20px; }}
    table {{ width:100%; border-collapse:collapse; margin-top:12px; }}
    th, td {{ padding:12px 10px; border-bottom:1px solid var(--line); vertical-align:top; font-size:13px; }}
    th {{ text-align:left; color:#475467; background:#f9fafb; font-weight:700; }}
    td span {{ color:var(--muted); }}
    code {{ background:#f2f4f7; padding:2px 5px; border-radius:5px; font-size:12px; }}
    .num {{ text-align:right; white-space:nowrap; }}
    .badge {{ display:inline-block; padding:6px 9px; border-radius:999px; font-size:12px; font-weight:700; }}
    .good {{ color:var(--good); background:var(--good-bg); }}
    .warn {{ color:var(--warn); background:var(--warn-bg); }}
    .bad {{ color:var(--bad); background:var(--bad-bg); }}
    .neutral {{ color:var(--neutral); background:var(--neutral-bg); }}
    .empty {{ color:var(--muted); text-align:center; padding:24px; }}
    .note {{ border-left:4px solid #2563eb; background:#eff6ff; padding:14px 16px; border-radius:8px; color:#1e3a8a; }}
    .footer {{ color:var(--muted); font-size:12px; margin-top:20px; }}
  </style>
</head>
<body>
  <header>
    <h1>Reporte ejecutivo de prueba de carga ligera</h1>
    <p>Ambiente: <strong>{html.escape(args.environment)}</strong> · Modo: <strong>{html.escape(args.mode)}</strong> · Generado: {generated_at}</p>
  </header>
  <main>
    <div class="section">
      <h2>Lectura rápida</h2>
      <p><span class="badge {status_class}">{status_text}</span></p>
      <p>{html.escape(conclusion)}</p>
      <div class="note">{html.escape(mode_note)}</div>
    </div>

    <div class="grid">
      <div class="card"><div class="label">Usuarios concurrentes</div><div class="value">{html.escape(str(args.users))}</div></div>
      <div class="card"><div class="label">Duración</div><div class="value">{html.escape(str(args.run_time))}</div></div>
      <div class="card"><div class="label">Solicitudes procesadas</div><div class="value">{total_requests}</div></div>
      <div class="card"><div class="label">Fallos</div><div class="value">{total_failures}</div></div>
      <div class="card"><div class="label">Tasa de error</div><div class="value">{error_rate:.2f}%</div></div>
      <div class="card"><div class="label">Tiempo promedio</div><div class="value">{fmt_ms(avg_ms)}</div></div>
      <div class="card"><div class="label">Percentil 95</div><div class="value">{fmt_ms(p95_ms)}</div></div>
      <div class="card"><div class="label">Máximo observado</div><div class="value">{fmt_ms(max_ms)}</div></div>
    </div>

    <div class="section">
      <h2>Rutas validadas y significado funcional</h2>
      <table>
        <thead>
          <tr>
            <th>Escenario funcional</th>
            <th>Ruta técnica</th>
            <th class="num">Solicitudes</th>
            <th class="num">Fallos</th>
            <th class="num">Error</th>
            <th class="num">Promedio</th>
            <th class="num">P95</th>
            <th class="num">Máximo</th>
            <th>Interpretación</th>
          </tr>
        </thead>
        <tbody>
          {''.join(rows_html)}
        </tbody>
      </table>
    </div>

    <div class="section">
      <h2>Fallos registrados</h2>
      <table>
        <thead>
          <tr>
            <th>Ruta</th>
            <th>Error</th>
            <th class="num">Ocurrencias</th>
          </tr>
        </thead>
        <tbody>
          {failure_table}
        </tbody>
      </table>
    </div>

    <div class="section">
      <h2>Datos de ejecución</h2>
      <p><strong>Host objetivo:</strong> <code>{html.escape(args.target or 'No especificado')}</code></p>
      <p><strong>Usuarios:</strong> {html.escape(str(args.users))} · <strong>Spawn rate:</strong> {html.escape(str(args.spawn_rate))} usuarios/segundo · <strong>Duración:</strong> {html.escape(str(args.run_time))}</p>
      <p class="footer">Este reporte resume los CSV generados por Locust. El HTML oficial de Locust se conserva como evidencia técnica completa.</p>
    </div>
  </main>
</body>
</html>
"""


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate Spanish executive Locust report")
    parser.add_argument("--stats", required=True)
    parser.add_argument("--failures", default="")
    parser.add_argument("--output", required=True)
    parser.add_argument("--environment", default="develop")
    parser.add_argument("--mode", default="route-check")
    parser.add_argument("--users", default="")
    parser.add_argument("--spawn-rate", default="")
    parser.add_argument("--run-time", default="")
    parser.add_argument("--target", default="")
    args = parser.parse_args()

    html_report = build_report(args)
    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        f.write(html_report)
    print(f"Spanish executive Locust report generated at: {args.output}")


if __name__ == "__main__":
    main()
