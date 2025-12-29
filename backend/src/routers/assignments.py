from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import SQLModel, select

from ..db import get_session
from ..models import (
    Assignment,
    AssignmentSubmission,
    AssignmentTypeEnum,
    SubmissionStatusEnum,
    Course,
    Enrollment,
)
from ..security import require_roles
from ..utils.course_access import (
    ensure_course_access,
    ensure_teacher_course_permission,
    ensure_teacher_for_assignment,
    require_student,
    require_teacher,
)

router = APIRouter(prefix="/assignments", tags=["assignments"])


class AssignmentCreate(SQLModel):
    course_id: int
    title: str
    instructions: Optional[str] = None
    assignment_type: AssignmentTypeEnum = AssignmentTypeEnum.homework
    available_from: Optional[datetime] = None
    due_date: Optional[datetime] = None
    allow_late: bool = False
    max_score: float = 100
    resource_url: Optional[str] = None
    attachment_url: Optional[str] = None
    attachment_name: Optional[str] = None
    is_published: bool = True
    published_at: Optional[datetime] = None


class AssignmentUpdate(SQLModel):
    title: Optional[str] = None
    instructions: Optional[str] = None
    assignment_type: Optional[AssignmentTypeEnum] = None
    available_from: Optional[datetime] = None
    due_date: Optional[datetime] = None
    allow_late: Optional[bool] = None
    max_score: Optional[float] = None
    resource_url: Optional[str] = None
    attachment_url: Optional[str] = None
    attachment_name: Optional[str] = None
    is_published: Optional[bool] = None
    published_at: Optional[datetime] = None


class SubmissionCreate(SQLModel):
    text_response: Optional[str] = None
    file_url: Optional[str] = None
    external_url: Optional[str] = None


class SubmissionGrade(SQLModel):
    score: float
    feedback: Optional[str] = None


@router.get("/", response_model=List[Assignment])
def list_assignments(
    course_id: Optional[int] = None,
    session=Depends(get_session),
    user=Depends(require_roles("admin", "coordinator", "teacher", "student")),
):
    stmt = select(Assignment).join(Course, Assignment.course_id == Course.id)

    if course_id is not None:
        ensure_course_access(session, user, course_id)
        stmt = stmt.where(Assignment.course_id == course_id)

    if user.role == "teacher":
        teacher = require_teacher(session, user)
        stmt = stmt.where(Course.teacher_id == teacher.id)
    elif user.role == "student":
        student = require_student(session, user)
        stmt = (
            stmt.join(Enrollment, Enrollment.course_id == Course.id)
            .where(Enrollment.student_id == student.id)
            .where(Assignment.is_published == True)
        )

    stmt = stmt.order_by(Assignment.due_date, Assignment.created_at.desc())
    return session.exec(stmt).all()


@router.post("/", response_model=Assignment, status_code=status.HTTP_201_CREATED)
def create_assignment(
    payload: AssignmentCreate,
    session=Depends(get_session),
    user=Depends(require_roles("admin", "coordinator", "teacher")),
):
    course = session.get(Course, payload.course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Curso no encontrado")

    assigned_teacher_id: Optional[int] = None
    if user.role == "teacher":
        ensure_teacher_course_permission(session, user, course.id)
        teacher = require_teacher(session, user)
        assigned_teacher_id = teacher.id
    else:
        assigned_teacher_id = course.teacher_id

    assignment = Assignment(
        course_id=course.id,
        title=payload.title,
        instructions=payload.instructions,
        assignment_type=payload.assignment_type,
        available_from=payload.available_from,
        due_date=payload.due_date,
        allow_late=payload.allow_late,
        max_score=payload.max_score,
        resource_url=payload.resource_url,
        attachment_url=payload.attachment_url,
        attachment_name=payload.attachment_name,
        is_published=payload.is_published,
        published_at=payload.published_at,
        teacher_id=assigned_teacher_id,
    )
    if assignment.is_published and assignment.published_at is None:
        assignment.published_at = datetime.utcnow()

    session.add(assignment)
    session.commit()
    session.refresh(assignment)
    return assignment


@router.get("/{assignment_id}", response_model=Assignment)
def get_assignment(
    assignment_id: int,
    session=Depends(get_session),
    user=Depends(require_roles("admin", "coordinator", "teacher", "student")),
):
    assignment = session.get(Assignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")

    ensure_course_access(session, user, assignment.course_id)
    if user.role == "student" and not assignment.is_published:
        raise HTTPException(status_code=403, detail="La tarea aún no está publicada")
    return assignment


@router.put("/{assignment_id}", response_model=Assignment)
def update_assignment(
    assignment_id: int,
    payload: AssignmentUpdate,
    session=Depends(get_session),
    user=Depends(require_roles("admin", "coordinator", "teacher")),
):
    assignment = session.get(Assignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")

    ensure_teacher_for_assignment(session, user, assignment)
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(assignment, field, value)

    if assignment.is_published and assignment.published_at is None:
        assignment.published_at = datetime.utcnow()
    assignment.updated_at = datetime.utcnow()

    session.add(assignment)
    session.commit()
    session.refresh(assignment)
    return assignment


@router.delete("/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_assignment(
    assignment_id: int,
    session=Depends(get_session),
    user=Depends(require_roles("admin", "coordinator", "teacher")),
):
    assignment = session.get(Assignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")

    ensure_teacher_for_assignment(session, user, assignment)
    session.delete(assignment)
    session.commit()
    return None


@router.get("/{assignment_id}/submissions", response_model=List[AssignmentSubmission])
def list_submissions(
    assignment_id: int,
    mine: bool = False,
    session=Depends(get_session),
    user=Depends(require_roles("admin", "coordinator", "teacher", "student")),
):
    assignment = session.get(Assignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")

    ensure_course_access(session, user, assignment.course_id)

    stmt = select(AssignmentSubmission).where(AssignmentSubmission.assignment_id == assignment_id)
    if mine:
        if user.role != "student":
            raise HTTPException(status_code=400, detail="Solo los estudiantes pueden ver su propia entrega")
        student = require_student(session, user)
        stmt = stmt.where(AssignmentSubmission.student_id == student.id)
    else:
        if user.role == "student":
            raise HTTPException(status_code=403, detail="No autorizado a ver las entregas de otros compañeros")
        ensure_teacher_for_assignment(session, user, assignment)

    stmt = stmt.order_by(AssignmentSubmission.submitted_at.desc())
    return session.exec(stmt).all()


@router.post("/{assignment_id}/submissions", response_model=AssignmentSubmission)
def submit_assignment(
    assignment_id: int,
    payload: SubmissionCreate,
    session=Depends(get_session),
    user=Depends(require_roles("student")),
):
    assignment = session.get(Assignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")

    if not assignment.is_published:
        raise HTTPException(status_code=403, detail="La tarea aún no está disponible")

    student = require_student(session, user)
    enrollment = session.exec(
        select(Enrollment).where(Enrollment.course_id == assignment.course_id, Enrollment.student_id == student.id)
    ).first()
    if not enrollment:
        raise HTTPException(status_code=403, detail="No estás inscrito en este curso")

    submission = session.exec(
        select(AssignmentSubmission).where(
            AssignmentSubmission.assignment_id == assignment_id,
            AssignmentSubmission.enrollment_id == enrollment.id,
        )
    ).first()

    now = datetime.utcnow()
    is_late = bool(assignment.due_date and now > assignment.due_date)

    if submission is None:
        submission = AssignmentSubmission(
            assignment_id=assignment_id,
            enrollment_id=enrollment.id,
            student_id=student.id,
            status=SubmissionStatusEnum.submitted,
            submitted_at=now,
            text_response=payload.text_response,
            file_url=payload.file_url,
            external_url=payload.external_url,
            is_late=is_late,
        )
        session.add(submission)
    else:
        submission.text_response = payload.text_response
        submission.file_url = payload.file_url
        submission.external_url = payload.external_url
        submission.status = SubmissionStatusEnum.submitted
        submission.submitted_at = now
        submission.updated_at = now
        submission.is_late = is_late

    session.commit()
    session.refresh(submission)
    return submission


@router.post("/submissions/{submission_id}/grade", response_model=AssignmentSubmission)
def grade_submission(
    submission_id: int,
    payload: SubmissionGrade,
    session=Depends(get_session),
    user=Depends(require_roles("admin", "coordinator", "teacher")),
):
    submission = session.get(AssignmentSubmission, submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Entrega no encontrada")

    assignment = session.get(Assignment, submission.assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")

    ensure_teacher_for_assignment(session, user, assignment)

    submission.grade_score = payload.score
    submission.feedback = payload.feedback
    submission.graded_at = datetime.utcnow()
    submission.status = SubmissionStatusEnum.graded
    if user.role == "teacher":
        teacher = require_teacher(session, user)
        submission.graded_by = teacher.id
    submission.updated_at = datetime.utcnow()

    session.add(submission)
    session.commit()
    session.refresh(submission)
    return submission
