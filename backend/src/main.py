from fastapi import FastAPI
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import init_db
from .seed import ensure_default_admin, ensure_demo_data, ensure_app_settings
from .routers import auth, students
from .routers import schedule, teachers, subjects, rooms, courses, users
from .routers import (
    enrollments,
    evaluations,
    grades,
    attendance,
    timeslots,
    course_schedules,
    programs,
    program_semesters,
    settings as settings_router,
)
from .routers import student_schedule
from .routers import course_materials, assignments, files


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    if settings.is_production:
        ensure_default_admin(force_password_reset=True)
        ensure_app_settings()
    else:
        ensure_demo_data()
    yield


app = FastAPI(title="AcademiaPro API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth.router)
app.include_router(students.router)
app.include_router(schedule.router)
app.include_router(student_schedule.router)
app.include_router(teachers.router)
app.include_router(subjects.router)
app.include_router(rooms.router)
app.include_router(courses.router)
app.include_router(users.router)
app.include_router(course_materials.router)
app.include_router(assignments.router)
app.include_router(files.router)
app.include_router(enrollments.router)
app.include_router(evaluations.router)
app.include_router(grades.router)
app.include_router(attendance.router)
app.include_router(timeslots.router)
app.include_router(course_schedules.router)
app.include_router(programs.router)
app.include_router(program_semesters.router)
app.include_router(settings_router.router)


@app.get("/")
def root():
    return {"status": "ok", "service": "AcademiaPro API"}