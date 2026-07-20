"""Generación de códigos QR de seguimiento por establecimiento."""
import io

import qrcode

QR_COLOR = "#1e40af"


def build_tracking_url(base_url, code):
    base = base_url.strip().rstrip("/")
    return f"{base}?ref={code}&utm_source=qr&utm_medium=offline&utm_campaign={code}"


def make_qr_png(url, fill_color=QR_COLOR):
    qr = qrcode.QRCode(
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=12,
        border=2,
    )
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color=fill_color, back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue()
