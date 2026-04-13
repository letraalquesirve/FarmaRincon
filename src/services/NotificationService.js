// src/services/NotificationService.js
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configurar cómo se muestran las notificaciones cuando la app está en segundo plano
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Solicitar permisos (Android e iOS)
export async function requestPermissions() {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Permiso de notificaciones no concedido');
    return false;
  }

  return true;
}

// Enviar notificación local inmediata
export async function sendLocalNotification(title, body, data = {}) {
  const hasPermission = await requestPermissions();
  if (!hasPermission) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: 'default',
    },
    trigger: null, // null = inmediato
  });
}

// Programar notificación para una fecha específica
export async function scheduleNotification(title, body, triggerDate, data = {}) {
  const hasPermission = await requestPermissions();
  if (!hasPermission) return;

  // Convertir fecha a timestamp si es necesario
  const trigger = {
    date: new Date(triggerDate),
  };

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: 'default',
    },
    trigger,
  });
}

// Programar notificación recurrente (ej: cada día)
export async function scheduleDailyNotification(title, body, hour, minute, data = {}) {
  const hasPermission = await requestPermissions();
  if (!hasPermission) return;

  const trigger = {
    hour,
    minute,
    repeats: true,
  };

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: 'default',
    },
    trigger,
  });
}

// Cancelar todas las notificaciones programadas
export async function cancelAllNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

// Obtener todas las notificaciones programadas
export async function getAllScheduledNotifications() {
  return await Notifications.getAllScheduledNotificationsAsync();
}

// Configurar listener para cuando el usuario toca una notificación
export function addNotificationListener(callback) {
  return Notifications.addNotificationResponseReceivedListener(callback);
}
