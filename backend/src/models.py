from datetime import datetime, date, time
from typing import Optional
from enum import Enum
from sqlmodel import SQLModel, Field, Relationship


class Timestamped(SQLModel):
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)


# Enums útiles para el dominio escolar
class GenderEnum(str, Enum):
    male = "male"
    female = "female"
    other = "other"
    unspecified = "unspecified"


class DocTypeEnum(str, Enum):
    dni = "dni"
    passport = "passport"
    other = "other"


class EmploymentTypeEnum(str, Enum):
    full_time = "full_time"
    part_time = "part_time"
    contract = "contract"


class RoomTypeEnum(str, Enum):
    classroom = "classroom"
    lab = "lab"
    auditorium = "auditorium"
    office = "office"


class ModalityEnum(str, Enum):
    in_person = "in_person"
    online = "online"
    hybrid = "hybrid"


class EnrollmentStatusEnum(str, Enum):
    enrolled = "enrolled"
    dropped = "dropped"
    completed = "completed"
    failed = "failed"
    withdrawn = "withdrawn"


class StudentStatusEnum(str, Enum):
    active = "active"
    suspended = "suspended"
    graduated = "graduated"
    withdrawn = "withdrawn"


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    full_name: str
    hashed_password: str
    role: str = Field(index=True)  # admin, teacher, student
    is_active: bool = Field(default=True)
    # Datos personales y de contacto
    phone: Optional[str] = None
    secondary_email: Optional[str] = None
    document_type: Optional[DocTypeEnum] = Field(default=None, sa_column_kwargs={"nullable": True})
    national_id: Optional[str] = None
    birth_date: Optional[date] = None
    gender: Optional[GenderEnum] = Field(default=None, sa_column_kwargs={"nullable": True})
    address_line: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    postal_code: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None


class Student(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    enrollment_year: int
    # Información académica adicional
    registration_number: Optional[str] = Field(default=None, unique=False, index=True)
    program_id: Optional[int] = Field(default=None, foreign_key="program.id")
    grade_level: Optional[str] = Field(default=None, description="Grado/curso actual (si aplica)")
    section: Optional[str] = None
    modality: Optional[ModalityEnum] = Field(default=None, sa_column_kwargs={"nullable": True})
    status: StudentStatusEnum = Field(default=StudentStatusEnum.active)
    admission_date: Optional[date] = None
    expected_graduation_date: Optional[date] = None
    gpa: Optional[float] = None
    current_term: Optional[str] = None
    guardian_name: Optional[str] = None
    guardian_phone: Optional[str] = None


class Teacher(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    department: Optional[str] = None
    phone: Optional[str] = None
    hire_date: Optional[date] = None
    employment_type: Optional[EmploymentTypeEnum] = Field(default=None, sa_column_kwargs={"nullable": True})
    office: Optional[str] = None
    specialty: Optional[str] = None
    bio: Optional[str] = None


class Room(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(index=True, unique=True)
    capacity: int
    building: Optional[str] = None
    room_type: RoomTypeEnum = Field(default=RoomTypeEnum.classroom)
    campus: Optional[str] = None
    floor: Optional[str] = None
    has_projector: bool = Field(default=False)
    has_computers: bool = Field(default=False)
    notes: Optional[str] = None


class Subject(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(index=True, unique=True)
    name: str
    credits: int
    description: Optional[str] = None
    department: Optional[str] = None
    level: Optional[str] = None  # basic/intermediate/advanced u otro criterio
    program_id: Optional[int] = Field(default=None, foreign_key="program.id")
    hours_per_week: Optional[int] = None


class Course(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    subject_id: int = Field(foreign_key="subject.id")
    teacher_id: int = Field(foreign_key="teacher.id")
    term: str = Field(index=True)  # e.g., 2025-2
    group: str = Field(default="A")  # section/group
    weekly_hours: int = Field(default=3)
    capacity: Optional[int] = None
    language: Optional[str] = None
    modality: Optional[ModalityEnum] = Field(default=None, sa_column_kwargs={"nullable": True})
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    syllabus_url: Optional[str] = None
    location_notes: Optional[str] = None


class Enrollment(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    student_id: int = Field(foreign_key="student.id")
    course_id: int = Field(foreign_key="course.id")
    enrolled_at: datetime = Field(default_factory=datetime.utcnow)
    status: EnrollmentStatusEnum = Field(default=EnrollmentStatusEnum.enrolled)
    final_grade: Optional[float] = None
    dropped_at: Optional[datetime] = None
    notes: Optional[str] = None


class Evaluation(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    course_id: int = Field(foreign_key="course.id")
    name: str
    weight: float  # 0-1
    scheduled_at: Optional[datetime] = Field(default=None)
    max_score: float = Field(default=100)
    due_date: Optional[datetime] = None
    description: Optional[str] = None


class Grade(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    enrollment_id: int = Field(foreign_key="enrollment.id")
    evaluation_id: int = Field(foreign_key="evaluation.id")
    score: float
    graded_at: Optional[datetime] = None
    feedback: Optional[str] = None


class Attendance(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    enrollment_id: int = Field(foreign_key="enrollment.id")
    session_date: date
    present: bool = Field(default=True)
    arrival_time: Optional[time] = None
    notes: Optional[str] = None


class Timeslot(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    day_of_week: int  # 0=Mon
    start_time: time
    end_time: time
    campus: Optional[str] = None
    comment: Optional[str] = None


class CourseSchedule(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    course_id: int = Field(foreign_key="course.id")
    room_id: int = Field(foreign_key="room.id")
    timeslot_id: int = Field(foreign_key="timeslot.id")


class Program(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(index=True, unique=True)
    name: str
    level: Optional[str] = Field(default=None, description="undergrad/postgrad/secondary/technical")
    duration_semesters: Optional[int] = None
    description: Optional[str] = None