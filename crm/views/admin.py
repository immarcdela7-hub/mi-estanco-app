"""Portal de administración (nuestro equipo)."""
import io
from datetime import date, datetime

import pandas as pd
import streamlit as st

from crm import db, qr_utils, ui

CSV_TEMPLATE_COLUMNS = [
    "fecha", "codigo_establecimiento", "referencia_reserva", "actividad",
    "entradas", "importe_total", "comision_gyg",
]

WEB_SNIPPET = """<script>
(function () {
  var ref = new URLSearchParams(location.search).get("ref");
  if (ref) {
    document.cookie = "ntl_ref=" + encodeURIComponent(ref) +
      "; max-age=" + 30 * 24 * 3600 + "; path=/";
  } else {
    var m = document.cookie.match(/(?:^|; )ntl_ref=([^;]*)/);
    if (m) ref = decodeURIComponent(m[1]);
  }
  if (!ref) return;
  document.querySelectorAll('a[href*="getyourguide."]').forEach(function (a) {
    try {
      var u = new URL(a.href);
      u.searchParams.set("cmp", ref);
      a.href = u.toString();
    } catch (e) {}
  });
})();
</script>"""


def render(user):
    ui.sidebar_brand(db.get_setting("brand_name"), "Panel de administración")
    page = st.sidebar.radio(
        "Navegación",
        ["📊 Panel", "🏪 Establecimientos", "🧾 Códigos QR", "💶 Ventas",
         "💸 Liquidaciones", "🌐 Integración web", "⚙️ Ajustes"],
        label_visibility="collapsed",
    )
    st.sidebar.divider()
    ui.sidebar_user(user["username"], "Administrador")
    if st.sidebar.button("Cerrar sesión", use_container_width=True):
        st.session_state.pop("user", None)
        st.rerun()

    ui.show_flash()

    if page == "📊 Panel":
        _dashboard()
    elif page == "🏪 Establecimientos":
        _establishments()
    elif page == "🧾 Códigos QR":
        _qr_pool()
    elif page == "💶 Ventas":
        _sales()
    elif page == "💸 Liquidaciones":
        _payouts()
    elif page == "🌐 Integración web":
        _web_integration()
    elif page == "⚙️ Ajustes":
        _settings(user)


# ---------------------------------------------------------------- panel

def _dashboard():
    ui.page_header("Panel general", "Resumen de ventas por QR y comisiones de GetYourGuide.")

    establishments = db.list_establishments()
    if establishments.empty:
        st.markdown("### 👋 Bienvenido — primeros pasos")
        ui.steps_row([
            ("Configura tu marca",
             "En <b>⚙️ Ajustes</b>, revisa el nombre de la marca y la URL de la web "
             "a la que apuntarán los códigos QR."),
            ("Da de alta un establecimiento",
             "En <b>🏪 Establecimientos</b>, crea el primer local: obtendrá un código "
             "único y su QR listo para imprimir."),
            ("Registra las ventas",
             "En <b>💶 Ventas</b>, apunta o importa las ventas que lleguen por cada "
             "QR y valídalas cuando GYG las abone."),
        ])
        st.markdown("")

    summary = db.sales_summary()
    ui.stat_row([
        ("Ventas confirmadas", f"{summary['n_ventas']}", "🧾", ui.BLUE_LIGHT),
        ("Comisión GYG recibida", ui.euros(summary["comision_gyg"]), "💶", ui.BLUE_LIGHT),
        ("Comisión establecimientos", ui.euros(summary["comision_partner"]), "🤝", ui.GREEN_LIGHT),
        ("Pendiente de liquidar", ui.euros(summary["pendiente_pago"]), "⏳", "#fef3c7"),
    ])

    col_chart, col_top = st.columns([1.15, 1])
    with col_chart:
        st.markdown("### Comisión mensual")
        monthly = db.monthly_commissions()
        if monthly.empty:
            st.info("Aún no hay ventas validadas. Registra ventas en la sección **💶 Ventas**.")
        else:
            with st.container(border=True):
                chart_df = monthly.rename(
                    columns={"nuestra_parte": "Nuestra parte",
                             "comision_establecimientos": "Establecimientos"}
                ).set_index("mes")
                st.bar_chart(chart_df, color=[ui.BLUE, ui.GREEN], height=290)
            st.caption(
                "Reparto de la comisión de GYG cada mes: en azul lo que retenemos, "
                "en verde lo que corresponde a los establecimientos."
            )
    with col_top:
        st.markdown("### Mejores establecimientos")
        top = db.top_establishments()
        if top.empty:
            st.info("Todavía no hay establecimientos dados de alta.")
        else:
            ui.show_table(top, drop=("entradas", "comision_establecimiento"))


# ---------------------------------------------------------------- establecimientos

def _establishments():
    ui.page_header("Establecimientos", "Alta de locales, códigos QR únicos y accesos al portal.")

    tab_list, tab_new = st.tabs(["📋 Listado y QR", "➕ Nuevo establecimiento"])

    with tab_new:
        default_pct = float(db.get_setting("default_commission_pct", "30"))
        free_codes = db.free_qr_codes()
        NEW_CODE = "Generar un código nuevo"
        with st.form("new_establishment"):
            col1, col2 = st.columns(2)
            name = col1.text_input("Nombre del establecimiento *", placeholder="Bar La Plaza")
            contact = col2.text_input("Persona de contacto", placeholder="María García")
            col3, col4 = st.columns(2)
            email = col3.text_input("Email", placeholder="contacto@barlaplaza.com")
            phone = col4.text_input("Teléfono", placeholder="600 000 000")
            col5, col6 = st.columns(2)
            city = col5.text_input("Ciudad", placeholder="Barcelona")
            address = col6.text_input("Dirección", placeholder="C/ Mayor 1")
            col7, col8 = st.columns(2)
            pct = col7.number_input(
                "% de nuestra comisión GYG que le devolvemos",
                min_value=0.0, max_value=100.0, value=default_pct, step=1.0,
                help="Ejemplo: si GYG nos paga 10 € por una venta y aquí pones 30, "
                     "el establecimiento recibe 3 €.",
            )
            code_choice = col8.selectbox(
                "Código QR",
                [NEW_CODE] + free_codes,
                help="Si le has entregado un cartel preimpreso, elige el código que "
                     "aparece impreso debajo de su QR.",
            )
            notes = st.text_area("Notas internas", placeholder="Acuerdo, condiciones, etc.")
            submitted = st.form_submit_button("Crear establecimiento", type="primary")
        if submitted:
            if not name.strip():
                st.error("El nombre es obligatorio.")
            else:
                existing = None if code_choice == NEW_CODE else code_choice
                _, code = db.create_establishment(
                    name, contact, email, phone, city, address, pct, notes,
                    existing_code=existing,
                )
                st.success(f"Establecimiento **{name}** creado con el código **{code}**. "
                           "Su QR ya está disponible en el listado.")

    with tab_list:
        establishments = db.list_establishments()
        if establishments.empty:
            st.info("Crea tu primer establecimiento en la pestaña **➕ Nuevo establecimiento**.")
            return

        base_url = db.get_setting("base_url")
        active = establishments[establishments["status"] == "activo"]
        st.caption(
            f"{ui.plural(len(establishments), 'establecimiento', 'establecimientos')} "
            f"({ui.plural(len(active), 'activo', 'activos')}). "
            f"Los QR apuntan a `{base_url}` — puedes cambiarlo en **⚙️ Ajustes**."
        )

        for _, est in establishments.iterrows():
            badge = "🟢" if est["status"] == "activo" else "⚪"
            with st.expander(f"{badge} **{est['name']}** — {est['code']} · {est['city'] or 'sin ciudad'}"):
                url = qr_utils.build_tracking_url(base_url, est["code"])
                col_qr, col_info = st.columns([1, 2])
                with col_qr:
                    png = qr_utils.make_qr_png(url)
                    st.image(png, width=180)
                    st.download_button(
                        "⬇️ Descargar QR",
                        data=png,
                        file_name=f"QR_{est['code']}_{est['name'].replace(' ', '_')}.png",
                        mime="image/png",
                        key=f"qr_{est['id']}",
                        use_container_width=True,
                    )
                with col_info:
                    st.markdown(f"**Enlace de seguimiento:**")
                    st.code(url, language=None)
                    st.markdown(
                        f"**Contacto:** {est['contact_name'] or '—'} · {est['email'] or '—'} · "
                        f"{est['phone'] or '—'}"
                    )
                    st.markdown(
                        f"**Comisión que le devolvemos:** "
                        f"<span class='crm-badge crm-badge-green'>{ui.pct(est['commission_pct'])} "
                        f"de nuestra comisión GYG</span>",
                        unsafe_allow_html=True,
                    )
                    extra_codes = [c for c in db.establishment_codes(est["id"])
                                   if c != est["code"]]
                    if extra_codes:
                        badges = " ".join(
                            f"<span class='crm-badge crm-badge-blue'>{c}</span>"
                            for c in extra_codes
                        )
                        st.markdown(
                            f"**Carteles adicionales vinculados:** {badges}",
                            unsafe_allow_html=True,
                        )
                    if est["notes"]:
                        st.caption(f"📝 {est['notes']}")

                st.divider()
                _edit_establishment_form(est)
                st.divider()
                _partner_access_form(est)


def _edit_establishment_form(est):
    st.markdown("**✏️ Editar**")
    with st.form(f"edit_{est['id']}"):
        col1, col2 = st.columns(2)
        name = col1.text_input("Nombre", value=est["name"])
        contact = col2.text_input("Contacto", value=est["contact_name"] or "")
        col3, col4 = st.columns(2)
        email = col3.text_input("Email", value=est["email"] or "")
        phone = col4.text_input("Teléfono", value=est["phone"] or "")
        col5, col6 = st.columns(2)
        city = col5.text_input("Ciudad", value=est["city"] or "")
        address = col6.text_input("Dirección", value=est["address"] or "")
        col7, col8 = st.columns(2)
        pct = col7.number_input(
            "% comisión devuelta", min_value=0.0, max_value=100.0,
            value=float(est["commission_pct"]), step=1.0,
        )
        status = col8.selectbox(
            "Estado", ["activo", "inactivo"],
            index=0 if est["status"] == "activo" else 1,
        )
        notes = st.text_area("Notas", value=est["notes"] or "")
        if st.form_submit_button("Guardar cambios", type="primary"):
            db.update_establishment(
                est["id"], name=name, contact_name=contact, email=email, phone=phone,
                city=city, address=address, commission_pct=pct, status=status, notes=notes,
            )
            ui.flash(f"Cambios de **{name}** guardados.")
            st.rerun()
    st.caption(
        "El % se aplica a las **nuevas** ventas que se registren; las ya guardadas mantienen "
        "el importe calculado en su momento."
    )


def _partner_access_form(est):
    st.markdown("**🔑 Acceso del establecimiento al portal**")
    users = db.list_partner_users()
    est_users = users[users["establishment_id"] == est["id"]] if not users.empty else users
    if est_users is not None and not est_users.empty:
        for _, u in est_users.iterrows():
            col_u, col_b = st.columns([3, 1])
            col_u.markdown(f"Usuario: `{u['username']}` (alta {u['created_at'][:10]})")
            if col_b.button("Eliminar acceso", key=f"del_user_{est['id']}_{u['id']}"):
                db.delete_user(u["id"])
                ui.flash(f"Acceso `{u['username']}` eliminado.")
                st.rerun()
    with st.form(f"access_{est['id']}"):
        col1, col2 = st.columns(2)
        username = col1.text_input("Nuevo usuario", placeholder="barlaplaza")
        password = col2.text_input("Contraseña", type="password")
        if st.form_submit_button("Crear acceso"):
            if not username.strip() or not password:
                st.error("Usuario y contraseña son obligatorios.")
            elif len(password) < 8:
                st.error("La contraseña debe tener al menos 8 caracteres.")
            elif db.get_user_by_username(username.strip()):
                st.error("Ese nombre de usuario ya existe.")
            else:
                db.create_user(username, password, "partner", est["id"])
                st.success(f"Acceso creado. El establecimiento puede entrar con el usuario "
                           f"**{username}** en esta misma página de login.")


# ---------------------------------------------------------------- códigos QR

def _flyer_settings():
    return {
        "qr_x_mm": float(db.get_setting("flyer_qr_x_mm", "31.6")),
        "qr_y_mm": float(db.get_setting("flyer_qr_y_mm", "36.9")),
        "qr_size_mm": float(db.get_setting("flyer_qr_size_mm", "41.6")),
        "code_y_mm": float(db.get_setting("flyer_code_y_mm", "23.4")),
    }


def _qr_pool():
    from crm import flyer

    ui.page_header(
        "Códigos QR preimpresos",
        "Genera lotes de QR sin asignar, imprime los carteles y vincúlalos a un "
        "establecimiento cuando los repartas.",
    )

    base_url = db.get_setting("base_url")
    codes_df = db.list_qr_codes()
    free = db.free_qr_codes()

    ui.stat_row([
        ("Códigos en el pool", f"{len(codes_df)}", "🧾", ui.BLUE_LIGHT),
        ("Libres (sin asignar)", f"{len(free)}", "🆓", ui.GREEN_LIGHT),
        ("Asignados", f"{len(codes_df) - len(free)}", "🏪", "#fef3c7"),
    ])

    tab_pool, tab_print, tab_assign = st.tabs(
        ["📋 Pool de códigos", "🖨️ Imprimir carteles", "🔗 Asignar / liberar"]
    )

    with tab_pool:
        with st.form("new_batch"):
            col1, col2 = st.columns(2)
            n = col1.number_input("¿Cuántos códigos generar?", min_value=1, max_value=500,
                                  value=25, step=5)
            batch = col2.text_input("Etiqueta del lote (opcional)", placeholder="imprenta-agosto")
            if st.form_submit_button("Generar lote", type="primary"):
                codes = db.generate_qr_batch(n, batch)
                ui.flash(
                    f"{ui.plural(len(codes), 'código generado', 'códigos generados')} "
                    f"({codes[0]} … {codes[-1]}). Ya puedes imprimirlos en la pestaña "
                    "**🖨️ Imprimir carteles**."
                )
                st.rerun()
        if codes_df.empty:
            st.info("Aún no hay códigos en el pool. Genera el primer lote arriba.")
        else:
            shown = codes_df.copy()
            shown["estado"] = shown["establecimiento"].map(
                lambda v: "🆓 Libre" if pd.isna(v) or v is None else f"🏪 {v}"
            )
            ui.show_table(shown[["codigo", "estado", "lote", "creado"]])

    with tab_print:
        if not free:
            st.info(
                "No hay códigos libres que imprimir. Genera un lote en la pestaña "
                "**📋 Pool de códigos**."
            )
        else:
            batches = sorted({b for b in codes_df["lote"].fillna("") if b})
            batch_filter = st.selectbox(
                "Lote a imprimir", ["Todos los libres"] + batches, key="print_batch"
            )
            if batch_filter == "Todos los libres":
                to_print = free
            else:
                in_batch = set(
                    codes_df[codes_df["lote"] == batch_filter]["codigo"].tolist()
                )
                to_print = [c for c in free if c in in_batch]
            st.caption(
                f"{ui.plural(len(to_print), 'cartel', 'carteles')} — cada uno con su QR "
                f"único apuntando a `{base_url}` y el código impreso en pequeño."
            )
            if to_print and st.button("Preparar descargas", type="primary"):
                pairs = [
                    (c, qr_utils.build_tracking_url(base_url, c)) for c in to_print
                ]
                with st.spinner("Generando PDF y ZIP…"):
                    pdf_bytes = flyer.stamp_flyers(
                        flyer.default_template_bytes(), pairs, **_flyer_settings()
                    )
                    zip_bytes = flyer.qr_zip(pairs)
                col1, col2 = st.columns(2)
                col1.download_button(
                    "⬇️ Carteles A6 en PDF (para imprenta)",
                    data=pdf_bytes,
                    file_name=f"carteles_NTL_{len(pairs)}.pdf",
                    mime="application/pdf",
                    use_container_width=True,
                )
                col2.download_button(
                    "⬇️ Solo los QR en PNG (ZIP)",
                    data=zip_bytes,
                    file_name=f"qrs_NTL_{len(pairs)}.zip",
                    mime="application/zip",
                    use_container_width=True,
                )
            st.divider()
            st.caption(
                "El PDF replica vuestro cartel A6 sustituyendo el QR de muestra por el "
                "real de cada código. Si la imprenta prefiere maquetarlo ella, usa el ZIP."
            )

    with tab_assign:
        establishments = db.list_establishments(only_active=True)
        if not free:
            st.info("No hay códigos libres para asignar.")
        elif establishments.empty:
            st.warning("No hay establecimientos activos. Créalos en **🏪 Establecimientos**.")
        else:
            st.markdown(
                "Al entregar un cartel, teclea aquí el código que aparece impreso "
                "debajo del QR y elige el establecimiento."
            )
            with st.form("assign_code"):
                col1, col2 = st.columns(2)
                code_sel = col1.selectbox("Código libre", free)
                est_options = {
                    f"{r['name']} ({r['code']})": r["id"] for _, r in establishments.iterrows()
                }
                est_sel = col2.selectbox("Establecimiento", list(est_options))
                if st.form_submit_button("Vincular", type="primary"):
                    if db.assign_qr_code(code_sel, est_options[est_sel]):
                        ui.flash(
                            f"Código **{code_sel}** vinculado a **{est_sel}**. Todas las "
                            "compras de ese QR ya cuentan para ese local."
                        )
                        st.rerun()
                    else:
                        st.error("Ese código ya no está libre.")

        assigned_extra = codes_df[
            codes_df["establecimiento"].notna() & (codes_df["lote"] != "auto")
        ]
        if not assigned_extra.empty:
            st.markdown("**Liberar un código** (solo códigos de cartel, no el principal del local):")
            code_free = st.selectbox(
                "Código asignado", assigned_extra["codigo"].tolist(), key="unassign_sel"
            )
            if st.button("Liberar código"):
                if db.unassign_qr_code(code_free):
                    ui.flash(f"Código **{code_free}** liberado: vuelve al pool.")
                    st.rerun()
                else:
                    st.error("Ese código es el principal de un establecimiento y no se puede liberar.")


# ---------------------------------------------------------------- ventas

def _sales():
    ui.page_header("Ventas", "Registra las ventas atribuidas a cada QR y valídalas para liquidarlas.")

    establishments = db.list_establishments()
    if establishments.empty:
        st.warning("Primero crea un establecimiento en **🏪 Establecimientos**.")
        return

    tab_list, tab_new, tab_import = st.tabs(
        ["📋 Listado y validación", "➕ Registrar venta", "📥 Importar CSV"]
    )

    with tab_new:
        active = db.list_establishments(only_active=True)
        options = {f"{r['name']} ({r['code']})": r["id"] for _, r in active.iterrows()}
        if not options:
            st.warning("No hay establecimientos activos.")
        else:
            with st.form("new_sale", clear_on_submit=True):
                col1, col2 = st.columns(2)
                est_label = col1.selectbox("Establecimiento (QR de origen)", list(options))
                sale_date = col2.date_input("Fecha de la venta", value=date.today())
                col3, col4 = st.columns(2)
                activity = col3.text_input("Actividad / entrada vendida", placeholder="Sagrada Família — entrada general")
                booking_ref = col4.text_input("Referencia de reserva GYG", placeholder="GYG-ABC123")
                col5, col6, col7 = st.columns(3)
                tickets = col5.number_input("Nº de entradas", min_value=1, value=1, step=1)
                amount = col6.number_input("Importe de la venta (€)", min_value=0.0, value=0.0, step=1.0)
                commission = col7.number_input(
                    "Comisión que nos paga GYG (€)", min_value=0.0, value=0.0, step=0.5
                )
                submitted = st.form_submit_button("Registrar venta", type="primary")
            if submitted:
                est_id = options[est_label]
                share = db.add_sale(
                    est_id, sale_date, activity, booking_ref, tickets, amount, commission
                )
                st.success(
                    f"Venta registrada como **pendiente**. Al establecimiento le corresponden "
                    f"**{ui.euros(share)}**. Valídala en la pestaña de listado para poder liquidarla."
                )

    with tab_import:
        st.markdown(
            "Sube un CSV con una fila por venta. Columnas: "
            + ", ".join(f"`{c}`" for c in CSV_TEMPLATE_COLUMNS)
        )
        template = pd.DataFrame(
            [
                {
                    "fecha": "2026-07-15",
                    "codigo_establecimiento": "EST-XXXXX",
                    "referencia_reserva": "GYG-ABC123",
                    "actividad": "Sagrada Família — entrada general",
                    "entradas": 2,
                    "importe_total": 52.0,
                    "comision_gyg": 6.24,
                }
            ]
        )
        st.download_button(
            "⬇️ Descargar plantilla CSV",
            data=template.to_csv(index=False).encode("utf-8-sig"),
            file_name="plantilla_ventas.csv",
            mime="text/csv",
        )
        uploaded = st.file_uploader("CSV de ventas", type=["csv"])
        if uploaded is not None and st.button("Importar ventas", type="primary"):
            _import_csv(uploaded)

    with tab_list:
        _sales_list(establishments)


def _import_csv(uploaded):
    try:
        raw = uploaded.getvalue().decode("utf-8-sig")
        sep = ";" if raw.splitlines()[0].count(";") > raw.splitlines()[0].count(",") else ","
        df = pd.read_csv(io.StringIO(raw), sep=sep, dtype=str).fillna("")
    except Exception as exc:
        st.error(f"No se pudo leer el CSV: {exc}")
        return

    df.columns = [c.strip().lower() for c in df.columns]
    missing = [c for c in CSV_TEMPLATE_COLUMNS if c not in df.columns]
    if missing:
        st.error("Faltan columnas en el CSV: " + ", ".join(f"`{c}`" for c in missing))
        return

    def to_number(value):
        s = str(value).strip().replace("€", "").replace(" ", "")
        if not s:
            return 0.0
        if "," in s and "." in s:
            s = s.replace(".", "").replace(",", ".")
        elif "," in s:
            s = s.replace(",", ".")
        return float(s)

    def to_iso_date(value):
        s = str(value).strip()[:10]
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
            try:
                return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
            except ValueError:
                continue
        return None

    imported, errors = 0, []
    for idx, row in df.iterrows():
        line = idx + 2
        code = str(row["codigo_establecimiento"]).strip()
        est = db.get_establishment_by_code(code)
        if est is None:
            errors.append(f"Línea {line}: código `{code}` no existe.")
            continue
        iso_date = to_iso_date(row["fecha"])
        if iso_date is None:
            errors.append(
                f"Línea {line}: fecha `{row['fecha']}` no reconocida "
                "(usa AAAA-MM-DD o DD/MM/AAAA)."
            )
            continue
        booking_ref = str(row["referencia_reserva"]).strip()
        if db.booking_ref_exists(est["id"], booking_ref):
            errors.append(
                f"Línea {line}: la reserva `{booking_ref}` ya estaba registrada "
                f"para {est['name']} — no se ha duplicado."
            )
            continue
        try:
            db.add_sale(
                est["id"],
                iso_date,
                str(row["actividad"]).strip(),
                booking_ref,
                int(to_number(row["entradas"]) or 1),
                to_number(row["importe_total"]),
                to_number(row["comision_gyg"]),
                source="csv",
            )
            imported += 1
        except Exception as exc:
            errors.append(f"Línea {line}: {exc}")

    if imported:
        st.success(
            f"{ui.plural(imported, 'venta importada', 'ventas importadas')} como "
            "**pendientes**. Valídalas en el listado."
        )
    if errors:
        st.warning("Incidencias:\n\n" + "\n".join(f"- {e}" for e in errors))
    if not imported and not errors:
        st.info("El CSV no contenía filas.")


def _sales_list(establishments):
    col1, col2, col3, col4 = st.columns([2, 1.3, 1.2, 1.2])
    est_options = {"Todos": None}
    est_options.update({f"{r['name']} ({r['code']})": r["id"] for _, r in establishments.iterrows()})
    est_label = col1.selectbox("Establecimiento", list(est_options), key="sales_filter_est")
    status = col2.selectbox("Estado", ["Todos", "pendiente", "validada", "pagada"], key="sales_filter_status")
    date_from = col3.date_input("Desde", value=None, key="sales_filter_from")
    date_to = col4.date_input("Hasta", value=None, key="sales_filter_to")

    sales = db.list_sales(
        establishment_id=est_options[est_label],
        status=None if status == "Todos" else status,
        date_from=date_from,
        date_to=date_to,
    )
    if sales.empty:
        st.info("No hay ventas con estos filtros.")
        return

    ui.show_table(ui.style_sales_df(sales))
    total_gyg = sales["comision_gyg"].sum()
    total_partner = sales["comision_establecimiento"].sum()
    st.caption(
        f"{ui.plural(len(sales), 'venta', 'ventas')} · Comisión GYG {ui.euros(total_gyg)} · "
        f"Para establecimientos {ui.euros(total_partner)}"
    )

    pending = sales[sales["estado"] == "pendiente"]
    if not pending.empty:
        st.markdown("#### ✅ Validar ventas pendientes")
        st.caption(
            "Validar una venta confirma que GYG nos la ha abonado y la deja lista para liquidar."
        )
        labels = {
            f"#{r['id']} · {r['fecha']} · {r['establecimiento']} · {ui.euros(r['comision_gyg'])}": r["id"]
            for _, r in pending.iterrows()
        }
        selected = st.multiselect("Ventas a validar", list(labels), key="validate_select")
        col_a, col_b = st.columns(2)
        if col_a.button("Validar seleccionadas", type="primary", disabled=not selected):
            n = db.set_sales_status([labels[s] for s in selected], "validada")
            ui.flash(f"{ui.plural(n, 'venta validada', 'ventas validadas')}.")
            st.rerun()
        if col_b.button(f"Validar todas las pendientes del filtro ({len(pending)})"):
            n = db.set_sales_status(pending["id"].tolist(), "validada")
            ui.flash(f"{ui.plural(n, 'venta validada', 'ventas validadas')}.")
            st.rerun()

    deletable = sales[sales["liquidacion"].isna()]
    if not deletable.empty:
        with st.expander("🗑️ Eliminar ventas (solo si no están liquidadas)"):
            labels_del = {
                f"#{r['id']} · {r['fecha']} · {r['establecimiento']} · {r['estado']}": r["id"]
                for _, r in deletable.iterrows()
            }
            selected_del = st.multiselect("Ventas a eliminar", list(labels_del), key="delete_select")
            if st.button("Eliminar seleccionadas", disabled=not selected_del):
                db.delete_sales([labels_del[s] for s in selected_del])
                ui.flash(f"{ui.plural(len(selected_del), 'venta eliminada', 'ventas eliminadas')}.")
                st.rerun()


# ---------------------------------------------------------------- liquidaciones

def _payouts():
    ui.page_header(
        "Liquidaciones",
        "Paga a cada establecimiento su parte de las ventas validadas y guarda el histórico.",
    )

    pending = db.pending_by_establishment()
    st.markdown("### Pendiente de liquidar")
    if pending.empty:
        st.info("No hay comisiones pendientes. Valida ventas en **💶 Ventas** para poder liquidarlas.")
    else:
        ui.show_table(pending, drop=("id",))
        options = {
            f"{r['establecimiento']} — {ui.euros(r['pendiente'])} ({r['ventas']} ventas)": r["id"]
            for _, r in pending.iterrows()
        }
        with st.form("new_payout"):
            est_label = st.selectbox("Establecimiento a liquidar", list(options))
            col1, col2 = st.columns(2)
            payment_date = col1.date_input("Fecha de pago", value=date.today())
            method = col2.selectbox("Método", ["transferencia", "efectivo", "bizum", "otro"])
            reference = st.text_input("Referencia del pago", placeholder="Nº de transferencia, concepto…")
            notes = st.text_input("Notas", placeholder="Opcional")
            if st.form_submit_button("💸 Generar liquidación", type="primary"):
                result = db.create_payout(
                    options[est_label], payment_date, method, reference, notes
                )
                if result:
                    ui.flash(
                        f"Liquidación #{result['id']} creada: **{ui.euros(result['amount'])}** "
                        f"({ui.plural(result['n_sales'], 'venta marcada', 'ventas marcadas')} "
                        "como pagadas)."
                    )
                    st.rerun()
                else:
                    st.warning("Ese establecimiento ya no tiene ventas validadas sin liquidar.")

    st.markdown("### Histórico de liquidaciones")
    payouts = db.list_payouts()
    if payouts.empty:
        st.caption("Aún no se ha generado ninguna liquidación.")
    else:
        ui.show_table(payouts)
        csv = payouts.to_csv(index=False).encode("utf-8-sig")
        st.download_button(
            "⬇️ Exportar histórico (CSV)", data=csv,
            file_name="liquidaciones.csv", mime="text/csv",
        )


# ---------------------------------------------------------------- integración web

def _web_integration():
    base_url = db.get_setting("base_url")
    ui.page_header(
        "Integración con la web",
        "Cómo conectar los QR con los enlaces de GetYourGuide para no perder la atribución.",
    )

    st.markdown(
        f"""
        ### La cadena de atribución

        1. El cliente escanea el QR del local → `{base_url}?ref=EST-XXXXX`.
        2. La web guarda el `ref` en una cookie de 30 días y lo añade como
           **`cmp=EST-XXXXX`** a todos los enlaces hacia GetYourGuide.
        3. GYG registra la reserva con vuestra cuenta de partner **y** con esa campaña.
        4. El informe de transacciones del Partner Portal trae la columna de campaña:
           es el código del establecimiento.
        5. Ese informe se importa en **💶 Ventas → 📥 Importar CSV** usando la campaña
           como `codigo_establecimiento`.

        ### Fragmento para pegar en la web

        Copiar y pegar justo antes de cerrar `</body>` en la página de tickets:
        """
    )
    st.code(WEB_SNIPPET, language="html")

    st.markdown(
        """
        ### Verificación rápida

        1. Abre la web con `?ref=PRUEBA1` en una ventana de incógnito.
        2. Comprueba que los enlaces de GYG llevan `cmp=PRUEBA1`.
        3. Vuelve sin el `?ref=`: deben seguir llevándolo (cookie).
        4. Haz una reserva de prueba y busca la campaña `PRUEBA1` en el Partner Portal.
        """
    )
    st.info(
        "ℹ️ Si el cliente escanea con un móvil pero compra desde otro dispositivo, la "
        "campaña se pierde (límite del modelo de afiliación). Si los enlaces de GYG se "
        "generan con JavaScript o usáis widgets incrustados, el fragmento necesita "
        "adaptarse — está documentado en `docs/integracion-web.md`."
    )


# ---------------------------------------------------------------- ajustes

def _settings(user):
    ui.page_header("Ajustes", "Configuración general del CRM.")

    st.markdown("### Marca y enlace de los QR")
    with st.form("settings_general"):
        brand = st.text_input("Nombre de la marca", value=db.get_setting("brand_name"))
        base_url = st.text_input(
            "URL de tu web de venta de entradas",
            value=db.get_setting("base_url"),
            help="Los QR de los establecimientos apuntan a esta web añadiendo ?ref=CÓDIGO "
                 "para poder atribuir cada compra.",
        )
        default_pct = st.number_input(
            "% de comisión devuelta por defecto (para nuevos establecimientos)",
            min_value=0.0, max_value=100.0,
            value=float(db.get_setting("default_commission_pct", "30")), step=1.0,
        )
        if st.form_submit_button("Guardar ajustes", type="primary"):
            db.set_setting("brand_name", brand.strip() or "NoTaxLost")
            db.set_setting("base_url", base_url.strip() or "https://notaxlost.com/tickets")
            db.set_setting("default_commission_pct", default_pct)
            ui.flash("Ajustes guardados.")
            st.rerun()

    st.markdown("### Cambiar mi contraseña")
    with st.form("change_password", clear_on_submit=True):
        current = st.text_input("Contraseña actual", type="password")
        new1 = st.text_input("Nueva contraseña", type="password")
        new2 = st.text_input("Repite la nueva contraseña", type="password")
        if st.form_submit_button("Cambiar contraseña", type="primary"):
            from crm import auth

            fresh = db.get_user_by_username(user["username"])
            if not auth.verify_password(current, fresh["salt"], fresh["password_hash"]):
                st.error("La contraseña actual no es correcta.")
            elif len(new1) < 8:
                st.error("La nueva contraseña debe tener al menos 8 caracteres.")
            elif new1 != new2:
                st.error("Las contraseñas no coinciden.")
            else:
                db.update_password(fresh["id"], new1)
                db.set_setting("default_admin_password", "0")
                st.success("Contraseña actualizada.")

    st.markdown("### Accesos de establecimientos")
    users = db.list_partner_users()
    if users.empty:
        st.caption("Aún no hay accesos creados. Se crean desde la ficha de cada establecimiento.")
    else:
        ui.show_table(users, drop=("id", "establishment_id"))
