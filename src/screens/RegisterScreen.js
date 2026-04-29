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
} from 'react-native';
// ✅ SafeAreaView corregido
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { AudioModule, RecordingPresets, setAudioModeAsync } from 'expo-audio';
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
  // ==================== ESTADOS PRINCIPALES ====================
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
  const [manualModalVisible, setManualModalVisible] = useState(false); // ✅ importante
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

  // ==================== ESTADOS PARA AUDIO ====================
  const [audioUri, setAudioUri] = useState(null);
  const [audioBase64, setAudioBase64] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingRef, setRecordingRef] = useState(null);
  const [sound, setSound] = useState(null);
  const [processingAudio, setProcessingAudio] = useState(false);
  const [audioFileInfo, setAudioFileInfo] = useState(null);

  // Refs
  const imageBase64Ref = useRef(null);
  const manualImageBase64Ref = useRef(null);

  // ==================== EFECTOS ====================
  useEffect(() => {
    const checkApiKey = async () => {
      try {
        const key = await AsyncStorage.getItem('gemini_api_key');
        if (key) {
          console.log('✅ API Key encontrada');
        } else {
          console.log('❌ API Key NO encontrada');
          Alert.alert(
            'Configuración requerida',
            'Debes configurar tu API Key de Gemini en la pantalla de inicio'
          );
        }
      } catch (error) {
        console.error('Error checking API Key:', error);
      }
    };
    checkApiKey();
  }, []);

  useEffect(() => {
    cargarUltimoMedicamento();
  }, []);

  // ==================== FUNCIONES DE UTILIDAD ====================
  const getUserName = () => user?.nombre || 'usuario';

  const obtenerUbicacionDesdeCategoria = async (categoriaNombre) => {
    if (!categoriaNombre || categoriaNombre.trim() === '') return '';
    try {
      const result = await pb.collection('categorias').getList(1, 1, {
        filter: `nombre = "${categoriaNombre}"`,
        requestKey: null,
      });
      if (result.items && result.items.length > 0 && result.items[0].ubicacion) {
        return result.items[0].ubicacion;
      }
      return '';
    } catch (error) {
      console.error('Error obteniendo ubicación de categoría:', error);
      return '';
    }
  };

  const registrarHistory = async (idMed, fecha, user, movimiento, cantidad) => {
    try {
      await pb.collection('history').create({
        id_med: idMed,
        fecha: fecha,
        user: user,
        movimiento: movimiento,
        cantidad: cantidad,
      });
      console.log(`📝 History registrado: ${movimiento}`);
    } catch (error) {
      console.error('Error registrando history:', error);
    }
  };

  const getStatusColor = (fecha) => {
    const days = getDaysUntilExpiry(fecha);
    if (days < 0) return 'vencido';
    if (days <= 30) return 'porVencer';
    return 'vigente';
  };

  const getStatusText = (fecha) => {
    const days = getDaysUntilExpiry(fecha);
    if (days < 0) return 'VENCIDO';
    if (days <= 30) return `Vence en ${days} días`;
    return 'Vigente';
  };

  const cargarUltimoMedicamento = async () => {
    try {
      const result = await pb.collection('medicamentos').getList(1, 1, { sort: '-fecharegistro' });
      setUltimoMedicamento(result.items.length > 0 ? result.items[0] : null);
    } catch (error) {
      console.error('Error cargando último medicamento:', error);
    }
  };

  const comprimirImagenParaStorage = async (uri) => {
    if (!uri) return null;
    setComprimiendo(true);
    try {
      let resultado = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 600 } }], {
        compress: 0.3,
        base64: true,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      return resultado.base64;
    } catch (error) {
      console.error('Error comprimiendo imagen:', error);
      return null;
    } finally {
      setComprimiendo(false);
    }
  };

  // ==================== FUNCIONES DE AUDIO (expo-audio) ====================
  const setupAudio = async () => {
    const status = await AudioModule.requestRecordingPermissionsAsync();
    if (!status.granted) {
      Alert.alert('Permiso denegado', 'Se necesita acceso al micrófono para grabar audio');
      return false;
    }
    await setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: true,
    });
    return true;
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

  const startRecording = async () => {
    const hasPermissions = await setupAudio();
    if (!hasPermissions) return;

    try {
      const recorder = await AudioModule.createRecorder(RecordingPresets.HIGH_QUALITY);
      setRecordingRef(recorder);
      await recorder.prepareToRecordAsync();
      await recorder.record();
      setIsRecording(true);
      console.log('🎙️ Grabación iniciada');
    } catch (err) {
      console.error('Error al grabar:', err);
      Alert.alert('Error', 'No se pudo iniciar la grabación');
    }
  };

  const stopRecording = async () => {
    if (!recordingRef) return;

    try {
      setIsRecording(false);
      await recordingRef.stop();
      const uri = recordingRef.getURI();
      setAudioUri(uri);
      const base64 = await uriToBase64(uri);
      setAudioBase64(base64);
      setAudioFileInfo({
        uri: uri,
        name: `recording_${Date.now()}.mp3`,
        type: 'audio/mpeg',
      });
      console.log('✅ Grabación detenida, archivo en:', uri);
      // Reproducir automáticamente
      const { sound: newSound } = await AudioModule.Sound.createAsync({ uri });
      setSound(newSound);
      await newSound.playAsync();
    } catch (err) {
      console.error('Error al detener grabación:', err);
    } finally {
      setRecordingRef(null);
    }
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
      const base64 = await uriToBase64(asset.uri);
      setAudioBase64(base64);
      const { sound: newSound } = await AudioModule.Sound.createAsync({ uri: asset.uri });
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
      const { sound: newSound } = await AudioModule.Sound.createAsync({ uri: audioUri });
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
  "categoria": "categoría farmacológica (ej: Analgésico, Antibiótico, Antiinflamatorio, Antihipertensivo, etc.),
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

  // ==================== FUNCIONES DE CÁMARA E IMAGEN ====================
  const takePicture = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, base64: true });
      if (!photo.uri) {
        Alert.alert('Error', 'No se pudo obtener la imagen');
        return;
      }
      setImageUri(photo.uri);
      setStep('processing');
      const base64Comprimido = await comprimirImagenParaStorage(photo.uri);
      imageBase64Ref.current = base64Comprimido;
      setImageBase64(base64Comprimido);
      await processImageWithAI(photo.base64);
    } catch (error) {
      console.error('Error tomando foto:', error);
      Alert.alert('Error', 'No se pudo tomar la foto');
      setStep('capture');
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });
    if (!result.canceled && result.assets[0].uri) {
      setImageUri(result.assets[0].uri);
      setStep('processing');
      const base64Comprimido = await comprimirImagenParaStorage(result.assets[0].uri);
      imageBase64Ref.current = base64Comprimido;
      setImageBase64(base64Comprimido);
      await processImageWithAI(result.assets[0].base64);
    }
  };

  const pickManualImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });
    if (!result.canceled && result.assets[0].uri) {
      setManualImageUri(result.assets[0].uri);
      const base64Comprimido = await comprimirImagenParaStorage(result.assets[0].uri);
      manualImageBase64Ref.current = base64Comprimido;
      setManualImageBase64(base64Comprimido);
    }
  };

  const processImageWithAI = async (base64Image) => {
    setProcessing(true);
    const modelos = [{ nombre: 'gemini-2.5-flash' }];
    const MAX_REINTENTOS_POR_MODELO = 3;

    const getPrompt = () => `Analiza esta imagen de medicamento y extrae JSON:
{
  "nombre": "nombre del medicamento",
  "presentacion": "presentación (ej: Tabletas 500mg)",
  "categoria": "categoría farmacológica (Analgésico, Antibiótico, etc.)",
  "vencimiento": "fecha en YYYY-MM-DD"
}`;

    const apiKey = await AsyncStorage.getItem('gemini_api_key');
    if (!apiKey) {
      Alert.alert('Error', 'Configura tu API Key de Gemini primero');
      setStep('capture');
      setProcessing(false);
      return false;
    }

    const intentarConModelo = async (modelo, intento) => {
      console.log(`🔄 Intento ${intento} con modelo ${modelo.nombre}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelo.nombre}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    { text: getPrompt() },
                    { inline_data: { mime_type: 'image/jpeg', data: base64Image } },
                  ],
                },
              ],
              generationConfig: { temperature: 0.2 },
            }),
            signal: controller.signal,
          }
        );
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        text = text
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .trim();
        const aiData = JSON.parse(text);
        return { success: true, data: aiData };
      } catch (error) {
        clearTimeout(timeoutId);
        return { success: false, error: error.message };
      }
    };

    for (const modelo of modelos) {
      for (let intento = 1; intento <= MAX_REINTENTOS_POR_MODELO; intento++) {
        if (intento > 1) await new Promise((r) => setTimeout(r, 10000));
        const resultado = await intentarConModelo(modelo, intento);
        if (resultado.success) {
          setFormData({
            nombre: resultado.data.nombre || '',
            presentacion: resultado.data.presentacion || '',
            categoria: resultado.data.categoria || '',
            cantidad: '',
            vencimiento: resultado.data.vencimiento || '',
            ubicacion: '',
          });
          setStep('form');
          setProcessing(false);
          return true;
        }
      }
    }

    Alert.alert('Error', 'No se pudo procesar la imagen. Ingresa los datos manualmente.', [
      { text: 'Manual', onPress: () => setStep('form') },
      { text: 'Cancelar', onPress: () => setStep('capture') },
    ]);
    setProcessing(false);
    return false;
  };

  // ==================== FUNCIONES DE GUARDADO ====================
  const saveNewMedicamento = async (medData) => {
    try {
      const userName = getUserName();
      const imagenFinal = imageBase64Ref.current || imageBase64 || null;

      let ubicacionFinal = medData.ubicacion || '';
      if (medData.categoria) {
        const ubicacionDesdeCategoria = await obtenerUbicacionDesdeCategoria(medData.categoria);
        if (ubicacionDesdeCategoria) ubicacionFinal = ubicacionDesdeCategoria;
      }

      const medDataWithUser = {
        nombre: medData.nombre,
        presentacion: medData.presentacion || '',
        categoria: medData.categoria || '',
        cantidad: parseInt(medData.cantidad),
        vencimiento: medData.vencimiento,
        ubicacion: ubicacionFinal,
        imagen: imagenFinal,
        username: userName,
        userid: userName,
        activo: true,
        fechabaja: null,
        fecharegistro: new Date().toISOString(),
      };

      const result = await pb.collection('medicamentos').create(medDataWithUser);
      await registrarHistory(
        result.id,
        new Date().toISOString(),
        userName,
        'Añadiendo',
        parseInt(medData.cantidad)
      );
      await cargarUltimoMedicamento();
      Alert.alert('Éxito', 'Medicamento registrado correctamente', [
        { text: 'OK', onPress: resetForm },
      ]);
    } catch (error) {
      console.error('Error guardando:', error);
      Alert.alert('Error', error.message || 'No se pudo guardar el medicamento');
    }
  };

  const saveManualMedicamento = async () => {
    if (!manualFormData.nombre?.trim()) {
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
      const imagenFinal = manualImageBase64Ref.current || manualImageBase64 || null;

      let ubicacionFinal = manualFormData.ubicacion?.trim() || '';
      if (manualFormData.categoria) {
        const ubicacionDesdeCategoria = await obtenerUbicacionDesdeCategoria(
          manualFormData.categoria
        );
        if (ubicacionDesdeCategoria) ubicacionFinal = ubicacionDesdeCategoria;
      }

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

      if (imagenFinal) {
        const blob = await (await fetch(`data:image/jpeg;base64,${imagenFinal}`)).blob();
        formDataToSend.append('imagen', blob, 'medicamento.jpg');
      }

      if (audioFileInfo) {
        const audioBlob = await (await fetch(audioFileInfo.uri)).blob();
        formDataToSend.append('audio', audioBlob, audioFileInfo.name);
      }

      const result = await pb.collection('medicamentos').create(formDataToSend);

      await registrarHistory(
        result.id,
        new Date().toISOString(),
        userName,
        'Añadiendo',
        parseInt(manualFormData.cantidad)
      );
      await cargarUltimoMedicamento();

      Alert.alert('Éxito', 'Medicamento registrado correctamente');

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
      if (sound) await sound.unloadAsync();
      setSound(null);
      setManualModalVisible(false);
    } catch (error) {
      console.error('Error guardando:', error);
      Alert.alert('Error', error.message || 'No se pudo guardar el medicamento');
    }
  };

  const resetForm = () => {
    setStep('capture');
    setImageUri(null);
    setImageBase64(null);
    imageBase64Ref.current = null;
    setFormData({
      nombre: '',
      presentacion: '',
      categoria: '',
      cantidad: '',
      vencimiento: '',
      ubicacion: '',
    });
  };

  const handleSaveNewMed = async () => {
    if (isSaving || comprimiendo) return;
    if (!formData.nombre || !formData.cantidad || !formData.vencimiento) {
      Alert.alert('Error', 'Completa los campos obligatorios');
      return;
    }

    const medData = {
      nombre: formData.nombre.trim(),
      presentacion: formData.presentacion.trim() || 'No especificada',
      categoria: formData.categoria.trim() || 'Sin categoría',
      cantidad: parseInt(formData.cantidad),
      vencimiento: formData.vencimiento,
      ubicacion: formData.ubicacion.trim() || '',
      activo: true,
      fechabaja: null,
    };

    setIsSaving(true);
    setCheckingDuplicate(true);

    try {
      const duplicate = await checkForDuplicates(medData);
      setCheckingDuplicate(false);
      if (duplicate) {
        if (duplicate.activo === false) {
          Alert.alert('Medicamento Inactivo Encontrado', '¿Deseas reactivarlo?', [
            { text: 'Crear nuevo', onPress: () => saveNewMedicamento(medData) },
            {
              text: 'Reactivar',
              onPress: () => reactivarMedicamento(duplicate.id, medData.cantidad),
            },
            { text: 'Cancelar', style: 'cancel' },
          ]);
        } else {
          setDuplicateFound(duplicate);
          setShowDuplicateModal(true);
        }
      } else {
        await saveNewMedicamento(medData);
      }
    } catch (error) {
      console.error('Error verificando duplicados:', error);
      Alert.alert('Error', 'No se pudo verificar duplicados');
    } finally {
      setIsSaving(false);
    }
  };

  const checkForDuplicates = async (medData) => {
    try {
      const result = await pb.collection('medicamentos').getList(1, 1, {
        filter: `nombre = "${medData.nombre}" && presentacion = "${medData.presentacion}"`,
      });
      return result.items.length > 0 ? result.items[0] : null;
    } catch (error) {
      return null;
    }
  };

  const reactivarMedicamento = async (medId, cantidadNueva) => {
    try {
      await pb.collection('medicamentos').update(medId, {
        activo: true,
        cantidad: cantidadNueva,
        fechabaja: null,
        fechareactivacion: new Date().toISOString(),
        useridreactivacion: getUserName(),
      });
      await cargarUltimoMedicamento();
      Alert.alert('Éxito', 'Medicamento reactivado correctamente', [
        { text: 'OK', onPress: resetForm },
      ]);
    } catch (error) {
      Alert.alert('Error', 'No se pudo reactivar el medicamento');
    }
  };

  const consultarCategoriaPorTexto = async (nombreMedicamento, esManual = false, intento = 1) => {
    if (!nombreMedicamento?.trim()) {
      Alert.alert('Error', 'Primero ingresa el nombre del medicamento');
      return;
    }
    setConsultandoCategoria(true);
    const espera = intento * 1000;
    try {
      const apiKey = await AsyncStorage.getItem('gemini_api_key');
      if (!apiKey) {
        Alert.alert('Error', 'Configura tu API Key de Gemini primero');
        return;
      }
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `Cuál es la categoría farmacológica de "${nombreMedicamento}"? Responde SOLO con una palabra de la lista: Analgésico, Antibiótico, Antiinflamatorio, etc.`,
                  },
                ],
              },
            ],
          }),
        }
      );
      if (response.status === 503 && intento < 3) {
        await new Promise((r) => setTimeout(r, espera));
        setConsultandoCategoria(false);
        return consultarCategoriaPorTexto(nombreMedicamento, esManual, intento + 1);
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      let categoria = 'Otros';
      if (data.candidates?.[0]) categoria = data.candidates[0].content.parts[0].text.trim();
      if (esManual) setManualFormData((prev) => ({ ...prev, categoria }));
      else setFormData((prev) => ({ ...prev, categoria }));
      Alert.alert('Categoría sugerida', `"${categoria}"`);
    } catch (error) {
      if (intento < 3) {
        await new Promise((r) => setTimeout(r, espera));
        return consultarCategoriaPorTexto(nombreMedicamento, esManual, intento + 1);
      }
      Alert.alert('Error', 'No se pudo obtener la categoría. Selecciona manualmente.');
    } finally {
      setConsultandoCategoria(false);
    }
  };

  // ==================== RENDER ====================
  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size={50} color="#7C3AED" />
        <Text style={styles.loadingText}>Solicitando permisos de cámara...</Text>
      </View>
    );
  }

  if (step === 'camera') {
    return (
      <SafeAreaView style={styles.cameraContainer}>
        <TouchableOpacity style={styles.cameraClose} onPress={() => setStep('capture')}>
          <X color="white" size={28} />
        </TouchableOpacity>
        <CameraView ref={cameraRef} style={styles.cameraView} facing="back" />
        <View style={styles.cameraOverlay}>
          <View style={styles.cameraFrame} />
          <Text style={styles.cameraHint}>Centra la etiqueta del medicamento</Text>
        </View>
        <View style={styles.cameraControls}>
          <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
            <View style={styles.captureButtonInner} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'capture') {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <Package color="#7C3AED" size={28} />
          <Text style={styles.title}>Registrar Medicamento</Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>¿Cómo quieres obtener la información?</Text>
          <View style={styles.cameraOptions}>
            <TouchableOpacity
              style={styles.cameraOption}
              onPress={() => {
                if (!permission.granted) requestPermission();
                else setStep('camera');
              }}
            >
              <CameraIcon color="#7C3AED" size={32} />
              <Text style={styles.cameraOptionText}>Tomar foto</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cameraOption} onPress={pickImage}>
              <ImageIcon color="#7C3AED" size={32} />
              <Text style={styles.cameraOptionText}>Galería</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.manualButton} onPress={() => setManualModalVisible(true)}>
            <Text style={styles.manualButtonText}>📝 MANUAL SIN IA</Text>
          </TouchableOpacity>
        </View>
        {imageUri && (
          <View style={styles.previewContainer}>
            {(processing || comprimiendo) && (
              <View style={styles.processingOverlay}>
                <ActivityIndicator color="white" size="large" />
                <Text style={styles.processingText}>
                  {comprimiendo ? 'Comprimiendo imagen...' : 'Analizando imagen...'}
                </Text>
              </View>
            )}
            <Image source={{ uri: imageUri }} style={styles.previewImage} />
            <TouchableOpacity
              style={styles.clearImage}
              onPress={() => {
                setImageUri(null);
                setImageBase64(null);
                imageBase64Ref.current = null;
                setProcessing(false);
                setComprimiendo(false);
              }}
            >
              <X color="white" size={16} />
            </TouchableOpacity>
          </View>
        )}
        {ultimoMedicamento && (
          <View style={styles.ultimoMedicamentoSection}>
            <Text style={styles.ultimoMedicamentoTitle}>📋 ÚLTIMO MEDICAMENTO REGISTRADO</Text>
            <View style={[styles.ultimoCard, getStatusColor(ultimoMedicamento.vencimiento)]}>
              <View style={styles.ultimoCardHeader}>
                <View style={styles.ultimoInfo}>
                  <Text style={styles.ultimoNombre}>{ultimoMedicamento.nombre}</Text>
                  <Text style={styles.ultimoPresentation}>{ultimoMedicamento.presentacion}</Text>
                  <Text style={styles.ultimoCategory}>📋 {ultimoMedicamento.categoria}</Text>
                  {ultimoMedicamento.ubicacion && (
                    <Text style={styles.ultimoUbicacion}>📍 {ultimoMedicamento.ubicacion}</Text>
                  )}
                  <Text style={styles.ultimoUser}>
                    👤 Registrado por: {ultimoMedicamento.username || 'usuario'}
                  </Text>
                </View>
                {ultimoMedicamento.imagen && (
                  <Image
                    source={{ uri: `data:image/jpeg;base64,${ultimoMedicamento.imagen}` }}
                    style={styles.ultimoImage}
                  />
                )}
              </View>
              <View style={styles.ultimoDetails}>
                <View style={styles.ultimoRow}>
                  <Text style={styles.ultimoLabel}>Cantidad:</Text>
                  <Text style={styles.ultimoValue}>{ultimoMedicamento.cantidad} uds</Text>
                </View>
                <View style={styles.ultimoRow}>
                  <Text style={styles.ultimoLabel}>Vencimiento:</Text>
                  <Text style={styles.ultimoValue}>
                    {new Date(ultimoMedicamento.vencimiento).toLocaleDateString()}
                  </Text>
                </View>
                <View style={styles.ultimoStatus}>
                  <View style={[styles.ultimoBadge, getStatusColor(ultimoMedicamento.vencimiento)]}>
                    <Text style={styles.ultimoStatusText}>
                      {getStatusText(ultimoMedicamento.vencimiento)}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    );
  }

  if (step === 'processing') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size={50} color="#7C3AED" />
        <Text style={styles.processingText}>Analizando imagen con IA...</Text>
        <Text style={styles.processingSubtext}>Esto tomará unos segundos</Text>
      </View>
    );
  }

  if (step === 'form') {
    return (
      <KeyboardAvoidingScrollView>
        <View style={styles.formHeader}>
          <TouchableOpacity style={styles.backButton} onPress={resetForm}>
            <X color="#6B7280" size={24} />
          </TouchableOpacity>
          <Text style={styles.formTitle}>Completa los datos</Text>
          <View style={{ width: 40 }} />
        </View>
        {imageUri && <Image source={{ uri: imageUri }} style={styles.previewImageSmall} />}
        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nombre del medicamento *</Text>
            <View style={styles.rowConBoton}>
              <View style={styles.nombreInputContainer}>
                <TextInput
                  style={styles.input}
                  value={formData.nombre}
                  onChangeText={(t) => setFormData({ ...formData, nombre: t })}
                  placeholder="Ej: Paracetamol"
                />
              </View>
              <TouchableOpacity
                style={styles.aiButton}
                onPress={() => consultarCategoriaPorTexto(formData.nombre, false)}
                disabled={consultandoCategoria}
              >
                {consultandoCategoria ? (
                  <ActivityIndicator size="small" color="#7C3AED" />
                ) : (
                  <Sparkles size={20} color="#7C3AED" />
                )}
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Presentación</Text>
            <TextInput
              style={styles.input}
              value={formData.presentacion}
              onChangeText={(t) => setFormData({ ...formData, presentacion: t })}
              placeholder="Ej: Tabletas 500mg"
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Categoría</Text>
            <CategoriaPicker
              value={formData.categoria}
              onChange={(text) => setFormData({ ...formData, categoria: text })}
              placeholder="Seleccionar categoría"
              showLabel={false}
            />
          </View>
          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
              <Text style={styles.label}>Cantidad *</Text>
              <TextInput
                style={styles.input}
                value={formData.cantidad}
                onChangeText={(t) => setFormData({ ...formData, cantidad: t })}
                keyboardType="numeric"
                placeholder="Ej: 50"
              />
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>Vencimiento *</Text>
              <DatePickerInput
                label=""
                value={formData.vencimiento}
                onChange={(date) => setFormData({ ...formData, vencimiento: date })}
                required={true}
              />
            </View>
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Ubicación</Text>
            <TextInput
              style={styles.input}
              value={formData.ubicacion}
              onChangeText={(t) => setFormData({ ...formData, ubicacion: t })}
              placeholder="Ej: Estante A3"
            />
          </View>
          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSaveNewMed}
            disabled={checkingDuplicate || isSaving || comprimiendo}
          >
            {checkingDuplicate || isSaving || comprimiendo ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <>
                <Check color="white" size={20} />
                <Text style={styles.saveButtonText}>Guardar Medicamento</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingScrollView>
    );
  }

  // ==================== MODAL MANUAL CON AUDIO ====================
  return (
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

            <Text style={styles.label}>Nombre del medicamento *</Text>
            <View style={styles.rowConBoton}>
              <View style={styles.nombreInputContainer}>
                <TextInput
                  style={styles.input}
                  value={manualFormData.nombre}
                  onChangeText={(t) => setManualFormData({ ...manualFormData, nombre: t })}
                  placeholder="Ej: Paracetamol"
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
              value={manualFormData.presentacion}
              onChangeText={(t) => setManualFormData({ ...manualFormData, presentacion: t })}
              placeholder="Ej: Tabletas 500mg"
            />

            <Text style={styles.label}>Categoría</Text>
            <CategoriaPicker
              value={manualFormData.categoria}
              onChange={(text) => setManualFormData({ ...manualFormData, categoria: text })}
              onUbicacionChange={(ubicacion) =>
                setManualFormData((prev) => ({ ...prev, ubicacion }))
              }
              placeholder="Seleccionar categoría"
              showLabel={false}
            />

            <Text style={styles.label}>Cantidad *</Text>
            <TextInput
              style={styles.input}
              value={manualFormData.cantidad}
              onChangeText={(t) => setManualFormData({ ...manualFormData, cantidad: t })}
              keyboardType="numeric"
              placeholder="Ej: 50"
            />

            <Text style={styles.label}>Fecha de vencimiento *</Text>
            <DatePickerInput
              label=""
              value={manualFormData.vencimiento}
              onChange={(date) => setManualFormData({ ...manualFormData, vencimiento: date })}
            />

            <Text style={styles.label}>Ubicación</Text>
            <TextInput
              style={styles.input}
              value={manualFormData.ubicacion}
              onChangeText={(t) => setManualFormData((prev) => ({ ...prev, ubicacion: t }))}
              placeholder="Ej: Estante A3"
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    padding: 20,
  },
  loadingText: { marginTop: 10, fontSize: 14, color: '#6B7280' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'white',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: { fontSize: 20, fontWeight: 'bold', color: '#1F2937', flex: 1, marginLeft: 10 },
  section: { backgroundColor: 'white', margin: 16, padding: 20, borderRadius: 16, elevation: 2 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 20,
    textAlign: 'center',
  },
  cameraOptions: { flexDirection: 'row', justifyContent: 'space-around' },
  cameraOption: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    width: '45%',
  },
  cameraOptionText: { marginTop: 12, color: '#4B5563', fontWeight: '500' },
  manualButton: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  manualButtonText: { color: '#4B5563', fontWeight: '600', fontSize: 16 },
  previewContainer: { margin: 16, position: 'relative' },
  previewImage: { width: '100%', height: 220, borderRadius: 16 },
  clearImage: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    padding: 8,
  },
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  processingText: { color: 'white', fontSize: 16, fontWeight: '500', marginTop: 12 },
  cameraContainer: { flex: 1, backgroundColor: 'black' },
  cameraView: { flex: 1 },
  cameraClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 8,
  },
  cameraOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraFrame: {
    width: 260,
    height: 160,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  cameraHint: {
    color: 'white',
    fontSize: 14,
    marginTop: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  cameraControls: { position: 'absolute', bottom: 48, left: 0, right: 0, alignItems: 'center' },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderWidth: 3,
    borderColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: 'white' },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: { padding: 8 },
  formTitle: { fontSize: 18, fontWeight: 'bold', color: '#1F2937' },
  previewImageSmall: { width: '100%', height: 180, resizeMode: 'cover' },
  form: { padding: 20 },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 5 },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: '#1F2937',
  },
  row: { flexDirection: 'row', marginBottom: 20 },
  rowConBoton: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nombreInputContainer: { flex: 1 },
  aiButton: {
    backgroundColor: '#EDE9FE',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButton: {
    backgroundColor: '#7C3AED',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 10,
    marginTop: 20,
    gap: 8,
  },
  saveButtonDisabled: { opacity: 0.7 },
  saveButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  processingSubtext: { fontSize: 14, color: '#6B7280', marginTop: 5 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 24,
    width: '90%',
    maxHeight: '85%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1F2937' },
  modalBody: { padding: 20 },
  ultimoMedicamentoSection: { marginHorizontal: 16, marginVertical: 10 },
  ultimoMedicamentoTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#6B7280',
    marginBottom: 8,
    marginLeft: 4,
  },
  ultimoCard: { backgroundColor: 'white', borderRadius: 16, padding: 16, elevation: 2 },
  vigente: { borderLeftWidth: 4, borderLeftColor: '#22C55E' },
  porVencer: { borderLeftWidth: 4, borderLeftColor: '#EA580C' },
  vencido: { borderLeftWidth: 4, borderLeftColor: '#DC2626' },
  ultimoCardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  ultimoInfo: { flex: 1 },
  ultimoNombre: { fontSize: 16, fontWeight: 'bold', color: '#1F2937', marginBottom: 2 },
  ultimoPresentation: { fontSize: 13, color: '#6B7280', marginBottom: 2 },
  ultimoCategory: { fontSize: 11, color: '#9CA3AF', marginBottom: 2 },
  ultimoUbicacion: { fontSize: 11, color: '#10B981', marginTop: 2 },
  ultimoUser: { fontSize: 10, color: '#7C3AED', marginTop: 4, fontStyle: 'italic' },
  ultimoImage: { width: 50, height: 50, borderRadius: 8, marginLeft: 12 },
  ultimoDetails: { marginTop: 4 },
  ultimoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  ultimoLabel: { fontSize: 12, color: '#6B7280' },
  ultimoValue: { fontSize: 13, fontWeight: '500', color: '#1F2937' },
  ultimoStatus: { alignItems: 'flex-end', marginTop: 4 },
  ultimoBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  ultimoStatusText: { fontSize: 11, fontWeight: 'bold' },
  imagePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    padding: 12,
    gap: 8,
    marginBottom: 16,
  },
  imagePickerText: { color: '#7C3AED', fontWeight: '500', fontSize: 14 },
  manualPreviewContainer: { position: 'relative', marginBottom: 16, alignItems: 'center' },
  manualPreviewImage: { width: '100%', height: 150, borderRadius: 10 },
  clearManualImage: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    padding: 4,
  },
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
  audioButtonDisabled: { opacity: 0.5 },
  audioButtonText: { color: 'white', fontWeight: '600', fontSize: 12 },
  audioInfo: { fontSize: 12, color: '#10B981', textAlign: 'center', marginBottom: 16 },
});
