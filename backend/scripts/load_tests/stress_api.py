#!/usr/bin/env python3
"""Pequeño generador de carga para cualquier endpoint HTTP del backend."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, Optional

import httpx

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.append(str(SCRIPT_DIR))

from utils import Metrics, distribute_work  # noqa: E402


VALID_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Stress test genérico contra la API de FastAPI.")
    parser.add_argument("--base-url", default=os.getenv("API_BASE_URL", "http://localhost:8000"), help="URL base cuando --endpoint es relativo")
    parser.add_argument("--endpoint", default="/", help="Ruta absoluta o relativa del endpoint")
    parser.add_argument("--method", default="GET", help="Método HTTP a usar (GET, POST, PUT, PATCH, DELETE)")
    parser.add_argument("--token", default=os.getenv("API_BEARER_TOKEN"), help="JWT opcional para Authorization: Bearer ...")
    parser.add_argument("--requests", type=int, default=200, help="Número total de solicitudes")
    parser.add_argument("--concurrency", type=int, default=20, help="Número de trabajadores concurrentes")
    parser.add_argument("--timeout", type=float, default=30.0, help="Timeout por solicitud en segundos")
    parser.add_argument("--body", help="JSON inline a enviar en el cuerpo")
    parser.add_argument("--body-file", help="Ruta a archivo JSON con el cuerpo")
    parser.add_argument("--param", action="append", default=[], help="Parámetros de query key=value (se puede repetir)")
    parser.add_argument("--header", action="append", default=[], help="Encabezados adicionales key=value (se puede repetir)")
    parser.add_argument("--print-errors", action="store_true", help="Muestra hasta 5 errores distintos al final")
    args = parser.parse_args()

    args.method = args.method.upper()
    if args.method not in VALID_METHODS:
        parser.error(f"Método no soportado: {args.method}")
    if args.requests < 1 or args.concurrency < 1:
        parser.error("requests y concurrency deben ser mayores que cero")
    return args


def build_key_value_map(items: Optional[list[str]]) -> Dict[str, str]:
    result: Dict[str, str] = {}
    if not items:
        return result
    for raw in items:
        if "=" not in raw:
            raise ValueError(f"Par inválido (usa clave=valor): {raw}")
        key, value = raw.split("=", 1)
        result[key.strip()] = value.strip()
    return result


def load_body(args: argparse.Namespace) -> Any:
    if args.body_file:
        with open(args.body_file, "r", encoding="utf-8") as handle:
            return json.load(handle)
    if args.body:
        return json.loads(args.body)
    return None


async def worker(
    name: int,
    iterations: int,
    client: httpx.AsyncClient,
    url: str,
    method: str,
    headers: Dict[str, str],
    params: Dict[str, str],
    body: Any,
    timeout: float,
    metrics: Metrics,
) -> None:
    if iterations <= 0:
        return
    for _ in range(iterations):
        start = time.perf_counter()
        status: int | None = None
        message: str | None = None
        try:
            response = await client.request(
                method,
                url,
                headers=headers,
                params=params,
                json=body,
                timeout=timeout,
            )
            status = response.status_code
            if response.is_success:
                await metrics.record(time.perf_counter() - start, True, status, None)
            else:
                message = response.text
                await metrics.record(time.perf_counter() - start, False, status, message)
        except Exception as exc:  # noqa: BLE001
            message = str(exc)
            await metrics.record(time.perf_counter() - start, False, status, message)


async def run_load(args: argparse.Namespace) -> None:
    params = build_key_value_map(args.param)
    extra_headers = build_key_value_map(args.header)
    body = load_body(args)

    headers: Dict[str, str] = {}
    if args.token:
        headers["Authorization"] = f"Bearer {args.token}"
    if body is not None and "Content-Type" not in extra_headers:
        headers["Content-Type"] = "application/json"
    headers.update(extra_headers)

    target_url = args.endpoint if args.endpoint.lower().startswith("http") else f"{args.base_url}{args.endpoint}"
    limits = httpx.Limits(max_connections=args.concurrency * 2, max_keepalive_connections=args.concurrency * 2)

    async with httpx.AsyncClient(limits=limits, timeout=args.timeout) as client:
        metrics = Metrics()
        distribution = distribute_work(args.requests, args.concurrency)
        tasks = []
        for idx, iterations in enumerate(distribution):
            if iterations <= 0:
                continue
            tasks.append(
                worker(idx + 1, iterations, client, target_url, args.method, headers, params, body, args.timeout, metrics)
            )
        await asyncio.gather(*tasks)

    summary = metrics.summary()
    print("\nResumen carga genérica:")
    print(f"  Endpoint: {target_url} [{args.method}]")
    print(f"  Total solicitudes: {summary['total']}")
    print(f"  Éxitos: {summary['success']}")
    print(f"  Fallas: {summary['failures']}")
    if summary["success"]:
        print(
            "  Latencias -- Promedio: {avg:.2f} ms | P50: {p50:.2f} ms | P95: {p95:.2f} ms | Máx: {maxv:.2f} ms".format(
                avg=summary["avg_ms"],
                p50=summary["p50_ms"],
                p95=summary["p95_ms"],
                maxv=summary["max_ms"],
            )
        )
    if summary["failure_breakdown"]:
        print("  Fallas por código:")
        for code, count in summary["failure_breakdown"].items():
            print(f"    {code}: {count}")
    if args.print_errors and summary["failures"]:
        print("  Últimos errores registrados:")
        for line in metrics.failure_messages[-5:]:
            print(f"    {line}")


def main() -> None:
    args = parse_args()
    asyncio.run(run_load(args))


if __name__ == "__main__":
    main()
