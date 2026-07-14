#!/usr/bin/env python3
"""Genera ejemplos ficticios del contrato y del recibo para revisión visual."""

from __future__ import annotations

import html
import json
import re
from datetime import date
from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


ROOT = Path(__file__).resolve().parents[1]
OUTPUTS = ROOT / "outputs"
SAMPLES = ROOT / "samples" / "contratos-ficticios.json"
CLAUSES_FILE = ROOT / "templates" / "CLAUSULAS.md"

INK = HexColor("#161616")
INK_SOFT = HexColor("#2B2B2B")
GOLD = HexColor("#F4B41A")
GOLD_SOFT = HexColor("#FFF4D6")
PAPER = HexColor("#FFFCF6")
LINE = HexColor("#D8C89B")
MUTED = HexColor("#66605A")
RED = HexColor("#C52222")
GREEN = HexColor("#15803D")
WHITE = HexColor("#FFFFFF")

MONTHS = (
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
)
DAY_NAMES = ("Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo")


def money(value: float) -> str:
    return f"${float(value):,.2f}"


def printable_date(value: str) -> str:
    parsed = date.fromisoformat(value)
    return f"{parsed.day} de {MONTHS[parsed.month - 1]} de {parsed.year}"


def event_day(value: str) -> str:
    return DAY_NAMES[date.fromisoformat(value).weekday()]


def printable_time(value: str) -> str:
    hour, minute = (int(piece) for piece in value.split(":"))
    suffix = "p.m." if hour >= 12 else "a.m."
    hour = hour % 12 or 12
    return f"{hour}:{minute:02d} {suffix}"


def load_clauses() -> list[str]:
    clauses: list[str] = []
    for line in CLAUSES_FILE.read_text(encoding="utf-8").splitlines():
        match = re.match(r"^\d+\.\s+(.*)$", line.strip())
        if match:
            clauses.append(match.group(1))
    if len(clauses) != 9:
        raise ValueError(f"Se esperaban 9 cláusulas y se encontraron {len(clauses)}")
    return clauses


def paragraph_style(name: str, size: float, leading: float, color=INK, align=TA_LEFT, bold=False):
    return ParagraphStyle(
        name,
        fontName="Helvetica-Bold" if bold else "Helvetica",
        fontSize=size,
        leading=leading,
        textColor=color,
        alignment=align,
        spaceAfter=0,
        spaceBefore=0,
    )


def draw_paragraph(pdf, text: str, x: float, top: float, width: float, style) -> float:
    paragraph = Paragraph(text, style)
    _, height = paragraph.wrap(width, 200)
    paragraph.drawOn(pdf, x, top - height)
    return height


def draw_brand_header(pdf, right_label: str, right_value: str) -> None:
    x, y, width, height = 30, 708, 552, 62
    badge_width = 138
    pdf.setFillColor(INK)
    pdf.roundRect(x, y, width, height, 7, stroke=0, fill=1)
    pdf.setStrokeColor(GOLD)
    pdf.setLineWidth(1.5)
    pdf.roundRect(x, y, width, height, 7, stroke=1, fill=0)
    pdf.setLineWidth(1)
    pdf.line(x + width - badge_width, y + 8, x + width - badge_width, y + height - 8)

    pdf.setFillColor(WHITE)
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawString(x + 16, y + 43, "PLAZA")
    pdf.setFillColor(GOLD)
    pdf.setFont("Helvetica-Bold", 25)
    pdf.drawString(x + 16, y + 17, "REPRESO")
    brand_width = stringWidth("REPRESO", "Helvetica-Bold", 25)
    pdf.setFillColor(WHITE)
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawString(x + 24 + brand_width, y + 21, "EVENTOS")

    center = x + width - badge_width / 2
    pdf.setFillColor(WHITE)
    pdf.setFont("Helvetica-Bold", 7)
    pdf.drawCentredString(center, y + 40, right_label)
    pdf.setFillColor(GOLD)
    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawCentredString(center, y + 18, right_value)


def draw_info_card(pdf, x: float, y: float, width: float, height: float, title: str, body_html: str) -> None:
    pdf.setFillColor(PAPER)
    pdf.setStrokeColor(LINE)
    pdf.setLineWidth(0.8)
    pdf.roundRect(x, y, width, height, 7, stroke=1, fill=1)
    pdf.setFillColor(INK)
    pdf.roundRect(x, y + height - 24, width, 24, 7, stroke=0, fill=1)
    pdf.rect(x, y + height - 24, width, 12, stroke=0, fill=1)
    pdf.setFillColor(WHITE)
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawCentredString(x + width / 2, y + height - 16, title)
    draw_paragraph(
        pdf,
        body_html,
        x + 9,
        y + height - 32,
        width - 18,
        paragraph_style(f"{title}-body", 7.15, 11.1),
    )


def draw_contract(pdf, contract: dict, clauses: list[str]) -> None:
    width, height = letter
    pdf.setTitle(f"Contrato {contract['contractNumber']} - ejemplo ficticio")
    pdf.setAuthor("Plaza Represo")
    pdf.setFillColor(WHITE)
    pdf.rect(0, 0, width, height, stroke=0, fill=1)
    draw_brand_header(pdf, "CONTRATO No.", contract["contractNumber"])

    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 10.5)
    pdf.drawCentredString(width / 2, 690, "CONTRATO DE ARRENDAMIENTO PARA SALÓN DE EVENTOS SOCIALES")
    pdf.setFillColor(RED)
    pdf.setFont("Helvetica-Bold", 14)
    pdf.drawCentredString(width / 2, 674, "PLAZA REPRESO")
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica-Bold", 7.2)
    pdf.drawCentredString(
        width / 2,
        660,
        f"NOGALES, SONORA  |  {printable_date(contract['elaborationDate']).upper()}",
    )

    event_body = (
        f'<b><font color="#C52222">DÍA</font></b>  {event_day(contract["eventDate"])}<br/>'
        f'<b><font color="#C52222">FECHA</font></b>  {printable_date(contract["eventDate"])}<br/>'
        f'<b><font color="#C52222">HORARIO</font></b>  {printable_time(contract["startTime"])} - {printable_time(contract["endTime"])}<br/>'
        f'<b><font color="#C52222">EVENTO</font></b>  {html.escape(contract["eventType"])}'
    )
    client_body = (
        f'<b><font color="#C52222">NOMBRE</font></b>  {html.escape(contract["clientName"])}<br/>'
        f'<b><font color="#C52222">DOMICILIO</font></b>  {html.escape(contract["address"])}<br/>'
        f'<b><font color="#C52222">TELÉFONO</font></b>  {html.escape(contract["phone"])}'
    )
    status = "PAGADO" if float(contract["balance"]) == 0 else "SALDO PENDIENTE"
    payment_body = (
        f'<b><font color="#C52222">PAGO TOTAL</font></b>  {money(contract["total"])}<br/>'
        f'<b><font color="#C52222">ABONO INICIAL</font></b>  {money(contract["initialDeposit"])}<br/>'
        f'<b><font color="#C52222">SALDO</font></b>  {money(contract["balance"])}<br/>'
        f'<b><font color="#15803D">{status}</font></b>'
    )
    draw_info_card(pdf, 30, 535, 172, 104, "DATOS DEL EVENTO", event_body)
    draw_info_card(pdf, 210, 535, 205, 104, "DATOS DEL CLIENTE", client_body)
    draw_info_card(pdf, 423, 535, 159, 104, "PAGOS", payment_body)

    intro = (
        "Se celebra este contrato entre el <b>ARRENDADOR</b>, Salón de Eventos Plaza Represo, "
        "y el <b>ARRENDATARIO(A)</b> antes mencionado, quienes aceptan las siguientes cláusulas:"
    )
    draw_paragraph(pdf, intro, 38, 511, 536, paragraph_style("intro", 7.3, 9, align=TA_CENTER))

    pdf.setFillColor(INK)
    pdf.roundRect(214, 468, 184, 21, 5, stroke=0, fill=1)
    pdf.setStrokeColor(GOLD)
    pdf.setLineWidth(1)
    pdf.roundRect(214, 468, 184, 21, 5, stroke=1, fill=0)
    pdf.setFillColor(WHITE)
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawCentredString(306, 475, "CLÁUSULAS")

    top = 468
    minimum_heights = (26, 42, 34, 24, 36, 31, 40, 30, 27)
    clause_style = paragraph_style("clause", 6.9, 8.2)
    for index, (clause, minimum) in enumerate(zip(clauses, minimum_heights), start=1):
        paragraph = Paragraph(html.escape(clause), clause_style)
        _, text_height = paragraph.wrap(498, 100)
        row_height = max(minimum, text_height + 8)
        bottom = top - row_height
        pdf.setFillColor(WHITE if index % 2 else PAPER)
        pdf.setStrokeColor(LINE)
        pdf.rect(40, bottom, 542, row_height, stroke=1, fill=1)
        pdf.setFillColor(INK)
        pdf.rect(40, bottom, 34, row_height, stroke=0, fill=1)
        pdf.setFillColor(GOLD)
        pdf.setFont("Helvetica-Bold", 9)
        pdf.drawCentredString(57, bottom + row_height / 2 - 3, str(index))
        paragraph.drawOn(pdf, 80, bottom + (row_height - text_height) / 2)
        top = bottom

    deposit_y = top - 34
    pdf.setFillColor(INK)
    pdf.roundRect(76, deposit_y, 460, 27, 5, stroke=0, fill=1)
    pdf.setFillColor(GOLD)
    pdf.roundRect(382, deposit_y + 2, 152, 23, 4, stroke=0, fill=1)
    pdf.setFillColor(WHITE)
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawCentredString(229, deposit_y + 9, "SE APARTÓ CON LA CANTIDAD DE")
    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawCentredString(458, deposit_y + 8, f"{money(contract['initialDeposit'])} M.N.")

    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawCentredString(width / 2, deposit_y - 13, "PLAZA REPRESO AGRADECE SU PREFERENCIA")

    footer_y = max(31, deposit_y - 70)
    pdf.setFillColor(PAPER)
    pdf.setStrokeColor(INK)
    pdf.roundRect(40, footer_y, 542, 45, 6, stroke=1, fill=1)
    pdf.setStrokeColor(GOLD)
    pdf.line(430, footer_y + 6, 430, footer_y + 39)
    pdf.setFillColor(RED)
    pdf.setFont("Helvetica-Bold", 7)
    pdf.drawString(52, footer_y + 29, "DIRECCIÓN DEL SALÓN")
    pdf.drawCentredString(506, footer_y + 29, "CAPACIDAD MÁXIMA")
    draw_paragraph(
        pdf,
        "Ave. Tecnológico y Calle Cahitas No. 250,<br/>Col. Luis Donaldo Colosio, Nogales, Sonora.",
        52,
        footer_y + 23,
        360,
        paragraph_style("address", 6.4, 7.5),
    )
    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawCentredString(506, footer_y + 11, "100 PERSONAS")
    pdf.showPage()


def draw_receipt(pdf, contract: dict, payment: dict | None = None) -> None:
    width, height = letter
    payment = payment or {
        "id": "PAGO-DEMO-0001",
        "date": contract["eventDate"],
        "amount": contract["balance"],
        "method": "Transferencia",
        "note": "Liquidación del contrato",
        "newPaid": contract["total"],
        "newBalance": 0,
    }
    pdf.setTitle(f"Recibo {contract['contractNumber']} - ejemplo ficticio")
    pdf.setAuthor("Plaza Represo")
    pdf.setFillColor(WHITE)
    pdf.rect(0, 0, width, height, stroke=0, fill=1)
    draw_brand_header(pdf, "RECIBO", contract["contractNumber"])

    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 15)
    pdf.drawCentredString(width / 2, 672, "COMPROBANTE DE PAGO")
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica-Bold", 7)
    pdf.drawCentredString(width / 2, 657, "FOLIO PAGO-DEMO")

    pdf.setFillColor(INK)
    pdf.roundRect(70, 573, 472, 62, 7, stroke=0, fill=1)
    pdf.setFillColor(GOLD)
    pdf.roundRect(316, 575, 224, 58, 6, stroke=0, fill=1)
    pdf.setFillColor(WHITE)
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawCentredString(193, 601, "CANTIDAD RECIBIDA")
    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 22)
    pdf.drawCentredString(428, 595, money(payment["amount"]))

    rows = [
        ("CLIENTE", contract["clientName"]),
        ("CONTRATO", contract["contractNumber"]),
        ("FECHA DE PAGO", printable_date(payment["date"])),
        ("MÉTODO", payment["method"]),
        ("CONCEPTO", payment["note"]),
        ("TOTAL PAGADO", money(payment["newPaid"])),
        ("SALDO RESTANTE", money(payment["newBalance"])),
    ]
    x, y, label_width, value_width, row_height = 70, 344, 158, 314, 31
    for index, (label, value) in enumerate(rows):
        row_y = y + (len(rows) - index - 1) * row_height
        pdf.setFillColor(GOLD_SOFT if index % 2 == 0 else PAPER)
        pdf.setStrokeColor(LINE)
        pdf.rect(x, row_y, label_width, row_height, stroke=1, fill=1)
        pdf.setFillColor(WHITE if index % 2 == 0 else PAPER)
        pdf.rect(x + label_width, row_y, value_width, row_height, stroke=1, fill=1)
        pdf.setFillColor(RED)
        pdf.setFont("Helvetica-Bold", 7.5)
        pdf.drawString(x + 10, row_y + 11, label)
        pdf.setFillColor(INK)
        pdf.setFont("Helvetica-Bold" if index >= 5 else "Helvetica", 9)
        pdf.drawString(x + label_width + 12, row_y + 10, str(value))

    is_paid = float(payment["newBalance"]) == 0
    pdf.setFillColor(HexColor("#ECFDF3") if is_paid else GOLD_SOFT)
    pdf.setStrokeColor(GREEN if is_paid else GOLD)
    pdf.roundRect(144, 294, 324, 34, 6, stroke=1, fill=1)
    pdf.setFillColor(GREEN if is_paid else INK)
    pdf.setFont("Helvetica-Bold", 12)
    status_text = "PAGO LIQUIDADO" if is_paid else f"SALDO PENDIENTE  {money(payment['newBalance'])}"
    pdf.drawCentredString(width / 2, 305, status_text)

    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawCentredString(width / 2, 246, "GRACIAS POR SU PREFERENCIA")
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 7.2)
    pdf.drawCentredString(
        width / 2,
        226,
        "Este recibo forma parte del historial de pagos y no sustituye el contrato original.",
    )

    pdf.setFillColor(PAPER)
    pdf.setStrokeColor(INK)
    pdf.roundRect(70, 120, 472, 54, 6, stroke=1, fill=1)
    pdf.setFillColor(RED)
    pdf.setFont("Helvetica-Bold", 7)
    pdf.drawCentredString(width / 2, 153, "PLAZA REPRESO")
    pdf.setFillColor(INK)
    pdf.setFont("Helvetica", 7)
    pdf.drawCentredString(
        width / 2,
        138,
        "Ave. Tecnológico y Calle Cahitas No. 250, Col. Luis Donaldo Colosio, Nogales, Sonora.",
    )
    pdf.showPage()


def main() -> None:
    OUTPUTS.mkdir(parents=True, exist_ok=True)
    contracts = json.loads(SAMPLES.read_text(encoding="utf-8"))
    clauses = load_clauses()
    contract = contracts[0]

    contract_path = OUTPUTS / "contrato_ejemplo_C2625.pdf"
    contract_pdf = canvas.Canvas(str(contract_path), pagesize=letter, pageCompression=1, invariant=1)
    draw_contract(contract_pdf, contract, clauses)
    contract_pdf.save()

    receipt_path = OUTPUTS / "recibo_ejemplo_C2625.pdf"
    receipt_pdf = canvas.Canvas(str(receipt_path), pagesize=letter, pageCompression=1, invariant=1)
    draw_receipt(receipt_pdf, contract)
    receipt_pdf.save()

    print(contract_path)
    print(receipt_path)


if __name__ == "__main__":
    main()
