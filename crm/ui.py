"""Tema visual y componentes compartidos."""
import base64
from contextlib import contextmanager
from functools import lru_cache
from pathlib import Path

import pandas as pd
import streamlit as st

BLUE = "#2563eb"
BLUE_DARK = "#1e40af"
NAVY = "#092B57"
GREEN = "#059669"
GREEN_DARK = "#047857"
GREEN_ACCENT = "#34d399"
GREEN_LIGHT = "#d1fae5"
BLUE_LIGHT = "#dbeafe"
INK = "#0f172a"
MUTED = "#64748b"
BORDER = "#e2e8f0"

LOGO_PATH = Path(__file__).resolve().parent.parent / "assets" / "logo_ntl.png"


@lru_cache(maxsize=1)
def logo_data_uri():
    """Logo NTL como data URI para incrustar en HTML. '' si no existe el archivo."""
    if not LOGO_PATH.exists():
        return ""
    encoded = base64.b64encode(LOGO_PATH.read_bytes()).decode()
    return f"data:image/png;base64,{encoded}"


# Iconos SVG monocromos (trazo, heredan color) para los componentes HTML propios.
_SVG = {
    "doc": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>'
           '<polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>'
           '<line x1="16" y1="17" x2="8" y2="17"/>',
    "euro": '<path d="M4 10h12"/><path d="M4 14h9"/>'
            '<path d="M19 6a7.7 7.7 0 0 0-5.2-2A7.9 7.9 0 0 0 6 12c0 4.4 3.5 8 7.8 8 '
            '2 0 3.8-.8 5.2-2"/>',
    "users": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>'
             '<circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/>'
             '<path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    "clock": '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    "ticket": '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 '
              '0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/>'
              '<path d="M13 17v2"/><path d="M13 11v2"/>',
    "wallet": '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/>'
              '<path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/>'
              '<path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
    "qr": '<rect x="3" y="3" width="7" height="7" rx="1"/>'
          '<rect x="14" y="3" width="7" height="7" rx="1"/>'
          '<rect x="3" y="14" width="7" height="7" rx="1"/>'
          '<path d="M14 14h3v3h-3z"/><path d="M21 21h-3"/><path d="M21 14v3"/>',
    "tag": '<path d="M12 2H2v10l9.3 9.3a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 '
           '0-3.4Z"/><circle cx="7" cy="7" r="1.5"/>',
    "store": '<path d="M3 9 4.9 3.6A1 1 0 0 1 5.8 3h12.4a1 1 0 0 1 .9.6L21 9"/>'
             '<path d="M4 9v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/>'
             '<path d="M9 21v-6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6"/>',
}


def icon_svg(name, size=20):
    return (
        f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" '
        'stroke="currentColor" stroke-width="2" stroke-linecap="round" '
        f'stroke-linejoin="round">{_SVG[name]}</svg>'
    )


CSS = f"""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

    #MainMenu {{visibility: hidden;}}
    footer {{visibility: hidden;}}
    header {{visibility: hidden;}}

    html, body, .stApp, [class*="css"] {{
        font-family: 'Inter', 'Segoe UI', sans-serif;
    }}

    .stApp {{
        background-color: #f4f6f9;
    }}

    /* Barra de marca superior */
    .stApp::before {{
        content: "";
        position: fixed;
        top: 0; left: 0; right: 0;
        height: 3px;
        background: linear-gradient(90deg, {BLUE} 0%, {GREEN} 100%);
        z-index: 99999;
    }}

    .block-container {{
        padding-top: 2.4rem;
        max-width: 1250px;
    }}

    /* ------------------------------------------------ barra lateral (navy corporativo) */
    section[data-testid="stSidebar"] {{
        background: linear-gradient(180deg, #0d3468 0%, {NAVY} 45%, #061c3a 100%);
        border-right: none;
    }}
    section[data-testid="stSidebar"] > div:first-child {{
        padding-top: 1.2rem;
    }}
    section[data-testid="stSidebar"] hr {{
        border-color: rgba(255, 255, 255, 0.14);
    }}

    .crm-brand {{
        display: flex;
        align-items: center;
        gap: 0.65rem;
        background: #ffffff;
        border-radius: 12px;
        padding: 0.55rem 0.8rem;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
    }}
    .crm-brand-img {{
        height: 28px;
        width: auto;
        display: block;
    }}
    .crm-brand-name {{
        font-size: 0.95rem;
        font-weight: 800;
        color: {NAVY};
        letter-spacing: 0.01em;
    }}
    .crm-brand-name span {{ color: {BLUE}; }}
    .crm-tagline {{
        font-size: 0.68rem;
        color: #8fa6c4;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-weight: 600;
        margin: 0.7rem 0 0.9rem 0.2rem;
    }}

    /* Navegación: radio con aspecto de menú de aplicación */
    section[data-testid="stSidebar"] label[data-testid="stRadioOption"] {{
        display: flex;
        align-items: center;
        padding: 0.48rem 0.75rem;
        margin: 1px 0;
        border-radius: 8px;
        cursor: pointer;
        color: #c7d3e3;
        font-weight: 500;
        transition: background 0.12s ease;
        width: 100%;
    }}
    section[data-testid="stSidebar"] label[data-testid="stRadioOption"]:hover {{
        background: rgba(255, 255, 255, 0.08);
    }}
    section[data-testid="stSidebar"] label[data-testid="stRadioOption"]
        div:has(+ div[data-testid="stMarkdownContainer"]) {{
        display: none;
    }}
    section[data-testid="stSidebar"] label[data-testid="stRadioOption"][data-selected="true"] {{
        background: rgba(255, 255, 255, 0.11);
        color: #ffffff;
        font-weight: 600;
        box-shadow: inset 3px 0 0 {GREEN_ACCENT};
    }}
    section[data-testid="stSidebar"] label[data-testid="stRadioOption"] p {{
        font-size: 0.9rem;
        color: inherit;
        display: flex;
        align-items: center;
        gap: 0.6rem;
    }}
    section[data-testid="stSidebar"] label[data-testid="stRadioOption"]
        span[data-testid="stIconMaterial"] {{
        font-size: 1.15rem;
        color: #8fa6c4;
    }}
    section[data-testid="stSidebar"] label[data-testid="stRadioOption"][data-selected="true"]
        span[data-testid="stIconMaterial"] {{
        color: {GREEN_ACCENT};
    }}

    .crm-user-chip {{
        display: flex;
        align-items: center;
        gap: 0.55rem;
        background: rgba(255, 255, 255, 0.07);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 10px;
        padding: 0.5rem 0.7rem;
        margin-bottom: 0.5rem;
    }}
    .crm-user-avatar {{
        width: 30px; height: 30px;
        border-radius: 50%;
        background: {GREEN};
        color: white;
        display: flex; align-items: center; justify-content: center;
        font-weight: 700;
        font-size: 0.85rem;
        flex-shrink: 0;
    }}
    .crm-user-name {{
        font-size: 0.85rem;
        font-weight: 600;
        color: #ffffff;
        line-height: 1.1;
    }}
    .crm-user-role {{
        font-size: 0.72rem;
        color: #8fa6c4;
    }}

    /* Botones dentro de la barra lateral (cerrar sesión) */
    section[data-testid="stSidebar"] .stButton > button {{
        background: transparent;
        border: 1px solid rgba(255, 255, 255, 0.3);
        color: #e2e8f0;
    }}
    section[data-testid="stSidebar"] .stButton > button:hover {{
        border-color: {GREEN_ACCENT};
        color: #ffffff;
        background: rgba(255, 255, 255, 0.05);
    }}

    /* ------------------------------------------------ cabeceras */
    .crm-title {{
        font-size: 1.55rem;
        font-weight: 800;
        color: {INK};
        letter-spacing: -0.02em;
        margin-bottom: 0.1rem;
    }}
    .crm-subtitle {{
        font-size: 0.92rem;
        color: {MUTED};
        margin-bottom: 0.3rem;
    }}
    .crm-header-rule {{
        border: none;
        border-top: 1px solid {BORDER};
        margin: 0.6rem 0 1.2rem 0;
    }}
    h3 {{
        color: #1e293b;
        font-weight: 700;
        font-size: 1.05rem !important;
        letter-spacing: -0.01em;
    }}

    .crm-panel-title {{
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: #475569;
        padding-bottom: 0.55rem;
        border-bottom: 1px solid {BORDER};
        margin-bottom: 0.7rem;
    }}

    /* ------------------------------------------------ tarjetas KPI */
    .crm-stats {{
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 0.8rem;
        margin: 0.3rem 0 1.2rem 0;
    }}
    .crm-stat {{
        background: #ffffff;
        border: 1px solid {BORDER};
        border-radius: 12px;
        padding: 0.95rem 1.05rem;
        display: flex;
        align-items: center;
        gap: 0.8rem;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    }}
    .crm-stat-icon {{
        width: 40px; height: 40px;
        border-radius: 10px;
        display: flex; align-items: center; justify-content: center;
        background: #f1f5f9;
        color: #334155;
        flex-shrink: 0;
    }}
    .crm-stat-label {{
        font-size: 0.7rem;
        font-weight: 600;
        color: {MUTED};
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 0.15rem;
    }}
    .crm-stat-value {{
        font-size: 1.35rem;
        font-weight: 800;
        color: {INK};
        letter-spacing: -0.02em;
        line-height: 1.1;
    }}

    /* ------------------------------------------------ formularios y paneles */
    div[data-testid="stForm"] {{
        background: #ffffff;
        border: 1px solid {BORDER};
        border-radius: 12px;
        padding: 1.2rem 1.2rem 1rem 1.2rem;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    }}
    div[data-testid="stExpander"] {{
        background-color: #ffffff;
        border-radius: 10px;
        border: 1px solid {BORDER};
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
    }}
    div[data-testid="stExpander"] summary {{
        font-weight: 600;
    }}
    div[data-testid="stVerticalBlockBorderWrapper"] {{
        background: #ffffff;
        border-radius: 12px;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    }}

    /* ------------------------------------------------ tablas */
    div[data-testid="stDataFrame"] {{
        background: #ffffff;
        border: 1px solid {BORDER};
        border-radius: 10px;
        padding: 0.25rem;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
    }}

    /* ------------------------------------------------ pestañas */
    button[data-baseweb="tab"] {{
        font-weight: 600;
        color: {MUTED};
    }}
    button[data-baseweb="tab"][aria-selected="true"] {{
        color: {BLUE_DARK};
    }}
    div[data-baseweb="tab-highlight"] {{
        background-color: {BLUE};
        height: 3px;
        border-radius: 3px 3px 0 0;
    }}
    div[data-baseweb="tab-border"] {{
        background-color: {BORDER};
    }}

    /* ------------------------------------------------ botones */
    .stButton > button, .stFormSubmitButton > button, .stDownloadButton > button {{
        border-radius: 8px;
        font-weight: 600;
        border: none;
        transition: all 0.15s;
    }}
    .stButton > button[kind="secondary"] {{
        background: #ffffff;
        border: 1px solid #cbd5e1;
        color: #334155;
    }}
    .stButton > button[kind="secondary"]:hover {{
        border-color: {BLUE};
        color: {BLUE_DARK};
    }}
    .stButton > button[kind="primary"], .stFormSubmitButton > button[kind="primary"] {{
        background: {BLUE};
        color: white;
        box-shadow: 0 1px 3px rgba(37, 99, 235, 0.3);
    }}
    .stButton > button[kind="primary"]:hover, .stFormSubmitButton > button[kind="primary"]:hover {{
        background: {BLUE_DARK};
    }}
    .stDownloadButton > button {{
        background: {GREEN};
        color: white;
        box-shadow: 0 1px 3px rgba(5, 150, 105, 0.3);
    }}
    .stDownloadButton > button:hover {{
        background: {GREEN_DARK};
    }}

    /* ------------------------------------------------ avisos */
    div[data-testid="stAlert"] {{
        border-radius: 10px;
    }}

    /* ------------------------------------------------ varios */
    .crm-badge {{
        display: inline-block;
        padding: 0.12rem 0.55rem;
        border-radius: 999px;
        font-size: 0.76rem;
        font-weight: 600;
    }}
    .crm-badge-green {{ background: {GREEN_LIGHT}; color: #065f46; }}
    .crm-badge-blue {{ background: {BLUE_LIGHT}; color: {BLUE_DARK}; }}
    .crm-badge-gray {{ background: {BORDER}; color: #475569; }}

    .crm-step {{
        background: #ffffff;
        border: 1px solid {BORDER};
        border-radius: 12px;
        padding: 1rem 1.1rem;
        height: 100%;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    }}
    .crm-step-num {{
        width: 28px; height: 28px;
        border-radius: 50%;
        background: {BLUE_LIGHT};
        color: {BLUE_DARK};
        font-weight: 800;
        display: flex; align-items: center; justify-content: center;
        margin-bottom: 0.55rem;
        font-size: 0.85rem;
    }}
    .crm-step-title {{
        font-weight: 700;
        color: {INK};
        margin-bottom: 0.25rem;
        font-size: 0.92rem;
    }}
    .crm-step-text {{
        font-size: 0.83rem;
        color: {MUTED};
        line-height: 1.45;
    }}

    hr {{ border-color: {BORDER}; }}
</style>
"""


def inject_css():
    st.markdown(CSS, unsafe_allow_html=True)


def page_header(title, subtitle=""):
    st.markdown(f'<div class="crm-title">{title}</div>', unsafe_allow_html=True)
    if subtitle:
        st.markdown(f'<div class="crm-subtitle">{subtitle}</div>', unsafe_allow_html=True)
    st.markdown('<hr class="crm-header-rule">', unsafe_allow_html=True)


@contextmanager
def panel(title):
    """Panel blanco con cabecera, al estilo de los dashboards de CRM."""
    with st.container(border=True):
        st.markdown(f'<div class="crm-panel-title">{title}</div>', unsafe_allow_html=True)
        yield


# El HTML de estos componentes se genera SIN saltos de línea ni sangría —
# el parser de Markdown convierte las líneas indentadas en bloques de código.

def sidebar_brand(brand_name, role_label):
    logo = logo_data_uri()
    if logo:
        brand_html = (
            f'<div class="crm-brand"><img class="crm-brand-img" src="{logo}" alt="{brand_name}">'
            f'<div class="crm-brand-name"><span>CRM</span></div></div>'
        )
    else:
        brand_html = (
            f'<div class="crm-brand"><div class="crm-brand-name">{brand_name} '
            f'<span>CRM</span></div></div>'
        )
    st.sidebar.markdown(
        brand_html + f'<div class="crm-tagline">{role_label}</div>',
        unsafe_allow_html=True,
    )


def sidebar_user(username, role_label):
    initial = (username[:1] or "?").upper()
    st.sidebar.markdown(
        f'<div class="crm-user-chip"><div class="crm-user-avatar">{initial}</div>'
        f'<div><div class="crm-user-name">{username}</div>'
        f'<div class="crm-user-role">{role_label}</div></div></div>',
        unsafe_allow_html=True,
    )


def stat_row(items):
    """Fila de tarjetas KPI. items: lista de (etiqueta, valor, clave de icono)."""
    cards = "".join(
        f'<div class="crm-stat"><div class="crm-stat-icon">{icon_svg(icon)}</div>'
        f'<div><div class="crm-stat-label">{label}</div>'
        f'<div class="crm-stat-value">{value}</div></div></div>'
        for label, value, icon in items
    )
    st.markdown(f'<div class="crm-stats">{cards}</div>', unsafe_allow_html=True)


def steps_row(steps):
    """Guía de primeros pasos. steps: lista de (título, texto HTML)."""
    cols = st.columns(len(steps))
    for i, (col, (title, text)) in enumerate(zip(cols, steps), start=1):
        col.markdown(
            f'<div class="crm-step"><div class="crm-step-num">{i}</div>'
            f'<div class="crm-step-title">{title}</div>'
            f'<div class="crm-step-text">{text}</div></div>',
            unsafe_allow_html=True,
        )


def euros(value):
    return f"{value:,.2f} €".replace(",", "X").replace(".", ",").replace("X", ".")


def pct(value):
    """Porcentaje sin decimales de relleno: 30 -> '30%', 12.5 -> '12,5%'."""
    return f"{value:g}%".replace(".", ",")


def plural(n, singular, plural_form):
    return f"{n} {singular if n == 1 else plural_form}"


def flash(message):
    """Guarda un mensaje de éxito para mostrarlo tras el próximo st.rerun()."""
    st.session_state["_flash"] = message


def show_flash():
    message = st.session_state.pop("_flash", None)
    if message:
        st.success(message)


STATUS_LABELS = {
    "pendiente": "Pendiente",
    "validada": "Validada",
    "pagada": "Pagada",
}


def style_sales_df(df):
    """Prepara el dataframe de ventas para mostrarlo: estados legibles y columnas en orden."""
    shown = df.copy()
    if "estado" in shown.columns:
        shown["estado"] = shown["estado"].map(STATUS_LABELS).fillna(shown["estado"])
    if "establishment_id" in shown.columns:
        shown = shown.drop(columns=["establishment_id"])
    return shown


MONEY_COLUMNS = {
    "importe_total": "Importe venta",
    "comision_gyg": "Comisión GYG",
    "comision_establecimiento": "Comisión establecimiento",
    "importe": "Importe",
    "pendiente": "Pendiente",
}

TEXT_LABELS = {
    "id": "ID",
    "fecha": "Fecha",
    "fecha_pago": "Fecha de pago",
    "establecimiento": "Establecimiento",
    "codigo": "Código",
    "actividad": "Actividad",
    "reserva": "Reserva GYG",
    "entradas": "Entradas",
    "ventas": "Ventas",
    "estado": "Estado",
    "liquidacion": "Liquidación",
    "metodo": "Método",
    "referencia": "Referencia",
    "notas": "Notas",
    "username": "Usuario",
    "created_at": "Alta",
    "lote": "Lote",
    "creado": "Creado",
    "asignado": "Asignado",
}


def column_config(df):
    config = {}
    for col, label in MONEY_COLUMNS.items():
        if col in df.columns:
            config[col] = st.column_config.Column(label)
    for col, label in TEXT_LABELS.items():
        if col in df.columns:
            config[col] = st.column_config.Column(label)
    return config


def show_table(df, drop=()):
    """Tabla con importes en formato español y cabeceras legibles."""
    shown = df.drop(columns=list(drop), errors="ignore").copy()
    for col in MONEY_COLUMNS:
        if col in shown.columns:
            shown[col] = shown[col].map(lambda v: euros(v) if pd.notna(v) else "")
    st.dataframe(
        shown,
        use_container_width=True,
        hide_index=True,
        column_config=column_config(shown),
    )
