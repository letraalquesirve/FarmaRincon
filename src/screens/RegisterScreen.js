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
import { db } from '../../firebaseConfig';
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  orderBy,
  limit,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Camera as CameraIcon,
  Image as ImageIcon,
  X,
  Check,
  AlertCircle,
  Package,
  Plus,
} from 'lucide-react-native';
import DatePickerInput from '../components/DatePickerInput';
import KeyboardAvoidingScrollView from '../components/KeyboardAvoidingScrollView';
import { getDaysUntilExpiry } from '../utils/dateUtils';
import CategoriaPicker from '../components/CategoriaPicker';
export default function RegisterScreen() {
  const [step, setStep] = useState('capture');
  const [image, setImage] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [duplicateFound, setDuplicateFound] = useState(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
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
  const [ultimoMedicamento, setUltimoMedicamento] = useState(null);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);

  // Cargar el último medicamento registrado
  useEffect(() => {
    cargarUltimoMedicamento();
  }, []);

  const cargarUltimoMedicamento = async () => {
    try {
      const medicamentosRef = collection(db, 'medicamentos');
      const q = query(medicamentosRef, orderBy('fechaRegistro', 'desc'), limit(1));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        setUltimoMedicamento({ id: doc.id, ...doc.data() });
      } else {
        setUltimoMedicamento(null);
      }
    } catch (error) {
      console.error('Error cargando último medicamento:', error);
    }
  };

  const takePicture = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
      });
      setImage(photo.uri);
      setStep('processing');
      processImageWithAI(photo.base64);
    } catch (error) {
      Alert.alert('Error', 'No se pudo tomar la foto');
      setStep('capture');
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled) {
      setImage(result.assets[0].uri);
      setStep('processing');
      processImageWithAI(result.assets[0].base64);
    }
  };

  const processImageWithAI = async (base64Image) => {
    setProcessing(true);
    try {
      const apiKey = await AsyncStorage.getItem('gemini_api_key');
      if (!apiKey) {
        Alert.alert('Error', 'Configura tu API Key de Gemini primero');
        setStep('capture');
        setProcessing(false);
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
                    text: `Analiza esta imagen de un medicamento y extrae la siguiente información en formato JSON:
                          {
                            "nombre": "nombre del medicamento",
                            "presentacion": "presentación completa (ej: Tabletas 500mg, solución inyectable 1g/2ml, crema 30g)",
                            "categoria": "categoría farmacológica según su uso (ej: Analgésico, Antibiótico, Antiinflamatorio, Antihipertensivo, Antidiabético, Antihistamínico, Antidepresivo, Ansiolítico, Anticonvulsivante, Anticoagulante, Broncodilatador, Corticosteroide, Diurético, Relajante muscular, Vitaminas, Suplemento, Antiséptico, Antifúngico, Antiviral, Antiparasitario, Antiemético, Antiespasmódico, Laxante, Antidiarreico, Antiácido, Expectorante, Antitusivo, Descongestionante, Otros)",
                            "vencimiento": "fecha de vencimiento en formato YYYY-MM-DD"
                          }
                          IMPORTANTE: La categoría debe ser lo más específica posible dentro de las opciones listadas. Si no estás seguro, usa "Otros". No inventes categorías fuera de la lista.`,
                  },
                  { inline_data: { mime_type: 'image/jpeg', data: base64Image } },
                ],
              },
            ],
          }),
        }
      );

      const data = await response.json();
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
    } catch (error) {
      console.error('Error procesando imagen:', error);
      Alert.alert('Error', 'No se pudo analizar la imagen. Completa los datos manualmente.');
      setStep('form');
    } finally {
      setProcessing(false);
    }
  };

  const checkForDuplicates = async (medData) => {
    try {
      const medicamentosRef = collection(db, 'medicamentos');
      const q = query(
        medicamentosRef,
        where('nombre', '>=', medData.nombre),
        where('nombre', '<=', medData.nombre + '\uf8ff')
      );
      const querySnapshot = await getDocs(q);
      const results = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (
          data.nombre.toLowerCase() === medData.nombre.toLowerCase() &&
          data.presentacion?.toLowerCase() === medData.presentacion?.toLowerCase()
        ) {
          results.push({ id: doc.id, ...data });
        }
      });
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      console.error('Error checking duplicates:', error);
      return null;
    }
  };

  const saveNewMedicamento = async (medData) => {
    try {
      await addDoc(collection(db, 'medicamentos'), medData);
      await cargarUltimoMedicamento(); // Recargar el último medicamento
      Alert.alert('Éxito', 'Medicamento registrado correctamente', [
        {
          text: 'OK',
          onPress: () => {
            setStep('capture');
            setImage(null);
            setFormData({
              nombre: '',
              presentacion: '',
              categoria: '',
              cantidad: '',
              vencimiento: '',
              ubicacion: '',
            });
          },
        },
      ]);
    } catch (error) {
      Alert.alert('Error', 'No se pudo guardar el medicamento');
    }
  };

  const reactivarMedicamento = async (medId, cantidadNueva) => {
    try {
      const medRef = doc(db, 'medicamentos', medId);
      await updateDoc(medRef, {
        activo: true,
        cantidad: cantidadNueva,
        fechaBaja: null,
        fechaReactivacion: new Date().toISOString(),
      });
      await cargarUltimoMedicamento();
      Alert.alert('Éxito', 'Medicamento reactivado correctamente', [
        {
          text: 'OK',
          onPress: () => {
            setStep('capture');
            setImage(null);
            setFormData({
              nombre: '',
              presentacion: '',
              categoria: '',
              cantidad: '',
              vencimiento: '',
              ubicacion: '',
            });
          },
        },
      ]);
    } catch (error) {
      Alert.alert('Error', 'No se pudo reactivar el medicamento');
    }
  };

  const handleSaveNewMed = async () => {
    if (isSaving) return;
    if (!formData.nombre || !formData.cantidad || !formData.vencimiento) {
      Alert.alert('Error', 'Completa los campos obligatorios: Nombre, Cantidad y Vencimiento');
      return;
    }

    setIsSaving(true);
    setCheckingDuplicate(true);

    const medData = {
      nombre: formData.nombre.trim(),
      presentacion: formData.presentacion.trim() || 'No especificada',
      categoria: formData.categoria.trim() || 'Sin categoría',
      cantidad: parseInt(formData.cantidad),
      vencimiento: formData.vencimiento,
      ubicacion: formData.ubicacion.trim() || '',
      imagen: image,
      fechaRegistro: new Date().toISOString(),
      activo: true,
      fechaBaja: null,
    };

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

    setIsSaving(false);
  };

  const handleSumarAExistente = async () => {
    try {
      const nuevaCantidad = duplicateFound.cantidad + parseInt(formData.cantidad);
      const medRef = doc(db, 'medicamentos', duplicateFound.id);
      await updateDoc(medRef, { cantidad: nuevaCantidad, activo: true, fechaBaja: null });
      await cargarUltimoMedicamento();
      setShowDuplicateModal(false);
      setDuplicateFound(null);
      Alert.alert(
        'Éxito',
        `Se sumaron ${formData.cantidad} unidades al lote existente. Total: ${nuevaCantidad}`,
        [
          {
            text: 'OK',
            onPress: () => {
              setStep('capture');
              setImage(null);
              setFormData({
                nombre: '',
                presentacion: '',
                categoria: '',
                cantidad: '',
                vencimiento: '',
                ubicacion: '',
              });
            },
          },
        ]
      );
    } catch (error) {
      Alert.alert('Error', 'No se pudo actualizar');
    }
  };

  const handleCrearNuevoLote = async () => {
    const medData = {
      nombre: formData.nombre.trim(),
      presentacion: formData.presentacion.trim() || 'No especificada',
      categoria: formData.categoria.trim() || 'Sin categoría',
      cantidad: parseInt(formData.cantidad),
      vencimiento: formData.vencimiento,
      ubicacion: formData.ubicacion.trim() || '',
      imagen: image,
      fechaRegistro: new Date().toISOString(),
      activo: true,
      fechaBaja: null,
    };
    setShowDuplicateModal(false);
    setDuplicateFound(null);
    await saveNewMedicamento(medData);
  };

  const getStatusColor = (fecha) => {
    const days = getDaysUntilExpiry(fecha);
    if (days < 0) return styles.vencido;
    if (days <= 30) return styles.porVencer;
    return styles.vigente;
  };

  const getStatusText = (fecha) => {
    const days = getDaysUntilExpiry(fecha);
    if (days < 0) return 'VENCIDO';
    if (days <= 30) return `Vence en ${days} días`;
    return 'Vigente';
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
                Ubicación: {duplicateFound.ubicacion || 'No especificada'}
              </Text>
              <Text style={styles.duplicateDetail}>
                Estado: {duplicateFound.activo === false ? '⚠️ Inactivo' : '✅ Activo'}
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
              <Text style={styles.duplicateDetail}>Ubicación: {formData.ubicacion}</Text>
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
                <Text>Sumar al existente</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.duplicateButton, styles.nuevoButton]}
                onPress={handleCrearNuevoLote}
              >
                <Plus color="white" size={20} />
                <Text>Crear nuevo lote</Text>
              </TouchableOpacity>
              {duplicateFound.activo === false && (
                <TouchableOpacity
                  style={[styles.duplicateButton, styles.reactivarButton]}
                  onPress={() =>
                    reactivarMedicamento(duplicateFound.id, parseInt(formData.cantidad))
                  }
                >
                  <Check color="white" size={20} />
                  <Text>Reactivar existente</Text>
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

          {image && (
            <View style={styles.previewContainer}>
              {processing && (
                <View style={styles.processingOverlay}>
                  <ActivityIndicator color="white" size="large" />
                  <Text style={styles.processingText}>Analizando imagen...</Text>
                </View>
              )}
              <Image source={{ uri: image }} style={styles.previewImage} />
              <TouchableOpacity
                style={styles.clearImage}
                onPress={() => {
                  setImage(null);
                  setProcessing(false);
                }}
              >
                <X color="white" size={16} />
              </TouchableOpacity>
            </View>
          )}

          {/* Sección: Último medicamento registrado */}
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
                  </View>
                  {ultimoMedicamento.imagen && (
                    <Image source={{ uri: ultimoMedicamento.imagen }} style={styles.ultimoImage} />
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

        {/* Modal de entrada manual - DENTRO del mismo return */}
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
                <TextInput
                  style={styles.input}
                  placeholder="Nombre *"
                  value={manualFormData.nombre}
                  onChangeText={(t) => setManualFormData({ ...manualFormData, nombre: t })}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Presentación"
                  value={manualFormData.presentacion}
                  onChangeText={(t) => setManualFormData({ ...manualFormData, presentacion: t })}
                />
                <View style={{ marginBottom: 20 }}>
                  <CategoriaPicker
                    value={manualFormData.categoria}
                    onChange={(text) => setManualFormData({ ...manualFormData, categoria: text })}
                    placeholder="Seleccionar categoría"
                    showLabel={false}
                  />
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="Cantidad *"
                  keyboardType="numeric"
                  value={manualFormData.cantidad}
                  onChangeText={(t) => setManualFormData({ ...manualFormData, cantidad: t })}
                />
                <DatePickerInput
                  label="Fecha de vencimiento *"
                  value={manualFormData.vencimiento}
                  onChange={(date) => setManualFormData({ ...manualFormData, vencimiento: date })}
                  placeholder="Seleccionar fecha"
                />
                <TextInput
                  style={styles.input}
                  placeholder="Ubicación"
                  value={manualFormData.ubicacion}
                  onChangeText={(t) => setManualFormData({ ...manualFormData, ubicacion: t })}
                />

                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={async () => {
                    if (
                      !manualFormData.nombre ||
                      !manualFormData.cantidad ||
                      !manualFormData.vencimiento
                    ) {
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
                      imagen: null,
                      fechaRegistro: new Date().toISOString(),
                      activo: true,
                      fechaBaja: null,
                    };

                    try {
                      await addDoc(collection(db, 'medicamentos'), medData);
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
                      setManualModalVisible(false);
                    } catch (error) {
                      Alert.alert('Error', 'No se pudo guardar');
                    }
                  }}
                >
                  <Check color="white" size={20} />
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
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              setStep('capture');
              setImage(null);
            }}
          >
            <X color="#6B7280" size={24} />
          </TouchableOpacity>
          <Text style={styles.formTitle}>Completa los datos</Text>
          <View style={{ width: 40 }} />
        </View>

        {image && <Image source={{ uri: image }} style={styles.previewImageSmall} />}

        {checkingDuplicate && (
          <View style={styles.checkingContainer}>
            <ActivityIndicator size="small" color="#7C3AED" />
            <Text style={styles.checkingText}>Verificando duplicados...</Text>
          </View>
        )}

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nombre del medicamento *</Text>
            <TextInput
              style={styles.input}
              value={formData.nombre}
              onChangeText={(t) => setFormData({ ...formData, nombre: t })}
              placeholder="Ej: Paracetamol"
            />
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
                placeholder="Ej: 50"
                keyboardType="numeric"
              />
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <DatePickerInput
                label="Fecha de vencimiento"
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
              maxLength={255}
            />
          </View>

          <TouchableOpacity
            style={[
              styles.saveButton,
              (checkingDuplicate || isSaving) && styles.saveButtonDisabled,
            ]}
            onPress={handleSaveNewMed}
            disabled={checkingDuplicate || isSaving}
          >
            {checkingDuplicate || isSaving ? (
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
  manualButtonText: {
    color: '#4B5563',
    fontWeight: '600',
    fontSize: 16,
  },
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
  },
  row: { flexDirection: 'row', marginBottom: 20 },
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
  processingText: { fontSize: 18, fontWeight: 'bold', color: '#1F2937', marginTop: 20 },
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
  // Estilos para la sección "Último medicamento registrado"
  ultimoMedicamentoSection: {
    marginHorizontal: 16,
    marginVertical: 10,
  },
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
  ultimoCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  ultimoInfo: {
    flex: 1,
  },
  ultimoNombre: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 2,
  },
  ultimoPresentation: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 2,
  },
  ultimoCategory: {
    fontSize: 11,
    color: '#9CA3AF',
    marginBottom: 2,
  },
  ultimoUbicacion: {
    fontSize: 11,
    color: '#10B981',
    marginTop: 2,
  },
  ultimoImage: {
    width: 50,
    height: 50,
    borderRadius: 8,
    marginLeft: 12,
  },
  ultimoDetails: {
    marginTop: 4,
  },
  ultimoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  ultimoLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  ultimoValue: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1F2937',
  },
  ultimoStatus: {
    alignItems: 'flex-end',
    marginTop: 4,
  },
  ultimoBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  ultimoStatusText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
});
