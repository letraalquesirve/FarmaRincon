// services/SyncService.js
import { pb } from './PocketBaseConfig';
import * as SQLiteService from './SQLiteService';
import * as OfflineQueueService from './OfflineQueueService';
import { Platform } from 'react-native';

let syncInterval = null;
let isSyncing = false;

// Verificar si PocketBase está disponible
export const isPocketBaseAvailable = async () => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${pb.baseURL}/api/health`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    console.log('📡 PocketBase no disponible:', error.message);
    return false;
  }
};

// Sincronizar operaciones pendientes (local -> servidor)
const syncPendingOperations = async () => {
  const pendingOps = await OfflineQueueService.getAllPendingOperations();

  if (pendingOps.length === 0) return 0;

  console.log(`🔄 Sincronizando ${pendingOps.length} operaciones pendientes...`);
  let synced = 0;

  for (const op of pendingOps) {
    try {
      const collection = pb.collection(op.collection);

      switch (op.operation) {
        case 'CREATE':
          await collection.create(op.data);
          break;
        case 'UPDATE':
          await collection.update(op.recordId, op.data);
          break;
        case 'DELETE':
          await collection.delete(op.recordId);
          break;
      }

      await OfflineQueueService.removePendingOperation(op.id);
      synced++;
      console.log(`   ✅ Sincronizado: ${op.operation} en ${op.collection}`);
    } catch (error) {
      console.error(`   ❌ Error sincronizando ${op.operation}:`, error.message);
      await OfflineQueueService.incrementRetryCount(op.id);
    }
  }

  return synced;
};

// Descargar cambios del servidor (servidor -> local) con LWW
const syncServerToLocal = async () => {
  const collections = ['medicamentos', 'pedidos', 'entregas', 'usuarios'];
  let updated = 0;

  for (const collectionName of collections) {
    try {
      const serverRecords = await pb.collection(collectionName).getFullList({
        requestKey: null,
      });

      console.log(`📥 ${collectionName}: ${serverRecords.length} registros del servidor`);

      // Obtener registros locales
      let localRecords = [];
      switch (collectionName) {
        case 'medicamentos':
          localRecords = await SQLiteService.getAllMedicamentos();
          break;
        case 'pedidos':
          localRecords = await SQLiteService.getAllPedidos();
          break;
        case 'entregas':
          localRecords = await SQLiteService.getAllEntregas();
          break;
        case 'usuarios':
          localRecords = await SQLiteService.getAllUsuarios();
          break;
      }

      const localMap = new Map(localRecords.map((r) => [r.id, r]));

      for (const serverRecord of serverRecords) {
        const localRecord = localMap.get(serverRecord.id);
        const serverUpdated = serverRecord.updated;
        const localUpdated = localRecord?.updated;

        if (!localRecord || new Date(serverUpdated) > new Date(localUpdated)) {
          switch (collectionName) {
            case 'medicamentos':
              await SQLiteService.saveMedicamento(serverRecord, 'synced', null);
              break;
            case 'pedidos':
              await SQLiteService.savePedido(serverRecord, 'synced', null);
              break;
            case 'entregas':
              await SQLiteService.saveEntrega(serverRecord, 'synced', null);
              break;
            case 'usuarios':
              await SQLiteService.saveUsuario(serverRecord, 'synced', null);
              break;
          }
          updated++;
        }
      }
    } catch (error) {
      if (!error.isAbort) {
        console.error(`Error sincronizando ${collectionName}:`, error.message);
      }
    }
  }

  return updated;
};

// Sincronización completa
export const syncWithServer = async () => {
  if (isSyncing) {
    console.log('⏳ Sincronización en curso, omitiendo...');
    return { pending: 0, server: 0, available: true };
  }

  isSyncing = true;

  try {
    const available = await isPocketBaseAvailable();

    if (!available) {
      console.log('📡 Servidor no disponible, sincronización omitida');
      return { pending: 0, server: 0, available: false };
    }

    console.log('🔄 Iniciando sincronización con servidor...');

    const pendingSynced = await syncPendingOperations();
    const serverUpdated = await syncServerToLocal();

    console.log(
      `✅ Sincronización completada: ${pendingSynced} pendientes subidos, ${serverUpdated} del servidor`
    );

    return { pending: pendingSynced, server: serverUpdated, available: true };
  } catch (error) {
    console.error('❌ Error en sincronización:', error);
    return { pending: 0, server: 0, available: false, error: error.message };
  } finally {
    isSyncing = false;
  }
};

// Iniciar sincronización periódica
export const startPeriodicSync = (intervalMs = 30000) => {
  if (syncInterval) clearInterval(syncInterval);

  syncInterval = setInterval(async () => {
    await syncWithServer();
  }, intervalMs);

  console.log(`🔄 Sincronización periódica iniciada (cada ${intervalMs / 1000}s)`);
};

// ✅ EXPORTADA - Detener sincronización periódica
export const stopPeriodicSync = () => {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log('🛑 Sincronización periódica detenida');
  }
};

// Sincronización inicial completa
export const initialFullSync = async () => {
  console.log('📥 Sincronización inicial completa...');

  try {
    await pb.admins.authWithPassword('geovanis.pantoja@letraalquesirve.org', 'vpsElyon8888*');
    console.log('✅ Autenticado para sync inicial');
  } catch (error) {
    console.error('❌ Error autenticando para sync:', error.message);
    return;
  }

  const collections = ['medicamentos', 'pedidos', 'entregas', 'usuarios'];

  for (const collectionName of collections) {
    try {
      const records = await pb.collection(collectionName).getFullList({
        sort: 'created',
        requestKey: null,
      });

      console.log(`   📥 ${collectionName}: ${records.length} registros`);

      for (const record of records) {
        switch (collectionName) {
          case 'medicamentos':
            await SQLiteService.saveMedicamento(record, 'synced', null);
            break;
          case 'pedidos':
            await SQLiteService.savePedido(record, 'synced', null);
            break;
          case 'entregas':
            await SQLiteService.saveEntrega(record, 'synced', null);
            break;
          case 'usuarios':
            await SQLiteService.saveUsuario(record, 'synced', null);
            break;
        }
      }
      console.log(`   ✅ ${records.length} ${collectionName} sincronizados`);
    } catch (error) {
      console.error(`Error en sync inicial de ${collectionName}:`, error.message);
    }
  }

  console.log('🎉 Sincronización inicial completada');
};

// Sincronización manual (para pull-to-refresh)
export const manualSync = async (onProgress) => {
  onProgress?.('Verificando conexión...');
  const available = await isPocketBaseAvailable();

  if (!available) {
    onProgress?.('Sin conexión al servidor');
    return { success: false, message: 'Servidor no disponible' };
  }

  onProgress?.('Sincronizando datos...');
  const result = await syncWithServer();

  if (result.pending > 0 || result.server > 0) {
    onProgress?.(`Sincronizado: ${result.pending} subidos, ${result.server} descargados`);
  } else {
    onProgress?.('Todo está sincronizado');
  }

  return { success: true, ...result };
};
