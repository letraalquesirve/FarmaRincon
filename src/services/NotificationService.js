// src/services/NotificationService.js
// Versión con SOLO LOGS (no notificaciones reales)

import { db } from '../../firebaseConfig';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { getDaysUntilExpiry } from '../utils/dateUtils';

// ============================================================
// FUNCIÓN PRINCIPAL: VERIFICAR Y REGISTRAR LOGS
// ============================================================
export async function checkAndNotifyExpiringMedicines() {
  try {
    console.log('🔍 [NOTIFICACIONES DESACTIVADAS] Verificando medicamentos por vencer...');
    
    const medicamentosRef = collection(db, 'medicamentos');
    const q = query(medicamentosRef, where('activo', '==', true));
    const snapshot = await getDocs(q);
    
    const expiringSoon = [];
    
    snapshot.forEach(doc => {
      const med = doc.data();
      const daysUntilExpiry = getDaysUntilExpiry(med.vencimiento);
      
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
    
    console.log(`⚠️ [SIMULADO] ${expiringSoon.length} medicamentos por vencer encontrados:`);
    for (const med of expiringSoon) {
      const message = med.dias === 0
        ? `⚠️ ${med.nombre} vence HOY${med.ubicacion ? ` en ${med.ubicacion}` : ''}`
        : `📦 ${med.nombre} vence en ${med.dias} día${med.dias !== 1 ? 's' : ''}${med.ubicacion ? ` (${med.ubicacion})` : ''}`;
      console.log(`   🔔 ${message}`);
    }
    
  } catch (error) {
    console.error('Error verificando medicamentos:', error);
  }
}

export async function requestNotificationPermissions() {
  console.log('✅ [SIMULADO] Permiso de notificaciones concedido (simulado)');
  return true;
}

export async function initializeNotifications() {
  console.log('📱 [SIMULADO] Inicializando notificaciones (solo logs)');
  await checkAndNotifyExpiringMedicines();
}

export async function forceCheckNotifications() {
  console.log('🔄 [SIMULADO] Forzando verificación manual...');
  await checkAndNotifyExpiringMedicines();
}