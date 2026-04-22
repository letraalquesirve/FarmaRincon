// components/ImportBackupButton.js
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  StyleSheet,
} from 'react-native';
import { initDatabase, importBackup } from '../services/SQLiteService';
import * as FileSystem from 'expo-file-system';

export default function ImportBackupButton({ onComplete }) {
  const [importing, setImporting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [progress, setProgress] = useState('');

  // Leer el JSON desde assets
  const readBackupFromAssets = async () => {
    try {
      // Intentar diferentes rutas posibles
      const possiblePaths = [
        FileSystem.bundleDirectory + 'assets/farmacia-backup.json',
        FileSystem.bundleDirectory + 'farmacia-backup.json',
        FileSystem.documentDirectory + 'farmacia-backup.json',
      ];

      for (const path of possiblePaths) {
        try {
          const exists = await FileSystem.getInfoAsync(path);
          if (exists.exists) {
            console.log(`📁 Backup encontrado en: ${path}`);
            const content = await FileSystem.readAsStringAsync(path);
            return JSON.parse(content);
          }
        } catch (e) {
          // Continuar con la siguiente ruta
        }
      }

      throw new Error('No se encontró el archivo farmacia-backup.json en assets');
    } catch (error) {
      console.error('Error leyendo backup:', error);
      throw error;
    }
  };

  const handleImport = async () => {
    setImporting(true);
    setProgress('Leyendo archivo...');

    try {
      // Leer el backup
      const backup = await readBackupFromAssets();

      setProgress('Importando medicamentos...');
      await initDatabase();

      // Importar a SQLite
      const counts = await importBackup(backup);

      setProgress('Finalizando...');

      Alert.alert(
        '✅ Importación Exitosa',
        `📊 Resumen:\n\n` +
          `💊 Medicamentos: ${counts.medicamentos}\n` +
          `📋 Pedidos: ${counts.pedidos}\n` +
          `📦 Entregas: ${counts.entregas}\n` +
          `👤 Usuarios: ${counts.usuarios}\n\n` +
          `La app ahora funciona en modo offline.`
      );

      setShowConfirm(false);
      if (onComplete) onComplete();
    } catch (error) {
      Alert.alert(
        '❌ Error de Importación',
        `No se pudo importar el backup.\n\nDetalle: ${error.message}\n\n` +
          `Asegúrate de que el archivo farmacia-backup.json esté en la carpeta assets del proyecto.`
      );
      console.error('Error detallado:', error);
    } finally {
      setImporting(false);
      setProgress('');
    }
  };

  return (
    <>
      {/* Botón flotante pequeño (solo visible en desarrollo) */}
      <TouchableOpacity
        style={styles.importButton}
        onPress={() => setShowConfirm(true)}
        activeOpacity={0.8}
      >
        <Text style={styles.importButtonText}>📥</Text>
      </TouchableOpacity>

      {/* Modal de confirmación */}
      <Modal
        visible={showConfirm}
        transparent={true}
        animationType="fade"
        onRequestClose={() => !importing && setShowConfirm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {importing ? (
              <>
                <ActivityIndicator size="large" color="#7C3AED" />
                <Text style={styles.modalProgress}>{progress}</Text>
                <Text style={styles.modalHint}>Por favor espera...</Text>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>📥 Importar Backup</Text>
                <Text style={styles.modalMessage}>
                  Esta acción borrará TODOS los datos actuales y los reemplazará con los datos del
                  backup.
                  {'\n\n'}
                  ¿Estás seguro de continuar?
                </Text>
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.cancelButton]}
                    onPress={() => setShowConfirm(false)}
                  >
                    <Text style={styles.cancelButtonText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.confirmButton]}
                    onPress={handleImport}
                  >
                    <Text style={styles.confirmButtonText}>Importar</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  importButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#7C3AED',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    zIndex: 999,
  },
  importButtonText: {
    fontSize: 24,
    color: 'white',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    width: '80%',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 16,
  },
  modalMessage: {
    fontSize: 14,
    color: '#4B5563',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  modalProgress: {
    fontSize: 14,
    color: '#7C3AED',
    marginTop: 16,
    fontWeight: '500',
  },
  modalHint: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 8,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#F3F4F6',
  },
  confirmButton: {
    backgroundColor: '#7C3AED',
  },
  cancelButtonText: {
    color: '#4B5563',
    fontWeight: '600',
  },
  confirmButtonText: {
    color: 'white',
    fontWeight: '600',
  },
});
