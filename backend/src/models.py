from datetime import datetime, date, time
from typing import Optional
from enum import Enum
from sqlalchemy import UniqueConstraint
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


class MaterialTypeEnum(str, Enum):
    document = "document"
    link = "link"
    video = "video"
    resource = "resource"
    other = "other"


class AssignmentTypeEnum(str, Enum):
    homework = "homework"
    project = "project"
    quiz = "quiz"
    exam = "exam"
    other = "other"


class SubmissionStatusEnum(str, Enum):
    draft = "draft"
    submitted = "submitted"
    graded = "graded"
    returned = "returned"


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


class StudyShiftEnum(str, Enum):
    diurna = "diurna"
    vespertina = "vespertina"
    mixta = "mixta"
    ejecutiva = "ejecutiva"


class AdmissionTypeEnum(str, Enum):
    paes = "paes"
    pace = "pace"
    traslado = "traslado"
    especial = "especial"
    otra = "otra"


class FinancingTypeEnum(str, Enum):
    gratuidad = "gratuidad"
    beca = "beca"
    credito = "credito"
    particular = "particular"
    empresa = "empresa"


class ProgramEnrollmentStatusEnum(str, Enum):
    active = "active"
    completed = "completed"
    withdrawn = "withdrawn"


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    full_name: str
    hashed_password: str
    role: str = Field(index=True)  # valores permitidos: admin, coordinator, teacher, student
    is_active: bool = Field(default=True)
    must_change_password: bool = Field(default=False, nullable=False)
    profile_image: Optional[str] = Field(default=None, sa_column_kwargs={"nullable": True})
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


class Program(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(index=True, unique=True)
    name: str
    level: Optional[str] = Field(default=None, description="undergrad/postgrad/secondary/technical")
    duration_semesters: Optional[int] = None
    description: Optional[str] = None
    is_active: bool = Field(default=True)


class ProgramSemesterStateEnum(str, Enum):
    planned = "planned"
    current = "current"
    finished = "finished"


class ProgramSemester(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    program_id: int = Field(foreign_key="program.id", index=True)
    semester_number: int = Field(description="Número secuencial del semestre dentro del programa")
    label: Optional[str] = Field(default=None, description="Etiqueta legible del semestre")
    description: Optional[str] = None
    is_active: bool = Field(default=True)
    state: ProgramSemesterStateEnum = Field(default=ProgramSemesterStateEnum.planned, index=True)


class Student(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    enrollment_year: int
    # Información académica adicional
    registration_number: Optional[str] = Field(default=None, unique=False, index=True)
    program_id: int = Field(foreign_key="program.id")
    grade_level: Optional[str] = Field(default=None, description="Grado/curso actual (si aplica)")
    section: Optional[str] = None
    modality: Optional[ModalityEnum] = Field(default=None, sa_column_kwargs={"nullable": True})
    status: StudentStatusEnum = Field(default=StudentStatusEnum.active)
    study_shift: Optional[StudyShiftEnum] = Field(default=None, sa_column_kwargs={"nullable": True})
    admission_type: Optional[AdmissionTypeEnum] = Field(default=None, sa_column_kwargs={"nullable": True})
    financing_type: Optional[FinancingTypeEnum] = Field(default=None, sa_column_kwargs={"nullable": True})
    cohort_year: Optional[int] = Field(default=None, description="Año de cohorte de ingreso")
    admission_date: Optional[date] = None
    expected_graduation_date: Optional[date] = None
    current_term: Optional[str] = None


class StudentProgramEnrollment(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    student_id: int = Field(foreign_key="student.id", index=True)
    program_semester_id: int = Field(foreign_key="programsemester.id", index=True)
    enrolled_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    status: ProgramEnrollmentStatusEnum = Field(default=ProgramEnrollmentStatusEnum.active, index=True)
    ended_at: Optional[datetime] = Field(default=None, sa_column_kwargs={"nullable": True})


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


class SubjectBase(SQLModel):
    code: str = Field(index=True, unique=True)
    name: str
    description: Optional[str] = None
    department: Optional[str] = None
    level: Optional[str] = None  # niveles como básico/intermedio/avanzado u otro criterio
    program_id: Optional[int] = Field(default=None, foreign_key="program.id")
    pedagogical_hours_per_week: int = Field(
        default=0,
        description="Horas pedagógicas (45 minutos) dictadas por semana",
        nullable=False,
    )
    theoretical_hours_per_week: int = Field(
        default=0,
        description="Horas teóricas presenciales por semana",
        nullable=False,
    )
    practical_hours_per_week: int = Field(
        default=0,
        description="Horas prácticas guiadas por semana",
        nullable=False,
    )
    laboratory_hours_per_week: int = Field(
        default=0,
        description="Horas de laboratorio por semana",
        nullable=False,
    )
    weekly_autonomous_work_hours: int = Field(
        default=0,
        description="Horas sugeridas de trabajo autónomo por semana",
        nullable=False,
    )


class Subject(SubjectBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)


class SubjectPrerequisite(SQLModel, table=True):
    subject_id: Optional[int] = Field(
        default=None,
        foreign_key="subject.id",
        primary_key=True,
    )
    prerequisite_subject_id: Optional[int] = Field(
        default=None,
        foreign_key="subject.id",
        primary_key=True,
    )

class Course(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    subject_id: int = Field(foreign_key="subject.id")
    teacher_id: int = Field(foreign_key="teacher.id")
    program_semester_id: int = Field(foreign_key="programsemester.id", index=True)
    term: str = Field(index=True)  # por ejemplo 2025-2
    group: str = Field(default="A")  # sección o grupo
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
    weight: float  # rango 0-1
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


class CourseMaterial(Timestamped, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    course_id: int = Field(foreign_key="course.id", index=True)
    teacher_id: Optional[int] = Field(
        default=None,
        foreign_key="teacher.id",
        index=True,
        sa_column_kwargs={"nullable": True},
    )
    created_by_user_id: Optional[int] = Field(
        default=None,
        foreign_key="user.id",
        sa_column_kwargs={"nullable": True},
    )
    title: str
    description: Optional[str] = None
    material_type: MaterialTypeEnum = Field(default=MaterialTypeEnum.document)
    file_url: Optional[str] = Field(default=None, sa_column_kwargs={"nullable": True})
    external_url: Optional[str] = Field(default=None, sa_column_kwargs={"nullable": True})
    display_order: Optional[int] = Field(default=None, sa_column_kwargs={"nullable": True})
    is_published: bool = Field(default=True)
    published_at: Optional[datetime] = Field(default=None, sa_column_kwargs={"nullable": True})


class Assignment(Timestamped, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    course_id: int = Field(foreign_key="course.id", index=True)
    teacher_id: Optional[int] = Field(
        default=None,
        foreign_key="teacher.id",
        index=True,
        sa_column_kwargs={"nullable": True},
    )
    title: str
    instructions: Optional[str] = None
    assignment_type: AssignmentTypeEnum = Field(default=AssignmentTypeEnum.homework)
    available_from: Optional[datetime] = Field(default=None, sa_column_kwargs={"nullable": True})
    due_date: Optional[datetime] = Field(default=None, sa_column_kwargs={"nullable": True})
    allow_late: bool = Field(default=False)
    max_score: float = Field(default=100)
    resource_url: Optional[str] = Field(default=None, sa_column_kwargs={"nullable": True})
    attachment_url: Optional[str] = Field(default=None, sa_column_kwargs={"nullable": True})
    attachment_name: Optional[str] = Field(default=None, sa_column_kwargs={"nullable": True})
    is_published: bool = Field(default=True)
    published_at: Optional[datetime] = Field(default=None, sa_column_kwargs={"nullable": True})


class AssignmentSubmission(Timestamped, table=True):
    __table_args__ = (
        UniqueConstraint("assignment_id", "enrollment_id", name="uq_assignment_submission"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    assignment_id: int = Field(foreign_key="assignment.id", index=True)
    enrollment_id: int = Field(foreign_key="enrollment.id", index=True)
    student_id: int = Field(foreign_key="student.id", index=True)
    status: SubmissionStatusEnum = Field(default=SubmissionStatusEnum.submitted)
    submitted_at: Optional[datetime] = Field(default=None, sa_column_kwargs={"nullable": True})
    text_response: Optional[str] = Field(default=None, sa_column_kwargs={"nullable": True})
    file_url: Optional[str] = Field(default=None, sa_column_kwargs={"nullable": True})
    external_url: Optional[str] = Field(default=None, sa_column_kwargs={"nullable": True})
    is_late: bool = Field(default=False)
    grade_score: Optional[float] = Field(default=None, sa_column_kwargs={"nullable": True})
    graded_at: Optional[datetime] = Field(default=None, sa_column_kwargs={"nullable": True})
    graded_by: Optional[int] = Field(default=None, foreign_key="teacher.id", sa_column_kwargs={"nullable": True})
    feedback: Optional[str] = Field(default=None, sa_column_kwargs={"nullable": True})


class StoredFile(Timestamped, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    original_name: str = Field(max_length=512)
    scope: Optional[str] = Field(default=None, index=True, max_length=128, sa_column_kwargs={"nullable": True})
    driver: str = Field(default="local", index=True, max_length=32)
    storage_path: str = Field(index=True, description="Ruta lógica o key en el proveedor", max_length=1024)
    content_type: Optional[str] = Field(default=None, max_length=255, sa_column_kwargs={"nullable": True})
    size_bytes: int = Field(default=0)
    owner_user_id: Optional[int] = Field(default=None, foreign_key="user.id", sa_column_kwargs={"nullable": True})


class Attendance(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    enrollment_id: int = Field(foreign_key="enrollment.id")
    session_date: date
    present: bool = Field(default=True)
    arrival_time: Optional[time] = None
    notes: Optional[str] = None


class Timeslot(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    day_of_week: int  # 0=Lunes
    start_time: time
    end_time: time
    campus: Optional[str] = None
    comment: Optional[str] = None


class CourseSchedule(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    course_id: int = Field(foreign_key="course.id")
    room_id: int = Field(foreign_key="room.id")
    timeslot_id: int = Field(foreign_key="timeslot.id")
    program_semester_id: int = Field(foreign_key="programsemester.id", index=True)
    duration_minutes: Optional[int] = Field(default=None, description="Minutos asignados dentro del bloque", sa_column_kwargs={"nullable": True})
    start_offset_minutes: Optional[int] = Field(default=None, description="Minutos desde el inicio del bloque", sa_column_kwargs={"nullable": True})


class AppSetting(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    key: str = Field(index=True, unique=True)
    value: Optional[str] = Field(default=None, sa_column_kwargs={"nullable": True})
    label: Optional[str] = Field(default=None, sa_column_kwargs={"nullable": True})
    description: Optional[str] = Field(default=None, sa_column_kwargs={"nullable": True})
    category: Optional[str] = Field(default=None, index=True, sa_column_kwargs={"nullable": True})
    is_public: bool = Field(default=False)


class ScheduleSupportRequest(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    student_id: int = Field(foreign_key="student.id", index=True)
    subject_id: Optional[int] = Field(default=None, foreign_key="subject.id")
    message: str = Field(description="Solicitud generada por capacidad completa")
    preferred_course_ids: Optional[str] = Field(default=None, description="Lista JSON de cursos deseados")
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    handled: bool = Field(default=False, description="Indica si la administración respondió")