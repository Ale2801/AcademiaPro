from typing import List, Tuple
from openpyxl import Workbook
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas


def export_schedule_excel(assignments: List[Tuple[int, int, int]], path: str) -> str:
    wb = Workbook()
    ws = wb.active
    ws.title = "Horario"
    ws.append(["course_id", "room_id", "timeslot_id"])
    for c, r, t in assignments:
        ws.append([c, r, t])
    wb.save(path)
    return path


def export_schedule_pdf(assignments: List[Tuple[int, int, int]], path: str) -> str:
    c = canvas.Canvas(path, pagesize=A4)
    width, height = A4
    y = height - 50
    c.setFont("Helvetica", 12)
    c.drawString(50, y, "Horario generado")
    y -= 20
    c.drawString(50, y, "course_id | room_id | timeslot_id")
    y -= 20
    for cid, rid, tid in assignments:
        c.drawString(50, y, f"{cid} | {rid} | {tid}")
        y -= 16
        if y < 50:
            c.showPage()
            y = height - 50
            c.setFont("Helvetica", 12)
    c.save()
    return path