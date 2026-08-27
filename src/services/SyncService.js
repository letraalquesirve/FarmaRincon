// src/services/SyncService.js
import * as FileSystem from 'expo-file-system/legacy';
import { exportDatabaseToFile, importDatabaseFromFile, checkTablesStatus } from './SQLiteService';

// Configuración
const VPS_BASE_URL = 'https://gp.letraalquesirve.org';
const BASE_FILENAME = 'BDSQLite';

// ─────────────────────────────────────────────────────────────
// UTILIDADES DE NOMBRES DE ARCHIVO
// ─────────────────────────────────────────────────────────────

// Generar nombre de archivo con formato: ESTADO-BDSQLite-YYYY-MM-DD-HH-MM-USUARIO.sql
const generarNombreArchivo = (estado, usuario) => {
  const ahora = new Date();
  const año = ahora.getFullYear();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  const hora = String(ahora.getHours()).padStart(2, '0');
  const minuto = String(ahora.getMinutes()).padStart(2, '0');
  const fechaStr = `${año}-${mes}-${dia}-${hora}-${minuto}`;
  return `${estado}-${BASE_FILENAME}-${fechaStr}-${usuario}.sql`;
};

// Parsear nombre de archivo para extraer información
export const parseNombreArchivo = (filename) => {
  const parts = filename.split('-');
  if (parts.length < 7) return null;

  return {
    estado: parts[0], // LOCK o UNLOCK
    fecha: `${parts[2]}-${parts[3]}-${parts[4]}-${parts[5]}-${parts[6]}`.replace('.sql', ''),
    usuario: parts[7]?.replace('.sql', '') || 'unknown',
    nombreCompleto: filename,
  };
};

// ─────────────────────────────────────────────────────────────
// OPERACIONES CON EL VPS
// ─────────────────────────────────────────────────────────────

// Obtener lista de archivos de backup en el VPS
const listRemoteBackups = async () => {
  // Como PocketBase no tiene un endpoint de listado directo,
  // usamos un endpoint público o una colección dedicada
  try {
    const response = await fetch(`${VPS_BASE_URL}/api/collections/backups/records?sort=-created`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error('Error listando backups remotos:', error);
    return [];
  }
};

// Subir archivo al VPS
export const uploadToVPS = async (localUri, usuario) => {
  try {
    const nombreArchivo = generarNombreArchivo('UNLOCK', usuario);

    let tamanoBytes = 0;
    try {
      const info = await FileSystem.getInfoAsync(localUri);
      tamanoBytes = info.size || 0;
    } catch (e) {
      console.warn('No se pudo calcular el tamaño del archivo:', e);
    }

    const formData = new FormData();
    formData.append('file', {
      uri: localUri,
      name: nombreArchivo,
      type: 'application/sql',
    });
    // Campos reales de la colección 'backups' en PocketBase
    formData.append('estado', 'UNLOCK');
    formData.append('tamano_bytes', String(tamanoBytes));
    formData.append('notas', `Subido por ${usuario} el ${new Date().toISOString()}`);

    const response = await fetch(`${VPS_BASE_URL}/api/collections/backups/records`, {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    if (!response.ok) {
      let detalle = '';
      try {
        detalle = await response.text();
      } catch (e) {
        // sin cuerpo legible
      }
      throw new Error(`HTTP ${response.status}: ${detalle}`);
    }
    const result = await response.json();
    console.log('✅ Backup subido al VPS:', result);
    return true;
  } catch (error) {
    console.error('❌ Error subiendo backup al VPS:', error);
    throw error; // re-lanzar para que saveToVPS pueda mostrar el motivo real
  }
};

// Descargar archivo del VPS
export const downloadFromVPS = async (fileUrl) => {
  try {
    const localPath = `${FileSystem.documentDirectory}downloaded_backup.sql`;
    await FileSystem.deleteAsync(localPath, { idempotent: true });
    const downloadResult = await FileSystem.downloadAsync(fileUrl, localPath);

    if (downloadResult.status === 200) {
      console.log('✅ Backup descargado del VPS:', localPath);
      return localPath;
    }
    throw new Error(`HTTP ${downloadResult.status}`);
  } catch (error) {
    console.error('❌ Error descargando backup del VPS:', error);
    return null;
  }
};

// Obtener el backup más reciente del VPS (UNLOCK), usando el campo real 'estado'
export const getLatestBackup = async () => {
  const backups = await listRemoteBackups();
  const unlockBackups = backups.filter((b) => b.estado === 'UNLOCK' && b.file);
  if (unlockBackups.length === 0) return null;

  // Ordenar por fecha de subida (más reciente primero)
  unlockBackups.sort((a, b) => new Date(b.created) - new Date(a.created));
  return unlockBackups[0];
};

// ─────────────────────────────────────────────────────────────
// Sincronización completa
// ─────────────────────────────────────────────────────────────

// Cargar BD desde el VPS (sobrescribe la local)
export const loadFromVPS = async (usuario, onProgress) => {
  try {
    onProgress?.('🔍 Buscando último backup en el servidor...');
    const latestBackup = await getLatestBackup();

    if (!latestBackup) {
      onProgress?.('⚠️ No hay backups disponibles en el servidor');
      return false;
    }

    onProgress?.(`📥 Descargando: ${latestBackup.file}...`);
    const fileUrl = `${VPS_BASE_URL}/api/files/backups/${latestBackup.id}/${latestBackup.file}`;
    const localPath = await downloadFromVPS(fileUrl);

    if (!localPath) {
      onProgress?.('❌ Error al descargar el backup');
      return false;
    }

    onProgress?.('💾 Importando base de datos...');
    const imported = await importDatabaseFromFile(localPath);

    if (imported) {
      onProgress?.('✅ Base de datos restaurada exitosamente');
      return true;
    }

    onProgress?.('❌ Error al importar la base de datos');
    return false;
  } catch (error) {
    console.error('Error en loadFromVPS:', error);
    onProgress?.(`❌ Error: ${error.message}`);
    return false;
  }
};

// Guardar BD en el VPS (solo si es más reciente)
export const saveToVPS = async (usuario, onProgress) => {
  try {
    onProgress?.('📤 Exportando base de datos local...');
    const exportPath = await exportDatabaseToFile(`temp_${Date.now()}.sql`);

    if (!exportPath) {
      onProgress?.('❌ Error al exportar la base de datos local');
      return false;
    }

    onProgress?.('☁️ Subiendo al servidor...');
    const uploaded = await uploadToVPS(exportPath, usuario);

    if (uploaded) {
      onProgress?.('✅ Base de datos guardada en el servidor');
      return true;
    }

    onProgress?.('❌ Error al subir al servidor');
    return false;
  } catch (error) {
    console.error('Error en saveToVPS:', error);
    onProgress?.(`❌ Error: ${error.message}`);
    return false;
  }
};

// Verificar si la BD local tiene datos
export const hasLocalData = async () => {
  const status = await checkTablesStatus();
  const totalRecords = Object.values(status).reduce((a, b) => a + b, 0);
  return totalRecords > 0;
};
