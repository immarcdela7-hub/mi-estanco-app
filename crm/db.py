"""Capa de datos del CRM: SQLite + consultas."""
import os
import sqlite3
import secrets
import string
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

import pandas as pd

from crm import auth

DB_PATH = Path(os.environ.get("CRM_DB_PATH", Path(__file__).resolve().parent.parent / "crm_data.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS establishments (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    code           TEXT NOT NULL UNIQUE,
    contact_name   TEXT DEFAULT '',
    email          TEXT DEFAULT '',
    phone          TEXT DEFAULT '',
    city           TEXT DEFAULT '',
    address        TEXT DEFAULT '',
    commission_pct REAL NOT NULL DEFAULT 30.0,
    status         TEXT NOT NULL DEFAULT 'activo',
    notes          TEXT DEFAULT '',
    created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    username         TEXT NOT NULL UNIQUE,
    password_hash    TEXT NOT NULL,
    salt             TEXT NOT NULL,
    role             TEXT NOT NULL CHECK (role IN ('admin', 'partner')),
    establishment_id INTEGER,
    created_at       TEXT NOT NULL,
    FOREIGN KEY (establishment_id) REFERENCES establishments (id)
);

CREATE TABLE IF NOT EXISTS sales (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    establishment_id INTEGER NOT NULL,
    sale_date        TEXT NOT NULL,
    activity         TEXT DEFAULT '',
    booking_ref      TEXT DEFAULT '',
    tickets          INTEGER NOT NULL DEFAULT 1,
    amount_total     REAL NOT NULL DEFAULT 0,
    gyg_commission   REAL NOT NULL DEFAULT 0,
    partner_share    REAL NOT NULL DEFAULT 0,
    status           TEXT NOT NULL DEFAULT 'pendiente'
                     CHECK (status IN ('pendiente', 'validada', 'pagada')),
    payout_id        INTEGER,
    source           TEXT NOT NULL DEFAULT 'manual',
    created_at       TEXT NOT NULL,
    FOREIGN KEY (establishment_id) REFERENCES establishments (id),
    FOREIGN KEY (payout_id) REFERENCES payouts (id)
);

CREATE TABLE IF NOT EXISTS payouts (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    establishment_id INTEGER NOT NULL,
    amount           REAL NOT NULL,
    n_sales          INTEGER NOT NULL,
    payment_date     TEXT NOT NULL,
    method           TEXT DEFAULT 'transferencia',
    reference        TEXT DEFAULT '',
    notes            TEXT DEFAULT '',
    created_at       TEXT NOT NULL,
    FOREIGN KEY (establishment_id) REFERENCES establishments (id)
);
"""

DEFAULT_SETTINGS = {
    "brand_name": "Mi Web de Entradas",
    "base_url": "https://www.mi-web-de-entradas.com",
    "default_commission_pct": "30",
    "default_admin_password": "1",
}


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def now_iso():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def init_db():
    with get_conn() as conn:
        conn.executescript(SCHEMA)
        for key, value in DEFAULT_SETTINGS.items():
            conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (key, value))
        has_admin = conn.execute("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1").fetchone()
        if not has_admin:
            salt, pw_hash = auth.hash_password("admin1234")
            conn.execute(
                "INSERT INTO users (username, password_hash, salt, role, establishment_id, created_at) "
                "VALUES (?, ?, ?, 'admin', NULL, ?)",
                ("admin", pw_hash, salt, now_iso()),
            )


# ---------------------------------------------------------------- settings

def get_setting(key, default=""):
    with get_conn() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else default


def set_setting(key, value):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, str(value)),
        )


# ---------------------------------------------------------------- users

def get_user_by_username(username):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    return dict(row) if row else None


def get_user_by_id(user_id):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return dict(row) if row else None


def create_user(username, password, role, establishment_id=None):
    salt, pw_hash = auth.hash_password(password)
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO users (username, password_hash, salt, role, establishment_id, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (username.strip(), pw_hash, salt, role, establishment_id, now_iso()),
        )


def update_password(user_id, new_password):
    salt, pw_hash = auth.hash_password(new_password)
    with get_conn() as conn:
        conn.execute(
            "UPDATE users SET password_hash = ?, salt = ? WHERE id = ?", (pw_hash, salt, user_id)
        )


def list_partner_users():
    with get_conn() as conn:
        return pd.read_sql_query(
            "SELECT u.id, u.username, u.created_at, u.establishment_id, "
            "e.name AS establecimiento "
            "FROM users u LEFT JOIN establishments e ON e.id = u.establishment_id "
            "WHERE u.role = 'partner' ORDER BY u.username",
            conn,
        )


def delete_user(user_id):
    with get_conn() as conn:
        conn.execute("DELETE FROM users WHERE id = ? AND role = 'partner'", (user_id,))


# ---------------------------------------------------------------- establishments

def _generate_code(conn):
    alphabet = string.ascii_uppercase + string.digits
    while True:
        code = "EST-" + "".join(secrets.choice(alphabet) for _ in range(5))
        if not conn.execute("SELECT 1 FROM establishments WHERE code = ?", (code,)).fetchone():
            return code


def create_establishment(name, contact_name="", email="", phone="", city="", address="",
                         commission_pct=30.0, notes=""):
    with get_conn() as conn:
        code = _generate_code(conn)
        cur = conn.execute(
            "INSERT INTO establishments "
            "(name, code, contact_name, email, phone, city, address, commission_pct, status, notes, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'activo', ?, ?)",
            (name.strip(), code, contact_name, email, phone, city, address,
             float(commission_pct), notes, now_iso()),
        )
        return cur.lastrowid, code


def update_establishment(est_id, **fields):
    allowed = {"name", "contact_name", "email", "phone", "city", "address",
               "commission_pct", "status", "notes"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return
    assignments = ", ".join(f"{k} = ?" for k in updates)
    with get_conn() as conn:
        conn.execute(
            f"UPDATE establishments SET {assignments} WHERE id = ?",
            (*updates.values(), est_id),
        )


def get_establishment(est_id):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM establishments WHERE id = ?", (est_id,)).fetchone()
    return dict(row) if row else None


def get_establishment_by_code(code):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM establishments WHERE UPPER(code) = UPPER(?)", (code.strip(),)
        ).fetchone()
    return dict(row) if row else None


def list_establishments(only_active=False):
    query = "SELECT * FROM establishments"
    if only_active:
        query += " WHERE status = 'activo'"
    query += " ORDER BY name"
    with get_conn() as conn:
        return pd.read_sql_query(query, conn)


# ---------------------------------------------------------------- sales

def booking_ref_exists(establishment_id, booking_ref):
    if not str(booking_ref).strip():
        return False
    with get_conn() as conn:
        row = conn.execute(
            "SELECT 1 FROM sales WHERE establishment_id = ? AND booking_ref = ? LIMIT 1",
            (establishment_id, str(booking_ref).strip()),
        ).fetchone()
    return row is not None


def add_sale(establishment_id, sale_date, activity, booking_ref, tickets,
             amount_total, gyg_commission, status="pendiente", source="manual"):
    est = get_establishment(establishment_id)
    if est is None:
        raise ValueError(f"Establecimiento {establishment_id} no existe")
    partner_share = round(float(gyg_commission) * est["commission_pct"] / 100.0, 2)
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO sales (establishment_id, sale_date, activity, booking_ref, tickets, "
            "amount_total, gyg_commission, partner_share, status, source, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (establishment_id, str(sale_date), activity, booking_ref, int(tickets),
             float(amount_total), float(gyg_commission), partner_share, status, source, now_iso()),
        )
    return partner_share


def list_sales(establishment_id=None, status=None, date_from=None, date_to=None):
    query = (
        "SELECT s.id, s.sale_date AS fecha, e.name AS establecimiento, e.code AS codigo, "
        "s.activity AS actividad, s.booking_ref AS reserva, s.tickets AS entradas, "
        "s.amount_total AS importe_total, s.gyg_commission AS comision_gyg, "
        "s.partner_share AS comision_establecimiento, s.status AS estado, "
        "s.payout_id AS liquidacion, s.establishment_id "
        "FROM sales s JOIN establishments e ON e.id = s.establishment_id WHERE 1=1"
    )
    params = []
    if establishment_id:
        query += " AND s.establishment_id = ?"
        params.append(establishment_id)
    if status:
        query += " AND s.status = ?"
        params.append(status)
    if date_from:
        query += " AND s.sale_date >= ?"
        params.append(str(date_from))
    if date_to:
        query += " AND s.sale_date <= ?"
        params.append(str(date_to))
    query += " ORDER BY s.sale_date DESC, s.id DESC"
    with get_conn() as conn:
        return pd.read_sql_query(query, conn, params=params)


def set_sales_status(sale_ids, status):
    """Cambia el estado respetando la máquina de estados.

    Solo se valida lo pendiente y solo se marca pagado lo validado; una venta
    ya liquidada (payout_id relleno) nunca cambia por esta vía.
    """
    if not sale_ids:
        return 0
    guards = {"validada": "AND status = 'pendiente'", "pagada": "AND status = 'validada'"}
    guard = guards.get(status, "")
    placeholders = ",".join("?" for _ in sale_ids)
    with get_conn() as conn:
        cur = conn.execute(
            f"UPDATE sales SET status = ? WHERE id IN ({placeholders}) "
            f"AND payout_id IS NULL {guard}",
            (status, *sale_ids),
        )
        return cur.rowcount


def delete_sales(sale_ids):
    if not sale_ids:
        return
    placeholders = ",".join("?" for _ in sale_ids)
    with get_conn() as conn:
        conn.execute(
            f"DELETE FROM sales WHERE id IN ({placeholders}) AND payout_id IS NULL",
            tuple(sale_ids),
        )


# ---------------------------------------------------------------- payouts

def pending_by_establishment():
    """Comisión validada y aún no liquidada, agrupada por establecimiento."""
    with get_conn() as conn:
        return pd.read_sql_query(
            "SELECT e.id, e.name AS establecimiento, e.code AS codigo, "
            "COUNT(s.id) AS ventas, ROUND(SUM(s.partner_share), 2) AS pendiente "
            "FROM sales s JOIN establishments e ON e.id = s.establishment_id "
            "WHERE s.status = 'validada' AND s.payout_id IS NULL "
            "GROUP BY e.id, e.name, e.code ORDER BY pendiente DESC",
            conn,
        )


def create_payout(establishment_id, payment_date, method="transferencia", reference="", notes=""):
    """Agrupa todas las ventas validadas sin liquidar del establecimiento en una liquidación.

    BEGIN IMMEDIATE toma el bloqueo de escritura antes de leer, de modo que dos
    liquidaciones simultáneas del mismo establecimiento no puedan reclamar las
    mismas ventas ni duplicar el pago.
    """
    with get_conn() as conn:
        conn.execute("BEGIN IMMEDIATE")
        rows = conn.execute(
            "SELECT id, partner_share FROM sales "
            "WHERE establishment_id = ? AND status = 'validada' AND payout_id IS NULL",
            (establishment_id,),
        ).fetchall()
        if not rows:
            return None
        amount = round(sum(r["partner_share"] for r in rows), 2)
        cur = conn.execute(
            "INSERT INTO payouts (establishment_id, amount, n_sales, payment_date, method, "
            "reference, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (establishment_id, amount, len(rows), str(payment_date), method, reference,
             notes, now_iso()),
        )
        payout_id = cur.lastrowid
        placeholders = ",".join("?" for _ in rows)
        claimed = conn.execute(
            f"UPDATE sales SET status = 'pagada', payout_id = ? "
            f"WHERE id IN ({placeholders}) AND status = 'validada' AND payout_id IS NULL",
            (payout_id, *[r["id"] for r in rows]),
        ).rowcount
        if claimed != len(rows):
            raise RuntimeError(
                "Liquidación abortada: las ventas cambiaron mientras se generaba."
            )
        return {"id": payout_id, "amount": amount, "n_sales": len(rows)}


def list_payouts(establishment_id=None):
    query = (
        "SELECT p.id, p.payment_date AS fecha_pago, e.name AS establecimiento, "
        "p.amount AS importe, p.n_sales AS ventas, p.method AS metodo, "
        "p.reference AS referencia, p.notes AS notas "
        "FROM payouts p JOIN establishments e ON e.id = p.establishment_id WHERE 1=1"
    )
    params = []
    if establishment_id:
        query += " AND p.establishment_id = ?"
        params.append(establishment_id)
    query += " ORDER BY p.payment_date DESC, p.id DESC"
    with get_conn() as conn:
        return pd.read_sql_query(query, conn, params=params)


# ---------------------------------------------------------------- métricas

def sales_summary(establishment_id=None):
    """Totales globales: ventas, entradas, importe, comisiones y pendiente de pago."""
    where = "WHERE s.status IN ('validada', 'pagada')"
    params = []
    if establishment_id:
        where += " AND s.establishment_id = ?"
        params.append(establishment_id)
    with get_conn() as conn:
        row = conn.execute(
            "SELECT COUNT(s.id) AS n_ventas, COALESCE(SUM(s.tickets), 0) AS entradas, "
            "COALESCE(SUM(s.amount_total), 0) AS importe, "
            "COALESCE(SUM(s.gyg_commission), 0) AS comision_gyg, "
            "COALESCE(SUM(s.partner_share), 0) AS comision_partner "
            f"FROM sales s {where}",
            params,
        ).fetchone()
        pend_where = "WHERE s.status = 'validada' AND s.payout_id IS NULL"
        if establishment_id:
            pend_where += " AND s.establishment_id = ?"
        pending = conn.execute(
            f"SELECT COALESCE(SUM(s.partner_share), 0) AS p FROM sales s {pend_where}",
            params,
        ).fetchone()["p"]
        paid_where = "WHERE 1=1"
        paid_params = []
        if establishment_id:
            paid_where += " AND establishment_id = ?"
            paid_params.append(establishment_id)
        paid = conn.execute(
            f"SELECT COALESCE(SUM(amount), 0) AS p FROM payouts {paid_where}", paid_params
        ).fetchone()["p"]
    result = dict(row)
    result["pendiente_pago"] = round(pending, 2)
    result["pagado"] = round(paid, 2)
    return result


def monthly_commissions(establishment_id=None):
    """Comisión mensual (ventas validadas + pagadas), desglosada nuestra parte / establecimiento."""
    where = "WHERE s.status IN ('validada', 'pagada')"
    params = []
    if establishment_id:
        where += " AND s.establishment_id = ?"
        params.append(establishment_id)
    with get_conn() as conn:
        df = pd.read_sql_query(
            "SELECT substr(s.sale_date, 1, 7) AS mes, "
            "ROUND(SUM(s.gyg_commission - s.partner_share), 2) AS nuestra_parte, "
            "ROUND(SUM(s.partner_share), 2) AS comision_establecimientos "
            f"FROM sales s {where} GROUP BY mes ORDER BY mes",
            conn,
            params=params,
        )
    return df


def top_establishments(limit=10):
    with get_conn() as conn:
        return pd.read_sql_query(
            "SELECT e.name AS establecimiento, e.code AS codigo, COUNT(s.id) AS ventas, "
            "COALESCE(SUM(s.tickets), 0) AS entradas, "
            "ROUND(COALESCE(SUM(s.gyg_commission), 0), 2) AS comision_gyg, "
            "ROUND(COALESCE(SUM(s.partner_share), 0), 2) AS comision_establecimiento "
            "FROM establishments e LEFT JOIN sales s "
            "ON s.establishment_id = e.id AND s.status IN ('validada', 'pagada') "
            "GROUP BY e.id ORDER BY comision_gyg DESC LIMIT ?",
            conn,
            params=[limit],
        )
