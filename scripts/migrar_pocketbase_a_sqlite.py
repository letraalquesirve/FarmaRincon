#!/usr/bin/env python3
"""
Migración de datos: PocketBase (en vivo) -> archivo SQLite compatible
con la app FarmaRincon (rama sqlite-local).

QUÉ HACE:
  1. Descarga todos los registros de PocketBase (medicamentos, pedidos,
     entregas, usuarios, history, categorias) desde tu VPS.
  2. Crea un archivo SQLite local (farmacia_migrada.db) con el MISMO
     esquema que usa la app (src/services/SQLiteService.js).
  3. Opcionalmente lo sube al VPS, a la colección 'backups', con el
     mismo formato de nombre que usa la app (UNLOCK-BDSQLite-...), para
     que el botón "Cargar desde servidor" del login lo encuentre y lo
     descargue como si la app misma lo hubiera subido.

REQUISITOS:
  Solo Python 3 estándar. No hace falta pip install nada.

USO:
  python3 migrar_pocketbase_a_sqlite.py

  Al final te pregunta si quieres subirlo al servidor. Si prefieres
  revisarlo primero (por ejemplo con "DB Browser for SQLite"), responde
  "n" y súbelo después corriendo el script de nuevo, o adaptando la
  función subir_a_vps().

SI ALGUNA COLECCIÓN REQUIERE AUTENTICACIÓN:
  Si ves errores 401/403 al leer una colección, es porque esa colección
  no permite lectura pública en PocketBase. Pon tu token en la variable
  PB_AUTH_TOKEN de abajo (lo puedes obtener logueándote como admin/
  superusuario en el panel de PocketBase y copiando el token, o usando
  el endpoint /api/collections/_superusers/auth-with-password).
"""

import json
import sqlite3
import urllib.request
import urllib.error
from datetime import datetime
import os
import uuid

# ────────────────────────────────────────────────────────────
# CONFIGURACIÓN
# ────────────────────────────────────────────────────────────
VPS_BASE_URL = "https://gp.letraalquesirve.org"
OUTPUT_DB = "farmacia_migrada.db"
USUARIO_MIGRACION = "migracion"
PB_AUTH_TOKEN = ""  # Déjalo vacío si las colecciones permiten lectura pública

# ────────────────────────────────────────────────────────────
# 1. Descargar de PocketBase
# ────────────────────────────────────────────────────────────


def pb_fetch_all(collection):
    """Trae todos los registros de una colección de PocketBase, paginando."""
    items = []
    page = 1
    while True:
        url = f"{VPS_BASE_URL}/api/collections/{collection}/records?page={page}&perPage=200"
        req = urllib.request.Request(url)
        if PB_AUTH_TOKEN:
            req.add_header("Authorization", PB_AUTH_TOKEN)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            print(
                f"  ⚠️  Error HTTP {e.code} leyendo '{collection}' (pág {page}): "
                f"{e.read().decode(errors='ignore')}"
            )
            break
        except Exception as e:
            print(f"  ⚠️  Error leyendo '{collection}': {e}")
            break

        batch = data.get("items", [])
        items.extend(batch)
        total_pages = data.get("totalPages", 1)
        print(f"  📄 {collection}: página {page}/{total_pages} ({len(batch)} registros)")
        if page >= total_pages or not batch:
            break
        page += 1
    return items


# ────────────────────────────────────────────────────────────
# 2. Esquema SQLite (idéntico al de SQLiteService.js)
# ────────────────────────────────────────────────────────────

SCHEMA = """
CREATE TABLE IF NOT EXISTS medicamentos (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  presentacion TEXT,
  categoria TEXT,
  cantidad INTEGER DEFAULT 0,
  vencimiento TEXT,
  imagen TEXT,
  audio TEXT,
  fechaRegistro TEXT,
  activo INTEGER DEFAULT 1,
  fechaBaja TEXT,
  userName TEXT,
  userId TEXT,
  ubicacion TEXT,
  fechaEdicion TEXT,
  editadoPor TEXT,
  fechaReactivacion TEXT,
  reactivadoPor TEXT,
  updated TEXT,
  _syncStatus TEXT DEFAULT 'synced',
  _pendingOp TEXT
);

CREATE TABLE IF NOT EXISTS pedidos (
  id TEXT PRIMARY KEY,
  nombreSolicitante TEXT NOT NULL,
  lugarResidencia TEXT,
  telefonoContacto TEXT,
  notas TEXT,
  medicamentosSolicitados TEXT,
  atendido INTEGER DEFAULT 0,
  entregasRealizadas TEXT,
  fechaPedido TEXT,
  fechaAtencion TEXT,
  creadoPor TEXT,
  atendidoPor TEXT,
  updated TEXT,
  _syncStatus TEXT DEFAULT 'synced',
  _pendingOp TEXT
);

CREATE TABLE IF NOT EXISTS entregas (
  id TEXT PRIMARY KEY,
  destino TEXT NOT NULL,
  fechaCreacion TEXT,
  estado TEXT DEFAULT 'abierta',
  items TEXT,
  creadoPor TEXT,
  pedidoId TEXT,
  notas TEXT,
  ultimaModificacion TEXT,
  updated TEXT,
  _syncStatus TEXT DEFAULT 'synced',
  _pendingOp TEXT
);

CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  tipo TEXT DEFAULT 'user',
  updated TEXT,
  _syncStatus TEXT DEFAULT 'synced',
  _pendingOp TEXT
);

CREATE TABLE IF NOT EXISTS history (
  id TEXT PRIMARY KEY,
  id_med TEXT,
  nombre TEXT,
  fecha TEXT,
  user TEXT,
  movimiento TEXT,
  cantidad INTEGER,
  updated TEXT,
  _syncStatus TEXT DEFAULT 'synced',
  _pendingOp TEXT
);

CREATE TABLE IF NOT EXISTS categorias (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  ubicacion TEXT,
  updated TEXT,
  _syncStatus TEXT DEFAULT 'synced',
  _pendingOp TEXT
);

CREATE INDEX IF NOT EXISTS idx_medicamentos_nombre ON medicamentos(nombre);
CREATE INDEX IF NOT EXISTS idx_medicamentos_activo ON medicamentos(activo);
CREATE INDEX IF NOT EXISTS idx_pedidos_atendido ON pedidos(atendido);
CREATE INDEX IF NOT EXISTS idx_entregas_estado ON entregas(estado);
CREATE INDEX IF NOT EXISTS idx_entregas_pedidoId ON entregas(pedidoId);
CREATE INDEX IF NOT EXISTS idx_history_fecha ON history(fecha);
CREATE INDEX IF NOT EXISTS idx_categorias_nombre ON categorias(nombre);
"""


def g(record, *keys, default=None):
    """Busca el primer campo existente entre varios nombres posibles.
    PocketBase pudo haber guardado el campo en minúsculas (estilo viejo)
    o ya en camelCase; probamos ambos por las dudas."""
    for k in keys:
        if k in record and record[k] not in (None, ""):
            return record[k]
    return default


def to_bool_int(value, default=1):
    if value is None:
        return default
    if isinstance(value, bool):
        return 1 if value else 0
    if isinstance(value, (int, float)):
        return 1 if value else 0
    if isinstance(value, str):
        return 1 if value.strip().lower() in ("true", "1", "si", "sí") else 0
    return default


def migrar():
    print("=" * 60)
    print("Migración PocketBase -> SQLite (FarmaRincon)")
    print("=" * 60)

    if os.path.exists(OUTPUT_DB):
        os.remove(OUTPUT_DB)

    conn = sqlite3.connect(OUTPUT_DB)
    conn.executescript(SCHEMA)

    now = datetime.now().isoformat()

    # ── medicamentos ──
    print("\n📦 Descargando medicamentos...")
    medicamentos = pb_fetch_all("medicamentos")
    for r in medicamentos:
        conn.execute(
            """INSERT OR REPLACE INTO medicamentos
               (id, nombre, presentacion, categoria, cantidad, vencimiento, imagen, audio,
                fechaRegistro, activo, fechaBaja, userName, userId, ubicacion,
                fechaEdicion, editadoPor, fechaReactivacion, reactivadoPor,
                updated, _syncStatus, _pendingOp)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                r.get("id"),
                g(r, "nombre"),
                g(r, "presentacion"),
                g(r, "categoria"),
                g(r, "cantidad", default=0),
                g(r, "vencimiento"),
                g(r, "imagen"),
                g(r, "audio"),
                g(r, "fecharegistro", "fechaRegistro"),
                to_bool_int(g(r, "activo"), default=1),
                g(r, "fechabaja", "fechaBaja"),
                g(r, "username", "userName"),
                g(r, "userid", "userId"),
                g(r, "ubicacion"),
                g(r, "fechaedicion", "fechaEdicion"),
                g(r, "editadopor", "editadoPor"),
                g(r, "fechareactivacion", "fechaReactivacion"),
                g(r, "useridreactivacion", "reactivadoPor"),
                now,
                "synced",
                None,
            ),
        )
    print(f"  ✅ {len(medicamentos)} medicamentos migrados")

    # ── pedidos ──
    print("\n📋 Descargando pedidos...")
    pedidos = pb_fetch_all("pedidos")
    for r in pedidos:
        conn.execute(
            """INSERT OR REPLACE INTO pedidos
               (id, nombreSolicitante, lugarResidencia, telefonoContacto, notas,
                medicamentosSolicitados, atendido, entregasRealizadas,
                fechaPedido, fechaAtencion, creadoPor, atendidoPor,
                updated, _syncStatus, _pendingOp)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                r.get("id"),
                g(r, "nombresolicitante", "nombreSolicitante"),
                g(r, "lugarresidencia", "lugarResidencia"),
                g(r, "telefonocontacto", "telefonoContacto"),
                g(r, "notas"),
                json.dumps(g(r, "medicamentossolicitados", "medicamentosSolicitados", default=[]) or []),
                to_bool_int(g(r, "atendido"), default=0),
                json.dumps(g(r, "entregasrealizadas", "entregasRealizadas", default=[]) or []),
                g(r, "fechapedido", "fechaPedido"),
                g(r, "fechaatencion", "fechaAtencion"),
                g(r, "creadopor", "creadoPor"),
                g(r, "atendidopor", "atendidoPor"),
                now,
                "synced",
                None,
            ),
        )
    print(f"  ✅ {len(pedidos)} pedidos migrados")

    # ── entregas ──
    print("\n🚚 Descargando entregas...")
    entregas = pb_fetch_all("entregas")
    for r in entregas:
        conn.execute(
            """INSERT OR REPLACE INTO entregas
               (id, destino, fechaCreacion, estado, items, creadoPor, pedidoId,
                notas, ultimaModificacion, updated, _syncStatus, _pendingOp)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                r.get("id"),
                g(r, "destino"),
                g(r, "fechacreacion", "fechaCreacion"),
                g(r, "estado", default="abierta"),
                json.dumps(g(r, "items", default=[]) or []),
                g(r, "creadopor", "creadoPor"),
                g(r, "pedidoid", "pedidoId") or None,
                g(r, "notas"),
                g(r, "ultimamodificacion", "ultimaModificacion"),
                now,
                "synced",
                None,
            ),
        )
    print(f"  ✅ {len(entregas)} entregas migradas")

    # ── usuarios ──
    print("\n👤 Descargando usuarios...")
    usuarios = pb_fetch_all("usuarios")
    for r in usuarios:
        conn.execute(
            """INSERT OR REPLACE INTO usuarios (id, nombre, tipo, updated, _syncStatus, _pendingOp)
               VALUES (?,?,?,?,?,?)""",
            (r.get("id"), g(r, "nombre"), g(r, "tipo", default="user"), now, "synced", None),
        )
    print(f"  ✅ {len(usuarios)} usuarios migrados")

    # ── history ──
    print("\n🕒 Descargando history...")
    history = pb_fetch_all("history")
    for r in history:
        conn.execute(
            """INSERT OR REPLACE INTO history
               (id, id_med, nombre, fecha, user, movimiento, cantidad,
                updated, _syncStatus, _pendingOp)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (
                r.get("id"),
                g(r, "id_med"),
                g(r, "nombre", "name"),
                g(r, "fecha"),
                g(r, "user"),
                g(r, "movimiento"),
                g(r, "cantidad", default=0),
                now,
                "synced",
                None,
            ),
        )
    print(f"  ✅ {len(history)} registros de history migrados")

    # ── categorias ──
    print("\n🏷️  Descargando categorias...")
    categorias = pb_fetch_all("categorias")
    for r in categorias:
        conn.execute(
            """INSERT OR REPLACE INTO categorias (id, nombre, ubicacion, updated, _syncStatus, _pendingOp)
               VALUES (?,?,?,?,?,?)""",
            (r.get("id"), g(r, "nombre"), g(r, "ubicacion"), now, "synced", None),
        )
    print(f"  ✅ {len(categorias)} categorías migradas")

    conn.commit()
    conn.close()

    print(f"\n✅ Archivo generado: {os.path.abspath(OUTPUT_DB)}")
    return OUTPUT_DB


# ────────────────────────────────────────────────────────────
# 3. Subir el archivo al VPS (colección 'backups')
# ────────────────────────────────────────────────────────────


def subir_a_vps(filepath):
    ahora = datetime.now()
    fecha_str = ahora.strftime("%Y-%m-%d-%H-%M")
    filename = f"UNLOCK-BDSQLite-{fecha_str}-{USUARIO_MIGRACION}.sql"

    boundary = uuid.uuid4().hex
    with open(filepath, "rb") as f:
        file_data = f.read()

    def field(name, value):
        return (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'
            f"{value}\r\n"
        ).encode("utf-8")

    body = b""
    body += field("usuario", USUARIO_MIGRACION)
    body += field("fecha_subida", ahora.isoformat())
    body += field("filename", filename)
    body += (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: application/octet-stream\r\n\r\n"
    ).encode("utf-8")
    body += file_data
    body += f"\r\n--{boundary}--\r\n".encode("utf-8")

    url = f"{VPS_BASE_URL}/api/collections/backups/records"
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    if PB_AUTH_TOKEN:
        req.add_header("Authorization", PB_AUTH_TOKEN)

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            print(f"\n✅ Subido al servidor como: {filename}")
            print(f"   ID del registro: {result.get('id')}")
            return True
    except urllib.error.HTTPError as e:
        print(f"\n❌ Error subiendo al servidor: HTTP {e.code}")
        print(e.read().decode(errors="ignore"))
        return False
    except Exception as e:
        print(f"\n❌ Error subiendo al servidor: {e}")
        return False


if __name__ == "__main__":
    db_path = migrar()

    print("\n" + "=" * 60)
    respuesta = input("¿Subir este archivo al servidor ahora? (s/n): ").strip().lower()
    if respuesta == "s":
        subir_a_vps(db_path)
    else:
        print(f"\nListo. El archivo quedó en: {os.path.abspath(db_path)}")
        print("Puedes revisarlo con un visor de SQLite (ej. 'DB Browser for")
        print("SQLite') y subirlo después corriendo este script de nuevo.")
