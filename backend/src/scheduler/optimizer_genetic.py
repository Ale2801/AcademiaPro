from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence, Tuple

from .optimizer import (
    Constraints,
    CourseInput,
    RoomInput,
    SolveResult,
    TimeslotInput,
    _prioritize_balanced_slots,
    _solve_partial_greedy,
)


@dataclass(frozen=True)
class Chromosome:
    course_order: Tuple[int, ...]
    slot_order: Tuple[int, ...]


def solve_schedule_genetic(
    courses: List[CourseInput],
    rooms: List[RoomInput],
    timeslots: List[TimeslotInput],
    cons: Constraints,
    population_size: int = 8,
    generations: int = 6,
    seed: Optional[int] = None,
) -> SolveResult:
    """Optimiza usando un esquema genético sobre órdenes de cursos y bloques."""

    if not courses or not rooms or not timeslots:
        return _solve_partial_greedy(courses, rooms, timeslots, cons)

    seed_value = (
        seed
        if seed is not None
        else (len(courses) * 1_000_003 + len(timeslots) * 97 + len(rooms) * 17)
    )
    rng = random.Random(seed_value)
    base_slots = (
        _prioritize_balanced_slots(timeslots, cons)
        if cons.lunch_blocks or cons.jornadas
        else list(timeslots)
    )

    population = _seed_population(
        courses,
        base_slots,
        rng,
        max(2, population_size),
    )

    evaluated: Dict[Chromosome, SolveResult] = {}
    for chrom in population:
        evaluated[chrom] = _evaluate(chrom, courses, rooms, base_slots, cons)

    elite_count = max(1, population_size // 4)
    mutation_rate = 0.2
    stagnant_generations = 0
    best_score = max(_score(evaluated[chrom]) for chrom in population)

    for _ in range(max(1, generations)):
        ranked = sorted(population, key=lambda c: _score(evaluated[c]), reverse=True)
        elites = ranked[:elite_count]

        new_population: List[Chromosome] = elites.copy()
        while len(new_population) < population_size:
            parent_a = _select_parent(population, evaluated, rng)
            parent_b = _select_parent(population, evaluated, rng)
            child = _crossover(parent_a, parent_b, rng)
            child = _mutate(child, rng, mutation_rate)
            new_population.append(child)

        population = _enforce_population_size(
            new_population,
            courses,
            base_slots,
            rng,
            population_size,
        )

        for chrom in population:
            if chrom not in evaluated:
                evaluated[chrom] = _evaluate(chrom, courses, rooms, base_slots, cons)

        generation_best = max(_score(evaluated[chrom]) for chrom in population)
        if generation_best <= best_score:
            stagnant_generations += 1
            if stagnant_generations >= 2:
                mutation_rate = min(0.6, mutation_rate * 1.3)
        else:
            best_score = generation_best
            mutation_rate = max(0.1, mutation_rate * 0.85)
            stagnant_generations = 0

    best_chrom = max(population, key=lambda c: _score(evaluated[c]))
    return evaluated[best_chrom]


def _random_chromosome(
    courses: Sequence[CourseInput],
    slots: Sequence[TimeslotInput],
    rng: random.Random,
) -> Chromosome:
    course_ids = [course.course_id for course in courses]
    slot_ids = [slot.timeslot_id for slot in slots]
    rng.shuffle(course_ids)
    rng.shuffle(slot_ids)
    return Chromosome(tuple(course_ids), tuple(slot_ids))


def _evaluate(
    chrom: Chromosome,
    courses: Sequence[CourseInput],
    rooms: Sequence[RoomInput],
    base_slots: Sequence[TimeslotInput],
    cons: Constraints,
) -> SolveResult:
    course_lookup = {course.course_id: course for course in courses}
    ordered_courses = [course_lookup[cid] for cid in chrom.course_order if cid in course_lookup]

    slot_lookup = {slot.timeslot_id: slot for slot in base_slots}
    ordered_slots = [slot_lookup[sid] for sid in chrom.slot_order if sid in slot_lookup]

    if len(ordered_slots) < len(base_slots):
        ordered_slots.extend([slot for slot in base_slots if slot.timeslot_id not in chrom.slot_order])

    if len(ordered_courses) < len(courses):
        ordered_courses.extend([course for course in courses if course.course_id not in chrom.course_order])

    return _solve_partial_greedy(ordered_courses, rooms, ordered_slots, cons)


def _select_parent(
    population: Sequence[Chromosome],
    evaluated: Dict[Chromosome, SolveResult],
    rng: random.Random,
    tournament_size: int = 3,
) -> Chromosome:
    contenders = rng.sample(population, k=min(tournament_size, len(population)))
    return max(contenders, key=lambda chrom: _score(evaluated[chrom]))


def _crossover(
    parent_a: Chromosome,
    parent_b: Chromosome,
    rng: random.Random,
) -> Chromosome:
    child_courses = _order_crossover(parent_a.course_order, parent_b.course_order, rng)
    child_slots = _order_crossover(parent_a.slot_order, parent_b.slot_order, rng)
    return Chromosome(tuple(child_courses), tuple(child_slots))


def _order_crossover(
    seq_a: Sequence[int],
    seq_b: Sequence[int],
    rng: random.Random,
) -> List[int]:
    if len(seq_a) < 2:
        return list(seq_a)
    i, j = sorted(rng.sample(range(len(seq_a)), 2))
    child = [None] * len(seq_a)
    child[i:j] = seq_a[i:j]
    pointer = 0
    for gene in seq_b:
        if gene in child:
            continue
        while pointer < len(child) and child[pointer] is not None:
            pointer += 1
        if pointer < len(child):
            child[pointer] = gene
    return [gene for gene in child if gene is not None]


def _mutate(chrom: Chromosome, rng: random.Random, rate: float = 0.2) -> Chromosome:
    course_list = list(chrom.course_order)
    slot_list = list(chrom.slot_order)

    if len(course_list) >= 2 and rng.random() < rate:
        a, b = rng.sample(range(len(course_list)), 2)
        course_list[a], course_list[b] = course_list[b], course_list[a]

    if len(slot_list) >= 2 and rng.random() < rate:
        a, b = rng.sample(range(len(slot_list)), 2)
        slot_list[a], slot_list[b] = slot_list[b], slot_list[a]

    return Chromosome(tuple(course_list), tuple(slot_list))


def _seed_population(
    courses: Sequence[CourseInput],
    slots: Sequence[TimeslotInput],
    rng: random.Random,
    target_size: int,
) -> List[Chromosome]:
    population: List[Chromosome] = []
    seen = set()

    course_heuristics = _heuristic_course_orders(courses)
    slot_heuristics = _heuristic_slot_orders(slots)

    for course_ids in course_heuristics:
        for slot_ids in slot_heuristics:
            chrom = Chromosome(tuple(course_ids), tuple(slot_ids))
            if chrom not in seen:
                population.append(chrom)
                seen.add(chrom)
            if len(population) >= target_size:
                return population

    while len(population) < target_size:
        chrom = _random_chromosome(courses, slots, rng)
        if chrom not in seen:
            population.append(chrom)
            seen.add(chrom)
    return population


def _heuristic_course_orders(courses: Sequence[CourseInput]) -> List[List[int]]:
    if not courses:
        return [[]]

    natural = [course.course_id for course in courses]
    by_hours = [course.course_id for course in sorted(courses, key=lambda c: (-c.weekly_hours, c.course_id))]
    by_teacher = [course.course_id for course in sorted(courses, key=lambda c: (c.teacher_id or -1, -c.weekly_hours, c.course_id))]
    alternating = list(reversed(by_hours))
    return [natural, by_hours, by_teacher, alternating]


def _heuristic_slot_orders(slots: Sequence[TimeslotInput]) -> List[List[int]]:
    if not slots:
        return [[]]

    natural = [slot.timeslot_id for slot in slots]
    reversed_slots = list(reversed(natural))
    by_day_block = [slot.timeslot_id for slot in sorted(slots, key=lambda s: (s.day, s.block))]
    return [natural, reversed_slots, by_day_block]


def _enforce_population_size(
    candidates: Sequence[Chromosome],
    courses: Sequence[CourseInput],
    slots: Sequence[TimeslotInput],
    rng: random.Random,
    target_size: int,
) -> List[Chromosome]:
    unique = list(dict.fromkeys(candidates))
    while len(unique) < target_size:
        unique.append(_random_chromosome(courses, slots, rng))
    return unique[:target_size]


def _score(result: SolveResult) -> Tuple[int, int, float]:
    return (
        result.performance_metrics.assigned_courses,
        -len(result.unassigned),
        result.performance_metrics.fill_rate,
    )
