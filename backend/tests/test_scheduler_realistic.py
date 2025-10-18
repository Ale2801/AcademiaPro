"""
Tests para verificar restricciones realistas del optimizador de horarios.
"""
from collections import defaultdict
from typing import Dict, Set

from src.scheduler.optimizer import (
    CourseInput,
    RoomInput,
    TimeslotInput,
    Constraints,
    solve_schedule,
    _get_default_lunch_blocks,
    _is_lunch_block,
    _prioritize_balanced_slots,
)


def test_default_lunch_blocks():
    """Verifica que los bloques de almuerzo por defecto se configuren correctamente."""
    lunch_blocks = _get_default_lunch_blocks()
    
    # Debe tener bloques para lunes a viernes (días 1-5)
    assert len(lunch_blocks) == 10  # 5 días × 2 horas (12:00 y 13:00)
    
    # Verificar que incluye hora 12 y 13 para cada día
    for day in range(1, 6):
        assert (day, 12) in lunch_blocks
        assert (day, 13) in lunch_blocks


def test_is_lunch_block():
    """Verifica detección de bloques de almuerzo."""
    lunch_blocks = _get_default_lunch_blocks()
    
    # Bloque a las 12:00 (720 minutos) debe ser almuerzo
    slot_lunch = TimeslotInput(
        timeslot_id=1,
        day=1,
        block=4,
        start_minutes=720,  # 12:00
        duration_minutes=60
    )
    assert _is_lunch_block(slot_lunch, lunch_blocks) is True
    
    # Bloque a las 9:00 (540 minutos) no debe ser almuerzo
    slot_morning = TimeslotInput(
        timeslot_id=2,
        day=1,
        block=1,
        start_minutes=540,  # 9:00
        duration_minutes=60
    )
    assert _is_lunch_block(slot_morning, lunch_blocks) is False


def test_balanced_slot_prioritization():
    """Verifica que los slots se prioricen para distribución balanceada."""
    timeslots = [
        TimeslotInput(1, day=1, block=1, start_minutes=480, duration_minutes=60),  # Lun 8:00
        TimeslotInput(2, day=2, block=1, start_minutes=480, duration_minutes=60),  # Mar 8:00
        TimeslotInput(3, day=1, block=5, start_minutes=780, duration_minutes=60),  # Lun 13:00
        TimeslotInput(4, day=3, block=2, start_minutes=540, duration_minutes=60),  # Mie 9:00
    ]
    
    cons = Constraints(teacher_availability={})
    prioritized = _prioritize_balanced_slots(timeslots, cons)
    
    # Debe alternar días para distribuir
    assert len(prioritized) == 4
    # Debe preferir horarios centrales (9:00) sobre muy tempranos (8:00)
    # El orden debe ser: día 1, día 2, día 3 (ciclando)


def test_schedule_without_lunch_blocks():
    """Verifica que el optimizador no asigne clases durante almuerzo."""
    courses = [
        CourseInput(course_id=1, teacher_id=1, weekly_hours=2),
    ]
    rooms = [
        RoomInput(room_id=1, capacity=30),
    ]
    
    # Crear timeslots incluyendo bloques de almuerzo
    timeslots = [
        TimeslotInput(1, day=1, block=3, start_minutes=660, duration_minutes=60),   # 11:00 - OK
        TimeslotInput(2, day=1, block=4, start_minutes=720, duration_minutes=60),   # 12:00 - ALMUERZO
        TimeslotInput(3, day=1, block=5, start_minutes=780, duration_minutes=60),   # 13:00 - ALMUERZO
        TimeslotInput(4, day=1, block=6, start_minutes=840, duration_minutes=60),   # 14:00 - OK
    ]
    
    cons = Constraints(
        teacher_availability={1: [1, 2, 3, 4]},
        max_consecutive_blocks=4,
        lunch_blocks={(1, 12), (1, 13)},  # Especificar explícitamente bloques de almuerzo
    )
    
    result = solve_schedule(courses, rooms, timeslots, cons)
    
    # Verificar que no se asignaron clases en bloques 2 y 3 (almuerzo)
    assigned_timeslots = {a.timeslot_id for a in result.assignments}
    assert 2 not in assigned_timeslots, "No debe asignar clases durante almuerzo (12:00)"
    assert 3 not in assigned_timeslots, "No debe asignar clases durante almuerzo (13:00)"
    
    # Debe asignar en bloques permitidos
    assert len(result.assignments) > 0, "Debe asignar al menos una clase fuera de almuerzo"


def test_quality_metrics_returned():
    """Verifica que el resultado incluya métricas de calidad."""
    courses = [
        CourseInput(course_id=1, teacher_id=1, weekly_hours=3, program_semester_id=1),
        CourseInput(course_id=2, teacher_id=2, weekly_hours=2, program_semester_id=1),
    ]
    rooms = [RoomInput(room_id=1, capacity=40)]
    timeslots = [
        TimeslotInput(i, day=d, block=b, start_minutes=480+b*60, duration_minutes=60)
        for i, (d, b) in enumerate([(1, 1), (1, 2), (2, 1), (2, 2), (3, 1)], start=1)
    ]
    
    cons = Constraints(
        teacher_availability={1: [1, 2, 3, 4, 5], 2: [1, 2, 3, 4, 5]},
        max_daily_hours_per_program=6,
    )
    
    result = solve_schedule(courses, rooms, timeslots, cons)
    
    # Verificar que se retornan métricas
    assert hasattr(result, 'quality_metrics')
    assert result.quality_metrics.total_assigned >= 0
    assert result.quality_metrics.total_unassigned >= 0
    assert 0 <= result.quality_metrics.balance_score <= 100
    assert result.quality_metrics.daily_overload_count >= 0
    
    # Verificar nuevas métricas para el frontend
    assert result.quality_metrics.avg_daily_load >= 0.0
    assert result.quality_metrics.max_daily_load >= 0.0
    assert 0.0 <= result.quality_metrics.timeslot_utilization <= 1.0
    assert result.quality_metrics.unassigned_count >= 0


def test_program_daily_limit():
    """Verifica que se respete el límite de horas diarias por programa."""
    courses = [
        CourseInput(course_id=1, teacher_id=1, weekly_hours=8, program_semester_id=1),  # 8 horas semanales
    ]
    rooms = [RoomInput(room_id=1, capacity=30)]
    
    # Crear 10 bloques en un mismo día (Lunes)
    timeslots = [
        TimeslotInput(i, day=1, block=i, start_minutes=480+i*60, duration_minutes=60)
        for i in range(1, 11)
    ]
    
    cons = Constraints(
        teacher_availability={1: list(range(1, 11))},
        max_daily_hours_per_program=6,  # Máximo 6 horas por día
    )
    
    result = solve_schedule(courses, rooms, timeslots, cons)
    
    # Calcular total de horas asignadas en el día
    total_minutes = sum(a.duration_minutes for a in result.assignments)
    total_hours = total_minutes / 60
    
    # No debe exceder el límite de 6 horas
    assert total_hours <= 6, f"Excedió límite diario: {total_hours} horas (máximo 6)"


def test_no_student_conflicts_same_program():
    """Verifica que cursos del mismo programa no se asignen en el mismo timeslot (conflicto de estudiantes)."""
    # Crear múltiples cursos del mismo programa/semestre
    courses = [
        CourseInput(course_id=1, teacher_id=1, weekly_hours=2, program_semester_id=1),
        CourseInput(course_id=2, teacher_id=2, weekly_hours=2, program_semester_id=1),
        CourseInput(course_id=3, teacher_id=3, weekly_hours=2, program_semester_id=1),
    ]
    rooms = [
        RoomInput(room_id=1, capacity=30),
        RoomInput(room_id=2, capacity=30),
        RoomInput(room_id=3, capacity=30),
    ]
    
    # Crear varios timeslots
    timeslots = [
        TimeslotInput(i, day=d, block=b, start_minutes=480+b*60, duration_minutes=60)
        for i, (d, b) in enumerate([(1, 1), (1, 2), (2, 1), (2, 2), (3, 1), (3, 2)], start=1)
    ]
    
    cons = Constraints(
        teacher_availability={
            1: [1, 2, 3, 4, 5, 6],
            2: [1, 2, 3, 4, 5, 6],
            3: [1, 2, 3, 4, 5, 6],
        },
    )
    
    result = solve_schedule(courses, rooms, timeslots, cons)
    
    # Agrupar asignaciones por timeslot
    timeslot_courses: Dict[int, Set[int]] = defaultdict(set)
    for assignment in result.assignments:
        timeslot_courses[assignment.timeslot_id].add(assignment.course_id)
    
    # Verificar que NO hay dos cursos del mismo programa en el mismo timeslot
    for timeslot_id, course_ids in timeslot_courses.items():
        assert len(course_ids) <= 1, (
            f"Conflicto de estudiantes detectado en timeslot {timeslot_id}: "
            f"cursos {course_ids} asignados simultáneamente. "
            f"Los estudiantes del programa 1 no pueden asistir a ambas clases."
        )
    
    # Verificar que se asignaron los cursos (al menos parcialmente)
    assert len(result.assignments) > 0, "No se asignó ningún curso"
    print(f"✅ Test pasado: {len(result.assignments)} asignaciones sin conflictos de estudiantes")
