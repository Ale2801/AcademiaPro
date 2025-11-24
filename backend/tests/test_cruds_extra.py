from fastapi.testclient import TestClient


def _auth_headers(token: str) -> dict[str, str]:
	return {"Authorization": f"Bearer {token}"}


def _subject_payload(code: str, name: str) -> dict[str, object]:
	return {
		"code": code,
		"name": name,
		"pedagogical_hours_per_week": 4,
		"weekly_autonomous_work_hours": 2,
	}


def test_subject_prerequisites_flow(client: TestClient, admin_token: str):
	headers = _auth_headers(admin_token)

	base_resp = client.post("/subjects/", json=_subject_payload("PRE-BASE-1", "Base 1"), headers=headers)
	assert base_resp.status_code == 200, base_resp.text
	base_id = base_resp.json()["id"]

	alt_resp = client.post("/subjects/", json=_subject_payload("PRE-BASE-2", "Base 2"), headers=headers)
	assert alt_resp.status_code == 200, alt_resp.text
	alt_id = alt_resp.json()["id"]

	advanced_payload = _subject_payload("PRE-ADV-1", "Avanzada 1 | Física")
	advanced_payload["prerequisite_subject_ids"] = [base_id]
	advanced_resp = client.post("/subjects/", json=advanced_payload, headers=headers)
	assert advanced_resp.status_code == 200, advanced_resp.text
	advanced = advanced_resp.json()
	assert advanced["prerequisite_subject_ids"] == [base_id]

	# Update to include multiple prerequisites
	update_payload = {
		"id": advanced["id"],
		"code": advanced["code"],
		"name": "Avanzada 1 Revisada",
		"pedagogical_hours_per_week": advanced["pedagogical_hours_per_week"],
		"weekly_autonomous_work_hours": advanced["weekly_autonomous_work_hours"],
		"prerequisite_subject_ids": [base_id, alt_id],
	}
	update_resp = client.put(f"/subjects/{advanced['id']}", json=update_payload, headers=headers)
	assert update_resp.status_code == 200, update_resp.text
	assert set(update_resp.json()["prerequisite_subject_ids"]) == {base_id, alt_id}

	# Removing all prerequisites should persist the change
	clear_payload = update_payload | {"prerequisite_subject_ids": []}
	clear_resp = client.put(f"/subjects/{advanced['id']}", json=clear_payload, headers=headers)
	assert clear_resp.status_code == 200, clear_resp.text
	assert clear_resp.json()["prerequisite_subject_ids"] == []

	# Listing should include the prerequisite field
	listing = client.get("/subjects/", headers=headers)
	assert listing.status_code == 200, listing.text
	details = {item["id"]: item for item in listing.json()}
	assert advanced["id"] in details
	assert details[advanced["id"]]["prerequisite_subject_ids"] == []

	# Validation: cannot point to non-existent subject
	invalid_payload = clear_payload | {"prerequisite_subject_ids": [999999]}
	invalid_resp = client.put(f"/subjects/{advanced['id']}", json=invalid_payload, headers=headers)
	assert invalid_resp.status_code == 404

	# Validation: cannot require itself
	self_payload = clear_payload | {"prerequisite_subject_ids": [advanced["id"]]}
	self_resp = client.put(f"/subjects/{advanced['id']}", json=self_payload, headers=headers)
	assert self_resp.status_code == 400


def test_crud_updates_accept_iso_strings(client: TestClient, admin_token: str):
	headers = _auth_headers(admin_token)

	# Program + semester to support dependent entities
	program_resp = client.post(
		"/programs/",
		json={"code": "ISO-PRG", "name": "ISO Program", "level": "test", "duration_semesters": 8},
		headers=headers,
	)
	assert program_resp.status_code == 200, program_resp.text
	program_id = program_resp.json()["id"]

	semester_resp = client.post(
		"/program-semesters/",
		json={"program_id": program_id, "semester_number": 1, "label": "Semestre 1"},
		headers=headers,
	)
	assert semester_resp.status_code == 200, semester_resp.text
	semester_id = semester_resp.json()["id"]

	# Teacher
	teacher_resp = client.post(
		"/teachers/",
		json={"user_id": 999, "department": "Matemáticas", "employment_type": "full_time"},
		headers=headers,
	)
	assert teacher_resp.status_code == 200, teacher_resp.text
	teacher_id = teacher_resp.json()["id"]

	# Subject
	subject_resp = client.post(
		"/subjects/",
		json={
			"code": "ISO-SUB",
			"name": "ISO Subject",
			"pedagogical_hours_per_week": 4,
			"weekly_autonomous_work_hours": 2,
		},
		headers=headers,
	)
	assert subject_resp.status_code == 200, subject_resp.text
	subject_id = subject_resp.json()["id"]

	# Course
	course_resp = client.post(
		"/courses/",
		json={
			"subject_id": subject_id,
			"teacher_id": teacher_id,
			"program_semester_id": semester_id,
			"term": "2025-1",
			"group": "A",
		},
		headers=headers,
	)
	assert course_resp.status_code == 200, course_resp.text
	course_id = course_resp.json()["id"]

	# Student
	student_resp = client.post(
		"/students/",
		json={"user_id": 500, "enrollment_year": 2024, "program_id": program_id},
		headers=headers,
	)
	assert student_resp.status_code == 200, student_resp.text
	student_id = student_resp.json()["id"]

	# Enrollment
	enrollment_resp = client.post(
		"/enrollments/",
		json={"student_id": student_id, "course_id": course_id},
		headers=headers,
	)
	assert enrollment_resp.status_code == 200, enrollment_resp.text
	enrollment_id = enrollment_resp.json()["id"]

	# Evaluation
	evaluation_resp = client.post(
		"/evaluations/",
		json={"course_id": course_id, "name": "Primer Parcial", "weight": 0.3},
		headers=headers,
	)
	assert evaluation_resp.status_code == 200, evaluation_resp.text
	evaluation_id = evaluation_resp.json()["id"]

	# Grade
	grade_resp = client.post(
		"/grades/",
		json={"enrollment_id": enrollment_id, "evaluation_id": evaluation_id, "score": 85},
		headers=headers,
	)
	assert grade_resp.status_code == 200, grade_resp.text
	grade_id = grade_resp.json()["id"]

	# Attendance
	attendance_resp = client.post(
		"/attendance/",
		json={"enrollment_id": enrollment_id, "session_date": "2025-02-02", "present": True},
		headers=headers,
	)
	assert attendance_resp.status_code == 200, attendance_resp.text
	attendance_id = attendance_resp.json()["id"]

	# Timeslot
	timeslot_resp = client.post(
		"/timeslots/",
		json={"day_of_week": 0, "start_time": "08:00", "end_time": "09:30", "campus": "Central"},
		headers=headers,
	)
	assert timeslot_resp.status_code == 200, timeslot_resp.text
	timeslot_id = timeslot_resp.json()["id"]

	# Teacher update with ISO date
	teacher_update = client.put(
		f"/teachers/{teacher_id}",
		json={
			"id": teacher_id,
			"user_id": 999,
			"department": "Matemáticas",
			"employment_type": "full_time",
			"hire_date": "2025-10-30",
		},
		headers=headers,
	)
	assert teacher_update.status_code == 200, teacher_update.text
	assert teacher_update.json()["hire_date"] == "2025-10-30"

	# Student update with ISO dates
	student_update = client.put(
		f"/students/{student_id}",
		json={
			"id": student_id,
			"user_id": 500,
			"enrollment_year": 2024,
			"program_id": program_id,
			"admission_date": "2025-01-10",
			"expected_graduation_date": "2029-12-01",
		},
		headers=headers,
	)
	assert student_update.status_code == 200, student_update.text
	payload = student_update.json()
	assert payload["admission_date"] == "2025-01-10"
	assert payload["expected_graduation_date"] == "2029-12-01"

	# Course update with ISO dates
	course_update = client.put(
		f"/courses/{course_id}",
		json={
			"id": course_id,
			"subject_id": subject_id,
			"teacher_id": teacher_id,
			"program_semester_id": semester_id,
			"term": "2025-1",
			"group": "A",
			"start_date": "2025-03-01",
			"end_date": "2025-07-15",
		},
		headers=headers,
	)
	assert course_update.status_code == 200, course_update.text
	course_payload = course_update.json()
	assert course_payload["start_date"] == "2025-03-01"
	assert course_payload["end_date"] == "2025-07-15"

	# Enrollment update with ISO datetimes
	enrollment_update = client.put(
		f"/enrollments/{enrollment_id}",
		json={
			"id": enrollment_id,
			"student_id": student_id,
			"course_id": course_id,
			"enrolled_at": "2025-02-01T10:15:00",
			"dropped_at": "2025-02-02T09:00:00",
		},
		headers=headers,
	)
	assert enrollment_update.status_code == 200, enrollment_update.text
	enrollment_payload = enrollment_update.json()
	assert enrollment_payload["enrolled_at"].startswith("2025-02-01T10:15:00")
	assert enrollment_payload["dropped_at"].startswith("2025-02-02T09:00:00")

	# Evaluation update with ISO datetimes
	evaluation_update = client.put(
		f"/evaluations/{evaluation_id}",
		json={
			"id": evaluation_id,
			"course_id": course_id,
			"name": "Primer Parcial",
			"weight": 0.3,
			"scheduled_at": "2025-02-05T08:00:00",
			"due_date": "2025-02-10T23:59:00",
		},
		headers=headers,
	)
	assert evaluation_update.status_code == 200, evaluation_update.text
	evaluation_payload = evaluation_update.json()
	assert evaluation_payload["scheduled_at"].startswith("2025-02-05T08:00:00")
	assert evaluation_payload["due_date"].startswith("2025-02-10T23:59:00")

	# Grade update with ISO datetime
	grade_update = client.put(
		f"/grades/{grade_id}",
		json={
			"id": grade_id,
			"enrollment_id": enrollment_id,
			"evaluation_id": evaluation_id,
			"score": 90,
			"graded_at": "2025-02-06T12:30:00",
		},
		headers=headers,
	)
	assert grade_update.status_code == 200, grade_update.text
	assert grade_update.json()["graded_at"].startswith("2025-02-06T12:30:00")

	# Attendance update with ISO date/time
	attendance_update = client.put(
		f"/attendance/{attendance_id}",
		json={
			"id": attendance_id,
			"enrollment_id": enrollment_id,
			"session_date": "2025-02-03",
			"present": True,
			"arrival_time": "08:05:00",
		},
		headers=headers,
	)
	assert attendance_update.status_code == 200, attendance_update.text
	attendance_payload = attendance_update.json()
	assert attendance_payload["session_date"] == "2025-02-03"
	assert attendance_payload["arrival_time"].startswith("08:05:00")

	# Timeslot update with ISO times
	timeslot_update = client.put(
		f"/timeslots/{timeslot_id}",
		json={
			"id": timeslot_id,
			"day_of_week": 0,
			"start_time": "09:00",
			"end_time": "11:00",
			"campus": "Central",
		},
		headers=headers,
	)
	assert timeslot_update.status_code == 200, timeslot_update.text
	timeslot_payload = timeslot_update.json()
	assert timeslot_payload["start_time"].startswith("09:00")
	assert timeslot_payload["end_time"].startswith("11:00")
