from fastapi import APIRouter, Depends, HTTPException
from typing import List
from sqlmodel import select

from ..db import get_session
from ..models import Evaluation
from ..security import require_roles


router = APIRouter(prefix="/evaluations", tags=["evaluations"]) 


@router.get("/", response_model=List[Evaluation])
def list_evaluations(session=Depends(get_session), user=Depends(require_roles("admin", "teacher"))):
	return session.exec(select(Evaluation)).all()


@router.post("/", response_model=Evaluation)
def create_evaluation(evaluation: Evaluation, session=Depends(get_session), user=Depends(require_roles("admin", "teacher"))):
	session.add(evaluation)
	session.commit()
	session.refresh(evaluation)
	return evaluation


@router.get("/{evaluation_id}", response_model=Evaluation)
def get_evaluation(evaluation_id: int, session=Depends(get_session), user=Depends(require_roles("admin", "teacher", "student"))):
	obj = session.get(Evaluation, evaluation_id)
	if not obj:
		raise HTTPException(status_code=404, detail="Evaluación no encontrada")
	return obj


@router.put("/{evaluation_id}", response_model=Evaluation)
def update_evaluation(evaluation_id: int, payload: Evaluation, session=Depends(get_session), user=Depends(require_roles("admin", "teacher"))):
	obj = session.get(Evaluation, evaluation_id)
	if not obj:
		raise HTTPException(status_code=404, detail="Evaluación no encontrada")
	for k, v in payload.model_dump(exclude_unset=True).items():
		setattr(obj, k, v)
	session.add(obj)
	session.commit()
	session.refresh(obj)
	return obj


@router.delete("/{evaluation_id}")
def delete_evaluation(evaluation_id: int, session=Depends(get_session), user=Depends(require_roles("admin"))):
	obj = session.get(Evaluation, evaluation_id)
	if not obj:
		raise HTTPException(status_code=404, detail="Evaluación no encontrada")
	session.delete(obj)
	session.commit()
	return {"ok": True}
