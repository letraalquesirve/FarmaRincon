// src/screens/RegisterScreen.js
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Image,
  ActivityIndicator,
  Modal,
  SafeAreaView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Audio } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Camera as CameraIcon,
  Image as ImageIcon,
  X,
  Check,
  AlertCircle,
  Package,
  Plus,
  Sparkles,
  Mic,
  MicOff,
  Upload,
  Play,
  StopCircle,
} from 'lucide-react-native';
import DatePickerInput from '../components/DatePickerInput';
import KeyboardAvoidingScrollView from '../components/KeyboardAvoidingScrollView';
import { getDaysUntilExpiry } from '../utils/dateUtils';
import CategoriaPicker from '../components/CategoriaPicker';
import { pb } from '../services/PocketBaseConfig';

export default function RegisterScreen({ user }) {
  // ==================== ESTADOS EXISTENTES ====================
  const [step, setStep] = useState('capture');
  const [imageUri, setImageUri] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [comprimiendo, setComprimiendo] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [duplicateFound, setDuplicateFound] = useState(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [consultandoCategoria, setConsultandoCategoria] = useState(false);
  const [formData, setFormData] = useState({
    nombre: '',
    presentacion: '',
    categoria: '',
    cantidad: '',
    vencimiento: '',
    ubicacion: '',
  });
  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [manualFormData, setManualFormData] = useState({
    nombre: '',
    presentacion: '',
    categoria: '',
    cantidad: '',
    vencimiento: '',
    ubicacion: '',
  });
  const [manualImageUri, setManualImageUri] = useState(null);
  const [manualImageBase64, setManualImageBase64] = useState(null);
  const [ultimoMedicamento, setUltimoMedicamento] = useState(null);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);

  // ==================== NUEVOS ESTADOS PARA AUDIO ====================
  const [audioUri, setAudioUri] = useState(null); // URI local del audio
  const [audioFileInfo, setAudioFileInfo] = useState(null); // { uri, name, type } para subir
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState(null);
  const [sound, setSound] = useState(null);
  const [processingAudio, setProcessingAudio] = useState(false);

  // Refs existentes
  const imageBase64Ref = useRef(null);
  const manualImageBase64Ref = useRef(null);

  // ==================== FUNCIONES EXISTENTES (se mantienen) ====================
  // ... (copia todas las funciones que ya funcionaban: getUserName, obtenerUbicacionDesdeCategoria, registrarHistory, etc.)
  // Para ahorrar espacio, solo incluyo las cabeceras; el archivo final debe tenerlas todas.

  // Aquí irían: useEffect, checkApiKey, cargarUltimoMedicamento, getUserName, obtenerUbicacionDesdeCategoria, registrarHistory, getStatusColor, getStatusText, comprimirImagenParaStorage, consultarCategoriaPorTexto, takePicture, pickImage, pickManualImage, processImageWithAI, saveNewMedicamento, resetForm, handleSaveNewMed, checkForDuplicates, reactivarMedicamento, etc.

  // ==================== NUEVAS FUNCIONES PARA AUDIO ====================

  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'Se necesita acceso al micrófono para grabar audio');
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(newRecording);
      setIsRecording(true);
    } catch (err) {
      console.error('Error al grabar:', err);
      Alert.alert('Error', 'No se pudo iniciar la grabación');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    setIsRecording(false);
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setAudioUri(uri);
    // Obtener nombre de archivo
    const fileName = uri.split('/').pop() || 'audio.mp3';
    setAudioFileInfo({
      uri: uri,
      name: fileName,
      type: 'audio/mpeg',
    });
    // Convertir a base64 para enviar a la IA (opcional, pero lo usamos en processAudioWithAI)
    const base64 = await uriToBase64(uri);
    setAudioBase64(base64);
    setRecording(null);
    // Reproducir automáticamente
    if (sound) await sound.unloadAsync();
    const { sound: newSound } = await Audio.Sound.createAsync({ uri });
    setSound(newSound);
    await newSound.playAsync();
  };

  const uriToBase64 = async (uri) => {
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const pickAudioFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      setAudioUri(asset.uri);
      setAudioFileInfo({
        uri: asset.uri,
        name: asset.name,
        type: asset.mimeType,
      });
      // Convertir a base64 para la IA
      const base64 = await uriToBase64(asset.uri);
      setAudioBase64(base64);
      // Reproducir si se desea
      if (sound) await sound.unloadAsync();
      const { sound: newSound } = await Audio.Sound.createAsync({ uri: asset.uri });
      setSound(newSound);
      await newSound.playAsync();
    } catch (err) {
      console.error('Error seleccionando audio:', err);
      Alert.alert('Error', 'No se pudo seleccionar el archivo');
    }
  };

  const playAudio = async () => {
    if (!audioUri) {
      Alert.alert('Sin audio', 'No hay audio grabado o seleccionado');
      return;
    }
    if (sound) {
      await sound.replayAsync();
    } else {
      const { sound: newSound } = await Audio.Sound.createAsync({ uri: audioUri });
      setSound(newSound);
      await newSound.playAsync();
    }
  };

  const processAudioWithAI = async () => {
    if (!audioBase64) {
      Alert.alert('Sin audio', 'Primero graba o selecciona un audio');
      return;
    }
    setProcessingAudio(true);
    try {
      const apiKey = await AsyncStorage.getItem('gemini_api_key');
      if (!apiKey) {
        Alert.alert('Error', 'Configura tu API Key de Gemini primero');
        setProcessingAudio(false);
        return;
      }

      const prompt = `Escucha atentamente la descripción del medicamento en el audio y extrae la siguiente información en formato JSON. 
Debes responder ÚNICAMENTE con el JSON, sin texto adicional, sin explicaciones, sin markdown.

El JSON debe tener esta estructura exacta:
{
  "nombre": "nombre del medicamento",
  "presentacion": "presentación (ej: tabletas 500mg, jeringa, solución, etc.)",
  "categoria": "categoría farmacológica (ej: Analgésico, Antibiótico, Antiinflamatorio, Antihipertensivo, etc.)",
  "cantidad": "número de unidades o cantidad (ej: 300 tabletas, 10 ml, 30 cápsulas)",
  "vencimiento": "fecha de vencimiento en formato YYYY-MM-DD (si se menciona, si no, cadena vacía)"
}
Si no dictan día, asume el día 01 de ese mes.
La categoría no será dictada. Debes buscarla tú en la web dado el medicamento detectado.
Si no entiendes algún campo, déjalo como cadena vacía.`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  { inline_data: { mime_type: 'audio/mp3', data: audioBase64 } },
                ],
              },
            ],
            generationConfig: { temperature: 0.2, response_mime_type: 'application/json' },
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`${response.status}: ${errorData.error?.message}`);
      }

      const data = await response.json();
      let jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      jsonText = jsonText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      const parsed = JSON.parse(jsonText);

      // Actualizar formulario manual
      setManualFormData((prev) => ({
        ...prev,
        nombre: parsed.nombre || '',
        presentacion: parsed.presentacion || '',
        categoria: parsed.categoria || '',
        cantidad: parsed.cantidad ? parsed.cantidad.toString() : '',
        vencimiento: parsed.vencimiento || '',
      }));

      Alert.alert('Éxito', 'Audio procesado correctamente. Los campos se han rellenado.');
    } catch (error) {
      console.error('Error en procesamiento de audio:', error);
      Alert.alert('Error', 'No se pudo procesar el audio: ' + error.message);
    } finally {
      setProcessingAudio(false);
    }
  };

  // ==================== FUNCIÓN MODIFICADA saveManualMedicamento (con FormData) ====================
  const saveManualMedicamento = async () => {
    // Validaciones iniciales
    if (!manualFormData.nombre || !manualFormData.nombre.trim()) {
      Alert.alert('Error', 'El nombre del medicamento es obligatorio');
      return;
    }
    if (!manualFormData.cantidad || parseInt(manualFormData.cantidad) <= 0) {
      Alert.alert('Error', 'Ingresa una cantidad válida');
      return;
    }
    if (!manualFormData.vencimiento) {
      Alert.alert('Error', 'La fecha de vencimiento es obligatoria');
      return;
    }

    try {
      const userName = getUserName();

      // Obtener ubicación desde categoría si existe
      let ubicacionFinal = manualFormData.ubicacion?.trim() || '';
      if (manualFormData.categoria) {
        try {
          const categoriaResult = await pb.collection('categorias').getList(1, 1, {
            filter: `nombre = "${manualFormData.categoria}"`,
            requestKey: null,
          });
          if (
            categoriaResult.items &&
            categoriaResult.items.length > 0 &&
            categoriaResult.items[0].ubicacion
          ) {
            ubicacionFinal = categoriaResult.items[0].ubicacion;
          }
        } catch (err) {
          console.error('Error obteniendo ubicación de categoría:', err);
        }
      }

      // Preparar FormData para enviar a PocketBase
      const formDataToSend = new FormData();
      formDataToSend.append('nombre', manualFormData.nombre.trim());
      formDataToSend.append(
        'presentacion',
        manualFormData.presentacion?.trim() || 'No especificada'
      );
      formDataToSend.append('categoria', manualFormData.categoria?.trim() || 'Sin categoría');
      formDataToSend.append('cantidad', parseInt(manualFormData.cantidad));
      formDataToSend.append('vencimiento', manualFormData.vencimiento);
      formDataToSend.append('ubicacion', ubicacionFinal);
      formDataToSend.append('activo', 'true');
      formDataToSend.append('userid', userName);
      formDataToSend.append('username', userName);
      formDataToSend.append('fecharegistro', new Date().toISOString());

      // Imagen (si existe)
      const imagenFinal = manualImageBase64Ref.current || manualImageBase64 || null;
      if (imagenFinal) {
        // Convertir base64 a blob para adjuntar como archivo
        const blob = await (await fetch(`data:image/jpeg;base64,${imagenFinal}`)).blob();
        formDataToSend.append('imagen', blob, 'medicamento.jpg');
      }

      // Audio (si existe)
      if (audioFileInfo) {
        const audioBlob = await (await fetch(audioFileInfo.uri)).blob();
        formDataToSend.append('audio', audioBlob, audioFileInfo.name);
      }

      // Crear registro en PocketBase usando FormData
      const result = await pb.collection('medicamentos').create(formDataToSend);

      // Registrar en history
      try {
        await pb.collection('history').create({
          id_med: result.id,
          fecha: new Date().toISOString(),
          user: userName,
          movimiento: 'Añadiendo',
          cantidad: parseInt(manualFormData.cantidad),
        });
        console.log('📝 History registrado');
      } catch (historyError) {
        console.error('Error registrando history:', historyError);
      }

      await cargarUltimoMedicamento();
      Alert.alert('Éxito', 'Medicamento registrado correctamente');

      // Limpiar formulario
      setManualFormData({
        nombre: '',
        presentacion: '',
        categoria: '',
        cantidad: '',
        vencimiento: '',
        ubicacion: '',
      });
      setManualImageUri(null);
      setManualImageBase64(null);
      manualImageBase64Ref.current = null;
      setAudioUri(null);
      setAudioFileInfo(null);
      setAudioBase64(null);
      if (sound) {
        await sound.unloadAsync();
        setSound(null);
      }
      setManualModalVisible(false);
    } catch (error) {
      console.error('Error guardando:', error);
      Alert.alert('Error', error.message || 'No se pudo guardar el medicamento');
    }
  };

  // ==================== RENDER (SOLO EL MODAL MANUAL, LO DEMÁS IGUAL) ====================
  // ... (todo el render existente, pero reemplaza el Modal manual con la versión que incluye los botones de audio)
  // Debido a la extensión, aquí solo incluyo el bloque del modal manual modificado.
  // Asegúrate de que el resto del render (cámara, etc.) esté igual que en tu versión estable.

  // Dentro del return, busca la parte donde está <Modal visible={manualModalVisible}...> y reemplázala con:

  return (
    <>
      {/* ... todo el contenido de la pantalla (capture, processing, form) se mantiene exactamente igual ... */}

      {/* MODAL MANUAL CON SECCIÓN DE AUDIO */}
      <Modal visible={manualModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingScrollView style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Registrar Medicamento (Manual)</Text>
              <TouchableOpacity onPress={() => setManualModalVisible(false)}>
                <X color="#6B7280" size={24} />
              </TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              {/* SECCIÓN DE AUDIO NUEVA */}
              <Text style={[styles.label, { marginTop: 0 }]}>🎤 Dictado por Audio</Text>
              <View style={styles.audioControls}>
                {!isRecording ? (
                  <TouchableOpacity style={styles.audioButtonRecord} onPress={startRecording}>
                    <Mic size={24} color="white" />
                    <Text style={styles.audioButtonText}>Grabar</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.audioButtonStop} onPress={stopRecording}>
                    <StopCircle size={24} color="white" />
                    <Text style={styles.audioButtonText}>Detener</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.audioButtonSubir} onPress={pickAudioFile}>
                  <Upload size={24} color="white" />
                  <Text style={styles.audioButtonText}>Subir</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.audioButtonPlay}
                  onPress={playAudio}
                  disabled={!audioUri}
                >
                  <Play size={24} color="white" />
                  <Text style={styles.audioButtonText}>Reproducir</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.audioButtonProcesar,
                    (!audioUri || processingAudio) && styles.audioButtonDisabled,
                  ]}
                  onPress={processAudioWithAI}
                  disabled={!audioUri || processingAudio}
                >
                  {processingAudio ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <>
                      <Sparkles size={20} color="white" />
                      <Text style={styles.audioButtonText}>Procesar con IA</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
              {audioUri && !processingAudio && (
                <Text style={styles.audioInfo}>Audio listo para procesar</Text>
              )}

              {/* El resto del formulario manual (nombre, presentación, categoría, etc.) se mantiene igual */}
              <Text style={styles.label}>Nombre del medicamento *</Text>
              <View style={styles.rowConBoton}>
                <View style={styles.nombreInputContainer}>
                  <TextInput
                    style={styles.input}
                    placeholder="Ej: Paracetamol"
                    placeholderTextColor="#9CA3AF"
                    value={manualFormData.nombre}
                    onChangeText={(t) => setManualFormData({ ...manualFormData, nombre: t })}
                  />
                </View>
                <TouchableOpacity
                  style={styles.aiButton}
                  onPress={() => consultarCategoriaPorTexto(manualFormData.nombre, true)}
                  disabled={consultandoCategoria}
                >
                  {consultandoCategoria ? (
                    <ActivityIndicator size="small" color="#7C3AED" />
                  ) : (
                    <Sparkles size={20} color="#7C3AED" />
                  )}
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Presentación</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: Tabletas 500mg"
                placeholderTextColor="#9CA3AF"
                value={manualFormData.presentacion}
                onChangeText={(t) => setManualFormData({ ...manualFormData, presentacion: t })}
              />

              <Text style={styles.label}>Categoría</Text>
              <CategoriaPicker
                value={manualFormData.categoria}
                onChange={(text) => setManualFormData((prev) => ({ ...prev, categoria: text }))}
                onUbicacionChange={(ubicacion) =>
                  setManualFormData((prev) => ({ ...prev, ubicacion }))
                }
                placeholder="Seleccionar categoría"
                showLabel={false}
              />

              <Text style={styles.label}>Cantidad *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: 50"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
                value={manualFormData.cantidad}
                onChangeText={(t) => setManualFormData({ ...manualFormData, cantidad: t })}
              />

              <Text style={styles.label}>Fecha de vencimiento *</Text>
              <DatePickerInput
                label=""
                value={manualFormData.vencimiento}
                onChange={(date) => setManualFormData({ ...manualFormData, vencimiento: date })}
                placeholder="Seleccionar fecha"
              />

              <Text style={styles.label}>Ubicación</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: Estante A3, Caja 12"
                placeholderTextColor="#9CA3AF"
                value={manualFormData.ubicacion}
                onChangeText={(t) => setManualFormData((prev) => ({ ...prev, ubicacion: t }))}
              />

              <Text style={styles.label}>Foto (opcional)</Text>
              <TouchableOpacity style={styles.imagePickerButton} onPress={pickManualImage}>
                <ImageIcon size={24} color="#7C3AED" />
                <Text style={styles.imagePickerText}>Seleccionar foto</Text>
              </TouchableOpacity>
              {manualImageUri && (
                <View style={styles.manualPreviewContainer}>
                  <Image source={{ uri: manualImageUri }} style={styles.manualPreviewImage} />
                  <TouchableOpacity
                    style={styles.clearManualImage}
                    onPress={() => {
                      setManualImageUri(null);
                      setManualImageBase64(null);
                      manualImageBase64Ref.current = null;
                    }}
                  >
                    <X color="#DC2626" size={16} />
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity style={styles.saveButton} onPress={saveManualMedicamento}>
                <Text style={styles.saveButtonText}>Guardar Medicamento</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingScrollView>
        </View>
      </Modal>
    </>
  );
}

// ==================== ESTILOS (añadir los nuevos) ====================
const styles = StyleSheet.create({
  // ... todos los estilos existentes se mantienen ...
  // Añade estos estilos al final del objeto styles:

  audioControls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 10,
  },
  audioButtonRecord: {
    flex: 1,
    backgroundColor: '#DC2626',
    borderRadius: 30,
    paddingVertical: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    minWidth: 80,
  },
  audioButtonStop: {
    flex: 1,
    backgroundColor: '#F59E0B',
    borderRadius: 30,
    paddingVertical: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    minWidth: 80,
  },
  audioButtonSubir: {
    flex: 1,
    backgroundColor: '#3B82F6',
    borderRadius: 30,
    paddingVertical: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    minWidth: 80,
  },
  audioButtonPlay: {
    flex: 1,
    backgroundColor: '#10B981',
    borderRadius: 30,
    paddingVertical: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    minWidth: 80,
  },
  audioButtonProcesar: {
    flex: 1,
    backgroundColor: '#7C3AED',
    borderRadius: 30,
    paddingVertical: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    minWidth: 100,
  },
  audioButtonDisabled: {
    opacity: 0.5,
  },
  audioButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 12,
  },
  audioInfo: {
    fontSize: 12,
    color: '#10B981',
    textAlign: 'center',
    marginBottom: 16,
  },
});
