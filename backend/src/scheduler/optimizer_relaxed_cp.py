from __future__ import annotations

from collections import Counter, defaultdict
from copy import deepcopy
from dataclasses import replace
from typing import Dict, List, Sequence, Tuple

from .optimizer import (
    AssignmentResult,
    Constraints,
    CourseInput,
    OptimizationDiagnostics,
    PerformanceMetrics,
    RoomInput,
    ScheduleQualityMetrics,
    SolveResult,
    TimeslotInput,
    _calculate_balance_score,
    _count_daily_overloads,
    _solve_partial_greedy,
)


def solve_schedule_relaxed_cp(
    courses: List[CourseInput],
    rooms: List[RoomInput],
    timeslots: List[TimeslotInput],
    cons: Constraints,
) -> SolveResult:
    """Aplica un flujo de relajación + reparación + intento CP-SAT opcional."""

    relaxed_cons = _build_relaxed_constraints(cons)
    relaxed_result = _solve_partial_greedy(courses, rooms, timeslots, relaxed_cons)

    repaired_result = _repair_with_original_constraints(
        relaxed_result, courses, rooms, timeslots, cons
    )

    improved_result = _run_cp_sat_pass(
        repaired_result, courses, rooms, timeslots, cons
    )

    def _score(result: SolveResult) -> Tuple[int, int, float]:
        return (
            result.performance_metrics.assigned_courses,
            -len(result.unassigned),
            result.performance_metrics.fill_rate,
        )

    return max([relaxed_result, repaired_result, improved_result], key=_score)


def _build_relaxed_constraints(cons: Constraints) -> Constraints:
    """Genera una copia de las restricciones con parámetros suavizados."""

    return replace(
        cons,
        max_consecutive_blocks=(cons.max_consecutive_blocks + 1)
        if cons.max_consecutive_blocks
        else cons.max_consecutive_blocks,
        min_gap_minutes=max(0, cons.min_gap_minutes - 10),
        reserve_break_minutes=max(0, cons.reserve_break_minutes // 2),
        max_daily_hours_per_program=cons.max_daily_hours_per_program + 2,
        balance_weight=cons.balance_weight * 0.5,
    )


def _repair_with_original_constraints(
    relaxed_result: SolveResult,
    courses: Sequence[CourseInput],
    rooms: Sequence[RoomInput],
    timeslots: Sequence[TimeslotInput],
    cons: Constraints,
) -> SolveResult:
    if not relaxed_result.assignments:
        return _solve_partial_greedy(list(courses), list(rooms), list(timeslots), cons)

    assigned_minutes = Counter()
    slot_order: List[int] = []
    for assignment in relaxed_result.assignments:
        assigned_minutes[assignment.course_id] += assignment.duration_minutes
        slot_order.append(assignment.timeslot_id)

    prioritized_courses = sorted(
        courses,
        key=lambda course: (
            -assigned_minutes.get(course.course_id, 0),
            course.course_id,
        ),
    )

    slot_priority = _order_slots(timeslots, slot_order)
    return _solve_partial_greedy(prioritized_courses, rooms, slot_priority, cons)


def _order_slots(
    timeslots: Sequence[TimeslotInput], usage_order: Sequence[int]
) -> List[TimeslotInput]:
    position: Dict[int, int] = {}
    for idx, slot_id in enumerate(usage_order):
        position.setdefault(slot_id, idx)

    default_rank = len(usage_order) + 1
    return sorted(
        timeslots,
        key=lambda slot: (
            position.get(slot.timeslot_id, default_rank),
            slot.day,
            slot.block,
        ),
    )


def _run_cp_sat_pass(
    base_result: SolveResult,
    courses: Sequence[CourseInput],
    rooms: Sequence[RoomInput],
    timeslots: Sequence[TimeslotInput],
    cons: Constraints,
) -> SolveResult:
    if not base_result.unassigned:
        return base_result

    try:
        from ortools.sat.python import cp_model
    except Exception:
        fallback = deepcopy(base_result)
        fallback.diagnostics.messages.append(
            "CP-SAT no está disponible; se mantiene el resultado reparado."
        )
        return fallback

    course_lookup = {course.course_id: course for course in courses}
    slot_lookup = {slot.timeslot_id: slot for slot in timeslots}

    allowed_slots_map = _build_allowed_slots(courses, timeslots, cons)

    teacher_conflicts_map: Dict[int, set[int]] = {}
    if cons.teacher_conflicts:
        for teacher_id, ids in cons.teacher_conflicts.items():
            teacher_conflicts_map[teacher_id] = set(ids)

    used_pairs = {
        (assignment.room_id, assignment.timeslot_id)
        for assignment in base_result.assignments
    }

    teacher_busy = set()
    for assignment in base_result.assignments:
        course = course_lookup.get(assignment.course_id)
        if course and course.teacher_id is not None:
            teacher_busy.add((course.teacher_id, assignment.timeslot_id))

    candidates: List[Tuple[int, int, int, int]] = []
    seen_keys: set[Tuple[int, int, int]] = set()

    for course_id, pending_minutes in base_result.unassigned.items():
        course = course_lookup.get(course_id)
        if not course or pending_minutes <= 0:
            continue

        allowed_slots = allowed_slots_map.get(course_id, set())
        if not allowed_slots:
            continue

        # Solo consideramos casos que caben en un bloque
        feasible_slots = [slot for slot in timeslots if slot.duration_minutes >= pending_minutes]
        feasible_slots = [slot for slot in feasible_slots if slot.timeslot_id in allowed_slots]

        per_course_added = 0
        for slot in feasible_slots:
            teacher_id = course.teacher_id
            if teacher_id is not None:
                if (teacher_id, slot.timeslot_id) in teacher_busy:
                    continue
                conflicts = teacher_conflicts_map.get(teacher_id)
                if conflicts and slot.timeslot_id in conflicts:
                    continue

            for room in rooms:
                key = (course_id, slot.timeslot_id, room.room_id)
                if key in seen_keys:
                    continue
                if (room.room_id, slot.timeslot_id) in used_pairs:
                    continue
                seen_keys.add(key)
                candidates.append((course_id, slot.timeslot_id, room.room_id, pending_minutes))
                per_course_added += 1
                if per_course_added >= 5:  # limitar el tamaño del modelo
                    break
            if per_course_added >= 5:
                break

    if not candidates:
        fallback = deepcopy(base_result)
        fallback.diagnostics.messages.append(
            "El pase CP-SAT no encontró combinaciones viables para cursos pendientes."
        )
        return fallback

    model = cp_model.CpModel()
    var_map: Dict[Tuple[int, int, int], cp_model.IntVar] = {}
    course_vars: Dict[int, List[cp_model.IntVar]] = defaultdict(list)
    slot_room_vars: Dict[Tuple[int, int], List[cp_model.IntVar]] = defaultdict(list)
    weights: Dict[cp_model.IntVar, int] = {}

    for idx, (course_id, slot_id, room_id, minutes) in enumerate(candidates):
        var = model.NewBoolVar(f"assign_{course_id}_{slot_id}_{room_id}_{idx}")
        key = (course_id, slot_id, room_id)
        var_map[key] = var
        course_vars[course_id].append(var)
        slot_room_vars[(room_id, slot_id)].append(var)
        weights[var] = minutes

    for vars_ in course_vars.values():
        model.Add(sum(vars_) <= 1)
    for vars_ in slot_room_vars.values():
        model.Add(sum(vars_) <= 1)

    model.Maximize(sum(weights[var] * var for var in weights))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 5
    status = solver.Solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        fallback = deepcopy(base_result)
        fallback.diagnostics.messages.append(
            "El pase CP-SAT no encontró solución factible dentro del límite de tiempo."
        )
        return fallback

    selected_assignments: List[AssignmentResult] = []
    for (course_id, slot_id, room_id), var in var_map.items():
        if solver.BooleanValue(var):
            pending_minutes = base_result.unassigned.get(course_id)
            if not pending_minutes:
                continue
            selected_assignments.append(
                AssignmentResult(
                    course_id=course_id,
                    room_id=room_id,
                    timeslot_id=slot_id,
                    duration_minutes=pending_minutes,
                    start_offset_minutes=0,
                )
            )

    if not selected_assignments:
        fallback = deepcopy(base_result)
        fallback.diagnostics.messages.append(
            "El pase CP-SAT no pudo mejorar la cobertura." )
        return fallback

    combined_assignments = list(base_result.assignments) + selected_assignments
    return _build_result_from_assignments(
        combined_assignments,
        courses,
        timeslots,
        cons,
        base_result.performance_metrics.runtime_seconds,
        "Se aplicó una etapa CP-SAT de reparación para cubrir cursos pendientes.",
    )


def _build_allowed_slots(
    courses: Sequence[CourseInput],
    timeslots: Sequence[TimeslotInput],
    cons: Constraints,
) -> Dict[int, set[int]]:
    all_slot_ids = {slot.timeslot_id for slot in timeslots}
    allowed: Dict[int, set[int]] = {}
    for course in courses:
        if course.teacher_id in cons.teacher_availability:
            allowed_slots = set(cons.teacher_availability[course.teacher_id]) & all_slot_ids
        else:
            allowed_slots = set(all_slot_ids)
        allowed[course.course_id] = allowed_slots
    return allowed


def _build_result_from_assignments(
    assignments: List[AssignmentResult],
    courses: Sequence[CourseInput],
    timeslots: Sequence[TimeslotInput],
    cons: Constraints,
    runtime_hint: float,
    message: str,
) -> SolveResult:
    course_lookup = {course.course_id: course for course in courses}
    slot_lookup = {slot.timeslot_id: slot for slot in timeslots}

    required_minutes: Dict[int, int] = {}
    for course in courses:
        needed = max(course.weekly_hours, 0) * 60
        if needed > 0:
            required_minutes[course.course_id] = needed

    assigned_minutes: Dict[int, int] = defaultdict(int)
    course_day_assignments: Dict[Tuple[int, int], int] = defaultdict(int)
    program_daily_minutes: Dict[Tuple[int, int], int] = defaultdict(int)
    used_slots: set[int] = set()

    for assignment in assignments:
        course = course_lookup.get(assignment.course_id)
        slot = slot_lookup.get(assignment.timeslot_id)
        if not course or not slot:
            continue
        assigned_minutes[course.course_id] += assignment.duration_minutes
        course_day_assignments[(course.course_id, slot.day)] += assignment.duration_minutes
        if course.program_semester_id is not None:
            program_daily_minutes[(course.program_semester_id, slot.day)] += assignment.duration_minutes
        used_slots.add(assignment.timeslot_id)

    unassigned: Dict[int, int] = {}
    for course_id, required in required_minutes.items():
        remaining = max(required - assigned_minutes.get(course_id, 0), 0)
        if remaining > 0:
            unassigned[course_id] = remaining

    requested_courses = len(required_minutes)
    requested_minutes_total = sum(required_minutes.values())
    assigned_minutes_total = sum(assigned_minutes.values())
    assigned_courses = requested_courses - len(unassigned)
    fill_rate = (
        assigned_minutes_total / requested_minutes_total
        if requested_minutes_total > 0
        else 0.0
    )

    quality_metrics = ScheduleQualityMetrics()
    quality_metrics.total_assigned = assigned_courses
    quality_metrics.total_unassigned = len(unassigned)
    quality_metrics.balance_score = _calculate_balance_score(
        course_day_assignments, program_daily_minutes, cons
    )
    quality_metrics.daily_overload_count = _count_daily_overloads(
        program_daily_minutes, cons.max_daily_hours_per_program
    )
    daily_hours = [minutes / 60.0 for minutes in program_daily_minutes.values()]
    if daily_hours:
        quality_metrics.avg_daily_load = sum(daily_hours) / len(daily_hours)
        quality_metrics.max_daily_load = max(daily_hours)
    quality_metrics.timeslot_utilization = (
        len(used_slots) / len(timeslots) if timeslots else 0.0
    )
    quality_metrics.unassigned_count = len(unassigned)

    performance_metrics = PerformanceMetrics(
        runtime_seconds=runtime_hint,
        requested_courses=requested_courses,
        assigned_courses=assigned_courses,
        requested_minutes=requested_minutes_total,
        assigned_minutes=assigned_minutes_total,
        fill_rate=fill_rate,
    )

    diagnostics = OptimizationDiagnostics(
        messages=[
            "Resultado reconstruido tras aplicar CP-SAT relajado.",
            message,
        ],
        unassigned_causes={},
    )

    return SolveResult(
        assignments=assignments,
        unassigned=unassigned,
        quality_metrics=quality_metrics,
        performance_metrics=performance_metrics,
        diagnostics=diagnostics,
    )

