from fastapi import HTTPException, status
from sqlmodel import select

from ..models import Course, Teacher, Student, Enrollment


def require_teacher(session, user):
    teacher = session.exec(select(Teacher).where(Teacher.user_id == user.id)).first()
    if not teacher:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Se requiere un perfil docente asignado.")
    return teacher


def require_student(session, user):
    student = session.exec(select(Student).where(Student.user_id == user.id)).first()
    if not student:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Se requiere un perfil de estudiante asignado.")
    return student


def ensure_course_access(session, user, course_id: int) -> Course:
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Curso no encontrado")

    if user.role in ("admin", "coordinator"):
        return course

    if user.role == "teacher":
        teacher = require_teacher(session, user)
        if course.teacher_id != teacher.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No estás asignado a este curso")
        return course

    if user.role == "student":
        student = require_student(session, user)
        enrollment = session.exec(
            select(Enrollment).where(Enrollment.course_id == course.id, Enrollment.student_id == student.id)
        ).first()
        if not enrollment:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No estás inscrito en este curso")
        return course

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Rol sin permisos para acceder al curso")


def ensure_teacher_course_permission(session, user, course_id: int) -> Course:
    course = ensure_course_access(session, user, course_id)
    if user.role in ("admin", "coordinator"):
        return course
    teacher = require_teacher(session, user)
    if course.teacher_id != teacher.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="El curso pertenece a otro docente")
    return course


def ensure_teacher_for_assignment(session, user, assignment):
    course = session.get(Course, assignment.course_id)
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Curso no encontrado")
    if user.role in ("admin", "coordinator"):
        return course
    teacher = require_teacher(session, user)
    if assignment.teacher_id and assignment.teacher_id != teacher.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="La tarea está asignada a otro docente")
    if course.teacher_id != teacher.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No estás asignado a este curso")
    return course
