// src/screens/InventoryScreen.js
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Image,
} from 'react-native';
import {
  Package,
  FileText,
  X,
  Calendar,
  MapPin,
  User,
  Edit,
  Copy,
  Trash,
  Pill,
} from 'lucide-react-native';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import {
  medicamentosList,
  medicamentoGetOne,
  medicamentoUpdate,
  medicamentoCreate,
  medicamentoDelete,
  historyCreate,
  categoriaGetByNombre,
} from '../services/LocalDataService';

// Components
import { InventoryCard } from '../components/inventory/InventoryCard';
import { SearchHeader } from '../components/inventory/SearchHeader';
import { ImageZoomModal } from '../components/inventory/ImageZoomModal';
import { EditMedicationModal } from '../components/inventory/EditMedicationModal';
import { DuplicateMedicationModal } from '../components/inventory/DuplicateMedicationModal';
import { ReactivateMedicationModal } from '../components/inventory/ReactivateMedicationModal';
import { LoadingButton } from '../components/common/LoadingButton';

// Utils
import { getDaysUntilExpiry, formatDate, getExpiryCategory } from '../utils/dateUtils';
import { normalizeSearchTerm } from '../utils/normalizeText';

const escapeHtml = (text) => {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const registrarHistory = async (idMed, fecha, user, movimiento, cantidad, nombreMed = '') => {
  try {
    await historyCreate({
      id_med: idMed,
      fecha: fecha,
      user: user,
      movimiento: movimiento,
      cantidad: cantidad,
      nombre: nombreMed,
    });
    console.log(`📝 History registrado: ${movimiento} - ${nombreMed}`);
  } catch (error) {
    console.error('Error registrando history:', error);
  }
};

export default function InventoryScreen({ user }) {
  const route = useRoute();

  // Estados principales
  const [resultados, setResultados] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchInputValue, setSearchInputValue] = useState('');
  const [modoInactivos, setModoInactivos] = useState(false);
  const [filter, setFilter] = useState('todos');
  const [showFilters, setShowFilters] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [audioSound, setAudioSound] = useState(null);

  // Estado para saber si se ha realizado una búsqueda
  const [haBuscado, setHaBuscado] = useState(false);

  // Ref para controlar procesamiento de parámetros
  const lastProcessedParams = useRef({ medicamento: '', filtro: '', timestamp: 0 });

  // Estados para modales
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedMed, setSelectedMed] = useState(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [duplicateModalVisible, setDuplicateModalVisible] = useState(false);
  const [reactivarModalVisible, setReactivarModalVisible] = useState(false);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedMedName, setSelectedMedName] = useState('');

  const getUserName = () => user?.nombre || 'usuario';

  // ── Funciones de búsqueda ──
  // Modificar la función ejecutarBusqueda:

  const ejecutarBusqueda = useCallback(
    async (terminoBusqueda = null, filtroEspecifico = null) => {
      const termino = terminoBusqueda !== null ? terminoBusqueda : searchInputValue;
      const filtroActual = filtroEspecifico !== null ? filtroEspecifico : filter;

      setLoading(true);

      try {
        // Antes esto armaba un filtro de PocketBase contra la vista 'searck_key'.
        // Ahora todo vive local: traemos los medicamentos (activos o inactivos)
        // de SQLite y filtramos en JS, que con datos locales es instantáneo.
        let items = await medicamentosList(!modoInactivos);

        // 2. Filtro de búsqueda por texto (mismo criterio: todas las palabras deben aparecer)
        if (termino && termino.trim() !== '') {
          const searchTerm = normalizeSearchTerm(termino);
          const palabras = searchTerm.split(/\s+/).filter((p) => p.length > 0);

          items = items.filter((med) => {
            const haystack = normalizeSearchTerm(
              `${med.nombre || ''} ${med.presentacion || ''} ${med.categoria || ''}`
            );
            return palabras.every((palabra) => haystack.includes(palabra));
          });

          console.log('🔍 Palabras:', palabras);
        }

        // 3. Filtros de vigencia (solo para activos)
        if (!modoInactivos && filtroActual !== 'todos') {
          const hoy = new Date();
          const dentro30Dias = new Date();
          dentro30Dias.setDate(hoy.getDate() + 30);

          const hoyStr = hoy.toISOString().split('T')[0];
          const dentro30DiasStr = dentro30Dias.toISOString().split('T')[0];

          items = items.filter((med) => {
            const fechaVen = med.vencimiento ? med.vencimiento.split('T')[0] : '';
            if (!fechaVen) return filtroActual === 'vigentes' ? false : false;
            switch (filtroActual) {
              case 'vigentes':
                return fechaVen > dentro30DiasStr;
              case 'porVencer':
                return fechaVen >= hoyStr && fechaVen <= dentro30DiasStr;
              case 'vencidos':
                return fechaVen < hoyStr;
              default:
                return true;
            }
          });
        }

        // Orden por fecha de creación (fechaRegistro), descendente:
        // los últimos medicamentos entrados a la BD arriba
        items = [...items].sort(
          (a, b) => new Date(b.fechaRegistro || 0) - new Date(a.fechaRegistro || 0)
        );

        console.log('🔍 Modo:', modoInactivos ? 'INACTIVOS' : 'ACTIVOS');
        console.log('🔍 Término original:', termino);
        console.log('🔍 Filtro:', filtroActual);

        setResultados(items);
        setHaBuscado(true);
        console.log(`📦 Resultados: ${items.length} medicamentos`);
      } catch (error) {
        console.error('Error en búsqueda:', error);
        Alert.alert('Error', error.message || 'No se pudo realizar la búsqueda');
      } finally {
        setLoading(false);
      }
    },
    [modoInactivos, searchInputValue, filter]
  );

  // Búsqueda en vivo: cada cambio de texto, filtro o modo (activos/inactivos)
  // recarga la lista automáticamente, sin necesitar un botón "Buscar".
  // Pequeño debounce para no re-filtrar en cada tecla si se escribe rápido.
  useEffect(() => {
    const t = setTimeout(() => {
      ejecutarBusqueda(searchInputValue, filter);
    }, 200);
    return () => clearTimeout(t);
  }, [searchInputValue, filter, modoInactivos, ejecutarBusqueda]);

  // Procesar parámetros de navegación - SIEMPRE se ejecuta cuando la pantalla recibe nuevos params
  useEffect(() => {
    const params = route?.params || {};
    const medicamentoNombre = params.medicamentoNombre || '';
    const filtroType = params.filterType || 'todos';
    const timestamp = params._timestamp || 0;
    const forceRefresh = params._forceRefresh || false;

    console.log('📥 InventoryScreen useEffect - Parámetros recibidos:', {
      medicamentoNombre,
      filtroType,
      timestamp,
      forceRefresh,
    });

    // Verificar si ya procesamos estos parámetros (evitar duplicados)
    const isDuplicate =
      !forceRefresh &&
      lastProcessedParams.current.medicamento === medicamentoNombre &&
      lastProcessedParams.current.filtro === filtroType &&
      lastProcessedParams.current.timestamp === timestamp;

    if (isDuplicate && !forceRefresh) {
      console.log('⏭️ Parámetros duplicados, omitiendo procesamiento');
      return;
    }

    // Actualizar ref de últimos parámetros procesados
    lastProcessedParams.current = {
      medicamento: medicamentoNombre,
      filtro: filtroType,
      timestamp: timestamp,
    };

    // Limpiar estado anterior completamente
    setSearchInputValue(medicamentoNombre);
    setFilter(filtroType);
    setResultados([]);
    setHaBuscado(false);

    // Pequeño delay para asegurar que los estados se actualizaron
    setTimeout(() => {
      if (medicamentoNombre) {
        console.log(
          `🔍 Ejecutando búsqueda de medicamento: "${medicamentoNombre}" con filtro: ${filtroType}`
        );
        ejecutarBusqueda(medicamentoNombre, filtroType);
      } else if (filtroType && filtroType !== 'todos') {
        console.log(`🔍 Ejecutando búsqueda con filtro: ${filtroType}`);
        ejecutarBusqueda('', filtroType);
      } else {
        console.log('🔍 Sin parámetros de búsqueda - cargando lista completa');
        ejecutarBusqueda(medicamentoNombre, filtroType);
      }
    }, 100);
  }, [
    route?.params?.medicamentoNombre,
    route?.params?.filterType,
    route?.params?._timestamp,
    route?.params?._forceRefresh,
  ]);

  // Limpiar al desmontar
  useEffect(() => {
    return () => {
      console.log('🗑️ InventoryScreen desmontando');
    };
  }, []);

  // Función para buscar cuando el usuario presiona el botón
  const handleSearch = (termino) => {
    setSearchInputValue(termino);
    ejecutarBusqueda(termino, filter);
  };

  // Cambiar filtro de vigencia (el efecto de búsqueda en vivo recarga solo)
  const handleFilterChange = (nuevoFiltro) => {
    console.log('🔄 Cambiando filtro de:', filter, 'a:', nuevoFiltro);
    setFilter(nuevoFiltro);
  };

  // Cambiar entre activos/inactivos
  const toggleModoInactivos = () => {
    const nuevoModo = !modoInactivos;
    console.log('🔄 Cambiando modo a:', nuevoModo ? 'INACTIVOS' : 'ACTIVOS');
    setModoInactivos(nuevoModo);
    setFilter('todos');
    setSearchInputValue('');
    // El efecto de búsqueda en vivo recarga la lista completa del nuevo modo
  };

  // Refrescar (pull to refresh)
  const onRefresh = useCallback(async () => {
    if (!haBuscado) return;
    setRefreshing(true);
    await ejecutarBusqueda(searchInputValue, filter);
    setRefreshing(false);
  }, [ejecutarBusqueda, searchInputValue, filter, haBuscado]);

  // Función para limpiar el texto de búsqueda (vuelve a mostrar la lista completa)
  const limpiarTodo = () => {
    setSearchInputValue('');
    setFilter('todos');
    // El efecto de búsqueda en vivo recarga la lista completa
  };

  useFocusEffect(
    useCallback(() => {
      return () => {};
    }, [])
  );

  // ── Funciones de utilidad ──
  const obtenerUbicacionDesdeCategoria = async (categoriaNombre) => {
    if (!categoriaNombre) return '';
    try {
      const categoria = await categoriaGetByNombre(categoriaNombre);
      return categoria?.ubicacion || '';
    } catch (error) {
      console.error('Error obteniendo ubicación:', error);
      return '';
    }
  };

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
      await FileSystem.writeAsStringAsync(uri, audioBase64, {
        encoding: 'base64',
      });
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

  const mostrarNotificacionVencimiento = (nombreMedicamento, fechaVencimiento, accion) => {
    const daysUntilExpiry = getDaysUntilExpiry(fechaVencimiento);
    if (daysUntilExpiry < 0) {
      Alert.alert(
        '⚠️ Medicamento Vencido',
        `El medicamento ${nombreMedicamento} ${accion} tiene fecha vencida.`,
        [{ text: 'OK' }]
      );
    } else if (daysUntilExpiry <= 30) {
      Alert.alert(
        '📅 Medicamento por Vencer',
        `El medicamento ${nombreMedicamento} ${accion} vencerá en ${daysUntilExpiry} días.`,
        [{ text: 'OK' }]
      );
    }
  };

  // ── CRUD Operations ──
  const handleSoftDelete = async (medId, medName) => {
    Alert.alert('Desactivar Medicamento', `¿Estás seguro de desactivar ${medName}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desactivar',
        style: 'destructive',
        onPress: async () => {
          try {
            const medActual = await medicamentoGetOne(medId);
            await medicamentoUpdate(medId, {
              activo: false,
              fechaBaja: new Date().toISOString(),
            });
            await registrarHistory(
              medId,
              new Date().toISOString(),
              getUserName(),
              'Desactivando',
              medActual.cantidad,
              medActual.nombre
            );
            if (haBuscado) {
              await ejecutarBusqueda(searchInputValue, filter);
            }
            setDetailModalVisible(false);
            Alert.alert('Éxito', 'Medicamento desactivado');
          } catch (error) {
            console.error('Error desactivando:', error);
            Alert.alert('Error', 'No se pudo desactivar');
          }
        },
      },
    ]);
  };

  // Eliminar un medicamento inactivo PERMANENTEMENTE (a diferencia de
  // Desactivar, esto no se puede deshacer - borra el registro por completo)
  const handleEliminarDefinitivo = async (medId, medName) => {
    Alert.alert(
      'Eliminar definitivamente',
      `¿Estás seguro de eliminar PERMANENTEMENTE "${medName}"? Esta acción NO se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await registrarHistory(
                medId,
                new Date().toISOString(),
                getUserName(),
                'Eliminado permanentemente',
                0,
                medName
              );
              await medicamentoDelete(medId);
              if (haBuscado) {
                await ejecutarBusqueda(searchInputValue, filter);
              }
              setDetailModalVisible(false);
              Alert.alert('Éxito', 'Medicamento eliminado permanentemente');
            } catch (error) {
              console.error('Error eliminando definitivamente:', error);
              Alert.alert('Error', 'No se pudo eliminar el medicamento');
            }
          },
        },
      ]
    );
  };

  const handleEditSave = async (form) => {
    const cantidadAnterior = selectedMed.cantidad;
    const nuevaCantidad = parseInt(form.cantidad);
    const diferencia = nuevaCantidad - cantidadAnterior;

    const fechaAnterior = selectedMed.vencimiento;
    const fechaNueva = form.vencimiento;
    const fechaCambio = fechaAnterior !== fechaNueva;

    let ubicacionFinal = form.ubicacion.trim();
    if (form.categoria !== selectedMed.categoria) {
      const ubicacionDesdeCategoria = await obtenerUbicacionDesdeCategoria(form.categoria);
      if (ubicacionDesdeCategoria) {
        ubicacionFinal = ubicacionDesdeCategoria;
      }
    }

    await medicamentoUpdate(selectedMed.id, {
      nombre: form.nombre.trim(),
      presentacion: form.presentacion.trim() || 'No especificada',
      categoria: form.categoria.trim() || 'Sin categoría',
      cantidad: nuevaCantidad,
      vencimiento: fechaNueva,
      ubicacion: ubicacionFinal,
      fechaEdicion: new Date().toISOString(),
      editadoPor: getUserName(),
    });

    if (form.imagen !== selectedMed.imagen && form.imagen) {
      await medicamentoUpdate(selectedMed.id, {
        imagen: form.imagen,
      });
    }

    if (diferencia !== 0) {
      await registrarHistory(
        selectedMed.id,
        new Date().toISOString(),
        getUserName(),
        diferencia > 0 ? 'Añadiendo' : 'Entregando',
        Math.abs(diferencia),
        selectedMed.nombre
      );
    }

    if (fechaCambio) {
      mostrarNotificacionVencimiento(selectedMed.nombre, fechaNueva, 'actualizado');
    }

    if (haBuscado) {
      await ejecutarBusqueda(searchInputValue, filter);
    }
    Alert.alert('Éxito', 'Medicamento actualizado correctamente');
  };

  const handleDuplicateSave = async (form) => {
    const ubicacionDesdeCategoria = await obtenerUbicacionDesdeCategoria(form.categoria);
    const ubicacionFinal = ubicacionDesdeCategoria || form.ubicacion.trim();

    const result = await medicamentoCreate({
      nombre: form.nombre.trim(),
      presentacion: form.presentacion.trim() || 'No especificada',
      categoria: form.categoria.trim() || 'Sin categoría',
      cantidad: parseInt(form.cantidad),
      vencimiento: form.vencimiento,
      ubicacion: ubicacionFinal,
      imagen: selectedMed.imagen || null,
      activo: true,
      fechaRegistro: new Date().toISOString(),
      userName: getUserName(),
      userId: getUserName(),
    });

    await registrarHistory(
      result.id,
      new Date().toISOString(),
      getUserName(),
      'Añadiendo',
      parseInt(form.cantidad),
      form.nombre
    );

    mostrarNotificacionVencimiento(form.nombre, form.vencimiento, 'duplicado');

    if (haBuscado) {
      await ejecutarBusqueda(searchInputValue, filter);
    }
    Alert.alert('Éxito', 'Medicamento duplicado correctamente');
  };

  const handleReactivarSave = async (form) => {
    let ubicacionFinal = form.ubicacion.trim();
    if (form.categoria !== selectedMed.categoria) {
      const ubicacionDesdeCategoria = await obtenerUbicacionDesdeCategoria(form.categoria);
      if (ubicacionDesdeCategoria) {
        ubicacionFinal = ubicacionDesdeCategoria;
      }
    }

    await medicamentoUpdate(selectedMed.id, {
      nombre: form.nombre.trim(),
      presentacion: form.presentacion.trim() || 'No especificada',
      categoria: form.categoria.trim() || 'Sin categoría',
      cantidad: parseInt(form.cantidad),
      vencimiento: form.vencimiento,
      ubicacion: ubicacionFinal,
      activo: true,
      fechaBaja: null,
      fechaEdicion: new Date().toISOString(),
      editadoPor: getUserName(),
      fechaReactivacion: new Date().toISOString(),
    });

    if (form.imagen !== selectedMed.imagen && form.imagen) {
      await medicamentoUpdate(selectedMed.id, {
        imagen: form.imagen,
      });
    }

    await registrarHistory(
      selectedMed.id,
      new Date().toISOString(),
      getUserName(),
      'Reactivando',
      parseInt(form.cantidad),
      selectedMed.nombre
    );

    mostrarNotificacionVencimiento(selectedMed.nombre, form.vencimiento, 'reactivado');

    if (haBuscado) {
      await ejecutarBusqueda(searchInputValue, filter);
    }
    Alert.alert('Éxito', 'Medicamento reactivado correctamente');
  };

  // ── PDF Generator ──
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
            <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${formatDate(med.vencimiento)}</td>
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

  // ── Render ──
  return (
    <View style={styles.container}>
      <SearchHeader
        searchInputValue={searchInputValue}
        setSearchInputValue={setSearchInputValue}
        onSearch={handleSearch}
        onClear={limpiarTodo}
        modoInactivos={modoInactivos}
        toggleModoInactivos={toggleModoInactivos}
        filter={filter}
        setFilter={handleFilterChange}
        showFilters={showFilters}
        setShowFilters={setShowFilters}
      />

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
                : `No hay ${modoInactivos ? 'medicamentos inactivos' : 'medicamentos'} para mostrar`}
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsText}>
                {resultados.length} {resultados.length === 1 ? 'medicamento' : 'medicamentos'}{' '}
                encontrados
              </Text>
              <LoadingButton
                onPress={generatePDF}
                loading={generatingPDF}
                title="PDF"
                style={styles.pdfButton}
                textStyle={styles.pdfButtonText}
                loadingText="Generando..."
              />
            </View>
            {resultados.map((med) => (
              <InventoryCard
                key={med.id}
                med={med}
                onPress={(medicamento) => {
                  setSelectedMed(medicamento);
                  setDetailModalVisible(true);
                }}
              />
            ))}
          </>
        )}
      </ScrollView>

      {/* Modales - mantener el mismo código de antes */}
      <Modal
        visible={detailModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.detailModalContent}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { fontSize: 17 }]} numberOfLines={1}>
                {selectedMed?.nombre}
              </Text>
              <TouchableOpacity onPress={() => setDetailModalVisible(false)}>
                <X color="#6B7280" size={24} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.detailModalBody}>
              <View style={styles.detailRow}>
                <Pill color="#7C3AED" size={15} />
                <Text style={styles.detailLabel}>Nombre:</Text>
                <Text style={styles.detailValue}>{selectedMed?.nombre}</Text>
              </View>
              <View style={styles.detailRow}>
                <Package color="#7C3AED" size={15} />
                <Text style={styles.detailLabel}>Presentación:</Text>
                <Text style={styles.detailValue}>
                  {selectedMed?.presentacion || 'No especificada'}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <FileText color="#7C3AED" size={15} />
                <Text style={styles.detailLabel}>Categoría:</Text>
                <Text style={styles.detailValue}>{selectedMed?.categoria || 'Sin categoría'}</Text>
              </View>
              <View style={styles.detailRow}>
                <Package color="#7C3AED" size={15} />
                <Text style={styles.detailLabel}>Cantidad:</Text>
                <Text style={styles.detailValue}>{selectedMed?.cantidad} unidades</Text>
              </View>
              <View style={styles.detailRow}>
                <Calendar color="#7C3AED" size={15} />
                <Text style={styles.detailLabel}>Vencimiento:</Text>
                <Text style={styles.detailValue}>
                  {selectedMed?.vencimiento
                    ? formatDate(selectedMed.vencimiento)
                    : 'No especificada'}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <MapPin color="#7C3AED" size={15} />
                <Text style={styles.detailLabel}>Ubicación:</Text>
                <Text style={styles.detailValue}>
                  {selectedMed?.ubicacion || 'No especificada'}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <User color="#7C3AED" size={15} />
                <Text style={styles.detailLabel}>Registrado por:</Text>
                <Text style={styles.detailValue}>{selectedMed?.username || 'usuario'}</Text>
              </View>

              {selectedMed?.imagen && (
                <TouchableOpacity
                  style={styles.imagePreviewButton}
                  onPress={() => {
                    setSelectedImage(selectedMed.imagen);
                    setSelectedMedName(selectedMed.nombre);
                    setImageModalVisible(true);
                  }}
                >
                  <Image
                    source={{
                      uri: `data:image/jpeg;base64,${selectedMed.imagen.includes('base64,') ? selectedMed.imagen.split('base64,')[1] : selectedMed.imagen}`,
                    }}
                    style={styles.detailImage}
                  />
                  <Text style={styles.imagePreviewText}>Ver imagen</Text>
                </TouchableOpacity>
              )}

              <View style={styles.detailButtons}>
                {!modoInactivos && selectedMed?.activo !== false && (
                  <>
                    <TouchableOpacity
                      style={styles.editDetailButton}
                      onPress={() => {
                        setDetailModalVisible(false);
                        setEditModalVisible(true);
                      }}
                    >
                      <Edit color="#7C3AED" size={16} />
                      <Text style={styles.editDetailButtonText}>Editar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.duplicateDetailButton}
                      onPress={() => {
                        setDetailModalVisible(false);
                        setDuplicateModalVisible(true);
                      }}
                    >
                      <Copy color="#7C3AED" size={16} />
                      <Text style={styles.duplicateDetailButtonText}>Duplicar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteDetailButton}
                      onPress={() => handleSoftDelete(selectedMed.id, selectedMed.nombre)}
                    >
                      <Trash color="#DC2626" size={16} />
                      <Text style={styles.deleteDetailButtonText}>Desactivar</Text>
                    </TouchableOpacity>
                  </>
                )}
                {modoInactivos && selectedMed?.activo === false && (
                  <>
                    <TouchableOpacity
                      style={styles.reactivarDetailButton}
                      onPress={() => {
                        setDetailModalVisible(false);
                        setReactivarModalVisible(true);
                      }}
                    >
                      <Text style={styles.reactivarDetailButtonText}>Reactivar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteDetailButton}
                      onPress={() => handleEliminarDefinitivo(selectedMed.id, selectedMed.nombre)}
                    >
                      <Trash color="#DC2626" size={16} />
                      <Text style={styles.deleteDetailButtonText}>Eliminar definitivamente</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <EditMedicationModal
        visible={editModalVisible}
        medication={selectedMed}
        onClose={() => setEditModalVisible(false)}
        onSave={handleEditSave}
        obtenerUbicacionDesdeCategoria={obtenerUbicacionDesdeCategoria}
        playAudio={playAudio}
        tomarFoto={tomarFoto}
      />

      <DuplicateMedicationModal
        visible={duplicateModalVisible}
        medication={selectedMed}
        onClose={() => setDuplicateModalVisible(false)}
        onSave={handleDuplicateSave}
        obtenerUbicacionDesdeCategoria={obtenerUbicacionDesdeCategoria}
      />

      <ReactivateMedicationModal
        visible={reactivarModalVisible}
        medication={selectedMed}
        onClose={() => setReactivarModalVisible(false)}
        onSave={handleReactivarSave}
        obtenerUbicacionDesdeCategoria={obtenerUbicacionDesdeCategoria}
        tomarFoto={tomarFoto}
      />

      <ImageZoomModal
        visible={imageModalVisible}
        imageBase64={selectedImage}
        medName={selectedMedName}
        onClose={() => setImageModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  content: { flex: 1, padding: 16 },
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
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  resultsText: { fontSize: 14, color: '#6B7280' },
  pdfButton: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    minHeight: 32,
  },
  pdfButtonText: { color: '#7C3AED', fontWeight: '600', fontSize: 12 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailModalContent: {
    backgroundColor: 'white',
    borderRadius: 24,
    width: '90%',
    maxHeight: '85%',
    overflow: 'hidden',
  },
  detailModalBody: { padding: 20 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: { fontWeight: 'bold', color: '#1F2937' },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' },
  detailLabel: { fontWeight: '600', color: '#374151', marginLeft: 8, width: 100, fontSize: 13 },
  detailValue: { color: '#1F2937', flex: 1, fontSize: 13 },
  detailImage: { width: 50, height: 50, borderRadius: 8, marginRight: 12 },
  imagePreviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    padding: 10,
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
  },
  imagePreviewText: { color: '#7C3AED', marginLeft: 8, fontSize: 13 },
  detailButtons: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 10 },
  editDetailButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
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
    borderRadius: 8,
  },
  reactivarDetailButtonText: { color: 'white', fontWeight: '600', fontSize: 12 },
});
