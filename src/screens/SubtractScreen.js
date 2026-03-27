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
  query,
  where,
  getDocs,
  doc,
  runTransaction,
  onSnapshot,
  orderBy,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Camera as CameraIcon,
  Image as ImageIcon,
  Search,
  MinusCircle,
  X,
  Package,
  Users,
  UserPlus,
  CheckCircle,
  AlertCircle,
} from 'lucide-react-native';
import { getDaysUntilExpiry } from '../utils/dateUtils';
import KeyboardAvoidingScrollView from '../components/KeyboardAvoidingScrollView';

// Función para normalizar texto (quitar acentos y convertir a minúsculas)
const normalizeText = (text) => {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

export default function SubtractScreen() {
  const [step, setStep] = useState('search');
  const [image, setImage] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedMed, setSelectedMed] = useState(null);
  const [manualSearch, setManualSearch] = useState('');
  const [permission, requestPermission] = useCameraPermissions();

  const [pedidosPendientes, setPedidosPendientes] = useState([]);
  const [despachos, setDespachos] = useState([]);
  const [destinoLibre, setDestinoLibre] = useState('');
  const [cantidadLibre, setCantidadLibre] = useState('');

  const [showCantidadModal, setShowCantidadModal] = useState(false);
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState(null);
  const [cantidadInput, setCantidadInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const cameraRef = useRef(null);

  useEffect(() => {
    const q = query(
      collection(db, 'pedidos'),
      where('atendido', '==', false),
      orderBy('fechaPedido', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = [];
      snapshot.forEach((d) => docs.push({ id: d.id, ...d.data() }));
      setPedidosPendientes(docs);
    });
    return () => unsubscribe();
  }, []);

  const takePicture = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
      });
      setImage(photo.uri);
      setStep('search');
      processImageForSearch(photo.base64);
    } catch (error) {
      Alert.alert('Error', 'No se pudo tomar la foto');
      setStep('search');
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled) {
      setImage(result.assets[0].uri);
      processImageForSearch(result.assets[0].base64);
    }
  };

  const processImageForSearch = async (base64Image) => {
    setProcessing(true);
    try {
      const apiKey = await AsyncStorage.getItem('gemini_api_key');
      if (!apiKey) {
        Alert.alert('Error', 'Configura tu API Key de Gemini primero');
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
                    text: `Analiza esta imagen de un medicamento y extrae SOLO el nombre y la presentación. 
                    Responde con JSON: {"nombre": "", "presentacion": ""}`,
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
      const result = JSON.parse(cleanedText);
      await searchMedicamentos(result.nombre, result.presentacion);
    } catch (error) {
      console.error('Error procesando imagen:', error);
      Alert.alert('Error', 'No se pudo analizar la imagen. Busca manualmente.');
      setProcessing(false);
    }
  };

  // Búsqueda con normalización de acentos
  const searchMedicamentos = async (nombre, presentacion = '') => {
    try {
      const medicamentosRef = collection(db, 'medicamentos');
      const q = query(medicamentosRef, where('activo', '==', true));
      const querySnapshot = await getDocs(q);
      const results = [];
      const nombreNorm = normalizeText(nombre);
      const presentacionNorm = presentacion ? normalizeText(presentacion) : '';

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const nombreMedNorm = normalizeText(data.nombre);
        const presentacionMedNorm = normalizeText(data.presentacion || '');

        if (
          nombreMedNorm.includes(nombreNorm) &&
          (!presentacion || presentacionMedNorm.includes(presentacionNorm))
        ) {
          results.push({ id: doc.id, ...data });
        }
      });

      setSearchResults(results);
      setProcessing(false);
      setStep('results');
      if (results.length === 0) {
        Alert.alert('Información', 'No se encontraron medicamentos activos con ese nombre');
      }
    } catch (error) {
      console.error('Error buscando:', error);
      Alert.alert('Error', 'Error al buscar medicamentos');
      setProcessing(false);
    }
  };

  const handleManualSearch = async () => {
    if (!manualSearch.trim()) {
      Alert.alert('Error', 'Ingresa un nombre para buscar');
      return;
    }
    setProcessing(true);
    await searchMedicamentos(manualSearch);
  };

  const getPedidosParaMedicamento = () => {
    if (!selectedMed) return [];
    const medNorm = normalizeText(selectedMed.nombre);
    return pedidosPendientes.filter((pedido) =>
      pedido.medicamentosSolicitados?.some((med) => {
        const medNormPedido = normalizeText(med.nombre);
        return medNormPedido.includes(medNorm) || medNorm.includes(medNormPedido);
      })
    );
  };

  const abrirModalCantidad = (pedido) => {
    const medNorm = normalizeText(selectedMed.nombre);
    const solicitado = pedido.medicamentosSolicitados?.find((m) =>
      normalizeText(m.nombre).includes(medNorm)
    );
    const yaDespachado = despachos
      .filter((d) => d.pedidoId === pedido.id)
      .reduce((sum, d) => sum + d.cantidad, 0);
    const restante = (solicitado?.cantidad || 0) - yaDespachado;
    if (restante <= 0) {
      Alert.alert('Información', 'Este pedido ya fue atendido completamente');
      return;
    }
    setPedidoSeleccionado(pedido);
    setCantidadInput('');
    setShowCantidadModal(true);
  };

  const agregarDespachoAPedido = (pedido, cantidad) => {
    if (!cantidad || parseInt(cantidad) <= 0) {
      Alert.alert('Error', 'Ingresa una cantidad válida');
      return;
    }
    const cantidadNum = parseInt(cantidad);
    const totalDespachado = despachos.reduce((sum, d) => sum + d.cantidad, 0);
    if (totalDespachado + cantidadNum > selectedMed.cantidad) {
      Alert.alert('Error', `Stock insuficiente. Disponible: ${selectedMed.cantidad - totalDespachado}`);
      return;
    }
    const medNorm = normalizeText(selectedMed.nombre);
    const solicitado = pedido.medicamentosSolicitados?.find((m) =>
      normalizeText(m.nombre).includes(medNorm)
    );
    if (solicitado && cantidadNum > solicitado.cantidad) {
      Alert.alert('Error', `El pedido solo solicita ${solicitado.cantidad} unidades`);
      return;
    }
    setDespachos([
      ...despachos,
      {
        id: Date.now().toString(),
        pedidoId: pedido.id,
        nombreSolicitante: pedido.nombreSolicitante,
        cantidad: cantidadNum,
        esPedido: true,
        destino: pedido.nombreSolicitante,
        itemsOriginales: pedido.medicamentosSolicitados,
      },
    ]);
  };

  const agregarDespachoLibre = () => {
    if (!destinoLibre.trim()) {
      Alert.alert('Error', 'Especifica el destino de la entrega');
      return;
    }
    if (!cantidadLibre || parseInt(cantidadLibre) <= 0) {
      Alert.alert('Error', 'Ingresa una cantidad válida');
      return;
    }
    const cantidadNum = parseInt(cantidadLibre);
    const totalDespachado = despachos.reduce((sum, d) => sum + d.cantidad, 0);
    if (totalDespachado + cantidadNum > selectedMed.cantidad) {
      Alert.alert('Error', `Stock insuficiente. Disponible: ${selectedMed.cantidad - totalDespachado}`);
      return;
    }
    setDespachos([
      ...despachos,
      { id: Date.now().toString(), cantidad: cantidadNum, esPedido: false, destino: destinoLibre.trim() },
    ]);
    setDestinoLibre('');
    setCantidadLibre('');
  };

  const eliminarDespacho = (id) => setDespachos(despachos.filter((d) => d.id !== id));

  const procesarDespachos = async () => {
    if (isProcessing || despachos.length === 0) return;
    const totalDespachado = despachos.reduce((sum, d) => sum + d.cantidad, 0);
    if (totalDespachado > selectedMed.cantidad) {
      Alert.alert('Error', `Stock insuficiente. Máximo: ${selectedMed.cantidad}`);
      return;
    }
    setIsProcessing(true);
    try {
      await runTransaction(db, async (transaction) => {
        const medRef = doc(db, 'medicamentos', selectedMed.id);
        const medDoc = await transaction.get(medRef);
        if (!medDoc.exists()) throw new Error('El medicamento ya no existe');

        const pedidosMap = new Map();
        for (const despacho of despachos) {
          if (despacho.esPedido) {
            const pedidoRef = doc(db, 'pedidos', despacho.pedidoId);
            const pedidoDoc = await transaction.get(pedidoRef);
            if (!pedidoDoc.exists()) throw new Error(`El pedido ${despacho.pedidoId} ya no existe`);
            pedidosMap.set(despacho.pedidoId, pedidoDoc.data());
          }
        }

        transaction.update(medRef, { cantidad: medDoc.data().cantidad - totalDespachado });

        for (const despacho of despachos) {
          if (despacho.esPedido) {
            const pedidoData = pedidosMap.get(despacho.pedidoId);
            const pedidoRef = doc(db, 'pedidos', despacho.pedidoId);
            const medNorm = normalizeText(selectedMed.nombre);
            const nuevosMedicamentos = pedidoData.medicamentosSolicitados
              .map((med) => {
                if (normalizeText(med.nombre).includes(medNorm)) {
                  return { ...med, cantidad: med.cantidad - despacho.cantidad };
                }
                return med;
              })
              .filter((med) => med.cantidad > 0);

            const entregaRef = doc(collection(db, 'entregas'));
            transaction.set(entregaRef, {
              fecha: new Date().toISOString(),
              destino: despacho.destino,
              pedidoId: despacho.pedidoId,
              items: [{ medicamentoId: selectedMed.id, nombre: selectedMed.nombre, presentacion: selectedMed.presentacion, cantidad: despacho.cantidad, vencimiento: selectedMed.vencimiento }],
              totalItems: 1,
              totalUnidades: despacho.cantidad,
            });

            const updateData = {
              medicamentosSolicitados: nuevosMedicamentos,
              entregasRealizadas: [
                ...(pedidoData.entregasRealizadas || []),
                { entregaId: entregaRef.id, fecha: new Date().toISOString(), items: [{ medicamentoId: selectedMed.id, nombre: selectedMed.nombre, cantidad: despacho.cantidad }] },
              ],
            };
            if (nuevosMedicamentos.length === 0) {
              updateData.atendido = true;
              updateData.fechaAtencion = new Date().toISOString();
            }
            transaction.update(pedidoRef, updateData);
          } else {
            const entregaRef = doc(collection(db, 'entregas'));
            transaction.set(entregaRef, {
              fecha: new Date().toISOString(),
              destino: despacho.destino,
              items: [{ medicamentoId: selectedMed.id, nombre: selectedMed.nombre, presentacion: selectedMed.presentacion, cantidad: despacho.cantidad, vencimiento: selectedMed.vencimiento }],
              totalItems: 1,
              totalUnidades: despacho.cantidad,
              esHuérfana: true,
            });
          }
        }
      });

      Alert.alert('Éxito', `Se realizaron ${despachos.length} entrega(s) correctamente`, [
        {
          text: 'OK',
          onPress: () => {
            setStep('search');
            setImage(null);
            setSearchResults([]);
            setSelectedMed(null);
            setDespachos([]);
            setDestinoLibre('');
            setCantidadLibre('');
            setManualSearch('');
            setIsProcessing(false);
          },
        },
      ]);
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Error', error.message || 'No se pudo completar la operación');
      setIsProcessing(false);
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
        <TouchableOpacity style={styles.cameraClose} onPress={() => setStep('search')}>
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

  if (step === 'search') {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <MinusCircle color="#EA580C" size={28} />
          <Text style={styles.title}>Dar de Baja</Text>
          <View style={{ width: 28 }} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Buscar por imagen</Text>
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
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>O buscar manualmente</Text>
          <View style={styles.manualSearch}>
            <TextInput
              style={styles.manualInput}
              placeholder="Nombre del medicamento..."
              value={manualSearch}
              onChangeText={setManualSearch}
              onSubmitEditing={handleManualSearch}
              returnKeyType="search"
            />
            <TouchableOpacity style={styles.manualButton} onPress={handleManualSearch} disabled={processing}>
              {processing ? <ActivityIndicator color="white" size="small" /> : <><Search color="white" size={20} /><Text style={styles.manualButtonText}>Buscar</Text></>}
            </TouchableOpacity>
          </View>
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
            <TouchableOpacity style={styles.clearImage} onPress={() => { setImage(null); setProcessing(false); }}>
              <X color="white" size={16} />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    );
  }

  if (step === 'results') {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => { setStep('search'); setSearchResults([]); setImage(null); }}>
            <X color="#6B7280" size={24} />
          </TouchableOpacity>
          <Text style={styles.title}>Resultados ({searchResults.length})</Text>
          <View style={{ width: 40 }} />
        </View>

        {searchResults.length === 0 ? (
          <View style={styles.emptyResults}>
            <Package color="#D1D5DB" size={64} />
            <Text style={styles.emptyTitle}>No se encontraron medicamentos activos</Text>
            <TouchableOpacity style={styles.tryAgainButton} onPress={() => setStep('search')}>
              <Text style={styles.tryAgainText}>Intentar de nuevo</Text>
            </TouchableOpacity>
          </View>
        ) : (
          searchResults.map((med) => {
            const days = getDaysUntilExpiry(med.vencimiento);
            const isVencido = days < 0;
            return (
              <TouchableOpacity
                key={med.id}
                style={[styles.resultCard, isVencido && styles.vencidoCard]}
                onPress={() => { setSelectedMed(med); setStep('despacho'); }}
                disabled={isVencido}
              >
                <View style={styles.resultContent}>
                  <Text style={styles.resultName}>{med.nombre}</Text>
                  <Text style={styles.resultPresentation}>{med.presentacion}</Text>
                  <View style={styles.resultDetails}>
                    <Text style={styles.resultQuantity}>Stock: {med.cantidad} uds</Text>
                    <Text style={[styles.resultExpiry, isVencido && styles.vencidoText]}>
                      {isVencido ? 'VENCIDO' : `Vence: ${new Date(med.vencimiento).toLocaleDateString()}`}
                    </Text>
                  </View>
                  {isVencido && <Text style={styles.vencidoWarning}>No se puede dar de baja medicamentos vencidos</Text>}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    );
  }

  const pedidosRelevantes = getPedidosParaMedicamento();
  const totalDespachado = despachos.reduce((sum, d) => sum + d.cantidad, 0);
  const stockRestante = selectedMed ? selectedMed.cantidad - totalDespachado : 0;

  return (
    <KeyboardAvoidingScrollView>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() =>
            Alert.alert(
              'Confirmar',
              '¿Seguro que quieres volver? Se perderán los despachos pendientes',
              [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Sí, volver', onPress: () => { setStep('results'); setSelectedMed(null); setDespachos([]); } },
              ]
            )
          }
        >
          <X color="#6B7280" size={24} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>Despachar: {selectedMed?.nombre}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.medInfoCard}>
          <Text style={styles.medName}>{selectedMed?.nombre}</Text>
          <Text style={styles.medPresentation}>{selectedMed?.presentacion}</Text>
          <View style={styles.stockContainer}>
            <Text style={styles.stockLabel}>Stock inicial:</Text>
            <Text style={styles.stockValue}>{selectedMed?.cantidad} uds</Text>
          </View>
          <View style={styles.stockContainer}>
            <Text style={styles.stockLabel}>Stock restante:</Text>
            <Text style={[styles.stockValue, stockRestante < 0 ? styles.stockNegativo : styles.stockPositivo]}>
              {stockRestante} uds
            </Text>
          </View>
        </View>

        {pedidosRelevantes.length > 0 && (
          <View style={styles.pedidosSection}>
            <View style={styles.sectionHeader}>
              <Users color="#7C3AED" size={20} />
              <Text style={styles.sectionTitle}>Pedidos Pendientes</Text>
            </View>
            {pedidosRelevantes.map((pedido) => {
              const medNorm = normalizeText(selectedMed.nombre);
              const solicitado = pedido.medicamentosSolicitados?.find((m) =>
                normalizeText(m.nombre).includes(medNorm)
              );
              const yaDespachado = despachos
                .filter((d) => d.pedidoId === pedido.id)
                .reduce((sum, d) => sum + d.cantidad, 0);
              const restantePorSolicitar = (solicitado?.cantidad || 0) - yaDespachado;
              if (restantePorSolicitar <= 0) return null;
              return (
                <View key={pedido.id} style={styles.pedidoCard}>
                  <View style={styles.pedidoHeader}>
                    <Text style={styles.pedidoNombre}>{pedido.nombreSolicitante}</Text>
                    <Text style={styles.pedidoSolicitado}>Solicita: {solicitado?.cantidad} uds</Text>
                  </View>
                  <View style={styles.pedidoBody}>
                    <Text style={styles.pedidoMedicamento}>{solicitado?.nombre} {solicitado?.presentacion}</Text>
                    <Text style={styles.pedidoRestante}>Restante: {restantePorSolicitar} uds</Text>
                  </View>
                  <TouchableOpacity style={styles.despacharButton} onPress={() => abrirModalCantidad(pedido)}>
                    <Text style={styles.despacharButtonText}>Despachar</Text>
                  </TouchableOpacity>
                  {yaDespachado > 0 && <Text style={styles.yaDespachado}>Ya despachado: {yaDespachado} uds</Text>}
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.destinoLibreSection}>
          <View style={styles.sectionHeader}>
            <UserPlus color="#10B981" size={20} />
            <Text style={styles.sectionTitle}>Despachar sin pedido</Text>
          </View>
          <View style={styles.destinoLibreForm}>
            <TextInput
              style={styles.destinoInput}
              placeholder="Destino (ej: Paciente, Consultorio...)"
              value={destinoLibre}
              onChangeText={setDestinoLibre}
            />
            <View style={styles.despachoRow}>
              <TextInput
                style={styles.cantidadInput}
                placeholder="Cantidad"
                keyboardType="numeric"
                value={cantidadLibre}
                onChangeText={setCantidadLibre}
              />
              <TouchableOpacity style={styles.agregarButton} onPress={agregarDespachoLibre}>
                <Text style={styles.agregarButtonText}>Agregar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {despachos.length > 0 && (
          <View style={styles.despachosLista}>
            <Text style={styles.listaTitle}>Despachos pendientes:</Text>
            {despachos.map((despacho, index) => (
              <View key={despacho.id} style={styles.despachoItem}>
                <View style={styles.despachoInfo}>
                  <Text style={styles.despachoIndex}>#{index + 1}</Text>
                  <Text style={styles.despachoDestino}>{despacho.esPedido ? despacho.nombreSolicitante : despacho.destino}</Text>
                  <Text style={styles.despachoBadge}>{despacho.cantidad} uds</Text>
                </View>
                <TouchableOpacity onPress={() => eliminarDespacho(despacho.id)}>
                  <X color="#DC2626" size={18} />
                </TouchableOpacity>
              </View>
            ))}
            <View style={styles.totalContainer}>
              <Text style={styles.totalLabel}>Total a despachar:</Text>
              <Text style={styles.totalValue}>{totalDespachado} uds</Text>
            </View>
            <TouchableOpacity
              style={[styles.procesarButton, (despachos.length === 0 || isProcessing) && styles.procesarDisabled]}
              onPress={procesarDespachos}
              disabled={despachos.length === 0 || isProcessing}
            >
              {isProcessing ? <ActivityIndicator color="white" size="small" /> : <><CheckCircle color="white" size={20} /><Text style={styles.procesarButtonText}>Procesar {despachos.length} despacho(s)</Text></>}
            </TouchableOpacity>
          </View>
        )}

        {stockRestante < 0 && (
          <View style={styles.warningContainer}>
            <AlertCircle color="#DC2626" size={20} />
            <Text style={styles.warningText}>¡Has excedido el stock disponible!</Text>
          </View>
        )}
      </View>

      <Modal visible={showCantidadModal} transparent animationType="fade">
        <View style={styles.modalOverlayCantidad}>
          <View style={styles.modalCantidadContent}>
            <Text style={styles.modalCantidadTitle}>Despachar medicamento</Text>
            <Text style={styles.modalCantidadSubtitle}>Pedido de: {pedidoSeleccionado?.nombreSolicitante}</Text>
            <TextInput
              style={styles.modalCantidadInput}
              placeholder="Cantidad a despachar"
              keyboardType="numeric"
              value={cantidadInput}
              onChangeText={setCantidadInput}
              autoFocus
            />
            <View style={styles.modalCantidadButtons}>
              <TouchableOpacity
                style={[styles.modalCantidadButton, styles.modalCantidadCancelar]}
                onPress={() => { setShowCantidadModal(false); setPedidoSeleccionado(null); setCantidadInput(''); }}
              >
                <Text style={styles.modalCantidadButtonText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalCantidadButton, styles.modalCantidadConfirmar]}
                onPress={() => {
                  if (cantidadInput && parseInt(cantidadInput) > 0) {
                    agregarDespachoAPedido(pedidoSeleccionado, cantidadInput);
                    setShowCantidadModal(false);
                    setPedidoSeleccionado(null);
                    setCantidadInput('');
                  } else {
                    Alert.alert('Error', 'Ingresa una cantidad válida');
                  }
                }}
              >
                <Text style={styles.modalCantidadButtonText}>Despachar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F3F4F6' },
  loadingText: { marginTop: 10, fontSize: 14, color: '#6B7280' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backButton: { padding: 8 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#1F2937', flex: 1, textAlign: 'center' },
  section: { backgroundColor: 'white', margin: 16, padding: 16, borderRadius: 16, elevation: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#374151', marginBottom: 16 },
  cameraOptions: { flexDirection: 'row', justifyContent: 'space-around' },
  cameraOption: { alignItems: 'center', padding: 16, backgroundColor: '#F3F4F6', borderRadius: 12, width: '45%' },
  cameraOptionText: { marginTop: 8, color: '#4B5563', fontWeight: '500' },
  manualSearch: { flexDirection: 'row', gap: 10 },
  manualInput: { flex: 1, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, padding: 12, fontSize: 16 },
  manualButton: { backgroundColor: '#7C3AED', borderRadius: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  manualButtonText: { color: 'white', fontWeight: '600' },
  previewContainer: { margin: 16, position: 'relative' },
  previewImage: { width: '100%', height: 200, borderRadius: 12 },
  clearImage: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, padding: 4 },
  processingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12, justifyContent: 'center', alignItems: 'center', gap: 10 },
  processingText: { color: 'white', fontWeight: '600' },
  cameraContainer: { flex: 1, backgroundColor: 'black' },
  cameraView: { flex: 1 },
  cameraClose: { position: 'absolute', top: 50, right: 20, zIndex: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 8 },
  cameraOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  cameraFrame: { width: 260, height: 160, borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)', borderRadius: 12, backgroundColor: 'transparent' },
  cameraHint: { color: 'white', fontSize: 14, marginTop: 12, backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },
  cameraControls: { position: 'absolute', bottom: 48, left: 0, right: 0, alignItems: 'center' },
  captureButton: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.3)', borderWidth: 3, borderColor: 'white', justifyContent: 'center', alignItems: 'center' },
  captureButtonInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: 'white' },
  emptyResults: { alignItems: 'center', padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#374151', marginTop: 16, textAlign: 'center' },
  tryAgainButton: { marginTop: 16, padding: 12, backgroundColor: '#7C3AED', borderRadius: 8 },
  tryAgainText: { color: 'white', fontWeight: '600' },
  resultCard: { backgroundColor: 'white', margin: 16, marginTop: 8, padding: 16, borderRadius: 16, elevation: 2 },
  vencidoCard: { opacity: 0.5 },
  resultContent: { flex: 1 },
  resultName: { fontSize: 18, fontWeight: 'bold', color: '#1F2937', marginBottom: 4 },
  resultPresentation: { fontSize: 14, color: '#6B7280', marginBottom: 8 },
  resultDetails: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resultQuantity: { fontSize: 14, fontWeight: '600', color: '#374151' },
  resultExpiry: { fontSize: 12, color: '#6B7280' },
  vencidoText: { color: '#DC2626', fontWeight: 'bold' },
  vencidoWarning: { marginTop: 8, fontSize: 12, color: '#DC2626', fontStyle: 'italic' },
  content: { flex: 1, padding: 16 },
  medInfoCard: { backgroundColor: 'white', padding: 16, borderRadius: 16, marginBottom: 16, elevation: 2 },
  medName: { fontSize: 20, fontWeight: 'bold', color: '#1F2937' },
  medPresentation: { fontSize: 14, color: '#6B7280', marginTop: 4 },
  stockContainer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  stockLabel: { fontSize: 14, color: '#6B7280' },
  stockValue: { fontSize: 16, fontWeight: 'bold', color: '#1F2937' },
  stockPositivo: { color: '#10B981' },
  stockNegativo: { color: '#DC2626' },
  pedidosSection: { marginBottom: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  pedidoCard: { backgroundColor: 'white', padding: 16, borderRadius: 12, marginBottom: 12, elevation: 1 },
  pedidoHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  pedidoNombre: { fontSize: 16, fontWeight: 'bold', color: '#1F2937' },
  pedidoSolicitado: { fontSize: 14, color: '#7C3AED', fontWeight: '600' },
  pedidoBody: { marginBottom: 12 },
  pedidoMedicamento: { fontSize: 14, color: '#4B5563' },
  pedidoRestante: { fontSize: 12, color: '#6B7280', marginTop: 4 },
  despacharButton: { backgroundColor: '#7C3AED', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  despacharButtonText: { color: 'white', fontWeight: '600', fontSize: 14 },
  yaDespachado: { fontSize: 12, color: '#10B981', marginTop: 8, fontStyle: 'italic' },
  destinoLibreSection: { marginBottom: 16 },
  destinoLibreForm: { backgroundColor: 'white', padding: 16, borderRadius: 12, elevation: 1 },
  destinoInput: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, padding: 12, fontSize: 14, marginBottom: 12 },
  despachoRow: { flexDirection: 'row', gap: 8 },
  cantidadInput: { flex: 1, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, padding: 10, fontSize: 14 },
  agregarButton: { backgroundColor: '#10B981', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, justifyContent: 'center' },
  agregarButtonText: { color: 'white', fontWeight: '600', fontSize: 14 },
  despachosLista: { backgroundColor: 'white', padding: 16, borderRadius: 12, marginTop: 8, elevation: 2 },
  listaTitle: { fontSize: 16, fontWeight: 'bold', color: '#1F2937', marginBottom: 12 },
  despachoItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  despachoInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  despachoIndex: { fontSize: 12, fontWeight: 'bold', color: '#6B7280' },
  despachoDestino: { fontSize: 14, color: '#1F2937', flex: 1 },
  despachoBadge: { backgroundColor: '#EDE9FE', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, fontSize: 12, color: '#7C3AED', fontWeight: '600' },
  totalContainer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  totalLabel: { fontSize: 16, fontWeight: '600', color: '#1F2937' },
  totalValue: { fontSize: 18, fontWeight: 'bold', color: '#7C3AED' },
  procesarButton: { backgroundColor: '#10B981', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 10, marginTop: 16, gap: 8 },
  procesarDisabled: { opacity: 0.5 },
  procesarButtonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  warningContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEE2E2', padding: 12, borderRadius: 8, marginTop: 16, gap: 8 },
  warningText: { color: '#DC2626', fontSize: 14, fontWeight: '500', flex: 1 },
  modalOverlayCantidad: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalCantidadContent: { backgroundColor: 'white', borderRadius: 20, padding: 24, width: '80%', alignItems: 'center' },
  modalCantidadTitle: { fontSize: 20, fontWeight: 'bold', color: '#1F2937', marginBottom: 8 },
  modalCantidadSubtitle: { fontSize: 14, color: '#6B7280', marginBottom: 20, textAlign: 'center' },
  modalCantidadInput: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, padding: 12, fontSize: 18, width: '100%', textAlign: 'center', marginBottom: 20 },
  modalCantidadButtons: { flexDirection: 'row', gap: 12, width: '100%' },
  modalCantidadButton: { flex: 1, padding: 12, borderRadius: 10, alignItems: 'center' },
  modalCantidadCancelar: { backgroundColor: '#F3F4F6' },
  modalCantidadConfirmar: { backgroundColor: '#7C3AED' },
  modalCantidadButtonText: { fontSize: 16, fontWeight: '600', color: 'white' },
});