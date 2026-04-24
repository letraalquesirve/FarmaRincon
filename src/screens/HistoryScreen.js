// src/screens/HistoryScreen.js
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
  TextInput,
  Platform,
} from 'react-native';
import {
  History,
  Package,
  Calendar,
  User,
  ChevronDown,
  ChevronUp,
  Pill,
  Filter,
  X,
  Check,
  MapPin,
  Phone,
  Tag,
} from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import KeyboardAvoidingScrollView from '../components/KeyboardAvoidingScrollView';
import { pb } from '../services/PocketBaseConfig';

const normalizeText = (text) => {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

const formatDisplayDate = (dateString) => {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-');
  return `${day}/${month}/${year}`;
};

export default function HistoryScreen() {
  const [entregas, setEntregas] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedIds, setExpandedIds] = useState([]);
  const [filter, setFilter] = useState('todas');

  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filters, setFilters] = useState({
    destino: '',
    medicamento: '',
    fechaDesde: '',
    fechaHasta: '',
  });
  const [tempFilters, setTempFilters] = useState({
    destino: '',
    medicamento: '',
    fechaDesde: '',
    fechaHasta: '',
  });
  const [showDatePicker, setShowDatePicker] = useState(null);
  const [activeFiltersCount, setActiveFiltersCount] = useState(0);

  // Refs para evitar cargas duplicadas y manejar suscripciones
  const isLoadingRef = useRef(false);
  const subscriptionsRef = useRef([]);

  // ── Función de carga principal ──
  const loadData = useCallback(async (isRefresh = false) => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;

    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [entregasResult, pedidosResult] = await Promise.all([
        pb.collection('entregas').getList(1, 200, { sort: '-fechacreacion', requestKey: null }),
        pb.collection('pedidos').getList(1, 200, { sort: '-fechapedido', requestKey: null }),
      ]);

      const entregasWithTotal = entregasResult.items.map((item) => ({
        ...item,
        totalUnidades: (item.items || []).reduce((sum, i) => sum + (i.cantidad || 1), 0),
      }));

      setEntregas(entregasWithTotal);
      setPedidos(pedidosResult.items);
    } catch (error) {
      if (!error.isAbort) {
        console.error('Error cargando datos:', error);
      }
    } finally {
      isLoadingRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // ── Realtime subscriptions ──
  const setupRealtimeSubscriptions = useCallback(() => {
    // Limpiar suscripciones anteriores
    subscriptionsRef.current.forEach((unsub) => unsub?.());
    subscriptionsRef.current = [];

    // Suscribirse a cambios en entregas
    const entregasUnsub = pb.collection('entregas').subscribe('*', (e) => {
      console.log('🔄 Cambio en entregas (History):', e.action, e.record?.id);
      loadData();
    });

    // Suscribirse a cambios en pedidos
    const pedidosUnsub = pb.collection('pedidos').subscribe('*', (e) => {
      console.log('🔄 Cambio en pedidos (History):', e.action);
      loadData();
    });

    subscriptionsRef.current = [entregasUnsub, pedidosUnsub];
  }, [loadData]);

  // Cargar datos iniciales y setup realtime
  useEffect(() => {
    loadData();
    setupRealtimeSubscriptions();

    return () => {
      subscriptionsRef.current.forEach((unsub) => unsub?.());
    };
  }, [loadData, setupRealtimeSubscriptions]);

  const onRefresh = useCallback(() => loadData(true), [loadData]);

  const formatDate = (dateString) => {
    if (!dateString) return 'Fecha desconocida';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getPedidoInfo = (pedidoId) => pedidos.find((p) => p.id === pedidoId);

  const getFilteredEntregas = () => {
    let filtered = [...entregas];
    if (filter === 'vinculadas') filtered = filtered.filter((e) => e.pedidoId);
    else if (filter === 'huerfanas') filtered = filtered.filter((e) => !e.pedidoId);
    if (filters.destino.trim()) {
      const searchNorm = normalizeText(filters.destino);
      filtered = filtered.filter((e) => normalizeText(e.destino || '').includes(searchNorm));
    }
    if (filters.medicamento.trim()) {
      const searchNorm = normalizeText(filters.medicamento);
      filtered = filtered.filter((e) =>
        e.items?.some((item) => normalizeText(item.nombre).includes(searchNorm))
      );
    }
    if (filters.fechaDesde) {
      const desde = new Date(filters.fechaDesde);
      desde.setHours(0, 0, 0, 0);
      filtered = filtered.filter((e) => new Date(e.fechaCreacion) >= desde);
    }
    if (filters.fechaHasta) {
      const hasta = new Date(filters.fechaHasta);
      hasta.setHours(23, 59, 59, 999);
      filtered = filtered.filter((e) => new Date(e.fechaCreacion) <= hasta);
    }
    return filtered;
  };

  const updateActiveFiltersCount = (filtros) => {
    let count = 0;
    if (filtros.destino.trim()) count++;
    if (filtros.medicamento.trim()) count++;
    if (filtros.fechaDesde) count++;
    if (filtros.fechaHasta) count++;
    setActiveFiltersCount(count);
  };

  const openFilterModal = () => {
    setTempFilters({ ...filters });
    setShowFilterModal(true);
  };

  const applyFilters = () => {
    setFilters({ ...tempFilters });
    updateActiveFiltersCount(tempFilters);
    setShowFilterModal(false);
  };

  const clearFilters = () => {
    const emptyFilters = { destino: '', medicamento: '', fechaDesde: '', fechaHasta: '' };
    setFilters(emptyFilters);
    setTempFilters(emptyFilters);
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

  const toggleExpand = (id) => {
    setExpandedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const filteredEntregas = getFilteredEntregas();
  const totalEntregas = entregas.length;
  const vinculadasCount = entregas.filter((e) => e.pedidoId).length;
  const huerfanasCount = entregas.filter((e) => !e.pedidoId).length;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size={50} color="#7C3AED" />
        <Text style={styles.loadingText}>Cargando historial...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <History color="#7C3AED" size={28} />
        <Text style={styles.title}>Historial de Entregas</Text>
        <TouchableOpacity style={styles.filterButton} onPress={openFilterModal}>
          <Filter color="#6B7280" size={22} />
          {activeFiltersCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFiltersCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersContainer}>
        <TouchableOpacity
          style={[styles.filterChip, filter === 'todas' && styles.filterChipActive]}
          onPress={() => setFilter('todas')}
        >
          <Text style={[styles.filterChipText, filter === 'todas' && styles.filterChipTextActive]}>
            Todas ({totalEntregas})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, filter === 'vinculadas' && styles.filterChipActive]}
          onPress={() => setFilter('vinculadas')}
        >
          <Text
            style={[styles.filterChipText, filter === 'vinculadas' && styles.filterChipTextActive]}
          >
            Vinculadas ({vinculadasCount})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, filter === 'huerfanas' && styles.filterChipActive]}
          onPress={() => setFilter('huerfanas')}
        >
          <Text
            style={[styles.filterChipText, filter === 'huerfanas' && styles.filterChipTextActive]}
          >
            Entregas directas ({huerfanasCount})
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{filteredEntregas.length}</Text>
          <Text style={styles.statLabel}>
            {activeFiltersCount > 0 ? 'Resultados' : 'Total entregas'}
          </Text>
        </View>
        {activeFiltersCount > 0 && (
          <TouchableOpacity style={styles.clearFiltersButton} onPress={clearFilters}>
            <X color="#6B7280" size={14} />
            <Text style={styles.clearFiltersText}>Limpiar filtros</Text>
          </TouchableOpacity>
        )}
      </View>

      {filteredEntregas.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Package color="#D1D5DB" size={64} />
          <Text style={styles.emptyTitle}>No hay entregas</Text>
          <Text style={styles.emptyText}>
            {activeFiltersCount > 0
              ? 'No hay resultados con los filtros aplicados'
              : filter === 'vinculadas'
                ? 'No hay entregas vinculadas a pedidos'
                : filter === 'huerfanas'
                  ? 'No hay entregas directas'
                  : 'Las entregas que realices aparecerán aquí'}
          </Text>
          {activeFiltersCount > 0 && (
            <TouchableOpacity style={styles.clearAllButton} onPress={clearFilters}>
              <Text style={styles.clearAllButtonText}>Limpiar todos los filtros</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        filteredEntregas.map((entrega) => {
          const isExpanded = expandedIds.includes(entrega.id);
          const pedidoInfo = entrega.pedidoId ? getPedidoInfo(entrega.pedidoId) : null;
          const isVinculada = !!entrega.pedidoId;
          return (
            <View key={entrega.id} style={styles.card}>
              <TouchableOpacity style={styles.cardHeader} onPress={() => toggleExpand(entrega.id)}>
                <View style={styles.cardHeaderLeft}>
                  <Calendar color="#6B7280" size={16} />
                  <Text style={styles.cardDate}>{formatDate(entrega.fechaCreacion)}</Text>
                </View>
                <View style={styles.cardHeaderRight}>
                  <View
                    style={[
                      styles.badge,
                      isVinculada ? styles.badgeVinculado : styles.badgeHuerfano,
                    ]}
                  >
                    <Text style={styles.badgeText}>
                      {entrega.items?.length || 0} {entrega.items?.length === 1 ? 'item' : 'items'}
                    </Text>
                  </View>
                  {isExpanded ? (
                    <ChevronUp color="#6B7280" size={20} />
                  ) : (
                    <ChevronDown color="#6B7280" size={20} />
                  )}
                </View>
              </TouchableOpacity>
              <View style={styles.cardBody}>
                <View style={styles.destinoContainer}>
                  <Package color="#7C3AED" size={16} />
                  <Text style={styles.destinoLabel}>Destino:</Text>
                  <Text style={styles.destinoText}>{entrega.destino}</Text>
                </View>
                <View style={styles.destinoContainer}>
                  <User color="#6B7280" size={16} />
                  <Text style={styles.destinoLabel}>Entregado por:</Text>
                  <Text style={styles.destinoText}>{entrega.creadoPor || 'usuario'}</Text>
                </View>
                {entrega.notas && (
                  <View style={styles.destinoContainer}>
                    <Text style={styles.notasText}>📝 {entrega.notas}</Text>
                  </View>
                )}
                {isVinculada && pedidoInfo && (
                  <View style={styles.pedidoInfoContainer}>
                    <Text style={styles.pedidoInfoTitle}>Información del pedido:</Text>
                    <View style={styles.pedidoInfoRow}>
                      <Tag color="#6B7280" size={12} />
                      <Text style={styles.pedidoInfoLabel}>Solicitante:</Text>
                      <Text style={styles.pedidoInfoValue}>{pedidoInfo.nombreSolicitante}</Text>
                    </View>
                    {pedidoInfo.lugarResidencia && (
                      <View style={styles.pedidoInfoRow}>
                        <MapPin color="#6B7280" size={12} />
                        <Text style={styles.pedidoInfoLabel}>Residencia:</Text>
                        <Text style={styles.pedidoInfoValue}>{pedidoInfo.lugarResidencia}</Text>
                      </View>
                    )}
                    {pedidoInfo.telefonoContacto && (
                      <View style={styles.pedidoInfoRow}>
                        <Phone color="#6B7280" size={12} />
                        <Text style={styles.pedidoInfoLabel}>Contacto:</Text>
                        <Text style={styles.pedidoInfoValue}>{pedidoInfo.telefonoContacto}</Text>
                      </View>
                    )}
                  </View>
                )}
                {!isExpanded && entrega.items && entrega.items.length > 0 && (
                  <Text style={styles.itemsResume}>
                    {entrega.items.length}{' '}
                    {entrega.items.length === 1 ? 'medicamento' : 'medicamentos'}
                  </Text>
                )}
                {isExpanded && entrega.items && entrega.items.length > 0 && (
                  <View style={styles.itemsContainer}>
                    <Text style={styles.itemsTitle}>Medicamentos entregados:</Text>
                    {entrega.items.map((item, index) => (
                      <View key={index} style={styles.itemRow}>
                        <Pill color="#7C3AED" size={14} />
                        <View style={styles.itemInfo}>
                          <Text style={styles.itemName}>{item.nombre}</Text>
                          {item.presentacion && (
                            <Text style={styles.itemPresentation}>{item.presentacion}</Text>
                          )}
                          {item.ubicacion && (
                            <Text style={styles.itemUbicacion}>📍 {item.ubicacion}</Text>
                          )}
                        </View>
                        <Text style={styles.itemQuantity}>x{item.cantidad || 1}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <View style={styles.totalsContainer}>
                  <Text style={styles.totalItems}>
                    Estado:{' '}
                    {entrega.estado === 'abierta' && !entrega.pedidoId
                      ? '🟡 Abierta'
                      : '🔒 Cerrada'}
                  </Text>
                  <Text style={styles.totalUnidades}>
                    Total: {entrega.totalUnidades}{' '}
                    {entrega.totalUnidades === 1 ? 'unidad' : 'unidades'}
                  </Text>
                </View>
              </View>
            </View>
          );
        })
      )}

      <Modal visible={showFilterModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingScrollView style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filtrar entregas</Text>
              <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                <X color="#6B7280" size={24} />
              </TouchableOpacity>
            </View>
            <View style={styles.filterForm}>
              <View style={styles.filterInputGroup}>
                <Text style={styles.filterLabel}>Destino</Text>
                <TextInput
                  style={styles.filterInput}
                  placeholder="Nombre del destino..."
                  placeholderTextColor="#9CA3AF"
                  value={tempFilters.destino}
                  onChangeText={(text) => setTempFilters((prev) => ({ ...prev, destino: text }))}
                />
              </View>
              <View style={styles.filterInputGroup}>
                <Text style={styles.filterLabel}>Medicamento</Text>
                <TextInput
                  style={styles.filterInput}
                  placeholder="Nombre del medicamento..."
                  placeholderTextColor="#9CA3AF"
                  value={tempFilters.medicamento}
                  onChangeText={(text) =>
                    setTempFilters((prev) => ({ ...prev, medicamento: text }))
                  }
                />
              </View>
              <Text style={styles.filterLabel}>Fecha de entrega</Text>
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
                    {tempFilters.fechaDesde ? formatDisplayDate(tempFilters.fechaDesde) : 'Desde'}
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
                    {tempFilters.fechaHasta ? formatDisplayDate(tempFilters.fechaHasta) : 'Hasta'}
                  </Text>
                </TouchableOpacity>
              </View>
              {(tempFilters.fechaDesde || tempFilters.fechaHasta) && (
                <TouchableOpacity
                  style={styles.clearDatesButton}
                  onPress={() =>
                    setTempFilters((prev) => ({ ...prev, fechaDesde: '', fechaHasta: '' }))
                  }
                >
                  <X color="#6B7280" size={14} />
                  <Text style={styles.clearDatesText}>Limpiar fechas</Text>
                </TouchableOpacity>
              )}
              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.clearAllButtonModal} onPress={clearFilters}>
                  <Text style={styles.clearAllButtonText}>Limpiar todo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.applyButton} onPress={applyFilters}>
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
    </ScrollView>
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
  filtersContainer: {
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
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
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    elevation: 2,
  },
  statNumber: { fontSize: 24, fontWeight: 'bold', color: '#7C3AED' },
  statLabel: { fontSize: 12, color: '#6B7280', marginTop: 4, textAlign: 'center' },
  clearFiltersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
  },
  clearFiltersText: { fontSize: 12, color: '#6B7280' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', padding: 40, marginTop: 20 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#374151', marginTop: 16 },
  emptyText: { fontSize: 14, color: '#9CA3AF', marginTop: 8, textAlign: 'center' },
  clearAllButton: { marginTop: 16, padding: 12, backgroundColor: '#7C3AED', borderRadius: 8 },
  clearAllButtonText: { color: 'white', fontWeight: '600' },
  card: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 16,
    elevation: 2,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardDate: { fontSize: 14, color: '#4B5563', fontWeight: '500' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeVinculado: { backgroundColor: '#7C3AED' },
  badgeHuerfano: { backgroundColor: '#6B7280' },
  badgeText: { color: 'white', fontSize: 12, fontWeight: 'bold' },
  cardBody: { padding: 16 },
  destinoContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  destinoLabel: { fontSize: 14, fontWeight: '600', color: '#374151' },
  destinoText: { fontSize: 14, color: '#4B5563', flex: 1 },
  notasText: { fontSize: 14, color: '#6B7280', fontStyle: 'italic' },
  pedidoInfoContainer: {
    backgroundColor: '#F3F4F6',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  pedidoInfoTitle: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  pedidoInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  pedidoInfoLabel: { fontSize: 12, color: '#6B7280', marginLeft: 2 },
  pedidoInfoValue: { fontSize: 12, color: '#1F2937', fontWeight: '500', flex: 1 },
  itemsResume: { fontSize: 13, color: '#6B7280', fontStyle: 'italic', marginTop: 4 },
  itemsContainer: { marginTop: 12, padding: 12, backgroundColor: '#F3F4F6', borderRadius: 12 },
  itemsTitle: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 8,
  },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: '500', color: '#1F2937' },
  itemPresentation: { fontSize: 12, color: '#6B7280' },
  itemUbicacion: { fontSize: 11, color: '#10B981', marginTop: 2 },
  itemQuantity: { fontSize: 14, fontWeight: 'bold', color: '#7C3AED' },
  totalsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  totalItems: { fontSize: 12, color: '#6B7280' },
  totalUnidades: { fontSize: 12, fontWeight: '600', color: '#1F2937' },
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
  filterInputGroup: { marginBottom: 20 },
  filterLabel: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  filterInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#1F2937',
  },
  dateRangeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
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
    paddingHorizontal: 4,
    gap: 6,
  },
  dateButtonText: { fontSize: 12, color: '#1F2937', flexShrink: 1 },
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
  clearDatesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginTop: 8,
    marginBottom: 16,
    gap: 4,
  },
  clearDatesText: { fontSize: 12, color: '#6B7280' },
});
