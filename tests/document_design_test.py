#!/usr/bin/env python3
"""Pruebas de contenido y paginación para contrato y recibos ficticios."""

from __future__ import annotations

import json
import os
import re
import sys
import tempfile
from pathlib import Path

import pdfplumber
from pypdf import PdfReader
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from generate_visual_examples import draw_contract, draw_receipt, load_clauses, money  # noqa: E402


def normalized(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def extracted_text(path: Path) -> str:
    with pdfplumber.open(path) as document:
        return normalized("\n".join(page.extract_text() or "" for page in document.pages))


def assert_words_present(value: str, text: str) -> None:
    expected = set(re.findall(r"\w+", value.lower(), flags=re.UNICODE))
    actual = set(re.findall(r"\w+", text.lower(), flags=re.UNICODE))
    missing = expected - actual
    assert not missing, f"Faltan palabras en el PDF: {sorted(missing)}"


def assert_letter_page(path: Path) -> None:
    reader = PdfReader(path)
    assert len(reader.pages) == 1, f"{path.name} generó más de una página"
    page = reader.pages[0]
    assert float(page.mediabox.width) == letter[0]
    assert float(page.mediabox.height) == letter[1]


def create_contract(path: Path, contract: dict, clauses: list[str]) -> None:
    pdf = canvas.Canvas(str(path), pagesize=letter, pageCompression=1, invariant=1)
    draw_contract(pdf, contract, clauses)
    pdf.save()


def create_receipt(path: Path, contract: dict, payment: dict) -> None:
    pdf = canvas.Canvas(str(path), pagesize=letter, pageCompression=1, invariant=1)
    draw_receipt(pdf, contract, payment)
    pdf.save()


def main() -> None:
    contracts = json.loads((ROOT / "samples" / "contratos-ficticios.json").read_text(encoding="utf-8"))
    clauses = load_clauses()
    assert len(clauses) == 9

    keep_dir = os.environ.get("PLAZA_QA_DIR")
    temporary = None
    if keep_dir:
        output_dir = ROOT / keep_dir
        output_dir.mkdir(parents=True, exist_ok=True)
    else:
        temporary = tempfile.TemporaryDirectory(prefix="plaza-represo-pdf-")
        output_dir = Path(temporary.name)

    for contract in contracts:
        path = output_dir / f"contrato-{contract['contractNumber'].replace('.', '')}.pdf"
        create_contract(path, contract, clauses)
        assert_letter_page(path)
        text = extracted_text(path)
        assert contract["contractNumber"] in text
        assert_words_present(contract["clientName"], text)
        assert_words_present(contract["address"], text)
        assert_words_present(contract["eventType"], text)
        assert money(contract["total"]) in text
        assert money(contract["initialDeposit"]) in text
        # En una tabla de dos columnas el extractor puede intercalar el número
        # de la cláusula entre líneas visualmente continuas. Verificamos todas
        # las palabras de cada cláusula sin depender de ese orden técnico.
        for clause in clauses:
            assert_words_present(clause, text)

    pending_contract = contracts[-1]
    pending_payment = {
        "id": "PAGO-DEMO-0002",
        "date": "2026-07-20",
        "amount": 500,
        "method": "Efectivo",
        "note": "Segundo abono ficticio",
        "newPaid": 2750,
        "newBalance": 1750,
    }
    pending_path = output_dir / "recibo-saldo-pendiente.pdf"
    create_receipt(pending_path, pending_contract, pending_payment)
    assert_letter_page(pending_path)
    pending_text = extracted_text(pending_path)
    assert "SALDO PENDIENTE" in pending_text
    assert money(1750) in pending_text

    paid_contract = contracts[0]
    paid_payment = {
        "id": "PAGO-DEMO-0003",
        "date": "2026-07-21",
        "amount": 2250,
        "method": "Transferencia",
        "note": "Liquidación ficticia",
        "newPaid": 4500,
        "newBalance": 0,
    }
    paid_path = output_dir / "recibo-liquidado.pdf"
    create_receipt(paid_path, paid_contract, paid_payment)
    assert_letter_page(paid_path)
    paid_text = extracted_text(paid_path)
    assert "PAGO LIQUIDADO" in paid_text
    assert money(0) in paid_text

    print(f"{len(contracts)} contratos y 2 recibos verificados en una página")
    if keep_dir:
        print(output_dir)
    if temporary:
        temporary.cleanup()


if __name__ == "__main__":
    main()
