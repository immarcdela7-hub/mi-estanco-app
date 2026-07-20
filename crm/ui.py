"""Tema visual y componentes compartidos."""
import base64
from functools import lru_cache
from pathlib import Path

import pandas as pd
import streamlit as st

LOGO_PATH = Path(__file__).resolve().parent.parent / "assets" / "logo_ntl.png"


@lru_cache(maxsize=1)
def logo_data_uri():
    """Logo NTL como data URI para incrustar en HTML. '' si no existe el archivo."""
    if not LOGO_PATH.exists():
        return ""
    encoded = base64.b64encode(LOGO_PATH.read_bytes()).decode()
    return f"data:image/png;base64,{encoded}"

BLUE = "#2563eb"
BLUE_DARK = "#1e40af"
GREEN = "#059669"
GREEN_DARK = "#047857"
GREEN_LIGHT = "#d1fae5"
BLUE_LIGHT = "#dbeafe"
INK = "#0f172a"
MUTED = "#64748b"
BORDER = "#e2e8f0"

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
        background-color: #f6f8fb;
    }}

    /* Barra de marca superior */
    .stApp::before {{
        content: "";
        position: fixed;
        top: 0; left: 0; right: 0;
        height: 4px;
        background: linear-gradient(90deg, {BLUE} 0%, {GREEN} 100%);
        z-index: 99999;
    }}

    /* ------------------------------------------------ barra lateral */
    section[data-testid="stSidebar"] {{
        background-color: #ffffff;
        border-right: 1px solid {BORDER};
    }}
    section[data-testid="stSidebar"] > div:first-child {{
        padding-top: 1.2rem;
    }}

    .crm-brand {{
        display: flex;
        align-items: center;
        gap: 0.6rem;
        padding: 0.2rem 0.2rem 0.1rem 0.2rem;
    }}
    .crm-brand-logo {{
        width: 38px; height: 38px;
        border-radius: 10px;
        background: linear-gradient(135deg, {BLUE} 0%, {GREEN} 100%);
        display: flex; align-items: center; justify-content: center;
        font-size: 1.15rem;
        box-shadow: 0 3px 8px rgba(37, 99, 235, 0.3);
        flex-shrink: 0;
    }}
    .crm-brand-img {{
        height: 34px;
        width: auto;
        display: block;
    }}
    .crm-brand-name {{
        font-size: 1.05rem;
        font-weight: 800;
        color: {INK};
        line-height: 1.15;
    }}
    .crm-brand-name span {{ color: {BLUE}; }}
    .crm-tagline {{
        font-size: 0.72rem;
        color: {MUTED};
        text-transform: uppercase;
        letter-spacing: 0.06em;
        font-weight: 600;
        margin: 0.5rem 0 0.9rem 0.2rem;
    }}

    /* Radio de navegación con aspecto de menú de aplicación */
    section[data-testid="stSidebar"] label[data-testid="stRadioOption"] {{
        display: flex;
        align-items: center;
        padding: 0.5rem 0.8rem;
        margin: 2px 0;
        border-radius: 9px;
        cursor: pointer;
        color: #475569;
        font-weight: 500;
        transition: background 0.12s ease;
        width: 100%;
    }}
    section[data-testid="stSidebar"] label[data-testid="stRadioOption"]:hover {{
        background: #f1f5f9;
    }}
    /* Ocultar el círculo del radio: es el div justo antes del contenedor de texto */
    section[data-testid="stSidebar"] label[data-testid="stRadioOption"]
        div:has(+ div[data-testid="stMarkdownContainer"]) {{
        display: none;
    }}
    section[data-testid="stSidebar"] label[data-testid="stRadioOption"][data-selected="true"] {{
        background: #eff6ff;
        color: {BLUE_DARK};
        font-weight: 700;
        box-shadow: inset 3px 0 0 {BLUE};
    }}
    section[data-testid="stSidebar"] label[data-testid="stRadioOption"] p {{
        font-size: 0.92rem;
        color: inherit;
    }}

    .crm-user-chip {{
        display: flex;
        align-items: center;
        gap: 0.55rem;
        background: #f8fafc;
        border: 1px solid {BORDER};
        border-radius: 10px;
        padding: 0.5rem 0.7rem;
        margin-bottom: 0.5rem;
    }}
    .crm-user-avatar {{
        width: 30px; height: 30px;
        border-radius: 50%;
        background: linear-gradient(135deg, {BLUE} 0%, {GREEN} 100%);
        color: white;
        display: flex; align-items: center; justify-content: center;
        font-weight: 700;
        font-size: 0.85rem;
        flex-shrink: 0;
    }}
    .crm-user-name {{
        font-size: 0.85rem;
        font-weight: 600;
        color: {INK};
        line-height: 1.1;
    }}
    .crm-user-role {{
        font-size: 0.72rem;
        color: {MUTED};
    }}

    /* ------------------------------------------------ cabeceras */
    .crm-title {{
        font-size: 1.85rem;
        font-weight: 800;
        color: {INK};
        letter-spacing: -0.02em;
        margin-bottom: 0.15rem;
    }}
    .crm-subtitle {{
        font-size: 0.95rem;
        color: {MUTED};
        margin-bottom: 0.4rem;
    }}
    .crm-header-rule {{
        border: none;
        border-top: 1px solid {BORDER};
        margin: 0.6rem 0 1.3rem 0;
    }}
    h3 {{
        color: #1e293b;
        font-weight: 700;
        font-size: 1.15rem !important;
        letter-spacing: -0.01em;
    }}

    /* ------------------------------------------------ tarjetas KPI */
    .crm-stats {{
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 0.9rem;
        margin: 0.4rem 0 1.4rem 0;
    }}
    .crm-stat {{
        background: #ffffff;
        border: 1px solid {BORDER};
        border-radius: 14px;
        padding: 1.05rem 1.15rem;
        display: flex;
        align-items: center;
        gap: 0.85rem;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
    }}
    .crm-stat-icon {{
        width: 42px; height: 42px;
        border-radius: 11px;
        display: flex; align-items: center; justify-content: center;
        font-size: 1.25rem;
        background: var(--tint, {BLUE_LIGHT});
        flex-shrink: 0;
    }}
    .crm-stat-label {{
        font-size: 0.76rem;
        font-weight: 600;
        color: {MUTED};
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 0.1rem;
    }}
    .crm-stat-value {{
        font-size: 1.45rem;
        font-weight: 800;
        color: {INK};
        letter-spacing: -0.02em;
        line-height: 1.1;
    }}

    /* ------------------------------------------------ formularios y paneles */
    div[data-testid="stForm"] {{
        background: #ffffff;
        border: 1px solid {BORDER};
        border-radius: 14px;
        padding: 1.3rem 1.3rem 1.1rem 1.3rem;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
    }}
    div[data-testid="stExpander"] {{
        background-color: #ffffff;
        border-radius: 12px;
        border: 1px solid {BORDER};
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
    }}
    div[data-testid="stExpander"] summary {{
        font-weight: 600;
    }}
    div[data-testid="stVerticalBlockBorderWrapper"] {{
        background: #ffffff;
        border-radius: 14px;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
    }}

    /* ------------------------------------------------ tablas */
    div[data-testid="stDataFrame"] {{
        background: #ffffff;
        border: 1px solid {BORDER};
        border-radius: 12px;
        padding: 0.35rem;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
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
        border-radius: 9px;
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
        background: linear-gradient(135deg, {BLUE} 0%, {BLUE_DARK} 100%);
        color: white;
        box-shadow: 0 3px 6px rgba(37, 99, 235, 0.25);
    }}
    .stButton > button[kind="primary"]:hover, .stFormSubmitButton > button[kind="primary"]:hover {{
        transform: translateY(-1px);
        box-shadow: 0 5px 10px rgba(37, 99, 235, 0.35);
    }}
    .stDownloadButton > button {{
        background: linear-gradient(135deg, {GREEN} 0%, {GREEN_DARK} 100%);
        color: white;
        box-shadow: 0 3px 6px rgba(5, 150, 105, 0.25);
    }}
    .stDownloadButton > button:hover {{
        transform: translateY(-1px);
        box-shadow: 0 5px 10px rgba(5, 150, 105, 0.35);
    }}

    /* ------------------------------------------------ avisos */
    div[data-testid="stAlert"] {{
        border-radius: 12px;
    }}

    /* ------------------------------------------------ varios */
    .crm-badge {{
        display: inline-block;
        padding: 0.15rem 0.6rem;
        border-radius: 999px;
        font-size: 0.78rem;
        font-weight: 600;
    }}
    .crm-badge-green {{ background: {GREEN_LIGHT}; color: #065f46; }}
    .crm-badge-blue {{ background: {BLUE_LIGHT}; color: {BLUE_DARK}; }}
    .crm-badge-gray {{ background: {BORDER}; color: #475569; }}

    .crm-step {{
        background: #ffffff;
        border: 1px solid {BORDER};
        border-radius: 14px;
        padding: 1.1rem 1.2rem;
        height: 100%;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
    }}
    .crm-step-num {{
        width: 30px; height: 30px;
        border-radius: 50%;
        background: {BLUE_LIGHT};
        color: {BLUE_DARK};
        font-weight: 800;
        display: flex; align-items: center; justify-content: center;
        margin-bottom: 0.6rem;
        font-size: 0.9rem;
    }}
    .crm-step-title {{
        font-weight: 700;
        color: {INK};
        margin-bottom: 0.25rem;
        font-size: 0.95rem;
    }}
    .crm-step-text {{
        font-size: 0.85rem;
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


# Nota: el HTML de estos componentes se genera SIN saltos de línea ni sangría —
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
            f'<div class="crm-brand"><div class="crm-brand-logo">🎟️</div>'
            f'<div class="crm-brand-name">{brand_name}<br><span>CRM</span></div></div>'
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
    """Fila de tarjetas KPI. items: lista de (etiqueta, valor, emoji, tinte css)."""
    cards = "".join(
        f'<div class="crm-stat"><div class="crm-stat-icon" style="--tint:{tint}">{icon}</div>'
        f'<div><div class="crm-stat-label">{label}</div>'
        f'<div class="crm-stat-value">{value}</div></div></div>'
        for label, value, icon, tint in items
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
    "pendiente": "🕓 Pendiente",
    "validada": "✅ Validada",
    "pagada": "💸 Pagada",
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
