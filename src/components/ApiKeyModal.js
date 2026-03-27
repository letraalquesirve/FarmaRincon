import React, { useState } from 'react';
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
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function ApiKeyModal({ visible, onClose, onSave }) {
  const [apiKey, setApiKey] = useState('');

  const handleSave = async () => {
    if (apiKey && apiKey.trim().startsWith('AIzaSy')) {
      try {
        await AsyncStorage.setItem('gemini_api_key', apiKey.trim());
        onSave(apiKey.trim());
        Alert.alert('Éxito', 'API Key configurada correctamente');
      } catch (error) {
        Alert.alert('Error', 'No se pudo guardar la API Key');
      }
    } else {
      Alert.alert('Error', 'Por favor ingresa una API Key válida de Google Gemini');
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      statusBarTranslucent={true}
    >
      <View style={styles.modalOverlay}>
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

            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Guardar API Key</Text>
            </TouchableOpacity>

            <Text style={styles.footerText}>
              🔒 Tu API Key se guarda solo en tu dispositivo. Es 100% privada y segura.
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