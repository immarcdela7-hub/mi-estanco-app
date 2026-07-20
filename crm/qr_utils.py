"""Generación de códigos QR de seguimiento por establecimiento."""
import io
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import qrcode

QR_COLOR = "#1e40af"


def build_tracking_url(base_url, code):
    """Añade ?ref=CODIGO y los UTM respetando los parámetros que ya tenga la URL."""
    parts = urlsplit(base_url.strip())
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query.update(
        {
            "ref": code,
            "utm_source": "qr",
            "utm_medium": "offline",
            "utm_campaign": code,
        }
    )
    return urlunsplit(
        (parts.scheme, parts.netloc, parts.path.rstrip("/"), urlencode(query), parts.fragment)
    )


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
