import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Key, ArrowLeft, Check } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function ApiKeyScreen({ navigation, onSave, onSkip }) {
  const [apiKey, setApiKey] = useState('');

  const handleSave = async () => {
    if (apiKey && apiKey.trim().startsWith('AIzaSy')) {
      try {
        await AsyncStorage.setItem('gemini_api_key', apiKey.trim());
        Alert.alert('Éxito', 'API Key configurada correctamente');
        if (onSave) {
          onSave(apiKey.trim());
        }
        navigation.goBack();
      } catch (error) {
        Alert.alert('Error', 'No se pudo guardar la API Key');
      }
    } else {
      Alert.alert('Error', 'Ingresa una API Key válida de Google Gemini (debe empezar con AIzaSy)');
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ArrowLeft color="#1F2937" size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Configurar API Key</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView 
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        <View style={styles.iconContainer}>
          <Key color="#4F46E5" size={60} />
        </View>

        <Text style={styles.title}>Configuración de Gemini AI</Text>
        
        <Text style={styles.description}>
          Para usar el reconocimiento automático de medicamentos con IA, necesitas una API Key de Google Gemini.
        </Text>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>📋 Pasos para obtener tu API Key:</Text>
          <View style={styles.stepContainer}>
            <Text style={styles.stepNumber}>1.</Text>
            <Text style={styles.stepText}>Ve a aistudio.google.com/app/apikey</Text>
          </View>
          <View style={styles.stepContainer}>
            <Text style={styles.stepNumber}>2.</Text>
            <Text style={styles.stepText}>Inicia sesión con tu cuenta de Google</Text>
          </View>
          <View style={styles.stepContainer}>
            <Text style={styles.stepNumber}>3.</Text>
            <Text style={styles.stepText}>Haz clic en "Create API Key"</Text>
          </View>
          <View style={styles.stepContainer}>
            <Text style={styles.stepNumber}>4.</Text>
            <Text style={styles.stepText}>Copia la API Key generada</Text>
          </View>
          <View style={styles.stepContainer}>
            <Text style={styles.stepNumber}>5.</Text>
            <Text style={styles.stepText}>Pégala en el campo de abajo</Text>
          </View>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>API Key de Gemini</Text>
          <TextInput
            style={styles.input}
            placeholder="AIzaSy..."
            value={apiKey}
            onChangeText={setApiKey}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            placeholderTextColor="#9CA3AF"
          />
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Check color="white" size={20} style={styles.buttonIcon} />
          <Text style={styles.saveButtonText}>Guardar API Key</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.skipButton} onPress={onSkip}>
          <Text style={styles.skipButtonText}>Omitir por ahora</Text>
        </TouchableOpacity>
        <Text style={styles.footerNote}>
          🔒 Tu API Key se guarda solo en este dispositivo y nunca se comparte.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  iconContainer: {
    alignItems: 'center',
    marginVertical: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 10,
  },
  description: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  infoCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1E40AF',
    marginBottom: 16,
  },
  stepContainer: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  stepNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1E3A8A',
    width: 24,
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: '#1E3A8A',
    lineHeight: 18,
  },
  inputContainer: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
  },
  saveButton: {
    backgroundColor: '#4F46E5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    borderRadius: 12,
    marginBottom: 20,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonIcon: {
    marginRight: 8,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  footerNote: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 18,
  },
  skipButton: {
  padding: 12,
  alignItems: 'center',
  marginBottom: 16,
  },
  skipButtonText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
});