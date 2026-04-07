import React, { useState, useEffect } from 'react';
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
import { db } from '../../firebaseConfig';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import {
  History,
  Package,
  Calendar,
  User,
  ChevronDown,
  ChevronUp,
  Pill,
  Users,
  MapPin,
  Phone,
  Tag,
  Filter,
  X,
  Check,
  UserCheck,
} from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import KeyboardAvoidingScrollView from '../components/KeyboardAvoidingScrollView';

// Función para normalizar texto (quitar acentos, trim, convertir a minúsculas)
const normalizeText = (text) => {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

// Función para formatear fecha para mostrar (DD/MM/YYYY)
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
  const [expandedId, setExpandedId] = useState(null);
  const [filter, setFilter] = useState('todas');

  // Estado de filtros
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filters, setFilters] = useState({
    solicitante: '',
    medicamento: '',
    residencia: '',
    destino: '', // NUEVO: receptor de la entrega
    fechaDesde: '',
    fechaHasta: '',
  });
  const [tempFilters, setTempFilters] = useState({
    solicitante: '',
    medicamento: '',
    residencia: '',
    destino: '',
    fechaDesde: '',
    fechaHasta: '',
  });
  const [showDatePicker, setShowDatePicker] = useState(null);
  const [activeFiltersCount, setActiveFiltersCount] = useState(0);

  useEffect(() => {
    const qEntregas = query(collection(db, 'entregas'), orderBy('fecha', 'desc'), limit(100));

    const unsubscribeEntregas = onSnapshot(qEntregas, (snapshot) => {
      const docs = [];
      snapshot.forEach((d) => {
        const data = d.data();
        const items = data.items || [
          {
            medicamentoId: data.medicamentoId,
            nombre: data.nombre,
            presentacion: data.presentacion,
            cantidad: data.cantidad || 1,
            vencimiento: data.vencimiento,
            ubicacion: data.ubicacion || '',
          },
        ];

        docs.push({
          id: d.id,
          ...data,
          items: items,
          totalUnidades:
            data.totalUnidades || items.reduce((sum, item) => sum + (item.cantidad || 1), 0),
          totalItems: data.totalItems || items.length,
        });
      });
      setEntregas(docs);
      setLoading(false);
      setRefreshing(false);
    });

    const qPedidos = query(collection(db, 'pedidos'), orderBy('fechaPedido', 'desc'));
    const unsubscribePedidos = onSnapshot(qPedidos, (snapshot) => {
      const docs = [];
      snapshot.forEach((d) => docs.push({ id: d.id, ...d.data() }));
      setPedidos(docs);
    });

    return () => {
      unsubscribeEntregas();
      unsubscribePedidos();
    };
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getPedidoInfo = (pedidoId) => {
    return pedidos.find((p) => p.id === pedidoId);
  };

  const getTotalPorEntrega = (entrega) => {
    return (
      entrega.items?.reduce((sum, item) => sum + (item.cantidad || 0), 0) || entrega.cantidad || 0
    );
  };

  const getFilteredEntregas = () => {
    let filtered = [...entregas];

    // Filtro por tipo (vinculadas/huerfanas)
    if (filter === 'vinculadas') {
      filtered = filtered.filter((e) => e.pedidoId);
    } else if (filter === 'huerfanas') {
      filtered = filtered.filter((e) => e.esHuérfana || (!e.pedidoId && !e.esHuérfana));
    }

    // Filtro por solicitante (solo para entregas vinculadas a pedido)
    if (filters.solicitante.trim()) {
      const searchNorm = normalizeText(filters.solicitante);
      filtered = filtered.filter((entrega) => {
        if (!entrega.pedidoId) return false;
        const pedido = getPedidoInfo(entrega.pedidoId);
        if (!pedido) return false;
        return normalizeText(pedido.nombreSolicitante).includes(searchNorm);
      });
    }

    // Filtro por medicamento (buscar en items de la entrega)
    if (filters.medicamento.trim()) {
      const searchNorm = normalizeText(filters.medicamento);
      filtered = filtered.filter((entrega) => {
        return entrega.items?.some((item) => normalizeText(item.nombre).includes(searchNorm));
      });
    }

    // Filtro por residencia (solo para entregas vinculadas a pedido)
    if (filters.residencia.trim()) {
      const searchNorm = normalizeText(filters.residencia);
      filtered = filtered.filter((entrega) => {
        if (!entrega.pedidoId) return false;
        const pedido = getPedidoInfo(entrega.pedidoId);
        if (!pedido) return false;
        return normalizeText(pedido.lugarResidencia || '').includes(searchNorm);
      });
    }

    // NUEVO: Filtro por destino (receptor de la entrega)
    // Esto aplica TANTO para entregas vinculadas como para entregas directas
    if (filters.destino.trim()) {
      const searchNorm = normalizeText(filters.destino);
      filtered = filtered.filter((entrega) => {
        // El destino puede ser el nombre del solicitante (si es vinculada)
        // o el destino libre ingresado manualmente (si es directa)
        return normalizeText(entrega.destino || '').includes(searchNorm);
      });
    }

    // Filtro por fecha de entrega (campo 'fecha' del documento entrega)
    if (filters.fechaDesde) {
      const desde = new Date(filters.fechaDesde);
      desde.setHours(0, 0, 0, 0);
      filtered = filtered.filter((entrega) => {
        const fechaEntrega = new Date(entrega.fecha);
        return fechaEntrega >= desde;
      });
    }

    if (filters.fechaHasta) {
      const hasta = new Date(filters.fechaHasta);
      hasta.setHours(23, 59, 59, 999);
      filtered = filtered.filter((entrega) => {
        const fechaEntrega = new Date(entrega.fecha);
        return fechaEntrega <= hasta;
      });
    }

    return filtered;
  };

  const updateActiveFiltersCount = (filtros) => {
    let count = 0;
    if (filtros.solicitante.trim()) count++;
    if (filtros.medicamento.trim()) count++;
    if (filtros.residencia.trim()) count++;
    if (filtros.destino.trim()) count++;
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
    const emptyFilters = {
      solicitante: '',
      medicamento: '',
      residencia: '',
      destino: '',
      fechaDesde: '',
      fechaHasta: '',
    };
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

      // Mapear el campo recibido ('desde' o 'hasta') a los nombres correctos en el estado
      if (field === 'desde') {
        setTempFilters((prev) => ({ ...prev, fechaDesde: dateStr }));
      } else if (field === 'hasta') {
        setTempFilters((prev) => ({ ...prev, fechaHasta: dateStr }));
      }
    }
  };

  const filteredEntregas = getFilteredEntregas();

  // Cambiar el estado de expandedId (de string a array)
  const [expandedIds, setExpandedIds] = useState([]);

  // Función para toggle de expansión
  const toggleExpand = (id) => {
    if (expandedIds.includes(id)) {
      setExpandedIds(expandedIds.filter((item) => item !== id));
    } else {
      setExpandedIds([...expandedIds, id]);
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

      {/* Filtros rápidos (tipo) */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersContainer}>
        <TouchableOpacity
          style={[styles.filterChip, filter === 'todas' && styles.filterChipActive]}
          onPress={() => setFilter('todas')}
        >
          <Text style={[styles.filterChipText, filter === 'todas' && styles.filterChipTextActive]}>
            Todas ({entregas.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, filter === 'vinculadas' && styles.filterChipActive]}
          onPress={() => setFilter('vinculadas')}
        >
          <Text
            style={[styles.filterChipText, filter === 'vinculadas' && styles.filterChipTextActive]}
          >
            Vinculadas a pedidos
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, filter === 'huerfanas' && styles.filterChipActive]}
          onPress={() => setFilter('huerfanas')}
        >
          <Text
            style={[styles.filterChipText, filter === 'huerfanas' && styles.filterChipTextActive]}
          >
            Entregas directas
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Estadísticas con filtros activos */}
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
          const totalUnidades = getTotalPorEntrega(entrega);
          const isExpanded = expandedIds.includes(entrega.id);
          const pedidoInfo = entrega.pedidoId ? getPedidoInfo(entrega.pedidoId) : null;

          // Determinar si la entrega es vinculada o directa para mostrar icono diferente
          const isVinculada = !!entrega.pedidoId;

          return (
            <View key={entrega.id} style={styles.card}>
              <TouchableOpacity style={styles.cardHeader} onPress={() => toggleExpand(entrega.id)}>
                <View style={styles.cardHeaderLeft}>
                  <Calendar color="#6B7280" size={16} />
                  <Text style={styles.cardDate}>{formatDate(entrega.fecha)}</Text>
                </View>
                <View style={styles.cardHeaderRight}>
                  <View
                    style={[
                      styles.badge,
                      isVinculada ? styles.badgeVinculado : styles.badgeHuerfano,
                    ]}
                  >
                    <Text style={styles.badgeText}>{totalUnidades} uds</Text>
                  </View>
                  {isExpanded ? (
                    <ChevronUp color="#6B7280" size={20} />
                  ) : (
                    <ChevronDown color="#6B7280" size={20} />
                  )}
                </View>
              </TouchableOpacity>

              <View style={styles.cardBody}>
                {/* Tipo de entrega y destino */}
                <View style={styles.destinoContainer}>
                  {isVinculada ? (
                    <Users color="#7C3AED" size={16} />
                  ) : (
                    <UserCheck color="#10B981" size={16} />
                  )}
                  <Text style={styles.destinoLabel}>Destino:</Text>
                  <Text style={styles.destinoText}>{entrega.destino}</Text>
                </View>

                {/* Información del pedido si existe */}
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

                {/* Resumen rápido si no está expandido */}
                {!isExpanded && entrega.items && entrega.items.length > 0 && (
                  <Text style={styles.itemsResume}>
                    {entrega.items.length}{' '}
                    {entrega.items.length === 1 ? 'medicamento' : 'medicamentos'}
                  </Text>
                )}

                {/* Lista detallada si está expandido */}
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

                {/* Totales */}
                <View style={styles.totalsContainer}>
                  <Text style={styles.totalItems}>Items: {entrega.items?.length || 1}</Text>
                  <Text style={styles.totalUnidades}>
                    Total: {totalUnidades} {totalUnidades === 1 ? 'unidad' : 'unidades'}
                  </Text>
                </View>
              </View>
            </View>
          );
        })
      )}

      {/* Modal de filtros */}
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
              {/* Filtro por solicitante (solo pedidos vinculados) */}
              <View style={styles.filterInputGroup}>
                <Text style={styles.filterLabel}>Solicitante (solo pedidos)</Text>
                <TextInput
                  style={styles.filterInput}
                  placeholder="Nombre del solicitante..."
                  value={tempFilters.solicitante}
                  onChangeText={(text) =>
                    setTempFilters((prev) => ({ ...prev, solicitante: text }))
                  }
                />
              </View>

              {/* Filtro por medicamento */}
              <View style={styles.filterInputGroup}>
                <Text style={styles.filterLabel}>Medicamento</Text>
                <TextInput
                  style={styles.filterInput}
                  placeholder="Nombre del medicamento..."
                  value={tempFilters.medicamento}
                  onChangeText={(text) =>
                    setTempFilters((prev) => ({ ...prev, medicamento: text }))
                  }
                />
              </View>

              {/* Filtro por residencia (solo pedidos vinculados) */}
              <View style={styles.filterInputGroup}>
                <Text style={styles.filterLabel}>Residencia (solo pedidos)</Text>
                <TextInput
                  style={styles.filterInput}
                  placeholder="Lugar de residencia..."
                  value={tempFilters.residencia}
                  onChangeText={(text) => setTempFilters((prev) => ({ ...prev, residencia: text }))}
                />
              </View>

              {/* NUEVO: Filtro por destino (receptor de la entrega) */}
              <View style={styles.filterInputGroup}>
                <Text style={styles.filterLabel}>Destino (receptor)</Text>
                <TextInput
                  style={styles.filterInput}
                  placeholder="Nombre del receptor..."
                  value={tempFilters.destino}
                  onChangeText={(text) => setTempFilters((prev) => ({ ...prev, destino: text }))}
                />
                <Text style={styles.filterHint}>
                  Busca por el nombre del solicitante (si hay pedido) o por el receptor (si es
                  entrega directa)
                </Text>
              </View>

              {/* Rango de fechas */}
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

              {/* Botón para limpiar fechas */}
              {(tempFilters.fechaDesde || tempFilters.fechaHasta) && (
                <TouchableOpacity
                  style={styles.clearDatesButton}
                  onPress={() => {
                    setTempFilters((prev) => ({ ...prev, fechaDesde: '', fechaHasta: '' }));
                  }}
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

      {/* DatePicker para fechas */}
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
  destinoContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  destinoLabel: { fontSize: 14, fontWeight: '600', color: '#374151' },
  destinoText: { fontSize: 14, color: '#4B5563', flex: 1 },
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
  },
  filterHint: { fontSize: 11, color: '#9CA3AF', marginTop: 4, fontStyle: 'italic' },
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
    minWidth: 0, // Permite que el contenedor se reduzca
  },
  dateButtonText: {
    fontSize: 12,
    color: '#1F2937',
    flexShrink: 1,
  },
  dateButtonTextSelected: {
    color: '#7C3AED',
    fontWeight: '500',
  },
  dateSeparator: {
    fontSize: 14,
    color: '#6B7280',
    paddingHorizontal: 4,
  },
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
  clearDatesText: {
    fontSize: 12,
    color: '#6B7280',
  },
  dateButtonTextSelected: {
    color: '#7C3AED',
    fontWeight: '500',
  },
});
