import { api } from './api'

export type Course = {
  id: number
  subject_id: number
  teacher_id: number
  program_semester_id: number
  term: string
  group: string
  weekly_hours?: number | null
  capacity?: number | null
  language?: string | null
  modality?: string | null
  start_date?: string | null
  end_date?: string | null
}

export type CourseMaterial = {
  id: number
  course_id: number
  teacher_id?: number | null
  created_by_user_id?: number | null
  title: string
  description?: string | null
  material_type: 'document' | 'link' | 'video' | 'resource' | 'other'
  file_url?: string | null
  external_url?: string | null
  display_order?: number | null
  is_published: boolean
  published_at?: string | null
  created_at: string
  updated_at: string
}

export type Assignment = {
  id: number
  course_id: number
  teacher_id?: number | null
  title: string
  instructions?: string | null
  assignment_type: 'homework' | 'project' | 'quiz' | 'exam' | 'other'
  available_from?: string | null
  due_date?: string | null
  allow_late: boolean
  max_score: number
  resource_url?: string | null
  attachment_url?: string | null
  attachment_name?: string | null
  is_published: boolean
  published_at?: string | null
  created_at: string
  updated_at: string
}

export type Evaluation = {
  id: number
  course_id: number
  name: string
  weight: number
  scheduled_at?: string | null
  max_score: number
  due_date?: string | null
  description?: string | null
}

export type EvaluationPayload = Pick<Evaluation,
  | 'course_id'
  | 'name'
  | 'weight'
  | 'scheduled_at'
  | 'max_score'
  | 'due_date'
  | 'description'
>

export type Grade = {
  id: number
  enrollment_id: number
  evaluation_id: number
  score: number
  graded_at?: string | null
  feedback?: string | null
}

export type GradePayload = Pick<Grade,
  | 'evaluation_id'
  | 'enrollment_id'
  | 'score'
  | 'feedback'
> & {
  graded_at?: string | null
}

export type SubjectSummary = {
  id: number
  name?: string | null
  code?: string | null
}

export type TeacherSummary = {
  id: number
  user_id: number
  department?: string | null
  phone?: string | null
  employment_type?: string | null
  specialty?: string | null
}

export type StudentSummary = {
  id: number
  user_id: number
  enrollment_year: number
  program_id: number
  status: string
  registration_number?: string | null
}

export type EnrollmentSummary = {
  id: number
  student_id: number
  course_id: number
  status: string
}

export type UserSummary = {
  id: number
  full_name: string
  email: string
}

export type AssignmentSubmission = {
  id: number
  assignment_id: number
  enrollment_id: number
  student_id: number
  status: 'draft' | 'submitted' | 'graded' | 'returned'
  submitted_at?: string | null
  text_response?: string | null
  file_url?: string | null
  external_url?: string | null
  is_late: boolean
  grade_score?: number | null
  graded_at?: string | null
  graded_by?: number | null
  feedback?: string | null
  created_at: string
  updated_at: string
}

export type SubmissionGradePayload = {
  score: number
  feedback?: string | null
}

export type SubmissionCreatePayload = {
  text_response?: string | null
  file_url?: string | null
  external_url?: string | null
}

export type AssignmentPayload = Pick<Assignment,
  | 'course_id'
  | 'title'
  | 'instructions'
  | 'assignment_type'
  | 'available_from'
  | 'due_date'
  | 'allow_late'
  | 'max_score'
  | 'resource_url'
  | 'attachment_url'
  | 'attachment_name'
  | 'is_published'
  | 'published_at'
>

export type CourseMaterialPayload = Pick<CourseMaterial,
  | 'course_id'
  | 'title'
  | 'description'
  | 'material_type'
  | 'file_url'
  | 'external_url'
  | 'display_order'
  | 'is_published'
  | 'published_at'
>

export async function fetchCourses() {
  const { data } = await api.get<Course[]>('/courses/')
  return data
}

export async function fetchCourseMaterials(courseId?: number) {
  const params = courseId ? { course_id: courseId } : undefined
  const { data } = await api.get<CourseMaterial[]>('/course-materials/', { params })
  return data
}

export async function fetchAssignments(courseId?: number) {
  const params = courseId ? { course_id: courseId } : undefined
  const { data } = await api.get<Assignment[]>('/assignments/', { params })
  return data
}

export async function createCourseMaterial(payload: CourseMaterialPayload) {
  const { data } = await api.post<CourseMaterial>('/course-materials/', payload)
  return data
}

export async function updateCourseMaterial(id: number, payload: Partial<CourseMaterialPayload>) {
  const { data } = await api.put<CourseMaterial>(`/course-materials/${id}`, payload)
  return data
}

export async function deleteCourseMaterial(id: number) {
  await api.delete(`/course-materials/${id}`)
}

export async function createAssignment(payload: AssignmentPayload) {
  const { data } = await api.post<Assignment>('/assignments/', payload)
  return data
}

export async function updateAssignment(id: number, payload: Partial<AssignmentPayload>) {
  const { data } = await api.put<Assignment>(`/assignments/${id}`, payload)
  return data
}

export async function deleteAssignment(id: number) {
  await api.delete(`/assignments/${id}`)
}

export async function fetchSubmissions(assignmentId: number, mine = false) {
  const { data } = await api.get<AssignmentSubmission[]>(`/assignments/${assignmentId}/submissions`, {
    params: mine ? { mine: true } : undefined,
  })
  return data
}

export async function fetchEvaluations(courseId?: number) {
  const params = courseId ? { course_id: courseId } : undefined
  const { data } = await api.get<Evaluation[]>('/evaluations/', { params })
  return data
}

export async function createEvaluation(payload: EvaluationPayload) {
  const { data } = await api.post<Evaluation>('/evaluations/', payload)
  return data
}

export async function updateEvaluation(id: number, payload: Partial<EvaluationPayload>) {
  const { data } = await api.put<Evaluation>(`/evaluations/${id}`, payload)
  return data
}

export async function deleteEvaluation(id: number) {
  await api.delete(`/evaluations/${id}`)
}

export async function fetchGrades(evaluationId?: number) {
  const params = evaluationId ? { evaluation_id: evaluationId } : undefined
  const { data } = await api.get<Grade[]>('/grades/', { params })
  return data
}

export async function createGrade(payload: GradePayload) {
  const { data } = await api.post<Grade>('/grades/', payload)
  return data
}

export async function updateGrade(id: number, payload: Partial<GradePayload>) {
  const { data } = await api.put<Grade>(`/grades/${id}`, payload)
  return data
}

export async function deleteGrade(id: number) {
  await api.delete(`/grades/${id}`)
}

export async function fetchSubjects() {
  const { data } = await api.get<SubjectSummary[]>('/subjects/')
  return data
}

export async function fetchTeachers() {
  const { data } = await api.get<TeacherSummary[]>('/teachers/')
  return data
}

export async function fetchStudents() {
  const { data } = await api.get<StudentSummary[]>('/students/')
  return data
}

export async function fetchEnrollments() {
  const { data } = await api.get<EnrollmentSummary[]>('/enrollments/')
  return data
}

export async function fetchUsers() {
  const { data } = await api.get<UserSummary[]>('/users/')
  return data
}

export async function submitAssignment(assignmentId: number, payload: SubmissionCreatePayload) {
  const { data } = await api.post<AssignmentSubmission>(`/assignments/${assignmentId}/submissions`, payload)
  return data
}

export async function gradeSubmission(submissionId: number, payload: SubmissionGradePayload) {
  const { data } = await api.post<AssignmentSubmission>(`/assignments/submissions/${submissionId}/grade`, payload)
  return data
}
