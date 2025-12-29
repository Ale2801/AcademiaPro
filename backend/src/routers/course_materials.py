from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import SQLModel, select

from ..db import get_session
from ..models import Course, CourseMaterial, MaterialTypeEnum, Enrollment
from ..security import require_roles
from ..utils.course_access import ensure_course_access, ensure_teacher_course_permission, require_student, require_teacher

router = APIRouter(prefix="/course-materials", tags=["course-materials"])


class CourseMaterialCreate(SQLModel):
    course_id: int
    title: str
    description: Optional[str] = None
    material_type: MaterialTypeEnum = MaterialTypeEnum.document
    file_url: Optional[str] = None
    external_url: Optional[str] = None
    display_order: Optional[int] = None
    is_published: bool = True
    published_at: Optional[datetime] = None


class CourseMaterialUpdate(SQLModel):
    title: Optional[str] = None
    description: Optional[str] = None
    material_type: Optional[MaterialTypeEnum] = None
    file_url: Optional[str] = None
    external_url: Optional[str] = None
    display_order: Optional[int] = None
    is_published: Optional[bool] = None
    published_at: Optional[datetime] = None


@router.get("/", response_model=List[CourseMaterial])
def list_materials(
    course_id: Optional[int] = None,
    session=Depends(get_session),
    user=Depends(require_roles("admin", "coordinator", "teacher", "student")),
):
    stmt = select(CourseMaterial).join(Course, CourseMaterial.course_id == Course.id)

    if course_id is not None:
        ensure_course_access(session, user, course_id)
        stmt = stmt.where(CourseMaterial.course_id == course_id)

    if user.role == "teacher":
        teacher = require_teacher(session, user)
        stmt = stmt.where(Course.teacher_id == teacher.id)
    elif user.role == "student":
        student = require_student(session, user)
        stmt = (
            stmt.join(Enrollment, Enrollment.course_id == Course.id)
            .where(Enrollment.student_id == student.id)
            .where(CourseMaterial.is_published == True)
        )

    stmt = stmt.order_by(CourseMaterial.display_order, CourseMaterial.created_at.desc())
    return session.exec(stmt).all()


@router.post("/", response_model=CourseMaterial, status_code=status.HTTP_201_CREATED)
def create_material(
    payload: CourseMaterialCreate,
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

    material = CourseMaterial(
        course_id=course.id,
        title=payload.title,
        description=payload.description,
        material_type=payload.material_type,
        file_url=payload.file_url,
        external_url=payload.external_url,
        display_order=payload.display_order,
        is_published=payload.is_published,
        published_at=payload.published_at,
        teacher_id=assigned_teacher_id,
        created_by_user_id=user.id,
    )
    if material.is_published and material.published_at is None:
        material.published_at = datetime.utcnow()

    session.add(material)
    session.commit()
    session.refresh(material)
    return material


@router.put("/{material_id}", response_model=CourseMaterial)
def update_material(
    material_id: int,
    payload: CourseMaterialUpdate,
    session=Depends(get_session),
    user=Depends(require_roles("admin", "coordinator", "teacher")),
):
    material = session.get(CourseMaterial, material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Material no encontrado")

    ensure_teacher_course_permission(session, user, material.course_id)

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(material, field, value)

    if material.is_published and material.published_at is None:
        material.published_at = datetime.utcnow()
    material.updated_at = datetime.utcnow()

    session.add(material)
    session.commit()
    session.refresh(material)
    return material


@router.delete("/{material_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_material(
    material_id: int,
    session=Depends(get_session),
    user=Depends(require_roles("admin", "coordinator", "teacher")),
):
    material = session.get(CourseMaterial, material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Material no encontrado")

    ensure_teacher_course_permission(session, user, material.course_id)

    session.delete(material)
    session.commit()
    return None