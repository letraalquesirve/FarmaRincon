// services/OfflineQueueService.js
import * as SQLite from 'expo-sqlite';
import { getDb, initDatabase } from './SQLiteService';

// Cola de operaciones pendientes (estructura separada para fácil gestión)
let queueDb = null;

export const initQueueDatabase = async () => {
  if (queueDb) return queueDb;

  queueDb = await SQLite.openDatabaseAsync('queue.db');

  await queueDb.execAsync(`
    CREATE TABLE IF NOT EXISTS pending_operations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collection TEXT NOT NULL,
      operation TEXT NOT NULL,
      recordId TEXT,
      data TEXT,
      timestamp TEXT NOT NULL,
      retryCount INTEGER DEFAULT 0
    );
    
    CREATE INDEX IF NOT EXISTS idx_pending_timestamp ON pending_operations(timestamp);
  `);

  return queueDb;
};

// Agregar operación pendiente
export const addPendingOperation = async (collection, operation, recordId, data) => {
  const db = await initQueueDatabase();
  const timestamp = new Date().toISOString();

  const result = await db.runAsync(
    `INSERT INTO pending_operations (collection, operation, recordId, data, timestamp)
     VALUES (?, ?, ?, ?, ?)`,
    [collection, operation, recordId, JSON.stringify(data), timestamp]
  );

  console.log(`📝 Operación pendiente agregada: ${operation} en ${collection}`);
  return result.lastInsertRowId;
};

// Obtener todas las operaciones pendientes
export const getAllPendingOperations = async () => {
  const db = await initQueueDatabase();
  const operations = await db.getAllAsync(
    'SELECT * FROM pending_operations ORDER BY timestamp ASC'
  );

  return operations.map((op) => ({
    ...op,
    data: JSON.parse(op.data),
  }));
};

// Eliminar operación pendiente
export const removePendingOperation = async (id) => {
  const db = await initQueueDatabase();
  await db.runAsync('DELETE FROM pending_operations WHERE id = ?', [id]);
};

// Incrementar contador de reintentos
export const incrementRetryCount = async (id) => {
  const db = await initQueueDatabase();
  await db.runAsync('UPDATE pending_operations SET retryCount = retryCount + 1 WHERE id = ?', [id]);
};

// Limpiar operaciones antiguas (más de 7 días)
export const cleanOldPendingOperations = async () => {
  const db = await initQueueDatabase();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  await db.runAsync('DELETE FROM pending_operations WHERE timestamp < ?', [
    sevenDaysAgo.toISOString(),
  ]);
};

// Obtener cantidad de operaciones pendientes
export const getPendingCount = async () => {
  const db = await initQueueDatabase();
  const result = await db.getFirstAsync('SELECT COUNT(*) as count FROM pending_operations');
  return result?.count || 0;
};
