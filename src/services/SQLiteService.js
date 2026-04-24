// services/SQLiteService.js
import * as SQLite from 'expo-sqlite';

let db = null;
let initPromise = null; // ✅ Para evitar múltiples inicializaciones simultáneas

// Inicializar base de datos (con singleton pattern)
export const initDatabase = async () => {
  // Si ya está inicializada, devolverla
  if (db) return db;

  // Si ya hay una inicialización en curso, esperarla
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      console.log('📦 Inicializando base de datos SQLite...');

      // Abrir base de datos
      db = await SQLite.openDatabaseAsync('farmacia.db');

      // Crear tablas
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
          fechaRegistro TEXT,
          activo INTEGER DEFAULT 1,
          fechaBaja TEXT,
          userName TEXT,
          userId TEXT,
          ubicacion TEXT,
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

        -- Índices
        CREATE INDEX IF NOT EXISTS idx_medicamentos_nombre ON medicamentos(nombre);
        CREATE INDEX IF NOT EXISTS idx_medicamentos_activo ON medicamentos(activo);
        CREATE INDEX IF NOT EXISTS idx_pedidos_atendido ON pedidos(atendido);
        CREATE INDEX IF NOT EXISTS idx_entregas_estado ON entregas(estado);
        CREATE INDEX IF NOT EXISTS idx_entregas_pedidoId ON entregas(pedidoId);
      `);

      console.log('✅ Base de datos SQLite inicializada');
      return db;
    } catch (error) {
      console.error('❌ Error inicializando base de datos:', error);
      db = null;
      initPromise = null;
      throw error;
    }
  })();

  return initPromise;
};

// Obtener instancia de la BD (asegura que esté inicializada)
export const getDb = async () => {
  if (!db) {
    await initDatabase();
  }
  return db;
};

// ==================== MEDICAMENTOS ====================

export const getAllMedicamentos = async (activo = null) => {
  await initDatabase(); // ✅ Asegurar inicialización
  let query = 'SELECT * FROM medicamentos';
  const params = [];

  if (activo !== null) {
    query += ' WHERE activo = ?';
    params.push(activo ? 1 : 0);
  }

  query += ' ORDER BY nombre';

  try {
    const result = await db.getAllAsync(query, params);
    return result || [];
  } catch (error) {
    console.error('Error en getAllMedicamentos:', error);
    return [];
  }
};

export const getMedicamentoById = async (id) => {
  await initDatabase();
  try {
    const result = await db.getFirstAsync('SELECT * FROM medicamentos WHERE id = ?', [id]);
    return result;
  } catch (error) {
    console.error('Error en getMedicamentoById:', error);
    return null;
  }
};

export const saveMedicamento = async (medicamento, syncStatus = 'synced', pendingOp = null) => {
  await initDatabase();
  const now = new Date().toISOString();

  try {
    const exists = await getMedicamentoById(medicamento.id);

    if (exists) {
      await db.runAsync(
        `UPDATE medicamentos SET 
          nombre = ?, presentacion = ?, categoria = ?, cantidad = ?, 
          vencimiento = ?, imagen = ?, fechaRegistro = ?, activo = ?, 
          fechaBaja = ?, userName = ?, userId = ?, ubicacion = ?,
          updated = ?, _syncStatus = ?, _pendingOp = ?
        WHERE id = ?`,
        [
          medicamento.nombre,
          medicamento.presentacion || '',
          medicamento.categoria || '',
          medicamento.cantidad || 0,
          medicamento.vencimiento || '',
          medicamento.imagen || null,
          medicamento.fechaRegistro || now,
          medicamento.activo ? 1 : 0,
          medicamento.fechaBaja || null,
          medicamento.userName || '',
          medicamento.userId || '',
          medicamento.ubicacion || '',
          now,
          syncStatus,
          pendingOp,
          medicamento.id,
        ]
      );
    } else {
      await db.runAsync(
        `INSERT INTO medicamentos (
          id, nombre, presentacion, categoria, cantidad, vencimiento, imagen,
          fechaRegistro, activo, fechaBaja, userName, userId, ubicacion,
          updated, _syncStatus, _pendingOp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          medicamento.id,
          medicamento.nombre,
          medicamento.presentacion || '',
          medicamento.categoria || '',
          medicamento.cantidad || 0,
          medicamento.vencimiento || '',
          medicamento.imagen || null,
          medicamento.fechaRegistro || now,
          medicamento.activo ? 1 : 0,
          medicamento.fechaBaja || null,
          medicamento.userName || '',
          medicamento.userId || '',
          medicamento.ubicacion || '',
          now,
          syncStatus,
          pendingOp,
        ]
      );
    }
    return medicamento;
  } catch (error) {
    console.error('Error en saveMedicamento:', error);
    throw error;
  }
};

export const deleteMedicamento = async (id) => {
  await initDatabase();
  await db.runAsync('DELETE FROM medicamentos WHERE id = ?', [id]);
};

// ==================== PEDIDOS ====================

export const getAllPedidos = async () => {
  await initDatabase();
  try {
    const result = await db.getAllAsync('SELECT * FROM pedidos ORDER BY fechaPedido DESC');
    return result.map((p) => ({
      ...p,
      medicamentosSolicitados: p.medicamentosSolicitados
        ? JSON.parse(p.medicamentosSolicitados)
        : [],
      entregasRealizadas: p.entregasRealizadas ? JSON.parse(p.entregasRealizadas) : [],
    }));
  } catch (error) {
    console.error('Error en getAllPedidos:', error);
    return [];
  }
};

export const getPedidoById = async (id) => {
  await initDatabase();
  try {
    const result = await db.getFirstAsync('SELECT * FROM pedidos WHERE id = ?', [id]);
    if (result) {
      result.medicamentosSolicitados = result.medicamentosSolicitados
        ? JSON.parse(result.medicamentosSolicitados)
        : [];
      result.entregasRealizadas = result.entregasRealizadas
        ? JSON.parse(result.entregasRealizadas)
        : [];
    }
    return result;
  } catch (error) {
    console.error('Error en getPedidoById:', error);
    return null;
  }
};

export const savePedido = async (pedido, syncStatus = 'synced', pendingOp = null) => {
  await initDatabase();
  const now = new Date().toISOString();

  try {
    const exists = await getPedidoById(pedido.id);

    const data = {
      ...pedido,
      medicamentosSolicitados: JSON.stringify(pedido.medicamentosSolicitados || []),
      entregasRealizadas: JSON.stringify(pedido.entregasRealizadas || []),
    };

    if (exists) {
      await db.runAsync(
        `UPDATE pedidos SET 
          nombreSolicitante = ?, lugarResidencia = ?, telefonoContacto = ?,
          notas = ?, medicamentosSolicitados = ?, atendido = ?, entregasRealizadas = ?,
          fechaPedido = ?, fechaAtencion = ?, creadoPor = ?, atendidoPor = ?,
          updated = ?, _syncStatus = ?, _pendingOp = ?
        WHERE id = ?`,
        [
          data.nombreSolicitante,
          data.lugarResidencia || '',
          data.telefonoContacto || '',
          data.notas || '',
          data.medicamentosSolicitados,
          data.atendido ? 1 : 0,
          data.entregasRealizadas,
          data.fechaPedido || now,
          data.fechaAtencion || null,
          data.creadoPor || '',
          data.atendidoPor || '',
          now,
          syncStatus,
          pendingOp,
          pedido.id,
        ]
      );
    } else {
      await db.runAsync(
        `INSERT INTO pedidos (
          id, nombreSolicitante, lugarResidencia, telefonoContacto, notas,
          medicamentosSolicitados, atendido, entregasRealizadas, fechaPedido,
          fechaAtencion, creadoPor, atendidoPor, updated, _syncStatus, _pendingOp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          pedido.id,
          data.nombreSolicitante,
          data.lugarResidencia || '',
          data.telefonoContacto || '',
          data.notas || '',
          data.medicamentosSolicitados,
          data.atendido ? 1 : 0,
          data.entregasRealizadas,
          data.fechaPedido || now,
          data.fechaAtencion || null,
          data.creadoPor || '',
          data.atendidoPor || '',
          now,
          syncStatus,
          pendingOp,
        ]
      );
    }
    return pedido;
  } catch (error) {
    console.error('Error en savePedido:', error);
    throw error;
  }
};

export const deletePedido = async (id) => {
  await initDatabase();
  await db.runAsync('DELETE FROM pedidos WHERE id = ?', [id]);
};

// ==================== ENTREGAS ====================

export const getAllEntregas = async () => {
  await initDatabase();
  try {
    const result = await db.getAllAsync('SELECT * FROM entregas ORDER BY fechaCreacion DESC');
    return result.map((e) => ({
      ...e,
      items: e.items ? JSON.parse(e.items) : [],
    }));
  } catch (error) {
    console.error('Error en getAllEntregas:', error);
    return [];
  }
};

export const getEntregaById = async (id) => {
  await initDatabase();
  try {
    const result = await db.getFirstAsync('SELECT * FROM entregas WHERE id = ?', [id]);
    if (result && result.items) {
      result.items = JSON.parse(result.items);
    }
    return result;
  } catch (error) {
    console.error('Error en getEntregaById:', error);
    return null;
  }
};

export const saveEntrega = async (entrega, syncStatus = 'synced', pendingOp = null) => {
  await initDatabase();
  const now = new Date().toISOString();

  try {
    const exists = await getEntregaById(entrega.id);

    const data = {
      ...entrega,
      items: JSON.stringify(entrega.items || []),
    };

    if (exists) {
      await db.runAsync(
        `UPDATE entregas SET 
          destino = ?, fechaCreacion = ?, estado = ?, items = ?,
          creadoPor = ?, pedidoId = ?, notas = ?, ultimaModificacion = ?,
          updated = ?, _syncStatus = ?, _pendingOp = ?
        WHERE id = ?`,
        [
          data.destino,
          data.fechaCreacion || now,
          data.estado || 'abierta',
          data.items,
          data.creadoPor || '',
          data.pedidoId || null,
          data.notas || '',
          data.ultimaModificacion || now,
          now,
          syncStatus,
          pendingOp,
          entrega.id,
        ]
      );
    } else {
      await db.runAsync(
        `INSERT INTO entregas (
          id, destino, fechaCreacion, estado, items, creadoPor, pedidoId,
          notas, ultimaModificacion, updated, _syncStatus, _pendingOp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entrega.id,
          data.destino,
          data.fechaCreacion || now,
          data.estado || 'abierta',
          data.items,
          data.creadoPor || '',
          data.pedidoId || null,
          data.notas || '',
          data.ultimaModificacion || now,
          now,
          syncStatus,
          pendingOp,
        ]
      );
    }
    return entrega;
  } catch (error) {
    console.error('Error en saveEntrega:', error);
    throw error;
  }
};

export const deleteEntrega = async (id) => {
  await initDatabase();
  await db.runAsync('DELETE FROM entregas WHERE id = ?', [id]);
};

// ==================== USUARIOS ====================

export const getAllUsuarios = async () => {
  await initDatabase();
  try {
    return await db.getAllAsync('SELECT * FROM usuarios ORDER BY nombre');
  } catch (error) {
    console.error('Error en getAllUsuarios:', error);
    return [];
  }
};

export const getUsuarioById = async (id) => {
  await initDatabase();
  try {
    return await db.getFirstAsync('SELECT * FROM usuarios WHERE id = ?', [id]);
  } catch (error) {
    console.error('Error en getUsuarioById:', error);
    return null;
  }
};

export const saveUsuario = async (usuario, syncStatus = 'synced', pendingOp = null) => {
  await initDatabase();
  const now = new Date().toISOString();

  try {
    const exists = await getUsuarioById(usuario.id);

    if (exists) {
      await db.runAsync(
        `UPDATE usuarios SET nombre = ?, tipo = ?, updated = ?, _syncStatus = ?, _pendingOp = ? WHERE id = ?`,
        [usuario.nombre, usuario.tipo || 'user', now, syncStatus, pendingOp, usuario.id]
      );
    } else {
      await db.runAsync(
        `INSERT INTO usuarios (id, nombre, tipo, updated, _syncStatus, _pendingOp) VALUES (?, ?, ?, ?, ?, ?)`,
        [usuario.id, usuario.nombre, usuario.tipo || 'user', now, syncStatus, pendingOp]
      );
    }
    return usuario;
  } catch (error) {
    console.error('Error en saveUsuario:', error);
    throw error;
  }
};

export const deleteUsuario = async (id) => {
  await initDatabase();
  await db.runAsync('DELETE FROM usuarios WHERE id = ?', [id]);
};

// ==================== OPERACIONES PENDIENTES ====================

export const getPendingOperations = async () => {
  await initDatabase();

  const medicamentos = await db.getAllAsync(
    "SELECT *, 'medicamentos' as collection FROM medicamentos WHERE _syncStatus = 'pending'"
  );
  const pedidos = await db.getAllAsync(
    "SELECT *, 'pedidos' as collection FROM pedidos WHERE _syncStatus = 'pending'"
  );
  const entregas = await db.getAllAsync(
    "SELECT *, 'entregas' as collection FROM entregas WHERE _syncStatus = 'pending'"
  );
  const usuarios = await db.getAllAsync(
    "SELECT *, 'usuarios' as collection FROM usuarios WHERE _syncStatus = 'pending'"
  );

  return [...medicamentos, ...pedidos, ...entregas, ...usuarios];
};

export const markAsSynced = async (collection, id) => {
  await initDatabase();
  const tableMap = {
    medicamentos: 'medicamentos',
    pedidos: 'pedidos',
    entregas: 'entregas',
    usuarios: 'usuarios',
  };

  const table = tableMap[collection];
  if (table) {
    await db.runAsync(
      `UPDATE ${table} SET _syncStatus = 'synced', _pendingOp = NULL WHERE id = ?`,
      [id]
    );
  }
};

// ==================== IMPORTAR BACKUP ====================

export const importBackup = async (backupData) => {
  await initDatabase();

  console.log('📥 Importando backup a SQLite...');

  await db.execAsync('DELETE FROM medicamentos');
  await db.execAsync('DELETE FROM pedidos');
  await db.execAsync('DELETE FROM entregas');
  await db.execAsync('DELETE FROM usuarios');

  let count = { medicamentos: 0, pedidos: 0, entregas: 0, usuarios: 0 };

  if (backupData.medicamentos) {
    for (const [id, data] of Object.entries(backupData.medicamentos)) {
      await saveMedicamento({ id, ...data, updated: new Date().toISOString() }, 'synced', null);
      count.medicamentos++;
    }
    console.log(`   ✅ ${count.medicamentos} medicamentos importados`);
  }

  if (backupData.pedidos) {
    for (const [id, data] of Object.entries(backupData.pedidos)) {
      await savePedido({ id, ...data, updated: new Date().toISOString() }, 'synced', null);
      count.pedidos++;
    }
    console.log(`   ✅ ${count.pedidos} pedidos importados`);
  }

  if (backupData.entregas) {
    for (const [id, data] of Object.entries(backupData.entregas)) {
      await saveEntrega({ id, ...data, updated: new Date().toISOString() }, 'synced', null);
      count.entregas++;
    }
    console.log(`   ✅ ${count.entregas} entregas importadas`);
  }

  if (backupData.usuarios) {
    for (const [id, data] of Object.entries(backupData.usuarios)) {
      await saveUsuario({ id, ...data, updated: new Date().toISOString() }, 'synced', null);
      count.usuarios++;
    }
    console.log(`   ✅ ${count.usuarios} usuarios importados`);
  }

  console.log('🎉 Importación completada');
  return count;
};

// ==================== EXPORT DEFAULT ====================
export default {
  initDatabase,
  getDb,
  getAllMedicamentos,
  getMedicamentoById,
  saveMedicamento,
  deleteMedicamento,
  getAllPedidos,
  getPedidoById,
  savePedido,
  deletePedido,
  getAllEntregas,
  getEntregaById,
  saveEntrega,
  deleteEntrega,
  getAllUsuarios,
  getUsuarioById,
  saveUsuario,
  deleteUsuario,
  getPendingOperations,
  markAsSynced,
  importBackup,
};
