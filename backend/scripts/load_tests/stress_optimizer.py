#!/usr/bin/env python3
"""Ejecutor simple de carga para /schedule/optimize."""

from __future__ import annotations

import argparse
import asyncio
import os
import random
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Sequence

import httpx

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.append(str(SCRIPT_DIR))

from utils import Metrics, distribute_work  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Envía muchas solicitudes contra /schedule/optimize para medir latencia y throughput.",
    )
    parser.add_argument("--base-url", default=os.getenv("API_BASE_URL", "http://localhost:8000"), help="URL base del backend")
    parser.add_argument("--token", default=os.getenv("API_BEARER_TOKEN"), help="JWT con rol admin/coordinator")
    parser.add_argument("--requests", type=int, default=60, help="Número total de solicitudes a enviar")
    parser.add_argument("--concurrency", type=int, default=6, help="Trabajadores concurrentes")
    parser.add_argument("--courses-per-request", type=int, default=5, help="Cursos en cada payload")
    parser.add_argument("--rooms-per-request", type=int, default=3, help="Salas en cada payload")
    parser.add_argument("--timeslots-per-request", type=int, default=5, help="Bloques horarios en cada payload")
    parser.add_argument(
        "--program-semester-id",
        type=int,
        default=None,
        help="Filtra los cursos disponibles para el payload",
    )
    parser.add_argument("--timeout", type=float, default=60.0, help="Timeout por petición (segundos)")
    args = parser.parse_args()
    if not args.token:
        parser.error("Debes proveer --token o definir API_BEARER_TOKEN en el entorno")
    if args.requests < 1 or args.concurrency < 1:
        parser.error("requests y concurrency deben ser mayores que cero")
    return args


async def fetch_collection(
    client: httpx.AsyncClient,
    base_url: str,
    path: str,
    headers: Dict[str, str],
    params: Dict[str, Any] | None = None,
) -> List[Dict[str, Any]]:
    response = await client.get(f"{base_url}{path}", headers=headers, params=params, timeout=30.0)
    response.raise_for_status()
    data = response.json()
    if not isinstance(data, list):
        raise RuntimeError(f"Respuesta inesperada en {path}: se esperaba lista, llegó {type(data)}")
    return data


def build_optimizer_payload(
    courses: Sequence[Dict[str, Any]],
    rooms: Sequence[Dict[str, Any]],
    slots: Sequence[Dict[str, Any]],
    courses_per_request: int,
    rooms_per_request: int,
    timeslots_per_request: int,
) -> Dict[str, Any]:
    if not courses or not rooms or not slots:
        raise RuntimeError("Debe haber al menos un curso, sala y bloque horario para armar el payload")

    selected_courses = random.sample(courses, min(courses_per_request, len(courses)))
    selected_rooms = random.sample(rooms, min(rooms_per_request, len(rooms)))
    selected_slots = random.sample(slots, min(timeslots_per_request, len(slots)))

    courses_payload = [
        {
            "course_id": course["id"],
            "teacher_id": course["teacher_id"],
            "weekly_hours": course.get("weekly_hours") or 3,
            "program_semester_id": course.get("program_semester_id"),
        }
        for course in selected_courses
    ]

    rooms_payload = [
        {
            "room_id": room["id"],
            "capacity": room.get("capacity") or 30,
        }
        for room in selected_rooms
    ]

    slots_payload = []
    for idx, slot in enumerate(selected_slots, start=1):
        slot_id = slot["id"]
        day = slot.get("day_of_week", (idx - 1) % 5)
        slots_payload.append({
            "timeslot_id": slot_id,
            "day": day,
            "block": idx,
        })

    allowed_timeslot_ids = [slot["timeslot_id"] for slot in slots_payload]
    teacher_availability: Dict[int, List[int]] = {}
    for course in courses_payload:
        teacher_id = course["teacher_id"]
        teacher_availability.setdefault(teacher_id, allowed_timeslot_ids)

    payload = {
        "courses": courses_payload,
        "rooms": rooms_payload,
        "timeslots": slots_payload,
        "constraints": {
            "teacher_availability": teacher_availability,
            "max_consecutive_blocks": 4,
            "min_gap_blocks": 0,
            "min_gap_minutes": 15,
            "reserve_break_minutes": 0,
            "teacher_conflicts": {},
            "lunch_blocks": None,
            "max_daily_hours_per_program": 6,
            "balance_weight": 0.3,
        },
    }
    return payload


async def worker(
    name: int,
    iterations: int,
    client: httpx.AsyncClient,
    args: argparse.Namespace,
    courses: Sequence[Dict[str, Any]],
    rooms: Sequence[Dict[str, Any]],
    slots: Sequence[Dict[str, Any]],
    metrics: Metrics,
    headers: Dict[str, str],
) -> None:
    if iterations <= 0:
        return
    for _ in range(iterations):
        payload = build_optimizer_payload(
            courses,
            rooms,
            slots,
            args.courses_per_request,
            args.rooms_per_request,
            args.timeslots_per_request,
        )
        start = time.perf_counter()
        status: int | None = None
        message: str | None = None
        try:
            response = await client.post(
                f"{args.base_url}/schedule/optimize",
                headers=headers,
                json=payload,
                timeout=args.timeout,
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
    headers = {
        "Authorization": f"Bearer {args.token}",
        "Content-Type": "application/json",
    }
    limits = httpx.Limits(max_connections=args.concurrency * 2, max_keepalive_connections=args.concurrency * 2)
    async with httpx.AsyncClient(limits=limits, timeout=args.timeout) as client:
        courses = await fetch_collection(
            client,
            args.base_url,
            "/courses/",
            headers,
            params={"program_semester_id": args.program_semester_id} if args.program_semester_id else None,
        )
        rooms = await fetch_collection(client, args.base_url, "/rooms/", headers)
        slots = await fetch_collection(client, args.base_url, "/timeslots/", headers)

        print(
            f"Datos cargados: {len(courses)} cursos, {len(rooms)} salas, {len(slots)} bloques. Iniciando stress test...",
        )

        metrics = Metrics()
        distribution = distribute_work(args.requests, args.concurrency)
        workers = []
        for idx, iterations in enumerate(distribution):
            if iterations <= 0:
                continue
            workers.append(
                worker(idx + 1, iterations, client, args, courses, rooms, slots, metrics, headers)
            )
        await asyncio.gather(*workers)

    summary = metrics.summary()
    print("\nResumen carga optimizador:")
    print(f"  Total solicitudes: {summary['total']}")
    print(f"  Éxitos: {summary['success']}")
    print(f"  Fallas: {summary['failures']}")
    if summary['success']:
        print(f"  Latencia promedio: {summary['avg_ms']:.2f} ms")
        print(f"  P50: {summary['p50_ms']:.2f} ms | P95: {summary['p95_ms']:.2f} ms | Máx: {summary['max_ms']:.2f} ms")
    if summary["failure_breakdown"]:
        print("  Fallas por código:")
        for code, count in summary["failure_breakdown"].items():
            print(f"    {code}: {count}")


def main() -> None:
    args = parse_args()
    asyncio.run(run_load(args))


if __name__ == "__main__":
    main()
