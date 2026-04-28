// src/screens/InventoryScreen.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
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
} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
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
} from 'lucide-react-native';
import { getDaysUntilExpiry } from '../utils/dateUtils';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import { isAdmin } from '../services/AuthService';
import { pb } from '../services/PocketBaseConfig';
import DatePickerInput from '../components/DatePickerInput';
import CategoriaPicker from '../components/CategoriaPicker';
import { useFocusEffect } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';

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
const registrarHistory = async (idMed, fecha, user, movimiento, cantidad) => {
  try {
    await pb.collection('history').create({
      id_med: idMed,
      fecha: fecha,
      user: user,
      movimiento: movimiento,
      cantidad: cantidad,
    });
    console.log(`📝 History registrado: ${movimiento} - ${idMed}`);
  } catch (error) {
    console.error('Error registrando history:', error);
  }
};

export default function InventoryScreen({ user }) {
  // ── MEJORA 3: Separación clara de estado (activos crudos / filtrados) ──
  const [activos, setActivos] = useState([]); // Datos crudos del servidor
  const [filteredActivos, setFilteredActivos] = useState([]); // Datos filtrados localmente

  // Estado existente
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('todos');
  const [showFilters, setShowFilters] = useState(false);
  const [showInactivos, setShowInactivos] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedMedName, setSelectedMedName] = useState('');
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [duplicateModalVisible, setDuplicateModalVisible] = useState(false);
  const [currentEditMed, setCurrentEditMed] = useState(null);
  const [currentDuplicateMed, setCurrentDuplicateMed] = useState(null);
  const [editForm, setEditForm] = useState({
    nombre: '',
    presentacion: '',
    categoria: '',
    cantidad: '',
    vencimiento: '',
    ubicacion: '',
  });
  const [duplicateForm, setDuplicateForm] = useState({
    nombre: '',
    presentacion: '',
    categoria: '',
    ubicacion: '',
    cantidad: '',
    vencimiento: '',
  });

  // Paginación de inactivos
  const [inactivosVisibles, setInactivosVisibles] = useState([]);
  const [ultimoDocInactivos, setUltimoDocInactivos] = useState(null);
  const [cargandoInactivos, setCargandoInactivos] = useState(false);
  const [hayMasInactivos, setHayMasInactivos] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filtroExacto, setFiltroExacto] = useState({ activo: false, nombre: '', presentacion: '' });
  const navigation = useNavigation();

  // Obtener parámetros de navegación
  const route = useRoute();
  const filterNombre = route.params?.filterNombre;
  const filterPresentacion = route.params?.filterPresentacion;
  const filterExacto = route.params?.filterExacto;

  // Aplicar filtro al cargar
  useEffect(() => {
    if (filterNombre && filterExacto) {
      const searchValue = filterPresentacion
        ? `${filterNombre} ${filterPresentacion}`
        : filterNombre;
      setSearchTerm(searchValue);
      navigation.setParams({ filterNombre: null, filterPresentacion: null, filterExacto: null });
    }
  }, []);

  useEffect(() => {
    const filterNombre = route.params?.filterNombre;
    const filterPresentacion = route.params?.filterPresentacion;
    const filterExactoParam = route.params?.filterExacto;

    if (filterNombre && filterExactoParam) {
      setFiltroExacto({
        activo: true,
        nombre: filterNombre,
        presentacion: filterPresentacion,
      });
      setSearchTerm('');
      navigation.setParams({ filterNombre: null, filterPresentacion: null, filterExacto: null });
    }
  }, [route.params]);

  // Modificar getFilteredMeds para usar filtro exacto cuando está activo
  const getFilteredMeds = () => {
    if (filtroExacto.activo) {
      return activos.filter((m) => {
        const nombreMatch = m.nombre === filtroExacto.nombre;
        const presentacionMatch = filtroExacto.presentacion
          ? m.presentacion === filtroExacto.presentacion
          : true;
        return nombreMatch && presentacionMatch;
      });
    }

    let filtered = [...activos];

    if (searchTerm) {
      const searchNorm = normalizeText(searchTerm);
      filtered = filtered.filter(
        (m) =>
          normalizeText(m.nombre).includes(searchNorm) ||
          normalizeText(m.presentacion || '').includes(searchNorm) ||
          normalizeText(m.categoria || '').includes(searchNorm) ||
          normalizeText(m.ubicacion || '').includes(searchNorm)
      );
    }

    switch (filter) {
      case 'vigentes':
        filtered = filtered.filter((m) => getDaysUntilExpiry(m.vencimiento) > 30);
        break;
      case 'porVencer':
        filtered = filtered.filter((m) => {
          const days = getDaysUntilExpiry(m.vencimiento);
          return days >= 0 && days <= 30;
        });
        break;
      case 'vencidos':
        filtered = filtered.filter((m) => getDaysUntilExpiry(m.vencimiento) < 0);
        break;
    }
    return filtered;
  };

  // ── MEJORA 1: Ref para evitar cargas simultáneas ──
  const isLoadingRef = useRef(false);
  // ── Ref para mantener búsqueda entre recargas ──
  const searchTermRef = useRef('');

  // ── Zoom con gesture-handler ─────────────────────────────
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

  // ── Función para obtener ubicación desde categoría ──
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

  // ── Función de carga principal optimizada ──
  const cargarActivos = useCallback(
    async (isRefresh = false) => {
      if (isLoadingRef.current) return;
      isLoadingRef.current = true;

      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const result = await pb.collection('medicamentos').getList(1, 1000, {
          filter: 'activo = true',
          sort: 'nombre',
          requestKey: null,
        });

        setActivos(result.items);

        const currentSearch = searchTermRef.current;
        let filtered = [...result.items];

        if (currentSearch.trim()) {
          const searchNorm = normalizeText(currentSearch);
          filtered = filtered.filter(
            (m) =>
              normalizeText(m.nombre).includes(searchNorm) ||
              normalizeText(m.presentacion || '').includes(searchNorm) ||
              normalizeText(m.categoria || '').includes(searchNorm) ||
              normalizeText(m.ubicacion || '').includes(searchNorm)
          );
        }

        if (filter !== 'todos') {
          switch (filter) {
            case 'vigentes':
              filtered = filtered.filter((m) => getDaysUntilExpiry(m.vencimiento) > 30);
              break;
            case 'porVencer':
              filtered = filtered.filter((m) => {
                const days = getDaysUntilExpiry(m.vencimiento);
                return days >= 0 && days <= 30;
              });
              break;
            case 'vencidos':
              filtered = filtered.filter((m) => getDaysUntilExpiry(m.vencimiento) < 0);
              break;
          }
        }

        setFilteredActivos(filtered);
      } catch (error) {
        if (!error.isAbort) {
          console.error('Error cargando activos:', error);
          Alert.alert('Error', 'No se pudo conectar con el servidor.');
        }
      } finally {
        isLoadingRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filter]
  );

  // ── Cargar inactivos con paginación ──
  const cargarInactivos = async (reset = false) => {
    if (cargandoInactivos) return;
    if (!reset && !hayMasInactivos) return;

    setCargandoInactivos(true);
    try {
      let result;
      if (reset) {
        result = await pb.collection('medicamentos').getList(1, 50, {
          filter: 'activo = false',
          sort: 'nombre',
          requestKey: null,
        });
        setUltimoDocInactivos(result.items[result.items.length - 1]);
        setInactivosVisibles(result.items);
      } else {
        result = await pb.collection('medicamentos').getList(1, 50, {
          filter: 'activo = false',
          sort: 'nombre',
          requestKey: null,
        });
        setInactivosVisibles((prev) => [...prev, ...result.items]);
      }
      setHayMasInactivos(result.items.length === 50);
    } catch (error) {
      if (!error.isAbort) {
        console.error('Error cargando inactivos:', error);
      }
    } finally {
      setCargandoInactivos(false);
    }
  };

  // ── Refrescar al obtener foco ──
  useFocusEffect(
    useCallback(() => {
      console.log('🔄 Recargando inventario por foco...');
      cargarActivos();
      if (showInactivos) {
        cargarInactivos(true);
      }
    }, [cargarActivos, showInactivos])
  );

  // Mantener carga inicial
  useEffect(() => {
    cargarActivos();
    if (showInactivos) {
      cargarInactivos(true);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await cargarActivos(true);
    if (showInactivos) {
      await cargarInactivos(true);
    }
    setRefreshing(false);
  }, [cargarActivos, showInactivos]);

  // ── Búsqueda LOCAL sin recargar BD ──
  const handleSearch = (text) => {
    setSearchTerm(text);
    searchTermRef.current = text;

    if (!text.trim()) {
      let filtered = [...activos];
      switch (filter) {
        case 'vigentes':
          filtered = filtered.filter((m) => getDaysUntilExpiry(m.vencimiento) > 30);
          break;
        case 'porVencer':
          filtered = filtered.filter((m) => {
            const days = getDaysUntilExpiry(m.vencimiento);
            return days >= 0 && days <= 30;
          });
          break;
        case 'vencidos':
          filtered = filtered.filter((m) => getDaysUntilExpiry(m.vencimiento) < 0);
          break;
      }
      setFilteredActivos(filtered);
    } else {
      const searchNorm = normalizeText(text);
      let filtered = activos.filter(
        (m) =>
          normalizeText(m.nombre).includes(searchNorm) ||
          normalizeText(m.presentacion || '').includes(searchNorm) ||
          normalizeText(m.categoria || '').includes(searchNorm) ||
          normalizeText(m.ubicacion || '').includes(searchNorm)
      );

      switch (filter) {
        case 'vigentes':
          filtered = filtered.filter((m) => getDaysUntilExpiry(m.vencimiento) > 30);
          break;
        case 'porVencer':
          filtered = filtered.filter((m) => {
            const days = getDaysUntilExpiry(m.vencimiento);
            return days >= 0 && days <= 30;
          });
          break;
        case 'vencidos':
          filtered = filtered.filter((m) => getDaysUntilExpiry(m.vencimiento) < 0);
          break;
      }
      setFilteredActivos(filtered);
    }
  };

  // ── Manejar cambio de filtro ──
  const handleFilterChange = (newFilter) => {
    setFilter(newFilter);
    let filtered = [...activos];

    if (searchTermRef.current.trim()) {
      const searchNorm = normalizeText(searchTermRef.current);
      filtered = filtered.filter(
        (m) =>
          normalizeText(m.nombre).includes(searchNorm) ||
          normalizeText(m.presentacion || '').includes(searchNorm) ||
          normalizeText(m.categoria || '').includes(searchNorm) ||
          normalizeText(m.ubicacion || '').includes(searchNorm)
      );
    }

    switch (newFilter) {
      case 'vigentes':
        filtered = filtered.filter((m) => getDaysUntilExpiry(m.vencimiento) > 30);
        break;
      case 'porVencer':
        filtered = filtered.filter((m) => {
          const days = getDaysUntilExpiry(m.vencimiento);
          return days >= 0 && days <= 30;
        });
        break;
      case 'vencidos':
        filtered = filtered.filter((m) => getDaysUntilExpiry(m.vencimiento) < 0);
        break;
    }
    setFilteredActivos(filtered);
  };

  const getFilteredInactivos = () => {
    if (!searchTerm.trim()) return inactivosVisibles;
    const searchNorm = normalizeText(searchTerm);
    return inactivosVisibles.filter(
      (m) =>
        normalizeText(m.nombre).includes(searchNorm) ||
        normalizeText(m.presentacion || '').includes(searchNorm) ||
        normalizeText(m.categoria || '').includes(searchNorm) ||
        normalizeText(m.ubicacion || '').includes(searchNorm)
    );
  };

  const getFilterTitle = () => {
    if (showInactivos) return 'LISTADO DE MEDICAMENTOS INACTIVOS';
    switch (filter) {
      case 'vigentes':
        return 'LISTADO DE MEDICAMENTOS VIGENTES';
      case 'porVencer':
        return 'LISTADO DE MEDICAMENTOS POR VENCER';
      case 'vencidos':
        return 'LISTADO DE MEDICAMENTOS VENCIDOS';
      default:
        return 'LISTADO DE MEDICAMENTOS ACTIVOS';
    }
  };

  // ── PDF ──
  const generatePDF = async () => {
    const medicamentosParaPDF = showInactivos ? getFilteredInactivos() : filteredActivos;
    const titulo =
      showInactivos && searchTerm
        ? `LISTADO DE MEDICAMENTOS INACTIVOS - BÚSQUEDA: "${searchTerm}"`
        : getFilterTitle();

    if (medicamentosParaPDF.length === 0) {
      Alert.alert('Sin datos', 'No hay medicamentos para generar el PDF');
      return;
    }
    setGeneratingPDF(true);
    try {
      const today = new Date().toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      let tableRows = '';
      medicamentosParaPDF.forEach((med, index) => {
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
          </table>`;
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
        <div class="stats"><div class="stats-text">Total: ${medicamentosParaPDF.length} medicamentos</div></div>
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
      } else {
        Alert.alert('Error', 'No es posible compartir archivos en este dispositivo');
      }
    } catch (error) {
      console.error('Error generando PDF:', error);
      Alert.alert('Error', 'No se pudo generar el PDF');
    } finally {
      setGeneratingPDF(false);
    }
  };

  // ── Acciones de medicamentos con history ──
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
            // Registrar en history
            await registrarHistory(
              medId,
              new Date().toISOString(),
              getUserName(),
              'Desactivando',
              medActual.cantidad
            );
            await cargarActivos();
            Alert.alert('Éxito', 'Medicamento desactivado');
          } catch {
            Alert.alert('Error', 'No se pudo desactivar');
          }
        },
      },
    ]);
  };

  const handleReactivar = async (medId, medName) => {
    Alert.alert('Reactivar Medicamento', `¿Reactivar ${medName}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Reactivar',
        onPress: async () => {
          try {
            const medActual = await pb.collection('medicamentos').getOne(medId);
            await pb.collection('medicamentos').update(medId, {
              activo: true,
              fechabaja: null,
            });
            await registrarHistory(
              medId,
              new Date().toISOString(),
              getUserName(),
              'Reactivando',
              medActual.cantidad
            );
            await cargarActivos();
            if (showInactivos) {
              await cargarInactivos(true);
            }
            Alert.alert('Éxito', 'Medicamento reactivado');
          } catch {
            Alert.alert('Error', 'No se pudo reactivar');
          }
        },
      },
    ]);
  };

  // ── EDITAR MEDICAMENTO ──
  const openEditModal = (med) => {
    setCurrentEditMed(med);
    setEditForm({
      nombre: med.nombre || '',
      presentacion: med.presentacion || '',
      categoria: med.categoria || '',
      cantidad: med.cantidad ? med.cantidad.toString() : '',
      vencimiento: med.vencimiento || '',
      ubicacion: med.ubicacion || '',
    });
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

      // Obtener ubicación desde categoría si se cambió la categoría
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

      // Registrar en history si hubo cambio de cantidad
      if (diferencia !== 0) {
        await registrarHistory(
          currentEditMed.id,
          new Date().toISOString(),
          getUserName(),
          diferencia > 0 ? 'Añadiendo' : 'Entregando',
          Math.abs(diferencia)
        );
      }

      await cargarActivos();
      Alert.alert('Éxito', 'Medicamento actualizado correctamente');
      setEditModalVisible(false);
    } catch (error) {
      console.error('Error editando:', error);
      Alert.alert('Error', 'No se pudo actualizar el medicamento');
    }
  };

  // ── DUPLICAR MEDICAMENTO ──
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
      // Obtener ubicación desde categoría
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
        parseInt(duplicateForm.cantidad)
      );

      await cargarActivos();
      Alert.alert('Éxito', 'Medicamento duplicado correctamente');
      setDuplicateModalVisible(false);
    } catch (error) {
      console.error('Error duplicando:', error);
      Alert.alert('Error', 'No se pudo duplicar el medicamento');
    }
  };

  // ── Modal de imagen ──
  const openImageModal = (imageBase64, medName) => {
    if (!imageBase64) return;
    resetZoom();
    const clean = imageBase64.includes('base64,') ? imageBase64.split('base64,')[1] : imageBase64;
    setSelectedImage(clean);
    setSelectedMedName(medName);
    setModalVisible(true);
  };

  const closeImageModal = () => {
    resetZoom();
    setModalVisible(false);
  };

  const shareImage = async () => {
    if (!selectedImage) return;
    try {
      const filename = `${FileSystem.cacheDirectory}med_${Date.now()}.jpg`;
      await FileSystem.writeAsStringAsync(filename, selectedImage, {
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

  const userIsAdmin = isAdmin(user);
  const medicamentosActivos = getFilteredMeds();

  if (loading && activos.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size={50} color="#7C3AED" />
        <Text style={styles.loadingText}>Cargando inventario...</Text>
      </View>
    );
  }

  // ── Componente de tarjeta de medicamento ──
  const MedCard = ({ med, isInactivo = false }) => (
    <View
      key={med.id}
      style={[styles.card, isInactivo ? styles.cardInactivo : getStatusColor(med.vencimiento)]}
    >
      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <View style={styles.medInfo}>
            <Text style={styles.medName}>{med.nombre}</Text>
            <Text style={styles.medPresentation}>{med.presentacion}</Text>
            <Text style={styles.medCategory}>📋 {med.categoria}</Text>
            {med.ubicacion && <Text style={styles.medUbicacion}>📍 {med.ubicacion}</Text>}
            {med.username && <Text style={styles.medUser}>👤 Registrado por: {med.username}</Text>}
          </View>
          {med.imagen && (
            <TouchableOpacity onPress={() => openImageModal(med.imagen, med.nombre)}>
              <Image
                source={{
                  uri: `data:image/jpeg;base64,${med.imagen.includes('base64,') ? med.imagen.split('base64,')[1] : med.imagen}`,
                }}
                style={styles.medImage}
              />
              <View style={styles.zoomHint}>
                <ZoomIn color="white" size={12} />
              </View>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.medDetails}>
          <View style={styles.quantityContainer}>
            <Text style={styles.quantityLabel}>Cantidad:</Text>
            <Text style={styles.quantityValue}>{med.cantidad} uds</Text>
          </View>
          <View style={styles.expiryContainer}>
            <Text style={styles.expiryLabel}>Vencimiento:</Text>
            <Text style={styles.expiryValue}>{new Date(med.vencimiento).toLocaleDateString()}</Text>
          </View>
          {!isInactivo && (
            <View style={styles.statusContainer}>
              <View style={[styles.statusBadge, getStatusColor(med.vencimiento)]}>
                <Text style={styles.statusText}>{getStatusText(med.vencimiento)}</Text>
              </View>
            </View>
          )}
          {med.fechabaja && (
            <Text style={styles.fechaBaja}>
              Dado de baja: {new Date(med.fechabaja).toLocaleDateString()}
            </Text>
          )}
        </View>

        <View style={styles.actionButtons}>
          {!isInactivo && (
            <>
              <TouchableOpacity style={styles.editButton} onPress={() => openEditModal(med)}>
                <Edit color="#7C3AED" size={16} />
                <Text style={styles.editButtonText}>Editar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.duplicateButton}
                onPress={() => openDuplicateModal(med)}
              >
                <Copy color="#7C3AED" size={16} />
                <Text style={styles.duplicateButtonText}>Duplicar</Text>
              </TouchableOpacity>
            </>
          )}
          {isInactivo ? (
            <TouchableOpacity
              style={styles.reactivarButton}
              onPress={() => handleReactivar(med.id, med.nombre)}
            >
              <Text style={styles.reactivarButtonText}>Reactivar</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleSoftDelete(med.id, med.nombre)}
            >
              <Trash color="#DC2626" size={18} />
              <Text style={styles.deleteButtonText}>Desactivar</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );

  // ── Render ──
  return (
    <View style={styles.container}>
      {/* Header con búsqueda */}
      <View style={styles.header}>
        <View style={styles.searchContainer}>
          <Search color="#9CA3AF" size={20} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar medicamento..."
            placeholderTextColor="#9CA3AF"
            value={searchTerm}
            onChangeText={handleSearch}
          />
          {searchTerm !== '' && (
            <TouchableOpacity onPress={() => handleSearch('')}>
              <X color="#9CA3AF" size={20} />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => setShowFilters(!showFilters)}
          >
            <Filter color="#7C3AED" size={20} />
            <Text style={styles.filterButtonText}>Filtros</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.inactivosButton, showInactivos && styles.inactivosButtonActive]}
            onPress={() => setShowInactivos(!showInactivos)}
          >
            <AlertCircle color={showInactivos ? 'white' : '#6B7280'} size={20} />
            <Text
              style={[
                styles.inactivosButtonText,
                showInactivos && styles.inactivosButtonTextActive,
              ]}
            >
              Ver inactivos
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Chips de filtro */}
      {showFilters && !showInactivos && (
        <View style={styles.filtersContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {[
              { key: 'todos', label: `Todos (${activos.length})` },
              { key: 'vigentes', label: 'Vigentes' },
              { key: 'porVencer', label: 'Por vencer' },
              { key: 'vencidos', label: 'Vencidos' },
            ].map((f) => (
              <TouchableOpacity
                key={f.key}
                style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
                onPress={() => handleFilterChange(f.key)}
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

      {/* Lista */}
      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Activos */}
        {!showInactivos && medicamentosActivos.length === 0 && (
          <View style={styles.emptyContainer}>
            <Package color="#D1D5DB" size={64} />
            <Text style={styles.emptyTitle}>No hay medicamentos</Text>
            <Text style={styles.emptyText}>
              {searchTerm
                ? 'Intenta con otra búsqueda'
                : 'Agrega medicamentos desde la pestaña Registrar'}
            </Text>
          </View>
        )}

        {!showInactivos && medicamentosActivos.length > 0 && (
          <>
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsText}>{medicamentosActivos.length} encontrados</Text>
              <TouchableOpacity
                style={styles.pdfButton}
                onPress={generatePDF}
                disabled={generatingPDF}
              >
                <FileText color="#7C3AED" size={18} />
                <Text style={styles.pdfButtonText}>{generatingPDF ? 'Generando...' : 'PDF'}</Text>
              </TouchableOpacity>
            </View>
            {filtroExacto.activo && (
              <View style={styles.filtroExactoContainer}>
                <Text style={styles.filtroExactoText}>
                  Mostrando: {filtroExacto.nombre}
                  {filtroExacto.presentacion ? ` ${filtroExacto.presentacion}` : ''}
                </Text>
                <TouchableOpacity
                  onPress={() => setFiltroExacto({ activo: false, nombre: '', presentacion: '' })}
                >
                  <X size={16} color="#7C3AED" />
                </TouchableOpacity>
              </View>
            )}
            {medicamentosActivos.map((med) => (
              <MedCard key={med.id} med={med} />
            ))}
          </>
        )}

        {/* Inactivos */}
        {showInactivos && (
          <>
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsText}>
                Inactivos ({getFilteredInactivos().length}
                {hayMasInactivos && !searchTerm ? '+' : ''})
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
            {filtroExacto.activo && (
              <View style={styles.filtroExactoContainer}>
                <Text style={styles.filtroExactoText}>
                  Mostrando: {filtroExacto.nombre}
                  {filtroExacto.presentacion ? ` ${filtroExacto.presentacion}` : ''}
                </Text>
                <TouchableOpacity
                  onPress={() => setFiltroExacto({ activo: false, nombre: '', presentacion: '' })}
                >
                  <X size={16} color="#7C3AED" />
                </TouchableOpacity>
              </View>
            )}
            {getFilteredInactivos().length === 0 && searchTerm ? (
              <View style={styles.emptyContainer}>
                <Package color="#D1D5DB" size={64} />
                <Text style={styles.emptyTitle}>No hay resultados</Text>
                <Text style={styles.emptyText}>No se encontraron inactivos con "{searchTerm}"</Text>
              </View>
            ) : (
              getFilteredInactivos().map((med) => <MedCard key={med.id} med={med} isInactivo />)
            )}

            {!searchTerm && (
              <>
                {cargandoInactivos && (
                  <View style={styles.loadingMore}>
                    <ActivityIndicator size="small" color="#7C3AED" />
                    <Text style={styles.loadingMoreText}>Cargando más...</Text>
                  </View>
                )}
                {!cargandoInactivos && hayMasInactivos && (
                  <TouchableOpacity
                    style={styles.loadMoreButton}
                    onPress={() => cargarInactivos(false)}
                  >
                    <Text style={styles.loadMoreText}>Cargar más (50 más)</Text>
                  </TouchableOpacity>
                )}
                {!cargandoInactivos && !hayMasInactivos && inactivosVisibles.length > 0 && (
                  <Text style={styles.endOfListText}>✓ Todos los inactivos cargados</Text>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* Modal de imagen */}
      <Modal
        visible={modalVisible}
        transparent={false}
        animationType="slide"
        onRequestClose={closeImageModal}
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle} numberOfLines={1}>
              {selectedMedName}
            </Text>
          </View>
          <View style={styles.modalContainer}>
            <TouchableOpacity style={styles.modalCloseButton} onPress={closeImageModal}>
              <X color="white" size={28} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalShareButton} onPress={shareImage}>
              <Share2 color="white" size={24} />
            </TouchableOpacity>
            <GestureDetector gesture={composed}>
              <Animated.View style={[styles.modalImageWrapper, { transform: [{ scale }] }]}>
                {selectedImage && (
                  <Image
                    source={{ uri: `data:image/jpeg;base64,${selectedImage}` }}
                    style={styles.modalImage}
                    resizeMode="contain"
                    onError={() => Alert.alert('Error', 'No se pudo cargar la imagen')}
                  />
                )}
              </Animated.View>
            </GestureDetector>
            <Text style={styles.modalHint}>Pellizca para zoom · Doble toque para resetear</Text>
          </View>
        </GestureHandlerRootView>
      </Modal>

      {/* Modal de Editar */}
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
                <Text style={styles.modalTitle}>Editar Medicamento</Text>
                <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                  <X color="#6B7280" size={24} />
                </TouchableOpacity>
              </View>
              <View style={styles.modalBody}>
                <Text style={styles.label}>Nombre *</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.nombre}
                  onChangeText={(t) => setEditForm({ ...editForm, nombre: t })}
                  placeholder="Nombre del medicamento"
                  placeholderTextColor="#9CA3AF"
                />
                <Text style={styles.label}>Presentación</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.presentacion}
                  onChangeText={(t) => setEditForm({ ...editForm, presentacion: t })}
                  placeholder="Ej: Tabletas 500mg"
                  placeholderTextColor="#9CA3AF"
                />
                <Text style={styles.label}>Categoría</Text>
                <CategoriaPicker
                  value={editForm.categoria}
                  onChange={async (text) => {
                    setEditForm({ ...editForm, categoria: text });
                    // Auto-asignar ubicación cuando se selecciona categoría
                    const ubicacion = await obtenerUbicacionDesdeCategoria(text);
                    if (ubicacion) {
                      setEditForm((prev) => ({ ...prev, ubicacion: ubicacion }));
                    }
                  }}
                  onUbicacionChange={(ubicacion) => {
                    if (ubicacion) {
                      setEditForm((prev) => ({ ...prev, ubicacion: ubicacion }));
                    }
                  }}
                  placeholder="Seleccionar categoría"
                  showLabel={false}
                />
                <View style={styles.row}>
                  <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                    <Text style={styles.label}>Cantidad *</Text>
                    <TextInput
                      style={styles.input}
                      value={editForm.cantidad}
                      onChangeText={(t) => setEditForm({ ...editForm, cantidad: t })}
                      placeholder="Ej: 50"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.label}>Vencimiento *</Text>
                    <DatePickerInput
                      label=""
                      value={editForm.vencimiento}
                      onChange={(date) => setEditForm({ ...editForm, vencimiento: date })}
                      placeholder="Seleccionar fecha"
                      required={true}
                    />
                  </View>
                </View>
                <Text style={styles.label}>Ubicación</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.ubicacion}
                  onChangeText={(t) => setEditForm({ ...editForm, ubicacion: t })}
                  placeholder="Ej: Estante A3"
                  placeholderTextColor="#9CA3AF"
                />
                <TouchableOpacity style={styles.saveButton} onPress={handleSaveEdit}>
                  <Text style={styles.saveButtonText}>Guardar Cambios</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Modal de Duplicar */}
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
                <Text style={styles.modalTitle}>Duplicar Medicamento</Text>
                <TouchableOpacity onPress={() => setDuplicateModalVisible(false)}>
                  <X color="#6B7280" size={24} />
                </TouchableOpacity>
              </View>
              <View style={styles.modalBody}>
                <Text style={styles.label}>Nombre *</Text>
                <TextInput
                  style={styles.input}
                  value={duplicateForm.nombre}
                  onChangeText={(t) => setDuplicateForm({ ...duplicateForm, nombre: t })}
                  placeholder="Nombre del medicamento"
                  placeholderTextColor="#9CA3AF"
                />
                <Text style={styles.label}>Presentación</Text>
                <TextInput
                  style={styles.input}
                  value={duplicateForm.presentacion}
                  onChangeText={(t) => setDuplicateForm({ ...duplicateForm, presentacion: t })}
                  placeholder="Ej: Tabletas 500mg"
                  placeholderTextColor="#9CA3AF"
                />
                <Text style={styles.label}>Categoría</Text>
                <CategoriaPicker
                  value={duplicateForm.categoria}
                  onChange={async (text) => {
                    setDuplicateForm({ ...duplicateForm, categoria: text });
                    const ubicacion = await obtenerUbicacionDesdeCategoria(text);
                    if (ubicacion) {
                      setDuplicateForm((prev) => ({ ...prev, ubicacion: ubicacion }));
                    }
                  }}
                  onUbicacionChange={(ubicacion) => {
                    if (ubicacion) {
                      setEditForm((prev) => ({ ...prev, ubicacion: ubicacion }));
                    }
                  }}
                  placeholder="Seleccionar categoría"
                  showLabel={false}
                />
                <Text style={styles.label}>Ubicación</Text>
                <TextInput
                  style={styles.input}
                  value={duplicateForm.ubicacion}
                  onChangeText={(t) => setDuplicateForm({ ...duplicateForm, ubicacion: t })}
                  placeholder="Ej: Estante A3"
                  placeholderTextColor="#9CA3AF"
                />
                <View style={styles.row}>
                  <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                    <Text style={styles.label}>Cantidad *</Text>
                    <TextInput
                      style={styles.input}
                      value={duplicateForm.cantidad}
                      onChangeText={(t) => setDuplicateForm({ ...duplicateForm, cantidad: t })}
                      placeholder="Ej: 50"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.label}>Vencimiento *</Text>
                    <DatePickerInput
                      label=""
                      value={duplicateForm.vencimiento}
                      onChange={(date) => setDuplicateForm({ ...duplicateForm, vencimiento: date })}
                      placeholder="Seleccionar fecha"
                      required={true}
                    />
                  </View>
                </View>
                <TouchableOpacity style={styles.saveButton} onPress={handleSaveDuplicate}>
                  <Text style={styles.saveButtonText}>Duplicar Medicamento</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F3F4F6' },
  loadingText: { marginTop: 10, fontSize: 14, color: '#6B7280' },
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
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 16, color: '#1F2937' },
  headerButtons: { flexDirection: 'row', gap: 8 },
  filterButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  filterButtonText: { color: '#7C3AED', fontWeight: '600' },
  inactivosButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  inactivosButtonActive: { backgroundColor: '#6B7280' },
  inactivosButtonText: { color: '#6B7280', fontWeight: '600' },
  inactivosButtonTextActive: { color: 'white' },
  filtersContainer: { backgroundColor: 'white', paddingHorizontal: 16, paddingBottom: 12 },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    marginRight: 8,
  },
  filterChipActive: { backgroundColor: '#7C3AED' },
  filterChipText: { color: '#4B5563', fontWeight: '500' },
  filterChipTextActive: { color: 'white' },
  content: { flex: 1, padding: 16 },
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
  emptyContainer: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#374151', marginTop: 16 },
  emptyText: { fontSize: 14, color: '#9CA3AF', marginTop: 8, textAlign: 'center' },
  card: { backgroundColor: 'white', borderRadius: 16, marginBottom: 16, padding: 16, elevation: 2 },
  cardInactivo: { opacity: 0.7, backgroundColor: '#E5E7EB' },
  vigente: { borderLeftWidth: 4, borderLeftColor: '#22C55E' },
  porVencer: { borderLeftWidth: 4, borderLeftColor: '#EA580C' },
  vencido: { borderLeftWidth: 4, borderLeftColor: '#DC2626' },
  cardContent: { flex: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  medInfo: { flex: 1 },
  medName: { fontSize: 18, fontWeight: 'bold', color: '#1F2937', marginBottom: 4 },
  medPresentation: { fontSize: 14, color: '#6B7280', marginBottom: 2 },
  medCategory: { fontSize: 12, color: '#9CA3AF' },
  medUbicacion: { fontSize: 12, color: '#10B981', marginTop: 4 },
  medUser: { fontSize: 10, color: '#7C3AED', fontStyle: 'italic', marginTop: 4 },
  medImage: { width: 60, height: 60, borderRadius: 8, marginLeft: 12 },
  zoomHint: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 6,
    padding: 2,
  },
  medDetails: { marginBottom: 12 },
  quantityContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  quantityLabel: { fontSize: 14, color: '#6B7280' },
  quantityValue: { fontSize: 16, fontWeight: 'bold', color: '#1F2937' },
  expiryContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  expiryLabel: { fontSize: 14, color: '#6B7280' },
  expiryValue: { fontSize: 14, color: '#4B5563' },
  statusContainer: { alignItems: 'flex-end', marginBottom: 8 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 12, fontWeight: 'bold' },
  fechaBaja: { fontSize: 11, color: '#9CA3AF', fontStyle: 'italic', marginTop: 4 },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 8,
  },
  editButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderRadius: 8,
    gap: 6,
    backgroundColor: '#EDE9FE',
  },
  editButtonText: { color: '#7C3AED', fontWeight: '600', fontSize: 14 },
  duplicateButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderRadius: 8,
    gap: 6,
    backgroundColor: '#FEF3C7',
  },
  duplicateButtonText: { color: '#EA580C', fontWeight: '600', fontSize: 14 },
  deleteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderRadius: 8,
    gap: 6,
    backgroundColor: '#FEE2E2',
  },
  deleteButtonText: { color: '#DC2626', fontWeight: '600' },
  reactivarButton: {
    flex: 1,
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderRadius: 8,
  },
  reactivarButtonText: { color: 'white', fontWeight: '600' },
  loadingMore: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    gap: 8,
  },
  loadingMoreText: { fontSize: 12, color: '#6B7280' },
  loadMoreButton: {
    backgroundColor: '#F3F4F6',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  loadMoreText: { color: '#7C3AED', fontWeight: '600' },
  endOfListText: {
    textAlign: 'center',
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 16,
    marginBottom: 8,
  },
  modalContainer: { flex: 1, backgroundColor: 'rgba(173, 20, 196, 0.14)' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
  },
  modalTitle: { color: 'white', fontSize: 16, fontWeight: 'bold', flex: 1, marginRight: 12 },
  modalActions: { flexDirection: 'row', gap: 4 },
  modalActionBtn: { padding: 8 },
  modalImageWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  modalImage: { width: '100%', height: '100%' },
  modalHint: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
    textAlign: 'center',
    paddingBottom: 24,
  },
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
    backgroundColor: '#cfbef9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#1F2937' },
  modalBody: { padding: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 5 },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
    color: '#1F2937',
  },
  row: { flexDirection: 'row', marginBottom: 16 },
  inputGroup: { marginBottom: 0 },
  saveButton: {
    backgroundColor: '#7C3AED',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  saveButtonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  modalCloseButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 30,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  modalShareButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 30,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  filtroExactoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 12,
  },
  filtroExactoText: {
    fontSize: 12,
    color: '#7C3AED',
    fontWeight: '500',
  },
});
