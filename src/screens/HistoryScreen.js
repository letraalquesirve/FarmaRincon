// src/screens/HistoryScreen.js - NUEVA VERSIÓN
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
} from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import KeyboardAvoidingScrollView from '../components/KeyboardAvoidingScrollView';
import { pb } from '../services/PocketBaseConfig';
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

export default function HistoryScreen() {
  const [history, setHistory] = useState([]);
  const [filteredHistory, setFilteredHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMovimiento, setFilterMovimiento] = useState('todos'); // todos, Añadiendo, Entregando, Desactivando, Reactivando
  const [generatingPDF, setGeneratingPDF] = useState(false);

  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filters, setFilters] = useState({
    fechaDesde: '',
    fechaHasta: '',
    movimiento: '',
  });
  const [tempFilters, setTempFilters] = useState({
    fechaDesde: '',
    fechaHasta: '',
    movimiento: '',
  });
  const [showDatePicker, setShowDatePicker] = useState(null);
  const [activeFiltersCount, setActiveFiltersCount] = useState(0);

  const isLoadingRef = useRef(false);

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDateShort = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    });
  };

  const loadData = useCallback(
    async (isRefresh = false) => {
      if (isLoadingRef.current) return;
      isLoadingRef.current = true;

      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const result = await pb.collection('history').getList(1, 500, {
          sort: '-fecha',
          requestKey: null,
        });
        setHistory(result.items);
        applyFilters(result.items, filters, searchTerm, filterMovimiento);
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
    [filters, searchTerm, filterMovimiento]
  );

  const applyFilters = (data, currentFilters, search, movimientoFilter) => {
    let filtered = [...data];

    // Filtro por tipo de movimiento
    if (movimientoFilter !== 'todos') {
      filtered = filtered.filter((h) => h.movimiento === movimientoFilter);
    }

    // Filtro por término de búsqueda (id_med o user)
    if (search.trim()) {
      const term = search.toLowerCase().trim();
      filtered = filtered.filter(
        (h) =>
          (h.id_med && h.id_med.toLowerCase().includes(term)) ||
          (h.user && h.user.toLowerCase().includes(term))
      );
    }

    // Filtro por fecha desde
    if (currentFilters.fechaDesde) {
      const desde = new Date(currentFilters.fechaDesde);
      desde.setHours(0, 0, 0, 0);
      filtered = filtered.filter((h) => new Date(h.fecha) >= desde);
    }

    // Filtro por fecha hasta
    if (currentFilters.fechaHasta) {
      const hasta = new Date(currentFilters.fechaHasta);
      hasta.setHours(23, 59, 59, 999);
      filtered = filtered.filter((h) => new Date(h.fecha) <= hasta);
    }

    setFilteredHistory(filtered);
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    applyFilters(history, filters, searchTerm, filterMovimiento);
  }, [searchTerm, filterMovimiento, filters]);

  const onRefresh = useCallback(() => loadData(true), [loadData]);

  const updateActiveFiltersCount = (filtros) => {
    let count = 0;
    if (filtros.fechaDesde) count++;
    if (filtros.fechaHasta) count++;
    if (filtros.movimiento && filtros.movimiento !== 'todos') count++;
    setActiveFiltersCount(count);
  };

  const openFilterModal = () => {
    setTempFilters({ ...filters });
    setShowFilterModal(true);
  };

  const applyFiltersModal = () => {
    setFilters({ ...tempFilters });
    updateActiveFiltersCount(tempFilters);
    setShowFilterModal(false);
  };

  const clearFilters = () => {
    const emptyFilters = { fechaDesde: '', fechaHasta: '', movimiento: '' };
    setFilters(emptyFilters);
    setTempFilters(emptyFilters);
    setFilterMovimiento('todos');
    updateActiveFiltersCount(emptyFilters);
    setShowFilterModal(false);
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
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${index + 1}</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(formatDateShort(item.fecha))}</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.id_med || '')}</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.movimiento || '')}</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:center;">${escapeHtml(String(item.cantidad || ''))}</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.user || '')}</td>
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
          table{width:100%;border-collapse:collapse;font-size:11px}
          th{background:#7C3AED;color:white;padding:8px;text-align:left;font-weight:bold}
          .footer{margin-top:20px;padding-top:10px;text-align:center;font-size:10px;color:#9CA3AF;border-top:1px solid #E5E7EB}
        </style></head><body>
        <div class="header"><div class="title">HISTORIAL DE MOVIMIENTOS</div><div class="subtitle">Generado: ${today}</div></div>
        <div class="stats"><div class="stats-text">Total de registros: ${filteredHistory.length}</div></div>
        <table><thead><tr><th>#</th><th>Fecha</th><th>ID Medicamento</th><th>Movimiento</th><th>Cantidad</th><th>Usuario/Destino</th></tr></thead>
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
      <View style={styles.header}>
        <History color="#7C3AED" size={28} />
        <Text style={styles.title}>Historial de Movimientos</Text>
        <TouchableOpacity style={styles.filterButton} onPress={openFilterModal}>
          <Filter color="#6B7280" size={22} />
          {activeFiltersCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFiltersCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Barra de búsqueda y filtros rápidos */}
      <View style={styles.searchSection}>
        <View style={styles.searchContainer}>
          <Search color="#9CA3AF" size={20} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por ID de medicamento o usuario..."
            placeholderTextColor="#9CA3AF"
            value={searchTerm}
            onChangeText={setSearchTerm}
          />
          {searchTerm !== '' && (
            <TouchableOpacity onPress={() => setSearchTerm('')}>
              <X color="#9CA3AF" size={20} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChips}>
          {['todos', 'Añadiendo', 'Entregando', 'Desactivando', 'Reactivando'].map((tipo) => (
            <TouchableOpacity
              key={tipo}
              style={[styles.chip, filterMovimiento === tipo && styles.chipActive]}
              onPress={() => setFilterMovimiento(tipo)}
            >
              <Text style={[styles.chipText, filterMovimiento === tipo && styles.chipTextActive]}>
                {tipo === 'todos' ? 'Todos' : tipo}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Contador y botón PDF */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{filteredHistory.length}</Text>
          <Text style={styles.statLabel}>Registros encontrados</Text>
        </View>
        <TouchableOpacity style={styles.pdfButton} onPress={generatePDF} disabled={generatingPDF}>
          <FileText color="#7C3AED" size={18} />
          <Text style={styles.pdfButtonText}>{generatingPDF ? 'Generando...' : 'PDF'}</Text>
        </TouchableOpacity>
      </View>

      {/* Lista de movimientos */}
      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {filteredHistory.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Package color="#D1D5DB" size={64} />
            <Text style={styles.emptyTitle}>No hay movimientos</Text>
            <Text style={styles.emptyText}>
              {searchTerm || filterMovimiento !== 'todos' || activeFiltersCount > 0
                ? 'No hay resultados con esos filtros'
                : 'Los movimientos aparecerán aquí'}
            </Text>
            {(searchTerm || filterMovimiento !== 'todos' || activeFiltersCount > 0) && (
              <TouchableOpacity style={styles.clearAllButton} onPress={clearFilters}>
                <Text style={styles.clearAllButtonText}>Limpiar filtros</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          filteredHistory.map((item) => (
            <View key={item.id} style={styles.historyCard}>
              <View style={styles.cardRow}>
                <View style={styles.dateContainer}>
                  <Clock color="#6B7280" size={14} />
                  <Text style={styles.dateText}>{formatDateShort(item.fecha)}</Text>
                </View>
                <View
                  style={[
                    styles.movimientoBadge,
                    { backgroundColor: getMovimientoColor(item.movimiento) + '20' },
                  ]}
                >
                  <Text
                    style={[styles.movimientoText, { color: getMovimientoColor(item.movimiento) }]}
                  >
                    {getMovimientoIcon(item.movimiento)} {item.movimiento}
                  </Text>
                </View>
              </View>
              <View style={styles.cardRow}>
                <Text style={styles.idMedText}>ID: {item.id_med || 'N/A'}</Text>
                <Text style={styles.cantidadText}>Cant: {item.cantidad}</Text>
              </View>
              <View style={styles.cardRow}>
                <User size={12} color="#6B7280" />
                <Text style={styles.userText}>{item.user || 'Desconocido'}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Modal de filtros */}
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
  searchSection: { backgroundColor: 'white', padding: 16, paddingBottom: 8 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 16, color: '#1F2937' },
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
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  statNumber: { fontSize: 20, fontWeight: 'bold', color: '#7C3AED' },
  statLabel: { fontSize: 11, color: '#6B7280', marginTop: 4 },
  pdfButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  pdfButtonText: { color: '#7C3AED', fontWeight: '600', fontSize: 12 },
  content: { flex: 1, padding: 16 },
  emptyContainer: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#374151', marginTop: 16 },
  emptyText: { fontSize: 14, color: '#9CA3AF', marginTop: 8, textAlign: 'center' },
  clearAllButton: { marginTop: 16, padding: 12, backgroundColor: '#7C3AED', borderRadius: 8 },
  clearAllButtonText: { color: 'white', fontWeight: '600' },
  historyCard: {
    backgroundColor: 'white',
    marginBottom: 10,
    padding: 12,
    borderRadius: 12,
    elevation: 1,
    borderLeftWidth: 3,
    borderLeftColor: '#7C3AED',
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  dateContainer: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dateText: { fontSize: 12, color: '#6B7280' },
  movimientoBadge: { paddingHorizontal: 10, paddingVertical: 2, borderRadius: 12 },
  movimientoText: { fontSize: 11, fontWeight: '600' },
  idMedText: { fontSize: 13, fontWeight: '500', color: '#1F2937' },
  cantidadText: { fontSize: 13, fontWeight: 'bold', color: '#7C3AED' },
  userText: { fontSize: 11, color: '#6B7280', marginLeft: 4, flex: 1 },
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
