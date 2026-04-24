// src/utils/migrations.js
import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabaseSync('farmacia.db');

/**
 * Ejecuta una migración de manera segura
 */
const runMigration = async (sql, description) => {
  try {
    await db.execAsync(sql);
    console.log(`✅ ${description}`);
    return true;
  } catch (error) {
    // Si el error es "duplicate column", ignoramos (ya existe)
    if (error.message?.includes('duplicate column') || error.message?.includes('already exists')) {
      console.log(`⚠️ ${description} - ya existía, omitiendo`);
      return true;
    }
    console.error(`❌ Error en ${description}:`, error.message);
    return false;
  }
};

/**
 * Verifica qué columnas existen en una tabla
 */
const getTableColumns = async (tableName) => {
  try {
    const result = await db.getAllAsync(`PRAGMA table_info(${tableName})`);
    return result.map((col) => col.name);
  } catch (error) {
    console.error(`Error obteniendo columnas de ${tableName}:`, error);
    return [];
  }
};

/**
 * Migración principal: Agregar columna 'updated' a todas las tablas
 */
const addUpdatedColumn = async (tableName) => {
  const columns = await getTableColumns(tableName);

  if (!columns.includes('updated')) {
    return runMigration(
      `ALTER TABLE ${tableName} ADD COLUMN updated TEXT DEFAULT CURRENT_TIMESTAMP;`,
      `Agregar columna 'updated' a tabla ${tableName}`
    );
  } else {
    console.log(`ℹ️ Tabla ${tableName} ya tiene columna 'updated'`);
    return true;
  }
};

/**
 * Migración principal: Agregar columna 'deleted' (para soft delete)
 */
const addDeletedColumn = async (tableName) => {
  const columns = await getTableColumns(tableName);

  if (!columns.includes('deleted')) {
    return runMigration(
      `ALTER TABLE ${tableName} ADD COLUMN deleted INTEGER DEFAULT 0;`,
      `Agregar columna 'deleted' a tabla ${tableName}`
    );
  } else {
    console.log(`ℹ️ Tabla ${tableName} ya tiene columna 'deleted'`);
    return true;
  }
};

/**
 * Crear índices para mejorar rendimiento de sincronización
 */
const createIndexes = async () => {
  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_medicamentos_updated ON medicamentos(updated);`,
    `CREATE INDEX IF NOT EXISTS idx_pedidos_updated ON pedidos(updated);`,
    `CREATE INDEX IF NOT EXISTS idx_entregas_updated ON entregas(updated);`,
    `CREATE INDEX IF NOT EXISTS idx_usuarios_updated ON usuarios(updated);`,
    `CREATE INDEX IF NOT EXISTS idx_medicamentos_deleted ON medicamentos(deleted);`,
    `CREATE INDEX IF NOT EXISTS idx_pedidos_deleted ON pedidos(deleted);`,
    `CREATE INDEX IF NOT EXISTS idx_entregas_deleted ON entregas(deleted);`,
    `CREATE INDEX IF NOT EXISTS idx_usuarios_deleted ON usuarios(deleted);`,
  ];

  for (const sql of indexes) {
    await runMigration(sql, `Índice: ${sql.split('ON')[1]?.split('(')[0]?.trim() || 'creado'}`);
  }
};

/**
 * Sincronizar estructura de tablas con PocketBase
 * Asegura que las columnas locales coincidan con las del servidor
 */
const syncTableSchema = async () => {
  console.log('🔄 Verificando estructura de tablas...');

  // Lista completa de tablas
  const tables = ['medicamentos', 'pedidos', 'entregas', 'usuarios'];

  for (const table of tables) {
    await addUpdatedColumn(table);
    await addDeletedColumn(table);
  }

  await createIndexes();
  console.log('✅ Estructura de tablas verificada');
};

/**
 * Verificar estado actual de las tablas (debug)
 */
const checkTablesStatus = async () => {
  console.log('\n📊 Estado actual de las tablas:');
  const tables = ['medicamentos', 'pedidos', 'entregas', 'usuarios'];

  for (const table of tables) {
    const columns = await getTableColumns(table);
    console.log(`   ${table}: [${columns.join(', ')}]`);

    // Contar registros
    try {
      const count = await db.getFirstAsync(`SELECT COUNT(*) as total FROM ${table}`);
      console.log(`      Registros: ${count?.total || 0}`);
    } catch (e) {
      console.log(`      Tabla no existe o error al contar`);
    }
  }
  console.log('');
};

/**
 * Migración completa
 */
export const runMigrations = async () => {
  console.log('🚀 Iniciando migraciones...\n');

  try {
    await syncTableSchema();
    await checkTablesStatus();
    console.log('🎉 Migraciones completadas exitosamente');
    return true;
  } catch (error) {
    console.error('💥 Error en migraciones:', error);
    return false;
  }
};

// Exportar funciones individuales para uso específico
export { addUpdatedColumn, addDeletedColumn, getTableColumns, checkTablesStatus };
