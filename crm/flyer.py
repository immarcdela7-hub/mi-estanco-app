"""Generación de carteles A6 y material de imprenta con el QR de cada código.

La plantilla por defecto es assets/cartel_A6.pdf (el cartel de NoTaxLost, que
trae un QR de relleno dentro de la tarjeta blanca). Para cada código se tapa el
QR de relleno con un rectángulo blanco y se dibuja encima el QR real, más el
código en texto pequeño para poder identificar el cartel al repartirlo.
"""
import io
import zipfile
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import HexColor
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from crm import qr_utils

DEFAULT_TEMPLATE = Path(__file__).resolve().parent.parent / "assets" / "cartel_A6.pdf"

# Posición del QR en el cartel A6 v2 de NoTaxLost, medida sobre el PDF original
# (origen abajo-izquierda, en milímetros). Si se cambia la plantilla de
# assets/cartel_A6.pdf, hay que volver a medir estos valores.
DEFAULTS = {
    "qr_x_mm": 33.0,
    "qr_y_mm": 35.7,
    "qr_size_mm": 38.8,
    "code_y_mm": 22.5,
}

QR_NAVY = "#092B57"  # azul del QR original del cartel
CODE_GRAY = "#94a3b8"


def default_template_bytes():
    return DEFAULT_TEMPLATE.read_bytes()


def stamp_flyers(template_bytes, codes_urls, qr_x_mm, qr_y_mm, qr_size_mm, code_y_mm):
    """PDF multipágina: una copia del cartel por cada (código, url), listo para imprenta."""
    base_reader = PdfReader(io.BytesIO(template_bytes))
    page_box = base_reader.pages[0].mediabox
    width, height = float(page_box.width), float(page_box.height)

    writer = PdfWriter()
    for code, url in codes_urls:
        overlay_buf = io.BytesIO()
        c = canvas.Canvas(overlay_buf, pagesize=(width, height))
        x, y, size = qr_x_mm * mm, qr_y_mm * mm, qr_size_mm * mm
        pad = 1.5 * mm
        c.setFillColorRGB(1, 1, 1)
        c.rect(x - pad, y - pad, size + 2 * pad, size + 2 * pad, stroke=0, fill=1)
        png = qr_utils.make_qr_png(url, fill_color=QR_NAVY)
        c.drawImage(ImageReader(io.BytesIO(png)), x, y, size, size)
        c.setFont("Helvetica", 5.5)
        c.setFillColor(HexColor(CODE_GRAY))
        c.drawCentredString(x + size / 2, code_y_mm * mm, code)
        c.showPage()
        c.save()

        overlay_page = PdfReader(io.BytesIO(overlay_buf.getvalue())).pages[0]
        # Releer la plantilla en cada vuelta: merge_page muta la página base
        base_page = PdfReader(io.BytesIO(template_bytes)).pages[0]
        base_page.merge_page(overlay_page)
        writer.add_page(base_page)

    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def qr_zip(codes_urls, fill_color=QR_NAVY):
    """ZIP con un PNG por código (CODIGO.png), para maquetación externa."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for code, url in codes_urls:
            zf.writestr(f"{code}.png", qr_utils.make_qr_png(url, fill_color=fill_color))
    return buf.getvalue()
