from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, List, Optional
from pydantic import ConfigDict
from sqlmodel import Field, select

from ..db import get_session
from ..models import Subject, SubjectBase, SubjectPrerequisite
from ..security import require_roles
from ..utils.sqlmodel_helpers import apply_partial_update


router = APIRouter(prefix="/subjects", tags=["subjects"]) 



class SubjectInput(SubjectBase, table=False):
    prerequisite_subject_ids: List[int] = Field(default_factory=list)
    id: Optional[int] = None


class SubjectOutput(SubjectBase, table=False):
    id: int
    prerequisite_subject_ids: List[int] = Field(default_factory=list)
    model_config = ConfigDict(from_attributes=True)


@router.get("/", response_model=List[SubjectOutput])
def list_subjects(session=Depends(get_session), user=Depends(require_roles("admin", "coordinator", "teacher", "student"))):
    subjects = session.exec(select(Subject)).all()
    return _build_subject_collection(session, subjects)


@router.post("/", response_model=SubjectOutput)
def create_subject(payload: SubjectInput, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator"))):
    data = payload.model_dump()
    prereq_ids = data.pop("prerequisite_subject_ids", [])
    subject = Subject(**data)
    session.add(subject)
    session.commit()
    session.refresh(subject)
    if prereq_ids:
        validated = _validate_prerequisite_ids(session, prereq_ids, subject.id)
        _replace_prerequisites(session, subject.id, validated)
        session.commit()
    return _build_subject_response(session, subject)


@router.get("/{subject_id}", response_model=SubjectOutput)
def get_subject(subject_id: int, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator", "teacher", "student"))):
    obj = session.get(Subject, subject_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Asignatura no encontrada")
    return _build_subject_response(session, obj)


@router.put("/{subject_id}", response_model=SubjectOutput)
def update_subject(subject_id: int, payload: SubjectInput, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator"))):
    obj = session.get(Subject, subject_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Asignatura no encontrada")
    update_data = payload.model_dump(exclude_unset=True)
    prereq_ids = update_data.pop("prerequisite_subject_ids", None)
    if update_data:
        apply_partial_update(obj, update_data)
        session.add(obj)
        session.commit()
        session.refresh(obj)
    if prereq_ids is not None:
        validated = _validate_prerequisite_ids(session, prereq_ids, subject_id)
        _replace_prerequisites(session, subject_id, validated)
        session.commit()
    return _build_subject_response(session, obj)


@router.delete("/{subject_id}")
def delete_subject(subject_id: int, session=Depends(get_session), user=Depends(require_roles("admin", "coordinator"))):
    obj = session.get(Subject, subject_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Asignatura no encontrada")
    _clear_prerequisite_links(session, subject_id)
    session.delete(obj)
    session.commit()
    return {"ok": True}


def _build_subject_collection(session, subjects: List[Subject]) -> List[SubjectOutput]:
    if not subjects:
        return []
    subject_ids = [subject.id for subject in subjects if subject.id]
    prereq_map = _load_prerequisite_map(session, subject_ids) if subject_ids else {}
    return [
        SubjectOutput.model_validate(
            subject,
            update={"prerequisite_subject_ids": prereq_map.get(subject.id, []) if subject.id else []},
        )
        for subject in subjects
    ]


def _build_subject_response(session, subject: Subject) -> SubjectOutput:
    prereq_ids: List[int] = []
    if subject.id:
        prereq_map = _load_prerequisite_map(session, [subject.id])
        prereq_ids = prereq_map.get(subject.id, [])
    return SubjectOutput.model_validate(subject, update={"prerequisite_subject_ids": prereq_ids})


def _load_prerequisite_map(session, subject_ids: List[int]) -> Dict[int, List[int]]:
    if not subject_ids:
        return {}
    rows = session.exec(
        select(SubjectPrerequisite.subject_id, SubjectPrerequisite.prerequisite_subject_id)
        .where(SubjectPrerequisite.subject_id.in_(subject_ids))
    ).all()
    mapping: Dict[int, List[int]] = {}
    for subject_id, prereq_id in rows:
        mapping.setdefault(subject_id, []).append(prereq_id)
    return mapping


def _validate_prerequisite_ids(session, prerequisite_ids: List[int], subject_id: int | None) -> List[int]:
    if not prerequisite_ids:
        return []
    unique_ids: List[int] = []
    seen = set()
    for prereq_id in prerequisite_ids:
        if subject_id is not None and prereq_id == subject_id:
            raise HTTPException(status_code=400, detail="Una asignatura no puede ser prerrequisito de sí misma")
        if prereq_id in seen:
            continue
        seen.add(prereq_id)
        unique_ids.append(prereq_id)
    if not unique_ids:
        return []
    existing = session.exec(select(Subject.id).where(Subject.id.in_(unique_ids))).all()
    found: set[int] = set()
    for item in existing:
        if isinstance(item, tuple):
            found.add(item[0])
        else:
            found.add(int(item))
    missing = [pid for pid in unique_ids if pid not in found]
    if missing:
        raise HTTPException(status_code=404, detail=f"Prerrequisitos no encontrados: {missing}")
    return unique_ids


def _replace_prerequisites(session, subject_id: int, prerequisite_ids: List[int]) -> None:
    existing = session.exec(select(SubjectPrerequisite).where(SubjectPrerequisite.subject_id == subject_id)).all()
    for link in existing:
        session.delete(link)
    for prereq_id in prerequisite_ids:
        session.add(SubjectPrerequisite(subject_id=subject_id, prerequisite_subject_id=prereq_id))


def _clear_prerequisite_links(session, subject_id: int) -> None:
    links = session.exec(
        select(SubjectPrerequisite).where(SubjectPrerequisite.subject_id == subject_id)
    ).all()
    for link in links:
        session.delete(link)
    dependent_links = session.exec(
        select(SubjectPrerequisite).where(SubjectPrerequisite.prerequisite_subject_id == subject_id)
    ).all()
    for link in dependent_links:
        session.delete(link)