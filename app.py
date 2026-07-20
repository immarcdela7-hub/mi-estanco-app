"""CRM de venta de entradas con QR por establecimiento.

Portal doble: administración (nuestro equipo) y establecimientos colaboradores.
Ejecutar con: streamlit run app.py
"""
import time

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

MAX_LOGIN_FAILS = 5
LOCK_SECONDS = 60


def login_page():
    brand = db.get_setting("brand_name")
    col1, col2, col3 = st.columns([1, 1.2, 1])
    with col2:
        st.markdown("<br><br>", unsafe_allow_html=True)
        st.markdown(
            f"""
            <div style="text-align:center; margin-bottom: 1.4rem;">
                <div style="width:64px; height:64px; border-radius:16px; margin:0 auto;
                            background:linear-gradient(135deg, {ui.BLUE} 0%, {ui.GREEN} 100%);
                            display:flex; align-items:center; justify-content:center;
                            font-size:2rem; box-shadow:0 6px 16px rgba(37,99,235,0.35);">🎟️</div>
                <div style="font-size:1.7rem; font-weight:800; color:#0f172a; margin-top:0.8rem;
                            letter-spacing:-0.02em;">
                    {brand} <span style="color:{ui.BLUE};">CRM</span>
                </div>
                <div style="color:#64748b; font-size:0.95rem;">
                    Ventas con QR en establecimientos ·
                    <span style="color:{ui.GREEN}; font-weight:600;">partner de GetYourGuide</span>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )
        locked_for = st.session_state.get("login_lock_until", 0) - time.time()
        with st.form("login"):
            username = st.text_input("Usuario")
            password = st.text_input("Contraseña", type="password")
            submitted = st.form_submit_button(
                "Entrar", type="primary", use_container_width=True
            )
        if submitted:
            if locked_for > 0:
                st.error(
                    f"Demasiados intentos fallidos. Espera {int(locked_for) + 1} segundos."
                )
            else:
                user = db.get_user_by_username(username.strip())
                if user is None:
                    # Verificación simulada: mismo coste de tiempo exista o no el usuario
                    auth.hash_password(password)
                    ok = False
                else:
                    ok = auth.verify_password(password, user["salt"], user["password_hash"])
                if ok:
                    st.session_state.pop("login_fails", None)
                    st.session_state.pop("login_lock_until", None)
                    st.session_state["user"] = {
                        "id": user["id"],
                        "username": user["username"],
                        "role": user["role"],
                        "establishment_id": user["establishment_id"],
                    }
                    st.rerun()
                else:
                    fails = st.session_state.get("login_fails", 0) + 1
                    st.session_state["login_fails"] = fails
                    if fails >= MAX_LOGIN_FAILS:
                        st.session_state["login_lock_until"] = time.time() + LOCK_SECONDS
                        st.session_state["login_fails"] = 0
                        st.error(
                            f"Demasiados intentos fallidos. Espera {LOCK_SECONDS} segundos."
                        )
                    else:
                        st.error("Usuario o contraseña incorrectos.")
        if db.get_setting("default_admin_password") == "1":
            st.info(
                "🔐 **Primer acceso** — usuario `admin`, contraseña `admin1234`. "
                "La aplicación te pedirá cambiarla al entrar."
            )


def force_password_change(user):
    """Bloquea el portal admin hasta sustituir la contraseña por defecto."""
    col1, col2, col3 = st.columns([1, 1.2, 1])
    with col2:
        st.markdown("<br><br>", unsafe_allow_html=True)
        ui.page_header(
            "🔐 Crea tu contraseña",
            "Estás usando la contraseña por defecto. Elige una nueva para proteger el CRM.",
        )
        with st.form("first_password"):
            new1 = st.text_input("Nueva contraseña", type="password")
            new2 = st.text_input("Repite la nueva contraseña", type="password")
            if st.form_submit_button("Guardar y entrar", type="primary", use_container_width=True):
                if len(new1) < 8:
                    st.error("La contraseña debe tener al menos 8 caracteres.")
                elif new1 != new2:
                    st.error("Las contraseñas no coinciden.")
                elif new1 == "admin1234":
                    st.error("Elige una contraseña distinta a la que viene por defecto.")
                else:
                    db.update_password(user["id"], new1)
                    db.set_setting("default_admin_password", "0")
                    ui.flash("Contraseña actualizada. ¡Bienvenido a tu CRM!")
                    st.rerun()


user = st.session_state.get("user")
if user is not None:
    # Revalidar contra la BD: si el acceso fue eliminado, la sesión cae aquí
    fresh = db.get_user_by_id(user["id"])
    if fresh is None:
        st.session_state.pop("user", None)
        user = None
    else:
        user = {
            "id": fresh["id"],
            "username": fresh["username"],
            "role": fresh["role"],
            "establishment_id": fresh["establishment_id"],
        }
        st.session_state["user"] = user

if user is None:
    login_page()
elif user["role"] == "admin" and db.get_setting("default_admin_password") == "1":
    force_password_change(user)
elif user["role"] == "admin":
    admin.render(user)
else:
    partner.render(user)
