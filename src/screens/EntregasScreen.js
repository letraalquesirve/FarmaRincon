// src/screens/EntregasScreen.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  FlatList,
  RefreshControl,
  Switch,
} from 'react-native';
import {
  MinusCircle,
  Plus,
  Search,
  Package,
  X,
  XCircle,
  CheckCircle,
  Trash2,
  Pill,
  Calendar,
  User,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { sendLocalNotification } from '../services/NotificationService';
import { notificarSeguimientoEntrega } from '../services/AdminNotificationService';
import {
  entregasList,
  entregaGetOne,
  entregaCreate,
  entregaUpdate,
  entregaDelete,
  medicamentosList,
  medicamentoUpdate,
  historyCreate,
  pedidoGetOne,
  pedidoUpdate,
} from '../services/LocalDataService';

export default function EntregasScreen({ user }) {
  const isUserAdmin = user?.tipo === 'admin';
  const [entregas, setEntregas] = useState([]);
  const [medicamentos, setMedicamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [filter, setFilter] = useState('todas');
  const [searchTerm, setSearchTerm] = useState('');

  const [destino, setDestino] = useState('');
  const [notas, setNotas] = useState('');
  const [medicamentosSeleccionados, setMedicamentosSeleccionados] = useState([]);

  const [showSelectMedModal, setShowSelectMedModal] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [medicamentosFiltrados, setMedicamentosFiltrados] = useState([]);
  const [seleccionTemporalMed, setSeleccionTemporalMed] = useState([]);
  const [cantidadesTemp, setCantidadesTemp] = useState({});
  const [procesando, setProcesando] = useState(false);

  const isLoadingRef = useRef(false);
  const getUserName = () => user?.nombre || 'usuario';

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

  // ── Cargar datos ──────────────────────────────────────────
  const loadData = useCallback(async (isRefresh = false) => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;

    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [todasEntregas, medicamentosActivos] = await Promise.all([
        entregasList(),
        medicamentosList(true),
      ]);
      const entregasOrdenadas = [...todasEntregas].sort(
        (a, b) => new Date(b.fechaCreacion || 0) - new Date(a.fechaCreacion || 0)
      );
      const medicamentosOrdenados = [...medicamentosActivos].sort((a, b) =>
        (a.nombre || '').localeCompare(b.nombre || '')
      );
      setEntregas(entregasOrdenadas);
      setMedicamentos(medicamentosOrdenados);
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

  // Carga inicial
  useEffect(() => {
    loadData();
  }, []);

  // ✅ Refrescar al obtener foco
  useFocusEffect(
    useCallback(() => {
      console.log('🔄 EntregasScreen: recargando datos');
      loadData();
    }, [loadData])
  );

  // Pull-to-refresh
  const onRefresh = useCallback(() => loadData(true), [loadData]);

  // Resto de funciones
  const buscarMedicamentos = (texto) => {
    setBusqueda(texto);
    if (!texto.trim()) {
      setMedicamentosFiltrados([]);
      return;
    }
    const textoLower = texto.toLowerCase().trim();
    const filtrados = medicamentos.filter(
      (m) =>
        m.nombre.toLowerCase().includes(textoLower) ||
        m.presentacion?.toLowerCase().includes(textoLower)
    );
    setMedicamentosFiltrados(filtrados);
  };

  const actualizarCantidadTemp = (medicamentoId, texto) => {
    setCantidadesTemp((prev) => ({ ...prev, [medicamentoId]: texto }));
  };

  const agregarASeleccionTemp = (medicamento) => {
    const cantidad = parseInt(cantidadesTemp[medicamento.id]);
    if (!cantidad || cantidad <= 0) {
      Alert.alert('Error', 'Ingresa una cantidad válida');
      return;
    }
    if (seleccionTemporalMed.find((s) => s.medicamentoId === medicamento.id)) {
      Alert.alert('Error', 'Este medicamento ya está en la lista.');
      return;
    }
    if (cantidad > medicamento.cantidad) {
      Alert.alert('Error', `Stock insuficiente. Disponible: ${medicamento.cantidad} unidades`);
      return;
    }
    const nuevoItem = {
      id: Date.now().toString() + Math.random(),
      medicamentoId: medicamento.id,
      nombre: medicamento.nombre,
      presentacion: medicamento.presentacion || 'No especificada',
      cantidad: cantidad,
      ubicacion: medicamento.ubicacion || '',
      vencimiento: medicamento.vencimiento,
    };
    setSeleccionTemporalMed([...seleccionTemporalMed, nuevoItem]);
    setCantidadesTemp((prev) => {
      const newCantidades = { ...prev };
      delete newCantidades[medicamento.id];
      return newCantidades;
    });
  };

  const eliminarDeSeleccionTemp = (id) => {
    setSeleccionTemporalMed(seleccionTemporalMed.filter((s) => s.id !== id));
  };

  const confirmarSeleccionTemp = () => {
    if (seleccionTemporalMed.length === 0) {
      Alert.alert('Error', 'No has seleccionado ningún medicamento');
      return;
    }
    setMedicamentosSeleccionados([...medicamentosSeleccionados, ...seleccionTemporalMed]);
    setSeleccionTemporalMed([]);
    setCantidadesTemp({});
    setShowSelectMedModal(false);
  };

  const eliminarMedicamento = (id) => {
    setMedicamentosSeleccionados(medicamentosSeleccionados.filter((m) => m.id !== id));
  };

  // Prender/apagar el seguimiento diario de esta entrega (solo admin).
  // Al ACTIVARLO, manda el aviso de inmediato (no espera al chequeo del
  // día siguiente) - útil si se reactiva por un problema nuevo del
  // mensajero. Al desactivarlo, no manda nada.
  const toggleSeguimiento = async (entrega) => {
    try {
      const nuevoValor = !entrega.darSeguimiento;
      await entregaUpdate(entrega.id, { darSeguimiento: nuevoValor });
      await loadData();
      if (nuevoValor) {
        notificarSeguimientoEntrega({ ...entrega, darSeguimiento: true });
      }
    } catch (error) {
      console.error('Error actualizando seguimiento:', error);
      Alert.alert('Error', 'No se pudo actualizar el seguimiento');
    }
  };

  // Eliminar una entrega ya registrada, definitivamente (solo admin)
  const eliminarEntrega = (entrega) => {
    const estaVinculada = !!entrega.pedidoId;
    const mensaje = estaVinculada
      ? `¿Estás seguro de eliminar PERMANENTEMENTE la entrega a ${entrega.destino}? Esta acción no se puede deshacer.\n\nEstá vinculada a un pedido - se quitará de su lista de entregas, y si esta era la única, el pedido volverá a quedar pendiente.`
      : `¿Estás seguro de eliminar PERMANENTEMENTE la entrega a ${entrega.destino}? Esta acción no se puede deshacer.`;

    Alert.alert('Eliminar entrega definitivamente', mensaje, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            // Si estaba vinculada a un pedido, quitarla de su lista de
            // entregas realizadas y, si era la única, volver a pendiente
            if (entrega.pedidoId) {
              const pedido = await pedidoGetOne(entrega.pedidoId);
              if (pedido) {
                const entregasRestantes = (pedido.entregasRealizadas || []).filter(
                  (e) => e.entregaId !== entrega.id
                );
                await pedidoUpdate(pedido.id, {
                  entregasRealizadas: entregasRestantes,
                  atendido: entregasRestantes.length > 0,
                });
              }
            }

            await entregaDelete(entrega.id);
            Alert.alert('Éxito', 'Entrega eliminada correctamente');
            await loadData();
          } catch (error) {
            console.error('Error eliminando entrega:', error);
            Alert.alert('Error', 'No se pudo eliminar la entrega');
          }
        },
      },
    ]);
  };

  const verificarEntregaExistente = async () => {
    if (!destino.trim()) return null;
    try {
      const todasEntregas = await entregasList();
      const destinoNorm = destino.trim().toLowerCase();
      return (
        todasEntregas.find(
          (e) =>
            (e.destino || '').trim().toLowerCase() === destinoNorm &&
            !e.pedidoId &&
            e.estado === 'abierta'
        ) || null
      );
    } catch (error) {
      console.error('Error:', error);
      return null;
    }
  };

  const procesarEntrega = async () => {
    if (!destino.trim()) {
      Alert.alert('Error', 'El destino es obligatorio');
      return;
    }
    if (medicamentosSeleccionados.length === 0) {
      Alert.alert('Error', 'Debes agregar al menos un medicamento');
      return;
    }
    setProcesando(true);
    try {
      const entregaExistente = await verificarEntregaExistente();
      if (entregaExistente) {
        Alert.alert(
          'Entrega existente',
          `Ya existe una entrega abierta para "${destino}". ¿Deseas agregar estos medicamentos a esa entrega?`,
          [
            { text: 'Crear nueva', onPress: () => crearNuevaEntrega() },
            {
              text: 'Agregar a existente',
              onPress: () => agregarAEntregaExistente(entregaExistente),
            },
            { text: 'Cancelar', style: 'cancel', onPress: () => setProcesando(false) },
          ]
        );
      } else {
        await crearNuevaEntrega();
      }
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Error', 'No se pudo procesar la entrega');
      setProcesando(false);
    }
  };

  const crearNuevaEntrega = async () => {
    try {
      for (const med of medicamentosSeleccionados) {
        const medicamentoActual = medicamentos.find((m) => m.id === med.medicamentoId);
        if (!medicamentoActual || med.cantidad > medicamentoActual.cantidad) {
          Alert.alert('Error', `Stock insuficiente para ${med.nombre}`);
          setProcesando(false);
          return;
        }
      }

      const items = medicamentosSeleccionados.map((med) => ({
        medicamentoId: med.medicamentoId,
        nombre: med.nombre,
        presentacion: med.presentacion,
        cantidad: med.cantidad,
        ubicacion: med.ubicacion || '',
        vencimiento: med.vencimiento,
        fechaAgregado: new Date().toISOString(),
      }));

      await entregaCreate({
        destino: destino.trim(),
        fechaCreacion: new Date().toISOString(),
        pedidoId: null,
        items: items,
        estado: 'abierta',
        creadoPor: getUserName(),
        notas: notas.trim() || '',
        ultimaModificacion: new Date().toISOString(),
      });

      for (const med of medicamentosSeleccionados) {
        const medicamentoActual = medicamentos.find((m) => m.id === med.medicamentoId);
        const nuevaCantidad = medicamentoActual.cantidad - med.cantidad;
        await medicamentoUpdate(med.medicamentoId, { cantidad: nuevaCantidad });
        await registrarHistory(
          med.medicamentoId,
          new Date().toISOString(),
          getUserName(),
          'Entregando',
          med.cantidad,
          med.nombre
        );
        if (nuevaCantidad <= 10) {
          await sendLocalNotification(
            '📦 Stock bajo',
            `${med.nombre} tiene solo ${nuevaCantidad} unidades restantes`
          );
        }
      }

      resetForm();
      Alert.alert('Éxito', 'Entrega registrada correctamente');
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Error', error.message || 'No se pudo crear la entrega');
      setProcesando(false);
    }
  };

  const agregarAEntregaExistente = async (entrega) => {
    try {
      for (const med of medicamentosSeleccionados) {
        const medicamentoActual = medicamentos.find((m) => m.id === med.medicamentoId);
        if (!medicamentoActual || med.cantidad > medicamentoActual.cantidad) {
          Alert.alert('Error', `Stock insuficiente para ${med.nombre}`);
          setProcesando(false);
          return;
        }
      }

      const itemsActuales = entrega.items || [];
      const nuevosItems = [...itemsActuales];

      for (const nuevoMed of medicamentosSeleccionados) {
        const existenteIndex = nuevosItems.findIndex(
          (item) => item.medicamentoId === nuevoMed.medicamentoId
        );
        if (existenteIndex >= 0) {
          nuevosItems[existenteIndex].cantidad += nuevoMed.cantidad;
          nuevosItems[existenteIndex].fechaAgregado = new Date().toISOString();
        } else {
          nuevosItems.push({
            medicamentoId: nuevoMed.medicamentoId,
            nombre: nuevoMed.nombre,
            presentacion: nuevoMed.presentacion,
            cantidad: nuevoMed.cantidad,
            ubicacion: nuevoMed.ubicacion,
            vencimiento: nuevoMed.vencimiento,
            fechaAgregado: new Date().toISOString(),
          });
        }
        await registrarHistory(
          nuevoMed.medicamentoId,
          new Date().toISOString(),
          getUserName(),
          'Entregando',
          nuevoMed.cantidad,
          nuevoMed.nombre
        );
      }

      await entregaUpdate(entrega.id, {
        items: nuevosItems,
        ultimaModificacion: new Date().toISOString(),
      });

      for (const med of medicamentosSeleccionados) {
        const medicamentoActual = medicamentos.find((m) => m.id === med.medicamentoId);
        const nuevaCantidad = medicamentoActual.cantidad - med.cantidad;
        await medicamentoUpdate(med.medicamentoId, { cantidad: nuevaCantidad });
      }

      resetForm();
      Alert.alert('Éxito', 'Medicamentos agregados a la entrega existente');
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Error', error.message || 'No se pudo agregar a la entrega');
      setProcesando(false);
    }
  };

  const resetForm = () => {
    setDestino('');
    setNotas('');
    setMedicamentosSeleccionados([]);
    setSeleccionTemporalMed([]);
    setCantidadesTemp({});
    setShowFormModal(false);
    setProcesando(false);
    setBusqueda('');
    setMedicamentosFiltrados([]);
    loadData();
  };

  const getFilteredEntregas = () => {
    let filtered = [...entregas];
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(
        (e) =>
          e.destino?.toLowerCase().includes(term) ||
          e.items?.some((item) => item.nombre?.toLowerCase().includes(term))
      );
    }
    if (filter === 'abiertas') {
      filtered = filtered.filter((e) => e.estado === 'abierta' && !e.pedidoId);
    } else if (filter === 'cerradas') {
      filtered = filtered.filter((e) => e.estado === 'cerrada' || !!e.pedidoId);
    }
    return filtered;
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

  const totalUnidades = medicamentosSeleccionados.reduce((sum, m) => sum + m.cantidad, 0);
  const filteredEntregas = getFilteredEntregas();
  const totalEntregas = entregas.length;
  const abiertasCount = entregas.filter((e) => e.estado === 'abierta' && !e.pedidoId).length;
  const cerradasCount = entregas.filter((e) => e.estado === 'cerrada' || !!e.pedidoId).length;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size={50} color="#7C3AED" />
        <Text style={styles.loadingText}>Cargando entregas...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <MinusCircle color="#EA580C" size={28} />
        <Text style={styles.title}>Entregas</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setShowFormModal(true)}>
          <Plus color="white" size={20} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Search color="#9CA3AF" size={20} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por destino o medicamento..."
            placeholderTextColor="#9CA3AF"
            value={searchTerm}
            onChangeText={setSearchTerm}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersScroll}>
          <TouchableOpacity
            style={[styles.filterChip, filter === 'todas' && styles.filterChipActive]}
            onPress={() => setFilter('todas')}
          >
            <Text
              style={[styles.filterChipText, filter === 'todas' && styles.filterChipTextActive]}
            >
              Todas ({totalEntregas})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filter === 'abiertas' && styles.filterChipActive]}
            onPress={() => setFilter('abiertas')}
          >
            <Text
              style={[styles.filterChipText, filter === 'abiertas' && styles.filterChipTextActive]}
            >
              Abiertas ({abiertasCount})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filter === 'cerradas' && styles.filterChipActive]}
            onPress={() => setFilter('cerradas')}
          >
            <Text
              style={[styles.filterChipText, filter === 'cerradas' && styles.filterChipTextActive]}
            >
              Cerradas ({cerradasCount})
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {filteredEntregas.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Package color="#D1D5DB" size={64} />
            <Text style={styles.emptyTitle}>No hay entregas</Text>
            <Text style={styles.emptyText}>
              {searchTerm
                ? 'No hay resultados con esa búsqueda'
                : 'Toca el botón + para crear una nueva entrega'}
            </Text>
          </View>
        ) : (
          filteredEntregas.map((entrega) => {
            const isAbierta = entrega.estado === 'abierta' && !entrega.pedidoId;
            return (
              <View key={entrega.id} style={styles.entregaCard}>
                <TouchableOpacity
                  style={styles.entregaHeader}
                  onPress={() => setExpandedId(expandedId === entrega.id ? null : entrega.id)}
                >
                  <View style={styles.entregaHeaderLeft}>
                    <View
                      style={[styles.statusDot, isAbierta ? styles.abiertaDot : styles.cerradaDot]}
                    />
                    <View>
                      <Text style={styles.entregaDestino}>{entrega.destino}</Text>
                      {entrega.notas ? (
                        <Text style={styles.entregaNotas} numberOfLines={1}>
                          📝 {entrega.notas}
                        </Text>
                      ) : null}
                      <Text style={styles.entregaInfo}>
                        {entrega.items?.length || 0} medicamentos •{' '}
                        {isAbierta ? 'Abierta' : 'Cerrada'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.entregaHeaderRight}>
                    {isUserAdmin && (
                      <TouchableOpacity onPress={() => eliminarEntrega(entrega)}>
                        <Trash2 color="#DC2626" size={20} />
                      </TouchableOpacity>
                    )}
                    {expandedId === entrega.id ? (
                      <ChevronUp size={20} color="#6B7280" />
                    ) : (
                      <ChevronDown size={20} color="#6B7280" />
                    )}
                  </View>
                </TouchableOpacity>
                {expandedId === entrega.id && (
                  <View style={styles.entregaDetails}>
                    <View style={styles.detailRow}>
                      <Calendar size={12} color="#6B7280" />
                      <Text style={styles.detailTextSmall}>
                        {formatDate(entrega.fechaCreacion)}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <User size={12} color="#6B7280" />
                      <Text style={styles.detailTextSmall}>
                        Creado por: {entrega.creadoPor || 'usuario'}
                      </Text>
                    </View>
                    <View style={styles.itemsContainer}>
                      <Text style={styles.itemsTitle}>Medicamentos entregados:</Text>
                      {entrega.items?.map((item, idx) => (
                        <View key={idx} style={styles.itemRow}>
                          <Pill size={12} color="#7C3AED" />
                          <Text style={styles.itemNameSmall}>
                            {item.nombre} x{item.cantidad}
                            {item.ubicacion ? ` 📍 ${item.ubicacion}` : ''}
                          </Text>
                        </View>
                      ))}
                    </View>
                    {entrega.pedidoId ? (
                      <View style={styles.vinculadaContainer}>
                        <Text style={styles.vinculadaText}>✓ Vinculada al pedido</Text>
                      </View>
                    ) : (
                      <View style={styles.abiertaContainer}>
                        <Text style={styles.abiertaText}>
                          🟡 Entrega abierta - disponible para vincular
                        </Text>
                      </View>
                    )}
                    {isUserAdmin && (
                      <View style={styles.seguimientoRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.seguimientoLabel}>Dar seguimiento</Text>
                          <Text style={styles.seguimientoHint}>
                            Aviso diario al admin si el mensajero se demora
                          </Text>
                        </View>
                        <Switch
                          value={!!entrega.darSeguimiento}
                          onValueChange={() => toggleSeguimiento(entrega)}
                          trackColor={{ false: '#D1D5DB', true: '#C4B5FD' }}
                          thumbColor={entrega.darSeguimiento ? '#7C3AED' : '#F3F4F6'}
                        />
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* MODAL CREAR ENTREGA */}
      <Modal
        visible={showFormModal}
        animationType="slide"
        transparent={true}
        onRequestClose={resetForm}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nueva Entrega</Text>
              <TouchableOpacity onPress={resetForm}>
                <X color="#6B7280" size={24} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <Text style={styles.label}>Destino *</Text>
              <TextInput
                style={styles.input}
                placeholder="Nombre de la persona o lugar"
                placeholderTextColor="#9CA3AF"
                value={destino}
                onChangeText={setDestino}
              />

              <Text style={styles.label}>Notas (opcional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Información adicional"
                placeholderTextColor="#9CA3AF"
                value={notas}
                onChangeText={setNotas}
                multiline
              />

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Medicamentos a entregar</Text>
                <TouchableOpacity
                  style={styles.addMedButton}
                  onPress={() => {
                    setSeleccionTemporalMed([]);
                    setCantidadesTemp({});
                    setBusqueda('');
                    setMedicamentosFiltrados([]);
                    setShowSelectMedModal(true);
                  }}
                >
                  <Plus size={20} color="#7C3AED" />
                  <Text style={styles.addMedButtonText}>Agregar</Text>
                </TouchableOpacity>
              </View>

              {medicamentosSeleccionados.length === 0 ? (
                <View style={styles.emptyMedList}>
                  <Package color="#D1D5DB" size={48} />
                  <Text style={styles.emptyMedListText}>No hay medicamentos agregados</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setSeleccionTemporalMed([]);
                      setCantidadesTemp({});
                      setBusqueda('');
                      setMedicamentosFiltrados([]);
                      setShowSelectMedModal(true);
                    }}
                  >
                    <Text style={styles.emptyMedListLink}>+ Agregar medicamento</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                medicamentosSeleccionados.map((med) => (
                  <View key={med.id} style={styles.selectedMedItem}>
                    <View style={styles.selectedMedInfo}>
                      <Text style={styles.selectedMedName}>{med.nombre}</Text>
                      <Text style={styles.selectedMedPresentation}>{med.presentacion}</Text>
                      {med.ubicacion && (
                        <Text style={styles.selectedMedUbicacion}>📍 {med.ubicacion}</Text>
                      )}
                    </View>
                    <Text style={styles.selectedMedCantidad}>x{med.cantidad}</Text>
                    <TouchableOpacity onPress={() => eliminarMedicamento(med.id)}>
                      <Trash2 size={18} color="#DC2626" />
                    </TouchableOpacity>
                  </View>
                ))
              )}

              {medicamentosSeleccionados.length > 0 && (
                <View style={styles.totalContainer}>
                  <Text style={styles.totalLabel}>Total unidades:</Text>
                  <Text style={styles.totalValue}>{totalUnidades} uds</Text>
                </View>
              )}

              <TouchableOpacity
                style={[
                  styles.procesarButton,
                  (medicamentosSeleccionados.length === 0 || !destino.trim() || procesando) &&
                    styles.procesarDisabled,
                ]}
                onPress={procesarEntrega}
                disabled={medicamentosSeleccionados.length === 0 || !destino.trim() || procesando}
              >
                {procesando ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <>
                    <CheckCircle color="white" size={20} />
                    <Text style={styles.procesarButtonText}>Procesar Entrega</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL SELECCIONAR MEDICAMENTOS */}
      <Modal visible={showSelectMedModal} animationType="slide" transparent={false}>
        <View style={styles.fullModalContainer}>
          <View style={styles.fullModalHeader}>
            <Text style={styles.fullModalTitle}>Seleccionar Medicamentos</Text>
            <TouchableOpacity
              onPress={() => {
                setSeleccionTemporalMed([]);
                setCantidadesTemp({});
                setShowSelectMedModal(false);
              }}
            >
              <XCircle size={28} color="white" />
            </TouchableOpacity>
          </View>

          <View style={styles.searchInputContainerFull}>
            <Search size={20} color="#9CA3AF" />
            <TextInput
              style={styles.searchInputFull}
              placeholder="Buscar medicamento..."
              placeholderTextColor="#9CA3AF"
              value={busqueda}
              onChangeText={buscarMedicamentos}
            />
          </View>

          <FlatList
            data={medicamentosFiltrados.length > 0 ? medicamentosFiltrados : medicamentos}
            keyExtractor={(item) => item.id}
            style={styles.flatList}
            renderItem={({ item }) => (
              <View style={styles.medicamentoItemSeleccion}>
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
                    value={cantidadesTemp[item.id] || ''}
                    onChangeText={(text) => actualizarCantidadTemp(item.id, text)}
                  />
                  <TouchableOpacity
                    style={styles.agregarSeleccionButton}
                    onPress={() => agregarASeleccionTemp(item)}
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

          {seleccionTemporalMed.length > 0 && (
            <View style={styles.seleccionPreviewContainer}>
              <Text style={styles.seleccionPreviewTitle}>Seleccionados:</Text>
              {seleccionTemporalMed.map((item) => (
                <View key={item.id} style={styles.seleccionPreviewItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.seleccionPreviewName}>
                      {item.nombre} x{item.cantidad}
                    </Text>
                    {item.ubicacion && (
                      <Text style={styles.seleccionPreviewUbicacion}>📍 {item.ubicacion}</Text>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => eliminarDeSeleccionTemp(item.id)}>
                    <MinusCircle color="#DC2626" size={20} />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                style={styles.confirmarSeleccionButton}
                onPress={confirmarSeleccionTemp}
              >
                <Text style={styles.confirmarSeleccionButtonText}>
                  Agregar ({seleccionTemporalMed.length})
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

// Estilos (completos)
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F3F4F6' },
  loadingText: { marginTop: 10, fontSize: 14, color: '#6B7280' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'white',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: { fontSize: 20, fontWeight: 'bold', color: '#1F2937', flex: 1, marginLeft: 10 },
  addButton: {
    backgroundColor: '#EA580C',
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
  filterChipActive: { backgroundColor: '#EA580C' },
  filterChipText: { color: '#4B5563', fontWeight: '500' },
  filterChipTextActive: { color: 'white' },
  content: { flex: 1, padding: 16 },
  emptyContainer: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#374151', marginTop: 16 },
  emptyText: { fontSize: 14, color: '#9CA3AF', marginTop: 8, textAlign: 'center' },
  entregaCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 12,
    elevation: 2,
    overflow: 'hidden',
  },
  entregaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  entregaHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  entregaHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  abiertaDot: { backgroundColor: '#F59E0B' },
  cerradaDot: { backgroundColor: '#10B981' },
  entregaDestino: { fontSize: 16, fontWeight: 'bold', color: '#1F2937' },
  entregaNotas: { fontSize: 11, color: '#6B7280', fontStyle: 'italic', marginTop: 2 },
  entregaInfo: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  entregaDetails: { padding: 16, paddingTop: 0, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 6 },
  detailTextSmall: { fontSize: 12, color: '#6B7280', flex: 1 },
  itemsContainer: { marginTop: 8, padding: 8, backgroundColor: '#F3F4F6', borderRadius: 8 },
  itemsTitle: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 4 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 },
  itemNameSmall: { fontSize: 12, color: '#1F2937', flex: 1 },
  vinculadaContainer: { marginTop: 8, padding: 8, backgroundColor: '#D1FAE5', borderRadius: 8 },
  vinculadaText: { fontSize: 12, color: '#065F46', textAlign: 'center' },
  abiertaContainer: { marginTop: 8, padding: 8, backgroundColor: '#FEF3C7', borderRadius: 8 },
  abiertaText: { fontSize: 12, color: '#92400E', textAlign: 'center' },
  seguimientoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  seguimientoLabel: { fontSize: 13, fontWeight: '600', color: '#1F2937' },
  seguimientoHint: { fontSize: 11, color: '#6B7280', marginTop: 2 },
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
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#374151' },
  addMedButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addMedButtonText: { color: '#7C3AED', fontWeight: '600' },
  emptyMedList: { alignItems: 'center', padding: 32, backgroundColor: '#F9FAFB', borderRadius: 12 },
  emptyMedListText: { fontSize: 14, color: '#9CA3AF', marginTop: 12 },
  emptyMedListLink: { color: '#7C3AED', fontWeight: '600', marginTop: 8 },
  selectedMedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    gap: 8,
  },
  selectedMedInfo: { flex: 1 },
  selectedMedName: { fontSize: 14, fontWeight: '500', color: '#1F2937' },
  selectedMedPresentation: { fontSize: 12, color: '#6B7280' },
  selectedMedUbicacion: { fontSize: 10, color: '#10B981' },
  selectedMedCantidad: { fontSize: 14, fontWeight: 'bold', color: '#7C3AED' },
  totalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  totalLabel: { fontSize: 16, fontWeight: '600', color: '#1F2937' },
  totalValue: { fontSize: 18, fontWeight: 'bold', color: '#7C3AED' },
  procesarButton: {
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
    gap: 8,
  },
  procesarDisabled: { opacity: 0.6 },
  procesarButtonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
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
});
