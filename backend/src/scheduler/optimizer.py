from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from math import ceil
from typing import Dict, List, Optional, Set, Tuple


GRANULARITY_MINUTES = 15


@dataclass
class CourseInput:
    course_id: int
    teacher_id: int
    weekly_hours: int
    program_semester_id: Optional[int] = None  # Para rastrear carga por programa


@dataclass
class RoomInput:
    room_id: int
    capacity: int


@dataclass
class TimeslotInput:
    timeslot_id: int
    day: int
    block: int  # índice discreto del bloque dentro del día
    start_minutes: int
    duration_minutes: int


@dataclass
class JornadaConfig:
    """Configuración de horarios por jornada académica"""
    jornada_id: str  # identificador de jornada (p. ej. 'morning', 'afternoon', 'evening')
    start_time_minutes: int  # minutos desde medianoche (ej: 480 = 8:00)
    end_time_minutes: int
    lunch_start_minutes: Optional[int] = None
    lunch_end_minutes: Optional[int] = None


@dataclass
class ScheduleQualityMetrics:
    """Métricas de calidad del horario generado"""
    total_assigned: int = 0
    total_unassigned: int = 0
    lunch_violations: int = 0
    consecutive_blocks_violations: int = 0
    gap_violations: int = 0
    balance_score: float = 0.0  # rango 0-100; valores altos indican mejor distribución
    daily_overload_count: int = 0
    avg_daily_load: float = 0.0  # promedio de horas dictadas por día
    max_daily_load: float = 0.0  # máxima carga diaria observada
    timeslot_utilization: float = 0.0  # porcentaje de timeslots utilizados (0-1)
    unassigned_count: int = 0  # número de cursos que quedaron parcialmente sin asignar


@dataclass
class Constraints:
    teacher_availability: Dict[int, List[int]]  # docente_id -> ids de timeslot permitidos
    room_allowed: Optional[Dict[int, List[int]]] = None  # sala_id -> ids de timeslot permitidos
    max_consecutive_blocks: int = 4  # máximo de bloques consecutivos antes de exigir descanso
    min_gap_blocks: int = 0  # cantidad mínima de bloques libres entre clases del mismo docente
    min_gap_minutes: int = 15  # minutos mínimos entre clases distintas (recreo general)
    reserve_break_minutes: int = 0  # minutos a reservar dentro del bloque para descanso interno
    teacher_conflicts: Optional[Dict[int, List[int]]] = None  # docente_id -> ids de timeslot ocupados
    lunch_blocks: Optional[Set[Tuple[int, int]]] = None  # pares (día, hora) que representan almuerzo
    jornadas: List[JornadaConfig] = field(default_factory=list)
    max_daily_hours_per_program: int = 6  # máximo de horas por día permitidas por programa
    balance_weight: float = 0.3  # peso asignado a la métrica de balance (0-1)


@dataclass
class AssignmentResult:
    course_id: int
    room_id: int
    timeslot_id: int
    duration_minutes: int
    start_offset_minutes: int


@dataclass
class SolveResult:
    assignments: List[AssignmentResult]
    unassigned: Dict[int, int]  # course_id -> minutos pendientes por asignar
    quality_metrics: ScheduleQualityMetrics = field(default_factory=ScheduleQualityMetrics)


def solve_schedule(
    courses: List[CourseInput],
    rooms: List[RoomInput],
    timeslots: List[TimeslotInput],
    cons: Constraints,
) -> SolveResult:
    return _solve_partial_greedy(courses, rooms, timeslots, cons)


def _build_slot_units(slot: TimeslotInput, break_minutes: int) -> List[Tuple[int, bool]]:
    """Crea la lista de unidades (granularidad de 15 min) marcando cuáles se reservan como descanso."""
    total_units = max(slot.duration_minutes // GRANULARITY_MINUTES, 0)
    if total_units <= 0:
        return []

    if break_minutes <= 0:
        return [(index, False) for index in range(total_units)]

    reserve_units = ceil(break_minutes / GRANULARITY_MINUTES)
    if reserve_units >= total_units:
        reserve_units = total_units - 1 if total_units > 0 else 0

    threshold = total_units - reserve_units if reserve_units > 0 else total_units
    units: List[Tuple[int, bool]] = []
    for index in range(total_units):
        units.append((index, index >= threshold))
    return units


def _solve_partial_greedy(
    courses: List[CourseInput],
    rooms: List[RoomInput],
    timeslots: List[TimeslotInput],
    cons: Constraints,
) -> SolveResult:
    if not courses or not rooms or not timeslots:
        return SolveResult([], {})

    # Inicializar métricas de calidad
    quality_metrics = ScheduleQualityMetrics()

    # Solo aplicar filtro de almuerzo si se especificó explícitamente
    lunch_blocks = cons.lunch_blocks if cons.lunch_blocks is not None else set()

    slot_lookup = {slot.timeslot_id: slot for slot in timeslots}
    
    # Filtrar timeslots que caen en horarios de almuerzo (solo si se especificaron)
    valid_timeslots = []
    for slot in timeslots:
        if lunch_blocks and _is_lunch_block(slot, lunch_blocks):
            continue  # Saltar bloques de almuerzo
        if cons.jornadas and not _is_within_jornada(slot, cons.jornadas):
            continue  # Saltar bloques fuera de jornadas permitidas
        valid_timeslots.append(slot)
    
    if not valid_timeslots:
        return SolveResult([], {})

    effective_break_minutes = max(cons.min_gap_minutes, cons.reserve_break_minutes)

    slot_unit_templates: Dict[int, List[Tuple[int, bool]]] = {}
    for slot in valid_timeslots:
        units = _build_slot_units(slot, effective_break_minutes)
        if units:
            slot_unit_templates[slot.timeslot_id] = units
    if not slot_unit_templates:
        return SolveResult([], {})

    required_units: Dict[int, int] = {}
    remaining_units: Dict[int, int] = {}
    course_lookup: Dict[int, CourseInput] = {}
    for course in courses:
        needed_minutes = max(course.weekly_hours, 0) * 60
        needed_units = max(ceil(needed_minutes / GRANULARITY_MINUTES), 0)
        if needed_units <= 0:
            continue
        required_units[course.course_id] = needed_units
        remaining_units[course.course_id] = needed_units
        course_lookup[course.course_id] = course

    if not required_units:
        return SolveResult([], {})

    all_timeslot_ids: Set[int] = set(s.timeslot_id for s in valid_timeslots)
    allowed_slots_map: Dict[int, Set[int]] = {}
    for course in courses:
        if course.course_id not in required_units:
            continue
        if course.teacher_id in cons.teacher_availability:
            allowed = set(cons.teacher_availability[course.teacher_id]) & all_timeslot_ids
        else:
            allowed = set(all_timeslot_ids)
        allowed_slots_map[course.course_id] = allowed

    room_allowed_map: Dict[int, Set[int]] = {}
    if cons.room_allowed:
        for room_id, ids in cons.room_allowed.items():
            room_allowed_map[room_id] = set(ids)

    teacher_conflicts_map: Dict[int, Set[int]] = {}
    if cons.teacher_conflicts:
        for teacher_id, ids in cons.teacher_conflicts.items():
            teacher_conflicts_map[teacher_id] = set(ids)

    assignments_units: Dict[tuple[int, int, int], List[int]] = defaultdict(list)
    assigned_units_per_course: Dict[int, int] = defaultdict(int)
    teacher_busy_slot: Dict[tuple[int, int], int] = {}
    teacher_day_blocks: Dict[int, Dict[int, Set[int]]] = defaultdict(lambda: defaultdict(set))
    teacher_day_last_block: Dict[Tuple[int, int], Optional[int]] = {}
    teacher_day_streak: Dict[Tuple[int, int], int] = {}
    
    # Rastreo de carga por programa y día para balancear
    program_daily_minutes: Dict[Tuple[Optional[int], int], int] = defaultdict(int)
    course_day_assignments: Dict[Tuple[int, int], int] = defaultdict(int)  # (course_id, day) -> minutos
    
    # Rastreo de timeslots ocupados por programa/semestre (evitar conflictos de estudiantes)
    program_busy_slots: Dict[Tuple[Optional[int], int], Set[int]] = defaultdict(set)  # (program_semester_id, timeslot_id) -> cursos

    rooms_order = sorted(rooms, key=lambda r: (r.capacity * -1, r.room_id))
    
    # Priorizar slots balanceados solo si se especificaron lunch_blocks o jornadas
    # (para mantener compatibilidad con tests existentes)
    if lunch_blocks or cons.jornadas:
        slots_order = _prioritize_balanced_slots(valid_timeslots, cons)
    else:
        slots_order = valid_timeslots

    course_room_lock: Dict[int, int] = {}

    def process_slot(slot: TimeslotInput) -> None:
        units_template = slot_unit_templates.get(slot.timeslot_id)
        if not units_template:
            return

        per_room_units: Dict[int, List[Tuple[int, bool]]] = {}
        for room in rooms_order:
            if cons.room_allowed and room.room_id in room_allowed_map:
                if slot.timeslot_id not in room_allowed_map[room.room_id]:
                    continue
            per_room_units[room.room_id] = [unit for unit in units_template]
        if not per_room_units:
            return

        teacher_slot_context: Dict[Tuple[int, int], Tuple[bool, int, Optional[int]]] = {}
        teacher_slot_processed: Set[Tuple[int, int]] = set()

        eligible_courses = [
            course_id
            for course_id, remaining in remaining_units.items()
            if remaining > 0
            and slot.timeslot_id in allowed_slots_map.get(course_id, set())
            and _check_program_daily_limit(
                course_id,
                slot,
                course_lookup,
                program_daily_minutes,
                len(units_template),
                cons,
            )
        ]
        if not eligible_courses:
            return

        remaining_units_slot = sum(len(indices) for indices in per_room_units.values())
        active_courses = eligible_courses[:]

        while remaining_units_slot > 0 and active_courses and any(per_room_units.values()):
            cycle_success = False
            quota = max(1, ceil(remaining_units_slot / len(active_courses)))
            next_active: List[int] = []

            for course_id in list(active_courses):
                if remaining_units_slot <= 0:
                    break
                remaining = remaining_units.get(course_id, 0)
                if remaining <= 0:
                    continue
                if not _teacher_can_take_slot(
                    course_id,
                    slot,
                    course_lookup,
                    teacher_busy_slot,
                    teacher_day_blocks,
                    cons,
                    teacher_conflicts_map,
                ):
                    continue

                course = course_lookup.get(course_id)
                if course and course.program_semester_id is not None:
                    key = (course.program_semester_id, slot.timeslot_id)
                    occupied = program_busy_slots.get(key)
                    if occupied and course_id not in occupied:
                        continue

                teacher_id = None
                rest_required = False
                consecutive_before = 0
                last_block_value: Optional[int] = None
                if course:
                    teacher_id = course.teacher_id
                    if teacher_id is not None and cons.max_consecutive_blocks > 0:
                        slot_key = (teacher_id, slot.timeslot_id)
                        context = teacher_slot_context.get(slot_key)
                        if context is None:
                            streak_key = (teacher_id, slot.day)
                            last_block_value = teacher_day_last_block.get(streak_key)
                            consecutive_before = teacher_day_streak.get(streak_key, 0)
                            if last_block_value is None or slot.block != (last_block_value + 1):
                                consecutive_before = 0
                            rest_required = (
                                last_block_value is not None
                                and slot.block == last_block_value + 1
                                and consecutive_before >= cons.max_consecutive_blocks
                            )
                            teacher_slot_context[slot_key] = (rest_required, consecutive_before, last_block_value)
                        else:
                            rest_required, consecutive_before, last_block_value = context

                chunk_target = min(remaining, quota, remaining_units_slot)
                if chunk_target <= 0:
                    continue

                allow_reserve = not rest_required

                assigned_chunk = _assign_chunk_to_course(
                    course_id,
                    chunk_target,
                    per_room_units,
                    rooms_order,
                    slot,
                    assignments_units,
                    course_room_lock,
                    allow_reserve,
                )
                if assigned_chunk == 0:
                    continue

                cycle_success = True
                remaining_units_slot -= assigned_chunk
                remaining_units[course_id] = remaining - assigned_chunk
                assigned_units_per_course[course_id] += assigned_chunk

                teacher_id = course_lookup[course_id].teacher_id
                if teacher_id is not None:
                    teacher_busy_slot[(teacher_id, slot.timeslot_id)] = course_id
                    teacher_day_blocks[teacher_id][slot.day].add(slot.block)

                if course and course.program_semester_id is not None:
                    minutes_assigned = assigned_chunk * GRANULARITY_MINUTES
                    program_daily_minutes[(course.program_semester_id, slot.day)] += minutes_assigned
                    course_day_assignments[(course_id, slot.day)] += minutes_assigned
                    program_busy_slots[(course.program_semester_id, slot.timeslot_id)].add(course_id)

                if teacher_id is not None:
                    slot_key = (teacher_id, slot.timeslot_id)
                    if slot_key not in teacher_slot_processed:
                        context = teacher_slot_context.get(slot_key)
                        if context:
                            rest_flag, previous_streak, last_block_value = context
                        else:
                            rest_flag = False
                            previous_streak = 0
                            last_block_value = None
                        streak_key = (teacher_id, slot.day)
                        if last_block_value is not None and slot.block == last_block_value + 1:
                            if rest_flag:
                                new_streak = 1
                            else:
                                new_streak = previous_streak + 1 if previous_streak > 0 else 1
                        else:
                            new_streak = 1
                        teacher_day_streak[streak_key] = new_streak
                        teacher_day_last_block[streak_key] = slot.block
                        teacher_slot_processed.add(slot_key)

                if remaining_units.get(course_id, 0) > 0 and remaining_units_slot > 0:
                    next_active.append(course_id)

            if not cycle_success:
                break

            if next_active:
                active_courses = next_active
            else:
                active_courses = [
                    course_id
                    for course_id in eligible_courses
                    if remaining_units.get(course_id, 0) > 0
                    and _teacher_can_take_slot(
                        course_id,
                        slot,
                        course_lookup,
                        teacher_busy_slot,
                        teacher_day_blocks,
                        cons,
                        teacher_conflicts_map,
                    )
                ]

    for slot in slots_order:
        process_slot(slot)

    assignments: List[AssignmentResult] = []
    for (course_id, room_id, timeslot_id), units in assignments_units.items():
        if not units:
            continue
        ordered = sorted(units)
        start_unit = ordered[0]
        length = 1
        for current, previous in zip(ordered[1:], ordered[:-1]):
            if current == previous + 1:
                length += 1
            else:
                assignments.append(
                    AssignmentResult(
                        course_id=course_id,
                        room_id=room_id,
                        timeslot_id=timeslot_id,
                        start_offset_minutes=start_unit * GRANULARITY_MINUTES,
                        duration_minutes=length * GRANULARITY_MINUTES,
                    )
                )
                start_unit = current
                length = 1
        assignments.append(
            AssignmentResult(
                course_id=course_id,
                room_id=room_id,
                timeslot_id=timeslot_id,
                start_offset_minutes=start_unit * GRANULARITY_MINUTES,
                duration_minutes=length * GRANULARITY_MINUTES,
            )
        )

    unassigned: Dict[int, int] = {}
    for course_id, required in required_units.items():
        assigned = assigned_units_per_course.get(course_id, 0)
        remaining = max(required - assigned, 0)
        if remaining > 0:
            unassigned[course_id] = remaining * GRANULARITY_MINUTES
    
    # Calcular métricas de calidad
    quality_metrics.total_assigned = len([c for c in required_units if c not in unassigned])
    quality_metrics.total_unassigned = len(unassigned)
    quality_metrics.balance_score = _calculate_balance_score(
        course_day_assignments, program_daily_minutes, cons
    )
    quality_metrics.daily_overload_count = _count_daily_overloads(
        program_daily_minutes, cons.max_daily_hours_per_program
    )
    
    # Calcular métricas adicionales para el frontend
    quality_metrics.unassigned_count = len(unassigned)
    
    # Calcular avg_daily_load y max_daily_load por programa
    if program_daily_minutes:
        daily_hours = [minutes / 60.0 for minutes in program_daily_minutes.values()]
        quality_metrics.avg_daily_load = sum(daily_hours) / len(daily_hours) if daily_hours else 0.0
        quality_metrics.max_daily_load = max(daily_hours) if daily_hours else 0.0
    else:
        quality_metrics.avg_daily_load = 0.0
        quality_metrics.max_daily_load = 0.0
    
    # Calcular utilización de timeslots (% de slots ocupados)
    used_timeslot_ids = set(a.timeslot_id for a in assignments)
    total_available_slots = len(valid_timeslots)
    quality_metrics.timeslot_utilization = (
        len(used_timeslot_ids) / total_available_slots if total_available_slots > 0 else 0.0
    )

    return SolveResult(
        assignments=assignments, 
        unassigned=unassigned,
        quality_metrics=quality_metrics
    )


def _teacher_can_take_slot(
    course_id: int,
    slot: TimeslotInput,
    course_lookup: Dict[int, CourseInput],
    teacher_busy_slot: Dict[tuple[int, int], int],
    teacher_day_blocks: Dict[int, Dict[int, Set[int]]],
    cons: Constraints,
    teacher_conflicts_map: Dict[int, Set[int]],
) -> bool:
    course = course_lookup.get(course_id)
    if not course:
        return False

    teacher_id = course.teacher_id
    if teacher_id is None:
        return True

    conflicts = teacher_conflicts_map.get(teacher_id)
    if conflicts and slot.timeslot_id in conflicts:
        return False

    busy_course = teacher_busy_slot.get((teacher_id, slot.timeslot_id))
    if busy_course is not None and busy_course != course_id:
        return False

    if cons.min_gap_blocks > 0:
        blocks_for_teacher = teacher_day_blocks[teacher_id][slot.day]
        for existing_block in blocks_for_teacher:
            if existing_block == slot.block and busy_course not in (None, course_id):
                return False
            if existing_block != slot.block and abs(slot.block - existing_block) <= cons.min_gap_blocks:
                return False

    return True


def _assign_chunk_to_course(
    course_id: int,
    chunk_target: int,
    per_room_units: Dict[int, List[Tuple[int, bool]]],
    rooms_order: List[RoomInput],
    slot: TimeslotInput,
    assignments_units: Dict[tuple[int, int, int], List[int]],
    course_room_lock: Dict[int, int],
    allow_reserve: bool,
) -> int:
    lock_room_id = course_room_lock.get(course_id)
    assigned = 0

    def _consume(room_id: int, available_units: List[Tuple[int, bool]], amount: int) -> int:
        taken = 0
        idx = 0
        while idx < len(available_units) and taken < amount:
            unit_index, is_reserve = available_units[idx]
            if not allow_reserve and is_reserve:
                idx += 1
                continue
            assignments_units[(course_id, room_id, slot.timeslot_id)].append(unit_index)
            del available_units[idx]
            taken += 1
        return taken

    if lock_room_id is not None:
        available = per_room_units.get(lock_room_id)
        if not available:
            return 0
        if chunk_target <= 0:
            return 0
        assigned = _consume(lock_room_id, available, chunk_target)
        return assigned

    for room in rooms_order:
        available = per_room_units.get(room.room_id)
        if not available:
            continue
        if chunk_target <= 0:
            continue
        assigned = _consume(room.room_id, available, chunk_target)
        if assigned > 0:
            course_room_lock[course_id] = room.room_id
        return assigned

    return 0


def _get_default_lunch_blocks() -> Set[Tuple[int, int]]:
    """
    Bloques de almuerzo por defecto: Lunes a Viernes 12:00-14:00.
    Retorna set de tuplas (day, hour) donde day: 1=Lun, 5=Vie y hour es la hora del día (0-23).
    """
    lunch = set()
    for day in range(1, 6):  # Lunes a Viernes
        lunch.add((day, 12))
        lunch.add((day, 13))
    return lunch


def _is_lunch_block(slot: TimeslotInput, lunch_blocks: Set[Tuple[int, int]]) -> bool:
    """Verifica si un timeslot cae dentro de un bloque de almuerzo."""
    hour = slot.start_minutes // 60
    return (slot.day, hour) in lunch_blocks


def _is_within_jornada(slot: TimeslotInput, jornadas: List[JornadaConfig]) -> bool:
    """
    Verifica si un timeslot está dentro de alguna jornada permitida.
    Si no hay jornadas definidas, permite todos los bloques.
    """
    if not jornadas:
        return True
    
    for jornada in jornadas:
        if jornada.start_time_minutes <= slot.start_minutes < jornada.end_time_minutes:
            # Verificar que no caiga en horario de almuerzo de esta jornada
            if jornada.lunch_start_minutes and jornada.lunch_end_minutes:
                if jornada.lunch_start_minutes <= slot.start_minutes < jornada.lunch_end_minutes:
                    return False
            return True
    return False


def _prioritize_balanced_slots(
    timeslots: List[TimeslotInput], 
    cons: Constraints
) -> List[TimeslotInput]:
    """
    Ordena timeslots priorizando distribución balanceada:
    1. Alterna días (evita concentrar todo en un día)
    2. Prioriza horarios centrales (9:00-17:00)
    3. Evita primeros y últimos bloques del día
    """
    def slot_priority(slot: TimeslotInput) -> Tuple[int, int, int]:
        # Ciclar días para distribuir (0, 1, 2, 3, 4, 0, 1, ...)
        day_cycle = slot.day % 5
        
        # Penalizar horarios muy tempranos (<8:30) o muy tardíos (>19:00)
        hour = slot.start_minutes // 60
        time_penalty = 0
        if hour < 8 or hour >= 19:
            time_penalty = 100
        elif hour < 9 or hour >= 18:
            time_penalty = 50
        
        # Penalizar bloques extremos del día
        block_penalty = 0
        if slot.block == 0 or slot.block >= 10:
            block_penalty = 30
        
        return (day_cycle, time_penalty + block_penalty, slot.block)
    
    return sorted(timeslots, key=slot_priority)


def _check_program_daily_limit(
    course_id: int,
    slot: TimeslotInput,
    course_lookup: Dict[int, CourseInput],
    program_daily_minutes: Dict[Tuple[Optional[int], int], int],
    additional_minutes: int,
    cons: Constraints,
) -> bool:
    """
    Verifica que asignar este curso no exceda el límite diario del programa.
    """
    course = course_lookup.get(course_id)
    if not course or course.program_semester_id is None:
        return True  # Sin límite si no hay programa asociado
    
    current_minutes = program_daily_minutes.get((course.program_semester_id, slot.day), 0)
    new_minutes = additional_minutes * GRANULARITY_MINUTES
    max_minutes = cons.max_daily_hours_per_program * 60
    
    return (current_minutes + new_minutes) <= max_minutes


def _calculate_balance_score(
    course_day_assignments: Dict[Tuple[int, int], int],
    program_daily_minutes: Dict[Tuple[Optional[int], int], int],
    cons: Constraints,
) -> float:
    """
    Calcula un score de balance de 0-100 basado en:
    - Distribución uniforme de clases en la semana
    - Evitar días vacíos y días sobrecargados
    Score alto = mejor distribución
    """
    if not course_day_assignments:
        return 0.0
    
    # Agrupar por curso
    courses_days: Dict[int, List[int]] = defaultdict(list)
    for (course_id, day), minutes in course_day_assignments.items():
        if minutes > 0:
            courses_days[course_id].append(day)
    
    if not courses_days:
        return 0.0
    
    # Penalizar cursos concentrados en pocos días
    balance_penalties = 0
    for course_id, days in courses_days.items():
        unique_days = len(set(days))
        if unique_days == 1:
            balance_penalties += 30  # Todo en un día = muy mal
        elif unique_days == 2:
            balance_penalties += 10  # En dos días = regular
    
    # Recompensar distribución en 3+ días
    well_distributed = sum(1 for days in courses_days.values() if len(set(days)) >= 3)
    balance_bonus = well_distributed * 10
    
    # Score final
    max_penalty = len(courses_days) * 30
    raw_score = 100 - (balance_penalties / max(max_penalty, 1)) * 100 + balance_bonus
    return max(0.0, min(100.0, raw_score))


def _count_daily_overloads(
    program_daily_minutes: Dict[Tuple[Optional[int], int], int],
    max_daily_hours: int,
) -> int:
    """
    Cuenta cuántos días de programa exceden el límite de horas diarias.
    """
    max_minutes = max_daily_hours * 60
    overloads = 0
    for minutes in program_daily_minutes.values():
        if minutes > max_minutes:
            overloads += 1
    return overloads
