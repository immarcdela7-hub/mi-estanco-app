"""Test de humo de la capa de datos del CRM. Ejecutar: python test_crm.py"""
import os
import tempfile

os.environ["CRM_DB_PATH"] = os.path.join(tempfile.mkdtemp(), "test_crm.db")

from crm import auth, db, qr_utils  # noqa: E402


def main():
    db.init_db()

    # Admin sembrado con contraseña por defecto
    admin = db.get_user_by_username("admin")
    assert admin and admin["role"] == "admin"
    assert auth.verify_password("admin1234", admin["salt"], admin["password_hash"])
    assert not auth.verify_password("mala", admin["salt"], admin["password_hash"])

    # Alta de establecimiento con código único y QR
    est_id, code = db.create_establishment("Bar La Plaza", city="Barcelona", commission_pct=30)
    assert code.startswith("EST-") and len(code) == 9
    est = db.get_establishment(est_id)
    assert est["commission_pct"] == 30
    assert db.get_establishment_by_code(code.lower())["id"] == est_id
    url = qr_utils.build_tracking_url("https://mi-web.com/", code)
    assert url == f"https://mi-web.com?ref={code}&utm_source=qr&utm_medium=offline&utm_campaign={code}"
    # Una URL base con parámetros propios conserva ambos (atribución intacta)
    url2 = qr_utils.build_tracking_url("https://mi-web.com/entradas?lang=es", code)
    assert "lang=es" in url2 and f"ref={code}" in url2 and url2.count("?") == 1
    png = qr_utils.make_qr_png(url)
    assert png[:8] == b"\x89PNG\r\n\x1a\n"

    # Usuario partner vinculado
    db.create_user("barlaplaza", "secreto123", "partner", est_id)
    partner = db.get_user_by_username("barlaplaza")
    assert partner["establishment_id"] == est_id
    assert db.get_user_by_id(partner["id"])["username"] == "barlaplaza"
    assert db.get_user_by_id(99999) is None

    # Venta: 30% de 10 € de comisión GYG → 3 €
    share = db.add_sale(est_id, "2026-07-01", "Sagrada Família", "GYG-1", 2, 52.0, 10.0)
    assert share == 3.0
    db.add_sale(est_id, "2026-07-15", "Park Güell", "GYG-2", 1, 26.0, 4.0)
    sales = db.list_sales(establishment_id=est_id)
    assert len(sales) == 2
    assert set(sales["estado"]) == {"pendiente"}

    # Deduplicación de reservas para la importación
    assert db.booking_ref_exists(est_id, "GYG-1")
    assert not db.booking_ref_exists(est_id, "GYG-999")
    assert not db.booking_ref_exists(est_id, "")

    # Las pendientes no cuentan en resúmenes ni liquidaciones
    assert db.sales_summary(est_id)["n_ventas"] == 0
    assert db.pending_by_establishment().empty

    # Validación → aparecen en resumen y pendiente de pago
    db.set_sales_status(sales["id"].tolist(), "validada")
    summary = db.sales_summary(est_id)
    assert summary["n_ventas"] == 2
    assert summary["comision_gyg"] == 14.0
    assert summary["comision_partner"] == 4.2
    assert summary["pendiente_pago"] == 4.2
    pending = db.pending_by_establishment()
    assert len(pending) == 1 and pending.iloc[0]["pendiente"] == 4.2

    # Liquidación: agrupa, marca como pagada y no se puede repetir
    payout = db.create_payout(est_id, "2026-07-31", "transferencia", "TRF-001")
    assert payout["amount"] == 4.2 and payout["n_sales"] == 2
    assert db.create_payout(est_id, "2026-07-31") is None
    sales_after = db.list_sales(establishment_id=est_id)
    assert set(sales_after["estado"]) == {"pagada"}

    # La máquina de estados protege las ventas liquidadas: no vuelven a validarse
    assert db.set_sales_status(sales_after["id"].tolist(), "validada") == 0
    assert set(db.list_sales(establishment_id=est_id)["estado"]) == {"pagada"}
    summary_after = db.sales_summary(est_id)
    assert summary_after["pendiente_pago"] == 0
    assert summary_after["pagado"] == 4.2

    # Ventas liquidadas no se pueden borrar
    db.delete_sales(sales_after["id"].tolist())
    assert len(db.list_sales(establishment_id=est_id)) == 2

    # Desglose mensual: nuestra parte + establecimiento = comisión GYG
    monthly = db.monthly_commissions(est_id)
    assert monthly.iloc[0]["mes"] == "2026-07"
    assert monthly.iloc[0]["nuestra_parte"] + monthly.iloc[0]["comision_establecimientos"] == 14.0

    # Cambio de contraseña
    db.update_password(admin["id"], "nueva-clave-123")
    fresh = db.get_user_by_username("admin")
    assert auth.verify_password("nueva-clave-123", fresh["salt"], fresh["password_hash"])

    # --- Pool de códigos QR preimpresos ---
    batch = db.generate_qr_batch(3, "lote-test")
    assert len(batch) == 3 and all(c.startswith("NTL-") for c in batch)
    assert set(batch) <= set(db.free_qr_codes())

    # Alta con código preimpreso: el código del pool pasa a ser el del local
    est2_id, est2_code = db.create_establishment("Café Central", existing_code=batch[0])
    assert est2_code == batch[0]
    assert db.get_establishment_by_code(batch[0])["id"] == est2_id
    assert batch[0] not in db.free_qr_codes()
    try:
        db.create_establishment("Otro", existing_code=batch[0])
        raise AssertionError("debería rechazar un código ya asignado")
    except ValueError:
        pass

    # Código extra vinculado al mismo local: atribuye igual y se puede liberar
    assert db.assign_qr_code(batch[1], est2_id)
    assert db.get_establishment_by_code(batch[1])["id"] == est2_id
    assert set(db.establishment_codes(est2_id)) == {batch[0], batch[1]}
    assert not db.unassign_qr_code(batch[0])   # el primario no se libera
    assert db.unassign_qr_code(batch[1])       # el extra sí
    assert batch[1] in db.free_qr_codes()

    # El código primario del primer establecimiento quedó migrado al pool
    assert db.get_establishment_by_code(code)["id"] == est_id

    # --- Carteles A6 con QR incrustado ---
    import io
    import zipfile
    from pypdf import PdfReader
    from crm import flyer

    pairs = [(c, qr_utils.build_tracking_url("https://notaxlost.com/tickets", c))
             for c in [batch[1], batch[2]]]
    pdf = flyer.stamp_flyers(flyer.default_template_bytes(), pairs, **{
        "qr_x_mm": 31.6, "qr_y_mm": 36.9, "qr_size_mm": 41.6, "code_y_mm": 23.4,
    })
    reader = PdfReader(io.BytesIO(pdf))
    assert len(reader.pages) == 2
    box = reader.pages[0].mediabox
    assert round(float(box.width) * 25.4 / 72) == 105   # A6
    assert round(float(box.height) * 25.4 / 72) == 148

    zip_bytes = flyer.qr_zip(pairs)
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        assert sorted(zf.namelist()) == sorted(f"{c}.png" for c, _ in pairs)
        assert zf.read(pairs[0][0] + ".png")[:8] == b"\x89PNG\r\n\x1a\n"

    print("✅ Todos los tests del CRM pasan.")


if __name__ == "__main__":
    main()
