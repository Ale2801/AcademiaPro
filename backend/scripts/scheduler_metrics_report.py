"""Utility script to measure scheduler metrics and persist them in a text report."""
from __future__ import annotations

import argparse
import statistics
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set

from sqlmodel import Session, select

# Ensure the backend directory (which contains the ``src`` package) is on sys.path
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from src.db import engine  # noqa: E402  pylint: disable=wrong-import-position
from src.models import Course, CourseSchedule, Room, Timeslot  # noqa: E402  pylint: disable=wrong-import-position
from src.scheduler.optimizer import (  # noqa: E402  pylint: disable=wrong-import-position
    Constraints,
    CourseInput,
    RoomInput,
    TimeslotInput,
    solve_schedule,
)


@dataclass(frozen=True)
class SimpleAssignment:
    course_id: int
    room_id: int
    timeslot_id: int


def _build_timeslot_inputs(timeslots: Sequence[Timeslot]) -> List[TimeslotInput]:
    if not timeslots:
        return []
    block_lookup: Dict[int, int] = {}
    slots_by_day: Dict[int, List[Timeslot]] = {}
    for slot in timeslots:
        slots_by_day.setdefault(slot.day_of_week, []).append(slot)
    for day_slots in slots_by_day.values():
        ordered = sorted(day_slots, key=lambda item: (item.start_time, item.end_time, item.id))
        for index, slot in enumerate(ordered):
            if slot.id is None:
                continue
            block_lookup[slot.id] = index

    slot_inputs: List[TimeslotInput] = []
    for slot in timeslots:
        if slot.id is None:
            continue
        start_minutes = slot.start_time.hour * 60 + slot.start_time.minute
        duration_minutes = int((datetime.combine(datetime.today(), slot.end_time) - datetime.combine(datetime.today(), slot.start_time)).total_seconds() // 60)
        block_index = block_lookup.get(slot.id, 0)
        slot_inputs.append(
            TimeslotInput(
                timeslot_id=slot.id,
                day=slot.day_of_week,
                block=block_index,
                start_minutes=start_minutes,
                duration_minutes=max(duration_minutes, 0),
            )
        )
    return slot_inputs


def _build_constraints(
    target_courses: Sequence[Course],
    rooms: Sequence[Room],
    timeslot_inputs: Sequence[TimeslotInput],
    locked_assignments: Sequence[SimpleAssignment],
    locked_course_lookup: Dict[int, Course],
) -> Constraints:
    slot_ids: Set[int] = {slot.timeslot_id for slot in timeslot_inputs if slot.timeslot_id is not None}
    sorted_slots = sorted(slot_ids)

    teacher_lock_map: Dict[int, Set[int]] = {}
    room_lock_map: Dict[int, Set[int]] = {}
    for assignment in locked_assignments:
        locked_course = locked_course_lookup.get(assignment.course_id)
        if locked_course and locked_course.teacher_id is not None:
            teacher_lock_map.setdefault(locked_course.teacher_id, set()).add(assignment.timeslot_id)
        room_lock_map.setdefault(assignment.room_id, set()).add(assignment.timeslot_id)

    teacher_availability: Dict[int, List[int]] = {}
    for course in target_courses:
        teacher_id = course.teacher_id
        if teacher_id is None or teacher_id in teacher_availability:
            continue
        blocked = teacher_lock_map.get(teacher_id, set())
        allowed = [slot_id for slot_id in sorted_slots if slot_id not in blocked]
        if not allowed:
            allowed = list(sorted_slots)
        teacher_availability[teacher_id] = allowed

    if not teacher_availability:
        teacher_availability = {course.teacher_id: list(sorted_slots) for course in target_courses if course.teacher_id is not None}

    teacher_conflicts = {
        teacher_id: sorted(slots)
        for teacher_id, slots in teacher_lock_map.items()
        if slots
    }

    room_allowed: Optional[Dict[int, List[int]]] = None
    if room_lock_map:
        room_allowed = {}
        for room in rooms:
            if room.id is None:
                continue
            blocked = room_lock_map.get(room.id, set())
            allowed_slots = [slot_id for slot_id in sorted_slots if slot_id not in blocked]
            if allowed_slots:
                room_allowed[room.id] = allowed_slots

    return Constraints(
        teacher_availability=teacher_availability,
        room_allowed=room_allowed,
        max_consecutive_blocks=4,
        min_gap_blocks=0,
        min_gap_minutes=15,
        reserve_break_minutes=0,
        teacher_conflicts=teacher_conflicts or None,
        lunch_blocks=None,
        jornadas=[],
        max_daily_hours_per_program=6,
        balance_weight=0.3,
    )


def _to_course_inputs(courses: Sequence[Course]) -> List[CourseInput]:
    items: List[CourseInput] = []
    for course in courses:
        if course.id is None:
            continue
        weekly_hours = course.weekly_hours or 0
        items.append(
            CourseInput(
                course_id=course.id,
                teacher_id=course.teacher_id,
                weekly_hours=weekly_hours,
                program_semester_id=course.program_semester_id,
            )
        )
    return items


def _to_room_inputs(rooms: Sequence[Room]) -> List[RoomInput]:
    items: List[RoomInput] = []
    for room in rooms:
        if room.id is None:
            continue
        items.append(RoomInput(room_id=room.id, capacity=room.capacity or 0))
    return items


def _load_assignments(session: Session, course_ids: Optional[Sequence[int]] = None) -> List[SimpleAssignment]:
    if course_ids is not None and len(course_ids) == 0:
        return []
    stmt = select(CourseSchedule)
    if course_ids is not None:
        stmt = stmt.where(CourseSchedule.course_id.in_(course_ids))
    entries = session.exec(stmt).all()
    return [SimpleAssignment(course_id=item.course_id, room_id=item.room_id, timeslot_id=item.timeslot_id) for item in entries]


def _resolve_course_partition(session: Session, term_option: str) -> tuple[List[Course], List[Course], Optional[str]]:
    all_courses = session.exec(select(Course)).all()
    if not all_courses:
        return [], [], None

    normalized = (term_option or "latest").strip() or "latest"
    keyword = normalized.lower()

    if keyword == "all":
        return all_courses, [], None

    available_terms = sorted({course.term for course in all_courses if course.term})
    if not available_terms:
        return all_courses, [], None

    if keyword == "latest":
        target_term = available_terms[-1]
    else:
        target_term = normalized
        if target_term not in available_terms:
            raise RuntimeError(f"El período '{normalized}' no existe en la base de datos.")

    target_courses = [course for course in all_courses if course.term == target_term]
    locked_courses = [course for course in all_courses if course.term != target_term]
    if not target_courses:
        raise RuntimeError(f"No hay cursos configurados para el período '{target_term}'.")
    return target_courses, locked_courses, target_term


def _count_conflicts(assignments: Iterable[SimpleAssignment], course_lookup: Dict[int, Course]) -> Dict[str, int]:
    teacher_bucket: Dict[tuple[int, int], int] = {}
    room_bucket: Dict[tuple[int, int], int] = {}
    for item in assignments:
        course = course_lookup.get(item.course_id)
        if course and course.teacher_id is not None:
            key = (course.teacher_id, item.timeslot_id)
            teacher_bucket[key] = teacher_bucket.get(key, 0) + 1
        room_key = (item.room_id, item.timeslot_id)
        room_bucket[room_key] = room_bucket.get(room_key, 0) + 1

    def _excess(bucket: Dict[tuple[int, int], int]) -> int:
        total = 0
        for count in bucket.values():
            if count > 1:
                total += count - 1
        return total

    teacher_conflicts = _excess(teacher_bucket)
    room_conflicts = _excess(room_bucket)
    return {
        "teacher": teacher_conflicts,
        "room": room_conflicts,
        "total": teacher_conflicts + room_conflicts,
    }


def _format_duration_stats(durations: Sequence[float]) -> tuple[float, float]:
    if not durations:
        return 0.0, 0.0
    average = sum(durations) / len(durations)
    if len(durations) == 1:
        return average, 0.0
    return average, statistics.stdev(durations)


def _build_report(
    label: str,
    runs: int,
    durations: Sequence[float],
    dataset_stats: Dict[str, Any],
    baseline_conflicts: Dict[str, int],
    final_conflicts: Dict[str, int],
    unassigned_summary: Dict[str, int],
) -> str:
    timestamp = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    avg, std_dev = _format_duration_stats(durations)
    before_total = baseline_conflicts.get("total", 0)
    after_total = final_conflicts.get("total", 0)
    if before_total == 0:
        cr_value = 100.0 if after_total == 0 else 0.0
    else:
        cr_value = max(0.0, min(100.0, ((before_total - after_total) / before_total) * 100))

    duration_samples = ", ".join(f"{value:.3f}" for value in durations) if durations else "n/a"
    locked_count = dataset_stats.get("locked_courses", 0)
    term_label = dataset_stats.get("term_label", "todos")
    lines = [
        "=" * 72,
        f"Reporte de metricas del optimizador - {timestamp}",
        f"Escenario analizado: {label}",
        f"Periodo considerado: {term_label}",
        f"Corridas realizadas: {runs}",
        (
            "Contexto del dataset: "
            f"cursos={dataset_stats['courses']} salas={dataset_stats['rooms']} "
            f"bloques={dataset_stats['timeslots']} cursos_bloqueados={locked_count}"
        ),
        "Descripciones clave:",
        " - Tg (tiempo medio de generacion): promedio en segundos de cada ejecucion. Objetivo sugerido <= 600 s.",
        " - CR (porcentaje de choques resueltos): ((choques iniciales - choques finales) / choques iniciales) * 100.",
        " - Choque docente/sala: asignaciones simultaneas del mismo docente o sala en un bloque.",
        " - Cursos sin asignar: cursos con minutos pendientes luego de optimizar.",
        f"Muestras Tg (s): {duration_samples}",
        f"Tg promedio: {avg:.3f} s",
        f"Tg desviacion estandar: {std_dev:.3f} s",
        f"Choques antes (base manual): total={baseline_conflicts['total']} docentes={baseline_conflicts['teacher']} salas={baseline_conflicts['room']}",
        f"Choques despues (optimizado): total={final_conflicts['total']} docentes={final_conflicts['teacher']} salas={final_conflicts['room']}",
        f"CR real: {cr_value:.2f} %",
        f"Resumen de pendientes: cursos sin asignar={unassigned_summary['courses']} minutos pendientes={unassigned_summary['minutes']}",
        "Generado por backend/scripts/scheduler_metrics_report.py",
        "=" * 72,
    ]
    return "\n".join(lines) + "\n"


def measure_metrics(runs: int, label: str, output_path: Path, term_option: str = "latest") -> Path:
    with Session(engine) as session:
        target_courses, locked_courses, detected_term = _resolve_course_partition(session, term_option)
        if not target_courses:
            raise RuntimeError("No hay cursos disponibles para calcular métricas.")
        courses = target_courses
        rooms = session.exec(select(Room)).all()
        timeslots = session.exec(select(Timeslot)).all()
        course_lookup = {course.id: course for course in courses if course.id is not None}
        timeslot_inputs = _build_timeslot_inputs(timeslots)
        if not timeslot_inputs:
            raise RuntimeError("Timeslot catalog is empty; cannot measure scheduler metrics.")
        course_inputs = _to_course_inputs(courses)
        room_inputs = _to_room_inputs(rooms)
        locked_lookup = {course.id: course for course in locked_courses if course.id is not None}
        target_course_ids = [course.id for course in courses if course.id is not None]
        locked_course_ids = [course.id for course in locked_courses if course.id is not None]
        locked_assignments = _load_assignments(session, locked_course_ids) if locked_course_ids else []
        constraints = _build_constraints(courses, rooms, timeslot_inputs, locked_assignments, locked_lookup)
        baseline_assignments = _load_assignments(session, target_course_ids)

    dataset_stats = {
        "courses": len(course_inputs),
        "rooms": len(room_inputs),
        "timeslots": len(timeslot_inputs),
        "locked_courses": len(locked_course_ids),
        "term_label": detected_term or "todos",
    }
    baseline_conflicts = _count_conflicts(baseline_assignments, course_lookup)

    durations: List[float] = []
    final_conflicts = {"teacher": 0, "room": 0, "total": 0}
    unassigned_summary = {"courses": 0, "minutes": 0}

    for _ in range(runs):
        start = time.perf_counter()
        result = solve_schedule(course_inputs, room_inputs, timeslot_inputs, constraints)
        elapsed = time.perf_counter() - start
        durations.append(elapsed)
        final_assignments = [
            SimpleAssignment(course_id=item.course_id, room_id=item.room_id, timeslot_id=item.timeslot_id)
            for item in result.assignments
        ]
        final_conflicts = _count_conflicts(final_assignments, course_lookup)
        unassigned_summary = {
            "courses": len(result.unassigned),
            "minutes": int(sum(result.unassigned.values())),
        }

    report_text = _build_report(label, runs, durations, dataset_stats, baseline_conflicts, final_conflicts, unassigned_summary)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("a", encoding="utf-8") as handler:
        handler.write(report_text)
    return output_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Measure scheduler metrics and persist them in a text file")
    parser.add_argument("--runs", type=int, default=3, help="Number of optimizer runs to average the Tg metric")
    parser.add_argument("--label", type=str, default="default", help="Label that identifies the dataset or scenario")
    parser.add_argument(
        "--output",
        type=str,
        default=str(BACKEND_DIR / "reports" / "scheduler_metrics.txt"),
        help="Path to the text file where the report will be appended",
    )
    parser.add_argument(
        "--term",
        type=str,
        default="latest",
        help="Período (Course.term) a evaluar. Use 'all' para incluir todos los períodos.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.runs <= 0:
        raise SystemExit("The number of runs must be greater than zero.")
    output_path = Path(args.output).resolve()
    report_file = measure_metrics(runs=args.runs, label=args.label, output_path=output_path, term_option=args.term)
    print(f"Scheduler metrics written to {report_file}")


if __name__ == "__main__":
    main()
