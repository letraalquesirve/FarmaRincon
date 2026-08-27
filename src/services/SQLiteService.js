// src/services/SQLiteService.js
import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

let db = null;

// ─────────────────────────────────────────────────────────────
// INICIALIZAR BASE DE DATOS (CREAR TABLAS SI NO EXISTEN)
// ─────────────────────────────────────────────────────────────
export const initDatabase = async () => {
  if (db) return db;

  db = await SQLite.openDatabaseAsync('farmacia.db');

  // Crear tablas (estructura completa)
  await db.execAsync(`
    -- Tabla de medicamentos
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

    -- Tabla de pedidos
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

    -- Tabla de entregas
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

    -- Tabla de usuarios
    CREATE TABLE IF NOT EXISTS usuarios (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      tipo TEXT DEFAULT 'user',
      updated TEXT,
      _syncStatus TEXT DEFAULT 'synced',
      _pendingOp TEXT
    );

    -- Tabla de history
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

    -- Tabla de categorías (nombre -> ubicación física en la farmacia)
    CREATE TABLE IF NOT EXISTS categorias (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      ubicacion TEXT,
      updated TEXT,
      _syncStatus TEXT DEFAULT 'synced',
      _pendingOp TEXT
    );

    -- Índices para rendimiento
    CREATE INDEX IF NOT EXISTS idx_medicamentos_nombre ON medicamentos(nombre);
    CREATE INDEX IF NOT EXISTS idx_medicamentos_activo ON medicamentos(activo);
    CREATE INDEX IF NOT EXISTS idx_pedidos_atendido ON pedidos(atendido);
    CREATE INDEX IF NOT EXISTS idx_entregas_estado ON entregas(estado);
    CREATE INDEX IF NOT EXISTS idx_entregas_pedidoId ON entregas(pedidoId);
    CREATE INDEX IF NOT EXISTS idx_history_fecha ON history(fecha);
    CREATE INDEX IF NOT EXISTS idx_categorias_nombre ON categorias(nombre);
  `);

  console.log('✅ Base de datos SQLite inicializada');
  return db;
};

export const getDb = async () => {
  if (!db) await initDatabase();
  return db;
};

// ─────────────────────────────────────────────────────────────
// FUNCIONES DE RESPALDO
// ─────────────────────────────────────────────────────────────
const getBackupPath = (filename) => {
  const baseDir = FileSystem.documentDirectory;
  return `${baseDir}${filename}`;
};

export const exportDatabaseToFile = async (filename) => {
  try {
    const dbInstance = await getDb();
    await dbInstance.execAsync('PRAGMA wal_checkpoint;');
    const sqlitePath = `${FileSystem.documentDirectory}SQLite/farmacia.db`;
    const backupPath = getBackupPath(filename);
    await FileSystem.copyAsync({
      from: sqlitePath,
      to: backupPath,
    });
    console.log(`📁 Base de datos exportada a: ${backupPath}`);
    return backupPath;
  } catch (error) {
    console.error('❌ Error exportando base de datos:', error);
    return null;
  }
};

export const importDatabaseFromFile = async (fileUri) => {
  try {
    const dbInstance = await getDb();
    await dbInstance.closeAsync();
    db = null;
    const sqlitePath = `${FileSystem.documentDirectory}SQLite/farmacia.db`;

    // FileSystem.copyAsync falla si el destino ya existe (y farmacia.db
    // SIEMPRE existe, porque initDatabase() ya lo creó al arrancar la app).
    // Hay que borrar el archivo destino (y sus sidecars de WAL, si los hay)
    // antes de copiar encima.
    for (const suffix of ['', '-wal', '-shm']) {
      await FileSystem.deleteAsync(`${sqlitePath}${suffix}`, { idempotent: true });
    }

    await FileSystem.copyAsync({
      from: fileUri,
      to: sqlitePath,
    });
    await initDatabase();
    console.log(`📥 Base de datos importada desde: ${fileUri}`);
    return true;
  } catch (error) {
    console.error('❌ Error importando base de datos:', error);
    return false;
  }
};

// ─────────────────────────────────────────────────────────────
// MEDICAMENTOS
// ─────────────────────────────────────────────────────────────
// Normaliza el registro que sale de SQLite (activo: 0/1 -> boolean) para que
// el resto de la app pueda seguir comparando con === true / === false
// exactamente como lo hacía con los datos de PocketBase.
const normalizeMedicamento = (row) => {
  if (!row) return row;
  return { ...row, activo: row.activo === 1 || row.activo === true };
};

export const getAllMedicamentos = async (activo = null) => {
  const dbInstance = await getDb();
  let query = 'SELECT * FROM medicamentos';
  const params = [];
  if (activo !== null) {
    query += ' WHERE activo = ?';
    params.push(activo ? 1 : 0);
  }
  query += ' ORDER BY nombre';
  const rows = await dbInstance.getAllAsync(query, params);
  return rows.map(normalizeMedicamento);
};

export const getMedicamentoById = async (id) => {
  const dbInstance = await getDb();
  const row = await dbInstance.getFirstAsync('SELECT * FROM medicamentos WHERE id = ?', [id]);
  return normalizeMedicamento(row);
};

export const saveMedicamento = async (medicamento, syncStatus = 'synced', pendingOp = null) => {
  const dbInstance = await getDb();
  const now = new Date().toISOString();
  const exists = await getMedicamentoById(medicamento.id);

  const data = {
    id: medicamento.id,
    nombre: medicamento.nombre,
    presentacion: medicamento.presentacion || '',
    categoria: medicamento.categoria || '',
    cantidad: medicamento.cantidad || 0,
    vencimiento: medicamento.vencimiento || '',
    imagen: medicamento.imagen || null,
    audio: medicamento.audio || null,
    fechaRegistro: medicamento.fechaRegistro || now,
    activo: medicamento.activo !== false ? 1 : 0,
    fechaBaja: medicamento.fechaBaja || null,
    userName: medicamento.userName || '',
    userId: medicamento.userId || '',
    ubicacion: medicamento.ubicacion || '',
    fechaEdicion: medicamento.fechaEdicion || null,
    editadoPor: medicamento.editadoPor || null,
    fechaReactivacion: medicamento.fechaReactivacion || null,
    reactivadoPor: medicamento.reactivadoPor || null,
    updated: now,
    _syncStatus: syncStatus,
    _pendingOp: pendingOp,
  };

  if (exists) {
    await dbInstance.runAsync(
      `UPDATE medicamentos SET 
        nombre = ?, presentacion = ?, categoria = ?, cantidad = ?,
        vencimiento = ?, imagen = ?, audio = ?, fechaRegistro = ?, activo = ?,
        fechaBaja = ?, userName = ?, userId = ?, ubicacion = ?,
        fechaEdicion = ?, editadoPor = ?, fechaReactivacion = ?, reactivadoPor = ?,
        updated = ?, _syncStatus = ?, _pendingOp = ?
      WHERE id = ?`,
      [
        data.nombre,
        data.presentacion,
        data.categoria,
        data.cantidad,
        data.vencimiento,
        data.imagen,
        data.audio,
        data.fechaRegistro,
        data.activo,
        data.fechaBaja,
        data.userName,
        data.userId,
        data.ubicacion,
        data.fechaEdicion,
        data.editadoPor,
        data.fechaReactivacion,
        data.reactivadoPor,
        data.updated,
        data._syncStatus,
        data._pendingOp,
        data.id,
      ]
    );
  } else {
    await dbInstance.runAsync(
      `INSERT INTO medicamentos (
        id, nombre, presentacion, categoria, cantidad, vencimiento, imagen, audio,
        fechaRegistro, activo, fechaBaja, userName, userId, ubicacion,
        fechaEdicion, editadoPor, fechaReactivacion, reactivadoPor,
        updated, _syncStatus, _pendingOp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.id,
        data.nombre,
        data.presentacion,
        data.categoria,
        data.cantidad,
        data.vencimiento,
        data.imagen,
        data.audio,
        data.fechaRegistro,
        data.activo,
        data.fechaBaja,
        data.userName,
        data.userId,
        data.ubicacion,
        data.fechaEdicion,
        data.editadoPor,
        data.fechaReactivacion,
        data.reactivadoPor,
        data.updated,
        data._syncStatus,
        data._pendingOp,
      ]
    );
  }
  return medicamento;
};

export const deleteMedicamento = async (id) => {
  const dbInstance = await getDb();
  await dbInstance.runAsync('DELETE FROM medicamentos WHERE id = ?', [id]);
};

// ─────────────────────────────────────────────────────────────
// PEDIDOS
// ─────────────────────────────────────────────────────────────
const normalizePedido = (row) => {
  if (!row) return row;
  return {
    ...row,
    atendido: row.atendido === 1 || row.atendido === true,
    medicamentosSolicitados: row.medicamentosSolicitados
      ? JSON.parse(row.medicamentosSolicitados)
      : [],
    entregasRealizadas: row.entregasRealizadas ? JSON.parse(row.entregasRealizadas) : [],
  };
};

export const getAllPedidos = async () => {
  const dbInstance = await getDb();
  const result = await dbInstance.getAllAsync('SELECT * FROM pedidos ORDER BY fechaPedido DESC');
  return result.map(normalizePedido);
};

export const getPedidoById = async (id) => {
  const dbInstance = await getDb();
  const row = await dbInstance.getFirstAsync('SELECT * FROM pedidos WHERE id = ?', [id]);
  return normalizePedido(row);
};

export const savePedido = async (pedido, syncStatus = 'synced', pendingOp = null) => {
  const dbInstance = await getDb();
  const now = new Date().toISOString();
  const exists = await getPedidoById(pedido.id);

  const medicamentosSolicitados = JSON.stringify(pedido.medicamentosSolicitados || []);
  const entregasRealizadas = JSON.stringify(pedido.entregasRealizadas || []);

  if (exists) {
    await dbInstance.runAsync(
      `UPDATE pedidos SET 
        nombreSolicitante = ?, lugarResidencia = ?, telefonoContacto = ?,
        notas = ?, medicamentosSolicitados = ?, atendido = ?,
        entregasRealizadas = ?, fechaPedido = ?, fechaAtencion = ?,
        creadoPor = ?, atendidoPor = ?, updated = ?, _syncStatus = ?, _pendingOp = ?
      WHERE id = ?`,
      [
        pedido.nombreSolicitante,
        pedido.lugarResidencia || '',
        pedido.telefonoContacto || '',
        pedido.notas || '',
        medicamentosSolicitados,
        pedido.atendido ? 1 : 0,
        entregasRealizadas,
        pedido.fechaPedido || now,
        pedido.fechaAtencion || null,
        pedido.creadoPor || '',
        pedido.atendidoPor || '',
        now,
        syncStatus,
        pendingOp,
        pedido.id,
      ]
    );
  } else {
    await dbInstance.runAsync(
      `INSERT INTO pedidos (
        id, nombreSolicitante, lugarResidencia, telefonoContacto, notas,
        medicamentosSolicitados, atendido, entregasRealizadas, fechaPedido,
        fechaAtencion, creadoPor, atendidoPor, updated, _syncStatus, _pendingOp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        pedido.id,
        pedido.nombreSolicitante,
        pedido.lugarResidencia || '',
        pedido.telefonoContacto || '',
        pedido.notas || '',
        medicamentosSolicitados,
        pedido.atendido ? 1 : 0,
        entregasRealizadas,
        pedido.fechaPedido || now,
        pedido.fechaAtencion || null,
        pedido.creadoPor || '',
        pedido.atendidoPor || '',
        now,
        syncStatus,
        pendingOp,
      ]
    );
  }
  return pedido;
};

export const deletePedido = async (id) => {
  const dbInstance = await getDb();
  await dbInstance.runAsync('DELETE FROM pedidos WHERE id = ?', [id]);
};

// ─────────────────────────────────────────────────────────────
// ENTREGAS
// ─────────────────────────────────────────────────────────────
export const getAllEntregas = async () => {
  const dbInstance = await getDb();
  const result = await dbInstance.getAllAsync('SELECT * FROM entregas ORDER BY fechaCreacion DESC');
  return result.map((e) => ({
    ...e,
    items: e.items ? JSON.parse(e.items) : [],
  }));
};

export const getEntregaById = async (id) => {
  const dbInstance = await getDb();
  return await dbInstance.getFirstAsync('SELECT * FROM entregas WHERE id = ?', [id]);
};

export const saveEntrega = async (entrega, syncStatus = 'synced', pendingOp = null) => {
  const dbInstance = await getDb();
  const now = new Date().toISOString();
  const exists = await getEntregaById(entrega.id);
  const items = JSON.stringify(entrega.items || []);

  if (exists) {
    await dbInstance.runAsync(
      `UPDATE entregas SET 
        destino = ?, fechaCreacion = ?, estado = ?, items = ?,
        creadoPor = ?, pedidoId = ?, notas = ?, ultimaModificacion = ?,
        updated = ?, _syncStatus = ?, _pendingOp = ?
      WHERE id = ?`,
      [
        entrega.destino,
        entrega.fechaCreacion || now,
        entrega.estado || 'abierta',
        items,
        entrega.creadoPor || '',
        entrega.pedidoId || null,
        entrega.notas || '',
        entrega.ultimaModificacion || now,
        now,
        syncStatus,
        pendingOp,
        entrega.id,
      ]
    );
  } else {
    await dbInstance.runAsync(
      `INSERT INTO entregas (
        id, destino, fechaCreacion, estado, items, creadoPor, pedidoId,
        notas, ultimaModificacion, updated, _syncStatus, _pendingOp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entrega.id,
        entrega.destino,
        entrega.fechaCreacion || now,
        entrega.estado || 'abierta',
        items,
        entrega.creadoPor || '',
        entrega.pedidoId || null,
        entrega.notas || '',
        entrega.ultimaModificacion || now,
        now,
        syncStatus,
        pendingOp,
      ]
    );
  }
  return entrega;
};

export const deleteEntrega = async (id) => {
  const dbInstance = await getDb();
  await dbInstance.runAsync('DELETE FROM entregas WHERE id = ?', [id]);
};

// ─────────────────────────────────────────────────────────────
// USUARIOS
// ─────────────────────────────────────────────────────────────
export const getAllUsuarios = async () => {
  const dbInstance = await getDb();
  return await dbInstance.getAllAsync('SELECT * FROM usuarios ORDER BY nombre');
};

export const getUsuarioById = async (id) => {
  const dbInstance = await getDb();
  return await dbInstance.getFirstAsync('SELECT * FROM usuarios WHERE id = ?', [id]);
};

// Búsqueda case-insensitive por nombre, usada en el login local
export const getUsuarioByNombre = async (nombre) => {
  const dbInstance = await getDb();
  return await dbInstance.getFirstAsync(
    'SELECT * FROM usuarios WHERE LOWER(nombre) = LOWER(?)',
    [nombre]
  );
};

export const saveUsuario = async (usuario, syncStatus = 'synced', pendingOp = null) => {
  const dbInstance = await getDb();
  const now = new Date().toISOString();
  const exists = await getUsuarioById(usuario.id);

  if (exists) {
    await dbInstance.runAsync(
      `UPDATE usuarios SET nombre = ?, tipo = ?, updated = ?, _syncStatus = ?, _pendingOp = ? WHERE id = ?`,
      [usuario.nombre, usuario.tipo || 'user', now, syncStatus, pendingOp, usuario.id]
    );
  } else {
    await dbInstance.runAsync(
      `INSERT INTO usuarios (id, nombre, tipo, updated, _syncStatus, _pendingOp) VALUES (?, ?, ?, ?, ?, ?)`,
      [usuario.id, usuario.nombre, usuario.tipo || 'user', now, syncStatus, pendingOp]
    );
  }
  return usuario;
};

export const deleteUsuario = async (id) => {
  const dbInstance = await getDb();
  await dbInstance.runAsync('DELETE FROM usuarios WHERE id = ?', [id]);
};

// ─────────────────────────────────────────────────────────────
// HISTORY
// ─────────────────────────────────────────────────────────────
export const getAllHistory = async () => {
  const dbInstance = await getDb();
  return await dbInstance.getAllAsync('SELECT * FROM history ORDER BY fecha DESC');
};

export const saveHistory = async (historyItem, syncStatus = 'synced', pendingOp = null) => {
  const dbInstance = await getDb();
  const now = new Date().toISOString();

  await dbInstance.runAsync(
    `INSERT INTO history (id, id_med, nombre, fecha, user, movimiento, cantidad, updated, _syncStatus, _pendingOp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      historyItem.id || `${Date.now()}_${Math.random()}`,
      historyItem.id_med,
      historyItem.nombre || '',
      historyItem.fecha || now,
      historyItem.user || '',
      historyItem.movimiento || '',
      historyItem.cantidad || 0,
      now,
      syncStatus,
      pendingOp,
    ]
  );
  return historyItem;
};

// ─────────────────────────────────────────────────────────────
// CATEGORIAS
// ─────────────────────────────────────────────────────────────
export const getAllCategorias = async () => {
  const dbInstance = await getDb();
  return await dbInstance.getAllAsync('SELECT * FROM categorias ORDER BY nombre');
};

export const getCategoriaByNombre = async (nombre) => {
  const dbInstance = await getDb();
  return await dbInstance.getFirstAsync(
    'SELECT * FROM categorias WHERE LOWER(nombre) = LOWER(?)',
    [nombre]
  );
};

export const saveCategoria = async (categoria, syncStatus = 'synced', pendingOp = null) => {
  const dbInstance = await getDb();
  const now = new Date().toISOString();
  const existing = await dbInstance.getFirstAsync('SELECT id FROM categorias WHERE id = ?', [
    categoria.id,
  ]);

  if (existing) {
    await dbInstance.runAsync(
      `UPDATE categorias SET nombre = ?, ubicacion = ?, updated = ?, _syncStatus = ?, _pendingOp = ? WHERE id = ?`,
      [categoria.nombre, categoria.ubicacion || '', now, syncStatus, pendingOp, categoria.id]
    );
  } else {
    await dbInstance.runAsync(
      `INSERT INTO categorias (id, nombre, ubicacion, updated, _syncStatus, _pendingOp) VALUES (?, ?, ?, ?, ?, ?)`,
      [categoria.id, categoria.nombre, categoria.ubicacion || '', now, syncStatus, pendingOp]
    );
  }
  return categoria;
};

// ─────────────────────────────────────────────────────────────
// VERIFICACIÓN
// ─────────────────────────────────────────────────────────────
export const checkTablesStatus = async () => {
  const dbInstance = await getDb();
  const tables = ['medicamentos', 'pedidos', 'entregas', 'usuarios', 'history', 'categorias'];
  const status = {};
  for (const table of tables) {
    const result = await dbInstance.getFirstAsync(`SELECT COUNT(*) as count FROM ${table}`);
    status[table] = result?.count || 0;
  }
  console.log('📊 Estado de tablas:', status);
  return status;
};
