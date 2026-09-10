import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import { Key, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function ApiKeyModal({ visible, onClose, onSave }) {
  const insets = useSafeAreaInsets();
  const [apiKey, setApiKey] = useState('');
  const [brevoApiKey, setBrevoApiKey] = useState('');
  const [brevoSenderEmail, setBrevoSenderEmail] = useState('');

  useEffect(() => {
    if (!visible) return;
    (async () => {
      try {
        const [savedGemini, savedBrevoKey, savedBrevoSender] = await Promise.all([
          AsyncStorage.getItem('gemini_api_key'),
          AsyncStorage.getItem('brevo_api_key'),
          AsyncStorage.getItem('brevo_sender_email'),
        ]);
        if (savedGemini) setApiKey(savedGemini);
        if (savedBrevoKey) setBrevoApiKey(savedBrevoKey);
        if (savedBrevoSender) setBrevoSenderEmail(savedBrevoSender);
      } catch (error) {
        console.error('Error cargando claves guardadas:', error);
      }
    })();
  }, [visible]);

  const handleSave = async () => {
    if (apiKey && !apiKey.trim().startsWith('AIzaSy')) {
      Alert.alert('Error', 'La API Key de Gemini no parece válida (debe empezar con AIzaSy)');
      return;
    }
    if (brevoSenderEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(brevoSenderEmail.trim())) {
      Alert.alert('Error', 'El correo remitente de Brevo no parece válido');
      return;
    }
    try {
      await AsyncStorage.setItem('gemini_api_key', apiKey.trim());
      await AsyncStorage.setItem('brevo_api_key', brevoApiKey.trim());
      await AsyncStorage.setItem('brevo_sender_email', brevoSenderEmail.trim());
      onSave(apiKey.trim());
      Alert.alert('Éxito', 'Configuración guardada correctamente');
    } catch (error) {
      Alert.alert('Error', 'No se pudo guardar la configuración');
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      statusBarTranslucent={true}
    >
      <View style={[styles.modalOverlay, { paddingBottom: insets.bottom }]}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Key color="#4F46E5" size={24} />
            <Text style={styles.modalTitle}>Configurar API Key</Text>
            <TouchableOpacity onPress={onClose}>
              <X color="#6B7280" size={24} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            <Text style={styles.description}>
              Para usar el reconocimiento de medicamentos con IA, necesitas una API Key de Google Gemini.
            </Text>

            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>📌 Cómo obtener tu API Key:</Text>
              <Text style={styles.infoText}>1. Ve a: aistudio.google.com/app/apikey</Text>
              <Text style={styles.infoText}>2. Inicia sesión con tu cuenta de Google</Text>
              <Text style={styles.infoText}>3. Click en "Create API Key"</Text>
              <Text style={styles.infoText}>4. Copia la API Key</Text>
              <Text style={styles.infoText}>5. Pégala aquí abajo</Text>
            </View>

            <TextInput
              style={styles.input}
              placeholder="AIzaSy..."
              value={apiKey}
              onChangeText={setApiKey}
              secureTextEntry
              autoCapitalize="none"
            />

            <View style={styles.separator} />

            <Text style={styles.sectionTitle}>📧 Avisos por correo (opcional)</Text>
            <Text style={styles.description}>
              Para que las notificaciones también lleguen por email, configura una cuenta
              gratis en brevo.com y pega aquí tu clave de API y el correo remitente que
              verificaste ahí.
            </Text>

            <Text style={styles.inputLabel}>Brevo API Key</Text>
            <TextInput
              style={styles.input}
              placeholder="xkeysib-..."
              value={brevoApiKey}
              onChangeText={setBrevoApiKey}
              secureTextEntry
              autoCapitalize="none"
            />

            <Text style={styles.inputLabel}>Correo remitente (verificado en Brevo)</Text>
            <TextInput
              style={styles.input}
              placeholder="avisos@tudominio.com"
              value={brevoSenderEmail}
              onChangeText={setBrevoSenderEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Guardar configuración</Text>
            </TouchableOpacity>

            <Text style={styles.footerText}>
              🔒 Todo se guarda solo en este dispositivo. Es 100% privado y seguro.
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 24,
    width: '90%',
    maxHeight: '80%',
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    flex: 1,
    marginLeft: 12,
  },
  modalBody: {
    padding: 20,
  },
  description: {
    fontSize: 14,
    color: '#4B5563',
    marginBottom: 16,
    textAlign: 'center',
    lineHeight: 20,
  },
  infoBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1E40AF',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 12,
    color: '#1E3A8A',
    marginBottom: 4,
    lineHeight: 18,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    marginBottom: 20,
    backgroundColor: '#F9FAFB',
  },
  separator: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    marginVertical: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
    marginBottom: 6,
  },
  saveButton: {
    backgroundColor: '#7C3AED',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  footerText: {
    fontSize: 11,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 8,
  },
});