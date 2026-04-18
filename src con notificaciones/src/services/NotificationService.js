import * as Notifications from 'expo-notifications';
import { db } from '../../firebaseConfig';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { getDaysUntilExpiry } from '../utils/dateUtils';

// Configurar cómo se muestran las notificaciones en primer plano
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// ============================================================
// FUNCIÓN PRINCIPAL: VERIFICAR Y NOTIFICAR
// ============================================================
export async function checkAndNotifyExpiringMedicines() {
  try {
    console.log('🔍 Verificando medicamentos por vencer...');
    
    // Obtener todos los medicamentos activos
    const medicamentosRef = collection(db, 'medicamentos');
    const q = query(medicamentosRef, where('activo', '==', true));
    const snapshot = await getDocs(q);
    
    const expiringSoon = [];
    
    snapshot.forEach(doc => {
      const med = doc.data();
      const daysUntilExpiry = getDaysUntilExpiry(med.vencimiento);
      
      // Medicamentos que vencen en 7 días o menos (y no están vencidos)
      if (daysUntilExpiry >= 0 && daysUntilExpiry <= 7) {
        expiringSoon.push({
          id: doc.id,
          nombre: med.nombre,
          presentacion: med.presentacion,
          ubicacion: med.ubicacion,
          dias: daysUntilExpiry
        });
      }
    });
    
    if (expiringSoon.length === 0) {
      console.log('✅ No hay medicamentos por vencer');
      return;
    }
    
    console.log(`⚠️ ${expiringSoon.length} medicamentos por vencer encontrados`);
    
    // Limpiar notificaciones anteriores (para no duplicar)
    await Notifications.cancelAllScheduledNotificationsAsync();
    
    // Programar notificaciones para cada medicamento
    for (const med of expiringSoon) {
      const message = med.dias === 0
        ? `⚠️ ${med.nombre} vence HOY${med.ubicacion ? ` en ${med.ubicacion}` : ''}`
        : `📦 ${med.nombre} vence en ${med.dias} día${med.dias !== 1 ? 's' : ''}${med.ubicacion ? ` (${med.ubicacion})` : ''}`;
      
      await scheduleDailyNotification(message, med.nombre, med.id);
    }
    
    console.log(`🔔 Programadas ${expiringSoon.length} notificaciones`);
    
  } catch (error) {
    console.error('Error verificando medicamentos:', error);
  }
}

// ============================================================
// PROGRAMAR NOTIFICACIÓN DIARIA
// ============================================================
async function scheduleDailyNotification(body, title, medId) {
  const now = new Date();
  const scheduledTime = new Date();
  scheduledTime.setHours(9, 0, 0, 0); // 9:00 AM
  
  // Si ya pasaron las 9 AM, programar para mañana
  if (now > scheduledTime) {
    scheduledTime.setDate(scheduledTime.getDate() + 1);
  }
  
  // Calcular el tiempo en segundos hasta la próxima ejecución
  const secondsUntilTrigger = Math.floor((scheduledTime - now) / 1000);
  
  if (secondsUntilTrigger > 0) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `⚠️ Medicamento por vencer: ${title}`,
        body: body,
        data: { medId, screen: 'Inventory' },
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: {
        seconds: secondsUntilTrigger,
        repeats: true,  // Se repite diariamente
      },
    });
    console.log(`📅 Notificación programada para ${scheduledTime.toLocaleString()}`);
  } else {
    console.log(`⏰ La hora ya pasó, programando para mañana`);
    // Programar para mañana a las 9 AM
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    const secondsTomorrow = Math.floor((tomorrow - now) / 1000);
    
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `⚠️ Medicamento por vencer: ${title}`,
        body: body,
        data: { medId, screen: 'Inventory' },
        sound: true,
      },
      trigger: {
        seconds: secondsTomorrow,
        repeats: true,
      },
    });
    console.log(`📅 Notificación programada para mañana a las 9:00`);
  }
}

// ============================================================
// SOLICITAR PERMISOS DE NOTIFICACIÓN
// ============================================================
export async function requestNotificationPermissions() {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('⚠️ Permiso de notificaciones denegado');
      return false;
    }
    
    console.log('✅ Permiso de notificaciones concedido');
    return true;
  } catch (error) {
    console.error('Error solicitando permisos:', error);
    return false;
  }
}

// ============================================================
// INICIALIZAR NOTIFICACIONES (sin BackgroundFetch)
// ============================================================
export async function initializeNotifications() {
  // Solicitar permisos
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;
  
  // Ejecutar una verificación inmediata
  await checkAndNotifyExpiringMedicines();
}

// ============================================================
// FORZAR VERIFICACIÓN MANUAL (para pruebas)
// ============================================================
export async function forceCheckNotifications() {
  console.log('🔄 Forzando verificación manual...');
  await checkAndNotifyExpiringMedicines();
}