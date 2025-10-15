from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from math import ceil
from typing import Dict, List, Optional, Set


GRANULARITY_MINUTES = 15


@dataclass
class CourseInput:
    course_id: int
    teacher_id: int
    weekly_hours: int


@dataclass
class RoomInput:
    room_id: int
    capacity: int


@dataclass
class TimeslotInput:
    timeslot_id: int
    day: int
    block: int  # discrete block index in day
    start_minutes: int
    duration_minutes: int


@dataclass
class Constraints:
    teacher_availability: Dict[int, List[int]]  # teacher_id -> allowed timeslot_ids
    room_allowed: Optional[Dict[int, List[int]]] = None  # room_id -> allowed timeslot_ids
    max_consecutive_blocks: int = 3
    min_gap_blocks: int = 0
    teacher_conflicts: Optional[Dict[int, List[int]]] = None  # teacher_id -> occupied timeslot_ids


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
    unassigned: Dict[int, int]  # course_id -> remaining minutes


def solve_schedule(
    courses: List[CourseInput],
    rooms: List[RoomInput],
    timeslots: List[TimeslotInput],
    cons: Constraints,
) -> SolveResult:
    return _solve_partial_greedy(courses, rooms, timeslots, cons)


def _solve_partial_greedy(
    courses: List[CourseInput],
    rooms: List[RoomInput],
    timeslots: List[TimeslotInput],
    cons: Constraints,
) -> SolveResult:
    if not courses or not rooms or not timeslots:
        return SolveResult([], {})

    slot_lookup = {slot.timeslot_id: slot for slot in timeslots}
    total_units_by_slot: Dict[int, int] = {}
    for slot in timeslots:
        units = max(slot.duration_minutes // GRANULARITY_MINUTES, 0)
        if units > 0:
            total_units_by_slot[slot.timeslot_id] = units
    if not total_units_by_slot:
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

    all_timeslot_ids: Set[int] = set(slot_lookup.keys())
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

    rooms_order = sorted(rooms, key=lambda r: (r.capacity * -1, r.room_id))
    slots_order = sorted(timeslots, key=lambda s: (s.day, s.block, s.start_minutes))

    for slot in slots_order:
        total_units = total_units_by_slot.get(slot.timeslot_id, 0)
        if total_units <= 0:
            continue

        per_room_units: Dict[int, List[int]] = {}
        for room in rooms_order:
            if cons.room_allowed and room.room_id in room_allowed_map:
                if slot.timeslot_id not in room_allowed_map[room.room_id]:
                    continue
            per_room_units[room.room_id] = list(range(total_units))
        if not per_room_units:
            continue

        eligible_courses = [
            course_id
            for course_id, remaining in remaining_units.items()
            if remaining > 0 and slot.timeslot_id in allowed_slots_map.get(course_id, set())
        ]
        if not eligible_courses:
            continue

        remaining_units_slot = sum(len(indices) for indices in per_room_units.values())
        active_courses = eligible_courses[:]
        course_room_lock: Dict[int, int] = {}

        while (
            remaining_units_slot > 0
            and active_courses
            and any(per_room_units.values())
        ):
            cycle_success = False
            if not active_courses:
                break
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

                chunk_target = min(remaining, quota, remaining_units_slot)
                if chunk_target <= 0:
                    continue

                assigned_chunk = _assign_chunk_to_course(
                    course_id,
                    chunk_target,
                    per_room_units,
                    rooms_order,
                    slot,
                    assignments_units,
                    course_room_lock,
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

                if remaining_units[course_id] > 0 and remaining_units_slot > 0:
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

    return SolveResult(assignments=assignments, unassigned=unassigned)


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
    per_room_units: Dict[int, List[int]],
    rooms_order: List[RoomInput],
    slot: TimeslotInput,
    assignments_units: Dict[tuple[int, int, int], List[int]],
    course_room_lock: Dict[int, int],
) -> int:
    lock_room_id = course_room_lock.get(course_id)
    assigned = 0

    def _consume(room_id: int, available_units: List[int], amount: int) -> int:
        taken = 0
        for _ in range(amount):
            unit_index = available_units.pop(0)
            assignments_units[(course_id, room_id, slot.timeslot_id)].append(unit_index)
            taken += 1
        return taken

    if lock_room_id is not None:
        available = per_room_units.get(lock_room_id)
        if not available:
            return 0
        to_take = min(chunk_target, len(available))
        if to_take <= 0:
            return 0
        assigned = _consume(lock_room_id, available, to_take)
        return assigned

    for room in rooms_order:
        available = per_room_units.get(room.room_id)
        if not available:
            continue
        to_take = min(chunk_target, len(available))
        if to_take <= 0:
            continue
        assigned = _consume(room.room_id, available, to_take)
        if assigned > 0:
            course_room_lock[course_id] = room.room_id
        return assigned

    return 0