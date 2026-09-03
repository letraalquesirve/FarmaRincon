// src/services/AdminNotificationService.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  registerForPushNotifications,
  sendPushNotification,
} from './NotificationService';
import { usuariosList, usuarioUpdate, entregasList, medicamentosList } from './LocalDataService';
import { publicarPushTokenEnServidor, obtenerTokensAdminsEnVivo } from './SyncService';
import { getDaysUntilExpiry } from '../utils/dateUtils';

const CLAVE_COLA_PENDIENTE = 'colaNotificacionesPendientes';
const CLAVE_ULTIMO_CHEQUEO_DIARIO = 'ultimoChequeoDiarioNotificaciones';
const DIAS_PARA_VENCER = 30; // mismo umbral que ya usa Inicio para "Por Vencer"

// ─────────────────────────────────────────────────────────────
// REGISTRO DEL TOKEN DE ESTE CELULAR
// ─────────────────────────────────────────────────────────────

// Registra (o refresca) el token de push de este dispositivo y lo guarda
// en el registro local del usuario logueado. Sirve para cualquier usuario
// (no solo admin) - el filtrado de a quién se le avisa ocurre al enviar.
export const registrarPushTokenUsuarioActual = async (usuario) => {
  if (!usuario?.id) return;
  try {
    const token = await registerForPushNotifications();
    if (!token) return;
    if (token !== usuario.pushToken) {
      await usuarioUpdate(usuario.id, { pushToken: token });
    }
    // Siempre publica en vivo (no solo cuando cambió localmente), porque
    // el registro en PocketBase puede seguir teniendo uno viejo o ninguno
    // aunque este celular ya lo tuviera guardado de antes.
    await publicarPushTokenEnServidor(usuario.nombre, token);
  } catch (error) {
    console.error('Error registrando token de push:', error);
  }
};

// ─────────────────────────────────────────────────────────────
// COLA DE REINTENTO (para cuando no hay red al momento de avisar)
// ─────────────────────────────────────────────────────────────

const leerCola = async () => {
  try {
    const raw = await AsyncStorage.getItem(CLAVE_COLA_PENDIENTE);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error('Error leyendo cola de notificaciones:', error);
    return [];
  }
};

const guardarCola = async (cola) => {
  try {
    await AsyncStorage.setItem(CLAVE_COLA_PENDIENTE, JSON.stringify(cola));
  } catch (error) {
    console.error('Error guardando cola de notificaciones:', error);
  }
};

// Intenta mandar un push a un token específico. Devuelve true si Expo lo
// aceptó (esto NO garantiza que ya llegó al teléfono, solo que Expo lo
// recibió para procesarlo - suficiente para saber que había red).
const intentarEnviar = async (item) => {
  try {
    const resultado = await sendPushNotification(item.pushToken, item.title, item.body, item.data);
    // Un fetch que sí completó (con o sin red real) devuelve un objeto;
    // si de verdad no hubo red, sendPushNotification captura la excepción
    // y devuelve null - eso es lo que tratamos como "reintentar después".
    return !!resultado;
  } catch (error) {
    return false;
  }
};

// Agrega un ítem a la cola de pendientes (para reintentar más tarde)
const agregarAColaPendiente = async (item) => {
  const cola = await leerCola();
  cola.push({ ...item, id: item.id || `${Date.now()}_${Math.random()}` });
  await guardarCola(cola);
};

// Intenta vaciar la cola de pendientes - se llama al abrir la app y cada
// vez que vuelve a primer plano. Los que sigan fallando se quedan en la
// cola para el próximo intento; mientras la app esté abierta.
export const procesarColaPendiente = async () => {
  const cola = await leerCola();
  if (cola.length === 0) return;

  const siguenPendientes = [];
  for (const item of cola) {
    const ok = await intentarEnviar(item);
    if (!ok) siguenPendientes.push(item);
  }

  await guardarCola(siguenPendientes);
  if (siguenPendientes.length < cola.length) {
    console.log(
      `📤 Cola de notificaciones: ${cola.length - siguenPendientes.length} enviada(s), ${siguenPendientes.length} pendiente(s)`
    );
  }
};

// Envía a una lista de tokens; el que falle se guarda en la cola (no toda
// la tanda - solo los destinatarios que de verdad no se pudieron alcanzar)
const enviarATokens = async (tokens, title, body, data) => {
  for (const pushToken of tokens) {
    const item = { pushToken, title, body, data };
    const ok = await intentarEnviar(item);
    if (!ok) await agregarAColaPendiente(item);
  }
};

const obtenerTokensAdmins = async () => {
  // Intenta primero en vivo directo de PocketBase (siempre actualizado,
  // no depende de que alguien haya hecho un ciclo completo de sincronía).
  // Si no hay red o falla, cae a la copia local como mejor esfuerzo.
  const enVivo = await obtenerTokensAdminsEnVivo();
  if (enVivo !== null) return enVivo;

  const usuarios = await usuariosList();
  return usuarios
    .filter((u) => u.tipo === 'admin' && u.pushToken)
    .map((u) => u.pushToken);
};

// ─────────────────────────────────────────────────────────────
// 1. NUEVO PEDIDO (inmediato)
// ─────────────────────────────────────────────────────────────

export const notificarNuevoPedido = async (pedido) => {
  try {
    const tokens = await obtenerTokensAdmins();
    if (tokens.length === 0) return;

    const items = (pedido.medicamentosSolicitados || [])
      .map((m) => `${m.nombre}${m.cantidad ? ` x${m.cantidad}` : ''}`)
      .join(', ');

    const body = `${pedido.nombreSolicitante} pide: ${items}`;

    await enviarATokens(tokens, 'Pedido nuevo', body, {
      tipo: 'pedido',
      pedidoId: pedido.id,
    });
  } catch (error) {
    console.error('Error notificando nuevo pedido:', error);
  }
};

// ─────────────────────────────────────────────────────────────
// 2 y 3. CHEQUEO DIARIO: VENCIMIENTOS + SEGUIMIENTO DE ENTREGAS
// ─────────────────────────────────────────────────────────────

const yaSeChecoHoy = async () => {
  const hoy = new Date().toISOString().split('T')[0];
  const ultimo = await AsyncStorage.getItem(CLAVE_ULTIMO_CHEQUEO_DIARIO);
  return ultimo === hoy;
};

const marcarChequeadoHoy = async () => {
  const hoy = new Date().toISOString().split('T')[0];
  await AsyncStorage.setItem(CLAVE_ULTIMO_CHEQUEO_DIARIO, hoy);
};

// Aviso de seguimiento de UNA entrega puntual - reutilizado tanto por el
// chequeo diario en lote como por el aviso inmediato al activar el switch.
export const notificarSeguimientoEntrega = async (entrega) => {
  try {
    const tokens = await obtenerTokensAdmins();
    if (tokens.length === 0) return;

    const body = `Entrega Medicinas a ${entrega.destino} recordar ${entrega.notas || ''}`;
    await enviarATokens(tokens, 'Seguimiento de entrega', body, {
      tipo: 'seguimiento',
      entregaId: entrega.id,
    });
  } catch (error) {
    console.error('Error notificando seguimiento de entrega:', error);
  }
};

export const ejecutarChequeoDiario = async () => {
  const resumen = { porVencer: [], seguimiento: [], tokensDisponibles: 0 };
  try {
    if (await yaSeChecoHoy()) return resumen;

    const tokens = await obtenerTokensAdmins();
    resumen.tokensDisponibles = tokens.length;
    // Igual marcamos el día como chequeado aunque no haya admins con token
    // todavía - evita que se repita el intento de armar las listas cada
    // vez que se abra la app el mismo día.
    await marcarChequeadoHoy();
    if (tokens.length === 0) return resumen;

    // ── Vencimientos ──
    const activos = await medicamentosList(true);
    const porVencer = activos.filter((m) => {
      const dias = getDaysUntilExpiry(m.vencimiento);
      return dias !== null && dias <= DIAS_PARA_VENCER;
    });

    if (porVencer.length > 0) {
      const lista = porVencer.map((m) => m.nombre).join(', ');
      await enviarATokens(tokens, `⚠️ ${porVencer.length} medicamento(s) por vencer`, lista, {
        tipo: 'vencimientos',
      });
      resumen.porVencer = porVencer.map((m) => m.nombre);
    }

    // ── Seguimiento de entregas ──
    const todasEntregas = await entregasList();
    const conSeguimiento = todasEntregas.filter((e) => e.darSeguimiento);

    for (const entrega of conSeguimiento) {
      await notificarSeguimientoEntrega(entrega);
      resumen.seguimiento.push(entrega.destino);
    }

    return resumen;
  } catch (error) {
    console.error('Error en chequeo diario de notificaciones:', error);
    return resumen;
  }
};

// Fuerza el chequeo diario ahora mismo, sin esperar al próximo día -
// limpia la marca de "ya se chequeó hoy" y vuelve a correrlo. Útil para
// pruebas, y también para uso real si un admin quiere forzar un chequeo
// sin esperar. Devuelve un resumen de qué se mandó, para mostrarlo en
// pantalla.
export const forzarChequeoDiario = async () => {
  await AsyncStorage.removeItem(CLAVE_ULTIMO_CHEQUEO_DIARIO);
  return await ejecutarChequeoDiario();
};
