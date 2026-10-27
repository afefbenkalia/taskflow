"""PDF exports of the admin console (Overview report, Projects, Activity log).

Each export is a title, a few "Label: value" lines describing what was
exported, and one or more tables. Tables repeat their header row on every
page; the footer carries the page number.
"""

import io
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

PAGE_SIZE = landscape(A4)
MARGIN = 14 * mm

# Colors of the web app.
INK = colors.HexColor("#101828")
INK_SECONDARY = colors.HexColor("#475467")
INK_MUTED = colors.HexColor("#98A2B3")
PRIMARY = colors.HexColor("#4F46E5")
LINE = colors.HexColor("#EAECF0")
HEADER_BG = colors.HexColor("#F9FAFB")
ZEBRA = colors.HexColor("#FCFCFD")

_TITLE = ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=18, leading=22, textColor=INK)
_BRAND = ParagraphStyle("brand", fontName="Helvetica-Bold", fontSize=10, leading=12, textColor=PRIMARY)
_META = ParagraphStyle("meta", fontName="Helvetica", fontSize=9, leading=12, textColor=INK_SECONDARY)
# keepWithNext: a section title never ends a page without its table.
_SECTION = ParagraphStyle("section", fontName="Helvetica-Bold", fontSize=11.5, leading=14, textColor=INK,
                          spaceBefore=4, spaceAfter=6, keepWithNext=1)
_CELL = ParagraphStyle("cell", fontName="Helvetica", fontSize=8.5, leading=11, textColor=INK)
_CELL_RIGHT = ParagraphStyle("cell_right", parent=_CELL, alignment=TA_RIGHT)
_HEAD = ParagraphStyle("head", fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=INK_SECONDARY)
_HEAD_RIGHT = ParagraphStyle("head_right", parent=_HEAD, alignment=TA_RIGHT)
_EMPTY = ParagraphStyle("empty", parent=_META, textColor=INK_MUTED)


@dataclass(frozen=True)
class PdfTable:
    headers: Sequence[str]
    rows: Sequence[Sequence[Any]]
    title: str | None = None
    # Relative column widths; equal columns when omitted.
    widths: Sequence[float] | None = None
    # Indexes of right-aligned (numeric) columns.
    numeric: frozenset[int] = field(default_factory=frozenset)
    empty_message: str = "Nothing to show."
    # Share of the page width; narrow tables keep values close to their labels.
    width_ratio: float = 1.0


def _text(value: Any) -> str:
    return escape("" if value is None else str(value))


def _table(spec: PdfTable, width: float) -> list[Any]:
    flowables: list[Any] = []
    if spec.title:
        flowables.append(Paragraph(_text(spec.title), _SECTION))
    if not spec.rows:
        flowables.append(Paragraph(_text(spec.empty_message), _EMPTY))
        flowables.append(Spacer(0, 8))
        return flowables

    weights = list(spec.widths or [1] * len(spec.headers))
    table_width = width * spec.width_ratio
    col_widths = [table_width * weight / sum(weights) for weight in weights]
    head = [
        Paragraph(_text(header), _HEAD_RIGHT if index in spec.numeric else _HEAD)
        for index, header in enumerate(spec.headers)
    ]
    body = [
        [
            Paragraph(_text(value), _CELL_RIGHT if index in spec.numeric else _CELL)
            for index, value in enumerate(row)
        ]
        for row in spec.rows
    ]
    table = Table([head, *body], colWidths=col_widths, repeatRows=1, hAlign="LEFT")
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), HEADER_BG),
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, LINE),
        ("BOX", (0, 0), (-1, -1), 0.5, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]
    style += [("BACKGROUND", (0, row), (-1, row), ZEBRA) for row in range(2, len(body) + 1, 2)]
    table.setStyle(TableStyle(style))
    flowables.append(table)
    flowables.append(Spacer(0, 10))
    return flowables


class _NumberedCanvas(Canvas):
    """Draws "Page X of Y" once the total page count is known."""

    def __init__(self, *args: Any, footer: str = "", **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._footer = footer
        self._pages: list[dict[str, Any]] = []

    def showPage(self) -> None:  # noqa: N802 (ReportLab API)
        self._pages.append(dict(self.__dict__))
        self._startPage()

    def save(self) -> None:
        total = len(self._pages)
        for state in self._pages:
            self.__dict__.update(state)
            self._draw_footer(total)
            super().showPage()
        super().save()

    def _draw_footer(self, total: int) -> None:
        width, _ = self._pagesize
        self.setStrokeColor(LINE)
        self.setLineWidth(0.5)
        self.line(MARGIN, 10 * mm, width - MARGIN, 10 * mm)
        self.setFont("Helvetica", 8)
        self.setFillColor(INK_MUTED)
        self.drawString(MARGIN, 6 * mm, self._footer)
        self.drawRightString(width - MARGIN, 6 * mm, f"Page {self._pageNumber} of {total}")


def build_pdf(
    title: str,
    tables: Sequence[PdfTable],
    *,
    details: Sequence[tuple[str, str]] = (),
    generated_at: datetime | None = None,
) -> bytes:
    """Renders an export; `details` are "Label: value" lines under the title (period, filters…)."""
    generated_at = generated_at or datetime.now(UTC)
    buffer = io.BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=PAGE_SIZE,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=16 * mm,
        title=f"TaskFlow — {title}",
        author="TaskFlow",
    )
    width = PAGE_SIZE[0] - 2 * MARGIN

    story: list[Any] = [
        Paragraph("TaskFlow · Admin console", _BRAND),
        Spacer(0, 3),
        Paragraph(_text(title), _TITLE),
        Spacer(0, 4),
    ]
    lines = [("Generated", generated_at.strftime("%b %d, %Y at %H:%M UTC")), *details]
    for label, value in lines:
        story.append(Paragraph(f"<b>{_text(label)}:</b> {_text(value)}", _META))
    story.append(Spacer(0, 12))
    for spec in tables:
        story.extend(_table(spec, width))

    footer = f"TaskFlow · {title}"
    document.build(story, canvasmaker=lambda *args, **kwargs: _NumberedCanvas(*args, footer=footer, **kwargs))
    return buffer.getvalue()
