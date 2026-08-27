// src/components/LoginModal.js
import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Key, LogIn, X, Download } from 'lucide-react-native';
import { loadFromVPS } from '../services/SyncService';

export default function LoginModal({ visible, onLogin, onClose }) {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadMsg, setDownloadMsg] = useState('');

  const handleLogin = async () => {
    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      Alert.alert('Error', 'Ingresa tu nombre de usuario');
      return;
    }

    setLoading(true);
    // Simular un pequeño retraso para mostrar el loading
    setTimeout(() => {
      setLoading(false);
      onLogin(trimmedUsername);
    }, 500);
  };

  // Primer arranque en un celular nuevo (o BD local vacía): bajar la
  // última copia subida por el administrador antes de poder iniciar sesión.
  const handleDownloadFromServer = async () => {
    if (downloading) return;
    setDownloading(true);
    setDownloadMsg('Conectando con el servidor...');
    try {
      const ok = await loadFromVPS(username.trim() || 'nuevo_usuario', (mensaje) => {
        setDownloadMsg(mensaje);
      });
      if (ok) {
        Alert.alert(
          'Listo',
          'Se descargó la base de datos del servidor. Ahora intenta iniciar sesión.'
        );
      } else {
        Alert.alert(
          'No se pudo descargar',
          'Revisa tu conexión a internet o pide al administrador que suba una copia reciente.'
        );
      }
    } catch (error) {
      console.error('Error descargando BD inicial:', error);
      Alert.alert('Error', 'No se pudo descargar la base de datos del servidor');
    } finally {
      setDownloading(false);
      setDownloadMsg('');
    }
  };

  return (
    <Modal visible={visible} transparent={true} animationType="fade" statusBarTranslucent={true}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Key color="#4F46E5" size={24} />
            <Text style={styles.modalTitle}>Iniciar Sesión</Text>
          </View>

          <Text style={styles.description}>
            Ingresa tu nombre de usuario para acceder a la aplicación
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Nombre de usuario"
            placeholderTextColor="#9CA3AF"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
          />

          <TouchableOpacity
            style={[styles.loginButton, loading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <>
                <LogIn color="white" size={20} />
                <Text style={styles.loginButtonText}>Ingresar</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.downloadButton}
            onPress={handleDownloadFromServer}
            disabled={downloading}
          >
            {downloading ? (
              <>
                <ActivityIndicator color="#4F46E5" size="small" />
                <Text style={styles.downloadButtonText}>{downloadMsg || 'Descargando...'}</Text>
              </>
            ) : (
              <>
                <Download color="#4F46E5" size={18} />
                <Text style={styles.downloadButtonText}>
                  Primera vez o BD vacía: descargar del servidor
                </Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.footerText}>🔒 Solo usuarios autorizados pueden acceder</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 24,
    width: '85%',
    padding: 24,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    gap: 12,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  description: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    marginBottom: 20,
    backgroundColor: '#F9FAFB',
    color: '#1F2937',
  },
  loginButton: {
    backgroundColor: '#7C3AED',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  footerText: {
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 16,
  },
  downloadButton: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    backgroundColor: '#EEF2FF',
  },
  downloadButtonText: {
    color: '#4F46E5',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    flexShrink: 1,
  },
});
