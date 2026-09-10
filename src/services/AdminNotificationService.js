// src/services/AdminNotificationService.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  registerForPushNotifications,
  sendPushNotification,
} from './NotificationService';
import { enviarEmail } from './EmailService';
import { usuariosList, usuarioUpdate, entregasList, medicamentosList } from './LocalDataService';
import { publicarPushTokenEnServidor, obtenerDestinatariosAdminsEnVivo } from './SyncService';
import { getDaysUntilExpiry } from '../utils/dateUtils';

const CLAVE_COLA_PENDIENTE = 'colaNotificacionesPendientes';
const CLAVE_ULTIMO_CHEQUEO_DIARIO = 'ultimoChequeoDiarioNotificaciones';
const DIAS_PARA_VENCER = 30; // mismo umbral que ya usa Inicio para "Por Vencer"

// ─────────────────────────────────────────────────────────────
// REGISTRO DEL TOKEN DE ESTE CELULAR
// ─────────────────────────────────────────────────────────────

// Registra el token de este dispositivo y lo publica en PocketBase.
// Devuelve un resultado detallado (no solo true/false) para poder
// mostrarlo en pantalla cuando se dispara a mano (botón de prueba) - la
// versión silenciosa (llamada automática al abrir la app) simplemente
// ignora el detalle si no le interesa.
export const registrarPushTokenUsuarioActual = async (usuario) => {
  if (!usuario?.id) return { ok: false, motivo: 'No hay usuario logueado' };
  try {
    const { token, error } = await registerForPushNotifications();
    if (!token) {
      return {
        ok: false,
        motivo: `No se pudo obtener el token de este dispositivo: ${error || 'motivo desconocido'}`,
      };
    }
    if (token !== usuario.pushToken) {
      await usuarioUpdate(usuario.id, { pushToken: token });
    }
    const publicado = await publicarPushTokenEnServidor(usuario.nombre, token);
    if (!publicado) {
      return {
        ok: false,
        motivo:
          'Se obtuvo el token, pero no se pudo publicar en el servidor (revisa tu conexión, o que el usuario exista en PocketBase con ese mismo nombre).',
      };
    }
    return { ok: true, motivo: 'Token registrado y publicado correctamente.' };
  } catch (error) {
    console.error('Error registrando token de push:', error);
    return { ok: false, motivo: error?.message || String(error) };
  }
};

// ─────────────────────────────────────────────────────────────
// COLA DE REINTENTO (para cuando no hay red al momento de avisar)
// Cada ítem trae un campo 'tipo' ('push' o 'email') para saber cómo
// reintentarlo.
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

const intentarEnviarPush = async (item) => {
  try {
    const resultado = await sendPushNotification(item.pushToken, item.title, item.body, item.data);
    if (!resultado) return false;

    const status = resultado?.data?.status;
    if (status === 'error') {
      console.error(
        `Expo rechazó el envío a ${item.pushToken}:`,
        resultado.data.message,
        resultado.data.details
      );
      return false;
    }
    return true;
  } catch (error) {
    return false;
  }
};

const intentarEnviarEmail = async (item) => {
  const resultado = await enviarEmail(item.email, item.asunto, item.cuerpoHtml);
  if (!resultado.ok) {
    console.error(`No se pudo mandar email a ${item.email}:`, resultado.motivo);
  }
  return resultado.ok;
};

const intentarEnviar = async (item) => {
  if (item.tipo === 'email') return intentarEnviarEmail(item);
  return intentarEnviarPush(item);
};

const agregarAColaPendiente = async (item) => {
  const cola = await leerCola();
  cola.push({ ...item, id: item.id || `${Date.now()}_${Math.random()}` });
  await guardarCola(cola);
};

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

// Manda a cada admin su push (si tiene token) Y su email (si tiene
// correo) - de forma independiente, un tipo de aviso no bloquea al otro.
const enviarAAdmins = async (destinatarios, pushPayload, emailPayload) => {
  for (const admin of destinatarios) {
    if (admin.pushToken) {
      const item = { tipo: 'push', pushToken: admin.pushToken, ...pushPayload };
      const ok = await intentarEnviarPush(item);
      if (!ok) await agregarAColaPendiente(item);
    }
    if (admin.email) {
      const item = { tipo: 'email', email: admin.email, ...emailPayload };
      const ok = await intentarEnviarEmail(item);
      if (!ok) await agregarAColaPendiente(item);
    }
  }
};

const obtenerDestinatariosAdmins = async () => {
  const enVivo = await obtenerDestinatariosAdminsEnVivo();
  if (enVivo !== null) return enVivo;

  const usuarios = await usuariosList();
  return usuarios
    .filter((u) => u.tipo === 'admin' && (u.pushToken || u.email))
    .map((u) => ({ pushToken: u.pushToken || null, email: u.email || null }));
};

const plantillaEmail = (titulo, contenidoHtml) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <div style="background: #6B21A8; color: white; padding: 16px 20px; border-radius: 8px 8px 0 0;">
      <h2 style="margin: 0;">${titulo}</h2>
    </div>
    <div style="padding: 20px; border: 1px solid #E5E7EB; border-top: none; border-radius: 0 0 8px 8px;">
      ${contenidoHtml}
      <p style="color: #9CA3AF; font-size: 12px; margin-top: 24px;">FarmaRincón - aviso automático</p>
    </div>
  </div>
`;

// ─────────────────────────────────────────────────────────────
// 1. NUEVO PEDIDO (inmediato)
// ─────────────────────────────────────────────────────────────

export const notificarNuevoPedido = async (pedido) => {
  try {
    const destinatarios = await obtenerDestinatariosAdmins();
    if (destinatarios.length === 0) return;

    const itemsCortos = (pedido.medicamentosSolicitados || [])
      .map((m) => `${m.nombre}${m.cantidad ? ` x${m.cantidad}` : ''}`)
      .join(', ');
    const pushBody = `${pedido.nombreSolicitante} pide: ${itemsCortos}`;

    const filasItems = (pedido.medicamentosSolicitados || [])
      .map((m) => `<li>${m.nombre}${m.cantidad ? ` — cantidad: ${m.cantidad}` : ''}</li>`)
      .join('');
    const contenidoHtml = `
      <p><strong>Solicitante:</strong> ${pedido.nombreSolicitante || ''}</p>
      ${pedido.lugarResidencia ? `<p><strong>Lugar:</strong> ${pedido.lugarResidencia}</p>` : ''}
      ${pedido.telefonoContacto ? `<p><strong>Teléfono:</strong> ${pedido.telefonoContacto}</p>` : ''}
      <p><strong>Medicamentos solicitados:</strong></p>
      <ul>${filasItems}</ul>
      ${pedido.notas ? `<p><strong>Notas:</strong> ${pedido.notas}</p>` : ''}
    `;

    await enviarAAdmins(
      destinatarios,
      { title: 'Pedido nuevo', body: pushBody, data: { tipo: 'pedido', pedidoId: pedido.id } },
      { asunto: `Pedido nuevo: ${pedido.nombreSolicitante}`, cuerpoHtml: plantillaEmail('📋 Pedido nuevo', contenidoHtml) }
    );
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

export const notificarSeguimientoEntrega = async (entrega) => {
  try {
    const destinatarios = await obtenerDestinatariosAdmins();
    if (destinatarios.length === 0) return;

    const pushBody = `Entrega Medicinas a ${entrega.destino} recordar ${entrega.notas || ''}`;
    const contenidoHtml = `
      <p><strong>Destino:</strong> ${entrega.destino}</p>
      ${entrega.notas ? `<p><strong>Recordar:</strong> ${entrega.notas}</p>` : ''}
      <p>Esta entrega sigue marcada para seguimiento diario - revisa si el mensajero ya llegó.</p>
    `;

    await enviarAAdmins(
      destinatarios,
      { title: 'Seguimiento de entrega', body: pushBody, data: { tipo: 'seguimiento', entregaId: entrega.id } },
      {
        asunto: `Seguimiento: entrega a ${entrega.destino}`,
        cuerpoHtml: plantillaEmail('🚚 Seguimiento de entrega', contenidoHtml),
      }
    );
  } catch (error) {
    console.error('Error notificando seguimiento de entrega:', error);
  }
};

export const ejecutarChequeoDiario = async () => {
  const resumen = { porVencer: [], seguimiento: [], tokensDisponibles: 0 };
  try {
    if (await yaSeChecoHoy()) return resumen;

    const destinatarios = await obtenerDestinatariosAdmins();
    resumen.tokensDisponibles = destinatarios.length;
    await marcarChequeadoHoy();
    if (destinatarios.length === 0) return resumen;

    const activos = await medicamentosList(true);
    const porVencer = activos.filter((m) => {
      const dias = getDaysUntilExpiry(m.vencimiento);
      return dias !== null && dias <= DIAS_PARA_VENCER;
    });

    if (porVencer.length > 0) {
      const listaCorta = porVencer.map((m) => m.nombre).join(', ');
      const filasDetalle = porVencer
        .map((m) => {
          const dias = getDaysUntilExpiry(m.vencimiento);
          return `<li>${m.nombre}${m.presentacion ? ` (${m.presentacion})` : ''} — vence en ${dias} día(s)</li>`;
        })
        .join('');
      await enviarAAdmins(
        destinatarios,
        {
          title: `⚠️ ${porVencer.length} medicamento(s) por vencer`,
          body: listaCorta,
          data: { tipo: 'vencimientos' },
        },
        {
          asunto: `⚠️ ${porVencer.length} medicamento(s) por vencer`,
          cuerpoHtml: plantillaEmail(
            '⚠️ Medicamentos por vencer',
            `<p>Estos medicamentos vencen en los próximos ${DIAS_PARA_VENCER} días:</p><ul>${filasDetalle}</ul>`
          ),
        }
      );
      resumen.porVencer = porVencer.map((m) => m.nombre);
    }

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

export const forzarChequeoDiario = async () => {
  await AsyncStorage.removeItem(CLAVE_ULTIMO_CHEQUEO_DIARIO);
  return await ejecutarChequeoDiario();
};
