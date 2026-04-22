// src/screens/PedidosScreen.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  RefreshControl, // ✅ IMPORTANTE: Agregar RefreshControl
} from 'react-native';
import {
  Package,
  Calendar,
  MapPin,
  Phone,
  CheckCircle,
  XCircle,
  X,
  Plus,
  Search,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Trash2,
  Pill,
  MinusCircle,
  User,
  CheckSquare,
  Square,
} from 'lucide-react-native';
import { pb } from '../services/PocketBaseConfig';
import { sendLocalNotification } from '../services/NotificationService';
import { useRoute } from '@react-navigation/native';

export default function PedidosScreen({ user }) {
  const [pedidos, setPedidos] = useState([]);
  const [entregas, setEntregas] = useState([]);
  const [medicamentos, setMedicamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showAtenderModal, setShowAtenderModal] = useState(false);
  const [selectedPedido, setSelectedPedido] = useState(null);
  const [selectedEntregasIds, setSelectedEntregasIds] = useState([]);
  const [filter, setFilter] = useState('pendientes');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    nombreSolicitante: '',
    lugarResidencia: '',
    telefonoContacto: '',
    notas: '',
    medicamentosSolicitados: [],
  });
  const [showMedicamentoModal, setShowMedicamentoModal] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [medicamentosFiltrados, setMedicamentosFiltrados] = useState([]);
  const [seleccionTemporal, setSeleccionTemporal] = useState([]);
  const [cantidades, setCantidades] = useState({});
  const [zoomModalVisible, setZoomModalVisible] = useState(false);
  const [zoomImage, setZoomImage] = useState(null);
  const [zoomMedName, setZoomMedName] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const route = useRoute();
  const filterSolicitante = route.params?.filterSolicitante;

  useEffect(() => {
    if (filterSolicitante) {
      setSearchTerm(filterSolicitante);
      navigation.setParams({ filterSolicitante: null });
    }
  }, []);

  // Refs para evitar cargas duplicadas y manejar suscripciones
  const isLoadingRef = useRef(false);
  const subscriptionsRef = useRef([]);

  const getUserName = () => user?.nombre || 'usuario';

  // ── Función de carga principal ──
  const loadData = useCallback(async (isRefresh = false) => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;

    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [pedidosResult, entregasResult, medicamentosResult] = await Promise.all([
        pb.collection('pedidos').getList(1, 100, { sort: '-fechaPedido', requestKey: null }),
        pb.collection('entregas').getList(1, 100, { sort: '-fechaCreacion', requestKey: null }),
        pb
          .collection('medicamentos')
          .getList(1, 500, { filter: 'activo = true', sort: 'nombre', requestKey: null }),
      ]);
      setPedidos(pedidosResult.items);
      setEntregas(entregasResult.items);
      setMedicamentos(medicamentosResult.items);
    } catch (error) {
      if (!error.isAbort) {
        console.error('Error cargando datos:', error);
        Alert.alert('Error', 'No se pudieron cargar los datos');
      }
    } finally {
      isLoadingRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // ── Realtime subscriptions (CORREGIDO) ──
  const setupRealtimeSubscriptions = useCallback(() => {
    // Limpiar suscripciones anteriores ✅ CORREGIDO
    subscriptionsRef.current.forEach((sub) => {
      if (sub && typeof sub.unsubscribe === 'function') {
        sub.unsubscribe();
      }
    });
    subscriptionsRef.current = [];

    // Suscribirse a cambios en pedidos
    const pedidosSub = pb.collection('pedidos').subscribe('*', (e) => {
      console.log('🔄 Cambio en pedidos:', e.action, e.record?.id);

      if (e.action === 'create') {
        setPedidos((prev) => [e.record, ...prev]);
      } else if (e.action === 'update') {
        setPedidos((prev) => prev.map((p) => (p.id === e.record.id ? e.record : p)));
      } else if (e.action === 'delete') {
        setPedidos((prev) => prev.filter((p) => p.id !== e.record.id));
      }
    });

    // Suscribirse a cambios en entregas
    const entregasSub = pb.collection('entregas').subscribe('*', (e) => {
      console.log('🔄 Cambio en entregas:', e.action, e.record?.id);

      if (e.action === 'create') {
        setEntregas((prev) => [e.record, ...prev]);
      } else if (e.action === 'update') {
        setEntregas((prev) => prev.map((e2) => (e2.id === e.record.id ? e.record : e2)));
      } else if (e.action === 'delete') {
        setEntregas((prev) => prev.filter((e2) => e2.id !== e.record.id));
      }
    });

    // Suscribirse a cambios en medicamentos
    const medicamentosSub = pb.collection('medicamentos').subscribe('*', (e) => {
      console.log('🔄 Cambio en medicamentos:', e.action);
      if (e.action === 'update' || e.action === 'create') {
        loadData();
      }
    });

    // Guardar las suscripciones (objetos con método unsubscribe)
    subscriptionsRef.current = [pedidosSub, entregasSub, medicamentosSub];
  }, [loadData]);

  // Cargar datos iniciales y setup realtime
  useEffect(() => {
    loadData();
    setupRealtimeSubscriptions();

    return () => {
      // Limpiar suscripciones al desmontar ✅ CORREGIDO
      subscriptionsRef.current.forEach((sub) => {
        if (sub && typeof sub.unsubscribe === 'function') {
          sub.unsubscribe();
        }
      });
    };
  }, [loadData, setupRealtimeSubscriptions]);

  const onRefresh = useCallback(() => loadData(true), [loadData]);

  // El resto del código permanece igual (buscarMedicamentos, actualizarCantidad, etc.)
  const buscarMedicamentos = (texto) => {
    if (!texto.trim()) {
      setMedicamentosFiltrados([]);
      return;
    }
    const textoLower = texto.toLowerCase().trim();
    const filtrados = medicamentos.filter(
      (m) =>
        m.nombre.toLowerCase().includes(textoLower) ||
        (m.presentacion || '').toLowerCase().includes(textoLower)
    );
    setMedicamentosFiltrados(filtrados);
  };

  const actualizarCantidad = (medicamentoId, texto) => {
    setCantidades((prev) => ({ ...prev, [medicamentoId]: texto }));
  };

  const agregarASeleccion = (medicamento) => {
    const cantidad = parseInt(cantidades[medicamento.id]);
    if (!cantidad || cantidad <= 0) {
      Alert.alert('Error', 'Ingresa una cantidad válida');
      return;
    }
    if (seleccionTemporal.find((s) => s.medicamentoId === medicamento.id)) {
      Alert.alert('Error', 'Este medicamento ya está en la lista.');
      return;
    }
    if (cantidad > medicamento.cantidad) {
      Alert.alert('Error', `Stock insuficiente. Disponible: ${medicamento.cantidad} unidades`);
      return;
    }

    const nuevoItem = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
      nombre: medicamento.nombre,
      presentacion: medicamento.presentacion || 'No especificada',
      cantidad: cantidad,
      medicamentoId: medicamento.id,
      ubicacion: medicamento.ubicacion || '',
    };

    setSeleccionTemporal([...seleccionTemporal, nuevoItem]);
    setCantidades((prev) => {
      const newCantidades = { ...prev };
      delete newCantidades[medicamento.id];
      return newCantidades;
    });
  };

  const eliminarDeSeleccion = (id) => {
    setSeleccionTemporal(seleccionTemporal.filter((s) => s.id !== id));
  };

  const confirmarSeleccion = () => {
    if (seleccionTemporal.length === 0) {
      Alert.alert('Error', 'No has seleccionado ningún medicamento');
      return;
    }
    setFormData({
      ...formData,
      medicamentosSolicitados: [...formData.medicamentosSolicitados, ...seleccionTemporal],
    });
    setSeleccionTemporal([]);
    setCantidades({});
    setShowMedicamentoModal(false);
  };

  const eliminarMedicamentoDelPedido = (index) => {
    const nuevosMedicamentos = [...formData.medicamentosSolicitados];
    nuevosMedicamentos.splice(index, 1);
    setFormData({ ...formData, medicamentosSolicitados: nuevosMedicamentos });
  };

  const handleCreatePedido = async () => {
    if (isSubmitting) return;
    if (!formData.nombreSolicitante) {
      Alert.alert('Error', 'El nombre del solicitante es obligatorio');
      return;
    }
    if (formData.medicamentosSolicitados.length === 0) {
      Alert.alert('Error', 'Debes agregar al menos un medicamento');
      return;
    }

    setIsSubmitting(true);

    const medicamentosLimpios = formData.medicamentosSolicitados.map((med) => {
      const { id, ...medLimpio } = med;
      return medLimpio;
    });

    const pedidoData = {
      nombreSolicitante: formData.nombreSolicitante.trim(),
      lugarResidencia: formData.lugarResidencia.trim() || '',
      telefonoContacto: formData.telefonoContacto.trim() || '',
      notas: formData.notas.trim() || '',
      medicamentosSolicitados: medicamentosLimpios,
      atendido: false,
      entregasRealizadas: [],
      fechaPedido: new Date().toISOString(),
      fechaAtencion: null,
      creadoPor: getUserName(),
      atendidoPor: '',
    };

    try {
      await pb.collection('pedidos').create(pedidoData);
      await sendLocalNotification(
        '📋 Nuevo Pedido',
        `${formData.nombreSolicitante} ha solicitado ${formData.medicamentosSolicitados.length} medicamento(s)`
      );
      setFormData({
        nombreSolicitante: '',
        lugarResidencia: '',
        telefonoContacto: '',
        notas: '',
        medicamentosSolicitados: [],
      });
      setShowForm(false);
      Alert.alert('Éxito', 'Pedido registrado correctamente');
    } catch (error) {
      console.error('❌ Error:', error);
      Alert.alert('Error', `No se pudo crear el pedido: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const eliminarPedido = (pedidoId, nombreSolicitante) => {
    Alert.alert('Eliminar Pedido', `¿Estás seguro de eliminar el pedido de ${nombreSolicitante}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await pb.collection('pedidos').delete(pedidoId);
            Alert.alert('Éxito', 'Pedido eliminado correctamente');
          } catch (error) {
            Alert.alert('Error', 'No se pudo eliminar el pedido');
          }
        },
      },
    ]);
  };

  const getEntregasDisponibles = () => {
    return entregas.filter((e) => !e.pedidoId && e.estado === 'abierta' && e.items?.length > 0);
  };

  const toggleSeleccionEntrega = (entregaId) => {
    setSelectedEntregasIds((prev) =>
      prev.includes(entregaId) ? prev.filter((id) => id !== entregaId) : [...prev, entregaId]
    );
  };

  const handleAsignarEntregas = async () => {
    if (!selectedPedido) return;
    if (selectedEntregasIds.length === 0) {
      Alert.alert('Error', 'Selecciona al menos una entrega');
      return;
    }

    try {
      const nuevasEntregas = [];
      for (const entregaId of selectedEntregasIds) {
        const entrega = entregas.find((e) => e.id === entregaId);
        if (!entrega) continue;

        await pb.collection('entregas').update(entregaId, {
          pedidoId: selectedPedido.id,
          vinculadaEn: new Date().toISOString(),
          vinculadaPor: getUserName(),
          estado: 'cerrada',
        });

        nuevasEntregas.push({
          entregaId: entregaId,
          fecha: new Date().toISOString(),
          items: entrega.items || [],
          destino: entrega.destino,
          realizadoPor: getUserName(),
        });
      }

      const entregasActuales = selectedPedido.entregasRealizadas || [];
      await pb.collection('pedidos').update(selectedPedido.id, {
        entregasRealizadas: [...entregasActuales, ...nuevasEntregas],
        atendido: true,
        fechaAtencion: new Date().toISOString(),
        atendidoPor: getUserName(),
      });

      setShowAtenderModal(false);
      setSelectedPedido(null);
      setSelectedEntregasIds([]);
      Alert.alert('Éxito', `Pedido atendido con ${nuevasEntregas.length} entrega(s)`);
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Error', 'No se pudo actualizar el pedido');
    }
  };

  const getFilteredPedidos = () => {
    let filtered = pedidos;
    if (searchTerm) {
      filtered = filtered.filter(
        (p) =>
          p.nombreSolicitante?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.medicamentosSolicitados?.some((m) =>
            m.nombre.toLowerCase().includes(searchTerm.toLowerCase())
          ) ||
          p.lugarResidencia?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    switch (filter) {
      case 'pendientes':
        return filtered.filter((p) => !p.atendido);
      case 'atendidos':
        return filtered.filter((p) => p.atendido);
      default:
        return filtered;
    }
  };

  const getTotalEntregadosCount = (pedido) => {
    if (!pedido.entregasRealizadas) return 0;
    return pedido.entregasRealizadas.reduce((total, entrega) => {
      return total + (entrega.items?.length || 0);
    }, 0);
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

  const getMedicamentoEnPedidoStatus = (medicamentoEnPedido) => {
    if (!medicamentoEnPedido.medicamentoId) {
      return { activo: true, mensaje: 'Medicamento externo' };
    }
    const med = medicamentos.find((m) => m.id === medicamentoEnPedido.medicamentoId);
    if (!med) return { activo: false, mensaje: 'No encontrado' };
    return {
      activo: med.activo !== false,
      mensaje: med.activo === false ? 'Inactivo' : 'Activo',
      ubicacion: med.ubicacion || '',
    };
  };

  const openZoomModal = (imageUri, medName) => {
    if (!imageUri) return;
    setZoomImage(`data:image/jpeg;base64,${imageUri}`);
    setZoomMedName(medName);
    setZoomModalVisible(true);
  };

  const abrirModalMedicamentos = () => {
    setSeleccionTemporal([]);
    setBusqueda('');
    setCantidades({});
    setMedicamentosFiltrados([]);
    setShowMedicamentoModal(true);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size={50} color="#7C3AED" />
        <Text style={styles.loadingText}>Cargando pedidos...</Text>
      </View>
    );
  }

  const filteredPedidos = getFilteredPedidos();
  const pendientesCount = pedidos.filter((p) => !p.atendido).length;
  const atendidosCount = pedidos.filter((p) => p.atendido).length;
  const entregasDisponibles = getEntregasDisponibles();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <ClipboardList color="#7C3AED" size={28} />
        <Text style={styles.title}>Gestión de Pedidos</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setShowForm(true)}>
          <Plus color="white" size={20} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Search color="#9CA3AF" size={20} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar..."
            placeholderTextColor="#9CA3AF"
            value={searchTerm}
            onChangeText={setSearchTerm}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersScroll}>
          <TouchableOpacity
            style={[styles.filterChip, filter === 'todos' && styles.filterChipActive]}
            onPress={() => setFilter('todos')}
          >
            <Text
              style={[styles.filterChipText, filter === 'todos' && styles.filterChipTextActive]}
            >
              Todos ({pedidos.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filter === 'pendientes' && styles.filterChipActive]}
            onPress={() => setFilter('pendientes')}
          >
            <Text
              style={[
                styles.filterChipText,
                filter === 'pendientes' && styles.filterChipTextActive,
              ]}
            >
              Pendientes ({pendientesCount})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filter === 'atendidos' && styles.filterChipActive]}
            onPress={() => setFilter('atendidos')}
          >
            <Text
              style={[styles.filterChipText, filter === 'atendidos' && styles.filterChipTextActive]}
            >
              Atendidos ({atendidosCount})
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {filteredPedidos.length === 0 ? (
          <View style={styles.emptyContainer}>
            <ClipboardList color="#D1D5DB" size={64} />
            <Text style={styles.emptyTitle}>No hay pedidos</Text>
          </View>
        ) : (
          filteredPedidos.map((pedido) => (
            <View key={pedido.id} style={styles.pedidoCard}>
              <TouchableOpacity
                style={styles.pedidoHeader}
                onPress={() => setExpandedId(expandedId === pedido.id ? null : pedido.id)}
              >
                <View style={styles.pedidoHeaderLeft}>
                  <View
                    style={[
                      styles.statusDot,
                      pedido.atendido ? styles.atendidoDot : styles.pendienteDot,
                    ]}
                  />
                  <View>
                    <Text style={styles.pedidoNombre}>{pedido.nombreSolicitante}</Text>
                    {pedido.notas ? (
                      <Text style={styles.pedidoNotas} numberOfLines={1}>
                        📝 {pedido.notas}
                      </Text>
                    ) : null}
                    <Text style={styles.pedidoMedicamentos}>
                      {pedido.medicamentosSolicitados?.length || 0} solicitados |{' '}
                      {getTotalEntregadosCount(pedido)} entregados
                    </Text>
                  </View>
                </View>
                <View style={styles.pedidoHeaderRight}>
                  {!pedido.atendido && (
                    <TouchableOpacity
                      onPress={() => eliminarPedido(pedido.id, pedido.nombreSolicitante)}
                    >
                      <Trash2 color="#DC2626" size={20} />
                    </TouchableOpacity>
                  )}
                  {expandedId === pedido.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </View>
              </TouchableOpacity>

              {expandedId === pedido.id && (
                <View style={styles.pedidoDetails}>
                  <View style={styles.detailRow}>
                    <Calendar size={16} color="#6B7280" />
                    <Text style={styles.detailText}>{formatDate(pedido.fechaPedido)}</Text>
                  </View>
                  {pedido.lugarResidencia && (
                    <View style={styles.detailRow}>
                      <MapPin size={16} color="#6B7280" />
                      <Text style={styles.detailText}>{pedido.lugarResidencia}</Text>
                    </View>
                  )}
                  {pedido.telefonoContacto && (
                    <View style={styles.detailRow}>
                      <Phone size={16} color="#6B7280" />
                      <Text style={styles.detailText}>{pedido.telefonoContacto}</Text>
                    </View>
                  )}

                  <View style={styles.medicamentosEntregadosContainer}>
                    <Text style={styles.medicamentosEntregadosTitle}>
                      Medicamentos solicitados:
                    </Text>
                    {pedido.medicamentosSolicitados?.map((med, idx) => {
                      const status = getMedicamentoEnPedidoStatus(med);
                      return (
                        <View key={idx} style={styles.medicamentoEntregadoItem}>
                          <Pill size={12} color="#7C3AED" />
                          <Text style={styles.medicamentoEntregadoNombre}>
                            {med.nombre} x{med.cantidad}
                            {status.ubicacion && ` 📍 ${status.ubicacion}`}
                          </Text>
                        </View>
                      );
                    })}
                  </View>

                  {pedido.entregasRealizadas && pedido.entregasRealizadas.length > 0 && (
                    <View style={styles.medicamentosEntregadosContainer}>
                      <Text style={styles.medicamentosEntregadosTitle}>
                        Medicamentos entregados:
                      </Text>
                      {pedido.entregasRealizadas.map((entrega, idx) => (
                        <View key={idx} style={styles.entregaRealizadaItem}>
                          <Text style={styles.entregaFecha}>📅 {formatDate(entrega.fecha)}</Text>
                          <Text style={styles.entregaDestino}>
                            📍 Destino: {entrega.destino || pedido.nombreSolicitante}
                          </Text>
                          <Text style={styles.entregaUsuario}>
                            👤 Entregado por: {entrega.realizadoPor || 'usuario'}
                          </Text>
                          {entrega.items?.map((item, itemIdx) => (
                            <View key={itemIdx} style={styles.medicamentoEntregadoItem}>
                              <Pill size={12} color="#10B981" />
                              <Text style={styles.medicamentoEntregadoNombre}>
                                {item.nombre} x{item.cantidad || 1}
                                {item.ubicacion && ` 📍 ${item.ubicacion}`}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ))}
                    </View>
                  )}

                  {!pedido.atendido && (
                    <TouchableOpacity
                      style={styles.atenderButton}
                      onPress={() => {
                        if (entregasDisponibles.length === 0) {
                          Alert.alert('Sin entregas', 'NO HAY ENTREGAS ABIERTAS PARA VINCULAR');
                          return;
                        }
                        setSelectedPedido(pedido);
                        setSelectedEntregasIds([]);
                        setShowAtenderModal(true);
                      }}
                    >
                      <CheckCircle color="white" size={20} />
                      <Text style={{ color: 'white', fontWeight: '600' }}>
                        Marcar como Atendido
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>

      {/* Modales - mantienen el mismo código (omitido por brevedad, pero igual al anterior) */}
      <Modal
        visible={showForm}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowForm(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
          >
            <ScrollView
              style={styles.modalContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Nuevo Pedido</Text>
                <TouchableOpacity onPress={() => setShowForm(false)}>
                  <XCircle size={24} color="#6B7280" />
                </TouchableOpacity>
              </View>
              <View style={styles.modalBody}>
                <Text style={styles.label}>Nombre del solicitante *</Text>
                <TextInput
                  placeholder="Ej: Juan Pérez"
                  placeholderTextColor="#9CA3AF"
                  style={styles.input}
                  value={formData.nombreSolicitante}
                  onChangeText={(t) => setFormData({ ...formData, nombreSolicitante: t })}
                />
                <Text style={styles.label}>Lugar de residencia</Text>
                <TextInput
                  placeholder="Ej: Colonia Centro"
                  placeholderTextColor="#9CA3AF"
                  style={styles.input}
                  value={formData.lugarResidencia}
                  onChangeText={(t) => setFormData({ ...formData, lugarResidencia: t })}
                />
                <Text style={styles.label}>Teléfono</Text>
                <TextInput
                  placeholder="Ej: 1234-5678"
                  placeholderTextColor="#9CA3AF"
                  style={styles.input}
                  keyboardType="phone-pad"
                  value={formData.telefonoContacto}
                  onChangeText={(t) => setFormData({ ...formData, telefonoContacto: t })}
                />
                <View style={styles.medicamentosSection}>
                  <Text style={styles.sectionLabel}>Medicamentos *</Text>
                  {formData.medicamentosSolicitados.map((med, idx) => (
                    <View key={med.id} style={styles.medicamentoAgregado}>
                      <View>
                        <Text style={styles.medicamentoAgregadoNombre}>{med.nombre}</Text>
                        <Text style={styles.medicamentoAgregadoCantidad}>x{med.cantidad}</Text>
                        {med.ubicacion && (
                          <Text style={styles.ubicacionTexto}>📍 {med.ubicacion}</Text>
                        )}
                      </View>
                      <TouchableOpacity onPress={() => eliminarMedicamentoDelPedido(idx)}>
                        <Trash2 size={18} color="#DC2626" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity
                    style={styles.agregarMedicamentoButton}
                    onPress={abrirModalMedicamentos}
                  >
                    <Plus size={20} color="#7C3AED" />
                    <Text style={{ color: '#7C3AED' }}>Agregar medicamentos</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.label}>Notas</Text>
                <TextInput
                  placeholder="Notas internas"
                  placeholderTextColor="#9CA3AF"
                  style={[styles.input, styles.textArea]}
                  multiline
                  value={formData.notas}
                  onChangeText={(t) => setFormData({ ...formData, notas: t })}
                />
                <TouchableOpacity
                  style={[
                    styles.saveButton,
                    (formData.medicamentosSolicitados.length === 0 || isSubmitting) &&
                      styles.saveButtonDisabled,
                  ]}
                  onPress={handleCreatePedido}
                  disabled={formData.medicamentosSolicitados.length === 0 || isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="white" size="small" />
                  ) : (
                    <Text style={styles.saveButtonText}>Crear Pedido</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={showMedicamentoModal} animationType="slide" transparent={false}>
        <View style={styles.fullModalContainer}>
          <View style={styles.fullModalHeader}>
            <Text style={styles.fullModalTitle}>Seleccionar Medicamentos</Text>
            <TouchableOpacity
              onPress={() => {
                setSeleccionTemporal([]);
                setShowMedicamentoModal(false);
                setCantidades({});
                setMedicamentosFiltrados([]);
              }}
            >
              <XCircle size={28} color="white" />
            </TouchableOpacity>
          </View>
          <View style={styles.searchInputContainerFull}>
            <Search size={20} color="#9CA3AF" />
            <TextInput
              style={styles.searchInputFull}
              placeholder="Buscar..."
              placeholderTextColor="#9CA3AF"
              value={busqueda}
              onChangeText={(text) => {
                setBusqueda(text);
                buscarMedicamentos(text);
              }}
            />
          </View>
          <FlatList
            data={medicamentosFiltrados}
            keyExtractor={(item) => item.id}
            style={styles.flatList}
            renderItem={({ item }) => (
              <View style={styles.medicamentoItemSeleccion}>
                {item.imagen ? (
                  <TouchableOpacity onPress={() => openZoomModal(item.imagen, item.nombre)}>
                    <Image
                      source={{ uri: `data:image/jpeg;base64,${item.imagen}` }}
                      style={styles.medImageThumb}
                    />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.medImagePlaceholder}>
                    <Package color="#9CA3AF" size={24} />
                  </View>
                )}
                <View style={styles.medicamentoInfoSeleccion}>
                  <Text style={styles.medicamentoNombreSeleccion} numberOfLines={2}>
                    {item.nombre}
                  </Text>
                  <Text style={styles.medicamentoPresentacionSeleccion} numberOfLines={1}>
                    {item.presentacion}
                  </Text>
                  <Text style={styles.medicamentoStockSeleccion}>Stock: {item.cantidad} uds</Text>
                  {item.ubicacion && (
                    <Text style={styles.medicamentoUbicacionSeleccion} numberOfLines={1}>
                      📍 {item.ubicacion}
                    </Text>
                  )}
                </View>
                <View style={styles.seleccionCantidadContainer}>
                  <TextInput
                    style={styles.cantidadInputSeleccion}
                    placeholder="Cant"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="numeric"
                    value={cantidades[item.id] || ''}
                    onChangeText={(text) => actualizarCantidad(item.id, text)}
                  />
                  <TouchableOpacity
                    style={styles.agregarSeleccionButton}
                    onPress={() => agregarASeleccion(item)}
                  >
                    <Plus color="white" size={18} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyListContainer}>
                <Package color="#D1D5DB" size={48} />
                <Text style={styles.emptyListText}>
                  {busqueda
                    ? 'No se encontraron medicamentos'
                    : 'Busca un medicamento para agregar'}
                </Text>
              </View>
            }
          />
          {seleccionTemporal.length > 0 && (
            <View style={styles.seleccionPreviewContainer}>
              <Text style={styles.seleccionPreviewTitle}>Seleccionados:</Text>
              {seleccionTemporal.map((item) => (
                <View key={item.id} style={styles.seleccionPreviewItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.seleccionPreviewName}>
                      {item.nombre} x{item.cantidad}
                    </Text>
                    {item.ubicacion && (
                      <Text style={styles.seleccionPreviewUbicacion}>📍 {item.ubicacion}</Text>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => eliminarDeSeleccion(item.id)}>
                    <MinusCircle color="#DC2626" size={20} />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                style={styles.confirmarSeleccionButton}
                onPress={confirmarSeleccion}
              >
                <Text style={styles.confirmarSeleccionButtonText}>
                  Confirmar ({seleccionTemporal.length})
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      <Modal visible={showAtenderModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentLarge}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Atender Pedido con Entregas</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowAtenderModal(false);
                  setSelectedEntregasIds([]);
                }}
              >
                <XCircle size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBodyScroll}>
              {entregasDisponibles.length === 0 ? (
                <View style={styles.emptyEntregasContainer}>
                  <Package color="#D1D5DB" size={48} />
                  <Text style={styles.emptyEntregasText}>
                    NO HAY ENTREGAS ABIERTAS PARA VINCULAR
                  </Text>
                  <Text style={styles.emptyEntregasSubtext}>
                    Las entregas realizadas sin pedido aparecerán aquí
                  </Text>
                </View>
              ) : (
                <>
                  {entregasDisponibles.map((entrega) => {
                    const isSelected = selectedEntregasIds.includes(entrega.id);
                    return (
                      <TouchableOpacity
                        key={entrega.id}
                        style={[
                          styles.entregaOptionCard,
                          isSelected && styles.entregaOptionSelected,
                        ]}
                        onPress={() => toggleSeleccionEntrega(entrega.id)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.entregaOptionHeader}>
                          {isSelected ? (
                            <CheckSquare size={22} color="#7C3AED" />
                          ) : (
                            <Square size={22} color="#9CA3AF" />
                          )}
                          <Text style={styles.entregaOptionFecha}>
                            📅 {formatDate(entrega.fechaCreacion)}
                          </Text>
                        </View>
                        <View style={styles.entregaOptionDestinoContainer}>
                          <Text style={styles.entregaOptionDestinoLabel}>Destino:</Text>
                          <Text style={styles.entregaOptionDestinoValue}>{entrega.destino}</Text>
                        </View>
                        <Text style={styles.entregaOptionCreadoPor}>
                          👤 Creado por: {entrega.creadoPor || 'usuario'}
                        </Text>
                        <View style={styles.entregaOptionItemsHeader}>
                          <Text style={styles.entregaOptionItemsTitle}>Medicamentos:</Text>
                        </View>
                        {entrega.items?.map((item, idx) => (
                          <View key={idx} style={styles.entregaOptionItem}>
                            <Pill size={14} color="#7C3AED" />
                            <View style={{ flex: 1 }}>
                              <Text style={styles.entregaOptionItemName}>{item.nombre}</Text>
                              {item.presentacion && (
                                <Text style={styles.entregaOptionItemPresentacion}>
                                  {item.presentacion}
                                </Text>
                              )}
                            </View>
                            <Text style={styles.entregaOptionItemCantidad}>
                              x{item.cantidad || 1}
                            </Text>
                          </View>
                        ))}
                      </TouchableOpacity>
                    );
                  })}
                  <TouchableOpacity
                    style={[
                      styles.asignarButton,
                      selectedEntregasIds.length === 0 && styles.asignarButtonDisabled,
                    ]}
                    onPress={handleAsignarEntregas}
                    disabled={selectedEntregasIds.length === 0}
                  >
                    <CheckCircle color="white" size={20} />
                    <Text style={styles.asignarButtonText}>
                      ASIGNAR ({selectedEntregasIds.length} entrega
                      {selectedEntregasIds.length !== 1 ? 's' : ''})
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={zoomModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setZoomModalVisible(false)}
      >
        <View style={styles.zoomModalContainer}>
          <View style={styles.zoomModalHeader}>
            <Text style={styles.zoomModalTitle}>{zoomMedName}</Text>
            <TouchableOpacity onPress={() => setZoomModalVisible(false)}>
              <X color="white" size={24} />
            </TouchableOpacity>
          </View>
          <Image source={{ uri: zoomImage }} style={styles.zoomModalImage} resizeMode="contain" />
        </View>
      </Modal>
    </View>
  );
}

// Styles (igual que antes - omitido por brevedad, mantén los que ya tenías)
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, color: '#6B7280' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'white',
    padding: 20,
  },
  title: { fontSize: 20, fontWeight: 'bold', color: '#1F2937', flex: 1, marginLeft: 10 },
  addButton: {
    backgroundColor: '#7C3AED',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: { backgroundColor: 'white', padding: 16 },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 16, color: '#1F2937' },
  filtersScroll: { flexDirection: 'row' },
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
  emptyContainer: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#374151', marginTop: 16 },
  pedidoCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 12,
    elevation: 2,
    overflow: 'hidden',
  },
  pedidoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  pedidoHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  pedidoHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  pendienteDot: { backgroundColor: '#F59E0B' },
  atendidoDot: { backgroundColor: '#10B981' },
  pedidoNombre: { fontSize: 16, fontWeight: 'bold', color: '#1F2937' },
  pedidoNotas: { fontSize: 11, color: '#6B7280', fontStyle: 'italic', marginTop: 2 },
  pedidoMedicamentos: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  pedidoDetails: { padding: 16, paddingTop: 0, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  detailText: { fontSize: 14, color: '#4B5563', flex: 1 },
  medicamentosEntregadosContainer: {
    marginVertical: 8,
    padding: 8,
    backgroundColor: '#D1FAE5',
    borderRadius: 8,
  },
  medicamentosEntregadosTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#065F46',
    marginBottom: 6,
  },
  entregaRealizadaItem: {
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#A7F3D0',
  },
  entregaFecha: { fontSize: 11, color: '#065F46', marginBottom: 2 },
  entregaDestino: { fontSize: 11, color: '#065F46', marginBottom: 2 },
  entregaUsuario: { fontSize: 11, color: '#7C3AED', marginBottom: 4, fontStyle: 'italic' },
  medicamentoEntregadoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  medicamentoEntregadoNombre: { fontSize: 12, color: '#065F46' },
  atenderButton: {
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    gap: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: { backgroundColor: 'white', borderRadius: 20, width: '90%', maxHeight: '80%' },
  modalContentLarge: { backgroundColor: 'white', borderRadius: 20, width: '90%', maxHeight: '80%' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1F2937' },
  modalBody: { padding: 20 },
  modalBodyScroll: { maxHeight: '80%' },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 5 },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
    color: '#1F2937',
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  medicamentosSection: {
    marginBottom: 20,
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
  },
  medicamentoAgregado: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  medicamentoAgregadoNombre: { fontSize: 14, fontWeight: '500', color: '#1F2937' },
  medicamentoAgregadoCantidad: { fontSize: 12, color: '#7C3AED' },
  ubicacionTexto: { fontSize: 11, color: '#10B981', marginTop: 2 },
  agregarMedicamentoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: '#EDE9FE',
    borderRadius: 8,
    gap: 8,
    marginTop: 8,
  },
  saveButton: {
    backgroundColor: '#7C3AED',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  entregaOptionCard: {
    backgroundColor: '#F9FAFB',
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  entregaOptionSelected: { backgroundColor: '#EDE9FE', borderColor: '#7C3AED', borderWidth: 2 },
  entregaOptionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  entregaOptionFecha: { fontSize: 14, fontWeight: '600', color: '#7C3AED', flex: 1 },
  entregaOptionDestinoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  entregaOptionDestinoLabel: { fontSize: 12, fontWeight: '600', color: '#374151' },
  entregaOptionDestinoValue: { fontSize: 12, color: '#10B981', fontWeight: '500' },
  entregaOptionCreadoPor: { fontSize: 11, color: '#6B7280', marginBottom: 12, fontStyle: 'italic' },
  entregaOptionItemsHeader: { marginTop: 8, marginBottom: 4 },
  entregaOptionItemsTitle: { fontSize: 12, fontWeight: '600', color: '#374151' },
  entregaOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  entregaOptionItemName: { fontSize: 14, fontWeight: '500', color: '#1F2937', flex: 1 },
  entregaOptionItemPresentacion: { fontSize: 11, color: '#6B7280' },
  entregaOptionItemCantidad: { fontSize: 14, fontWeight: 'bold', color: '#7C3AED' },
  asignarButton: {
    backgroundColor: '#7C3AED',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    margin: 16,
    gap: 8,
  },
  asignarButtonDisabled: { backgroundColor: '#9CA3AF' },
  asignarButtonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  emptyEntregasContainer: { alignItems: 'center', padding: 40 },
  emptyEntregasText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#DC2626',
    marginTop: 16,
    textAlign: 'center',
  },
  emptyEntregasSubtext: { fontSize: 12, color: '#9CA3AF', marginTop: 8, textAlign: 'center' },
  fullModalContainer: { flex: 1, backgroundColor: 'white' },
  fullModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: '#7C3AED',
    paddingTop: 50,
  },
  fullModalTitle: { fontSize: 20, fontWeight: 'bold', color: 'white' },
  searchInputContainerFull: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 16,
    margin: 16,
  },
  searchInputFull: { flex: 1, paddingVertical: 12, fontSize: 16, marginLeft: 8, color: '#1F2937' },
  flatList: { flex: 1 },
  medicamentoItemSeleccion: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 12,
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 8,
  },
  medicamentoInfoSeleccion: { flex: 1, flexShrink: 1 },
  medicamentoNombreSeleccion: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 2,
  },
  medicamentoPresentacionSeleccion: { fontSize: 11, color: '#6B7280', marginBottom: 2 },
  medicamentoStockSeleccion: { fontSize: 11, color: '#10B981', marginBottom: 2 },
  medicamentoUbicacionSeleccion: { fontSize: 10, color: '#6B7280' },
  seleccionCantidadContainer: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  cantidadInputSeleccion: {
    width: 60,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
    fontSize: 14,
    textAlign: 'center',
    color: '#1F2937',
  },
  agregarSeleccionButton: {
    backgroundColor: '#7C3AED',
    padding: 8,
    borderRadius: 8,
    minWidth: 36,
    alignItems: 'center',
  },
  medImageThumb: { width: 50, height: 50, borderRadius: 8, marginRight: 12 },
  medImagePlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyListContainer: { alignItems: 'center', padding: 40 },
  emptyListText: { fontSize: 14, color: '#9CA3AF', marginTop: 8 },
  seleccionPreviewContainer: { padding: 16, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  seleccionPreviewTitle: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  seleccionPreviewItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  seleccionPreviewName: { fontSize: 13, color: '#1F2937' },
  seleccionPreviewUbicacion: { fontSize: 10, color: '#10B981' },
  confirmarSeleccionButton: {
    backgroundColor: '#10B981',
    padding: 16,
    borderRadius: 12,
    marginTop: 12,
    alignItems: 'center',
  },
  confirmarSeleccionButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  zoomModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomModalHeader: {
    position: 'absolute',
    top: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  zoomModalTitle: { color: 'white', fontSize: 16, fontWeight: 'bold', flex: 1 },
  zoomModalImage: { width: '100%', height: '80%' },
});
