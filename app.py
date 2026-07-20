"""CRM de venta de entradas con QR por establecimiento.

Portal doble: administración (nuestro equipo) y establecimientos colaboradores.
Ejecutar con: streamlit run app.py
"""
import streamlit as st

from crm import auth, db, ui
from crm.views import admin, partner

st.set_page_config(
    page_title="CRM · Entradas por QR",
    page_icon="🎟️",
    layout="wide",
    initial_sidebar_state="expanded",
)

db.init_db()
ui.inject_css()


def login_page():
    brand = db.get_setting("brand_name")
    col1, col2, col3 = st.columns([1, 1.2, 1])
    with col2:
        st.markdown("<br><br>", unsafe_allow_html=True)
        st.markdown(
            f"""
            <div style="text-align:center; margin-bottom: 1.5rem;">
                <div style="font-size:3rem;">🎟️</div>
                <div style="font-size:1.8rem; font-weight:800; color:#0f172a;">
                    {brand} <span style="color:{ui.BLUE};">CRM</span>
                </div>
                <div style="color:#64748b;">
                    Ventas con QR en establecimientos ·
                    <span style="color:{ui.GREEN}; font-weight:600;">partner de GetYourGuide</span>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )
        with st.form("login"):
            username = st.text_input("Usuario")
            password = st.text_input("Contraseña", type="password")
            submitted = st.form_submit_button(
                "Entrar", type="primary", use_container_width=True
            )
        if submitted:
            user = db.get_user_by_username(username.strip())
            if user and auth.verify_password(password, user["salt"], user["password_hash"]):
                st.session_state["user"] = {
                    "id": user["id"],
                    "username": user["username"],
                    "role": user["role"],
                    "establishment_id": user["establishment_id"],
                }
                st.rerun()
            else:
                st.error("Usuario o contraseña incorrectos.")
        if db.get_setting("default_admin_password") == "1":
            st.info(
                "🔐 **Primer acceso** — usuario `admin`, contraseña `admin1234`. "
                "Cámbiala en **⚙️ Ajustes** en cuanto entres."
            )


user = st.session_state.get("user")
if user is None:
    login_page()
elif user["role"] == "admin":
    admin.render(user)
else:
    partner.render(user)
