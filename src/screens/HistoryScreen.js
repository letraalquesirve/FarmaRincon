// src/screens/HistoryScreen.js - VERSIÓN CON STATS EN CHIPS Y PDF EN HEADER
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Modal,
  Alert,
  TextInput,
  Platform,
} from 'react-native';
import {
  History,
  Package,
  Calendar,
  User,
  Search,
  Filter,
  X,
  Check,
  FileText,
  Clock,
  Pill,
} from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import KeyboardAvoidingScrollView from '../components/KeyboardAvoidingScrollView';
import {
  medicamentoGetOne,
  medicamentosList,
  historyList,
} from '../services/LocalDataService';
import { useFocusEffect } from '@react-navigation/native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const escapeHtml = (text) => {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const normalizeText = (text) => {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ''); // Eliminar caracteres especiales;
};

export default function HistoryScreen() {
  const [history, setHistory] = useState([]);
  const [filteredHistory, setFilteredHistory] = useState([]);
  const [medicamentosCache, setMedicamentosCache] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMovimiento, setFilterMovimiento] = useState('todos');
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filters, setFilters] = useState({
    fechaDesde: '',
    fechaHasta: '',
    movimiento: '',
    medicamento: '',
  });
  const [tempFilters, setTempFilters] = useState({
    fechaDesde: '',
    fechaHasta: '',
    movimiento: '',
    medicamento: '',
  });
  const [showDatePicker, setShowDatePicker] = useState(null);
  const [activeFiltersCount, setActiveFiltersCount] = useState(0);

  const isLoadingRef = useRef(false);

  const formatDateShort = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    });
  };

  // Contar registros por tipo de movimiento
  const getCountByMovimiento = (movimiento) => {
    if (movimiento === 'todos') return filteredHistory.length;
    return filteredHistory.filter((h) => h.movimiento === movimiento).length;
  };

  const obtenerDescriptorMedicamento = useCallback(
    async (idMed) => {
      if (!idMed)
        return { descriptor: 'Medicamento eliminado', presentacion: '', nombre: '', existe: false };

      if (medicamentosCache[idMed]) {
        return medicamentosCache[idMed];
      }

      try {
        const result = await medicamentoGetOne(idMed);
        if (!result) {
          const descriptor = `Medicamento (ID: ${idMed?.substring(0, 8) || 'N/A'}...)`;
          const medicamentoInfo = {
            descriptor,
            presentacion: '',
            nombre: '',
            existe: false,
          };
          setMedicamentosCache((prev) => ({ ...prev, [idMed]: medicamentoInfo }));
          return medicamentoInfo;
        }
        const nombre = result.nombre || 'Desconocido';
        const presentacion = result.presentacion || '';
        //const descriptorCompleto = presentacion ? `${nombre} (${presentacion})` : nombre;
        const descriptorCompleto = presentacion ? `${nombre} ( ${presentacion})` : nombre;
        const medicamentoInfo = {
          descriptor: descriptorCompleto,
          presentacion: presentacion,
          nombre: nombre,
          existe: true,
        };

        setMedicamentosCache((prev) => ({ ...prev, [idMed]: medicamentoInfo }));
        return medicamentoInfo;
      } catch (error) {
        console.error('Error obteniendo medicamento:', error);
        const descriptor = 'Medicamento eliminado';

        const medicamentoInfo = {
          descriptor: descriptor,
          presentacion: '',
          nombre: '',
          existe: false,
        };

        setMedicamentosCache((prev) => ({ ...prev, [idMed]: medicamentoInfo }));
        return medicamentoInfo;
      }
    },
    [medicamentosCache]
  );

  const processHistoryWithDescriptors = useCallback(
    async (historyItems) => {
      const promises = historyItems.map(async (item) => {
        const medicamentoInfo = await obtenerDescriptorMedicamento(item.id_med);
        return {
          ...item,
          descriptor: medicamentoInfo.descriptor,
          presentacion: medicamentoInfo.presentacion,
          nombreMed: medicamentoInfo.nombre,
          medicamentoExiste: medicamentoInfo.existe,
        };
      });
      return await Promise.all(promises);
    },
    [obtenerDescriptorMedicamento]
  );

  const actualizarFiltros = useCallback(async () => {
    let filtered = [...history];

    if (filterMovimiento !== 'todos') {
      filtered = filtered.filter((h) => h.movimiento === filterMovimiento);
    }

    // ✅ FILTRO POR MEDICAMENTO (ahora buscando en JS sobre datos locales)
    if (filters.medicamento && filters.medicamento.trim()) {
      const searchMed = filters.medicamento.trim();
      const searchWords = searchMed.toLowerCase().split(/\s+/);

      try {
        const todosMedicamentos = await medicamentosList();
        const encontrados = todosMedicamentos.filter((m) => {
          const haystack = `${m.nombre || ''} ${m.presentacion || ''}`.toLowerCase();
          return searchWords.every((word) => haystack.includes(word));
        });

        const idsMedicamentos = encontrados.map((m) => m.id);

        if (idsMedicamentos.length > 0) {
          filtered = filtered.filter((h) => idsMedicamentos.includes(h.id_med));
        } else {
          filtered = [];
        }
      } catch (error) {
        console.error('Error buscando medicamentos:', error);
        filtered = [];
      }
    }

    if (filters.fechaDesde) {
      const desde = new Date(filters.fechaDesde);
      desde.setHours(0, 0, 0, 0);
      filtered = filtered.filter((h) => new Date(h.fecha) >= desde);
    }

    if (filters.fechaHasta) {
      const hasta = new Date(filters.fechaHasta);
      hasta.setHours(23, 59, 59, 999);
      filtered = filtered.filter((h) => new Date(h.fecha) <= hasta);
    }

    setFilteredHistory(filtered);
  }, [history, filterMovimiento, filters]);

  // Reemplaza la función applySearch con esta versión mejorada:

  const applySearch = useCallback(async () => {
    // Si no hay término de búsqueda, aplicar filtros normales
    if (!searchTerm.trim()) {
      actualizarFiltros();
      return;
    }

    setProcessing(true);

    try {
      const searchTermTrimmed = searchTerm.trim();
      const searchWords = searchTermTrimmed.toLowerCase().split(/\s+/);

      console.log(`🔍 Búsqueda: "${searchTermTrimmed}"`);
      console.log(`   Palabras: ${searchWords.join(', ')}`);

      // 2️⃣ Buscar medicamentos que coincidan con TODAS las palabras (local, en JS)
      let medicamentosEncontrados = [];
      try {
        const todosMedicamentos = await medicamentosList();
        medicamentosEncontrados = todosMedicamentos.filter((m) => {
          const haystack = `${m.nombre || ''} ${m.presentacion || ''}`.toLowerCase();
          return searchWords.every((word) => haystack.includes(word));
        });
      } catch (filterError) {
        console.error('Error buscando medicamentos:', filterError);
      }

      const idsMedicamentos = medicamentosEncontrados.map((m) => m.id);

      console.log(`📦 Medicamentos encontrados: ${medicamentosEncontrados.length}`);
      medicamentosEncontrados.forEach((m) => {
        console.log(`   - ${m.nombre} ${m.presentacion || ''}`);
      });

      // 3️⃣ Filtrar history localmente
      let filtered = [...history];

      // Filtro por tipo de movimiento
      if (filterMovimiento !== 'todos') {
        filtered = filtered.filter((h) => h.movimiento === filterMovimiento);
      }

      // Filtrar por IDs de medicamentos
      if (idsMedicamentos.length > 0) {
        filtered = filtered.filter((h) => idsMedicamentos.includes(h.id_med));
      } else {
        filtered = [];
      }

      // También buscar en el campo 'user' (para que el buscador encuentre por usuario)
      const userMatches = history.filter((h) => {
        const userNorm = normalizeText(h.user || '');
        return searchWords.some((word) => userNorm.includes(word));
      });

      // Unir resultados
      const combinedIds = new Set([...filtered.map((f) => f.id), ...userMatches.map((u) => u.id)]);
      filtered = history.filter((h) => combinedIds.has(h.id));

      // Aplicar filtros adicionales (fechas, etc.)
      if (filters.fechaDesde) {
        const desde = new Date(filters.fechaDesde);
        desde.setHours(0, 0, 0, 0);
        filtered = filtered.filter((h) => new Date(h.fecha) >= desde);
      }

      if (filters.fechaHasta) {
        const hasta = new Date(filters.fechaHasta);
        hasta.setHours(23, 59, 59, 999);
        filtered = filtered.filter((h) => new Date(h.fecha) <= hasta);
      }

      setFilteredHistory(filtered);
      console.log(`📊 Resultados finales: ${filtered.length}`);
    } catch (error) {
      console.error('Error en búsqueda:', error);
      Alert.alert('Error', 'No se pudo realizar la búsqueda');
    } finally {
      setProcessing(false);
    }
  }, [history, filterMovimiento, searchTerm, filters]);

  const loadData = useCallback(
    async (isRefresh = false) => {
      if (isLoadingRef.current) return;
      isLoadingRef.current = true;

      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const items = await historyList();
        const ordenados = [...items].sort(
          (a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0)
        );

        const processedItems = await processHistoryWithDescriptors(ordenados);
        setHistory(processedItems);

        // Aplicar filtros después de cargar
        await aplicarFiltrosCompletos();
      } catch (error) {
        if (!error.isAbort) {
          console.error('Error cargando history:', error);
          Alert.alert('Error', 'No se pudieron cargar los datos');
        }
      } finally {
        isLoadingRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filterMovimiento, filters, processHistoryWithDescriptors]
  );

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (history.length > 0) {
      actualizarFiltros();
    }
  }, [filterMovimiento, filters.fechaDesde, filters.fechaHasta, filters.medicamento]);

  const onRefresh = useCallback(() => loadData(true), [loadData]);

  const updateActiveFiltersCount = (filtros) => {
    let count = 0;
    if (filtros.fechaDesde) count++;
    if (filtros.fechaHasta) count++;
    if (filtros.movimiento && filtros.movimiento !== 'todos') count++;
    if (filtros.medicamento && filtros.medicamento.trim()) count++;
    setActiveFiltersCount(count);
  };

  const openFilterModal = () => {
    setTempFilters({ ...filters });
    setShowFilterModal(true);
  };

  const applyFiltersModal = () => {
    // Guardar los filtros del modal
    setFilters({ ...tempFilters });
    updateActiveFiltersCount(tempFilters);
    setShowFilterModal(false);

    // Aplicar filtros después de cerrar modal
    aplicarFiltrosCompletos();
  };

  const aplicarFiltrosCompletos = useCallback(async () => {
    let filtered = [...history];

    // Filtro por tipo de movimiento
    if (filterMovimiento !== 'todos') {
      filtered = filtered.filter((h) => h.movimiento === filterMovimiento);
    }

    // ✅ FILTRO POR MEDICAMENTO (búsqueda local en JS, para el PDF)
    if (filters.medicamento && filters.medicamento.trim()) {
      const searchMed = filters.medicamento.trim();
      const searchWords = searchMed.toLowerCase().split(/\s+/);

      try {
        const todosMedicamentos = await medicamentosList();
        const encontrados = todosMedicamentos.filter((m) => {
          const haystack = `${m.nombre || ''} ${m.presentacion || ''}`.toLowerCase();
          return searchWords.every((word) => haystack.includes(word));
        });

        const idsMedicamentos = encontrados.map((m) => m.id);

        if (idsMedicamentos.length > 0) {
          filtered = filtered.filter((h) => idsMedicamentos.includes(h.id_med));
        } else {
          filtered = [];
        }
      } catch (error) {
        console.error('Error buscando medicamentos:', error);
        filtered = [];
      }
    }

    // Filtro por fecha desde
    if (filters.fechaDesde) {
      const desde = new Date(filters.fechaDesde);
      desde.setHours(0, 0, 0, 0);
      filtered = filtered.filter((h) => new Date(h.fecha) >= desde);
    }

    // Filtro por fecha hasta
    if (filters.fechaHasta) {
      const hasta = new Date(filters.fechaHasta);
      hasta.setHours(23, 59, 59, 999);
      filtered = filtered.filter((h) => new Date(h.fecha) <= hasta);
    }

    setFilteredHistory(filtered);
  }, [history, filterMovimiento, filters]);

  const clearFilters = () => {
    const emptyFilters = { fechaDesde: '', fechaHasta: '', movimiento: '', medicamento: '' };
    setFilters(emptyFilters);
    setTempFilters(emptyFilters);
    setFilterMovimiento('todos');
    setSearchTerm('');
    updateActiveFiltersCount(emptyFilters);
    setShowFilterModal(false);
    setFilteredHistory(history);
  };

  const handleDateChange = (event, selectedDate, field) => {
    setShowDatePicker(null);
    if (selectedDate) {
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      if (field === 'desde') setTempFilters((prev) => ({ ...prev, fechaDesde: dateStr }));
      else if (field === 'hasta') setTempFilters((prev) => ({ ...prev, fechaHasta: dateStr }));
    }
  };

  const generatePDF = async () => {
    if (filteredHistory.length === 0) {
      Alert.alert('Sin datos', 'No hay datos para generar el PDF');
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
      filteredHistory.forEach((item, index) => {
        tableRows += `
          <tr style="background-color: ${index % 2 === 0 ? '#f9fafb' : 'white'}">
            <td style="padding:6px;border-bottom:1px solid #e5e7eb;">${index + 1}</td>
            <td style="padding:6px;border-bottom:1px solid #e5e7eb;">${escapeHtml(formatDateShort(item.fecha))}</td>
            <td style="padding:6px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.descriptor || item.id_med || '')}</td>
            <td style="padding:6px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.movimiento || '')}</td>
            <td style="padding:6px;border-bottom:1px solid #e5e7eb;text-align:center;">${escapeHtml(String(item.cantidad || ''))}</td>
            <td style="padding:6px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.user || '')}</td>
          </tr>`;
      });

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Historial de Movimientos</title>
        <style>
          *{margin:0;padding:0;box-sizing:border-box}
          body{font-family:'Helvetica','Arial',sans-serif;padding:20px;background:white}
          .header{text-align:center;margin-bottom:20px;padding-bottom:15px;border-bottom:2px solid #7C3AED}
          .title{font-size:20px;font-weight:bold;color:#1F2937;margin-bottom:5px}
          .subtitle{font-size:12px;color:#6B7280}
          .stats{margin-bottom:15px;padding:10px;background:#F3F4F6;border-radius:8px;text-align:center}
          table{width:100%;border-collapse:collapse;font-size:10px}
          th{background:#7C3AED;color:white;padding:6px;text-align:left;font-weight:bold}
          .footer{margin-top:20px;padding-top:10px;text-align:center;font-size:10px;color:#9CA3AF;border-top:1px solid #E5E7EB}
        </style></head><body>
        <div class="header"><div class="title">HISTORIAL DE MOVIMIENTOS</div><div class="subtitle">Generado: ${today}</div></div>
        <div class="stats"><div class="stats-text">Total de registros: ${filteredHistory.length}</div></div>
        <table><thead><tr><th>#</th><th>Fecha</th><th>Medicamento</th><th>Movimiento</th><th>Cantidad</th><th>Usuario/Destino</th></tr></thead>
        <tbody>${tableRows}</tbody></table>
        <div class="footer"><div>FarmaRincón - Sistema de Gestión de Inventario</div></div>
        </body></html>`;
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Compartir historial',
        });
      }
    } catch (error) {
      console.error('Error generando PDF:', error);
      Alert.alert('Error', 'No se pudo generar el PDF');
    } finally {
      setGeneratingPDF(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size={50} color="#7C3AED" />
        <Text style={styles.loadingText}>Cargando historial...</Text>
      </View>
    );
  }

  const getMovimientoColor = (movimiento) => {
    switch (movimiento) {
      case 'Añadiendo':
        return '#10B981';
      case 'Entregando':
        return '#EA580C';
      case 'Desactivando':
        return '#DC2626';
      case 'Reactivando':
        return '#3B82F6';
      default:
        return '#6B7280';
    }
  };

  const getMovimientoIcon = (movimiento) => {
    switch (movimiento) {
      case 'Añadiendo':
        return '➕';
      case 'Entregando':
        return '📦';
      case 'Desactivando':
        return '❌';
      case 'Reactivando':
        return '🔄';
      default:
        return '📋';
    }
  };

  return (
    <View style={styles.container}>
      {/* Header con título, filtro y PDF */}
      <View style={styles.header}>
        <History color="#7C3AED" size={28} />
        <Text style={styles.title}>Historial de Movimientos</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.pdfHeaderButton}
            onPress={generatePDF}
            disabled={generatingPDF}
          >
            <FileText color="#7C3AED" size={22} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.filterButton} onPress={openFilterModal}>
            <Filter color="#6B7280" size={22} />
            {activeFiltersCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFiltersCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Barra de búsqueda con botón */}
      <View style={styles.searchSection}>
        <View style={styles.searchRow}>
          <View style={styles.searchContainer}>
            <Search color="#9CA3AF" size={20} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar por medicamento o usuario..."
              placeholderTextColor="#9CA3AF"
              value={searchTerm}
              onChangeText={setSearchTerm}
              onSubmitEditing={applySearch}
              returnKeyType="search"
            />
            {searchTerm !== '' && (
              <TouchableOpacity onPress={() => setSearchTerm('')}>
                <X color="#9CA3AF" size={20} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity style={styles.searchButton} onPress={applySearch} disabled={processing}>
            {processing ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={styles.searchButtonText}>Buscar</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Chips de filtro con contadores */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChips}>
          {['todos', 'Añadiendo', 'Entregando', 'Desactivando', 'Reactivando'].map((tipo) => {
            const count = getCountByMovimiento(tipo);
            const label = tipo === 'todos' ? `Todos (${count})` : `${tipo} (${count})`;
            return (
              <TouchableOpacity
                key={tipo}
                style={[styles.chip, filterMovimiento === tipo && styles.chipActive]}
                onPress={() => setFilterMovimiento(tipo)}
              >
                <Text style={[styles.chipText, filterMovimiento === tipo && styles.chipTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Lista de movimientos (sin stats container) */}
      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={true}
      >
        {filteredHistory.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Package color="#D1D5DB" size={64} />
            <Text style={styles.emptyTitle}>No hay movimientos</Text>
            <Text style={styles.emptyText}>No hay resultados con esos filtros</Text>
            {(searchTerm || filterMovimiento !== 'todos' || activeFiltersCount > 0) && (
              <TouchableOpacity style={styles.clearAllButtonModalInline} onPress={clearFilters}>
                <Text style={styles.clearAllButtonTextInline}>Limpiar filtros</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          filteredHistory.map((item) => (
            <View key={item.id} style={styles.historyCardCompact}>
              {/* Primera línea: TipoMov - Fecha - Usuario */}
              <View style={styles.cardRowCompact}>
                <View
                  style={[
                    styles.movimientoBadgeCompact,
                    { backgroundColor: getMovimientoColor(item.movimiento) + '20' },
                  ]}
                >
                  <Text
                    style={[
                      styles.movimientoTextCompact,
                      { color: getMovimientoColor(item.movimiento) },
                    ]}
                  >
                    {getMovimientoIcon(item.movimiento)} {item.movimiento}
                  </Text>
                </View>
                <View style={styles.dateContainerCompact}>
                  <Clock color="#6B7280" size={10} />
                  <Text style={styles.dateTextCompact}>{formatDateShort(item.fecha)}</Text>
                </View>
                <View style={styles.userContainerCompact}>
                  <User color="#6B7280" size={10} />
                  <Text style={styles.userTextCompact} numberOfLines={1}>
                    {item.user || 'Desconocido'}
                  </Text>
                </View>
              </View>
              {/* Segunda línea: Descriptor - Cantidad */}
              <View style={styles.cardRowCompact}>
                <View style={styles.medicamentoContainerCompact}>
                  <Pill color="#7C3AED" size={10} />
                  <Text style={styles.medicamentoTextCompact} numberOfLines={1}>
                    {item.descriptor || item.id_med || 'N/A'}
                  </Text>
                </View>
                <Text style={styles.cantidadTextCompact}>Cant: {item.cantidad}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Modales sin cambios */}
      <Modal visible={showFilterModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingScrollView style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filtrar movimientos</Text>
              <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                <X color="#6B7280" size={24} />
              </TouchableOpacity>
            </View>
            <View style={styles.filterForm}>
              <Text style={styles.filterLabel}>Tipo de movimiento</Text>
              <View style={styles.movimientoOptions}>
                {['todos', 'Añadiendo', 'Entregando', 'Desactivando', 'Reactivando'].map((tipo) => (
                  <TouchableOpacity
                    key={tipo}
                    style={[
                      styles.optionChip,
                      tempFilters.movimiento === tipo && styles.optionChipActive,
                    ]}
                    onPress={() => setTempFilters((prev) => ({ ...prev, movimiento: tipo }))}
                  >
                    <Text
                      style={[
                        styles.optionChipText,
                        tempFilters.movimiento === tipo && styles.optionChipTextActive,
                      ]}
                    >
                      {tipo === 'todos' ? 'Todos' : tipo}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.filterLabel}>Medicamento</Text>
              <TextInput
                style={styles.filterInput}
                placeholder="Ej: Paracetamol 500mg"
                placeholderTextColor="#9CA3AF"
                value={tempFilters.medicamento}
                onChangeText={(text) => setTempFilters((prev) => ({ ...prev, medicamento: text }))}
              />

              <Text style={styles.filterLabel}>Fecha de movimiento</Text>
              <View style={styles.dateRangeContainer}>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => setShowDatePicker('desde')}
                >
                  <Calendar color="#6B7280" size={16} />
                  <Text
                    style={[
                      styles.dateButtonText,
                      tempFilters.fechaDesde && styles.dateButtonTextSelected,
                    ]}
                  >
                    {tempFilters.fechaDesde ? formatDateShort(tempFilters.fechaDesde) : 'Desde'}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.dateSeparator}>—</Text>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => setShowDatePicker('hasta')}
                >
                  <Calendar color="#6B7280" size={16} />
                  <Text
                    style={[
                      styles.dateButtonText,
                      tempFilters.fechaHasta && styles.dateButtonTextSelected,
                    ]}
                  >
                    {tempFilters.fechaHasta ? formatDateShort(tempFilters.fechaHasta) : 'Hasta'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.clearAllButtonModal} onPress={clearFilters}>
                  <Text style={styles.clearAllButtonText}>Limpiar todo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.applyButton} onPress={applyFiltersModal}>
                  <Check color="white" size={18} />
                  <Text style={styles.applyButtonText}>Aplicar filtros</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingScrollView>
        </View>
      </Modal>

      {showDatePicker && (
        <DateTimePicker
          value={new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, date) => handleDateChange(event, date, showDatePicker)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F3F4F6' },
  loadingText: { marginTop: 10, fontSize: 14, color: '#6B7280' },

  // Header con botones
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: { fontSize: 22, fontWeight: 'bold', color: '#1F2937', flex: 1, marginLeft: 10 },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pdfHeaderButton: {
    padding: 8,
  },
  filterButton: { padding: 8, position: 'relative' },
  filterBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#7C3AED',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  filterBadgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },

  // Búsqueda
  searchSection: { backgroundColor: 'white', padding: 16, paddingBottom: 8 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  searchIcon: { marginRight: 8 },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 16, color: '#1F2937' },
  searchButton: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchButtonText: { color: 'white', fontWeight: '600', fontSize: 14 },

  // Chips con contadores
  filterChips: { flexDirection: 'row', marginBottom: 4 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    marginRight: 8,
  },
  chipActive: { backgroundColor: '#7C3AED' },
  chipText: { color: '#4B5563', fontSize: 13 },
  chipTextActive: { color: 'white' },

  // Contenido más arriba
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },

  // Empty state
  emptyContainer: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#374151', marginTop: 16 },
  emptyText: { fontSize: 14, color: '#9CA3AF', marginTop: 8, textAlign: 'center' },
  clearAllButtonModalInline: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#7C3AED',
    borderRadius: 8,
  },
  clearAllButtonTextInline: { color: 'white', fontWeight: '600' },

  // Cards compactas
  historyCardCompact: {
    backgroundColor: 'white',
    marginBottom: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    elevation: 0.5,
    borderLeftWidth: 2,
    borderLeftColor: '#7C3AED',
  },
  cardRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 2,
  },
  movimientoBadgeCompact: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginRight: 8,
  },
  movimientoTextCompact: {
    fontSize: 8,
    fontWeight: '600',
  },
  dateContainerCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
    gap: 3,
  },
  dateTextCompact: {
    fontSize: 8,
    color: '#6B7280',
  },
  userContainerCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flex: 1,
  },
  userTextCompact: {
    fontSize: 8,
    color: '#6B7280',
    flex: 1,
  },
  medicamentoContainerCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  medicamentoTextCompact: {
    fontSize: 8,
    fontWeight: '500',
    color: '#1F2937',
    flex: 1,
  },
  cantidadTextCompact: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#7C3AED',
    marginLeft: 8,
  },

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
    maxHeight: '80%',
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
  filterForm: { padding: 20 },
  filterLabel: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  filterInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    marginBottom: 20,
    color: '#1F2937',
  },
  movimientoOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  optionChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
  },
  optionChipActive: { backgroundColor: '#7C3AED' },
  optionChipText: { color: '#4B5563', fontSize: 13 },
  optionChipTextActive: { color: 'white' },
  dateRangeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 20,
  },
  dateButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingVertical: 10,
    gap: 6,
  },
  dateButtonText: { fontSize: 12, color: '#1F2937' },
  dateButtonTextSelected: { color: '#7C3AED', fontWeight: '500' },
  dateSeparator: { fontSize: 14, color: '#6B7280', paddingHorizontal: 4 },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  clearAllButtonModal: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  clearAllButtonText: { color: '#4B5563', fontWeight: '600' },
  applyButton: {
    flex: 1,
    backgroundColor: '#7C3AED',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  applyButtonText: { color: 'white', fontSize: 14, fontWeight: '600' },
});
