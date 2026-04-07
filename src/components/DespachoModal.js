import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { db } from '../../firebaseConfig';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  runTransaction,
  onSnapshot,
  orderBy,
} from 'firebase/firestore';
import {
  X,
  Package,
  Users,
  UserPlus,
  CheckCircle,
  AlertCircle,
  MinusCircle,
} from 'lucide-react-native';
import { getDaysUntilExpiry } from '../utils/dateUtils';
import KeyboardAvoidingScrollView from './KeyboardAvoidingScrollView';

const normalizeText = (text) => {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

export default function DespachoModal({ visible, medicamento, onClose, onSuccess }) {
  const [pedidosPendientes, setPedidosPendientes] = useState([]);
  const [despachos, setDespachos] = useState([]);
  const [destinoLibre, setDestinoLibre] = useState('');
  const [cantidadLibre, setCantidadLibre] = useState('');
  const [showCantidadModal, setShowCantidadModal] = useState(false);
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState(null);
  const [cantidadInput, setCantidadInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const q = query(
      collection(db, 'pedidos'),
      where('atendido', '==', false),
      orderBy('fechaPedido', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = [];
      snapshot.forEach((d) => docs.push({ id: d.id, ...d.data() }));
      setPedidosPendientes(docs);
    });
    return () => unsubscribe();
  }, [visible]);

  const getPedidosParaMedicamento = () => {
    if (!medicamento) return [];
    const medNorm = normalizeText(medicamento.nombre);
    return pedidosPendientes.filter((pedido) =>
      pedido.medicamentosSolicitados?.some((med) => {
        const medNormPedido = normalizeText(med.nombre);
        return medNormPedido.includes(medNorm) || medNorm.includes(medNormPedido);
      })
    );
  };

  const abrirModalCantidad = (pedido) => {
    const medNorm = normalizeText(medicamento.nombre);
    const solicitado = pedido.medicamentosSolicitados?.find((m) =>
      normalizeText(m.nombre).includes(medNorm)
    );
    const yaDespachado = despachos
      .filter((d) => d.pedidoId === pedido.id)
      .reduce((sum, d) => sum + d.cantidad, 0);
    const restante = (solicitado?.cantidad || 0) - yaDespachado;
    if (restante <= 0) {
      Alert.alert('Información', 'Este pedido ya fue atendido completamente');
      return;
    }
    setPedidoSeleccionado(pedido);
    setCantidadInput('');
    setShowCantidadModal(true);
  };

  const agregarDespachoAPedido = (pedido, cantidad) => {
    if (!cantidad || parseInt(cantidad) <= 0) {
      Alert.alert('Error', 'Ingresa una cantidad válida');
      return;
    }
    const cantidadNum = parseInt(cantidad);
    const totalDespachado = despachos.reduce((sum, d) => sum + d.cantidad, 0);
    if (totalDespachado + cantidadNum > medicamento.cantidad) {
      Alert.alert(
        'Error',
        `Stock insuficiente. Disponible: ${medicamento.cantidad - totalDespachado}`
      );
      return;
    }
    const medNorm = normalizeText(medicamento.nombre);
    const solicitado = pedido.medicamentosSolicitados?.find((m) =>
      normalizeText(m.nombre).includes(medNorm)
    );
    if (solicitado && cantidadNum > solicitado.cantidad) {
      Alert.alert('Error', `El pedido solo solicita ${solicitado.cantidad} unidades`);
      return;
    }
    setDespachos([
      ...despachos,
      {
        id: Date.now().toString(),
        pedidoId: pedido.id,
        nombreSolicitante: pedido.nombreSolicitante,
        cantidad: cantidadNum,
        esPedido: true,
        destino: pedido.nombreSolicitante,
      },
    ]);
  };

  const agregarDespachoLibre = () => {
    if (!destinoLibre.trim()) {
      Alert.alert('Error', 'Especifica el destino de la entrega');
      return;
    }
    if (!cantidadLibre || parseInt(cantidadLibre) <= 0) {
      Alert.alert('Error', 'Ingresa una cantidad válida');
      return;
    }
    const cantidadNum = parseInt(cantidadLibre);
    const totalDespachado = despachos.reduce((sum, d) => sum + d.cantidad, 0);
    if (totalDespachado + cantidadNum > medicamento.cantidad) {
      Alert.alert(
        'Error',
        `Stock insuficiente. Disponible: ${medicamento.cantidad - totalDespachado}`
      );
      return;
    }
    setDespachos([
      ...despachos,
      {
        id: Date.now().toString(),
        cantidad: cantidadNum,
        esPedido: false,
        destino: destinoLibre.trim(),
      },
    ]);
    setDestinoLibre('');
    setCantidadLibre('');
  };

  const eliminarDespacho = (id) => setDespachos(despachos.filter((d) => d.id !== id));

  // Función para ejecutar transacción con timeout
  const runTransactionWithTimeout = async (transactionCallback, timeoutMs = 30000) => {
    let timeoutId;

    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('TIMEOUT: La operación tomó demasiado tiempo. Verifica tu conexión.'));
      }, timeoutMs);
    });

    const transactionPromise = runTransaction(db, transactionCallback);

    try {
      const result = await Promise.race([transactionPromise, timeoutPromise]);
      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  };

  const procesarDespachos = async () => {
    if (isProcessing || despachos.length === 0) return;
    const totalDespachado = despachos.reduce((sum, d) => sum + d.cantidad, 0);
    if (totalDespachado > medicamento.cantidad) {
      Alert.alert('Error', `Stock insuficiente. Máximo: ${medicamento.cantidad}`);
      return;
    }
    setIsProcessing(true);
    try {
      await runTransactionWithTimeout(async (transaction) => {
        const medRef = doc(db, 'medicamentos', medicamento.id);
        const medDoc = await transaction.get(medRef);
        if (!medDoc.exists()) throw new Error('El medicamento ya no existe');

        const pedidosMap = new Map();
        for (const despacho of despachos) {
          if (despacho.esPedido) {
            const pedidoRef = doc(db, 'pedidos', despacho.pedidoId);
            const pedidoDoc = await transaction.get(pedidoRef);
            if (!pedidoDoc.exists()) throw new Error(`El pedido ${despacho.pedidoId} ya no existe`);
            pedidosMap.set(despacho.pedidoId, pedidoDoc.data());
          }
        }

        transaction.update(medRef, { cantidad: medDoc.data().cantidad - totalDespachado });

        for (const despacho of despachos) {
          if (despacho.esPedido) {
            const pedidoData = pedidosMap.get(despacho.pedidoId);
            const pedidoRef = doc(db, 'pedidos', despacho.pedidoId);
            const medNorm = normalizeText(medicamento.nombre);
            const nuevosMedicamentos = pedidoData.medicamentosSolicitados
              .map((med) => {
                if (normalizeText(med.nombre).includes(medNorm)) {
                  return { ...med, cantidad: med.cantidad - despacho.cantidad };
                }
                return med;
              })
              .filter((med) => med.cantidad > 0);

            const entregaRef = doc(collection(db, 'entregas'));
            transaction.set(entregaRef, {
              fecha: new Date().toISOString(),
              destino: despacho.destino,
              pedidoId: despacho.pedidoId,
              items: [
                {
                  medicamentoId: medicamento.id,
                  nombre: medicamento.nombre,
                  presentacion: medicamento.presentacion,
                  cantidad: despacho.cantidad,
                  vencimiento: medicamento.vencimiento,
                  ubicacion: medicamento.ubicacion || '',
                },
              ],
              totalItems: 1,
              totalUnidades: despacho.cantidad,
            });

            const updateData = {
              medicamentosSolicitados: nuevosMedicamentos,
              entregasRealizadas: [
                ...(pedidoData.entregasRealizadas || []),
                {
                  entregaId: entregaRef.id,
                  fecha: new Date().toISOString(),
                  items: [
                    {
                      medicamentoId: medicamento.id,
                      nombre: medicamento.nombre,
                      cantidad: despacho.cantidad,
                    },
                  ],
                },
              ],
            };
            if (nuevosMedicamentos.length === 0) {
              updateData.atendido = true;
              updateData.fechaAtencion = new Date().toISOString();
            }
            transaction.update(pedidoRef, updateData);
          } else {
            const entregaRef = doc(collection(db, 'entregas'));
            transaction.set(entregaRef, {
              fecha: new Date().toISOString(),
              destino: despacho.destino,
              items: [
                {
                  medicamentoId: medicamento.id,
                  nombre: medicamento.nombre,
                  presentacion: medicamento.presentacion,
                  cantidad: despacho.cantidad,
                  vencimiento: medicamento.vencimiento,
                  ubicacion: medicamento.ubicacion || '',
                },
              ],
              totalItems: 1,
              totalUnidades: despacho.cantidad,
              esHuérfana: true,
            });
          }
        }
      });

      // Éxito - limpiar y cerrar
      Alert.alert('Éxito', `Se realizaron ${despachos.length} entrega(s) correctamente`, [
        {
          text: 'OK',
          onPress: () => {
            setDespachos([]);
            setDestinoLibre('');
            setCantidadLibre('');
            setIsProcessing(false);
            onSuccess && onSuccess();
          },
        },
      ]);
    } catch (error) {
      console.error('❌ Error detallado en transacción:', error);
      console.error('❌ Mensaje:', error.message);
      console.error('❌ Stack:', error.stack);

      // Determinar tipo de error para mensaje amigable
      let errorMessage = 'No se pudo completar la operación';

      if (error.message?.includes('CORS')) {
        errorMessage = 'Problema de CORS. Revisa las reglas de Firestore.';
      } else if (error.message?.includes('Connection') || error.message?.includes('network')) {
        errorMessage = 'Problema de conexión. Revisa tu internet y vuelve a intentar.';
      } else if (error.message?.includes('permission-denied')) {
        errorMessage = 'No tienes permisos para realizar esta acción.';
      } else if (error.message?.includes('not-found')) {
        errorMessage = 'El medicamento o pedido ya no existe.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      Alert.alert('Error', errorMessage, [
        {
          text: 'OK',
          onPress: () => {
            setIsProcessing(false);
          },
        },
      ]);

      // Asegurar que el spinner se quite en caso de que el Alert falle
      setIsProcessing(false);
    }
  };

  const pedidosRelevantes = getPedidosParaMedicamento();
  const totalDespachado = despachos.reduce((sum, d) => sum + d.cantidad, 0);
  const stockRestante = medicamento ? medicamento.cantidad - totalDespachado : 0;

  if (!medicamento) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <KeyboardAvoidingScrollView>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={onClose}>
            <X color="#6B7280" size={24} />
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>
            Despachar: {medicamento?.nombre}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.content}>
          <View style={styles.medInfoCard}>
            <Text style={styles.medName}>{medicamento?.nombre}</Text>
            <Text style={styles.medPresentation}>{medicamento?.presentacion}</Text>
            {medicamento?.ubicacion && (
              <Text style={styles.medUbicacion}>📍 {medicamento.ubicacion}</Text>
            )}
            <View style={styles.stockContainer}>
              <Text style={styles.stockLabel}>Stock inicial:</Text>
              <Text style={styles.stockValue}>{medicamento?.cantidad} uds</Text>
            </View>
            <View style={styles.stockContainer}>
              <Text style={styles.stockLabel}>Stock restante:</Text>
              <Text
                style={[
                  styles.stockValue,
                  stockRestante < 0 ? styles.stockNegativo : styles.stockPositivo,
                ]}
              >
                {stockRestante} uds
              </Text>
            </View>
          </View>

          {pedidosRelevantes.length > 0 && (
            <View style={styles.pedidosSection}>
              <View style={styles.sectionHeader}>
                <Users color="#7C3AED" size={20} />
                <Text style={styles.sectionTitle}>Pedidos Pendientes</Text>
              </View>
              {pedidosRelevantes.map((pedido) => {
                const medNorm = normalizeText(medicamento.nombre);
                const solicitado = pedido.medicamentosSolicitados?.find((m) =>
                  normalizeText(m.nombre).includes(medNorm)
                );
                const yaDespachado = despachos
                  .filter((d) => d.pedidoId === pedido.id)
                  .reduce((sum, d) => sum + d.cantidad, 0);
                const restantePorSolicitar = (solicitado?.cantidad || 0) - yaDespachado;
                if (restantePorSolicitar <= 0) return null;
                return (
                  <View key={pedido.id} style={styles.pedidoCard}>
                    <View style={styles.pedidoHeader}>
                      <Text style={styles.pedidoNombre}>{pedido.nombreSolicitante}</Text>
                      <Text style={styles.pedidoSolicitado}>
                        Solicita: {solicitado?.cantidad} uds
                      </Text>
                    </View>
                    <View style={styles.pedidoBody}>
                      <Text style={styles.pedidoMedicamento}>
                        {solicitado?.nombre} {solicitado?.presentacion}
                      </Text>
                      <Text style={styles.pedidoRestante}>
                        Restante: {restantePorSolicitar} uds
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.despacharButton}
                      onPress={() => abrirModalCantidad(pedido)}
                    >
                      <Text style={styles.despacharButtonText}>Despachar</Text>
                    </TouchableOpacity>
                    {yaDespachado > 0 && (
                      <Text style={styles.yaDespachado}>Ya despachado: {yaDespachado} uds</Text>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          <View style={styles.destinoLibreSection}>
            <View style={styles.sectionHeader}>
              <UserPlus color="#10B981" size={20} />
              <Text style={styles.sectionTitle}>Despachar sin pedido</Text>
            </View>
            <View style={styles.destinoLibreForm}>
              <TextInput
                style={styles.destinoInput}
                placeholder="Destino (ej: Paciente, Consultorio...)"
                value={destinoLibre}
                onChangeText={setDestinoLibre}
              />
              <View style={styles.despachoRow}>
                <TextInput
                  style={styles.cantidadInput}
                  placeholder="Cantidad"
                  keyboardType="numeric"
                  value={cantidadLibre}
                  onChangeText={setCantidadLibre}
                />
                <TouchableOpacity style={styles.agregarButton} onPress={agregarDespachoLibre}>
                  <Text style={styles.agregarButtonText}>Agregar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {despachos.length > 0 && (
            <View style={styles.despachosLista}>
              <Text style={styles.listaTitle}>Despachos pendientes:</Text>
              {despachos.map((despacho, index) => (
                <View key={despacho.id} style={styles.despachoItem}>
                  <View style={styles.despachoInfo}>
                    <Text style={styles.despachoIndex}>#{index + 1}</Text>
                    <Text style={styles.despachoDestino}>
                      {despacho.esPedido ? despacho.nombreSolicitante : despacho.destino}
                    </Text>
                    <Text style={styles.despachoBadge}>{despacho.cantidad} uds</Text>
                  </View>
                  <TouchableOpacity onPress={() => eliminarDespacho(despacho.id)}>
                    <X color="#DC2626" size={18} />
                  </TouchableOpacity>
                </View>
              ))}
              <View style={styles.totalContainer}>
                <Text style={styles.totalLabel}>Total a despachar:</Text>
                <Text style={styles.totalValue}>{totalDespachado} uds</Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.procesarButton,
                  (despachos.length === 0 || isProcessing) && styles.procesarDisabled,
                ]}
                onPress={procesarDespachos}
                disabled={despachos.length === 0 || isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <>
                    <CheckCircle color="white" size={20} />
                    <Text style={styles.procesarButtonText}>
                      Procesar {despachos.length} despacho(s)
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {stockRestante < 0 && (
            <View style={styles.warningContainer}>
              <AlertCircle color="#DC2626" size={20} />
              <Text style={styles.warningText}>¡Has excedido el stock disponible!</Text>
            </View>
          )}
        </View>

        {/* Modal para cantidad */}
        <Modal visible={showCantidadModal} transparent animationType="fade">
          <View style={styles.modalOverlayCantidad}>
            <View style={styles.modalCantidadContent}>
              <Text style={styles.modalCantidadTitle}>Despachar medicamento</Text>
              <Text style={styles.modalCantidadSubtitle}>
                Pedido de: {pedidoSeleccionado?.nombreSolicitante}
              </Text>
              <TextInput
                style={styles.modalCantidadInput}
                placeholder="Cantidad a despachar"
                keyboardType="numeric"
                value={cantidadInput}
                onChangeText={setCantidadInput}
                autoFocus
              />
              <View style={styles.modalCantidadButtons}>
                <TouchableOpacity
                  style={[styles.modalCantidadButton, styles.modalCantidadCancelar]}
                  onPress={() => {
                    setShowCantidadModal(false);
                    setPedidoSeleccionado(null);
                    setCantidadInput('');
                  }}
                >
                  <Text style={styles.modalCantidadButtonText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalCantidadButton, styles.modalCantidadConfirmar]}
                  onPress={() => {
                    if (cantidadInput && parseInt(cantidadInput) > 0) {
                      agregarDespachoAPedido(pedidoSeleccionado, cantidadInput);
                      setShowCantidadModal(false);
                      setPedidoSeleccionado(null);
                      setCantidadInput('');
                    } else {
                      Alert.alert('Error', 'Ingresa una cantidad válida');
                    }
                  }}
                >
                  <Text style={styles.modalCantidadButtonText}>Despachar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: { padding: 8 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#1F2937', flex: 1, textAlign: 'center' },
  content: { flex: 1, padding: 16 },
  medInfoCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    elevation: 2,
  },
  medName: { fontSize: 20, fontWeight: 'bold', color: '#1F2937' },
  medPresentation: { fontSize: 14, color: '#6B7280', marginTop: 4 },
  medUbicacion: { fontSize: 14, color: '#10B981', marginTop: 4 },
  stockContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  stockLabel: { fontSize: 14, color: '#6B7280' },
  stockValue: { fontSize: 16, fontWeight: 'bold', color: '#1F2937' },
  stockPositivo: { color: '#10B981' },
  stockNegativo: { color: '#DC2626' },
  pedidosSection: { marginBottom: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#374151' },
  pedidoCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    elevation: 1,
  },
  pedidoHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  pedidoNombre: { fontSize: 16, fontWeight: 'bold', color: '#1F2937' },
  pedidoSolicitado: { fontSize: 14, color: '#7C3AED', fontWeight: '600' },
  pedidoBody: { marginBottom: 12 },
  pedidoMedicamento: { fontSize: 14, color: '#4B5563' },
  pedidoRestante: { fontSize: 12, color: '#6B7280', marginTop: 4 },
  despacharButton: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  despacharButtonText: { color: 'white', fontWeight: '600', fontSize: 14 },
  yaDespachado: { fontSize: 12, color: '#10B981', marginTop: 8, fontStyle: 'italic' },
  destinoLibreSection: { marginBottom: 16 },
  destinoLibreForm: { backgroundColor: 'white', padding: 16, borderRadius: 12, elevation: 1 },
  destinoInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    marginBottom: 12,
  },
  despachoRow: { flexDirection: 'row', gap: 8 },
  cantidadInput: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
  },
  agregarButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
  },
  agregarButtonText: { color: 'white', fontWeight: '600', fontSize: 14 },
  despachosLista: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
    elevation: 2,
  },
  listaTitle: { fontSize: 16, fontWeight: 'bold', color: '#1F2937', marginBottom: 12 },
  despachoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  despachoInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  despachoIndex: { fontSize: 12, fontWeight: 'bold', color: '#6B7280' },
  despachoDestino: { fontSize: 14, color: '#1F2937', flex: 1 },
  despachoBadge: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 12,
    color: '#7C3AED',
    fontWeight: '600',
  },
  totalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
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
    borderRadius: 10,
    marginTop: 16,
    gap: 8,
  },
  procesarDisabled: { opacity: 0.5 },
  procesarButtonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
    gap: 8,
  },
  warningText: { color: '#DC2626', fontSize: 14, fontWeight: '500', flex: 1 },
  modalOverlayCantidad: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCantidadContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    width: '80%',
    alignItems: 'center',
  },
  modalCantidadTitle: { fontSize: 20, fontWeight: 'bold', color: '#1F2937', marginBottom: 8 },
  modalCantidadSubtitle: { fontSize: 14, color: '#6B7280', marginBottom: 20, textAlign: 'center' },
  modalCantidadInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    padding: 12,
    fontSize: 18,
    width: '100%',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalCantidadButtons: { flexDirection: 'row', gap: 12, width: '100%' },
  modalCantidadButton: { flex: 1, padding: 12, borderRadius: 10, alignItems: 'center' },
  modalCantidadCancelar: { backgroundColor: '#F3F4F6' },
  modalCantidadConfirmar: { backgroundColor: '#7C3AED' },
  modalCantidadButtonText: { fontSize: 16, fontWeight: '600', color: 'white' },
});
