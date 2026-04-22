// services/SQLiteService.js
import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';

let db = null;

// Inicializar base de datos
export const initDatabase = async () => {
  if (db) return db;

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
      updatedAt TEXT,
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
      updatedAt TEXT,
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
      updatedAt TEXT,
      _syncStatus TEXT DEFAULT 'synced',
      _pendingOp TEXT
    );

    -- Tabla de usuarios
    CREATE TABLE IF NOT EXISTS usuarios (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      tipo TEXT DEFAULT 'user',
      updatedAt TEXT,
      _syncStatus TEXT DEFAULT 'synced',
      _pendingOp TEXT
    );

    -- Índices para mejorar rendimiento
    CREATE INDEX IF NOT EXISTS idx_medicamentos_nombre ON medicamentos(nombre);
    CREATE INDEX IF NOT EXISTS idx_medicamentos_activo ON medicamentos(activo);
    CREATE INDEX IF NOT EXISTS idx_pedidos_atendido ON pedidos(atendido);
    CREATE INDEX IF NOT EXISTS idx_entregas_estado ON entregas(estado);
    CREATE INDEX IF NOT EXISTS idx_entregas_pedidoId ON entregas(pedidoId);
  `);

  console.log('✅ Base de datos SQLite inicializada');
  return db;
};

// Obtener instancia de la BD
export const getDb = () => db;

// ==================== MEDICAMENTOS ====================

export const getAllMedicamentos = async (activo = null) => {
  const dbInstance = await initDatabase();
  let query = 'SELECT * FROM medicamentos';
  const params = [];

  if (activo !== null) {
    query += ' WHERE activo = ?';
    params.push(activo ? 1 : 0);
  }

  query += ' ORDER BY nombre';

  const result = await dbInstance.getAllAsync(query, params);
  return result;
};

export const getMedicamentoById = async (id) => {
  const dbInstance = await initDatabase();
  const result = await dbInstance.getFirstAsync('SELECT * FROM medicamentos WHERE id = ?', [id]);
  return result;
};

export const saveMedicamento = async (medicamento, syncStatus = 'synced', pendingOp = null) => {
  const dbInstance = await initDatabase();
  const now = new Date().toISOString();

  const exists = await getMedicamentoById(medicamento.id);

  if (exists) {
    // Actualizar
    await dbInstance.runAsync(
      `UPDATE medicamentos SET 
        nombre = ?, presentacion = ?, categoria = ?, cantidad = ?, 
        vencimiento = ?, imagen = ?, fechaRegistro = ?, activo = ?, 
        fechaBaja = ?, userName = ?, userId = ?, ubicacion = ?,
        updatedAt = ?, _syncStatus = ?, _pendingOp = ?
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
    // Insertar
    await dbInstance.runAsync(
      `INSERT INTO medicamentos (
        id, nombre, presentacion, categoria, cantidad, vencimiento, imagen,
        fechaRegistro, activo, fechaBaja, userName, userId, ubicacion,
        updatedAt, _syncStatus, _pendingOp
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
};

export const deleteMedicamento = async (id) => {
  const dbInstance = await initDatabase();
  await dbInstance.runAsync('DELETE FROM medicamentos WHERE id = ?', [id]);
};

// ==================== PEDIDOS ====================

export const getAllPedidos = async () => {
  const dbInstance = await initDatabase();
  const result = await dbInstance.getAllAsync('SELECT * FROM pedidos ORDER BY fechaPedido DESC');

  // Parsear campos JSON
  return result.map((p) => ({
    ...p,
    medicamentosSolicitados: p.medicamentosSolicitados ? JSON.parse(p.medicamentosSolicitados) : [],
    entregasRealizadas: p.entregasRealizadas ? JSON.parse(p.entregasRealizadas) : [],
  }));
};

export const getPedidoById = async (id) => {
  const dbInstance = await initDatabase();
  const result = await dbInstance.getFirstAsync('SELECT * FROM pedidos WHERE id = ?', [id]);
  if (result) {
    result.medicamentosSolicitados = result.medicamentosSolicitados
      ? JSON.parse(result.medicamentosSolicitados)
      : [];
    result.entregasRealizadas = result.entregasRealizadas
      ? JSON.parse(result.entregasRealizadas)
      : [];
  }
  return result;
};

export const savePedido = async (pedido, syncStatus = 'synced', pendingOp = null) => {
  const dbInstance = await initDatabase();
  const now = new Date().toISOString();

  const exists = await getPedidoById(pedido.id);

  const data = {
    ...pedido,
    medicamentosSolicitados: JSON.stringify(pedido.medicamentosSolicitados || []),
    entregasRealizadas: JSON.stringify(pedido.entregasRealizadas || []),
  };

  if (exists) {
    await dbInstance.runAsync(
      `UPDATE pedidos SET 
        nombreSolicitante = ?, lugarResidencia = ?, telefonoContacto = ?,
        notas = ?, medicamentosSolicitados = ?, atendido = ?, entregasRealizadas = ?,
        fechaPedido = ?, fechaAtencion = ?, creadoPor = ?, atendidoPor = ?,
        updatedAt = ?, _syncStatus = ?, _pendingOp = ?
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
    await dbInstance.runAsync(
      `INSERT INTO pedidos (
        id, nombreSolicitante, lugarResidencia, telefonoContacto, notas,
        medicamentosSolicitados, atendido, entregasRealizadas, fechaPedido,
        fechaAtencion, creadoPor, atendidoPor, updatedAt, _syncStatus, _pendingOp
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
};

export const deletePedido = async (id) => {
  const dbInstance = await initDatabase();
  await dbInstance.runAsync('DELETE FROM pedidos WHERE id = ?', [id]);
};

// ==================== ENTREGAS ====================

export const getAllEntregas = async () => {
  const dbInstance = await initDatabase();
  const result = await dbInstance.getAllAsync('SELECT * FROM entregas ORDER BY fechaCreacion DESC');

  return result.map((e) => ({
    ...e,
    items: e.items ? JSON.parse(e.items) : [],
  }));
};

export const getEntregaById = async (id) => {
  const dbInstance = await initDatabase();
  const result = await dbInstance.getFirstAsync('SELECT * FROM entregas WHERE id = ?', [id]);
  if (result && result.items) {
    result.items = JSON.parse(result.items);
  }
  return result;
};

export const saveEntrega = async (entrega, syncStatus = 'synced', pendingOp = null) => {
  const dbInstance = await initDatabase();
  const now = new Date().toISOString();

  const exists = await getEntregaById(entrega.id);

  const data = {
    ...entrega,
    items: JSON.stringify(entrega.items || []),
  };

  if (exists) {
    await dbInstance.runAsync(
      `UPDATE entregas SET 
        destino = ?, fechaCreacion = ?, estado = ?, items = ?,
        creadoPor = ?, pedidoId = ?, notas = ?, ultimaModificacion = ?,
        updatedAt = ?, _syncStatus = ?, _pendingOp = ?
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
    await dbInstance.runAsync(
      `INSERT INTO entregas (
        id, destino, fechaCreacion, estado, items, creadoPor, pedidoId,
        notas, ultimaModificacion, updatedAt, _syncStatus, _pendingOp
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
};

export const deleteEntrega = async (id) => {
  const dbInstance = await initDatabase();
  await dbInstance.runAsync('DELETE FROM entregas WHERE id = ?', [id]);
};

// ==================== USUARIOS ====================

export const getAllUsuarios = async () => {
  const dbInstance = await initDatabase();
  return await dbInstance.getAllAsync('SELECT * FROM usuarios ORDER BY nombre');
};

export const getUsuarioById = async (id) => {
  const dbInstance = await initDatabase();
  return await dbInstance.getFirstAsync('SELECT * FROM usuarios WHERE id = ?', [id]);
};

export const saveUsuario = async (usuario, syncStatus = 'synced', pendingOp = null) => {
  const dbInstance = await initDatabase();
  const now = new Date().toISOString();

  const exists = await getUsuarioById(usuario.id);

  if (exists) {
    await dbInstance.runAsync(
      `UPDATE usuarios SET nombre = ?, tipo = ?, updatedAt = ?, _syncStatus = ?, _pendingOp = ? WHERE id = ?`,
      [usuario.nombre, usuario.tipo || 'user', now, syncStatus, pendingOp, usuario.id]
    );
  } else {
    await dbInstance.runAsync(
      `INSERT INTO usuarios (id, nombre, tipo, updatedAt, _syncStatus, _pendingOp) VALUES (?, ?, ?, ?, ?, ?)`,
      [usuario.id, usuario.nombre, usuario.tipo || 'user', now, syncStatus, pendingOp]
    );
  }

  return usuario;
};

export const deleteUsuario = async (id) => {
  const dbInstance = await initDatabase();
  await dbInstance.runAsync('DELETE FROM usuarios WHERE id = ?', [id]);
};

// ==================== OPERACIONES PENDIENTES ====================

export const getPendingOperations = async () => {
  const dbInstance = await initDatabase();

  const medicamentos = await dbInstance.getAllAsync(
    "SELECT *, 'medicamentos' as collection FROM medicamentos WHERE _syncStatus = 'pending'"
  );
  const pedidos = await dbInstance.getAllAsync(
    "SELECT *, 'pedidos' as collection FROM pedidos WHERE _syncStatus = 'pending'"
  );
  const entregas = await dbInstance.getAllAsync(
    "SELECT *, 'entregas' as collection FROM entregas WHERE _syncStatus = 'pending'"
  );
  const usuarios = await dbInstance.getAllAsync(
    "SELECT *, 'usuarios' as collection FROM usuarios WHERE _syncStatus = 'pending'"
  );

  return [...medicamentos, ...pedidos, ...entregas, ...usuarios];
};

export const markAsSynced = async (collection, id) => {
  const dbInstance = await initDatabase();
  const tableMap = {
    medicamentos: 'medicamentos',
    pedidos: 'pedidos',
    entregas: 'entregas',
    usuarios: 'usuarios',
  };

  const table = tableMap[collection];
  if (table) {
    await dbInstance.runAsync(
      `UPDATE ${table} SET _syncStatus = 'synced', _pendingOp = NULL WHERE id = ?`,
      [id]
    );
  }
};

// ==================== IMPORTAR BACKUP ====================

export const importBackup = async (backupData) => {
  const dbInstance = await initDatabase();

  console.log('📥 Importando backup a SQLite...');

  // Limpiar tablas existentes
  await dbInstance.execAsync('DELETE FROM medicamentos');
  await dbInstance.execAsync('DELETE FROM pedidos');
  await dbInstance.execAsync('DELETE FROM entregas');
  await dbInstance.execAsync('DELETE FROM usuarios');

  let count = { medicamentos: 0, pedidos: 0, entregas: 0, usuarios: 0 };

  // Importar medicamentos
  if (backupData.medicamentos) {
    for (const [id, data] of Object.entries(backupData.medicamentos)) {
      await saveMedicamento(
        {
          id,
          ...data,
          updatedAt: new Date().toISOString(),
        },
        'synced',
        null
      );
      count.medicamentos++;
    }
    console.log(`   ✅ ${count.medicamentos} medicamentos importados`);
  }

  // Importar pedidos
  if (backupData.pedidos) {
    for (const [id, data] of Object.entries(backupData.pedidos)) {
      await savePedido(
        {
          id,
          ...data,
          updatedAt: new Date().toISOString(),
        },
        'synced',
        null
      );
      count.pedidos++;
    }
    console.log(`   ✅ ${count.pedidos} pedidos importados`);
  }

  // Importar entregas
  if (backupData.entregas) {
    for (const [id, data] of Object.entries(backupData.entregas)) {
      await saveEntrega(
        {
          id,
          ...data,
          updatedAt: new Date().toISOString(),
        },
        'synced',
        null
      );
      count.entregas++;
    }
    console.log(`   ✅ ${count.entregas} entregas importadas`);
  }

  // Importar usuarios
  if (backupData.usuarios) {
    for (const [id, data] of Object.entries(backupData.usuarios)) {
      await saveUsuario(
        {
          id,
          ...data,
          updatedAt: new Date().toISOString(),
        },
        'synced',
        null
      );
      count.usuarios++;
    }
    console.log(`   ✅ ${count.usuarios} usuarios importados`);
  }

  console.log('🎉 Importación completada');
  return count;
};
