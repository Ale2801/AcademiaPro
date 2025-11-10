"""Shared helpers to safely apply partial updates on SQLModel instances.

These utilities make sure incoming payloads coming from FastAPI requests are
cast back to the python types declared in the SQLModel models (e.g. `date`,
`datetime`, enums) before we touch the database layer. This prevents issues
like passing ISO formatted strings to SQLite date columns which otherwise lead
to runtime errors.
"""

from __future__ import annotations

from typing import Any, Dict, Type, TypeVar

from pydantic import TypeAdapter, ValidationError
from sqlmodel import SQLModel


TModel = TypeVar("TModel", bound=SQLModel)


def _coerce_field_value(model: Type[TModel], field_name: str, value: Any) -> Any:
    """Coerce *value* to the python type declared in ``model`` for ``field_name``.

    If the field does not exist or coercion fails we silently return the value
    as-is so that the original behaviour is preserved. This keeps the helper
    safe to use across all CRUD routers without over-validating payloads.
    """

    if value is None:
        return None

    field = model.model_fields.get(field_name)
    if field is None:
        return value

    adapter = TypeAdapter(field.annotation)
    try:
        # ``validate_python`` returns the python-native value according to the
        # annotation (e.g. "2025-10-30" -> date(2025, 10, 30)).
        return adapter.validate_python(value)
    except ValidationError:
        return value


def normalize_payload_for_model(model: Type[TModel], data: Dict[str, Any]) -> Dict[str, Any]:
    """Return a copy of *data* with values coerced to ``model`` field types."""

    coerced: Dict[str, Any] = {}
    for key, value in data.items():
        if key == "id":
            # Never allow payloads to override primary keys during updates.
            continue
        coerced[key] = _coerce_field_value(model, key, value)
    return coerced


def apply_partial_update(instance: TModel, data: Dict[str, Any]) -> TModel:
    """Coerce *data* and assign the resulting values into *instance*.

    Returns the same instance to allow chaining inside the routers.
    """

    model = type(instance)
    coerced = normalize_payload_for_model(model, data)
    for key, value in coerced.items():
        setattr(instance, key, value)
    return instance
