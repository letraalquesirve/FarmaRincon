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
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    nombreSolicitante: '',
    lugarResidencia: '',
    telefonoContacto: '',
    detallePersona: '',
    notas: '',
    medicamentosSolicitados: []
  });

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
      Alert.alert('Error', 'Este medicamento ya está en la lista.');
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
      medicamentoId: medicamento.id,
      ubicacion: medicamento.ubicacion || '', // Incluir ubicación
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
      
      Alert.alert('Éxito', 'Pedido registrado correctamente', [
        { text: 'OK', onPress: () => setIsSubmitting(false) }
      ]);
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Error', 'No se pudo crear el pedido', [
        { text: 'OK', onPress: () => setIsSubmitting(false) }
      ]);
      setIsSubmitting(false);
    }
  };

  const eliminarPedido = (pedidoId, nombreSolicitante) => {
    Alert.alert(
      'Eliminar Pedido',
      `¿Estás seguro de eliminar el pedido de ${nombreSolicitante}?`,
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
        return filtered.filter(p => !p.atendido);
      case 'atendidos':
        return filtered.filter(p => p.atendido);
      default:
        return filtered;
    }
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
    if (!med) return { activo: false, mensaje: 'No encontrado' };
    return { 
      activo: med.activo !== false, 
      mensaje: med.activo === false ? 'Inactivo' : 'Activo',
      ubicacion: med.ubicacion || ''
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
        <TouchableOpacity style={styles.addButton} onPress={() => setShowForm(true)}>
          <Plus color="white" size={20} />
        </TouchableOpacity>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statCard}><Text style={styles.statNumber}>{pedidos.length}</Text><Text style={styles.statLabel}>Total</Text></View>
        <View style={[styles.statCard, styles.statPendiente]}><Text style={styles.statNumber}>{pendientesCount}</Text><Text style={styles.statLabel}>Pendientes</Text></View>
        <View style={[styles.statCard, styles.statAtendido]}><Text style={styles.statNumber}>{pedidos.length - pendientesCount}</Text><Text style={styles.statLabel}>Atendidos</Text></View>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Search color="#9CA3AF" size={20} />
          <TextInput style={styles.searchInput} placeholder="Buscar..." value={searchTerm} onChangeText={setSearchTerm} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersScroll}>
          {['pendientes', 'atendidos', 'todos'].map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, filter === f && styles.filterChipActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
                {f === 'pendientes' ? 'Pendientes' : f === 'atendidos' ? 'Atendidos' : 'Todos'}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView style={styles.content}>
        {filteredPedidos.length === 0 ? (
          <View style={styles.emptyContainer}>
            <ClipboardList color="#D1D5DB" size={64} />
            <Text style={styles.emptyTitle}>No hay pedidos</Text>
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
                  <View>
                    <Text style={styles.pedidoNombre}>{pedido.nombreSolicitante}</Text>
                    <Text style={styles.pedidoMedicamentos}>
                      {pedido.medicamentosSolicitados?.length || 0} medicamentos
                    </Text>
                  </View>
                </View>
                <View style={styles.pedidoHeaderRight}>
                  {!pedido.atendido && (
                    <TouchableOpacity onPress={() => eliminarPedido(pedido.id, pedido.nombreSolicitante)}>
                      <Trash2 color="#DC2626" size={20} />
                    </TouchableOpacity>
                  )}
                  {expandedId === pedido.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </View>
              </TouchableOpacity>

              {expandedId === pedido.id && (
                <View style={styles.pedidoDetails}>
                  <View style={styles.detailRow}>
                    <Calendar size={16} /><Text style={styles.detailText}>{formatDate(pedido.fechaPedido)}</Text>
                  </View>
                  {pedido.lugarResidencia && (
                    <View style={styles.detailRow}><MapPin size={16} /><Text>{pedido.lugarResidencia}</Text></View>
                  )}
                  {pedido.telefonoContacto && (
                    <View style={styles.detailRow}><Phone size={16} /><Text>{pedido.telefonoContacto}</Text></View>
                  )}
                  <View style={styles.medicamentosContainer}>
                    <Text style={styles.medicamentosTitle}>Medicamentos solicitados:</Text>
                    {pedido.medicamentosSolicitados?.map((med, idx) => {
                      const status = getMedicamentoEnPedidoStatus(med);
                      return (
                        <View key={idx} style={styles.medicamentoItem}>
                          <Pill size={14} />
                          <View style={styles.medicamentoInfo}>
                            <Text style={styles.medicamentoNombre}>{med.nombre}</Text>
                            {!status.activo && <Text style={styles.inactivoBadgeText}>Inactivo</Text>}
                            <Text style={styles.medicamentoCantidad}>x{med.cantidad}</Text>
                            {status.ubicacion && (
                              <Text style={styles.medicamentoUbicacion}>📍 {status.ubicacion}</Text>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                  {!pedido.atendido && (
                    <TouchableOpacity
                      style={styles.atenderButton}
                      onPress={() => {
                        setSelectedPedido(pedido);
                        setShowAtenderModal(true);
                      }}
                    >
                      <CheckCircle color="white" size={20} />
                      <Text>Marcar como Atendido</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>

      {/* Modal para crear pedido */}
      <Modal visible={showForm} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nuevo Pedido</Text>
              <TouchableOpacity onPress={() => setShowForm(false)}><XCircle size={24} /></TouchableOpacity>
            </View>
            <KeyboardAvoidingScrollView>
              <View style={styles.modalBody}>
                <TextInput placeholder="Nombre del solicitante *" style={styles.input}
                  value={formData.nombreSolicitante} onChangeText={(t) => setFormData({...formData, nombreSolicitante: t})} />
                <TextInput placeholder="Lugar de residencia" style={styles.input}
                  value={formData.lugarResidencia} onChangeText={(t) => setFormData({...formData, lugarResidencia: t})} />
                <TextInput placeholder="Teléfono" style={styles.input} keyboardType="phone-pad"
                  value={formData.telefonoContacto} onChangeText={(t) => setFormData({...formData, telefonoContacto: t})} />
                
                <View style={styles.medicamentosSection}>
                  <Text>Medicamentos *</Text>
                  {formData.medicamentosSolicitados.map((med, idx) => (
                    <View key={med.id} style={styles.medicamentoAgregado}>
                      <View>
                        <Text>{med.nombre} x{med.cantidad}</Text>
                        {med.ubicacion && <Text style={styles.ubicacionTexto}>📍 {med.ubicacion}</Text>}
                      </View>
                      <TouchableOpacity onPress={() => eliminarMedicamentoDelPedido(idx)}><Trash2 size={18} /></TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity style={styles.agregarMedicamentoButton} onPress={() => {
                    setSeleccionTemporal([]); setBusqueda(''); setCantidades({}); setShowMedicamentoModal(true);
                  }}>
                    <Plus size={20} /><Text>Agregar medicamentos</Text>
                  </TouchableOpacity>
                </View>

                <TextInput placeholder="Detalles" style={[styles.input, styles.textArea]} multiline
                  value={formData.detallePersona} onChangeText={(t) => setFormData({...formData, detallePersona: t})} />
                <TextInput placeholder="Notas" style={[styles.input, styles.textArea]} multiline
                  value={formData.notas} onChangeText={(t) => setFormData({...formData, notas: t})} />
                
                <TouchableOpacity style={[styles.saveButton, (formData.medicamentosSolicitados.length === 0 || isSubmitting) && styles.saveButtonDisabled]}
                  onPress={handleCreatePedido} disabled={formData.medicamentosSolicitados.length === 0 || isSubmitting}>
                  {isSubmitting ? <ActivityIndicator color="white" size="small" /> : <Text style={styles.saveButtonText}>Crear Pedido</Text>}
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal de selección de medicamentos */}
      <Modal visible={showMedicamentoModal} animationType="slide" transparent={false}>
        <View style={styles.fullModalContainer}>
          <View style={styles.fullModalHeader}>
            <Text style={styles.fullModalTitle}>Seleccionar Medicamentos</Text>
            <TouchableOpacity onPress={() => { setSeleccionTemporal([]); setShowMedicamentoModal(false); setCantidades({}); }}>
              <XCircle size={28} />
            </TouchableOpacity>
          </View>
          <View style={styles.searchInputContainerFull}>
            <Search size={20} /><TextInput style={styles.searchInputFull} placeholder="Buscar..." value={busqueda}
              onChangeText={(text) => { setBusqueda(text); buscarMedicamentos(text); }} />
          </View>
          <FlatList
            data={medicamentosFiltrados}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.medicamentoItemSeleccion}>
                <View>
                  <Text style={{fontWeight:'bold'}}>{item.nombre}</Text>
                  <Text>{item.presentacion}</Text>
                  <Text style={{fontSize:12, color:'#10B981'}}>Stock: {item.cantidad}</Text>
                  {item.ubicacion && <Text style={{fontSize:12, color:'#6B7280'}}>📍 {item.ubicacion}</Text>}
                </View>
                <View style={{flexDirection:'row', alignItems:'center', gap:8}}>
                  <TextInput placeholder="Cantidad" keyboardType="numeric" value={cantidades[item.id] || ''}
                    onChangeText={(t) => actualizarCantidad(item.id, t)} style={{width:70, borderWidth:1, padding:8, borderRadius:8}} />
                  <TouchableOpacity onPress={() => agregarASeleccion(item)} style={{backgroundColor:'#7C3AED', padding:8, borderRadius:8}}>
                    <Plus color="white" size={18} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
          {seleccionTemporal.length > 0 && (
            <View style={{padding:16, borderTopWidth:1}}>
              <Text>Seleccionados:</Text>
              {seleccionTemporal.map(item => (
                <View key={item.id} style={{flexDirection:'row', justifyContent:'space-between', padding:8}}>
                  <View>
                    <Text>{item.nombre} x{item.cantidad}</Text>
                    {item.ubicacion && <Text style={{fontSize:11, color:'#6B7280'}}>📍 {item.ubicacion}</Text>}
                  </View>
                  <TouchableOpacity onPress={() => eliminarDeSeleccion(item.id)}><MinusCircle color="#DC2626" size={20} /></TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={{backgroundColor:'#10B981', padding:16, borderRadius:12, marginTop:8, alignItems:'center'}} onPress={confirmarSeleccion}>
                <Text style={{color:'white', fontWeight:'bold'}}>Confirmar ({seleccionTemporal.length})</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      {/* Modal para atender pedido */}
      <Modal visible={showAtenderModal} transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}><Text style={styles.modalTitle}>Atender Pedido</Text><TouchableOpacity onPress={() => setShowAtenderModal(false)}><XCircle size={24} /></TouchableOpacity></View>
            <ScrollView>
              {entregas.filter(e => e.items?.length > 0).map(entrega => (
                <TouchableOpacity key={entrega.id} style={styles.entregaOption} onPress={() => handleAtenderPedido(entrega)}>
                  <Text>{formatDate(entrega.fecha)}</Text><Text>{entrega.destino}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, color: '#6B7280' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'white', padding: 20 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#1F2937', flex: 1, marginLeft: 10 },
  addButton: { backgroundColor: '#7C3AED', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  statsContainer: { flexDirection: 'row', padding: 16, gap: 12 },
  statCard: { flex: 1, backgroundColor: 'white', padding: 12, borderRadius: 12, alignItems: 'center', elevation: 2 },
  statPendiente: { backgroundColor: '#FEF3C7' },
  statAtendido: { backgroundColor: '#D1FAE5' },
  statNumber: { fontSize: 24, fontWeight: 'bold', color: '#1F2937' },
  statLabel: { fontSize: 12, color: '#6B7280' },
  searchContainer: { backgroundColor: 'white', padding: 16 },
  searchInputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 12, marginBottom: 12 },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 16 },
  filtersScroll: { flexDirection: 'row' },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#F3F4F6', borderRadius: 20, marginRight: 8 },
  filterChipActive: { backgroundColor: '#7C3AED' },
  filterChipText: { color: '#4B5563', fontWeight: '500' },
  filterChipTextActive: { color: 'white' },
  content: { flex: 1, padding: 16 },
  emptyContainer: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#374151', marginTop: 16 },
  pedidoCard: { backgroundColor: 'white', borderRadius: 12, marginBottom: 12, elevation: 2, overflow: 'hidden' },
  pedidoHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  pedidoHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  pedidoHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  pendienteDot: { backgroundColor: '#F59E0B' },
  atendidoDot: { backgroundColor: '#10B981' },
  pedidoNombre: { fontSize: 16, fontWeight: 'bold', color: '#1F2937' },
  pedidoMedicamentos: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  pedidoDetails: { padding: 16, paddingTop: 0, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  detailText: { fontSize: 14, color: '#4B5563', flex: 1 },
  medicamentosContainer: { marginVertical: 8, padding: 8, backgroundColor: '#F3F4F6', borderRadius: 8 },
  medicamentosTitle: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6 },
  medicamentoItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingVertical: 4 },
  medicamentoInfo: { flex: 1 },
  medicamentoNombre: { fontSize: 13, color: '#1F2937', fontWeight: '500' },
  medicamentoCantidad: { fontSize: 13, fontWeight: 'bold', color: '#7C3AED', marginTop: 2 },
  medicamentoUbicacion: { fontSize: 11, color: '#10B981', marginTop: 2 },
  inactivoBadgeText: { fontSize: 10, color: '#DC2626', marginLeft: 6 },
  atenderButton: { backgroundColor: '#10B981', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 8, marginTop: 8, gap: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: 'white', borderRadius: 20, width: '90%', maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1F2937' },
  modalBody: { padding: 20 },
  input: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 16 },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  medicamentosSection: { marginBottom: 20, padding: 12, backgroundColor: '#F9FAFB', borderRadius: 10 },
  medicamentoAgregado: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', padding: 10, borderRadius: 8, marginBottom: 8 },
  ubicacionTexto: { fontSize: 11, color: '#10B981', marginTop: 2 },
  agregarMedicamentoButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, backgroundColor: '#EDE9FE', borderRadius: 8, gap: 8, marginTop: 8 },
  saveButton: { backgroundColor: '#7C3AED', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 20 },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  entregaOption: { backgroundColor: '#F9FAFB', padding: 16, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  fullModalContainer: { flex: 1, backgroundColor: 'white' },
  fullModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, backgroundColor: '#7C3AED', paddingTop: 50 },
  fullModalTitle: { fontSize: 20, fontWeight: 'bold', color: 'white' },
  searchInputContainerFull: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 12, paddingHorizontal: 16, margin: 16 },
  searchInputFull: { flex: 1, paddingVertical: 12, fontSize: 16, marginLeft: 8 },
  medicamentoItemSeleccion: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, marginHorizontal: 16, marginVertical: 4, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB' },
});