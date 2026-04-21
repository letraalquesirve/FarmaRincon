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
} from 'lucide-react-native';
import DatePickerInput from '../components/DatePickerInput';
import KeyboardAvoidingScrollView from '../components/KeyboardAvoidingScrollView';
import { getDaysUntilExpiry } from '../utils/dateUtils';
import CategoriaPicker from '../components/CategoriaPicker';
import { pb } from '../services/PocketBaseConfig';

export default function RegisterScreen({ user }) {
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

  const imageBase64Ref = useRef(null);
  const manualImageBase64Ref = useRef(null);

  // Al inicio del componente, después de los useState
  useEffect(() => {
    const checkApiKey = async () => {
      try {
        const key = await AsyncStorage.getItem('gemini_api_key');
        if (key) {
          console.log('✅ API Key encontrada:', key.substring(0, 30) + '...');
        } else {
          console.log('❌ API Key NO encontrada en AsyncStorage');
          Alert.alert(
            'Configuración requerida',
            'Debes configurar tu API Key de Gemini.\n\nToca el botón 🔑 en la pantalla de inicio para configurarla.'
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

  const getUserName = () => user?.nombre || 'usuario';

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
      const result = await pb.collection('medicamentos').getList(1, 1, { sort: '-fechaRegistro' });
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
      const pesoKB = (resultado.base64.length * 0.75) / 1024;
      console.log(`Imagen para almacenamiento: ${pesoKB.toFixed(2)} KB`);
      return resultado.base64;
    } catch (error) {
      console.error('Error comprimiendo imagen:', error);
      return null;
    } finally {
      setComprimiendo(false);
    }
  };

  // RegisterScreen.js - Función mejorada para consultar categoría
  const consultarCategoriaPorTexto = async (nombreMedicamento, esManual = false, intento = 1) => {
    if (!nombreMedicamento || nombreMedicamento.trim() === '') {
      Alert.alert('Error', 'Primero ingresa el nombre del medicamento');
      return;
    }

    setConsultandoCategoria(true);

    // Esperar entre reintentos (1s, 2s, 4s)
    const espera = intento * 1000;

    try {
      const apiKey = await AsyncStorage.getItem('gemini_api_key');
      if (!apiKey) {
        Alert.alert('Error', 'Configura tu API Key de Gemini primero');
        return;
      }

      console.log(`🔍 Intento ${intento}: Consultando categoría para:`, nombreMedicamento);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

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
                    text: `Cuál es la categoría farmacológica de "${nombreMedicamento}"? Responde SOLO con una palabra.`,
                  },
                ],
              },
            ],
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      // Si es error 503 y no es el último intento, reintentar
      if (response.status === 503 && intento < 3) {
        console.log(`⚠️ Gemini saturado (503), reintentando en ${espera / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, espera));
        setConsultandoCategoria(false);
        return consultarCategoriaPorTexto(nombreMedicamento, esManual, intento + 1);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      let categoria = 'Otros';
      if (data.candidates && data.candidates[0]) {
        categoria = data.candidates[0].content.parts[0].text.trim();
        if (categoria.length > 30) categoria = 'Otros';
      }

      if (esManual) {
        setManualFormData({ ...manualFormData, categoria });
      } else {
        setFormData({ ...formData, categoria });
      }

      Alert.alert('Categoría sugerida', `"${categoria}"\nPuedes cambiarla manualmente.`);
    } catch (error) {
      console.error(`❌ Intento ${intento} fallido:`, error.message);

      if (intento < 3) {
        console.log(`🔄 Reintentando en ${espera / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, espera));
        setConsultandoCategoria(false);
        return consultarCategoriaPorTexto(nombreMedicamento, esManual, intento + 1);
      }

      Alert.alert('Error', 'El servicio de IA está ocupado. Selecciona la categoría manualmente.');
    } finally {
      setConsultandoCategoria(false);
    }
  };

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

  const processImageWithAI = async (base64Image, intentos = 2) => {
    setProcessing(true);
    for (let i = 0; i < intentos; i++) {
      try {
        const apiKey = await AsyncStorage.getItem('gemini_api_key');
        if (!apiKey) {
          Alert.alert('Error', 'Configura tu API Key de Gemini primero');
          setStep('capture');
          setProcessing(false);
          return false;
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
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
                      text: `Analiza esta imagen de un medicamento y extrae la siguiente información en formato JSON:
{ "nombre": "nombre del medicamento", "presentacion": "presentación completa", "categoria": "categoría farmacológica", "vencimiento": "fecha de vencimiento en formato YYYY-MM-DD" }`,
                    },
                    { inline_data: { mime_type: 'image/jpeg', data: base64Image } },
                  ],
                },
              ],
            }),
            signal: controller.signal,
          }
        );
        clearTimeout(timeoutId);
        const data = await response.json();
        if (data.error && data.error.code === 503) {
          if (i === intentos - 1) {
            Alert.alert(
              'Servicio ocupado',
              'Gemini está con mucha demanda. ¿Quieres ingresar los datos manualmente?',
              [
                { text: 'Reintentar', onPress: () => processImageWithAI(base64Image, 1) },
                { text: 'Ingresar manual', onPress: () => setStep('form') },
                { text: 'Cancelar', onPress: () => setStep('capture') },
              ]
            );
            setProcessing(false);
            return false;
          }
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (!data.candidates || !data.candidates[0])
          throw new Error('Respuesta inválida de Gemini');
        const text = data.candidates[0].content.parts[0].text;
        const cleanedText = text.replace(/```json|```/g, '').trim();
        const aiData = JSON.parse(cleanedText);
        setFormData({
          nombre: aiData.nombre || '',
          presentacion: aiData.presentacion || '',
          categoria: aiData.categoria || '',
          cantidad: '',
          vencimiento: aiData.vencimiento || '',
          ubicacion: '',
        });
        setStep('form');
        setProcessing(false);
        return true;
      } catch (error) {
        console.error(`Intento ${i + 1} fallido:`, error);
        if (i === intentos - 1) {
          Alert.alert(
            'Error de conexión',
            'No se pudo conectar con el servicio de IA. ¿Quieres ingresar los datos manualmente?',
            [
              { text: 'Reintentar', onPress: () => processImageWithAI(base64Image, 1) },
              { text: 'Ingresar manual', onPress: () => setStep('form') },
              { text: 'Cancelar', onPress: () => setStep('capture') },
            ]
          );
          setProcessing(false);
          return false;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    setProcessing(false);
    return false;
  };

  const saveNewMedicamento = async (medData) => {
    try {
      console.log('🔍 medData recibido:', medData);
      console.log('🔍 nombre:', medData.nombre);
      console.log('🔍 cantidad:', medData.cantidad);
      console.log('🔍 vencimiento:', medData.vencimiento);

      const userName = getUserName();
      const imagenFinal = imageBase64Ref.current || imageBase64 || null;

      // Verificar que los campos requeridos existen
      if (!medData.nombre) {
        console.error('❌ nombre está vacío');
        throw new Error('El nombre es obligatorio');
      }
      if (!medData.cantidad) {
        console.error('❌ cantidad está vacío');
        throw new Error('La cantidad es obligatoria');
      }
      if (!medData.vencimiento) {
        console.error('❌ vencimiento está vacío');
        throw new Error('La fecha de vencimiento es obligatoria');
      }

      const medDataWithUser = {
        nombre: medData.nombre,
        presentacion: medData.presentacion || '',
        categoria: medData.categoria || '',
        cantidad: parseInt(medData.cantidad),
        vencimiento: medData.vencimiento,
        ubicacion: medData.ubicacion || '',
        imagen: imagenFinal,
        userName: userName,
        userId: userName,
        activo: true,
        fechaBaja: null,
        fechaRegistro: new Date().toISOString(),
      };

      console.log('📦 Enviando a PocketBase:', JSON.stringify(medDataWithUser, null, 2));

      const result = await pb.collection('medicamentos').create(medDataWithUser);
      console.log('✅ Medicamento creado:', result.id);

      await cargarUltimoMedicamento();
      Alert.alert('Éxito', 'Medicamento registrado correctamente', [
        { text: 'OK', onPress: resetForm },
      ]);
    } catch (error) {
      console.error('❌ Error guardando:', error);
      console.error('❌ Response data:', error.data);
      Alert.alert('Error', error.message || 'No se pudo guardar el medicamento');
    }
  };

  const saveManualMedicamento = async () => {
    if (!manualFormData.nombre || !manualFormData.cantidad || !manualFormData.vencimiento) {
      Alert.alert('Error', 'Completa los campos obligatorios');
      return;
    }
    const medData = {
      nombre: manualFormData.nombre.trim(),
      presentacion: manualFormData.presentacion.trim() || 'No especificada',
      categoria: manualFormData.categoria.trim() || 'Sin categoría',
      cantidad: parseInt(manualFormData.cantidad),
      vencimiento: manualFormData.vencimiento,
      ubicacion: manualFormData.ubicacion.trim() || '',
      activo: true,
      fechaBaja: null,
    };
    const imagenFinal = manualImageBase64Ref.current || manualImageBase64 || null;
    try {
      const userName = getUserName();
      await pb.collection('medicamentos').create({
        ...medData,
        userId: userName,
        userName: userName,
        imagen: imagenFinal,
        fechaRegistro: new Date().toISOString(),
      });
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
      setManualModalVisible(false);
    } catch (error) {
      console.error('Error guardando:', error);
      Alert.alert('Error', 'No se pudo guardar el medicamento');
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

  // RegisterScreen.js - Agregar esta función
  const handleSaveNewMed = async () => {
    if (isSaving || comprimiendo) return;

    // Validar campos obligatorios
    if (!formData.nombre || !formData.cantidad || !formData.vencimiento) {
      Alert.alert('Error', 'Completa los campos obligatorios: Nombre, Cantidad y Vencimiento');
      return;
    }

    // Preparar los datos del medicamento
    const medData = {
      nombre: formData.nombre.trim(),
      presentacion: formData.presentacion.trim() || 'No especificada',
      categoria: formData.categoria.trim() || 'Sin categoría',
      cantidad: parseInt(formData.cantidad),
      vencimiento: formData.vencimiento,
      ubicacion: formData.ubicacion.trim() || '',
      activo: true,
      fechaBaja: null,
    };

    console.log('📦 medData a guardar:', medData);

    setIsSaving(true);
    setCheckingDuplicate(true);

    try {
      // Verificar duplicados
      const duplicate = await checkForDuplicates(medData);
      setCheckingDuplicate(false);

      if (duplicate) {
        if (duplicate.activo === false) {
          Alert.alert(
            'Medicamento Inactivo Encontrado',
            `Ya existe un medicamento inactivo con el mismo nombre y presentación:\n\n${duplicate.nombre} ${duplicate.presentacion}\n\n¿Deseas reactivarlo en lugar de crear uno nuevo?`,
            [
              { text: 'Crear nuevo', onPress: () => saveNewMedicamento(medData) },
              {
                text: 'Reactivar existente',
                onPress: () => reactivarMedicamento(duplicate.id, medData.cantidad),
              },
              { text: 'Cancelar', style: 'cancel' },
            ]
          );
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

  // Verificar duplicados en PocketBase
  const checkForDuplicates = async (medData) => {
    try {
      const result = await pb.collection('medicamentos').getList(1, 1, {
        filter: `nombre = "${medData.nombre}" && presentacion = "${medData.presentacion}"`,
      });
      return result.items.length > 0 ? result.items[0] : null;
    } catch (error) {
      console.error('Error checking duplicates:', error);
      return null;
    }
  };

  // Reactivar medicamento
  const reactivarMedicamento = async (medId, cantidadNueva) => {
    try {
      await pb.collection('medicamentos').update(medId, {
        activo: true,
        cantidad: cantidadNueva,
        fechaBaja: null,
        fechaReactivacion: new Date().toISOString(),
        userIdReactivacion: getUserName(),
      });
      await cargarUltimoMedicamento();
      Alert.alert('Éxito', 'Medicamento reactivado correctamente', [
        { text: 'OK', onPress: resetForm },
      ]);
    } catch (error) {
      console.error('Error reactivando:', error);
      Alert.alert('Error', 'No se pudo reactivar el medicamento');
    }
  };

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

  if (showDuplicateModal && duplicateFound) {
    return (
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <AlertCircle color="#EA580C" size={24} />
            <Text style={styles.modalTitle}>Medicamento Duplicado</Text>
            <TouchableOpacity onPress={() => setShowDuplicateModal(false)}>
              <X color="#6B7280" size={20} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <View style={styles.duplicateInfo}>
              <Text style={styles.duplicateLabel}>Medicamento existente:</Text>
              <Text style={styles.duplicateName}>{duplicateFound.nombre}</Text>
              <Text style={styles.duplicateDetail}>
                Presentación: {duplicateFound.presentacion}
              </Text>
              <Text style={styles.duplicateDetail}>Categoría: {duplicateFound.categoria}</Text>
              <Text style={styles.duplicateDetail}>
                Stock actual: {duplicateFound.cantidad} unidades
              </Text>
              <Text style={styles.duplicateDetail}>
                Vence: {new Date(duplicateFound.vencimiento).toLocaleDateString()}
              </Text>
            </View>
            <View style={styles.duplicateInfo}>
              <Text style={styles.duplicateLabel}>Nuevo medicamento:</Text>
              <Text style={styles.duplicateName}>{formData.nombre}</Text>
              <Text style={styles.duplicateDetail}>Presentación: {formData.presentacion}</Text>
              <Text style={styles.duplicateDetail}>Categoría: {formData.categoria}</Text>
              <Text style={styles.duplicateDetail}>Cantidad: {formData.cantidad} unidades</Text>
              <Text style={styles.duplicateDetail}>
                Vence: {new Date(formData.vencimiento).toLocaleDateString()}
              </Text>
            </View>
            <View style={styles.duplicateActions}>
              <TouchableOpacity
                style={[styles.duplicateButton, styles.sumarButton]}
                onPress={handleSumarAExistente}
              >
                <Package color="white" size={20} />
                <Text style={{ color: 'white' }}>Sumar al existente</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.duplicateButton, styles.nuevoButton]}
                onPress={handleCrearNuevoLote}
              >
                <Plus color="white" size={20} />
                <Text style={{ color: 'white' }}>Crear nuevo lote</Text>
              </TouchableOpacity>
              {duplicateFound.activo === false && (
                <TouchableOpacity
                  style={[styles.duplicateButton, styles.reactivarButton]}
                  onPress={() =>
                    reactivarMedicamento(duplicateFound.id, parseInt(formData.cantidad))
                  }
                >
                  <Check color="white" size={20} />
                  <Text style={{ color: 'white' }}>Reactivar existente</Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    );
  }

  if (step === 'capture') {
    return (
      <>
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
            <TouchableOpacity
              style={styles.manualButton}
              onPress={() => setManualModalVisible(true)}
            >
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
                      👤 Registrado por: {ultimoMedicamento.userName || 'usuario'}
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
                    <View
                      style={[styles.ultimoBadge, getStatusColor(ultimoMedicamento.vencimiento)]}
                    >
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
                  onChange={(text) => setManualFormData({ ...manualFormData, categoria: text })}
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
                  onChangeText={(t) => setManualFormData({ ...manualFormData, ubicacion: t })}
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
        {comprimiendo && (
          <View style={styles.checkingContainer}>
            <ActivityIndicator size="small" color="#7C3AED" />
            <Text style={styles.checkingText}>Comprimiendo imagen...</Text>
          </View>
        )}
        {checkingDuplicate && (
          <View style={styles.checkingContainer}>
            <ActivityIndicator size="small" color="#7C3AED" />
            <Text style={styles.checkingText}>Verificando duplicados...</Text>
          </View>
        )}
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
                  placeholderTextColor="#9CA3AF"
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
              placeholderTextColor="#9CA3AF"
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
                placeholder="Ej: 50"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
              />
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>Fecha de vencimiento *</Text>
              <DatePickerInput
                label=""
                value={formData.vencimiento}
                onChange={(date) => setFormData({ ...formData, vencimiento: date })}
                placeholder="Seleccionar fecha"
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
              placeholder="Ej: Estante A3, Caja 12"
              placeholderTextColor="#9CA3AF"
              maxLength={255}
            />
          </View>
          <TouchableOpacity
            style={[
              styles.saveButton,
              (checkingDuplicate || isSaving || comprimiendo) && styles.saveButtonDisabled,
            ]}
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
}

// Estilos (mantener los mismos que tenías en RegisterScreen original)
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
  checkingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: '#EDE9FE',
    gap: 8,
  },
  checkingText: { color: '#7C3AED', fontSize: 14, fontWeight: '500' },
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
    borderRadius: 20,
    width: '90%',
    maxHeight: '80%',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1F2937', flex: 1, marginLeft: 10 },
  modalBody: { flex: 1 },
  duplicateInfo: { backgroundColor: '#F3F4F6', padding: 15, borderRadius: 10, marginBottom: 15 },
  duplicateLabel: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 5 },
  duplicateName: { fontSize: 16, fontWeight: 'bold', color: '#1F2937', marginBottom: 5 },
  duplicateDetail: { fontSize: 14, color: '#6B7280', marginBottom: 2 },
  duplicateActions: { gap: 10, marginTop: 10 },
  duplicateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    borderRadius: 10,
    gap: 8,
  },
  sumarButton: { backgroundColor: '#10B981' },
  nuevoButton: { backgroundColor: '#7C3AED' },
  reactivarButton: { backgroundColor: '#F59E0B' },
  ultimoMedicamentoSection: { marginHorizontal: 16, marginVertical: 10 },
  ultimoMedicamentoTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#6B7280',
    marginBottom: 8,
    marginLeft: 4,
  },
  ultimoCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
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
});
