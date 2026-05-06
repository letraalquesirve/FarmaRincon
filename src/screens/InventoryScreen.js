// src/screens/InventoryScreen.js
import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  Modal,
  Share,
  Animated,
  RefreshControl,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Audio } from 'expo-av';
import {
  Search,
  Package,
  Trash,
  Filter,
  X,
  AlertCircle,
  ZoomIn,
  Share2,
  FileText,
  Edit,
  Copy,
  Pill,
  Calendar,
  User,
  MapPin,
  Mic,
  Camera,
  Image as ImageIcon,
} from 'lucide-react-native';
import { getDaysUntilExpiry } from '../utils/dateUtils';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import { pb } from '../services/PocketBaseConfig';
import DatePickerInput from '../components/DatePickerInput';
import CategoriaPicker from '../components/CategoriaPicker';
import { useFocusEffect } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';

const { width, height } = Dimensions.get('window');

// ── Utilidades ───────────────────────────────────────────────
const normalizeText = (text) => {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

const escapeHtml = (text) => {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

// ── Función para registrar en history ─────────────────────────
const registrarHistory = async (idMed, fecha, user, movimiento, cantidad, nombreMed = '') => {
  try {
    await pb.collection('history').create({
      id_med: idMed,
      fecha: fecha,
      user: user,
      movimiento: movimiento,
      cantidad: cantidad,
      name: nombreMed,
    });
    console.log(`📝 History registrado: ${movimiento} - ${nombreMed}`);
  } catch (error) {
    console.error('Error registrando history:', error);
  }
};

export default function InventoryScreen({ user }) {
  // ── Estados ──
  const [resultados, setResultados] = useState([]); // Solo los resultados de la última búsqueda
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchInputValue, setSearchInputValue] = useState('');
  const [modoInactivos, setModoInactivos] = useState(false);
  const [filter, setFilter] = useState('todos'); // todos, vigentes, porVencer, vencidos
  const [showFilters, setShowFilters] = useState(false);

  // Modales
  const [modalVisible, setModalVisible] = useState(false);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [selectedMed, setSelectedMed] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedMedName, setSelectedMedName] = useState('');
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [duplicateModalVisible, setDuplicateModalVisible] = useState(false);
  const [reactivarModalVisible, setReactivarModalVisible] = useState(false);
  const [currentEditMed, setCurrentEditMed] = useState(null);
  const [currentDuplicateMed, setCurrentDuplicateMed] = useState(null);
  const [currentReactivarMed, setCurrentReactivarMed] = useState(null);
  const [audioSound, setAudioSound] = useState(null);

  // Formularios
  const [editForm, setEditForm] = useState({
    nombre: '',
    presentacion: '',
    categoria: '',
    cantidad: '',
    vencimiento: '',
    ubicacion: '',
    imagen: null,
    audio: null,
  });
  const [duplicateForm, setDuplicateForm] = useState({
    nombre: '',
    presentacion: '',
    categoria: '',
    ubicacion: '',
    cantidad: '',
    vencimiento: '',
  });
  const [reactivarForm, setReactivarForm] = useState({
    nombre: '',
    presentacion: '',
    categoria: '',
    cantidad: '',
    vencimiento: '',
    ubicacion: '',
    imagen: null,
  });

  const navigation = useNavigation();

  // ── Zoom con gesture-handler para imagen ──
  const scale = useRef(new Animated.Value(1)).current;
  const savedScale = useRef(1);

  const pinchGesture = Gesture.Pinch()
    .runOnJS(true)
    .onUpdate((e) => {
      const newScale = Math.max(0.5, Math.min(savedScale.current * e.scale, 5));
      scale.setValue(newScale);
    })
    .onEnd((e) => {
      savedScale.current = Math.max(0.5, Math.min(savedScale.current * e.scale, 5));
      scale.setValue(savedScale.current);
    });

  const doubleTap = Gesture.Tap()
    .runOnJS(true)
    .numberOfTaps(2)
    .onEnd(() => {
      savedScale.current = 1;
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
    });

  const composed = Gesture.Race(pinchGesture, doubleTap);
  const resetZoom = () => {
    savedScale.current = 1;
    scale.setValue(1);
  };

  const getUserName = () => user?.nombre || 'usuario';

  // ── Funciones de audio y foto ──
  const playAudio = async (audioBase64) => {
    if (!audioBase64) {
      Alert.alert('Sin audio', 'Este medicamento no tiene audio asociado');
      return;
    }
    try {
      if (audioSound) {
        await audioSound.unloadAsync();
      }
      const uri = `${FileSystem.cacheDirectory}temp_audio_${Date.now()}.mp3`;
      await FileSystem.writeAsStringAsync(uri, audioBase64, { encoding: 'base64' });
      const { sound } = await Audio.Sound.createAsync({ uri });
      setAudioSound(sound);
      await sound.playAsync();
    } catch (error) {
      console.error('Error reproduciendo audio:', error);
      Alert.alert('Error', 'No se pudo reproducir el audio');
    }
  };

  const tomarFoto = async (tipo, setFormCallback, formData) => {
    try {
      let result;
      if (tipo === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permiso denegado', 'Se necesita acceso a la cámara');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          allowsEditing: true,
          quality: 0.8,
          base64: true,
        });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          quality: 0.8,
          base64: true,
        });
      }
      if (!result.canceled && result.assets[0]) {
        const compressed = await ImageManipulator.manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: 600 } }],
          { compress: 0.3, base64: true, format: ImageManipulator.SaveFormat.JPEG }
        );
        setFormCallback({ ...formData, imagen: compressed.base64 });
      }
    } catch (error) {
      console.error('Error tomando foto:', error);
      Alert.alert('Error', 'No se pudo obtener la imagen');
    }
  };

  const obtenerUbicacionDesdeCategoria = async (categoriaNombre) => {
    try {
      const result = await pb.collection('categorias').getList(1, 1, {
        filter: `nombre = "${categoriaNombre}"`,
      });
      if (result.items.length > 0 && result.items[0].ubicacion) {
        return result.items[0].ubicacion;
      }
      return '';
    } catch (error) {
      console.error('Error obteniendo ubicación de categoría:', error);
      return '';
    }
  };

  // ── BÚSQUEDA PRINCIPAL (solo bajo demanda) ──
  const ejecutarBusqueda = async () => {
    const term = searchInputValue.trim();

    setLoading(true);
    setResultados([]);

    try {
      let filterCondition = '';

      // Construir filtro base según modo (activo/inactivo)
      if (modoInactivos) {
        filterCondition = 'activo = false';
      } else {
        filterCondition = 'activo = true';
      }

      // Agregar filtro de búsqueda por nombre/presentación
      if (term) {
        const searchNorm = term.toLowerCase();
        filterCondition += ` && (nombre ~ "${searchNorm}" || presentacion ~ "${searchNorm}" || categoria ~ "${searchNorm}")`;
      }

      // Agregar filtros de vigencia (solo para activos)
      if (!modoInactivos && filter !== 'todos') {
        const hoy = new Date();
        const dentro30Dias = new Date();
        dentro30Dias.setDate(hoy.getDate() + 30);

        switch (filter) {
          case 'vigentes':
            filterCondition += ` && vencimiento > "${dentro30Dias.toISOString().split('T')[0]}"`;
            break;
          case 'porVencer':
            filterCondition += ` && vencimiento >= "${hoy.toISOString().split('T')[0]}" && vencimiento <= "${dentro30Dias.toISOString().split('T')[0]}"`;
            break;
          case 'vencidos':
            filterCondition += ` && vencimiento < "${hoy.toISOString().split('T')[0]}"`;
            break;
        }
      }

      console.log(`🔍 Buscando: ${filterCondition}`);

      const result = await pb.collection('medicamentos').getList(1, 100, {
        filter: filterCondition,
        sort: 'nombre',
        requestKey: null,
      });

      setResultados(result.items);
      console.log(`📦 Encontrados: ${result.items.length} medicamentos`);
    } catch (error) {
      console.error('Error en búsqueda:', error);
      Alert.alert('Error', 'No se pudo realizar la búsqueda');
    } finally {
      setLoading(false);
    }
  };

  // ── Cambiar entre activos/inactivos ──
  const toggleModoInactivos = () => {
    setModoInactivos(!modoInactivos);
    setResultados([]);
    setSearchInputValue('');
    setFilter('todos');
  };

  // ── Limpiar búsqueda ──
  const limpiarBusqueda = () => {
    setSearchInputValue('');
    setResultados([]);
  };

  // ── Refrescar (vuelve a ejecutar la última búsqueda) ──
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await ejecutarBusqueda();
    setRefreshing(false);
  }, []);

  // ── Generar PDF con los resultados actuales ──
  const generatePDF = async () => {
    if (resultados.length === 0) {
      Alert.alert('Sin datos', 'No hay medicamentos para generar el PDF');
      return;
    }

    setGeneratingPDF(true);
    const titulo = modoInactivos
      ? `LISTADO DE MEDICAMENTOS INACTIVOS${searchInputValue ? ` - BÚSQUEDA: "${searchInputValue}"` : ''}`
      : `LISTADO DE MEDICAMENTOS ACTIVOS${searchInputValue ? ` - BÚSQUEDA: "${searchInputValue}"` : ''}`;

    try {
      const today = new Date().toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      let tableRows = '';
      resultados.forEach((med, index) => {
        const status =
          med.activo === false
            ? 'INACTIVO'
            : getDaysUntilExpiry(med.vencimiento) < 0
              ? 'VENCIDO'
              : getDaysUntilExpiry(med.vencimiento) <= 30
                ? 'POR VENCER'
                : 'VIGENTE';
        tableRows += `
          <tr style="background-color: ${index % 2 === 0 ? '#f9fafb' : 'white'}">
            <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:center;">${index + 1}</td>
            <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(med.nombre || '')}</td>
            <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(med.presentacion || '')}</td>
            <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(med.categoria || '')}</td>
            <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:center;">${med.cantidad || 0}</td>
            <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${new Date(med.vencimiento).toLocaleDateString()}</td>
            <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(med.ubicacion || '')}</td>
            <td style="padding:10px;border-bottom:1px solid #e5e7eb;font-weight:bold;">${status}</td>
          </tr>`;
      });

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${titulo}</title>
        <style>
          *{margin:0;padding:0;box-sizing:border-box}
          body{font-family:'Helvetica','Arial',sans-serif;padding:20px;background:white}
          .header{text-align:center;margin-bottom:20px;padding-bottom:15px;border-bottom:2px solid #7C3AED}
          .title{font-size:20px;font-weight:bold;color:#1F2937;margin-bottom:5px}
          .subtitle{font-size:12px;color:#6B7280}
          .stats{margin-bottom:15px;padding:10px;background:#F3F4F6;border-radius:8px;text-align:center}
          table{width:100%;border-collapse:collapse;font-size:11px}
          th{background:#7C3AED;color:white;padding:10px;text-align:left;font-weight:bold}
          .footer{margin-top:20px;padding-top:10px;text-align:center;font-size:10px;color:#9CA3AF;border-top:1px solid #E5E7EB}
        </style></head><body>
        <div class="header"><div class="title">${titulo}</div><div class="subtitle">Generado: ${today}</div></div>
        <div class="stats"><div class="stats-text">Total: ${resultados.length} medicamentos</div></div>
        <table><thead><tr><th>#</th><th>Nombre</th><th>Presentación</th><th>Categoría</th><th>Stock</th><th>Vencimiento</th><th>Ubicación</th><th>Estado</th></tr></thead>
        <tbody>${tableRows}</tbody></table>
        <div class="footer"><div>FarmaRincón - Sistema de Gestión de Inventario</div></div>
        </body></html>`;
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Compartir reporte',
        });
      }
    } catch (error) {
      console.error('Error generando PDF:', error);
      Alert.alert('Error', 'No se pudo generar el PDF');
    } finally {
      setGeneratingPDF(false);
    }
  };

  // ── Acciones CRUD (Edit, Delete, Duplicate, Reactivate) ──
  const handleSoftDelete = async (medId, medName) => {
    Alert.alert('Desactivar Medicamento', `¿Estás seguro de desactivar ${medName}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desactivar',
        style: 'destructive',
        onPress: async () => {
          try {
            const medActual = await pb.collection('medicamentos').getOne(medId);
            await pb.collection('medicamentos').update(medId, {
              activo: false,
              fechabaja: new Date().toISOString(),
            });
            await registrarHistory(
              medId,
              new Date().toISOString(),
              getUserName(),
              'Desactivando',
              medActual.cantidad,
              medActual.nombre
            );
            await ejecutarBusqueda();
            setModalVisible(false);
            Alert.alert('Éxito', 'Medicamento desactivado');
          } catch {
            Alert.alert('Error', 'No se pudo desactivar');
          }
        },
      },
    ]);
  };

  const openReactivarModal = (med) => {
    setCurrentReactivarMed(med);
    setReactivarForm({
      nombre: med.nombre || '',
      presentacion: med.presentacion || '',
      categoria: med.categoria || '',
      cantidad: med.cantidad ? med.cantidad.toString() : '',
      vencimiento: med.vencimiento || '',
      ubicacion: med.ubicacion || '',
      imagen: med.imagen || null,
    });
    setModalVisible(false);
    setReactivarModalVisible(true);
  };

  const handleSaveReactivar = async () => {
    if (!reactivarForm.nombre.trim()) {
      Alert.alert('Error', 'El nombre es obligatorio');
      return;
    }
    if (!reactivarForm.cantidad || parseInt(reactivarForm.cantidad) <= 0) {
      Alert.alert('Error', 'Ingresa una cantidad válida');
      return;
    }
    if (!reactivarForm.vencimiento) {
      Alert.alert('Error', 'La fecha de vencimiento es obligatoria');
      return;
    }

    try {
      let ubicacionFinal = reactivarForm.ubicacion.trim();
      if (reactivarForm.categoria !== currentReactivarMed.categoria) {
        const ubicacionDesdeCategoria = await obtenerUbicacionDesdeCategoria(
          reactivarForm.categoria
        );
        if (ubicacionDesdeCategoria) {
          ubicacionFinal = ubicacionDesdeCategoria;
        }
      }

      await pb.collection('medicamentos').update(currentReactivarMed.id, {
        nombre: reactivarForm.nombre.trim(),
        presentacion: reactivarForm.presentacion.trim() || 'No especificada',
        categoria: reactivarForm.categoria.trim() || 'Sin categoría',
        cantidad: parseInt(reactivarForm.cantidad),
        vencimiento: reactivarForm.vencimiento,
        ubicacion: ubicacionFinal,
        activo: true,
        fechabaja: null,
        fechaedicion: new Date().toISOString(),
        editadopor: getUserName(),
        fechaReactivacion: new Date().toISOString(),
      });

      if (reactivarForm.imagen !== currentReactivarMed.imagen && reactivarForm.imagen) {
        await pb.collection('medicamentos').update(currentReactivarMed.id, {
          imagen: reactivarForm.imagen,
        });
      }

      await registrarHistory(
        currentReactivarMed.id,
        new Date().toISOString(),
        getUserName(),
        'Reactivando',
        parseInt(reactivarForm.cantidad),
        currentReactivarMed.nombre
      );

      await ejecutarBusqueda();
      Alert.alert('Éxito', 'Medicamento reactivado correctamente');
      setReactivarModalVisible(false);
    } catch (error) {
      console.error('Error reactivando:', error);
      Alert.alert('Error', 'No se pudo reactivar el medicamento');
    }
  };

  const openEditModal = (med) => {
    setCurrentEditMed(med);
    setEditForm({
      nombre: med.nombre || '',
      presentacion: med.presentacion || '',
      categoria: med.categoria || '',
      cantidad: med.cantidad ? med.cantidad.toString() : '',
      vencimiento: med.vencimiento || '',
      ubicacion: med.ubicacion || '',
      imagen: med.imagen || null,
      audio: med.audio || null,
    });
    setModalVisible(false);
    setEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!editForm.nombre.trim()) {
      Alert.alert('Error', 'El nombre es obligatorio');
      return;
    }
    if (!editForm.cantidad || parseInt(editForm.cantidad) <= 0) {
      Alert.alert('Error', 'Ingresa una cantidad válida');
      return;
    }
    if (!editForm.vencimiento) {
      Alert.alert('Error', 'La fecha de vencimiento es obligatoria');
      return;
    }

    try {
      const cantidadAnterior = currentEditMed.cantidad;
      const nuevaCantidad = parseInt(editForm.cantidad);
      const diferencia = nuevaCantidad - cantidadAnterior;

      let ubicacionFinal = editForm.ubicacion.trim();
      if (editForm.categoria !== currentEditMed.categoria) {
        const ubicacionDesdeCategoria = await obtenerUbicacionDesdeCategoria(editForm.categoria);
        if (ubicacionDesdeCategoria) {
          ubicacionFinal = ubicacionDesdeCategoria;
        }
      }

      await pb.collection('medicamentos').update(currentEditMed.id, {
        nombre: editForm.nombre.trim(),
        presentacion: editForm.presentacion.trim() || 'No especificada',
        categoria: editForm.categoria.trim() || 'Sin categoría',
        cantidad: nuevaCantidad,
        vencimiento: editForm.vencimiento,
        ubicacion: ubicacionFinal,
        fechaedicion: new Date().toISOString(),
        editadopor: getUserName(),
      });

      if (editForm.imagen !== currentEditMed.imagen && editForm.imagen) {
        await pb.collection('medicamentos').update(currentEditMed.id, {
          imagen: editForm.imagen,
        });
      }

      if (diferencia !== 0) {
        await registrarHistory(
          currentEditMed.id,
          new Date().toISOString(),
          getUserName(),
          diferencia > 0 ? 'Añadiendo' : 'Entregando',
          Math.abs(diferencia),
          currentEditMed.nombre
        );
      }

      await ejecutarBusqueda();
      Alert.alert('Éxito', 'Medicamento actualizado correctamente');
      setEditModalVisible(false);
    } catch (error) {
      console.error('Error editando:', error);
      Alert.alert('Error', 'No se pudo actualizar el medicamento');
    }
  };

  const openDuplicateModal = (med) => {
    setCurrentDuplicateMed(med);
    setDuplicateForm({
      nombre: med.nombre || '',
      presentacion: med.presentacion || '',
      categoria: med.categoria || '',
      ubicacion: med.ubicacion || '',
      cantidad: '',
      vencimiento: '',
    });
    setModalVisible(false);
    setDuplicateModalVisible(true);
  };

  const handleSaveDuplicate = async () => {
    if (!duplicateForm.nombre.trim()) {
      Alert.alert('Error', 'El nombre es obligatorio');
      return;
    }
    if (!duplicateForm.cantidad || parseInt(duplicateForm.cantidad) <= 0) {
      Alert.alert('Error', 'Ingresa una cantidad válida');
      return;
    }
    if (!duplicateForm.vencimiento) {
      Alert.alert('Error', 'La fecha de vencimiento es obligatoria');
      return;
    }

    try {
      const ubicacionDesdeCategoria = await obtenerUbicacionDesdeCategoria(duplicateForm.categoria);
      const ubicacionFinal = ubicacionDesdeCategoria || duplicateForm.ubicacion.trim();

      const result = await pb.collection('medicamentos').create({
        nombre: duplicateForm.nombre.trim(),
        presentacion: duplicateForm.presentacion.trim() || 'No especificada',
        categoria: duplicateForm.categoria.trim() || 'Sin categoría',
        cantidad: parseInt(duplicateForm.cantidad),
        vencimiento: duplicateForm.vencimiento,
        ubicacion: ubicacionFinal,
        imagen: currentDuplicateMed.imagen || null,
        activo: true,
        fecharegistro: new Date().toISOString(),
        username: getUserName(),
        userid: getUserName(),
        esduplicado: true,
        duplicadode: currentDuplicateMed.id,
      });

      await registrarHistory(
        result.id,
        new Date().toISOString(),
        getUserName(),
        'Añadiendo',
        parseInt(duplicateForm.cantidad),
        duplicateForm.nombre
      );

      await ejecutarBusqueda();
      Alert.alert('Éxito', 'Medicamento duplicado correctamente');
      setDuplicateModalVisible(false);
    } catch (error) {
      console.error('Error duplicando:', error);
      Alert.alert('Error', 'No se pudo duplicar el medicamento');
    }
  };

  // ── Modal de imagen ──
  const openImageModal = (imageBase64, medName) => {
    if (!imageBase64) {
      Alert.alert('Error', 'No hay imagen para mostrar');
      return;
    }
    console.log('🖼️ tipo imagen:', typeof imageBase64);
    console.log('🖼️ es string:', typeof imageBase64 === 'string');
    console.log('🖼️ longitud:', imageBase64?.length);
    console.log('🖼️ primeros 80 chars:', String(imageBase64).substring(0, 80));
    console.log('🖼️ tiene base64,:', String(imageBase64).includes('base64,'));
    console.log('🖼️ empieza con data:', String(imageBase64).startsWith('data'));

    resetZoom();
    const cleanImage = imageBase64.includes('base64,')
      ? imageBase64.split('base64,')[1]
      : imageBase64;
    console.log('🖼️ cleanImage primeros 80:', cleanImage.substring(0, 80));
    setSelectedImage(cleanImage);
    setSelectedMedName(medName);
    setImageModalVisible(true);
  };

  const closeImageModal = () => {
    resetZoom();
    setImageModalVisible(false);
  };

  const shareImage = async () => {
    if (!selectedImage) return;
    try {
      const filename = `${FileSystem.cacheDirectory}med_${Date.now()}.jpg`;
      // ✅ FIX: selectedImage ya es base64 puro, pero por seguridad extraemos
      // solo la parte después de "base64," por si acaso tuviera prefijo.
      const base64Pure = selectedImage.includes('base64,')
        ? selectedImage.split('base64,')[1]
        : selectedImage;
      await FileSystem.writeAsStringAsync(filename, base64Pure, {
        encoding: 'base64',
      });
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(filename, {
          mimeType: 'image/jpeg',
          dialogTitle: `Imagen de ${selectedMedName}`,
          UTI: 'public.jpeg',
        });
      } else {
        Alert.alert('No disponible', 'Tu dispositivo no soporta compartir archivos.');
      }
    } catch (error) {
      console.error('Error compartiendo imagen:', error);
      Alert.alert('Error', 'No se pudo compartir la imagen');
    }
  };

  // ── Status helpers ──
  const getStatusBorderColor = (fecha, activo) => {
    if (!activo) return '#9CA3AF';
    const days = getDaysUntilExpiry(fecha);
    if (days < 0) return '#DC2626';
    if (days <= 30) return '#EA580C';
    return '#22C55E';
  };

  const getStatusText = (fecha, activo) => {
    if (!activo) return 'INACTIVO';
    const days = getDaysUntilExpiry(fecha);
    if (days < 0) return 'VENCIDO';
    if (days <= 30) return `Vence en ${days} días`;
    return 'Vigente';
  };

  // ── Card de medicamento ──
  const InventoryCard = ({ med }) => {
    const isInactivo = med.activo === false;
    const borderColor = getStatusBorderColor(med.vencimiento, !isInactivo);
    const statusText = getStatusText(med.vencimiento, !isInactivo);
    console.log(
      '🔍 render - imageModalVisible:',
      imageModalVisible,
      'selectedImage len:',
      selectedImage?.length
    );
    return (
      <TouchableOpacity
        style={[styles.historyCardCompact, { borderLeftColor: borderColor }]}
        onPress={() => {
          setSelectedMed(med);
          setModalVisible(true);
        }}
        activeOpacity={0.7}
      >
        <View style={styles.cardRowCompact}>
          <View style={styles.medicamentoContainerCompact}>
            <Pill color="#7C3AED" size={10} />
            <Text style={styles.medicamentoTextCompact} numberOfLines={1}>
              {med.nombre} {med.presentacion ? `(${med.presentacion})` : ''}
            </Text>
          </View>
          <Text style={styles.cantidadTextCompact}>{med.cantidad} uds</Text>
        </View>
        <View style={styles.cardRowCompact}>
          <Text style={styles.categoriaTextCompact}>{med.categoria || 'Sin categoría'}</Text>
          <View style={[styles.statusBadgeCompact, { backgroundColor: borderColor + '20' }]}>
            <Text style={[styles.statusTextCompact, { color: borderColor }]}>{statusText}</Text>
          </View>
        </View>
        {med.ubicacion && (
          <View style={styles.cardRowCompact}>
            <MapPin color="#6B7280" size={8} />
            <Text style={styles.ubicacionTextCompact} numberOfLines={1}>
              {med.ubicacion}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header con búsqueda */}
      <View style={styles.header}>
        <View style={styles.searchContainer}>
          <Search color="#9CA3AF" size={20} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder={modoInactivos ? 'Buscar medicamento inactivo...' : 'Buscar medicamento...'}
            placeholderTextColor="#9CA3AF"
            value={searchInputValue}
            onChangeText={setSearchInputValue}
            onSubmitEditing={ejecutarBusqueda}
            returnKeyType="search"
          />
          <TouchableOpacity style={styles.searchButtonSmall} onPress={ejecutarBusqueda}>
            <Text style={styles.searchButtonSmallText}>Buscar</Text>
          </TouchableOpacity>
          {searchInputValue !== '' && (
            <TouchableOpacity onPress={limpiarBusqueda}>
              <X color="#9CA3AF" size={20} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.headerButtons}>
          {/* Botón de filtros (solo visible en modo activos) */}
          {!modoInactivos && (
            <TouchableOpacity
              style={styles.filterButton}
              onPress={() => setShowFilters(!showFilters)}
            >
              <Filter color="#7C3AED" size={20} />
              <Text style={styles.filterButtonText}>Filtros</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.inactivosButton, modoInactivos && styles.inactivosButtonActive]}
            onPress={toggleModoInactivos}
          >
            <AlertCircle color={modoInactivos ? 'white' : '#6B7280'} size={20} />
            <Text
              style={[
                styles.inactivosButtonText,
                modoInactivos && styles.inactivosButtonTextActive,
              ]}
            >
              {modoInactivos ? 'Activos' : 'Inactivos'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Filtros (solo para activos) */}
        {showFilters && !modoInactivos && (
          <View style={styles.filtersContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {[
                { key: 'todos', label: 'Todos' },
                { key: 'vigentes', label: 'Vigentes' },
                { key: 'porVencer', label: 'Por vencer' },
                { key: 'vencidos', label: 'Vencidos' },
              ].map((f) => (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
                  onPress={() => {
                    setFilter(f.key);
                    ejecutarBusqueda();
                  }}
                >
                  <Text
                    style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}
                  >
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      {/* Lista de resultados */}
      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#7C3AED" />
            <Text style={styles.loadingText}>Buscando medicamentos...</Text>
          </View>
        ) : resultados.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Package color="#D1D5DB" size={64} />
            <Text style={styles.emptyTitle}>No hay medicamentos</Text>
            <Text style={styles.emptyText}>
              {searchInputValue
                ? 'No se encontraron resultados'
                : `Escribe un nombre y presiona "Buscar" para encontrar ${modoInactivos ? 'medicamentos inactivos' : 'medicamentos'}`}
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsText}>
                {resultados.length} {resultados.length === 1 ? 'medicamento' : 'medicamentos'}{' '}
                encontrados
              </Text>
              <TouchableOpacity
                style={styles.pdfButton}
                onPress={generatePDF}
                disabled={generatingPDF}
              >
                <FileText color="#7C3AED" size={18} />
                <Text style={styles.pdfButtonText}>{generatingPDF ? 'Generando...' : 'PDF'}</Text>
              </TouchableOpacity>
            </View>
            {resultados.map((med) => (
              <InventoryCard key={med.id} med={med} />
            ))}
          </>
        )}
      </ScrollView>

      {/* MODALES (sin cambios en el contenido, solo en lógica) */}
      {/* MODAL DE DETALLE DEL MEDICAMENTO */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.detailModalContent}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { fontSize: 17 }]} numberOfLines={1}>
                {selectedMed?.nombre}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X color="#6B7280" size={24} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.detailModalBody}>
              <View style={styles.detailRow}>
                <Pill color="#7C3AED" size={15} />
                <Text style={[styles.detailLabel, { fontSize: 13 }]}>Nombre:</Text>
                <Text style={[styles.detailValue, { fontSize: 13 }]}>{selectedMed?.nombre}</Text>
              </View>
              <View style={styles.detailRow}>
                <Package color="#7C3AED" size={15} />
                <Text style={[styles.detailLabel, { fontSize: 13 }]}>Presentación:</Text>
                <Text style={[styles.detailValue, { fontSize: 13 }]}>
                  {selectedMed?.presentacion || 'No especificada'}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <FileText color="#7C3AED" size={15} />
                <Text style={[styles.detailLabel, { fontSize: 13 }]}>Categoría:</Text>
                <Text style={[styles.detailValue, { fontSize: 13 }]}>
                  {selectedMed?.categoria || 'Sin categoría'}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Package color="#7C3AED" size={15} />
                <Text style={[styles.detailLabel, { fontSize: 13 }]}>Cantidad:</Text>
                <Text style={[styles.detailValue, { fontSize: 13 }]}>
                  {selectedMed?.cantidad} unidades
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Calendar color="#7C3AED" size={15} />
                <Text style={[styles.detailLabel, { fontSize: 13 }]}>Vencimiento:</Text>
                <Text style={[styles.detailValue, { fontSize: 13 }]}>
                  {selectedMed?.vencimiento
                    ? new Date(selectedMed.vencimiento).toLocaleDateString()
                    : 'No especificada'}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <MapPin color="#7C3AED" size={15} />
                <Text style={[styles.detailLabel, { fontSize: 13 }]}>Ubicación:</Text>
                <Text style={[styles.detailValue, { fontSize: 13 }]}>
                  {selectedMed?.ubicacion || 'No especificada'}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <User color="#7C3AED" size={15} />
                <Text style={[styles.detailLabel, { fontSize: 13 }]}>Registrado por:</Text>
                <Text style={[styles.detailValue, { fontSize: 13 }]}>
                  {selectedMed?.username || 'usuario'}
                </Text>
              </View>

              {selectedMed?.imagen && (
                <TouchableOpacity
                  style={styles.imagePreviewButton}
                  onPress={() => openImageModal(selectedMed.imagen, selectedMed.nombre)}
                >
                  <Image
                    source={{
                      uri: `data:image/jpeg;base64,${selectedMed.imagen.includes('base64,') ? selectedMed.imagen.split('base64,')[1] : selectedMed.imagen}`,
                    }}
                    style={styles.detailImage}
                  />
                  <Text style={[styles.imagePreviewText, { fontSize: 13 }]}>Ver imagen</Text>
                </TouchableOpacity>
              )}

              <View style={styles.detailButtons}>
                {!modoInactivos && selectedMed?.activo !== false && (
                  <>
                    <TouchableOpacity
                      style={styles.editDetailButton}
                      onPress={() => openEditModal(selectedMed)}
                    >
                      <Edit color="#7C3AED" size={16} />
                      <Text style={[styles.editDetailButtonText, { fontSize: 13 }]}>Editar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.duplicateDetailButton}
                      onPress={() => openDuplicateModal(selectedMed)}
                    >
                      <Copy color="#7C3AED" size={16} />
                      <Text style={[styles.duplicateDetailButtonText, { fontSize: 13 }]}>
                        Duplicar
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteDetailButton}
                      onPress={() => handleSoftDelete(selectedMed.id, selectedMed.nombre)}
                    >
                      <Trash color="#DC2626" size={16} />
                      <Text style={[styles.deleteDetailButtonText, { fontSize: 13 }]}>
                        Desactivar
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
                {modoInactivos && selectedMed?.activo === false && (
                  <TouchableOpacity
                    style={styles.reactivarDetailButton}
                    onPress={() => openReactivarModal(selectedMed)}
                  >
                    <Text style={[styles.reactivarDetailButtonText, { fontSize: 13 }]}>
                      Reactivar
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL DE EDICIÓN */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior="padding"
            style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
          >
            <ScrollView
              style={styles.modalContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { fontSize: 17 }]}>Editar Medicamento</Text>
                <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                  <X color="#6B7280" size={24} />
                </TouchableOpacity>
              </View>
              <View style={styles.modalBody}>
                <Text style={[styles.label, { fontSize: 13 }]}>Nombre *</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.nombre}
                  onChangeText={(t) => setEditForm({ ...editForm, nombre: t })}
                  placeholder="Nombre del medicamento"
                />
                <Text style={[styles.label, { fontSize: 13 }]}>Presentación</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.presentacion}
                  onChangeText={(t) => setEditForm({ ...editForm, presentacion: t })}
                  placeholder="Ej: Tabletas 500mg"
                />
                <Text style={[styles.label, { fontSize: 13 }]}>Categoría</Text>
                <CategoriaPicker
                  value={editForm.categoria}
                  onChange={async (text) => {
                    setEditForm({ ...editForm, categoria: text });
                    const ubicacion = await obtenerUbicacionDesdeCategoria(text);
                    if (ubicacion) {
                      setEditForm((prev) => ({ ...prev, ubicacion: ubicacion }));
                    }
                  }}
                  placeholder="Seleccionar categoría"
                  showLabel={false}
                />
                <View style={styles.row}>
                  <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                    <Text style={[styles.label, { fontSize: 13 }]}>Cantidad *</Text>
                    <TextInput
                      style={styles.input}
                      value={editForm.cantidad}
                      onChangeText={(t) => setEditForm({ ...editForm, cantidad: t })}
                      keyboardType="numeric"
                      placeholder="Ej: 50"
                    />
                  </View>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={[styles.label, { fontSize: 13 }]}>Vencimiento *</Text>
                    <DatePickerInput
                      label=""
                      value={editForm.vencimiento}
                      onChange={(date) => setEditForm({ ...editForm, vencimiento: date })}
                      required={true}
                    />
                  </View>
                </View>
                <Text style={[styles.label, { fontSize: 13 }]}>Ubicación</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.ubicacion}
                  onChangeText={(t) => setEditForm({ ...editForm, ubicacion: t })}
                  placeholder="Ej: Estante A3"
                />

                <View style={styles.mediaButtonsRow}>
                  <TouchableOpacity
                    style={styles.audioButton}
                    onPress={() => playAudio(editForm.audio)}
                  >
                    <Mic color="#7C3AED" size={18} />
                    <Text style={[styles.audioButtonText, { fontSize: 12 }]}>Escuchar audio</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cameraButton}
                    onPress={() => tomarFoto('camera', setEditForm, editForm)}
                  >
                    <Camera color="#7C3AED" size={18} />
                    <Text style={[styles.cameraButtonText, { fontSize: 12 }]}>Cámara</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.galleryButton}
                    onPress={() => tomarFoto('gallery', setEditForm, editForm)}
                  >
                    <ImageIcon color="#7C3AED" size={18} />
                    <Text style={[styles.galleryButtonText, { fontSize: 12 }]}>Galería</Text>
                  </TouchableOpacity>
                </View>

                {editForm.imagen && (
                  <Image
                    source={{ uri: `data:image/jpeg;base64,${editForm.imagen}` }}
                    style={styles.editImagePreview}
                  />
                )}

                <TouchableOpacity style={styles.saveButton} onPress={handleSaveEdit}>
                  <Text style={[styles.saveButtonText, { fontSize: 15 }]}>Guardar Cambios</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* MODAL DE REACTIVAR */}
      <Modal
        visible={reactivarModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setReactivarModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior="padding"
            style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
          >
            <ScrollView
              style={styles.modalContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { fontSize: 17 }]}>Reactivar Medicamento</Text>
                <TouchableOpacity onPress={() => setReactivarModalVisible(false)}>
                  <X color="#6B7280" size={24} />
                </TouchableOpacity>
              </View>
              <View style={styles.modalBody}>
                <Text style={[styles.label, { fontSize: 13 }]}>Nombre *</Text>
                <TextInput
                  style={styles.input}
                  value={reactivarForm.nombre}
                  onChangeText={(t) => setReactivarForm({ ...reactivarForm, nombre: t })}
                  placeholder="Nombre del medicamento"
                />
                <Text style={[styles.label, { fontSize: 13 }]}>Presentación</Text>
                <TextInput
                  style={styles.input}
                  value={reactivarForm.presentacion}
                  onChangeText={(t) => setReactivarForm({ ...reactivarForm, presentacion: t })}
                  placeholder="Ej: Tabletas 500mg"
                />
                <Text style={[styles.label, { fontSize: 13 }]}>Categoría</Text>
                <CategoriaPicker
                  value={reactivarForm.categoria}
                  onChange={async (text) => {
                    setReactivarForm({ ...reactivarForm, categoria: text });
                    const ubicacion = await obtenerUbicacionDesdeCategoria(text);
                    if (ubicacion) {
                      setReactivarForm((prev) => ({ ...prev, ubicacion: ubicacion }));
                    }
                  }}
                  placeholder="Seleccionar categoría"
                  showLabel={false}
                />
                <View style={styles.row}>
                  <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                    <Text style={[styles.label, { fontSize: 13 }]}>Cantidad *</Text>
                    <TextInput
                      style={styles.input}
                      value={reactivarForm.cantidad}
                      onChangeText={(t) => setReactivarForm({ ...reactivarForm, cantidad: t })}
                      keyboardType="numeric"
                      placeholder="Ej: 50"
                    />
                  </View>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={[styles.label, { fontSize: 13 }]}>Vencimiento *</Text>
                    <DatePickerInput
                      label=""
                      value={reactivarForm.vencimiento}
                      onChange={(date) => setReactivarForm({ ...reactivarForm, vencimiento: date })}
                      required={true}
                    />
                  </View>
                </View>
                <Text style={[styles.label, { fontSize: 13 }]}>Ubicación</Text>
                <TextInput
                  style={styles.input}
                  value={reactivarForm.ubicacion}
                  onChangeText={(t) => setReactivarForm({ ...reactivarForm, ubicacion: t })}
                  placeholder="Ej: Estante A3"
                />

                <View style={styles.mediaButtonsRow}>
                  <TouchableOpacity
                    style={styles.cameraButton}
                    onPress={() => tomarFoto('camera', setReactivarForm, reactivarForm)}
                  >
                    <Camera color="#7C3AED" size={18} />
                    <Text style={[styles.cameraButtonText, { fontSize: 12 }]}>Cambiar foto</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.galleryButton}
                    onPress={() => tomarFoto('gallery', setReactivarForm, reactivarForm)}
                  >
                    <ImageIcon color="#7C3AED" size={18} />
                    <Text style={[styles.galleryButtonText, { fontSize: 12 }]}>Galería</Text>
                  </TouchableOpacity>
                </View>

                {reactivarForm.imagen && (
                  <Image
                    source={{ uri: `data:image/jpeg;base64,${reactivarForm.imagen}` }}
                    style={styles.editImagePreview}
                  />
                )}

                <TouchableOpacity style={styles.saveButton} onPress={handleSaveReactivar}>
                  <Text style={[styles.saveButtonText, { fontSize: 15 }]}>
                    Reactivar Medicamento
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* MODAL DE DUPLICAR */}
      <Modal
        visible={duplicateModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setDuplicateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior="padding"
            style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
          >
            <ScrollView
              style={styles.modalContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { fontSize: 17 }]}>Duplicar Medicamento</Text>
                <TouchableOpacity onPress={() => setDuplicateModalVisible(false)}>
                  <X color="#6B7280" size={24} />
                </TouchableOpacity>
              </View>
              <View style={styles.modalBody}>
                <Text style={[styles.label, { fontSize: 13 }]}>Nombre *</Text>
                <TextInput
                  style={styles.input}
                  value={duplicateForm.nombre}
                  onChangeText={(t) => setDuplicateForm({ ...duplicateForm, nombre: t })}
                  placeholder="Nombre del medicamento"
                />
                <Text style={[styles.label, { fontSize: 13 }]}>Presentación</Text>
                <TextInput
                  style={styles.input}
                  value={duplicateForm.presentacion}
                  onChangeText={(t) => setDuplicateForm({ ...duplicateForm, presentacion: t })}
                  placeholder="Ej: Tabletas 500mg"
                />
                <Text style={[styles.label, { fontSize: 13 }]}>Categoría</Text>
                <CategoriaPicker
                  value={duplicateForm.categoria}
                  onChange={async (text) => {
                    setDuplicateForm({ ...duplicateForm, categoria: text });
                    const ubicacion = await obtenerUbicacionDesdeCategoria(text);
                    if (ubicacion) {
                      setDuplicateForm((prev) => ({ ...prev, ubicacion: ubicacion }));
                    }
                  }}
                  placeholder="Seleccionar categoría"
                  showLabel={false}
                />
                <Text style={[styles.label, { fontSize: 13 }]}>Ubicación</Text>
                <TextInput
                  style={styles.input}
                  value={duplicateForm.ubicacion}
                  onChangeText={(t) => setDuplicateForm({ ...duplicateForm, ubicacion: t })}
                  placeholder="Ej: Estante A3"
                />
                <View style={styles.row}>
                  <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                    <Text style={[styles.label, { fontSize: 13 }]}>Cantidad *</Text>
                    <TextInput
                      style={styles.input}
                      value={duplicateForm.cantidad}
                      onChangeText={(t) => setDuplicateForm({ ...duplicateForm, cantidad: t })}
                      keyboardType="numeric"
                      placeholder="Ej: 50"
                    />
                  </View>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={[styles.label, { fontSize: 13 }]}>Vencimiento *</Text>
                    <DatePickerInput
                      label=""
                      value={duplicateForm.vencimiento}
                      onChange={(date) => setDuplicateForm({ ...duplicateForm, vencimiento: date })}
                      required={true}
                    />
                  </View>
                </View>
                <TouchableOpacity style={styles.saveButton} onPress={handleSaveDuplicate}>
                  <Text style={[styles.saveButtonText, { fontSize: 15 }]}>
                    Duplicar Medicamento
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* MODAL DE IMAGEN CON ZOOM */}
      <Modal
        visible={imageModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={closeImageModal}
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View style={styles.imageModalContainer}>
            <TouchableOpacity style={styles.imageModalCloseButton} onPress={closeImageModal}>
              <X color="white" size={28} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.imageModalShareButton} onPress={shareImage}>
              <Share2 color="white" size={24} />
            </TouchableOpacity>

            <GestureDetector gesture={composed}>
              <Animated.View style={[styles.imageModalWrapper, { transform: [{ scale }] }]}>
                {selectedImage ? (
                  <Image
                    source={{ uri: `data:image/jpeg;base64,${selectedImage}` }}
                    style={{ width: width, height: height * 0.7 }} // ✅ dimensiones explícitas
                    resizeMode="contain"
                    onLoad={() => console.log('✅ Imagen cargada')}
                    onError={(e) => console.log('❌ Error imagen:', e.nativeEvent.error)}
                  />
                ) : (
                  <Text style={{ color: 'white' }}>Sin imagen</Text>
                )}
              </Animated.View>
            </GestureDetector>
            <Text style={styles.imageModalHint}>
              Pellizca para zoom · Doble toque para resetear
            </Text>
          </View>
        </GestureHandlerRootView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  content: { flex: 1, padding: 16 },

  header: {
    backgroundColor: 'white',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
    gap: 8,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 16, color: '#1F2937' },
  searchButtonSmall: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchButtonSmallText: { color: 'white', fontWeight: '600', fontSize: 12 },

  headerButtons: { flexDirection: 'row', gap: 8, marginTop: 8 },
  filterButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 8,
  },
  filterButtonText: { color: '#7C3AED', fontWeight: '600', fontSize: 14 },
  inactivosButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 8,
  },
  inactivosButtonActive: { backgroundColor: '#6B7280' },
  inactivosButtonText: { color: '#6B7280', fontWeight: '600', fontSize: 14 },
  inactivosButtonTextActive: { color: 'white' },

  filtersContainer: {
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingBottom: 12,
    marginTop: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    marginRight: 8,
  },
  filterChipActive: { backgroundColor: '#7C3AED' },
  filterChipText: { color: '#4B5563', fontWeight: '500', fontSize: 13 },
  filterChipTextActive: { color: 'white' },

  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  resultsText: { fontSize: 14, color: '#6B7280' },
  pdfButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  pdfButtonText: { color: '#7C3AED', fontWeight: '600', fontSize: 12 },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: { marginTop: 10, fontSize: 14, color: '#6B7280' },

  emptyContainer: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#374151', marginTop: 16 },
  emptyText: { fontSize: 14, color: '#9CA3AF', marginTop: 8, textAlign: 'center' },

  historyCardCompact: {
    backgroundColor: 'white',
    marginBottom: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    elevation: 0.5,
    borderLeftWidth: 3,
  },
  cardRowCompact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
    flexWrap: 'wrap',
    gap: 4,
  },
  medicamentoContainerCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  medicamentoTextCompact: { fontSize: 10, fontWeight: '600', color: '#1F2937', flex: 1 },
  cantidadTextCompact: { fontSize: 9, fontWeight: 'bold', color: '#7C3AED' },
  categoriaTextCompact: { fontSize: 8, color: '#6B7280' },
  statusBadgeCompact: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  statusTextCompact: { fontSize: 8, fontWeight: '600' },
  ubicacionTextCompact: { fontSize: 8, color: '#10B981', marginLeft: 4 },

  // Modales
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
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: { fontWeight: 'bold', color: '#1F2937' },
  modalBody: { padding: 16 },
  label: { fontWeight: '600', color: '#374151', marginBottom: 4, fontSize: 13 },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    marginBottom: 12,
    color: '#1F2937',
  },
  row: { flexDirection: 'row', marginBottom: 12, gap: 12 },
  inputGroup: { marginBottom: 0 },
  saveButton: {
    backgroundColor: '#7C3AED',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  saveButtonText: { color: 'white', fontWeight: 'bold' },

  detailModalContent: {
    backgroundColor: 'white',
    borderRadius: 24,
    width: '90%',
    maxHeight: '85%',
    overflow: 'hidden',
  },
  detailModalBody: { padding: 20 },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' },
  detailLabel: { fontWeight: '600', color: '#374151', marginLeft: 8, width: 100 },
  detailValue: { color: '#1F2937', flex: 1 },
  detailImage: { width: 50, height: 50, borderRadius: 8, marginRight: 12 },
  imagePreviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    padding: 10,
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
  },
  imagePreviewText: { color: '#7C3AED', marginLeft: 8 },
  detailButtons: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 10 },
  editDetailButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 4,
    backgroundColor: '#EDE9FE',
  },
  editDetailButtonText: { color: '#7C3AED', fontWeight: '600', fontSize: 12 },
  duplicateDetailButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 4,
    backgroundColor: '#FEF3C7',
  },
  duplicateDetailButtonText: { color: '#EA580C', fontWeight: '600', fontSize: 12 },
  deleteDetailButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 4,
    backgroundColor: '#FEE2E2',
  },
  deleteDetailButtonText: { color: '#DC2626', fontWeight: '600', fontSize: 12 },
  reactivarDetailButton: {
    flex: 1,
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  reactivarDetailButtonText: { color: 'white', fontWeight: '600', fontSize: 12 },

  mediaButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 16,
  },
  audioButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
    backgroundColor: '#EDE9FE',
  },
  audioButtonText: { color: '#7C3AED', fontWeight: '600', fontSize: 12 },
  cameraButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
    backgroundColor: '#E0E7FF',
  },
  cameraButtonText: { color: '#4338CA', fontWeight: '600', fontSize: 12 },
  galleryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
    backgroundColor: '#F3E8FF',
  },
  galleryButtonText: { color: '#9333EA', fontWeight: '600', fontSize: 12 },
  editImagePreview: {
    width: 70,
    height: 70,
    borderRadius: 8,
    marginBottom: 16,
    alignSelf: 'center',
  },

  imageModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageModalCloseButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 30,
    padding: 10,
  },
  imageModalShareButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 30,
    padding: 10,
  },
  imageModalWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  imageModalImage: { width: '100%', height: '100%' },
  imageModalHint: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
    textAlign: 'center',
    paddingBottom: 24,
  },
});
