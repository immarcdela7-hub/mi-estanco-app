"""Portal del establecimiento colaborador."""
import streamlit as st

from crm import db, qr_utils, ui

NAV = [
    ":material/space_dashboard: Mi panel",
    ":material/receipt_long: Mis ventas",
    ":material/account_balance_wallet: Mis liquidaciones",
    ":material/qr_code_2: Mi código QR",
]


def render(user):
    est = db.get_establishment(user.get("establishment_id"))
    if est is None:
        st.error(
            "Tu usuario no está vinculado a ningún establecimiento. "
            "Contacta con el equipo para que revisen tu acceso."
        )
        if st.button("Cerrar sesión"):
            st.session_state.pop("user", None)
            st.rerun()
        return

    ui.sidebar_brand(db.get_setting("brand_name"), "Portal del establecimiento")
    page = st.sidebar.radio("Navegación", NAV, label_visibility="collapsed")
    st.sidebar.divider()
    ui.sidebar_user(user["username"], est["name"])
    if st.sidebar.button("Cerrar sesión", use_container_width=True):
        st.session_state.pop("user", None)
        st.rerun()

    if page == NAV[0]:
        _dashboard(est)
    elif page == NAV[1]:
        _sales(est)
    elif page == NAV[2]:
        _payouts(est)
    elif page == NAV[3]:
        _qr(est)


def _dashboard(est):
    ui.page_header(f"Hola, {est['name']}", "Resumen de las ventas generadas con tu código QR.")

    summary = db.sales_summary(est["id"])
    ui.stat_row([
        ("Ventas confirmadas", f"{summary['n_ventas']}", "doc"),
        ("Entradas vendidas", f"{summary['entradas']}", "ticket"),
        ("Comisión acumulada", ui.euros(summary["comision_partner"]), "euro"),
        ("Pendiente de cobro", ui.euros(summary["pendiente_pago"]), "clock"),
    ])

    col_chart, col_info = st.columns([1.3, 1])
    with col_chart:
        with ui.panel("Tu comisión mes a mes"):
            monthly = db.monthly_commissions(est["id"])
            if monthly.empty:
                st.info(
                    "Aún no hay ventas confirmadas con tu QR. En cuanto registremos y "
                    "confirmemos las primeras compras hechas con tu código, las verás aquí."
                )
            else:
                chart_df = (
                    monthly.rename(columns={"comision_establecimientos": "Tu comisión"})
                    .set_index("mes")[["Tu comisión"]]
                )
                st.bar_chart(chart_df, color=ui.GREEN, height=280)
    with col_info:
        with ui.panel("Cómo funciona"):
            st.markdown(
                f"""
                1. Coloca tu **código QR** en un lugar visible de tu local.
                2. Tus clientes lo escanean y compran entradas en nuestra web.
                3. Cada compra queda **atribuida a tu código** (`{est['code']}`).
                4. Te devolvemos el **{ui.pct(est['commission_pct'])}** de la comisión
                   que nos paga GetYourGuide.
                5. Cobras por liquidaciones periódicas — las ves en **Mis liquidaciones**.
                """
            )


def _sales(est):
    ui.page_header("Mis ventas", "Todas las compras realizadas a través de tu código QR.")
    sales = db.list_sales(establishment_id=est["id"])
    if sales.empty:
        st.info("Todavía no hay ventas registradas con tu QR.")
        return
    ui.show_table(ui.style_sales_df(sales), drop=("establecimiento", "codigo"))
    st.caption(
        "*Pendiente*: en revisión · *Validada*: confirmada, entrará en la próxima "
        "liquidación · *Pagada*: ya liquidada."
    )


def _payouts(est):
    ui.page_header("Mis liquidaciones", "Pagos que te hemos realizado.")
    payouts = db.list_payouts(est["id"])
    if payouts.empty:
        st.info("Aún no hay liquidaciones. Cuando acumules comisión validada, te la pagaremos aquí.")
        return
    ui.stat_row([
        ("Total cobrado", ui.euros(payouts["importe"].sum()), "wallet"),
        ("Liquidaciones", f"{len(payouts)}", "doc"),
    ])
    with ui.panel("Historial de pagos"):
        ui.show_table(payouts, drop=("establecimiento",))


def _qr(est):
    ui.page_header("Mi código QR", "Imprímelo y colócalo donde tus clientes puedan escanearlo.")
    base_url = db.get_setting("base_url")
    url = qr_utils.build_tracking_url(base_url, est["code"])
    col1, col2 = st.columns([1, 2])
    with col1:
        png = qr_utils.make_qr_png(url)
        st.image(png, width=260)
        st.download_button(
            "Descargar QR en PNG",
            data=png,
            file_name=f"QR_{est['code']}.png",
            mime="image/png",
            use_container_width=True,
        )
    with col2:
        st.markdown(f"**Tu código único:** `{est['code']}`")
        st.markdown("**El QR lleva a:**")
        st.code(url, language=None)
        st.markdown(
            f"""
            - Cada compra hecha desde este enlace queda **atribuida a tu local**.
            - Recibes el **{ui.pct(est['commission_pct'])}** de nuestra comisión de GetYourGuide.
            - Puedes imprimirlo en cartelería, pegatinas, expositores o la carta.
            """
        )
        st.info(
            "Consejo: colócalo cerca de la caja o en las mesas, con un mensaje tipo "
            "«Compra aquí tus entradas y apoya a este local»."
        )
