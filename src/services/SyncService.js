// src/services/SyncService.js
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

// Actualizar campos (sin tocar el archivo) de un registro de backup
const patchBackupRecord = async (recordId, data) => {
  const response = await fetch(`${VPS_BASE_URL}/api/collections/backups/records/${recordId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
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
  return await response.json();
};

// Marca un registro como LOCK (alguien lo está editando ahora)
const lockBackup = async (recordId, usuario) => {
  return await patchBackupRecord(recordId, {
    estado: 'LOCK',
    usuario, // quién tiene el bloqueo AHORA (no confundir con quién subió el archivo originalmente)
    notas: `Bloqueado por ${usuario} el ${new Date().toISOString()}`,
  });
};

// Cierra un registro viejo (ya no es el más reciente ni está en edición)
const closeBackup = async (recordId) => {
  return await patchBackupRecord(recordId, { estado: 'CLOSED' });
};

// Busca si hay un registro actualmente bloqueado (alguien editando)
const getActiveLock = async () => {
  const backups = await listRemoteBackups();
  return backups.find((b) => b.estado === 'LOCK') || null;
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
    formData.append('usuario', usuario);
    formData.append('filename', nombreArchivo);

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
    // Guardar de qué backup se trata, para poder mostrarlo luego en pantalla
    try {
      await AsyncStorage.setItem(
        'ultimoBackupInfo',
        JSON.stringify({
          filename: nombreArchivo,
          subidoPor: usuario,
          fechaSubida: new Date().toISOString(),
          fechaCargadoLocal: new Date().toISOString(),
          estado: 'UNLOCK',
        })
      );
    } catch (e) {
      console.warn('No se pudo guardar la info del backup subido:', e);
    }
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

// Obtener el backup más reciente del VPS. La descarga SIEMPRE está abierta,
// sin importar si está LOCK (alguien editando) o UNLOCK (libre) — solo se
// excluyen los cerrados (CLOSED, ya superados por uno más nuevo).
export const getLatestBackup = async () => {
  const backups = await listRemoteBackups();
  const disponibles = backups.filter(
    (b) => b.file && (b.estado === 'UNLOCK' || b.estado === 'LOCK')
  );
  if (disponibles.length === 0) return null;

  disponibles.sort((a, b) => new Date(b.created) - new Date(a.created));
  return disponibles[0];
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
      // Guardar de qué backup se cargó, para poder mostrarlo luego en pantalla
      try {
        await AsyncStorage.setItem(
          'ultimoBackupInfo',
          JSON.stringify({
            filename: latestBackup.file,
            subidoPor: latestBackup.usuario || 'desconocido',
            fechaSubida: latestBackup.created,
            fechaCargadoLocal: new Date().toISOString(),
            estado: latestBackup.estado,
          })
        );
      } catch (e) {
        console.warn('No se pudo guardar la info del backup cargado:', e);
      }

      const normalizar = (n) => (n || '').trim().toLowerCase();
      const yaEsMio = latestBackup.estado === 'LOCK' && normalizar(latestBackup.usuario) === normalizar(usuario);

      if (latestBackup.estado === 'UNLOCK' || yaEsMio) {
        // Estaba libre, o ya estaba bloqueada por MÍ mismo (ej. reinstalé
        // la app y perdí el dato local, pero sigo siendo la misma persona)
        // - la tomo/reafirmo para editar. Solo yo podré subir la próxima
        // versión hasta que la suba (o hasta que un administrador libere
        // el bloqueo manualmente en PocketBase).
        try {
          await lockBackup(latestBackup.id, usuario);
          await AsyncStorage.setItem(
            'miLockActual',
            JSON.stringify({ recordId: latestBackup.id, fecha: new Date().toISOString() })
          );
          onProgress?.('🔒 Base de datos bloqueada para tu edición. Súbela cuando termines.');
        } catch (lockError) {
          console.error('No se pudo bloquear la base de datos:', lockError);
          onProgress?.(
            '⚠️ Se cargó la base de datos, pero no se pudo bloquear para tu edición. Avisa a los demás para que no editen ahora.'
          );
        }
      } else {
        // Ya estaba bloqueada por otra persona DISTINTA: esto es solo
        // lectura, no reclamamos el bloqueo. Limpiar cualquier bloqueo
        // local viejo de este dispositivo para no confundir un intento
        // de subida futuro.
        await AsyncStorage.removeItem('miLockActual');
        onProgress?.(
          '👀 Cargado en modo solo lectura: otra persona está editando la base de datos ahora mismo.'
        );
      }

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

// Devuelve la info del último backup del servidor que se cargó en este
// celular (o null si nunca se ha cargado ninguno), para mostrarla en
// pantalla y que quien usa la app sepa sobre qué datos está trabajando.
export const getUltimoBackupInfo = async () => {
  try {
    const raw = await AsyncStorage.getItem('ultimoBackupInfo');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('No se pudo leer la info del backup cargado:', e);
    return null;
  }
};

// Guardar BD en el VPS (solo si es más reciente)
export const saveToVPS = async (usuario, onProgress) => {
  try {
    onProgress?.('🔒 Verificando si hay un bloqueo activo...');
    const lockActivo = await getActiveLock();

    const normalizar = (n) => (n || '').trim().toLowerCase();
    const soyYoQuienLoTiene = lockActivo && normalizar(lockActivo.usuario) === normalizar(usuario);

    if (lockActivo && !soyYoQuienLoTiene) {
      // Hay alguien MÁS (persona distinta) editando ahora mismo
      const quien = lockActivo.usuario || 'otra persona';
      onProgress?.(
        `🔒 No se puede subir: la base de datos está bloqueada por ${quien}, que la está editando ahora mismo. Espera a que termine y suba sus cambios, o pide a un administrador que libere el bloqueo manualmente en PocketBase.`
      );
      return false;
    }

    onProgress?.('📤 Exportando base de datos local...');
    const exportPath = await exportDatabaseToFile(`temp_${Date.now()}.sql`);

    if (!exportPath) {
      onProgress?.('❌ Error al exportar la base de datos local');
      return false;
    }

    onProgress?.('☁️ Subiendo al servidor...');
    const uploaded = await uploadToVPS(exportPath, usuario);

    if (uploaded) {
      // Cerrar el registro que teníamos bloqueado (si había uno) y limpiar
      // el bloqueo local — la base recién subida queda UNLOCK, libre para
      // que cualquiera la tome después.
      if (lockActivo && soyYoQuienLoTiene) {
        try {
          await closeBackup(lockActivo.id);
        } catch (e) {
          console.warn('No se pudo cerrar el bloqueo anterior:', e);
        }
      }
      await AsyncStorage.removeItem('miLockActual');
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

// ─────────────────────────────────────────────────────────────
// TOKENS DE PUSH: van DIRECTO a PocketBase, sin pasar por el candado
// pesado de la BD completa. Es un dato chiquito y necesita estar
// fresco para que las notificaciones funcionen entre celulares -
// esperar al ciclo lento de Cargar/Salvar BD lo dejaría desactualizado
// la mayoría del tiempo.
//
// IMPORTANTE: requiere que la colección 'usuarios' en PocketBase tenga
// un campo de texto 'pushToken' (agregarlo a mano en el admin si no
// existe todavía - si no existe, estas llamadas simplemente no hacen
// nada, PocketBase ignora campos que no reconoce).
// ─────────────────────────────────────────────────────────────

// Publica el token de este celular en PocketBase, buscando el registro
// del usuario por nombre (case-insensitive)
export const publicarPushTokenEnServidor = async (nombreUsuario, pushToken) => {
  try {
    const buscar = await fetch(
      `${VPS_BASE_URL}/api/collections/usuarios/records?filter=${encodeURIComponent(
        `nombre="${nombreUsuario}"`
      )}`
    );
    if (!buscar.ok) return false;
    const data = await buscar.json();
    const registro = (data.items || [])[0];
    if (!registro) return false;

    const actualizar = await fetch(
      `${VPS_BASE_URL}/api/collections/usuarios/records/${registro.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pushToken }),
      }
    );
    return actualizar.ok;
  } catch (error) {
    console.error('Error publicando push token en servidor:', error);
    return false;
  }
};

// Trae, en vivo, los tokens de todos los admins directo de PocketBase
// (no de la copia local, que puede estar desactualizada)
export const obtenerTokensAdminsEnVivo = async () => {
  try {
    const response = await fetch(
      `${VPS_BASE_URL}/api/collections/usuarios/records?filter=${encodeURIComponent(
        `tipo="admin"`
      )}&perPage=200`
    );
    if (!response.ok) return null; // null = "no se pudo" (distinto de [] = "sin admins con token")
    const data = await response.json();
    return (data.items || []).filter((u) => u.pushToken).map((u) => u.pushToken);
  } catch (error) {
    console.error('Error obteniendo tokens de admins en vivo:', error);
    return null;
  }
};

// Publica un usuario (creado o editado en la App) directo en PocketBase,
// sin pasar por el candado pesado de la BD completa - así cualquier
// usuario nuevo (sobre todo admins) puede empezar a recibir push sin
// esperar un ciclo completo de Cargar/Salvar BD. Si ya existe (por
// nombre), lo actualiza; si no, lo crea. Requiere red - si falla, quien
// llama debe avisar que el usuario quedó pendiente de subir.
export const publicarUsuarioEnServidor = async (nombre, tipo) => {
  try {
    const buscar = await fetch(
      `${VPS_BASE_URL}/api/collections/usuarios/records?filter=${encodeURIComponent(
        `nombre="${nombre}"`
      )}`
    );
    if (!buscar.ok) return false;
    const data = await buscar.json();
    const existente = (data.items || [])[0];

    if (existente) {
      const actualizar = await fetch(
        `${VPS_BASE_URL}/api/collections/usuarios/records/${existente.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tipo }),
        }
      );
      return actualizar.ok;
    }

    const crear = await fetch(`${VPS_BASE_URL}/api/collections/usuarios/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, tipo }),
    });
    return crear.ok;
  } catch (error) {
    console.error('Error publicando usuario en servidor:', error);
    return false;
  }
};

// Elimina (por nombre) el registro de usuario en PocketBase, para que no
// quede huérfano ahí cuando se borra desde la App
export const eliminarUsuarioEnServidor = async (nombre) => {
  try {
    const buscar = await fetch(
      `${VPS_BASE_URL}/api/collections/usuarios/records?filter=${encodeURIComponent(
        `nombre="${nombre}"`
      )}`
    );
    if (!buscar.ok) return false;
    const data = await buscar.json();
    const existente = (data.items || [])[0];
    if (!existente) return true; // ya no estaba, nada que borrar

    const borrar = await fetch(
      `${VPS_BASE_URL}/api/collections/usuarios/records/${existente.id}`,
      { method: 'DELETE' }
    );
    return borrar.ok;
  } catch (error) {
    console.error('Error eliminando usuario en servidor:', error);
    return false;
  }
};
