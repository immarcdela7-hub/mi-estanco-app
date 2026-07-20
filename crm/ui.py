"""Tema visual y componentes compartidos."""
import streamlit as st

BLUE = "#2563eb"
BLUE_DARK = "#1e40af"
GREEN = "#059669"
GREEN_LIGHT = "#d1fae5"
BLUE_LIGHT = "#dbeafe"

CSS = f"""
<style>
    #MainMenu {{visibility: hidden;}}
    footer {{visibility: hidden;}}
    header {{visibility: hidden;}}

    .stApp {{
        background-color: #f8fafc;
        font-family: 'Inter', 'Segoe UI', sans-serif;
    }}

    section[data-testid="stSidebar"] {{
        background-color: #ffffff;
        border-right: 1px solid #e2e8f0;
    }}

    .crm-brand {{
        font-size: 1.35rem;
        font-weight: 800;
        color: #0f172a;
        padding: 0.25rem 0 0 0;
    }}
    .crm-brand span {{ color: {BLUE}; }}
    .crm-tagline {{
        font-size: 0.8rem;
        color: #64748b;
        margin-bottom: 1rem;
    }}

    .crm-title {{
        font-size: 2rem;
        font-weight: 800;
        color: #0f172a;
        margin-bottom: 0.2rem;
    }}
    .crm-subtitle {{
        font-size: 1rem;
        color: #64748b;
        margin-bottom: 1.5rem;
    }}

    div[data-testid="stMetric"] {{
        background-color: #ffffff;
        border: 1px solid #e2e8f0;
        border-top: 3px solid {BLUE};
        border-radius: 12px;
        padding: 1rem 1.2rem;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
    }}
    div[data-testid="stMetric"] label {{ color: #64748b; }}

    .stButton > button, .stFormSubmitButton > button, .stDownloadButton > button {{
        border-radius: 8px;
        font-weight: 600;
        border: none;
        transition: all 0.15s;
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
        background: linear-gradient(135deg, {GREEN} 0%, #047857 100%);
        color: white;
        box-shadow: 0 3px 6px rgba(5, 150, 105, 0.25);
    }}

    .crm-badge {{
        display: inline-block;
        padding: 0.15rem 0.6rem;
        border-radius: 999px;
        font-size: 0.78rem;
        font-weight: 600;
    }}
    .crm-badge-green {{ background: {GREEN_LIGHT}; color: #065f46; }}
    .crm-badge-blue {{ background: {BLUE_LIGHT}; color: {BLUE_DARK}; }}
    .crm-badge-gray {{ background: #e2e8f0; color: #475569; }}

    div[data-testid="stExpander"] {{
        background-color: #ffffff;
        border-radius: 10px;
        border: 1px solid #e2e8f0;
    }}

    hr {{ border-color: #e2e8f0; }}
    h3 {{ color: #1e293b; font-weight: 700; }}
</style>
"""


def inject_css():
    st.markdown(CSS, unsafe_allow_html=True)


def page_header(title, subtitle=""):
    st.markdown(f'<div class="crm-title">{title}</div>', unsafe_allow_html=True)
    if subtitle:
        st.markdown(f'<div class="crm-subtitle">{subtitle}</div>', unsafe_allow_html=True)


def sidebar_brand(brand_name, role_label):
    st.sidebar.markdown(
        f'<div class="crm-brand">🎟️ {brand_name} <span>CRM</span></div>'
        f'<div class="crm-tagline">{role_label}</div>',
        unsafe_allow_html=True,
    )


def euros(value):
    return f"{value:,.2f} €".replace(",", "X").replace(".", ",").replace("X", ".")


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
            config[col] = st.column_config.NumberColumn(label, format="%.2f €")
    for col, label in TEXT_LABELS.items():
        if col in df.columns:
            config[col] = st.column_config.Column(label)
    return config


# Alias retrocompatible
money_column_config = column_config
