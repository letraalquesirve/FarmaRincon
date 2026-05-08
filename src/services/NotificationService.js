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

// ============================================
// NUEVAS FUNCIONES PARA PUSH NOTIFICATIONS
// ============================================

// Configurar canal de notificaciones para Android (requerido para Android 8+)
export const setupNotificationChannel = async () => {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#7C3AED',
    });
    console.log('✅ Canal de notificaciones configurado');
  }
};

// Registrar el dispositivo para recibir push notifications
export const registerForPushNotifications = async (userId, pb) => {
  try {
    // 1. Verificar permisos
    const hasPermission = await requestPermissions();
    if (!hasPermission) return null;

    // 2. Obtener projectId desde Constants
    const Constants = require('expo-constants').default;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;

    if (!projectId) {
      console.error('❌ No se encontró projectId en expoConfig');
      return null;
    }

    // 3. Configurar canal para Android
    await setupNotificationChannel();

    // 4. Obtener el token push de Expo
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: projectId,
    });

    const token = tokenData.data;
    console.log('📱 Expo Push Token:', token);

    // 5. Guardar token en PocketBase
    if (pb && userId) {
      // Verificar si ya existe un token para este dispositivo
      const existingTokens = await pb.collection('push_tokens').getList(1, 1, {
        filter: `token = "${token}"`,
      });

      if (existingTokens.items.length === 0) {
        await pb.collection('push_tokens').create({
          user_id: userId,
          token: token,
          platform: Platform.OS,
          active: true,
        });
        console.log('✅ Token guardado en PocketBase');
      } else {
        // Actualizar si es necesario
        if (!existingTokens.items[0].active) {
          await pb.collection('push_tokens').update(existingTokens.items[0].id, {
            active: true,
          });
          console.log('✅ Token reactivado');
        } else {
          console.log('ℹ️ Token ya existente en PocketBase');
        }
      }
    }

    return token;
  } catch (error) {
    console.error('❌ Error registrando push notifications:', error);
    return null;
  }
};

// Enviar notificación push a un token específico
export const sendPushNotification = async (expoPushToken, title, body, data = {}) => {
  try {
    const message = {
      to: expoPushToken,
      sound: 'default',
      title: title,
      body: body,
      data: data,
      priority: 'high', // Importante para Android
    };

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();
    console.log('📤 Push notification sent:', result);
    return result;
  } catch (error) {
    console.error('❌ Error sending push notification:', error);
    return null;
  }
};
