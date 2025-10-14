from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass

try:
    from ortools.sat.python import cp_model
    HAS_ORTOOLS = True
except Exception:
    HAS_ORTOOLS = False


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


@dataclass
class Constraints:
    teacher_availability: Dict[int, List[int]]  # teacher_id -> allowed timeslot_ids
    room_allowed: Optional[Dict[int, List[int]]] = None  # room_id -> allowed timeslot_ids
    max_consecutive_blocks: int = 3
    min_gap_blocks: int = 0


def solve_schedule(courses: List[CourseInput], rooms: List[RoomInput], timeslots: List[TimeslotInput], cons: Constraints) -> List[Tuple[int, int, int]]:
    """
    Return list of (course_id, room_id, timeslot_id), one per hour required.
    If OR-Tools not available, use greedy fallback.
    """
    if HAS_ORTOOLS:
        return _solve_cp_sat(courses, rooms, timeslots, cons)
    return _solve_greedy(courses, rooms, timeslots, cons)


def _solve_cp_sat(courses, rooms, timeslots, cons) -> List[Tuple[int, int, int]]:
    model = cp_model.CpModel()
    T = [t.timeslot_id for t in timeslots]
    R = [r.room_id for r in rooms]

    # Variables x[c_index, r, t] in {0,1}
    x = {}
    for ci, c in enumerate(courses):
        for r in R:
            for t in T:
                x[(ci, r, t)] = model.NewBoolVar(f"x_c{c.course_id}_r{r}_t{t}")

    # Each course must be assigned exactly weekly_hours slots
    for ci, c in enumerate(courses):
        model.Add(sum(x[(ci, r, t)] for r in R for t in T) == c.weekly_hours)

    # Room/time uniqueness
    for r in R:
        for t in T:
            model.Add(sum(x[(ci, r, t)] for ci, _ in enumerate(courses)) <= 1)

    # Teacher availability and no double booking per timeslot
    teacher_to_idx = {c.teacher_id: [] for c in courses}
    for ci, c in enumerate(courses):
        teacher_to_idx[c.teacher_id].append(ci)
        allowed = set(cons.teacher_availability.get(c.teacher_id, T))
        for t in T:
            if t not in allowed:
                for r in R:
                    model.Add(x[(ci, r, t)] == 0)

    for t in T:
        for teacher_id, idxs in teacher_to_idx.items():
            model.Add(sum(x[(ci, r, t)] for ci in idxs for r in R) <= 1)

    # Optional room_allowed
    if cons.room_allowed:
        for r in R:
            allowed = set(cons.room_allowed.get(r, T))
            for t in T:
                if t not in allowed:
                    for ci, _ in enumerate(courses):
                        model.Add(x[(ci, r, t)] == 0)

    # Enforce minimum gaps between clases for each teacher per day
    if cons.min_gap_blocks > 0:
        slots_by_day: Dict[int, List[TimeslotInput]] = {}
        for slot in timeslots:
            slots_by_day.setdefault(slot.day, []).append(slot)

        for day, slot_list in slots_by_day.items():
            ordered = sorted(slot_list, key=lambda s: s.block)
            for idx in range(len(ordered)):
                current = ordered[idx]
                for next_idx in range(idx + 1, len(ordered)):
                    nxt = ordered[next_idx]
                    block_diff = nxt.block - current.block
                    if block_diff == 0:
                        continue
                    if block_diff <= cons.min_gap_blocks:
                        t1 = current.timeslot_id
                        t2 = nxt.timeslot_id
                        for teacher_id, course_indexes in teacher_to_idx.items():
                            model.Add(
                                sum(x[(ci, r, t1)] for ci in course_indexes for r in R)
                                + sum(x[(ci, r, t2)] for ci in course_indexes for r in R)
                                <= 1
                            )
                    else:
                        break

    # Soft constraint: limit consecutive blocks per course per day
    # We approximate by discouraging 4+ consecutive via minimization
    obj_terms = []
    slot_by_day_block = {t.timeslot_id: (t.day, t.block) for t in timeslots}
    for ci, c in enumerate(courses):
        for day in set(d for _, (d, _) in slot_by_day_block.items()):
            # For each sequence of cons.max_consecutive_blocks+1 blocks, penalize if all are used
            day_blocks = sorted([b for tid, (d, b) in slot_by_day_block.items() if d == day])
            unique_blocks = sorted(set(day_blocks))
            for i in range(0, max(0, len(unique_blocks) - cons.max_consecutive_blocks)):
                window = unique_blocks[i : i + cons.max_consecutive_blocks + 1]
                for r in R:
                    w_vars = [sum(x[(ci, r, t)] for t, (d, b) in slot_by_day_block.items() if d == day and b == wb) for wb in window]
                    win = model.NewIntVar(0, len(window), f"win_c{ci}_d{day}_i{i}_r{r}")
                    model.Add(win == sum(w_vars))
                    # Penalize if equals len(window)
                    penalty = model.NewBoolVar(f"pen_c{ci}_d{day}_i{i}_r{r}")
                    model.Add(win == len(window)).OnlyEnforceIf(penalty)
                    model.Add(win != len(window)).OnlyEnforceIf(penalty.Not())
                    obj_terms.append(penalty)

    model.Minimize(sum(obj_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 10.0
    res = solver.Solve(model)
    if res not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return []

    out = []
    for ci, c in enumerate(courses):
        for r in R:
            for t in T:
                if solver.Value(x[(ci, r, t)]) == 1:
                    out.append((c.course_id, r, t))
    return out


def _solve_greedy(courses, rooms, timeslots, cons) -> List[Tuple[int, int, int]]:
    # Simple greedy: iterate courses and fill first available slots
    out: List[Tuple[int, int, int]] = []
    used_rt = set()
    T = [t.timeslot_id for t in timeslots]
    teacher_busy = {c.teacher_id: set() for c in courses}
    teacher_day_blocks: Dict[int, Dict[int, List[int]]] = {c.teacher_id: {} for c in courses}
    slot_lookup: Dict[int, TimeslotInput] = {t.timeslot_id: t for t in timeslots}
    for c in courses:
        allowed_t = cons.teacher_availability.get(c.teacher_id, T)
        assigned = 0
        for t in allowed_t:
            if assigned >= c.weekly_hours:
                break
            # avoid teacher double booking
            if t in teacher_busy[c.teacher_id]:
                continue
            meta = slot_lookup.get(t)
            if not meta:
                continue
            if cons.min_gap_blocks > 0:
                day_blocks = teacher_day_blocks[c.teacher_id].setdefault(meta.day, [])
                violates = any(abs(meta.block - existing) <= cons.min_gap_blocks for existing in day_blocks)
                if violates:
                    continue
            # find free room
            for r in rooms:
                if (r.room_id, t) in used_rt:
                    continue
                if cons.room_allowed and t not in cons.room_allowed.get(r.room_id, T):
                    continue
                out.append((c.course_id, r.room_id, t))
                used_rt.add((r.room_id, t))
                teacher_busy[c.teacher_id].add(t)
                teacher_day_blocks[c.teacher_id].setdefault(meta.day, []).append(meta.block)
                assigned += 1
                break
    return out