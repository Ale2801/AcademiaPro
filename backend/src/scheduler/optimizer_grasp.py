from __future__ import annotations

import random
from typing import Dict, List, Sequence, Tuple

from .optimizer import (
    Constraints,
    CourseInput,
    RoomInput,
    SolveResult,
    TimeslotInput,
    _prioritize_balanced_slots,
    _prioritize_courses_by_teacher_load,
    _solve_partial_greedy,
)


def solve_schedule_grasp(
    courses: List[CourseInput],
    rooms: List[RoomInput],
    timeslots: List[TimeslotInput],
    cons: Constraints,
    iterations: int = 6,
) -> SolveResult:
    """Ejecuta una heurística tipo GRASP complementada con refinamiento local."""

    if not courses or not rooms or not timeslots:
        return _solve_partial_greedy(courses, rooms, timeslots, cons)

    rng = random.Random()
    base_slots = (
        _prioritize_balanced_slots(timeslots, cons)
        if cons.lunch_blocks or cons.jornadas
        else list(timeslots)
    )

    best = _solve_partial_greedy(courses, rooms, base_slots, cons)

    for _ in range(max(1, iterations)):
        course_order = _build_randomized_course_order(courses, rng)
        slot_order = _build_randomized_slot_order(base_slots, rng)
        candidate = _solve_partial_greedy(course_order, rooms, slot_order, cons)
        candidate = _refine_locally(candidate, courses, rooms, slot_order, cons, rng)
        best = _select_better(best, candidate)

    return best


def _build_randomized_course_order(
    courses: Sequence[CourseInput], rng: random.Random, rcl_size: int = 5
) -> List[CourseInput]:
    """Construye el orden de cursos siguiendo un RCL clásico de GRASP."""
    ordered = sorted(
        courses,
        key=lambda c: (
            -(c.weekly_hours),
            c.program_semester_id if c.program_semester_id is not None else -1,
            c.teacher_id if c.teacher_id is not None else -1,
        ),
    )

    remaining = list(ordered)
    solution: List[CourseInput] = []
    while remaining:
        window = min(rcl_size, len(remaining))
        pick_index = rng.randrange(window)
        solution.append(remaining.pop(pick_index))
    return solution


def _build_randomized_slot_order(
    slots: Sequence[TimeslotInput], rng: random.Random
) -> List[TimeslotInput]:
    """Reordena los bloques priorizando diversidad diaria con ruido controlado."""
    slots_by_day: Dict[int, List[TimeslotInput]] = {}
    for slot in slots:
        slots_by_day.setdefault(slot.day, []).append(slot)

    days = list(slots_by_day)
    rng.shuffle(days)

    randomized: List[TimeslotInput] = []
    for day in days:
        day_slots = slots_by_day[day]
        randomized.extend(
            sorted(day_slots, key=lambda s: (s.block + rng.random()))
        )
    return randomized


def _refine_locally(
    result: SolveResult,
    courses: Sequence[CourseInput],
    rooms: Sequence[RoomInput],
    slots: Sequence[TimeslotInput],
    cons: Constraints,
    rng: random.Random,
) -> SolveResult:
    """Aplica pequeñas mejoras locales sobre el resultado recibido."""
    best = result

    prioritized = _prioritize_courses_by_teacher_load(list(courses), result)
    if prioritized:
        refined = _solve_partial_greedy(prioritized, rooms, slots, cons)
        best = _select_better(best, refined)

    if not result.unassigned:
        return best

    reversed_slots = list(reversed(slots))
    refined = _solve_partial_greedy(courses, rooms, reversed_slots, cons)
    best = _select_better(best, refined)

    unassigned_ids = set(result.unassigned.keys())
    if unassigned_ids:
        reordered_courses = sorted(
            courses,
            key=lambda c: (
                c.course_id not in unassigned_ids,
                rng.random(),
            ),
        )
        refined = _solve_partial_greedy(reordered_courses, rooms, slots, cons)
        best = _select_better(best, refined)

    return best


def _select_better(current: SolveResult, challenger: SolveResult) -> SolveResult:
    return challenger if _score(challenger) > _score(current) else current


def _score(result: SolveResult) -> Tuple[int, int, float]:
    return (
        result.performance_metrics.assigned_courses,
        -len(result.unassigned),
        result.performance_metrics.fill_rate,
    )
