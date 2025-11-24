from __future__ import annotations

from datetime import date, datetime, time
from typing import Any, Dict, Optional, List

from sqlmodel import Session, select

from .db import engine
from .models import (
    Attendance,
    AppSetting,
    Course,
    CourseSchedule,
    Enrollment,
    EnrollmentStatusEnum,
    ModalityEnum,
    Program,
    ProgramSemester,
    Room,
    RoomTypeEnum,
    Student,
    StudentProgramEnrollment,
    StudentStatusEnum,
    Subject,
    SubjectPrerequisite,
    Teacher,
    Timeslot,
    User,
    Evaluation,
    Grade,
    ProgramEnrollmentStatusEnum,
)
from .security import get_password_hash, verify_password


DEFAULT_ADMIN_EMAIL = "admin@academiapro.dev"
DEFAULT_ADMIN_PASSWORD = "admin123"
DEFAULT_ADMIN_NAME = "Administrador Demo"

DEFAULT_COORDINATOR_EMAIL = "coordinador@academiapro.dev"
DEFAULT_COORDINATOR_PASSWORD = "coordinador123"
DEFAULT_COORDINATOR_NAME = "Coordinación Académica"


def ensure_default_admin(session: Optional[Session] = None) -> User:
    """Create a default admin user for local development if none exists."""
    owns_session = session is None
    session = session or Session(engine)
    try:
        existing = session.exec(select(User).where(User.email == DEFAULT_ADMIN_EMAIL)).first()
        if existing:
            updated = False
            if not verify_password(DEFAULT_ADMIN_PASSWORD, existing.hashed_password):
                existing.hashed_password = get_password_hash(DEFAULT_ADMIN_PASSWORD)
                updated = True
            if existing.role != "admin":
                existing.role = "admin"
                updated = True
            if not existing.is_active:
                existing.is_active = True
                updated = True
            if updated:
                session.add(existing)
                session.commit()
                session.refresh(existing)
            return existing
        user = User(
            email=DEFAULT_ADMIN_EMAIL,
            full_name=DEFAULT_ADMIN_NAME,
            hashed_password=get_password_hash(DEFAULT_ADMIN_PASSWORD),
            role="admin",
            is_active=True,
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        return user
    finally:
        if owns_session:
            session.close()


def ensure_default_coordinator(session: Optional[Session] = None) -> User:
    """Create an academic coordinator account to operate scheduling workflows."""
    owns_session = session is None
    session = session or Session(engine)
    try:
        existing = session.exec(select(User).where(User.email == DEFAULT_COORDINATOR_EMAIL)).first()
        if existing:
            updated = False
            if not verify_password(DEFAULT_COORDINATOR_PASSWORD, existing.hashed_password):
                existing.hashed_password = get_password_hash(DEFAULT_COORDINATOR_PASSWORD)
                updated = True
            if existing.role != "coordinator":
                existing.role = "coordinator"
                updated = True
            if not existing.is_active:
                existing.is_active = True
                updated = True
            if updated:
                session.add(existing)
                session.commit()
                session.refresh(existing)
            return existing
        user = User(
            email=DEFAULT_COORDINATOR_EMAIL,
            full_name=DEFAULT_COORDINATOR_NAME,
            hashed_password=get_password_hash(DEFAULT_COORDINATOR_PASSWORD),
            role="coordinator",
            is_active=True,
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        return user
    finally:
        if owns_session:
            session.close()


def ensure_app_settings(session: Optional[Session] = None) -> None:
    """Guarantee that the base application settings exist."""
    owns_session = session is None
    session = session or Session(engine)
    try:
        _ensure_app_settings(session)
    finally:
        if owns_session:
            session.close()


def ensure_demo_data() -> None:
    """Populate the main catalog tables with deterministic demo data for the UI."""
    with Session(engine) as session:
        ensure_default_admin(session)
        ensure_default_coordinator(session)
        ensure_app_settings(session)

        program_map = _ensure_programs(session)
        semester_map = _ensure_program_semesters(session, program_map)
        subject_map = _ensure_subjects(session, program_map)
        _ensure_subject_prerequisites(session, subject_map)
        teacher_map = _ensure_teachers(session)
        room_map = _ensure_rooms(session)
        timeslot_map = _ensure_timeslots(session)
        course_map = _ensure_courses(session, subject_map, teacher_map, semester_map)
        _ensure_course_schedules(session, course_map, room_map, timeslot_map)
        student_map = _ensure_students(session, program_map)
        enrollment_map = _ensure_enrollments(session, student_map, course_map)
        _ensure_student_program_enrollments(session, student_map, program_map, semester_map)
        evaluation_map = _ensure_evaluations(session, course_map)
        _ensure_grades(session, enrollment_map, evaluation_map)
        _ensure_attendance(session, enrollment_map)


def _ensure_app_settings(session: Session) -> None:
    defaults = [
        {
            "key": "branding.app_name",
            "value": "AcademiaPro",
            "label": "Nombre de la plataforma",
            "description": "Identificador principal mostrado en cabeceras y correos.",
            "category": "branding",
            "is_public": True,
        },
        {
            "key": "branding.tagline",
            "value": "Planifica, gestiona y escala tu campus académico.",
            "label": "Lema institucional",
            "description": "Texto breve utilizado en la página de inicio y login.",
            "category": "branding",
            "is_public": True,
        },
        {
            "key": "branding.logo_url",
            "value": "https://placehold.co/400x120?text=AcademiaPro",
            "label": "Logo (URL)",
            "description": "Imagen SVG o PNG utilizada en la barra superior.",
            "category": "branding",
            "is_public": True,
        },
        {
            "key": "branding.primary_color",
            "value": "#1e40af",
            "label": "Color primario",
            "description": "Color de acento principal para componentes interactivos.",
            "category": "branding",
            "is_public": True,
        },
        {
            "key": "platform.default_language",
            "value": "es",
            "label": "Idioma por defecto",
            "description": "Código ISO para el idioma predeterminado de la interfaz.",
            "category": "platform",
            "is_public": True,
        },
        {
            "key": "platform.timezone",
            "value": "America/Bogota",
            "label": "Zona horaria",
            "description": "Zona horaria principal utilizada para reportes e integraciones.",
            "category": "platform",
            "is_public": True,
        },
        {
            "key": "contact.support_email",
            "value": "soporte@academiapro.dev",
            "label": "Correo de soporte",
            "description": "Canal de contacto para incidencias de la intranet.",
            "category": "contact",
            "is_public": True,
        },
        {
            "key": "contact.support_phone",
            "value": "+57 300 000 0000",
            "label": "Teléfono de soporte",
            "description": "Línea directa del equipo de soporte académico.",
            "category": "contact",
            "is_public": False,
        },
    ]

    dirty = False
    for item in defaults:
        setting = session.exec(select(AppSetting).where(AppSetting.key == item["key"])).first()
        if not setting:
            session.add(AppSetting(**item))
            dirty = True
            continue
        updated = False
        if setting.value is None and item["value"] is not None:
            setting.value = item["value"]
            updated = True
        for field in ("label", "description", "category", "is_public"):
            if getattr(setting, field) != item[field]:
                setattr(setting, field, item[field])
                updated = True
        if updated:
            session.add(setting)
            dirty = True
    if dirty:
        session.commit()


def _get_or_create_user(
    session: Session,
    *,
    email: str,
    full_name: str,
    role: str,
    password: str,
    **extra,
) -> User:
    user = session.exec(select(User).where(User.email == email)).first()
    if user:
        updated = False
        if user.full_name != full_name:
            user.full_name = full_name
            updated = True
        if user.role != role:
            user.role = role
            updated = True
        if extra:
            for key, value in extra.items():
                if getattr(user, key, None) != value:
                    setattr(user, key, value)
                    updated = True
        if updated:
            session.add(user)
            session.commit()
        return user

    user = User(
        email=email,
        full_name=full_name,
        hashed_password=get_password_hash(password),
        role=role,
        is_active=True,
        **extra,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _ensure_programs(session: Session) -> Dict[str, Program]:
    data = [
        {
            "code": "ING-SIS",
            "name": "Ingeniería en Sistemas",
            "level": "undergrad",
            "duration_semesters": 10,
            "description": "Formación en ingeniería de software, redes y gestión de proyectos.",
        },
        {
            "code": "ADM-EMP",
            "name": "Administración de Empresas",
            "level": "undergrad",
            "duration_semesters": 8,
            "description": "Negocios, finanzas y estrategia organizacional.",
        },
        {
            "code": "DS-AV",
            "name": "Ciencia de Datos Avanzada",
            "level": "postgrad",
            "duration_semesters": 4,
            "description": "Análisis predictivo, machine learning y visualización de datos.",
        },
        {
            "code": "ING-IND",
            "name": "Ingeniería Industrial",
            "level": "undergrad",
            "duration_semesters": 10,
            "description": "Optimización de procesos, logística y sistemas productivos.",
        },
    ]
    mapping: Dict[str, Program] = {}
    for item in data:
        program = session.exec(select(Program).where(Program.code == item["code"])).first()
        if not program:
            program = Program(**item)
            session.add(program)
            session.commit()
            session.refresh(program)
        mapping[item["code"]] = program
    return mapping


def _ensure_subjects(session: Session, program_map: Dict[str, Program]) -> Dict[str, Subject]:
    def _int_or_none(value: Any) -> Optional[int]:  # type: ignore[name-defined]
        if value is None:
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    def _derive_subject_hours(item: Dict[str, Any]) -> Dict[str, Any]:
        base_hours = item.get("pedagogical_hours_per_week")
        if base_hours is None:
            base_hours = item.get("hours_per_week")
        ped_hours = _int_or_none(base_hours) or 0

        theoretical = _int_or_none(item.get("theoretical_hours_per_week"))
        if theoretical is None:
            theoretical = 0

        practical = _int_or_none(item.get("practical_hours_per_week"))
        if practical is None:
            practical = 0
        laboratory = _int_or_none(item.get("laboratory_hours_per_week"))
        if laboratory is None:
            laboratory = 0

        autonomous = _int_or_none(item.get("weekly_autonomous_work_hours"))
        if autonomous is None:
            autonomous = 0

        return {
            "pedagogical_hours_per_week": ped_hours,
            "theoretical_hours_per_week": theoretical,
            "practical_hours_per_week": practical,
            "laboratory_hours_per_week": laboratory,
            "weekly_autonomous_work_hours": autonomous,
        }

    data = [
        # ==================== INGENIERÍA EN SISTEMAS ====================
        # Semestre 1
        {
            "code": "MAT101",
            "name": "Cálculo Diferencial",
            "credits": 6,
            "program_code": "ING-SIS",
            "description": "Funciones, límites y derivadas.",
            "hours_per_week": 5,
        },
        {
            "code": "PRO101",
            "name": "Fundamentos de Programación",
            "credits": 5,
            "program_code": "ING-SIS",
            "description": "Introducción a la programación estructurada.",
            "hours_per_week": 5,
        },
        {
            "code": "FIS101",
            "name": "Física I",
            "credits": 5,
            "program_code": "ING-SIS",
            "description": "Mecánica clásica y fundamentos físicos.",
            "hours_per_week": 4,
        },
        {
            "code": "QUI101",
            "name": "Química General",
            "credits": 4,
            "program_code": "ING-SIS",
            "description": "Estructura atómica y enlaces químicos.",
            "hours_per_week": 3,
        },
        {
            "code": "COM101",
            "name": "Comunicación Efectiva",
            "credits": 3,
            "program_code": "ING-SIS",
            "description": "Técnicas de expresión oral y escrita.",
            "hours_per_week": 3,
        },
        {
            "code": "INT101",
            "name": "Introducción a la Ingeniería",
            "credits": 3,
            "program_code": "ING-SIS",
            "description": "Panorama de la ingeniería en sistemas.",
            "hours_per_week": 2,
        },
        # Semestre 2
        {
            "code": "MAT201",
            "name": "Cálculo Integral",
            "credits": 6,
            "program_code": "ING-SIS",
            "description": "Integrales, series y aplicaciones.",
            "hours_per_week": 5,
        },
        {
            "code": "PRO201",
            "name": "Programación Orientada a Objetos",
            "credits": 5,
            "program_code": "ING-SIS",
            "description": "Aplicaciones con patrones de diseño y pruebas.",
            "hours_per_week": 4,
        },
        {
            "code": "EST201",
            "name": "Estructuras de Datos",
            "credits": 5,
            "program_code": "ING-SIS",
            "description": "Listas, pilas, colas, árboles y grafos.",
            "hours_per_week": 4,
        },
        {
            "code": "FIS201",
            "name": "Física II",
            "credits": 5,
            "program_code": "ING-SIS",
            "description": "Electricidad y magnetismo.",
            "hours_per_week": 4,
        },
        {
            "code": "ALG201",
            "name": "Álgebra Lineal",
            "credits": 4,
            "program_code": "ING-SIS",
            "description": "Matrices, vectores y transformaciones.",
            "hours_per_week": 4,
        },
        {
            "code": "FIL201",
            "name": "Filosofía y Ética",
            "credits": 3,
            "program_code": "ING-SIS",
            "description": "Fundamentos éticos en ingeniería.",
            "hours_per_week": 3,
        },
        # Semestre 3
        {
            "code": "MAT301",
            "name": "Ecuaciones Diferenciales",
            "credits": 5,
            "program_code": "ING-SIS",
            "description": "Ecuaciones diferenciales ordinarias y aplicaciones.",
            "hours_per_week": 4,
        },
        {
            "code": "BD301",
            "name": "Bases de Datos",
            "credits": 5,
            "program_code": "ING-SIS",
            "description": "Modelado relacional, SQL avanzado y tuning.",
            "hours_per_week": 4,
        },
        {
            "code": "SIS320",
            "name": "Sistemas Operativos",
            "credits": 4,
            "program_code": "ING-SIS",
            "description": "Procesos, concurrencia y administración de recursos.",
            "hours_per_week": 4,
        },
        {
            "code": "ALG301",
            "name": "Análisis de Algoritmos",
            "credits": 5,
            "program_code": "ING-SIS",
            "description": "Complejidad, divide y vencerás, programación dinámica.",
            "hours_per_week": 4,
        },
        {
            "code": "ARQ301",
            "name": "Arquitectura de Computadoras",
            "credits": 4,
            "program_code": "ING-SIS",
            "description": "Diseño de procesadores y sistemas digitales.",
            "hours_per_week": 4,
        },
        {
            "code": "PRO301",
            "name": "Desarrollo Web",
            "credits": 4,
            "program_code": "ING-SIS",
            "description": "HTML, CSS, JavaScript y frameworks modernos.",
            "hours_per_week": 4,
        },
        # Semestre 4
        {
            "code": "RED401",
            "name": "Redes de Computadoras",
            "credits": 5,
            "program_code": "ING-SIS",
            "description": "Protocolos TCP/IP, routing y switching.",
            "hours_per_week": 4,
        },
        {
            "code": "ING401",
            "name": "Ingeniería de Software I",
            "credits": 5,
            "program_code": "ING-SIS",
            "description": "Metodologías ágiles, SCRUM y gestión de proyectos.",
            "hours_per_week": 4,
        },
        {
            "code": "SEG401",
            "name": "Seguridad Informática",
            "credits": 4,
            "program_code": "ING-SIS",
            "description": "Criptografía, ethical hacking y protección de sistemas.",
            "hours_per_week": 4,
        },
        {
            "code": "EST401",
            "name": "Probabilidad y Estadística",
            "credits": 4,
            "program_code": "ING-SIS",
            "description": "Variables aleatorias, distribuciones e inferencia.",
            "hours_per_week": 4,
        },
        {
            "code": "BD401",
            "name": "Bases de Datos Avanzadas",
            "credits": 4,
            "program_code": "ING-SIS",
            "description": "NoSQL, BigData y optimización de consultas.",
            "hours_per_week": 4,
        },
        {
            "code": "MOV401",
            "name": "Desarrollo Móvil",
            "credits": 4,
            "program_code": "ING-SIS",
            "description": "Android, iOS y aplicaciones híbridas.",
            "hours_per_week": 4,
        },

        # ==================== ADMINISTRACIÓN DE EMPRESAS ====================
        # Semestre 1
        {
            "code": "ADM101",
            "name": "Fundamentos de Administración",
            "credits": 4,
            "program_code": "ADM-EMP",
            "description": "Teorías administrativas y gestión organizacional.",
            "hours_per_week": 4,
        },
        {
            "code": "ECO101",
            "name": "Microeconomía",
            "credits": 4,
            "program_code": "ADM-EMP",
            "description": "Oferta, demanda y comportamiento del consumidor.",
            "hours_per_week": 4,
        },
        {
            "code": "CON101",
            "name": "Contabilidad Financiera",
            "credits": 4,
            "program_code": "ADM-EMP",
            "description": "Estados financieros y principios contables.",
            "hours_per_week": 4,
        },
        {
            "code": "MAT102",
            "name": "Matemáticas para Negocios",
            "credits": 4,
            "program_code": "ADM-EMP",
            "description": "Álgebra, funciones y aplicaciones empresariales.",
            "hours_per_week": 4,
        },
        {
            "code": "COM102",
            "name": "Comunicación Empresarial",
            "credits": 3,
            "program_code": "ADM-EMP",
            "description": "Redacción de informes y presentaciones ejecutivas.",
            "hours_per_week": 3,
        },
        {
            "code": "DER101",
            "name": "Introducción al Derecho",
            "credits": 3,
            "program_code": "ADM-EMP",
            "description": "Fundamentos legales para empresarios.",
            "hours_per_week": 3,
        },
        # Semestre 2
        {
            "code": "ADM120",
            "name": "Contabilidad Gerencial",
            "credits": 4,
            "program_code": "ADM-EMP",
            "description": "Contabilidad para la toma de decisiones.",
            "hours_per_week": 3,
        },
        {
            "code": "ECO201",
            "name": "Macroeconomía",
            "credits": 4,
            "program_code": "ADM-EMP",
            "description": "Política fiscal, monetaria y crecimiento económico.",
            "hours_per_week": 4,
        },
        {
            "code": "EST202",
            "name": "Estadística Empresarial",
            "credits": 4,
            "program_code": "ADM-EMP",
            "description": "Análisis estadístico aplicado a negocios.",
            "hours_per_week": 4,
        },
        {
            "code": "FIN201",
            "name": "Matemáticas Financieras",
            "credits": 4,
            "program_code": "ADM-EMP",
            "description": "Interés compuesto, anualidades y amortización.",
            "hours_per_week": 4,
        },
        {
            "code": "RHU201",
            "name": "Gestión del Talento Humano",
            "credits": 4,
            "program_code": "ADM-EMP",
            "description": "Reclutamiento, capacitación y desarrollo organizacional.",
            "hours_per_week": 4,
        },
        {
            "code": "TEC201",
            "name": "Tecnologías de Información",
            "credits": 3,
            "program_code": "ADM-EMP",
            "description": "Sistemas ERP, CRM y herramientas digitales.",
            "hours_per_week": 3,
        },
        # Semestre 3
        {
            "code": "ADM210",
            "name": "Marketing Estratégico",
            "credits": 4,
            "program_code": "ADM-EMP",
            "description": "Segmentación, posicionamiento y campañas digitales.",
            "hours_per_week": 3,
        },
        {
            "code": "FIN301",
            "name": "Finanzas Corporativas",
            "credits": 5,
            "program_code": "ADM-EMP",
            "description": "Valuación de empresas y estructura de capital.",
            "hours_per_week": 4,
        },
        {
            "code": "OPE301",
            "name": "Gestión de Operaciones",
            "credits": 4,
            "program_code": "ADM-EMP",
            "description": "Producción, cadena de suministro y logística.",
            "hours_per_week": 4,
        },
        {
            "code": "INV301",
            "name": "Investigación de Mercados",
            "credits": 4,
            "program_code": "ADM-EMP",
            "description": "Diseño de encuestas y análisis de consumidores.",
            "hours_per_week": 4,
        },
        {
            "code": "DER301",
            "name": "Derecho Empresarial",
            "credits": 3,
            "program_code": "ADM-EMP",
            "description": "Contratos, sociedades y derecho laboral.",
            "hours_per_week": 3,
        },
        {
            "code": "COS301",
            "name": "Contabilidad de Costos",
            "credits": 4,
            "program_code": "ADM-EMP",
            "description": "Costos por órdenes, procesos y ABC.",
            "hours_per_week": 4,
        },
        # Semestre 4
        {
            "code": "ADM315",
            "name": "Gestión de Proyectos",
            "credits": 5,
            "program_code": "ADM-EMP",
            "description": "Metodologías ágiles, PMO y control de costos.",
            "hours_per_week": 4,
        },
        {
            "code": "EST401",
            "name": "Estrategia Empresarial",
            "credits": 5,
            "program_code": "ADM-EMP",
            "description": "Análisis FODA, Porter y ventaja competitiva.",
            "hours_per_week": 4,
        },
        {
            "code": "MKT401",
            "name": "Marketing Digital",
            "credits": 4,
            "program_code": "ADM-EMP",
            "description": "SEO, SEM, redes sociales y analítica web.",
            "hours_per_week": 4,
        },
        {
            "code": "NEG401",
            "name": "Negociación y Resolución de Conflictos",
            "credits": 4,
            "program_code": "ADM-EMP",
            "description": "Técnicas de negociación y mediación empresarial.",
            "hours_per_week": 3,
        },
        {
            "code": "AUD401",
            "name": "Auditoría y Control Interno",
            "credits": 4,
            "program_code": "ADM-EMP",
            "description": "Normas de auditoría y evaluación de riesgos.",
            "hours_per_week": 4,
        },
        {
            "code": "RSE401",
            "name": "Responsabilidad Social Empresarial",
            "credits": 3,
            "program_code": "ADM-EMP",
            "description": "Sostenibilidad y ética en los negocios.",
            "hours_per_week": 3,
        },

        # ==================== CIENCIA DE DATOS AVANZADA ====================
        # Semestre 1
        {
            "code": "DS501",
            "name": "Machine Learning Aplicado",
            "credits": 5,
            "program_code": "DS-AV",
            "description": "Modelos supervisados, pipelines y ML Ops.",
            "hours_per_week": 4,
        },
        {
            "code": "DS510",
            "name": "Visualización de Datos",
            "credits": 3,
            "program_code": "DS-AV",
            "description": "Narrativas visuales y dashboards interactivos.",
            "hours_per_week": 3,
        },
        {
            "code": "EST501",
            "name": "Estadística Avanzada",
            "credits": 5,
            "program_code": "DS-AV",
            "description": "Inferencia bayesiana y análisis multivariado.",
            "hours_per_week": 4,
        },
        {
            "code": "PRO501",
            "name": "Python para Data Science",
            "credits": 4,
            "program_code": "DS-AV",
            "description": "Pandas, NumPy, scikit-learn y notebooks.",
            "hours_per_week": 4,
        },
        {
            "code": "MAT501",
            "name": "Álgebra para Data Science",
            "credits": 4,
            "program_code": "DS-AV",
            "description": "Espacios vectoriales y optimización.",
            "hours_per_week": 4,
        },
        {
            "code": "BIG501",
            "name": "Big Data Fundamentals",
            "credits": 4,
            "program_code": "DS-AV",
            "description": "Hadoop, Spark y procesamiento distribuido.",
            "hours_per_week": 4,
        },
        # Semestre 2
        {
            "code": "DS530",
            "name": "Ingeniería de Datos",
            "credits": 4,
            "program_code": "DS-AV",
            "description": "ETL, orquestación y pipelines en la nube.",
            "hours_per_week": 4,
        },
        {
            "code": "DL601",
            "name": "Deep Learning",
            "credits": 5,
            "program_code": "DS-AV",
            "description": "Redes neuronales, CNN, RNN y transformers.",
            "hours_per_week": 5,
        },
        {
            "code": "NLP601",
            "name": "Procesamiento de Lenguaje Natural",
            "credits": 4,
            "program_code": "DS-AV",
            "description": "Tokenización, embeddings y modelos de lenguaje.",
            "hours_per_week": 4,
        },
        {
            "code": "VIS601",
            "name": "Visualización Avanzada",
            "credits": 3,
            "program_code": "DS-AV",
            "description": "D3.js, Tableau y storytelling con datos.",
            "hours_per_week": 3,
        },
        {
            "code": "OPT601",
            "name": "Optimización y Simulación",
            "credits": 4,
            "program_code": "DS-AV",
            "description": "Programación lineal, metaheurísticas y Monte Carlo.",
            "hours_per_week": 4,
        },
        {
            "code": "ETI601",
            "name": "Ética en IA y Datos",
            "credits": 3,
            "program_code": "DS-AV",
            "description": "Sesgo algorítmico, privacidad y regulación.",
            "hours_per_week": 3,
        },

        # ==================== INGENIERÍA INDUSTRIAL ====================
        # Semestre 1
        {
            "code": "IND130",
            "name": "Fundamentos de Ingeniería Industrial",
            "credits": 5,
            "program_code": "ING-IND",
            "description": "Introducción a sistemas productivos y optimización.",
            "hours_per_week": 4,
        },
        {
            "code": "MAT103",
            "name": "Cálculo para Ingeniería",
            "credits": 6,
            "program_code": "ING-IND",
            "description": "Derivadas, integrales y aplicaciones.",
            "hours_per_week": 5,
        },
        {
            "code": "FIS103",
            "name": "Física Aplicada",
            "credits": 5,
            "program_code": "ING-IND",
            "description": "Mecánica y termodinámica básica.",
            "hours_per_week": 4,
        },
        {
            "code": "QUI103",
            "name": "Química Industrial",
            "credits": 4,
            "program_code": "ING-IND",
            "description": "Materiales y procesos químicos.",
            "hours_per_week": 3,
        },
        {
            "code": "DIB101",
            "name": "Dibujo Técnico",
            "credits": 3,
            "program_code": "ING-IND",
            "description": "Normas de representación y CAD.",
            "hours_per_week": 3,
        },
        {
            "code": "COM103",
            "name": "Comunicación Técnica",
            "credits": 3,
            "program_code": "ING-IND",
            "description": "Informes técnicos y documentación.",
            "hours_per_week": 3,
        },
        # Semestre 2
        {
            "code": "IND240",
            "name": "Logística y Cadena de Suministro",
            "credits": 4,
            "program_code": "ING-IND",
            "description": "Gestión de inventarios, transporte y distribución.",
            "hours_per_week": 3,
        },
        {
            "code": "EST203",
            "name": "Estadística Industrial",
            "credits": 4,
            "program_code": "ING-IND",
            "description": "Control estadístico de procesos y Six Sigma.",
            "hours_per_week": 4,
        },
        {
            "code": "PRO203",
            "name": "Programación para Ingeniería",
            "credits": 4,
            "program_code": "ING-IND",
            "description": "Python, MATLAB y automatización.",
            "hours_per_week": 4,
        },
        {
            "code": "MAT203",
            "name": "Álgebra Lineal Aplicada",
            "credits": 4,
            "program_code": "ING-IND",
            "description": "Matrices y sistemas de ecuaciones.",
            "hours_per_week": 4,
        },
        {
            "code": "ECO203",
            "name": "Economía Industrial",
            "credits": 4,
            "program_code": "ING-IND",
            "description": "Microeconomía aplicada a la producción.",
            "hours_per_week": 4,
        },
        {
            "code": "MEC201",
            "name": "Mecánica de Materiales",
            "credits": 4,
            "program_code": "ING-IND",
            "description": "Esfuerzo, deformación y resistencia.",
            "hours_per_week": 4,
        },
        # Semestre 3
        {
            "code": "IND301",
            "name": "Investigación de Operaciones I",
            "credits": 5,
            "program_code": "ING-IND",
            "description": "Programación lineal y teoría de grafos.",
            "hours_per_week": 4,
        },
        {
            "code": "PRO303",
            "name": "Diseño de Procesos Productivos",
            "credits": 4,
            "program_code": "ING-IND",
            "description": "Layout, balanceo de líneas y simulación.",
            "hours_per_week": 4,
        },
        {
            "code": "CAL301",
            "name": "Control de Calidad",
            "credits": 4,
            "program_code": "ING-IND",
            "description": "ISO 9001, Lean y mejora continua.",
            "hours_per_week": 4,
        },
        {
            "code": "ING303",
            "name": "Ingeniería de Métodos",
            "credits": 4,
            "program_code": "ING-IND",
            "description": "Estudio del trabajo y ergonomía.",
            "hours_per_week": 4,
        },
        {
            "code": "CON303",
            "name": "Contabilidad de Costos Industriales",
            "credits": 4,
            "program_code": "ING-IND",
            "description": "Costos de producción y presupuestos.",
            "hours_per_week": 4,
        },
        {
            "code": "AUT301",
            "name": "Automatización Industrial",
            "credits": 4,
            "program_code": "ING-IND",
            "description": "PLC, SCADA y robótica básica.",
            "hours_per_week": 4,
        },
        # Semestre 4
        {
            "code": "IND401",
            "name": "Investigación de Operaciones II",
            "credits": 5,
            "program_code": "ING-IND",
            "description": "Programación entera, redes y teoría de colas.",
            "hours_per_week": 4,
        },
        {
            "code": "PLA401",
            "name": "Planeación y Control de la Producción",
            "credits": 5,
            "program_code": "ING-IND",
            "description": "MRP, JIT y gestión de la demanda.",
            "hours_per_week": 4,
        },
        {
            "code": "SEG403",
            "name": "Seguridad e Higiene Industrial",
            "credits": 4,
            "program_code": "ING-IND",
            "description": "Prevención de riesgos y normativa.",
            "hours_per_week": 4,
        },
        {
            "code": "FIN403",
            "name": "Ingeniería Económica",
            "credits": 4,
            "program_code": "ING-IND",
            "description": "Evaluación de proyectos y análisis financiero.",
            "hours_per_week": 4,
        },
        {
            "code": "SIM401",
            "name": "Simulación de Sistemas",
            "credits": 4,
            "program_code": "ING-IND",
            "description": "Arena, Flexsim y modelos estocásticos.",
            "hours_per_week": 4,
        },
        {
            "code": "GES401",
            "name": "Gestión Ambiental",
            "credits": 3,
            "program_code": "ING-IND",
            "description": "ISO 14001 y sostenibilidad industrial.",
            "hours_per_week": 3,
        },
    ]
    mapping: Dict[str, Subject] = {}
    for item in data:
        program = program_map.get(item.get("program_code"))
        hours_payload = _derive_subject_hours(item)
        subject_attrs = {
            "name": item["name"],
            "description": item.get("description"),
            "department": item.get("department"),
            "level": item.get("level"),
            "program_id": program.id if program else None,
            **hours_payload,
        }

        subject = session.exec(select(Subject).where(Subject.code == item["code"])).first()
        if subject:
            for key, value in subject_attrs.items():
                setattr(subject, key, value)
        else:
            subject = Subject(code=item["code"], **subject_attrs)
            session.add(subject)

        session.commit()
        session.refresh(subject)
        mapping[item["code"]] = subject
    return mapping


def _ensure_subject_prerequisites(session: Session, subject_map: Dict[str, Subject]) -> None:
    matrix: Dict[str, List[str]] = {
        # Ingeniería en Sistemas
        "MAT201": ["MAT101"],
        "PRO201": ["PRO101"],
        "EST201": ["PRO101"],
        "ALG201": ["MAT101"],
        "MAT301": ["MAT201"],
        "BD301": ["PRO201"],
        "SIS320": ["PRO201", "EST201"],
        "ALG301": ["ALG201"],
        "ARQ301": ["PRO201"],
        "PRO301": ["PRO201"],
        "RED401": ["SIS320"],
        "ING401": ["PRO301"],
        "SEG401": ["RED401"],
        "BD401": ["BD301"],
        "MOV401": ["PRO301"],
        # Administración de Empresas
        "ADM120": ["CON101"],
        "ECO201": ["ECO101"],
        "EST202": ["MAT102"],
        "FIN201": ["MAT102"],
        "RHU201": ["ADM101"],
        "ADM210": ["ADM101"],
        "FIN301": ["FIN201"],
        "OPE301": ["ADM120"],
        "ADM315": ["ADM210"],
        "MKT401": ["ADM210"],
        "NEG401": ["ADM210"],
        "AUD401": ["CON101"],
        "RSE401": ["ADM210"],
        # Ciencia de Datos Avanzada
        "DS530": ["DS501"],
        "DL601": ["DS530"],
        "NLP601": ["DS530"],
        "VIS601": ["DS510"],
        "OPT601": ["MAT501"],
        "ETI601": ["DS501"],
        # Ingeniería Industrial
        "IND240": ["IND130"],
        "EST203": ["MAT103"],
        "PRO203": ["IND130"],
        "MAT203": ["MAT103"],
        "IND301": ["IND240", "MAT203"],
        "PRO303": ["IND240"],
        "CAL301": ["EST203"],
        "ING303": ["IND240"],
        "AUT301": ["PRO203"],
        "IND401": ["IND301"],
        "PLA401": ["IND301"],
        "SEG403": ["IND240"],
        "FIN403": ["MAT203"],
        "SIM401": ["IND301"],
        "GES401": ["IND240"],
    }

    dirty = False
    for subject_code, prereq_codes in matrix.items():
        subject = subject_map.get(subject_code)
        if not subject:
            continue
        for prereq_code in prereq_codes:
            prerequisite = subject_map.get(prereq_code)
            if not prerequisite:
                continue
            existing = session.exec(
                select(SubjectPrerequisite).where(
                    SubjectPrerequisite.subject_id == subject.id,
                    SubjectPrerequisite.prerequisite_subject_id == prerequisite.id,
                )
            ).first()
            if existing:
                continue
            session.add(
                SubjectPrerequisite(
                    subject_id=subject.id,
                    prerequisite_subject_id=prerequisite.id,
                )
            )
            dirty = True
    if dirty:
        session.commit()


def _ensure_teachers(session: Session) -> Dict[str, Teacher]:
    data = [
        # Matemáticas
        {
            "email": "docente1@academiapro.dev",
            "full_name": "Laura Fernández",
            "password": "teacher123",
            "department": "Matemáticas",
            "specialty": "Cálculo y Álgebra",
            "office": "B-301",
        },
        {
            "email": "docente3@academiapro.dev",
            "full_name": "Andrea Ruiz",
            "password": "teacher123",
            "department": "Matemáticas",
            "specialty": "Probabilidad y Estadística",
            "office": "B-205",
        },
        {
            "email": "docente8@academiapro.dev",
            "full_name": "Roberto Campos",
            "password": "teacher123",
            "department": "Matemáticas",
            "specialty": "Ecuaciones Diferenciales",
            "office": "B-308",
        },
        # Ciencias de la Computación
        {
            "email": "docente2@academiapro.dev",
            "full_name": "Martín Aguilar",
            "password": "teacher123",
            "department": "Ciencias de la Computación",
            "specialty": "Arquitectura de Software",
            "office": "C-210",
        },
        {
            "email": "docente4@academiapro.dev",
            "full_name": "Sergio Pineda",
            "password": "teacher123",
            "department": "Ciencias de la Computación",
            "specialty": "Ciberseguridad y Redes",
            "office": "C-108",
        },
        {
            "email": "docente9@academiapro.dev",
            "full_name": "Patricia Vega",
            "password": "teacher123",
            "department": "Ciencias de la Computación",
            "specialty": "Bases de Datos",
            "office": "C-305",
        },
        {
            "email": "docente10@academiapro.dev",
            "full_name": "Fernando López",
            "password": "teacher123",
            "department": "Ciencias de la Computación",
            "specialty": "Desarrollo Web y Móvil",
            "office": "C-412",
        },
        {
            "email": "docente11@academiapro.dev",
            "full_name": "Carolina Mendoza",
            "password": "teacher123",
            "department": "Ciencias de la Computación",
            "specialty": "Algoritmos y Estructuras de Datos",
            "office": "C-207",
        },
        # Administración
        {
            "email": "docente5@academiapro.dev",
            "full_name": "Jimena Castro",
            "password": "teacher123",
            "department": "Administración",
            "specialty": "Finanzas Corporativas",
            "office": "D-402",
        },
        {
            "email": "docente12@academiapro.dev",
            "full_name": "Miguel Ángel Torres",
            "password": "teacher123",
            "department": "Administración",
            "specialty": "Marketing y Ventas",
            "office": "D-305",
        },
        {
            "email": "docente13@academiapro.dev",
            "full_name": "Valeria Guzmán",
            "password": "teacher123",
            "department": "Administración",
            "specialty": "Recursos Humanos",
            "office": "D-201",
        },
        {
            "email": "docente14@academiapro.dev",
            "full_name": "Ricardo Salinas",
            "password": "teacher123",
            "department": "Administración",
            "specialty": "Contabilidad y Auditoría",
            "office": "D-108",
        },
        {
            "email": "docente15@academiapro.dev",
            "full_name": "Mónica Reyes",
            "password": "teacher123",
            "department": "Administración",
            "specialty": "Gestión de Proyectos",
            "office": "D-315",
        },
        # Ciencia de Datos
        {
            "email": "docente6@academiapro.dev",
            "full_name": "Rafael Ortega",
            "password": "teacher123",
            "department": "Ciencia de Datos",
            "specialty": "Big Data y Machine Learning",
            "office": "CI-102",
        },
        {
            "email": "docente16@academiapro.dev",
            "full_name": "Isabel Navarro",
            "password": "teacher123",
            "department": "Ciencia de Datos",
            "specialty": "Deep Learning e IA",
            "office": "CI-205",
        },
        {
            "email": "docente17@academiapro.dev",
            "full_name": "Alejandro Ramos",
            "password": "teacher123",
            "department": "Ciencia de Datos",
            "specialty": "Visualización y Analytics",
            "office": "CI-308",
        },
        # Ingeniería Industrial
        {
            "email": "docente7@academiapro.dev",
            "full_name": "Elena Prieto",
            "password": "teacher123",
            "department": "Ingeniería Industrial",
            "specialty": "Optimización y Simulación",
            "office": "E-215",
        },
        {
            "email": "docente18@academiapro.dev",
            "full_name": "Jorge Contreras",
            "password": "teacher123",
            "department": "Ingeniería Industrial",
            "specialty": "Logística y Producción",
            "office": "E-310",
        },
        {
            "email": "docente19@academiapro.dev",
            "full_name": "Diana Flores",
            "password": "teacher123",
            "department": "Ingeniería Industrial",
            "specialty": "Calidad y Mejora Continua",
            "office": "E-108",
        },
        # Ciencias Básicas
        {
            "email": "docente20@academiapro.dev",
            "full_name": "Alberto Ramírez",
            "password": "teacher123",
            "department": "Física",
            "specialty": "Física Aplicada",
            "office": "F-201",
        },
        {
            "email": "docente21@academiapro.dev",
            "full_name": "Cristina Herrera",
            "password": "teacher123",
            "department": "Química",
            "specialty": "Química Industrial",
            "office": "F-305",
        },
        # Humanidades
        {
            "email": "docente22@academiapro.dev",
            "full_name": "Manuel Soto",
            "password": "teacher123",
            "department": "Humanidades",
            "specialty": "Comunicación y Ética",
            "office": "H-102",
        },
        {
            "email": "docente23@academiapro.dev",
            "full_name": "Luisa Paredes",
            "password": "teacher123",
            "department": "Derecho",
            "specialty": "Derecho Empresarial",
            "office": "H-205",
        },
    ]

    mapping: Dict[str, Teacher] = {}
    for item in data:
        user = _get_or_create_user(
            session,
            email=item["email"],
            full_name=item["full_name"],
            role="teacher",
            password=item["password"],
        )
        teacher = session.exec(select(Teacher).where(Teacher.user_id == user.id)).first()
        if not teacher:
            teacher = Teacher(
                user_id=user.id,
                department=item["department"],
                specialty=item["specialty"],
                office=item["office"],
            )
            session.add(teacher)
            session.commit()
            session.refresh(teacher)
        mapping[item["email"]] = teacher
    return mapping


def _ensure_rooms(session: Session) -> Dict[str, Room]:
    data = [
        # Edificio A - Aulas generales
        {
            "code": "A-201",
            "capacity": 35,
            "building": "Edificio A",
            "campus": "Campus Central",
            "room_type": RoomTypeEnum.classroom,
            "has_projector": True,
        },
        {
            "code": "A-202",
            "capacity": 40,
            "building": "Edificio A",
            "campus": "Campus Central",
            "room_type": RoomTypeEnum.classroom,
            "has_projector": True,
        },
        {
            "code": "A-301",
            "capacity": 35,
            "building": "Edificio A",
            "campus": "Campus Central",
            "room_type": RoomTypeEnum.classroom,
            "has_projector": True,
        },
        {
            "code": "A-302",
            "capacity": 38,
            "building": "Edificio A",
            "campus": "Campus Central",
            "room_type": RoomTypeEnum.classroom,
            "has_projector": True,
        },
        # Edificio B - Matemáticas y Ciencias
        {
            "code": "B-105",
            "capacity": 45,
            "building": "Edificio B",
            "campus": "Campus Central",
            "room_type": RoomTypeEnum.classroom,
            "has_projector": True,
        },
        {
            "code": "B-106",
            "capacity": 42,
            "building": "Edificio B",
            "campus": "Campus Central",
            "room_type": RoomTypeEnum.classroom,
            "has_projector": True,
        },
        {
            "code": "B-201",
            "capacity": 40,
            "building": "Edificio B",
            "campus": "Campus Central",
            "room_type": RoomTypeEnum.classroom,
            "has_projector": True,
        },
        {
            "code": "B-202",
            "capacity": 38,
            "building": "Edificio B",
            "campus": "Campus Central",
            "room_type": RoomTypeEnum.classroom,
            "has_projector": True,
        },
        # Edificio C - Computación
        {
            "code": "C-301",
            "capacity": 30,
            "building": "Edificio C",
            "campus": "Campus Central",
            "room_type": RoomTypeEnum.classroom,
            "has_projector": True,
        },
        {
            "code": "C-302",
            "capacity": 32,
            "building": "Edificio C",
            "campus": "Campus Central",
            "room_type": RoomTypeEnum.classroom,
            "has_projector": True,
        },
        {
            "code": "C-401",
            "capacity": 28,
            "building": "Edificio C",
            "campus": "Campus Central",
            "room_type": RoomTypeEnum.classroom,
            "has_projector": True,
        },
        {
            "code": "C-402",
            "capacity": 30,
            "building": "Edificio C",
            "campus": "Campus Central",
            "room_type": RoomTypeEnum.classroom,
            "has_projector": True,
        },
        # Edificio D - Administración
        {
            "code": "D-101",
            "capacity": 50,
            "building": "Edificio D",
            "campus": "Campus Central",
            "room_type": RoomTypeEnum.classroom,
            "has_projector": True,
        },
        {
            "code": "D-102",
            "capacity": 45,
            "building": "Edificio D",
            "campus": "Campus Central",
            "room_type": RoomTypeEnum.classroom,
            "has_projector": True,
        },
        {
            "code": "D-201",
            "capacity": 48,
            "building": "Edificio D",
            "campus": "Campus Central",
            "room_type": RoomTypeEnum.classroom,
            "has_projector": True,
        },
        {
            "code": "D-202",
            "capacity": 42,
            "building": "Edificio D",
            "campus": "Campus Central",
            "room_type": RoomTypeEnum.classroom,
            "has_projector": True,
        },
        # Laboratorios
        {
            "code": "LAB-IA",
            "capacity": 20,
            "building": "Centro de Innovación",
            "campus": "Campus Central",
            "room_type": RoomTypeEnum.lab,
            "has_projector": True,
            "has_computers": True,
        },
        {
            "code": "LAB-DATA",
            "capacity": 28,
            "building": "Centro de Datos",
            "campus": "Campus Tecnológico",
            "room_type": RoomTypeEnum.lab,
            "has_projector": True,
            "has_computers": True,
        },
        {
            "code": "LAB-COMP1",
            "capacity": 25,
            "building": "Edificio C",
            "campus": "Campus Central",
            "room_type": RoomTypeEnum.lab,
            "has_projector": True,
            "has_computers": True,
        },
        {
            "code": "LAB-COMP2",
            "capacity": 30,
            "building": "Edificio C",
            "campus": "Campus Central",
            "room_type": RoomTypeEnum.lab,
            "has_projector": True,
            "has_computers": True,
        },
        {
            "code": "LAB-FIS",
            "capacity": 20,
            "building": "Edificio F",
            "campus": "Campus Central",
            "room_type": RoomTypeEnum.lab,
            "has_projector": True,
        },
        {
            "code": "LAB-QUI",
            "capacity": 22,
            "building": "Edificio F",
            "campus": "Campus Central",
            "room_type": RoomTypeEnum.lab,
            "has_projector": True,
        },
        {
            "code": "LAB-IND",
            "capacity": 24,
            "building": "Edificio E",
            "campus": "Campus Industrial",
            "room_type": RoomTypeEnum.lab,
            "has_projector": True,
            "has_computers": True,
        },
        # Auditorios
        {
            "code": "AUD-1",
            "capacity": 120,
            "building": "Auditorio Principal",
            "campus": "Campus Norte",
            "room_type": RoomTypeEnum.auditorium,
            "has_projector": True,
        },
        {
            "code": "AUD-2",
            "capacity": 80,
            "building": "Centro de Conferencias",
            "campus": "Campus Central",
            "room_type": RoomTypeEnum.auditorium,
            "has_projector": True,
        },
    ]
    mapping: Dict[str, Room] = {}
    for item in data:
        room = session.exec(select(Room).where(Room.code == item["code"])).first()
        if not room:
            room = Room(**item)
            session.add(room)
            session.commit()
            session.refresh(room)
        mapping[item["code"]] = room
    return mapping


def _ensure_timeslots(session: Session) -> Dict[str, Timeslot]:
    start_hour = 8
    end_hour = 22  # Último bloque finaliza a las 22:00
    data = []
    for day in range(5):  # Lunes (0) a viernes (4)
        for hour in range(start_hour, end_hour):
            start = time(hour, 0)
            end = time(hour + 1, 0)
            data.append({"day_of_week": day, "start_time": start, "end_time": end})
    mapping: Dict[str, Timeslot] = {}
    for item in data:
        key = f"{item['day_of_week']}-{item['start_time'].strftime('%H:%M')}"
        timeslot = (
            session.exec(
                select(Timeslot).where(
                    Timeslot.day_of_week == item["day_of_week"],
                    Timeslot.start_time == item["start_time"],
                    Timeslot.end_time == item["end_time"],
                )
            ).first()
        )
        if not timeslot:
            timeslot = Timeslot(**item)
            session.add(timeslot)
            session.commit()
            session.refresh(timeslot)
        mapping[key] = timeslot
    return mapping


def _ensure_program_semesters(session: Session, program_map: Dict[str, Program]) -> Dict[str, ProgramSemester]:
    mapping: Dict[str, ProgramSemester] = {}
    for program_code, program in program_map.items():
        total_semesters = program.duration_semesters or 8
        # Limitar la cantidad inicial para no sobrepoblar; mínimo 4 semestres.
        for number in range(1, min(total_semesters, 6) + 1):
            existing = session.exec(
                select(ProgramSemester).where(
                    ProgramSemester.program_id == program.id,
                    ProgramSemester.semester_number == number,
                )
            ).first()
            if not existing:
                existing = ProgramSemester(
                    program_id=program.id,
                    semester_number=number,
                    label=f"Semestre {number}",
                    is_active=True,
                )
                session.add(existing)
                session.commit()
                session.refresh(existing)
            mapping[f"{program_code}:{number}"] = existing
    return mapping


def _ensure_courses(
    session: Session,
    subject_map: Dict[str, Subject],
    teacher_map: Dict[str, Teacher],
    semester_map: Dict[str, ProgramSemester],
) -> Dict[str, Course]:
    data = [
        # ==================== INGENIERÍA EN SISTEMAS ====================
        # Semestre 1
        {"key": "MAT101-2025-1-A", "subject_code": "MAT101", "teacher_email": "docente1@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 5, "capacity": 40, 
         "modality": ModalityEnum.in_person, "program_code": "ING-SIS", "semester_number": 1},
        {"key": "MAT101-2025-1-B", "subject_code": "MAT101", "teacher_email": "docente8@academiapro.dev", 
         "term": "2025-1", "group": "B", "weekly_hours": 5, "capacity": 40, 
         "modality": ModalityEnum.in_person, "program_code": "ING-SIS", "semester_number": 1},
        {"key": "PRO101-2025-1-A", "subject_code": "PRO101", "teacher_email": "docente2@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 5, "capacity": 35, 
         "modality": ModalityEnum.in_person, "program_code": "ING-SIS", "semester_number": 1},
        {"key": "PRO101-2025-1-B", "subject_code": "PRO101", "teacher_email": "docente11@academiapro.dev", 
         "term": "2025-1", "group": "B", "weekly_hours": 5, "capacity": 35, 
         "modality": ModalityEnum.in_person, "program_code": "ING-SIS", "semester_number": 1},
        {"key": "FIS101-2025-1-A", "subject_code": "FIS101", "teacher_email": "docente20@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 40, 
         "modality": ModalityEnum.in_person, "program_code": "ING-SIS", "semester_number": 1},
        {"key": "QUI101-2025-1-A", "subject_code": "QUI101", "teacher_email": "docente21@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 3, "capacity": 40, 
         "modality": ModalityEnum.in_person, "program_code": "ING-SIS", "semester_number": 1},
        {"key": "COM101-2025-1-A", "subject_code": "COM101", "teacher_email": "docente22@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 3, "capacity": 45, 
         "modality": ModalityEnum.hybrid, "program_code": "ING-SIS", "semester_number": 1},
        {"key": "INT101-2025-1-A", "subject_code": "INT101", "teacher_email": "docente2@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 2, "capacity": 50, 
         "modality": ModalityEnum.in_person, "program_code": "ING-SIS", "semester_number": 1},
        
        # Semestre 2
        {"key": "MAT201-2025-1-A", "subject_code": "MAT201", "teacher_email": "docente1@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 5, "capacity": 40, 
         "modality": ModalityEnum.in_person, "program_code": "ING-SIS", "semester_number": 2},
    {"key": "PRO201-2025-1-A", "subject_code": "PRO201", "teacher_email": "docente2@academiapro.dev", 
     "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 2, 
         "modality": ModalityEnum.hybrid, "program_code": "ING-SIS", "semester_number": 2},
    {"key": "PRO201-2025-1-B", "subject_code": "PRO201", "teacher_email": "docente4@academiapro.dev", 
     "term": "2025-1", "group": "B", "weekly_hours": 4, "capacity": 2, 
         "modality": ModalityEnum.hybrid, "program_code": "ING-SIS", "semester_number": 2},
        {"key": "EST201-2025-1-A", "subject_code": "EST201", "teacher_email": "docente11@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 35, 
         "modality": ModalityEnum.in_person, "program_code": "ING-SIS", "semester_number": 2},
        {"key": "FIS201-2025-1-A", "subject_code": "FIS201", "teacher_email": "docente20@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 38, 
         "modality": ModalityEnum.in_person, "program_code": "ING-SIS", "semester_number": 2},
        {"key": "ALG201-2025-1-A", "subject_code": "ALG201", "teacher_email": "docente8@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 40, 
         "modality": ModalityEnum.in_person, "program_code": "ING-SIS", "semester_number": 2},
        {"key": "FIL201-2025-1-A", "subject_code": "FIL201", "teacher_email": "docente22@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 3, "capacity": 45, 
         "modality": ModalityEnum.hybrid, "program_code": "ING-SIS", "semester_number": 2},
        
        # Semestre 3
        {"key": "MAT301-2025-1-A", "subject_code": "MAT301", "teacher_email": "docente8@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 35, 
         "modality": ModalityEnum.in_person, "program_code": "ING-SIS", "semester_number": 3},
        {"key": "BD301-2025-1-A", "subject_code": "BD301", "teacher_email": "docente9@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 30, 
         "modality": ModalityEnum.in_person, "program_code": "ING-SIS", "semester_number": 3},
        {"key": "BD301-2025-1-B", "subject_code": "BD301", "teacher_email": "docente4@academiapro.dev", 
         "term": "2025-1", "group": "B", "weekly_hours": 4, "capacity": 30, 
         "modality": ModalityEnum.in_person, "program_code": "ING-SIS", "semester_number": 3},
        {"key": "SIS320-2025-1-A", "subject_code": "SIS320", "teacher_email": "docente4@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 32, 
         "modality": ModalityEnum.in_person, "program_code": "ING-SIS", "semester_number": 3},
        {"key": "ALG301-2025-1-A", "subject_code": "ALG301", "teacher_email": "docente11@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 35, 
         "modality": ModalityEnum.in_person, "program_code": "ING-SIS", "semester_number": 3},
        {"key": "ARQ301-2025-1-A", "subject_code": "ARQ301", "teacher_email": "docente2@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 32, 
         "modality": ModalityEnum.in_person, "program_code": "ING-SIS", "semester_number": 3},
        {"key": "PRO301-2025-1-A", "subject_code": "PRO301", "teacher_email": "docente10@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 30, 
         "modality": ModalityEnum.hybrid, "program_code": "ING-SIS", "semester_number": 3},
        
        # Semestre 4
        {"key": "RED401-2025-1-A", "subject_code": "RED401", "teacher_email": "docente4@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 32, 
         "modality": ModalityEnum.in_person, "program_code": "ING-SIS", "semester_number": 4},
        {"key": "ING401-2025-1-A", "subject_code": "ING401", "teacher_email": "docente2@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 35, 
         "modality": ModalityEnum.hybrid, "program_code": "ING-SIS", "semester_number": 4},
        {"key": "SEG401-2025-1-A", "subject_code": "SEG401", "teacher_email": "docente4@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 30, 
         "modality": ModalityEnum.in_person, "program_code": "ING-SIS", "semester_number": 4},
        {"key": "EST401-2025-1-A", "subject_code": "EST401", "teacher_email": "docente3@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 35, 
         "modality": ModalityEnum.in_person, "program_code": "ING-SIS", "semester_number": 4},
        {"key": "BD401-2025-1-A", "subject_code": "BD401", "teacher_email": "docente9@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 28, 
         "modality": ModalityEnum.in_person, "program_code": "ING-SIS", "semester_number": 4},
        {"key": "MOV401-2025-1-A", "subject_code": "MOV401", "teacher_email": "docente10@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 30, 
         "modality": ModalityEnum.hybrid, "program_code": "ING-SIS", "semester_number": 4},

        # ==================== ADMINISTRACIÓN DE EMPRESAS ====================
        # Semestre 1
        {"key": "ADM101-2025-1-A", "subject_code": "ADM101", "teacher_email": "docente5@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 50, 
         "modality": ModalityEnum.in_person, "program_code": "ADM-EMP", "semester_number": 1},
        {"key": "ECO101-2025-1-A", "subject_code": "ECO101", "teacher_email": "docente12@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 50, 
         "modality": ModalityEnum.in_person, "program_code": "ADM-EMP", "semester_number": 1},
        {"key": "CON101-2025-1-A", "subject_code": "CON101", "teacher_email": "docente14@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 48, 
         "modality": ModalityEnum.in_person, "program_code": "ADM-EMP", "semester_number": 1},
        {"key": "MAT102-2025-1-A", "subject_code": "MAT102", "teacher_email": "docente1@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 45, 
         "modality": ModalityEnum.in_person, "program_code": "ADM-EMP", "semester_number": 1},
        {"key": "COM102-2025-1-A", "subject_code": "COM102", "teacher_email": "docente22@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 3, "capacity": 50, 
         "modality": ModalityEnum.hybrid, "program_code": "ADM-EMP", "semester_number": 1},
        {"key": "DER101-2025-1-A", "subject_code": "DER101", "teacher_email": "docente23@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 3, "capacity": 48, 
         "modality": ModalityEnum.in_person, "program_code": "ADM-EMP", "semester_number": 1},
        
        # Semestre 2
        {"key": "ADM120-2025-1-A", "subject_code": "ADM120", "teacher_email": "docente14@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 3, "capacity": 50, 
         "modality": ModalityEnum.in_person, "program_code": "ADM-EMP", "semester_number": 2},
        {"key": "ECO201-2025-1-A", "subject_code": "ECO201", "teacher_email": "docente12@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 48, 
         "modality": ModalityEnum.in_person, "program_code": "ADM-EMP", "semester_number": 2},
        {"key": "EST202-2025-1-A", "subject_code": "EST202", "teacher_email": "docente3@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 45, 
         "modality": ModalityEnum.in_person, "program_code": "ADM-EMP", "semester_number": 2},
        {"key": "FIN201-2025-1-A", "subject_code": "FIN201", "teacher_email": "docente5@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 48, 
         "modality": ModalityEnum.in_person, "program_code": "ADM-EMP", "semester_number": 2},
        {"key": "RHU201-2025-1-A", "subject_code": "RHU201", "teacher_email": "docente13@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 45, 
         "modality": ModalityEnum.hybrid, "program_code": "ADM-EMP", "semester_number": 2},
        {"key": "TEC201-2025-1-A", "subject_code": "TEC201", "teacher_email": "docente10@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 3, "capacity": 50, 
         "modality": ModalityEnum.hybrid, "program_code": "ADM-EMP", "semester_number": 2},
        
        # Semestre 3
        {"key": "ADM210-2025-1-A", "subject_code": "ADM210", "teacher_email": "docente12@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 3, "capacity": 45, 
         "modality": ModalityEnum.hybrid, "program_code": "ADM-EMP", "semester_number": 3},
        {"key": "FIN301-2025-1-A", "subject_code": "FIN301", "teacher_email": "docente5@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 42, 
         "modality": ModalityEnum.in_person, "program_code": "ADM-EMP", "semester_number": 3},
        {"key": "OPE301-2025-1-A", "subject_code": "OPE301", "teacher_email": "docente15@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 45, 
         "modality": ModalityEnum.in_person, "program_code": "ADM-EMP", "semester_number": 3},
        {"key": "INV301-2025-1-A", "subject_code": "INV301", "teacher_email": "docente12@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 40, 
         "modality": ModalityEnum.hybrid, "program_code": "ADM-EMP", "semester_number": 3},
        {"key": "DER301-2025-1-A", "subject_code": "DER301", "teacher_email": "docente23@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 3, "capacity": 48, 
         "modality": ModalityEnum.in_person, "program_code": "ADM-EMP", "semester_number": 3},
        {"key": "COS301-2025-1-A", "subject_code": "COS301", "teacher_email": "docente14@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 42, 
         "modality": ModalityEnum.in_person, "program_code": "ADM-EMP", "semester_number": 3},
        
        # Semestre 4
        {"key": "ADM315-2025-1-A", "subject_code": "ADM315", "teacher_email": "docente15@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 40, 
         "modality": ModalityEnum.in_person, "program_code": "ADM-EMP", "semester_number": 4},
        {"key": "EST401-ADM-2025-1-A", "subject_code": "EST401", "teacher_email": "docente5@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 42, 
         "modality": ModalityEnum.hybrid, "program_code": "ADM-EMP", "semester_number": 4},
        {"key": "MKT401-2025-1-A", "subject_code": "MKT401", "teacher_email": "docente12@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 45, 
         "modality": ModalityEnum.hybrid, "program_code": "ADM-EMP", "semester_number": 4},
        {"key": "NEG401-2025-1-A", "subject_code": "NEG401", "teacher_email": "docente13@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 3, "capacity": 40, 
         "modality": ModalityEnum.in_person, "program_code": "ADM-EMP", "semester_number": 4},
        {"key": "AUD401-2025-1-A", "subject_code": "AUD401", "teacher_email": "docente14@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 38, 
         "modality": ModalityEnum.in_person, "program_code": "ADM-EMP", "semester_number": 4},
        {"key": "RSE401-2025-1-A", "subject_code": "RSE401", "teacher_email": "docente22@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 3, "capacity": 48, 
         "modality": ModalityEnum.hybrid, "program_code": "ADM-EMP", "semester_number": 4},

        # ==================== CIENCIA DE DATOS AVANZADA ====================
        # Semestre 1
        {"key": "DS501-2025-1-A", "subject_code": "DS501", "teacher_email": "docente6@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 25, 
         "modality": ModalityEnum.hybrid, "program_code": "DS-AV", "semester_number": 1},
        {"key": "DS510-2025-1-A", "subject_code": "DS510", "teacher_email": "docente17@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 3, "capacity": 25, 
         "modality": ModalityEnum.hybrid, "program_code": "DS-AV", "semester_number": 1},
        {"key": "EST501-2025-1-A", "subject_code": "EST501", "teacher_email": "docente3@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 28, 
         "modality": ModalityEnum.in_person, "program_code": "DS-AV", "semester_number": 1},
        {"key": "PRO501-2025-1-A", "subject_code": "PRO501", "teacher_email": "docente6@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 25, 
         "modality": ModalityEnum.hybrid, "program_code": "DS-AV", "semester_number": 1},
        {"key": "MAT501-2025-1-A", "subject_code": "MAT501", "teacher_email": "docente1@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 25, 
         "modality": ModalityEnum.in_person, "program_code": "DS-AV", "semester_number": 1},
        {"key": "BIG501-2025-1-A", "subject_code": "BIG501", "teacher_email": "docente6@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 28, 
         "modality": ModalityEnum.hybrid, "program_code": "DS-AV", "semester_number": 1},
        
        # Semestre 2
        {"key": "DS530-2025-1-A", "subject_code": "DS530", "teacher_email": "docente6@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 25, 
         "modality": ModalityEnum.hybrid, "program_code": "DS-AV", "semester_number": 2},
        {"key": "DL601-2025-1-A", "subject_code": "DL601", "teacher_email": "docente16@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 5, "capacity": 25, 
         "modality": ModalityEnum.hybrid, "program_code": "DS-AV", "semester_number": 2},
        {"key": "NLP601-2025-1-A", "subject_code": "NLP601", "teacher_email": "docente16@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 28, 
         "modality": ModalityEnum.hybrid, "program_code": "DS-AV", "semester_number": 2},
        {"key": "VIS601-2025-1-A", "subject_code": "VIS601", "teacher_email": "docente17@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 3, "capacity": 25, 
         "modality": ModalityEnum.hybrid, "program_code": "DS-AV", "semester_number": 2},
        {"key": "OPT601-2025-1-A", "subject_code": "OPT601", "teacher_email": "docente7@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 28, 
         "modality": ModalityEnum.in_person, "program_code": "DS-AV", "semester_number": 2},
        {"key": "ETI601-2025-1-A", "subject_code": "ETI601", "teacher_email": "docente22@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 3, "capacity": 30, 
         "modality": ModalityEnum.online, "program_code": "DS-AV", "semester_number": 2},

        # ==================== INGENIERÍA INDUSTRIAL ====================
        # Semestre 1
        {"key": "IND130-2025-1-A", "subject_code": "IND130", "teacher_email": "docente7@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 35, 
         "modality": ModalityEnum.in_person, "program_code": "ING-IND", "semester_number": 1},
        {"key": "MAT103-2025-1-A", "subject_code": "MAT103", "teacher_email": "docente1@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 5, "capacity": 38, 
         "modality": ModalityEnum.in_person, "program_code": "ING-IND", "semester_number": 1},
        {"key": "FIS103-2025-1-A", "subject_code": "FIS103", "teacher_email": "docente20@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 35, 
         "modality": ModalityEnum.in_person, "program_code": "ING-IND", "semester_number": 1},
        {"key": "QUI103-2025-1-A", "subject_code": "QUI103", "teacher_email": "docente21@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 3, "capacity": 35, 
         "modality": ModalityEnum.in_person, "program_code": "ING-IND", "semester_number": 1},
        {"key": "DIB101-2025-1-A", "subject_code": "DIB101", "teacher_email": "docente18@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 3, "capacity": 32, 
         "modality": ModalityEnum.in_person, "program_code": "ING-IND", "semester_number": 1},
        {"key": "COM103-2025-1-A", "subject_code": "COM103", "teacher_email": "docente22@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 3, "capacity": 38, 
         "modality": ModalityEnum.hybrid, "program_code": "ING-IND", "semester_number": 1},
        
        # Semestre 2
        {"key": "IND240-2025-1-A", "subject_code": "IND240", "teacher_email": "docente18@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 3, "capacity": 35, 
         "modality": ModalityEnum.hybrid, "program_code": "ING-IND", "semester_number": 2},
        {"key": "EST203-2025-1-A", "subject_code": "EST203", "teacher_email": "docente19@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 35, 
         "modality": ModalityEnum.in_person, "program_code": "ING-IND", "semester_number": 2},
        {"key": "PRO203-2025-1-A", "subject_code": "PRO203", "teacher_email": "docente11@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 32, 
         "modality": ModalityEnum.hybrid, "program_code": "ING-IND", "semester_number": 2},
        {"key": "MAT203-2025-1-A", "subject_code": "MAT203", "teacher_email": "docente8@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 35, 
         "modality": ModalityEnum.in_person, "program_code": "ING-IND", "semester_number": 2},
        {"key": "ECO203-2025-1-A", "subject_code": "ECO203", "teacher_email": "docente12@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 38, 
         "modality": ModalityEnum.in_person, "program_code": "ING-IND", "semester_number": 2},
        {"key": "MEC201-2025-1-A", "subject_code": "MEC201", "teacher_email": "docente20@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 32, 
         "modality": ModalityEnum.in_person, "program_code": "ING-IND", "semester_number": 2},
        
        # Semestre 3
        {"key": "IND301-2025-1-A", "subject_code": "IND301", "teacher_email": "docente7@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 32, 
         "modality": ModalityEnum.in_person, "program_code": "ING-IND", "semester_number": 3},
        {"key": "PRO303-2025-1-A", "subject_code": "PRO303", "teacher_email": "docente18@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 30, 
         "modality": ModalityEnum.in_person, "program_code": "ING-IND", "semester_number": 3},
        {"key": "CAL301-2025-1-A", "subject_code": "CAL301", "teacher_email": "docente19@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 32, 
         "modality": ModalityEnum.in_person, "program_code": "ING-IND", "semester_number": 3},
        {"key": "ING303-2025-1-A", "subject_code": "ING303", "teacher_email": "docente18@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 30, 
         "modality": ModalityEnum.in_person, "program_code": "ING-IND", "semester_number": 3},
        {"key": "CON303-2025-1-A", "subject_code": "CON303", "teacher_email": "docente14@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 35, 
         "modality": ModalityEnum.in_person, "program_code": "ING-IND", "semester_number": 3},
        {"key": "AUT301-2025-1-A", "subject_code": "AUT301", "teacher_email": "docente7@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 28, 
         "modality": ModalityEnum.in_person, "program_code": "ING-IND", "semester_number": 3},
        
        # Semestre 4
        {"key": "IND401-2025-1-A", "subject_code": "IND401", "teacher_email": "docente7@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 30, 
         "modality": ModalityEnum.in_person, "program_code": "ING-IND", "semester_number": 4},
        {"key": "PLA401-2025-1-A", "subject_code": "PLA401", "teacher_email": "docente18@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 32, 
         "modality": ModalityEnum.in_person, "program_code": "ING-IND", "semester_number": 4},
        {"key": "SEG403-2025-1-A", "subject_code": "SEG403", "teacher_email": "docente19@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 35, 
         "modality": ModalityEnum.in_person, "program_code": "ING-IND", "semester_number": 4},
        {"key": "FIN403-2025-1-A", "subject_code": "FIN403", "teacher_email": "docente5@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 32, 
         "modality": ModalityEnum.in_person, "program_code": "ING-IND", "semester_number": 4},
        {"key": "SIM401-2025-1-A", "subject_code": "SIM401", "teacher_email": "docente7@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 4, "capacity": 28, 
         "modality": ModalityEnum.hybrid, "program_code": "ING-IND", "semester_number": 4},
        {"key": "GES401-2025-1-A", "subject_code": "GES401", "teacher_email": "docente19@academiapro.dev", 
         "term": "2025-1", "group": "A", "weekly_hours": 3, "capacity": 35, 
         "modality": ModalityEnum.hybrid, "program_code": "ING-IND", "semester_number": 4},
    ]

    mapping: Dict[str, Course] = {}
    for item in data:
        subject = subject_map.get(item["subject_code"])
        teacher = teacher_map.get(item["teacher_email"])
        semester_key = f"{item['program_code']}:{item['semester_number']}"
        semester = semester_map.get(semester_key)
        if not subject or not teacher:
            continue
        if not semester:
            continue

        course = (
            session.exec(
                select(Course).where(
                    Course.subject_id == subject.id,
                    Course.teacher_id == teacher.id,
                    Course.term == item["term"],
                    Course.group == item["group"],
                )
            ).first()
        )
        if not course:
            course = Course(
                subject_id=subject.id,
                teacher_id=teacher.id,
                term=item["term"],
                group=item["group"],
                weekly_hours=item["weekly_hours"],
                capacity=item["capacity"],
                modality=item["modality"],
                program_semester_id=semester.id,
            )
            session.add(course)
            session.commit()
            session.refresh(course)
        elif course.program_semester_id != semester.id:
            course.program_semester_id = semester.id
            session.add(course)
            session.commit()
        mapping[item["key"]] = course
    return mapping


def _ensure_course_schedules(
    session: Session,
    course_map: Dict[str, Course],
    room_map: Dict[str, Room],
    timeslot_map: Dict[str, Timeslot],
) -> None:
    data = [
        {"course_key": "MAT101-2025-1-A", "room_code": "A-201", "timeslot_key": "0-08:00"},
        {"course_key": "MAT101-2025-1-B", "room_code": "B-105", "timeslot_key": "0-10:00"},
        {"course_key": "PRO201-2025-1-A", "room_code": "LAB-IA", "timeslot_key": "1-14:00", "duration_minutes": 50, "start_offset_minutes": 5},
        {"course_key": "PRO201-2025-1-B", "room_code": "LAB-IA", "timeslot_key": "3-10:00"},
        {"course_key": "ADM120-2025-1-A", "room_code": "AUD-1", "timeslot_key": "2-11:00"},
        {"course_key": "ADM210-2025-1-A", "room_code": "C-301", "timeslot_key": "1-08:00"},
        {"course_key": "ADM315-2025-1-A", "room_code": "C-301", "timeslot_key": "4-14:00"},
        {"course_key": "DS501-2025-1-A", "room_code": "LAB-DATA", "timeslot_key": "2-08:00", "duration_minutes": 55},
        {"course_key": "DS510-2025-1-A", "room_code": "LAB-DATA", "timeslot_key": "1-11:00"},
        {"course_key": "DS530-2025-1-A", "room_code": "LAB-DATA", "timeslot_key": "3-14:00"},
        {"course_key": "BD301-2025-1-A", "room_code": "LAB-IA", "timeslot_key": "2-15:00"},
        {"course_key": "SIS320-2025-1-A", "room_code": "A-201", "timeslot_key": "4-09:00"},
        {"course_key": "IND130-2025-1-A", "room_code": "B-105", "timeslot_key": "3-17:00"},
        {"course_key": "IND240-2025-1-A", "room_code": "C-301", "timeslot_key": "1-19:00"},
    ]

    for item in data:
        course = course_map.get(item["course_key"])
        room = room_map.get(item["room_code"])
        timeslot = timeslot_map.get(item["timeslot_key"])
        if not course or not room or not timeslot:
            continue

        existing = session.exec(
            select(CourseSchedule).where(
                CourseSchedule.course_id == course.id,
                CourseSchedule.room_id == room.id,
                CourseSchedule.timeslot_id == timeslot.id,
            )
        ).first()
        payload = {
            "course_id": course.id,
            "room_id": room.id,
            "timeslot_id": timeslot.id,
            "program_semester_id": course.program_semester_id,
            "duration_minutes": item.get("duration_minutes"),
            "start_offset_minutes": item.get("start_offset_minutes"),
        }
        if not existing:
            session.add(CourseSchedule(**payload))
            session.commit()
        else:
            updated = False
            if existing.duration_minutes != payload["duration_minutes"]:
                existing.duration_minutes = payload["duration_minutes"]
                updated = True
            if existing.start_offset_minutes != payload["start_offset_minutes"]:
                existing.start_offset_minutes = payload["start_offset_minutes"]
                updated = True
            if existing.program_semester_id != payload["program_semester_id"]:
                existing.program_semester_id = payload["program_semester_id"]
                updated = True
            if updated:
                session.add(existing)
                session.commit()


def _ensure_students(session: Session, program_map: Dict[str, Program]) -> Dict[str, Student]:
    data = [
        # INGENIERÍA EN SISTEMAS (10 estudiantes)
        {"email": "estudiante1@academiapro.dev", "full_name": "Carlos Méndez", 
         "password": "student123", "enrollment_year": 2023, "program_code": "ING-SIS",
         "registration_number": "2023-001", "section": "A", "current_term": "2025-1"},
        {"email": "estudiante4@academiapro.dev", "full_name": "Lucía Andrade", 
         "password": "student123", "enrollment_year": 2023, "program_code": "ING-SIS",
         "registration_number": "2023-005", "section": "B", "current_term": "2025-1"},
        {"email": "estudiante7@academiapro.dev", "full_name": "Mateo Calderón", 
         "password": "student123", "enrollment_year": 2022, "program_code": "ING-SIS",
         "registration_number": "2022-030", "section": "A", "current_term": "2025-1"},
        {"email": "estudiante9@academiapro.dev", "full_name": "Gabriel Soto", 
         "password": "student123", "enrollment_year": 2021, "program_code": "ING-SIS",
         "registration_number": "2021-011", "section": "A", "current_term": "2025-1"},
        {"email": "estudiante15@academiapro.dev", "full_name": "Isabella Torres", 
         "password": "student123", "enrollment_year": 2024, "program_code": "ING-SIS",
         "registration_number": "2024-018", "section": "A", "current_term": "2025-1"},
        {"email": "estudiante16@academiapro.dev", "full_name": "Sebastián Vargas", 
         "password": "student123", "enrollment_year": 2024, "program_code": "ING-SIS",
         "registration_number": "2024-022", "section": "B", "current_term": "2025-1"},
        {"email": "estudiante17@academiapro.dev", "full_name": "Camila Rojas", 
         "password": "student123", "enrollment_year": 2023, "program_code": "ING-SIS",
         "registration_number": "2023-035", "section": "A", "current_term": "2025-1"},
        {"email": "estudiante18@academiapro.dev", "full_name": "Andrés Moreno", 
         "password": "student123", "enrollment_year": 2022, "program_code": "ING-SIS",
         "registration_number": "2022-041", "section": "B", "current_term": "2025-1"},
        {"email": "estudiante19@academiapro.dev", "full_name": "Valentina Silva", 
         "password": "student123", "enrollment_year": 2024, "program_code": "ING-SIS",
         "registration_number": "2024-029", "section": "A", "current_term": "2025-1"},
        {"email": "estudiante20@academiapro.dev", "full_name": "Daniel Castro", 
         "password": "student123", "enrollment_year": 2023, "program_code": "ING-SIS",
         "registration_number": "2023-047", "section": "B", "current_term": "2025-1"},
        
        # ADMINISTRACIÓN DE EMPRESAS (10 estudiantes)
        {"email": "estudiante2@academiapro.dev", "full_name": "María González", 
         "password": "student123", "enrollment_year": 2022, "program_code": "ADM-EMP",
         "registration_number": "2022-014", "section": "A", "current_term": "2025-1"},
        {"email": "estudiante5@academiapro.dev", "full_name": "Jorge Morales", 
         "password": "student123", "enrollment_year": 2021, "program_code": "ADM-EMP",
         "registration_number": "2021-022", "section": "A", "current_term": "2025-1"},
        {"email": "estudiante8@academiapro.dev", "full_name": "Anaís Herrera", 
         "password": "student123", "enrollment_year": 2023, "program_code": "ADM-EMP",
         "registration_number": "2023-018", "section": "B", "current_term": "2025-1"},
        {"email": "estudiante11@academiapro.dev", "full_name": "Héctor Vidal", 
         "password": "student123", "enrollment_year": 2024, "program_code": "ADM-EMP",
         "registration_number": "2024-006", "section": "A", "current_term": "2025-1"},
        {"email": "estudiante21@academiapro.dev", "full_name": "Sofía Martínez", 
         "password": "student123", "enrollment_year": 2024, "program_code": "ADM-EMP",
         "registration_number": "2024-015", "section": "A", "current_term": "2025-1"},
        {"email": "estudiante22@academiapro.dev", "full_name": "Nicolás Jiménez", 
         "password": "student123", "enrollment_year": 2023, "program_code": "ADM-EMP",
         "registration_number": "2023-027", "section": "A", "current_term": "2025-1"},
        {"email": "estudiante23@academiapro.dev", "full_name": "Laura Peña", 
         "password": "student123", "enrollment_year": 2022, "program_code": "ADM-EMP",
         "registration_number": "2022-033", "section": "B", "current_term": "2025-1"},
        {"email": "estudiante24@academiapro.dev", "full_name": "Felipe Romero", 
         "password": "student123", "enrollment_year": 2024, "program_code": "ADM-EMP",
         "registration_number": "2024-042", "section": "A", "current_term": "2025-1"},
        {"email": "estudiante25@academiapro.dev", "full_name": "Amanda Córdoba", 
         "password": "student123", "enrollment_year": 2023, "program_code": "ADM-EMP",
         "registration_number": "2023-051", "section": "B", "current_term": "2025-1"},
        {"email": "estudiante26@academiapro.dev", "full_name": "Ricardo Núñez", 
         "password": "student123", "enrollment_year": 2022, "program_code": "ADM-EMP",
         "registration_number": "2022-058", "section": "A", "current_term": "2025-1"},
        
        # CIENCIA DE DATOS AVANZADA (8 estudiantes)
        {"email": "estudiante3@academiapro.dev", "full_name": "Diego Salazar", 
         "password": "student123", "enrollment_year": 2024, "program_code": "DS-AV",
         "registration_number": "2024-009", "section": "A", "current_term": "2025-1"},
        {"email": "estudiante6@academiapro.dev", "full_name": "Paula Rivas", 
         "password": "student123", "enrollment_year": 2024, "program_code": "DS-AV",
         "registration_number": "2024-012", "section": "A", "current_term": "2025-1"},
        {"email": "estudiante10@academiapro.dev", "full_name": "Rebeca Lozano", 
         "password": "student123", "enrollment_year": 2024, "program_code": "DS-AV",
         "registration_number": "2024-027", "section": "A", "current_term": "2025-1"},
        {"email": "estudiante12@academiapro.dev", "full_name": "Sofía Beltrán", 
         "password": "student123", "enrollment_year": 2023, "program_code": "DS-AV",
         "registration_number": "2023-020", "section": "A", "current_term": "2025-1"},
        {"email": "estudiante27@academiapro.dev", "full_name": "Bruno Mendoza", 
         "password": "student123", "enrollment_year": 2024, "program_code": "DS-AV",
         "registration_number": "2024-035", "section": "A", "current_term": "2025-1"},
        {"email": "estudiante28@academiapro.dev", "full_name": "Carla Espinoza", 
         "password": "student123", "enrollment_year": 2023, "program_code": "DS-AV",
         "registration_number": "2023-044", "section": "A", "current_term": "2025-1"},
        {"email": "estudiante29@academiapro.dev", "full_name": "Emilio Gutiérrez", 
         "password": "student123", "enrollment_year": 2024, "program_code": "DS-AV",
         "registration_number": "2024-051", "section": "A", "current_term": "2025-1"},
        {"email": "estudiante30@academiapro.dev", "full_name": "Natalia Ponce", 
         "password": "student123", "enrollment_year": 2024, "program_code": "DS-AV",
         "registration_number": "2024-063", "section": "A", "current_term": "2025-1"},
        
        # INGENIERÍA INDUSTRIAL (10 estudiantes)
        {"email": "estudiante13@academiapro.dev", "full_name": "Valentina Cruz", 
         "password": "student123", "enrollment_year": 2022, "program_code": "ING-IND",
         "registration_number": "2022-034", "section": "A", "current_term": "2025-1"},
        {"email": "estudiante14@academiapro.dev", "full_name": "Luis Herrera", 
         "password": "student123", "enrollment_year": 2023, "program_code": "ING-IND",
         "registration_number": "2023-041", "section": "A", "current_term": "2025-1"},
        {"email": "estudiante31@academiapro.dev", "full_name": "Martina Delgado", 
         "password": "student123", "enrollment_year": 2024, "program_code": "ING-IND",
         "registration_number": "2024-021", "section": "A", "current_term": "2025-1"},
        {"email": "estudiante32@academiapro.dev", "full_name": "Rodrigo Paredes", 
         "password": "student123", "enrollment_year": 2023, "program_code": "ING-IND",
         "registration_number": "2023-038", "section": "A", "current_term": "2025-1"},
        {"email": "estudiante33@academiapro.dev", "full_name": "Julieta Salas", 
         "password": "student123", "enrollment_year": 2024, "program_code": "ING-IND",
         "registration_number": "2024-045", "section": "A", "current_term": "2025-1"},
        {"email": "estudiante34@academiapro.dev", "full_name": "Tomás Villanueva", 
         "password": "student123", "enrollment_year": 2022, "program_code": "ING-IND",
         "registration_number": "2022-052", "section": "A", "current_term": "2025-1"},
        {"email": "estudiante35@academiapro.dev", "full_name": "Renata Ortiz", 
         "password": "student123", "enrollment_year": 2024, "program_code": "ING-IND",
         "registration_number": "2024-059", "section": "A", "current_term": "2025-1"},
        {"email": "estudiante36@academiapro.dev", "full_name": "Samuel Medina", 
         "password": "student123", "enrollment_year": 2023, "program_code": "ING-IND",
         "registration_number": "2023-066", "section": "A", "current_term": "2025-1"},
        {"email": "estudiante37@academiapro.dev", "full_name": "Catalina Bravo", 
         "password": "student123", "enrollment_year": 2024, "program_code": "ING-IND",
         "registration_number": "2024-073", "section": "A", "current_term": "2025-1"},
        {"email": "estudiante38@academiapro.dev", "full_name": "Maximiliano León", 
         "password": "student123", "enrollment_year": 2023, "program_code": "ING-IND",
         "registration_number": "2023-080", "section": "A", "current_term": "2025-1"},
    ]

    mapping: Dict[str, Student] = {}
    for item in data:
        user = _get_or_create_user(
            session,
            email=item["email"],
            full_name=item["full_name"],
            role="student",
            password=item["password"],
        )
        student = session.exec(select(Student).where(Student.user_id == user.id)).first()
        if not student:
            program = program_map.get(item["program_code"])
            if not program:
                continue
            student = Student(
                user_id=user.id,
                enrollment_year=item["enrollment_year"],
                program_id=program.id if program else None,
                registration_number=item["registration_number"],
                section=item["section"],
                current_term=item["current_term"],
                modality=ModalityEnum.in_person,
                status=StudentStatusEnum.active,
            )
            session.add(student)
            session.commit()
            session.refresh(student)
        elif student.program_id is None:
            program = program_map.get(item["program_code"])
            if program:
                student.program_id = program.id
                session.add(student)
                session.commit()
        mapping[item["email"]] = student
    return mapping


def _ensure_enrollments(
    session: Session,
    student_map: Dict[str, Student],
    course_map: Dict[str, Course],
) -> Dict[str, Enrollment]:
    enrollment_plan = {
        "estudiante1@academiapro.dev": ["MAT101-2025-1-A", "BD301-2025-1-A"],
        "estudiante2@academiapro.dev": ["ADM120-2025-1-A", "ADM210-2025-1-A"],
        "estudiante3@academiapro.dev": ["DS501-2025-1-A", "DS530-2025-1-A"],
        "estudiante4@academiapro.dev": ["MAT101-2025-1-B", "SIS320-2025-1-A", "PRO201-2025-1-A"],
        "estudiante5@academiapro.dev": ["ADM210-2025-1-A", "ADM315-2025-1-A"],
        "estudiante6@academiapro.dev": ["DS510-2025-1-A", "DS530-2025-1-A"],
        "estudiante7@academiapro.dev": ["MAT101-2025-1-A", "PRO201-2025-1-B"],
        "estudiante8@academiapro.dev": ["ADM120-2025-1-A", "ADM315-2025-1-A"],
        "estudiante9@academiapro.dev": ["MAT101-2025-1-B", "BD301-2025-1-A", "SIS320-2025-1-A", "PRO201-2025-1-A"],
        "estudiante10@academiapro.dev": ["DS501-2025-1-A", "DS510-2025-1-A"],
        "estudiante11@academiapro.dev": ["ADM210-2025-1-A", "ADM315-2025-1-A"],
    "estudiante12@academiapro.dev": ["DS510-2025-1-A", "DS530-2025-1-A"],
        "estudiante13@academiapro.dev": ["IND130-2025-1-A", "IND240-2025-1-A"],
        "estudiante14@academiapro.dev": ["IND130-2025-1-A"],
    "estudiante16@academiapro.dev": ["PRO201-2025-1-B", "ALG201-2025-1-A"],
    }

    data = [
        {"student_email": email, "course_key": course_key}
        for email, courses in enrollment_plan.items()
        for course_key in courses
    ]

    mapping: Dict[str, Enrollment] = {}
    for item in data:
        student = student_map.get(item["student_email"])
        course = course_map.get(item["course_key"])
        if not student or not course:
            continue

        enrollment = session.exec(
            select(Enrollment).where(
                Enrollment.student_id == student.id,
                Enrollment.course_id == course.id,
            )
        ).first()
        if not enrollment:
            enrollment = Enrollment(
                student_id=student.id,
                course_id=course.id,
                status=EnrollmentStatusEnum.enrolled,
            )
            session.add(enrollment)
            session.commit()
            session.refresh(enrollment)
        key = f"{item['student_email']}|{item['course_key']}"
        mapping[key] = enrollment
    return mapping


def _ensure_student_program_enrollments(
    session: Session,
    student_map: Dict[str, Student],
    program_map: Dict[str, Program],
    semester_map: Dict[str, ProgramSemester],
) -> None:
    manual_assignments: Dict[str, int] = {
        "estudiante1@academiapro.dev": 2,
        "estudiante4@academiapro.dev": 2,
        "estudiante7@academiapro.dev": 2,
        "estudiante9@academiapro.dev": 2,
        "estudiante15@academiapro.dev": 2,
        "estudiante16@academiapro.dev": 2,
    }

    program_code_by_id = {program.id: code for code, program in program_map.items()}

    for email, student in student_map.items():
        program_code = program_code_by_id.get(student.program_id)
        if not program_code:
            continue

        target_semester: Optional[ProgramSemester] = None
        manual_number = manual_assignments.get(email)
        if manual_number:
            target_semester = semester_map.get(f"{program_code}:{manual_number}")

        if not target_semester:
            enrollment_rows = session.exec(
                select(Course.program_semester_id)
                .join(Enrollment, Enrollment.course_id == Course.id)
                .where(Enrollment.student_id == student.id)
            ).all()
            semester_candidates: List[ProgramSemester] = []
            for row in enrollment_rows:
                semester_id = row[0] if isinstance(row, tuple) else row
                if semester_id:
                    semester_obj = session.get(ProgramSemester, semester_id)
                    if semester_obj and semester_obj.program_id == student.program_id:
                        semester_candidates.append(semester_obj)
            if semester_candidates:
                semester_candidates.sort(key=lambda item: item.semester_number, reverse=True)
                target_semester = semester_candidates[0]

        if not target_semester:
            target_semester = semester_map.get(f"{program_code}:1")

        if not target_semester:
            continue

        existing_records = session.exec(
            select(StudentProgramEnrollment).where(StudentProgramEnrollment.student_id == student.id)
        ).all()
        now = datetime.utcnow()
        target_record = next((record for record in existing_records if record.program_semester_id == target_semester.id), None)

        for record in existing_records:
            if record.program_semester_id == target_semester.id:
                record.status = ProgramEnrollmentStatusEnum.active
                record.enrolled_at = now
                record.ended_at = None
                session.add(record)
            elif record.status == ProgramEnrollmentStatusEnum.active:
                record.status = ProgramEnrollmentStatusEnum.completed
                record.ended_at = now
                session.add(record)

        if not target_record:
            session.add(
                StudentProgramEnrollment(
                    student_id=student.id,
                    program_semester_id=target_semester.id,
                    status=ProgramEnrollmentStatusEnum.active,
                    enrolled_at=now,
                )
            )

        if target_semester.label:
            student.current_term = target_semester.label
        else:
            student.current_term = f"Semestre {target_semester.semester_number}"
        session.add(student)

    session.commit()


def _ensure_evaluations(
    session: Session,
    course_map: Dict[str, Course],
) -> Dict[str, Evaluation]:
    data = [
        {
            "course_key": "MAT101-2025-1-A",
            "name": "Parcial 1",
            "weight": 0.3,
            "scheduled_at": datetime(2025, 3, 15, 9, 0),
        },
        {
            "course_key": "MAT101-2025-1-A",
            "name": "Proyecto Final",
            "weight": 0.4,
            "scheduled_at": datetime(2025, 5, 20, 8, 0),
        },
        {
            "course_key": "PRO201-2025-1-A",
            "name": "Sprint Demo",
            "weight": 0.5,
            "scheduled_at": datetime(2025, 4, 10, 10, 0),
        },
        {
            "course_key": "DS501-2025-1-A",
            "name": "Caso Práctico",
            "weight": 0.6,
            "scheduled_at": datetime(2025, 4, 22, 18, 0),
        },
        {
            "course_key": "IND130-2025-1-A",
            "name": "Proyecto de Mejora",
            "weight": 0.35,
            "scheduled_at": datetime(2025, 4, 18, 18, 30),
        },
        {
            "course_key": "IND240-2025-1-A",
            "name": "Simulación Logística",
            "weight": 0.4,
            "scheduled_at": datetime(2025, 5, 8, 19, 0),
        },
    ]

    mapping: Dict[str, Evaluation] = {}
    for item in data:
        course = course_map.get(item["course_key"])
        if not course:
            continue

        evaluation = session.exec(
            select(Evaluation).where(
                Evaluation.course_id == course.id,
                Evaluation.name == item["name"],
            )
        ).first()
        if not evaluation:
            evaluation = Evaluation(
                course_id=course.id,
                name=item["name"],
                weight=item["weight"],
                scheduled_at=item["scheduled_at"],
            )
            session.add(evaluation)
            session.commit()
            session.refresh(evaluation)
        key = f"{item['course_key']}|{item['name']}"
        mapping[key] = evaluation
    return mapping


def _ensure_grades(
    session: Session,
    enrollment_map: Dict[str, Enrollment],
    evaluation_map: Dict[str, Evaluation],
) -> None:
    data = [
        {
            "key": ("estudiante1@academiapro.dev", "MAT101-2025-1-A", "Parcial 1"),
            "score": 87.0,
        },
        {
            "key": ("estudiante4@academiapro.dev", "PRO201-2025-1-A", "Sprint Demo"),
            "score": 92.0,
        },
        {
            "key": ("estudiante3@academiapro.dev", "DS501-2025-1-A", "Caso Práctico"),
            "score": 95.0,
        },
    ]

    for entry in data:
        student_email, course_key, eval_name = entry["key"]
        enrollment = enrollment_map.get(f"{student_email}|{course_key}")
        evaluation = evaluation_map.get(f"{course_key}|{eval_name}")
        if not enrollment or not evaluation:
            continue

        existing = session.exec(
            select(Grade).where(
                Grade.enrollment_id == enrollment.id,
                Grade.evaluation_id == evaluation.id,
            )
        ).first()
        if not existing:
            session.add(
                Grade(
                    enrollment_id=enrollment.id,
                    evaluation_id=evaluation.id,
                    score=entry["score"],
                )
            )
            session.commit()


def _ensure_attendance(session: Session, enrollment_map: Dict[str, Enrollment]) -> None:
    data = [
        {
            "key": "estudiante1@academiapro.dev|MAT101-2025-1-A",
            "session_date": date(2025, 3, 5),
            "present": True,
        },
        {
            "key": "estudiante1@academiapro.dev|PRO201-2025-1-A",
            "session_date": date(2025, 3, 6),
            "present": True,
        },
        {
            "key": "estudiante2@academiapro.dev|ADM120-2025-1-A",
            "session_date": date(2025, 3, 7),
            "present": False,
        },
    ]

    for item in data:
        enrollment = enrollment_map.get(item["key"])
        if not enrollment:
            continue

        existing = session.exec(
            select(Attendance).where(
                Attendance.enrollment_id == enrollment.id,
                Attendance.session_date == item["session_date"],
            )
        ).first()
        if not existing:
            session.add(
                Attendance(
                    enrollment_id=enrollment.id,
                    session_date=item["session_date"],
                    present=item["present"],
                )
            )
            session.commit()


if __name__ == "__main__":
    ensure_demo_data()
