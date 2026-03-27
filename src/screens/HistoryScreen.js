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
  Check
} from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import KeyboardAvoidingScrollView from '../components/KeyboardAvoidingScrollView';

// Función para normalizar texto (quitar acentos y convertir a minúsculas)
const normalizeText = (text) => {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

export default function HistoryScreen() {
  const [entregas, setEntregas] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [filter, setFilter] = useState('todas'); // todas, vinculadas, huerfanas

  // Estado de filtros
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filters, setFilters] = useState({
    solicitante: '',
    medicamento: '',
    residencia: '',
    fechaDesde: '',
    fechaHasta: '',
  });
  const [tempFilters, setTempFilters] = useState({
    solicitante: '',
    medicamento: '',
    residencia: '',
    fechaDesde: '',
    fechaHasta: '',
  });
  const [showDatePicker, setShowDatePicker] = useState(null); // 'desde' o 'hasta'
  const [activeFiltersCount, setActiveFiltersCount] = useState(0);

  useEffect(() => {
    // Cargar entregas
    const qEntregas = query(
      collection(db, 'entregas'),
      orderBy('fecha', 'desc'),
      limit(100)
    );
    
    const unsubscribeEntregas = onSnapshot(qEntregas, (snapshot) => {
      const docs = [];
      snapshot.forEach(d => {
        const data = d.data();
        const items = data.items || [{
          medicamentoId: data.medicamentoId,
          nombre: data.nombre,
          presentacion: data.presentacion,
          cantidad: data.cantidad || 1,
          vencimiento: data.vencimiento
        }];
        
        docs.push({ 
          id: d.id, 
          ...data,
          items: items,
          totalUnidades: data.totalUnidades || items.reduce((sum, item) => sum + (item.cantidad || 1), 0),
          totalItems: data.totalItems || items.length
        });
      });
      setEntregas(docs);
      setLoading(false);
      setRefreshing(false);
    });

    // Cargar pedidos para obtener información de solicitantes
    const qPedidos = query(collection(db, 'pedidos'), orderBy('fechaPedido', 'desc'));
    const unsubscribePedidos = onSnapshot(qPedidos, (snapshot) => {
      const docs = [];
      snapshot.forEach(d => docs.push({ id: d.id, ...d.data() }));
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

  const formatDateForFilter = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toISOString().split('T')[0];
  };

  const getPedidoInfo = (pedidoId) => {
    return pedidos.find(p => p.id === pedidoId);
  };

  const getTotalPorEntrega = (entrega) => {
    return entrega.items?.reduce((sum, item) => sum + (item.cantidad || 0), 0) || entrega.cantidad || 0;
  };

  // Función para aplicar filtros a las entregas
  const getFilteredEntregas = () => {
    let filtered = [...entregas];

    // Filtro por tipo (vinculadas/huerfanas)
    if (filter === 'vinculadas') {
      filtered = filtered.filter(e => e.pedidoId);
    } else if (filter === 'huerfanas') {
      filtered = filtered.filter(e => e.esHuérfana || (!e.pedidoId && !e.esHuérfana));
    }

    // Filtro por solicitante (buscar en pedido vinculado)
    if (filters.solicitante.trim()) {
      const searchNorm = normalizeText(filters.solicitante);
      filtered = filtered.filter(entrega => {
        if (!entrega.pedidoId) return false;
        const pedido = getPedidoInfo(entrega.pedidoId);
        if (!pedido) return false;
        return normalizeText(pedido.nombreSolicitante).includes(searchNorm);
      });
    }

    // Filtro por medicamento (buscar en items de la entrega)
    if (filters.medicamento.trim()) {
      const searchNorm = normalizeText(filters.medicamento);
      filtered = filtered.filter(entrega => {
        return entrega.items?.some(item => 
          normalizeText(item.nombre).includes(searchNorm)
        );
      });
    }

    // Filtro por residencia (buscar en pedido vinculado)
    if (filters.residencia.trim()) {
      const searchNorm = normalizeText(filters.residencia);
      filtered = filtered.filter(entrega => {
        if (!entrega.pedidoId) return false;
        const pedido = getPedidoInfo(entrega.pedidoId);
        if (!pedido) return false;
        return normalizeText(pedido.lugarResidencia || '').includes(searchNorm);
      });
    }

    // Filtro por fecha desde
    if (filters.fechaDesde) {
      const desde = new Date(filters.fechaDesde);
      desde.setHours(0, 0, 0, 0);
      filtered = filtered.filter(entrega => {
        const fechaEntrega = new Date(entrega.fecha);
        return fechaEntrega >= desde;
      });
    }

    // Filtro por fecha hasta
    if (filters.fechaHasta) {
      const hasta = new Date(filters.fechaHasta);
      hasta.setHours(23, 59, 59, 999);
      filtered = filtered.filter(entrega => {
        const fechaEntrega = new Date(entrega.fecha);
        return fechaEntrega <= hasta;
      });
    }

    return filtered;
  };

  // Contar filtros activos
  const updateActiveFiltersCount = (filtros) => {
    let count = 0;
    if (filtros.solicitante.trim()) count++;
    if (filtros.medicamento.trim()) count++;
    if (filtros.residencia.trim()) count++;
    if (filtros.fechaDesde) count++;
    if (filtros.fechaHasta) count++;
    setActiveFiltersCount(count);
  };

  // Abrir modal de filtros
  const openFilterModal = () => {
    setTempFilters({ ...filters });
    setShowFilterModal(true);
  };

  // Aplicar filtros
  const applyFilters = () => {
    setFilters({ ...tempFilters });
    updateActiveFiltersCount(tempFilters);
    setShowFilterModal(false);
  };

  // Limpiar todos los filtros
  const clearFilters = () => {
    const emptyFilters = {
      solicitante: '',
      medicamento: '',
      residencia: '',
      fechaDesde: '',
      fechaHasta: '',
    };
    setFilters(emptyFilters);
    setTempFilters(emptyFilters);
    updateActiveFiltersCount(emptyFilters);
    setShowFilterModal(false);
  };

  // Cambiar fecha en el modal
  const handleDateChange = (event, selectedDate, field) => {
    setShowDatePicker(null);
    if (selectedDate) {
      const dateStr = selectedDate.toISOString().split('T')[0];
      setTempFilters(prev => ({ ...prev, [field]: dateStr }));
    }
  };

  const filteredEntregas = getFilteredEntregas();

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
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
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
          <Text style={[styles.filterChipText, filter === 'vinculadas' && styles.filterChipTextActive]}>
            Vinculadas a pedidos
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, filter === 'huerfanas' && styles.filterChipActive]}
          onPress={() => setFilter('huerfanas')}
        >
          <Text style={[styles.filterChipText, filter === 'huerfanas' && styles.filterChipTextActive]}>
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
          const isExpanded = expandedId === entrega.id;
          const pedidoInfo = entrega.pedidoId ? getPedidoInfo(entrega.pedidoId) : null;
          
          return (
            <View key={entrega.id} style={styles.card}>
              <TouchableOpacity
                style={styles.cardHeader}
                onPress={() => setExpandedId(isExpanded ? null : entrega.id)}
              >
                <View style={styles.cardHeaderLeft}>
                  <Calendar color="#6B7280" size={16} />
                  <Text style={styles.cardDate}>{formatDate(entrega.fecha)}</Text>
                </View>
                <View style={styles.cardHeaderRight}>
                  <View style={[
                    styles.badge,
                    entrega.pedidoId ? styles.badgeVinculado : styles.badgeHuerfano
                  ]}>
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
                {/* Tipo de entrega */}
                {entrega.pedidoId ? (
                  <View style={styles.tipoContainer}>
                    <Users color="#7C3AED" size={16} />
                    <Text style={styles.tipoText}>Vinculada a pedido</Text>
                  </View>
                ) : (
                  <View style={[styles.tipoContainer, styles.tipoHuerfano]}>
                    <Package color="#6B7280" size={16} />
                    <Text style={styles.tipoHuerfanoText}>Entrega directa (sin pedido)</Text>
                  </View>
                )}

                {/* Destino */}
                <View style={styles.destinoContainer}>
                  <User color="#6B7280" size={16} />
                  <Text style={styles.destinoLabel}>Destino:</Text>
                  <Text style={styles.destinoText}>{entrega.destino}</Text>
                </View>

                {/* Información del pedido si existe */}
                {entrega.pedidoId && pedidoInfo && (
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
                    {entrega.items.length} {entrega.items.length === 1 ? 'medicamento' : 'medicamentos'}
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
                        </View>
                        <Text style={styles.itemQuantity}>x{item.cantidad || 1}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Totales */}
                <View style={styles.totalsContainer}>
                  <Text style={styles.totalItems}>
                    Items: {entrega.items?.length || 1}
                  </Text>
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
      <Modal
        visible={showFilterModal}
        animationType="slide"
        transparent={true}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingScrollView style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filtrar entregas</Text>
              <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                <X color="#6B7280" size={24} />
              </TouchableOpacity>
            </View>

            <View style={styles.filterForm}>
              {/* Filtro por solicitante */}
              <View style={styles.filterInputGroup}>
                <Text style={styles.filterLabel}>Solicitante</Text>
                <TextInput
                  style={styles.filterInput}
                  placeholder="Nombre del solicitante..."
                  value={tempFilters.solicitante}
                  onChangeText={(text) => setTempFilters(prev => ({ ...prev, solicitante: text }))}
                />
              </View>

              {/* Filtro por medicamento */}
              <View style={styles.filterInputGroup}>
                <Text style={styles.filterLabel}>Medicamento</Text>
                <TextInput
                  style={styles.filterInput}
                  placeholder="Nombre del medicamento..."
                  value={tempFilters.medicamento}
                  onChangeText={(text) => setTempFilters(prev => ({ ...prev, medicamento: text }))}
                />
              </View>

              {/* Filtro por residencia */}
              <View style={styles.filterInputGroup}>
                <Text style={styles.filterLabel}>Residencia</Text>
                <TextInput
                  style={styles.filterInput}
                  placeholder="Lugar de residencia..."
                  value={tempFilters.residencia}
                  onChangeText={(text) => setTempFilters(prev => ({ ...prev, residencia: text }))}
                />
              </View>

              {/* Rango de fechas */}
              <Text style={styles.filterLabel}>Rango de fechas</Text>
              <View style={styles.dateRangeContainer}>
                <TouchableOpacity 
                  style={styles.dateButton}
                  onPress={() => setShowDatePicker('desde')}
                >
                  <Calendar color="#6B7280" size={16} />
                  <Text style={styles.dateButtonText}>
                    {tempFilters.fechaDesde || 'Desde'}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.dateSeparator}>—</Text>
                <TouchableOpacity 
                  style={styles.dateButton}
                  onPress={() => setShowDatePicker('hasta')}
                >
                  <Calendar color="#6B7280" size={16} />
                  <Text style={styles.dateButtonText}>
                    {tempFilters.fechaHasta || 'Hasta'}
                  </Text>
                </TouchableOpacity>
              </View>

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
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: '#6B7280',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1F2937',
    flex: 1,
    marginLeft: 10,
  },
  filterButton: {
    padding: 8,
    position: 'relative',
  },
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
  filterBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
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
  filterChipActive: {
    backgroundColor: '#7C3AED',
  },
  filterChipText: {
    color: '#4B5563',
    fontWeight: '500',
    fontSize: 13,
  },
  filterChipTextActive: {
    color: 'white',
  },
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
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#7C3AED',
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
    textAlign: 'center',
  },
  clearFiltersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
  },
  clearFiltersText: {
    fontSize: 12,
    color: '#6B7280',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    marginTop: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#374151',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 8,
    textAlign: 'center',
  },
  clearAllButton: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#7C3AED',
    borderRadius: 8,
  },
  clearAllButtonText: {
    color: 'white',
    fontWeight: '600',
  },
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
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardDate: {
    fontSize: 14,
    color: '#4B5563',
    fontWeight: '500',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeVinculado: {
    backgroundColor: '#7C3AED',
  },
  badgeHuerfano: {
    backgroundColor: '#6B7280',
  },
  badgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  cardBody: {
    padding: 16,
  },
  tipoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    padding: 8,
    backgroundColor: '#EDE9FE',
    borderRadius: 8,
    gap: 8,
  },
  tipoHuerfano: {
    backgroundColor: '#E5E7EB',
  },
  tipoText: {
    fontSize: 13,
    color: '#5B21B6',
    fontWeight: '600',
  },
  tipoHuerfanoText: {
    fontSize: 13,
    color: '#4B5563',
    fontWeight: '600',
  },
  destinoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  destinoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  destinoText: {
    fontSize: 14,
    color: '#4B5563',
    flex: 1,
  },
  pedidoInfoContainer: {
    backgroundColor: '#F3F4F6',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  pedidoInfoTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  pedidoInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  pedidoInfoLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 2,
  },
  pedidoInfoValue: {
    fontSize: 12,
    color: '#1F2937',
    fontWeight: '500',
    flex: 1,
  },
  itemsResume: {
    fontSize: 13,
    color: '#6B7280',
    fontStyle: 'italic',
    marginTop: 4,
  },
  itemsContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
  },
  itemsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 8,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
  },
  itemPresentation: {
    fontSize: 12,
    color: '#6B7280',
  },
  itemQuantity: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#7C3AED',
  },
  totalsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  totalItems: {
    fontSize: 12,
    color: '#6B7280',
  },
  totalUnidades: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1F2937',
  },
  // Modal de filtros
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
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  filterForm: {
    padding: 20,
  },
  filterInputGroup: {
    marginBottom: 20,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  filterInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
  },
  dateRangeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 24,
  },
  dateButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  dateButtonText: {
    fontSize: 14,
    color: '#1F2937',
  },
  dateSeparator: {
    fontSize: 14,
    color: '#6B7280',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
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
  applyButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});