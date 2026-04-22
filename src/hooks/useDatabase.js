// hooks/useDatabase.js
import { useState, useEffect, useCallback, useRef } from 'react';
import * as SQLiteService from '../services/SQLiteService';
import * as SyncService from '../services/SyncService';
import * as OfflineQueueService from '../services/OfflineQueueService';
import { useFocusEffect } from '@react-navigation/native';

// Hook genérico para usar datos con caché local
export const useDatabase = (collection, options = {}) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offlineCount, setOfflineCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);

  const isLoadingRef = useRef(false);

  // Cargar datos locales
  const loadLocalData = useCallback(async () => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;

    try {
      let result = [];
      switch (collection) {
        case 'medicamentos':
          result = await SQLiteService.getAllMedicamentos(options.activo);
          break;
        case 'pedidos':
          result = await SQLiteService.getAllPedidos();
          break;
        case 'entregas':
          result = await SQLiteService.getAllEntregas();
          break;
        case 'usuarios':
          result = await SQLiteService.getAllUsuarios();
          break;
      }
      setData(result);
    } catch (error) {
      console.error(`Error cargando ${collection}:`, error);
    } finally {
      isLoadingRef.current = false;
      setLoading(false);
    }
  }, [collection, options.activo]);

  // Cargar datos y verificar conexión
  const loadData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      await loadLocalData();

      // Verificar conexión y contar operaciones pendientes
      const available = await SyncService.isPocketBaseAvailable();
      setIsOnline(available);

      const pendingCount = await OfflineQueueService.getPendingCount();
      setOfflineCount(pendingCount);

      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    },
    [loadLocalData]
  );

  // Sincronizar manualmente
  const sync = useCallback(
    async (onProgress) => {
      const result = await SyncService.manualSync(onProgress);
      if (result.success) {
        await loadLocalData();
        const pendingCount = await OfflineQueueService.getPendingCount();
        setOfflineCount(pendingCount);
      }
      return result;
    },
    [loadLocalData]
  );

  // Recargar al obtener foco
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Carga inicial
  useEffect(() => {
    loadData();
  }, []);

  return {
    data,
    loading,
    refreshing,
    offlineCount,
    isOnline,
    loadData,
    sync,
    setData,
  };
};

// Hook para operaciones CRUD con cola offline
export const useDatabaseOperations = (collection) => {
  const save = useCallback(
    async (record, generateId = true) => {
      const id = generateId
        ? record.id || `local_${Date.now()}_${Math.random().toString(36)}`
        : record.id;
      const recordWithId = { ...record, id };

      const isOnline = await SyncService.isPocketBaseAvailable();

      if (isOnline) {
        try {
          // Intentar guardar en el servidor
          let result;
          switch (collection) {
            case 'medicamentos':
              result = await pb.collection('medicamentos').create(recordWithId);
              break;
            // ... otros casos
          }
          // Guardar localmente como synced
          await saveLocal(recordWithId, 'synced');
          return { success: true, data: result };
        } catch (error) {
          // Fallback a offline
          console.log('Servidor no disponible, guardando offline');
          await saveLocal(recordWithId, 'pending', 'CREATE');
          await OfflineQueueService.addPendingOperation(collection, 'CREATE', id, recordWithId);
          return { success: true, offline: true, data: recordWithId };
        }
      } else {
        // Offline mode
        await saveLocal(recordWithId, 'pending', 'CREATE');
        await OfflineQueueService.addPendingOperation(collection, 'CREATE', id, recordWithId);
        return { success: true, offline: true, data: recordWithId };
      }
    },
    [collection]
  );

  const update = useCallback(
    async (id, updates) => {
      // Similar a save pero con UPDATE
    },
    [collection]
  );

  const remove = useCallback(
    async (id) => {
      // Similar a save pero con DELETE
    },
    [collection]
  );

  return { save, update, remove };
};

// Función auxiliar para guardar localmente
const saveLocal = async (record, syncStatus, pendingOp = null) => {
  // Implementar según colección
};
