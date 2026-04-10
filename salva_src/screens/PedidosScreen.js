import React, { useState, useEffect } from 'react';
import KeyboardAvoidingScrollView from '../components/KeyboardAvoidingScrollView';
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
} from 'react-native';
import { db } from '../../firebaseConfig';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  addDoc, 
  updateDoc, 
  doc,
  where,
  getDocs,
  deleteDoc
} from 'firebase/firestore';
import { 
  Package, 
  User, 
  Calendar, 
  MapPin, 
  Phone, 
  CheckCircle, 
  XCircle,
  Plus,
  Search,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Trash2,
  Pill,
  AlertCircle,
  MinusCircle
} from 'lucide-react-native';

export default function PedidosScreen() {
  const [pedidos, setPedidos] = useState([]);
  const [entregas, setEntregas] = useState([]);
  const [medicamentos, setMedicamentos] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showAtenderModal, setShowAtenderModal] = useState(false);
  const [selectedPedido, setSelectedPedido] = useState(null);
  const [filter, setFilter] = useState('pendientes');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false); // Para prevenir clics múltiples

  // Estado para el nuevo pedido
  const [formData, setFormData] = useState({
    nombreSolicitante: '',
    lugarResidencia: '',
    telefonoContacto: '',
    detallePersona: '',
    notas: '',
    medicamentosSolicitados: []
  });

  // Estado para el modal de selección múltiple de medicamentos
  const [showMedicamentoModal, setShowMedicamentoModal] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [medicamentosFiltrados, setMedicamentosFiltrados] = useState([]);
  const [seleccionTemporal, setSeleccionTemporal] = useState([]);
  const [cantidades, setCantidades] = useState({});

  useEffect(() => {
    const qPedidos = query(collection(db, "pedidos"), orderBy("fechaPedido", "desc"));
    const unsubscribePedidos = onSnapshot(qPedidos, (snapshot) => {
      const docs = [];
      snapshot.forEach(d => docs.push({ id: d.id, ...d.data() }));
      setPedidos(docs);
    });

    const qEntregas = query(collection(db, "entregas"), orderBy("fecha", "desc"));
    const unsubscribeEntregas = onSnapshot(qEntregas, (snapshot) => {
      const docs = [];
      snapshot.forEach(d => docs.push({ id: d.id, ...d.data() }));
      setEntregas(docs);
    });

    const qMedicamentos = query(collection(db, "medicamentos"), orderBy("nombre", "asc"));
    const unsubscribeMedicamentos = onSnapshot(qMedicamentos, (snapshot) => {
      const docs = [];
      snapshot.forEach(d => docs.push({ id: d.id, ...d.data() }));
      setMedicamentos(docs);
      setLoading(false);
    });

    return () => {
      unsubscribePedidos();
      unsubscribeEntregas();
      unsubscribeMedicamentos();
    };
  }, []);

  const buscarMedicamentos = (texto) => {
    if (!texto.trim()) {
      setMedicamentosFiltrados([]);
      return;
    }
    
    const textoLower = texto.toLowerCase().trim();
    const filtrados = medicamentos.filter(m => 
      m.activo !== false &&
      (m.nombre.toLowerCase().includes(textoLower) ||
       m.presentacion?.toLowerCase().includes(textoLower))
    );
    setMedicamentosFiltrados(filtrados);
  };

  const actualizarCantidad = (medicamentoId, texto) => {
    setCantidades(prev => ({
      ...prev,
      [medicamentoId]: texto
    }));
  };

  const agregarASeleccion = (medicamento) => {
    const cantidad = parseInt(cantidades[medicamento.id]);
    
    if (!cantidad || cantidad <= 0) {
      Alert.alert('Error', 'Ingresa una cantidad válida');
      return;
    }
    
    const yaSeleccionado = seleccionTemporal.find(s => s.medicamentoId === medicamento.id);
    if (yaSeleccionado) {
      Alert.alert('Error', 'Este medicamento ya está en la lista. Puedes eliminarlo y volver a agregar con la nueva cantidad.');
      return;
    }

    if (cantidad > medicamento.cantidad) {
      Alert.alert('Error', `Stock insuficiente. Disponible: ${medicamento.cantidad} unidades`);
      return;
    }

    const nuevoItem = {
      id: Date.now().toString() + Math.random(),
      nombre: medicamento.nombre,
      presentacion: medicamento.presentacion || 'No especificada',
      cantidad: cantidad,
      medicamentoId: medicamento.id
    };

    setSeleccionTemporal([...seleccionTemporal, nuevoItem]);
    
    setCantidades(prev => {
      const newCantidades = { ...prev };
      delete newCantidades[medicamento.id];
      return newCantidades;
    });
  };

  const eliminarDeSeleccion = (id) => {
    setSeleccionTemporal(seleccionTemporal.filter(s => s.id !== id));
  };

  const confirmarSeleccion = () => {
    if (seleccionTemporal.length === 0) {
      Alert.alert('Error', 'No has seleccionado ningún medicamento');
      return;
    }

    setFormData({
      ...formData,
      medicamentosSolicitados: [...formData.medicamentosSolicitados, ...seleccionTemporal]
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
  if (isSubmitting) return; // Prevenir clics múltiples
  
  if (!formData.nombreSolicitante) {
    Alert.alert('Error', 'El nombre del solicitante es obligatorio');
    return;
  }

  if (formData.medicamentosSolicitados.length === 0) {
    Alert.alert('Error', 'Debes agregar al menos un medicamento');
    return;
  }

  setIsSubmitting(true);

  try {
    await addDoc(collection(db, 'pedidos'), {
      ...formData,
      fechaPedido: new Date().toISOString(),
      atendido: false,
      entregasRealizadas: [],
      fechaAtencion: null,
    });

    setFormData({
      nombreSolicitante: '',
      lugarResidencia: '',
      telefonoContacto: '',
      detallePersona: '',
      notas: '',
      medicamentosSolicitados: []
    });
    setShowForm(false);
    
    // Mostrar éxito y resetear el estado solo después de que el usuario cierre el alert
    Alert.alert('Éxito', 'Pedido registrado correctamente', [
      { text: 'OK', onPress: () => setIsSubmitting(false) }
    ]);
  } catch (error) {
    console.error('Error:', error);
    Alert.alert('Error', 'No se pudo crear el pedido', [
      { text: 'OK', onPress: () => setIsSubmitting(false) }
    ]);
    // Si falla, resetear inmediatamente también
    setIsSubmitting(false);
  }
};

  const eliminarPedido = (pedidoId, nombreSolicitante) => {
    Alert.alert(
      'Eliminar Pedido',
      `¿Estás seguro de eliminar el pedido de ${nombreSolicitante}?\n\nEsta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'pedidos', pedidoId));
              Alert.alert('Éxito', 'Pedido eliminado correctamente');
            } catch (error) {
              console.error('Error eliminando pedido:', error);
              Alert.alert('Error', 'No se pudo eliminar el pedido');
            }
          }
        }
      ]
    );
  };

  const handleAtenderPedido = async (entregaSeleccionada) => {
    if (!selectedPedido) return;

    try {
      const pedidoRef = doc(db, 'pedidos', selectedPedido.id);
      
      const entregasActuales = selectedPedido.entregasRealizadas || [];
      
      await updateDoc(pedidoRef, {
        entregasRealizadas: [
          ...entregasActuales,
          {
            entregaId: entregaSeleccionada.id,
            fecha: new Date().toISOString(),
            items: entregaSeleccionada.items || []
          }
        ],
        atendido: true,
        fechaAtencion: new Date().toISOString(),
      });

      setShowAtenderModal(false);
      setSelectedPedido(null);
      Alert.alert('Éxito', 'Pedido marcado como atendido');
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Error', 'No se pudo actualizar el pedido');
    }
  };

  const getFilteredPedidos = () => {
    let filtered = pedidos;

    if (searchTerm) {
      filtered = filtered.filter(p => 
        p.nombreSolicitante.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.medicamentosSolicitados?.some(m => 
          m.nombre.toLowerCase().includes(searchTerm.toLowerCase())
        ) ||
        p.lugarResidencia?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    switch(filter) {
      case 'pendientes':
        filtered = filtered.filter(p => !p.atendido);
        break;
      case 'atendidos':
        filtered = filtered.filter(p => p.atendido);
        break;
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

  const getMedicamentoEnPedidoStatus = (medicamentoEnPedido) => {
    if (!medicamentoEnPedido.medicamentoId) {
      return { activo: true, mensaje: 'Medicamento externo' };
    }
    
    const med = medicamentos.find(m => m.id === medicamentoEnPedido.medicamentoId);
    if (!med) {
      return { activo: false, mensaje: 'Medicamento no encontrado' };
    }
    
    return { 
      activo: med.activo !== false, 
      mensaje: med.activo === false ? 'Medicamento descontinuado' : 'Activo',
      med
    };
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
  const pendientesCount = pedidos.filter(p => !p.atendido).length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <ClipboardList color="#7C3AED" size={28} />
        <Text style={styles.title}>Gestión de Pedidos</Text>
        <TouchableOpacity 
          style={styles.addButton}
          onPress={() => setShowForm(true)}
        >
          <Plus color="white" size={20} />
        </TouchableOpacity>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{pedidos.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={[styles.statCard, styles.statPendiente]}>
          <Text style={styles.statNumber}>{pendientesCount}</Text>
          <Text style={styles.statLabel}>Pendientes</Text>
        </View>
        <View style={[styles.statCard, styles.statAtendido]}>
          <Text style={styles.statNumber}>{pedidos.length - pendientesCount}</Text>
          <Text style={styles.statLabel}>Atendidos</Text>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Search color="#9CA3AF" size={20} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por nombre, medicamento..."
            value={searchTerm}
            onChangeText={setSearchTerm}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersScroll}>
          <TouchableOpacity
            style={[styles.filterChip, filter === 'pendientes' && styles.filterChipActive]}
            onPress={() => setFilter('pendientes')}
          >
            <Text style={[styles.filterChipText, filter === 'pendientes' && styles.filterChipTextActive]}>
              Pendientes
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, filter === 'atendidos' && styles.filterChipActive]}
            onPress={() => setFilter('atendidos')}
          >
            <Text style={[styles.filterChipText, filter === 'atendidos' && styles.filterChipTextActive]}>
              Atendidos
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, filter === 'todos' && styles.filterChipActive]}
            onPress={() => setFilter('todos')}
          >
            <Text style={[styles.filterChipText, filter === 'todos' && styles.filterChipTextActive]}>
              Todos
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <ScrollView style={styles.content}>
        {filteredPedidos.length === 0 ? (
          <View style={styles.emptyContainer}>
            <ClipboardList color="#D1D5DB" size={64} />
            <Text style={styles.emptyTitle}>No hay pedidos</Text>
            <Text style={styles.emptyText}>
              {searchTerm ? 'Intenta con otra búsqueda' : 'Crea un nuevo pedido con el botón +'}
            </Text>
          </View>
        ) : (
          filteredPedidos.map(pedido => (
            <View key={pedido.id} style={styles.pedidoCard}>
              <TouchableOpacity
                style={styles.pedidoHeader}
                onPress={() => setExpandedId(expandedId === pedido.id ? null : pedido.id)}
              >
                <View style={styles.pedidoHeaderLeft}>
                  <View style={[styles.statusDot, pedido.atendido ? styles.atendidoDot : styles.pendienteDot]} />
                  <View style={styles.pedidoHeaderInfo}>
                    <Text style={styles.pedidoNombre}>{pedido.nombreSolicitante}</Text>
                    <Text style={styles.pedidoMedicamentos}>
                      {pedido.medicamentosSolicitados?.length || 0} medicamentos
                    </Text>
                  </View>
                </View>
                <View style={styles.pedidoHeaderRight}>
                  {!pedido.atendido && (
                    <TouchableOpacity 
                      onPress={() => eliminarPedido(pedido.id, pedido.nombreSolicitante)}
                      style={styles.deletePedidoButton}
                    >
                      <Trash2 color="#DC2626" size={20} />
                    </TouchableOpacity>
                  )}
                  {expandedId === pedido.id ? (
                    <ChevronUp color="#6B7280" size={20} />
                  ) : (
                    <ChevronDown color="#6B7280" size={20} />
                  )}
                </View>
              </TouchableOpacity>

              {expandedId === pedido.id && (
                <View style={styles.pedidoDetails}>
                  <View style={styles.detailRow}>
                    <Calendar color="#6B7280" size={16} />
                    <Text style={styles.detailText}>
                      Solicitado: {formatDate(pedido.fechaPedido)}
                    </Text>
                  </View>

                  {pedido.lugarResidencia && (
                    <View style={styles.detailRow}>
                      <MapPin color="#6B7280" size={16} />
                      <Text style={styles.detailText}>{pedido.lugarResidencia}</Text>
                    </View>
                  )}

                  {pedido.telefonoContacto && (
                    <View style={styles.detailRow}>
                      <Phone color="#6B7280" size={16} />
                      <Text style={styles.detailText}>{pedido.telefonoContacto}</Text>
                    </View>
                  )}

                  <View style={styles.medicamentosContainer}>
                    <Text style={styles.medicamentosTitle}>Medicamentos solicitados:</Text>
                    {pedido.medicamentosSolicitados?.map((med, idx) => {
                      const status = getMedicamentoEnPedidoStatus(med);
                      return (
                        <View key={idx} style={styles.medicamentoItem}>
                          <Pill color="#7C3AED" size={14} />
                          <View style={styles.medicamentoInfo}>
                            <View style={styles.medicamentoNombreContainer}>
                              <Text style={styles.medicamentoNombre}>{med.nombre}</Text>
                              {!status.activo && (
                                <View style={styles.inactivoBadge}>
                                  <AlertCircle color="#DC2626" size={12} />
                                  <Text style={styles.inactivoBadgeText}>Inactivo</Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.medicamentoCantidad}>x{med.cantidad}</Text>
                            {med.presentacion && (
                              <Text style={styles.medicamentoPresentacion}>({med.presentacion})</Text>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>

                  {pedido.detallePersona && (
                    <View style={styles.detailRow}>
                      <User color="#6B7280" size={16} />
                      <Text style={styles.detailText}>{pedido.detallePersona}</Text>
                    </View>
                  )}

                  {pedido.notas && (
                    <View style={styles.notasContainer}>
                      <Text style={styles.notasLabel}>Notas:</Text>
                      <Text style={styles.notasText}>{pedido.notas}</Text>
                    </View>
                  )}

                  {pedido.atendido && pedido.entregasRealizadas?.length > 0 && (
                    <View style={styles.entregasContainer}>
                      <Text style={styles.entregasTitle}>Entregas realizadas:</Text>
                      {pedido.entregasRealizadas.map((entrega, idx) => (
                        <View key={idx} style={styles.entregaItem}>
                          <Text style={styles.entregaFecha}>
                            {formatDate(entrega.fecha)}
                          </Text>
                          {entrega.items?.map((item, itemIdx) => (
                            <View key={itemIdx} style={styles.entregaItemDetail}>
                              <Text>• {item.nombre} x{item.cantidad}</Text>
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
                        setSelectedPedido(pedido);
                        setShowAtenderModal(true);
                      }}
                    >
                      <CheckCircle color="white" size={20} />
                      <Text style={styles.atenderButtonText}>Marcar como Atendido</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>

      {/* Modal para crear pedido */}
      <KeyboardAvoidingScrollView>      
        <Modal
          visible={showForm}
          animationType="slide"
          transparent={true}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Nuevo Pedido</Text>
                <TouchableOpacity onPress={() => setShowForm(false)}>
                  <XCircle color="#6B7280" size={24} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Nombre del solicitante *</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.nombreSolicitante}
                    onChangeText={(text) => setFormData({...formData, nombreSolicitante: text})}
                    placeholder="Ej: Juan Pérez"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Lugar de residencia</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.lugarResidencia}
                    onChangeText={(text) => setFormData({...formData, lugarResidencia: text})}
                    placeholder="Ej: Bayamo, Calle 123"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Teléfono de contacto</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.telefonoContacto}
                    onChangeText={(text) => setFormData({...formData, telefonoContacto: text})}
                    placeholder="Ej: +5355555555"
                    keyboardType="phone-pad"
                  />
                </View>

                <View style={styles.medicamentosSection}>
                  <Text style={styles.sectionTitle}>Medicamentos solicitados *</Text>
                  
                  {formData.medicamentosSolicitados.map((med, index) => (
                    <View key={med.id} style={styles.medicamentoAgregado}>
                      <View style={styles.medicamentoAgregadoInfo}>
                        <Text style={styles.medicamentoAgregadoNombre}>{med.nombre}</Text>
                        <Text style={styles.medicamentoAgregadoCantidad}>x{med.cantidad}</Text>
                        {med.presentacion && (
                          <Text style={styles.medicamentoAgregadoPresentacion}>({med.presentacion})</Text>
                        )}
                      </View>
                      <TouchableOpacity onPress={() => eliminarMedicamentoDelPedido(index)}>
                        <Trash2 color="#DC2626" size={18} />
                      </TouchableOpacity>
                    </View>
                  ))}

                  <TouchableOpacity
                    style={styles.agregarMedicamentoButton}
                    onPress={() => {
                      setSeleccionTemporal([]);
                      setBusqueda('');
                      setCantidades({});
                      setMedicamentosFiltrados([]);
                      setShowMedicamentoModal(true);
                    }}
                  >
                    <Plus color="#7C3AED" size={20} />
                    <Text style={styles.agregarMedicamentoText}>Agregar medicamentos</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Detalles adicionales</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={formData.detallePersona}
                    onChangeText={(text) => setFormData({...formData, detallePersona: text})}
                    placeholder="Información relevante sobre la persona"
                    multiline
                    numberOfLines={3}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Notas</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={formData.notas}
                    onChangeText={(text) => setFormData({...formData, notas: text})}
                    placeholder="Observaciones adicionales"
                    multiline
                    numberOfLines={3}
                  />
                </View>

                <TouchableOpacity 
                  style={[
                    styles.saveButton, 
                    (formData.medicamentosSolicitados.length === 0 || isSubmitting) && styles.saveButtonDisabled
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
              </ScrollView>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingScrollView>

      {/* Modal de selección múltiple de medicamentos */}
      <Modal
        visible={showMedicamentoModal}
        animationType="slide"
        transparent={false}
      >
        <View style={styles.fullModalContainer}>
          <View style={styles.fullModalHeader}>
            <Text style={styles.fullModalTitle}>Seleccionar Medicamentos</Text>
            <TouchableOpacity onPress={() => {
              setSeleccionTemporal([]);
              setShowMedicamentoModal(false);
              setCantidades({});
            }}>
              <XCircle color="#6B7280" size={28} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchInputContainerFull}>
            <Search color="#9CA3AF" size={20} />
            <TextInput
              style={styles.searchInputFull}
              placeholder="Buscar medicamento..."
              value={busqueda}
              onChangeText={(text) => {
                setBusqueda(text);
                buscarMedicamentos(text);
              }}
            />
          </View>

          <Text style={styles.seccionTitle}>Resultados:</Text>
          <FlatList
            data={medicamentosFiltrados}
            keyExtractor={(item) => item.id}
            style={styles.flatList}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={5}
            removeClippedSubviews={true}
            getItemLayout={(data, index) => ({
              length: 80,
              offset: 80 * index,
              index,
            })}
            renderItem={({ item }) => (
              <MedicamentoItemSeleccion
                item={item}
                cantidad={cantidades[item.id] || ''}
                onCantidadChange={(text) => actualizarCantidad(item.id, text)}
                onAgregar={() => agregarASeleccion(item)}
              />
            )}
            ListEmptyComponent={
              <View style={styles.emptyListContainer}>
                <Package color="#D1D5DB" size={48} />
                <Text style={styles.emptyListText}>
                  {busqueda ? 'No se encontraron medicamentos' : 'Busca un medicamento para agregar'}
                </Text>
              </View>
            }
          />

          {seleccionTemporal.length > 0 && (
            <View style={styles.seleccionTemporalContainer}>
              <Text style={styles.seccionTitle}>Seleccionados:</Text>
              {seleccionTemporal.map((item) => (
                <View key={item.id} style={styles.seleccionTemporalItem}>
                  <View style={styles.seleccionTemporalInfo}>
                    <Text style={styles.seleccionTemporalNombre}>{item.nombre}</Text>
                    <Text style={styles.seleccionTemporalCantidad}>x{item.cantidad}</Text>
                  </View>
                  <TouchableOpacity onPress={() => eliminarDeSeleccion(item.id)}>
                    <MinusCircle color="#DC2626" size={20} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={[styles.confirmarSeleccionButton, seleccionTemporal.length === 0 && styles.confirmarDisabled]}
            onPress={confirmarSeleccion}
            disabled={seleccionTemporal.length === 0}
          >
            <CheckCircle color="white" size={20} />
            <Text style={styles.confirmarSeleccionText}>
              Confirmar ({seleccionTemporal.length} medicamento{seleccionTemporal.length !== 1 ? 's' : ''})
            </Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Modal para atender pedido */}
      <Modal
        visible={showAtenderModal}
        animationType="slide"
        transparent={true}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Atender Pedido</Text>
              <TouchableOpacity onPress={() => setShowAtenderModal(false)}>
                <XCircle color="#6B7280" size={24} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.modalSubtitle}>
                Selecciona la entrega realizada para {selectedPedido?.nombreSolicitante}
              </Text>

              {entregas.filter(e => e.items?.length > 0).map(entrega => (
                <TouchableOpacity
                  key={entrega.id}
                  style={styles.entregaOption}
                  onPress={() => handleAtenderPedido(entrega)}
                >
                  <Text style={styles.entregaOptionFecha}>{formatDate(entrega.fecha)}</Text>
                  <Text style={styles.entregaOptionDestino}>{entrega.destino}</Text>
                  {entrega.items?.map((item, idx) => (
                    <View key={idx} style={styles.entregaOptionItem}>
                      <Text>• {item.nombre} x{item.cantidad}</Text>
                    </View>
                  ))}
                </TouchableOpacity>
              ))}

              {entregas.length === 0 && (
                <View style={styles.noEntregas}>
                  <Text style={styles.noEntregasText}>
                    No hay entregas registradas para vincular
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Componente memoizado para los items de la lista
const MedicamentoItemSeleccion = React.memo(({ item, cantidad, onCantidadChange, onAgregar }) => {
  return (
    <View style={styles.medicamentoItemSeleccion}>
      <View style={styles.medicamentoInfoSeleccion}>
        <Text style={styles.medicamentoNombreSeleccion}>{item.nombre}</Text>
        <Text style={styles.medicamentoPresentacionSeleccion}>{item.presentacion}</Text>
        <Text style={styles.medicamentoStockSeleccion}>Stock: {item.cantidad} uds</Text>
      </View>
      <View style={styles.seleccionCantidadContainer}>
        <TextInput
          style={styles.cantidadInputSeleccion}
          placeholder="Cantidad"
          keyboardType="numeric"
          value={cantidad}
          onChangeText={onCantidadChange}
        />
        <TouchableOpacity
          style={styles.agregarSeleccionButton}
          onPress={onAgregar}
        >
          <Plus color="white" size={18} />
        </TouchableOpacity>
      </View>
    </View>
  );
});

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
    backgroundColor: 'white',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    flex: 1,
    marginLeft: 10,
  },
  addButton: {
    backgroundColor: '#7C3AED',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    elevation: 2,
  },
  statPendiente: {
    backgroundColor: '#FEF3C7',
  },
  statAtendido: {
    backgroundColor: '#D1FAE5',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  searchContainer: {
    backgroundColor: 'white',
    padding: 16,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    fontSize: 16,
  },
  filtersScroll: {
    flexDirection: 'row',
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
  },
  filterChipTextActive: {
    color: 'white',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
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
  pedidoHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  pedidoHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deletePedidoButton: {
    padding: 4,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  pendienteDot: {
    backgroundColor: '#F59E0B',
  },
  atendidoDot: {
    backgroundColor: '#10B981',
  },
  pedidoHeaderInfo: {
    flex: 1,
  },
  pedidoNombre: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  pedidoMedicamentos: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  pedidoDetails: {
    padding: 16,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  detailText: {
    fontSize: 14,
    color: '#4B5563',
    flex: 1,
  },
  medicamentosContainer: {
    marginVertical: 8,
    padding: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
  },
  medicamentosTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  medicamentoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingVertical: 4,
  },
  medicamentoInfo: {
    flex: 1,
  },
  medicamentoNombreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  medicamentoNombre: {
    fontSize: 13,
    color: '#1F2937',
    fontWeight: '500',
  },
  inactivoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 2,
  },
  inactivoBadgeText: {
    fontSize: 10,
    color: '#DC2626',
    fontWeight: '600',
  },
  medicamentoCantidad: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#7C3AED',
    marginTop: 2,
  },
  medicamentoPresentacion: {
    fontSize: 11,
    color: '#6B7280',
    fontStyle: 'italic',
    marginTop: 1,
  },
  notasContainer: {
    backgroundColor: '#F3F4F6',
    padding: 12,
    borderRadius: 8,
    marginVertical: 8,
  },
  notasLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 4,
  },
  notasText: {
    fontSize: 14,
    color: '#1F2937',
  },
  entregasContainer: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#D1FAE5',
    borderRadius: 8,
  },
  entregasTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#065F46',
    marginBottom: 6,
  },
  entregaItem: {
    marginBottom: 8,
  },
  entregaFecha: {
    fontSize: 12,
    fontWeight: '500',
    color: '#047857',
    marginBottom: 2,
  },
  entregaItemDetail: {
    marginLeft: 8,
    fontSize: 12,
    color: '#065F46',
  },
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
  atenderButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    width: '90%',
    maxHeight: '80%',
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
  modalBody: {
    padding: 20,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  medicamentosSection: {
    marginBottom: 20,
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
  },
  medicamentoAgregado: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'white',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  medicamentoAgregadoInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  medicamentoAgregadoNombre: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
  },
  medicamentoAgregadoCantidad: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#7C3AED',
  },
  medicamentoAgregadoPresentacion: {
    fontSize: 12,
    color: '#6B7280',
  },
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
  agregarMedicamentoText: {
    color: '#7C3AED',
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#7C3AED',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  entregaOption: {
    backgroundColor: '#F9FAFB',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  entregaOptionFecha: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
    marginBottom: 4,
  },
  entregaOptionDestino: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
    marginBottom: 4,
  },
  entregaOptionItem: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 8,
  },
  noEntregas: {
    padding: 20,
    alignItems: 'center',
  },
  noEntregasText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  fullModalContainer: {
    flex: 1,
    backgroundColor: 'white',
  },
  fullModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: '#7C3AED',
    paddingTop: 50,
  },
  fullModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  searchInputContainerFull: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 16,
    margin: 16,
    marginBottom: 8,
  },
  searchInputFull: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    marginLeft: 8,
  },
  seccionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  flatList: {
    flex: 1,
    maxHeight: 300,
  },
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
  },
  medicamentoInfoSeleccion: {
    flex: 1,
  },
  medicamentoNombreSeleccion: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  medicamentoPresentacionSeleccion: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  medicamentoStockSeleccion: {
    fontSize: 11,
    color: '#10B981',
    marginTop: 2,
  },
  seleccionCantidadContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cantidadInputSeleccion: {
    width: 70,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 8,
    fontSize: 14,
    textAlign: 'center',
  },
  agregarSeleccionButton: {
    backgroundColor: '#7C3AED',
    padding: 8,
    borderRadius: 8,
  },
  emptyListContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyListText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 12,
  },
  seleccionTemporalContainer: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    maxHeight: 200,
    padding: 16,
  },
  seleccionTemporalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  seleccionTemporalInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  seleccionTemporalNombre: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
  },
  seleccionTemporalCantidad: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#7C3AED',
  },
  confirmarSeleccionButton: {
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    margin: 16,
    borderRadius: 12,
    gap: 8,
  },
  confirmarDisabled: {
    backgroundColor: '#9CA3AF',
  },
  confirmarSeleccionText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});