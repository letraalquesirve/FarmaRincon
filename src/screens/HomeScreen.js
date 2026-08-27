// src/screens/HomeScreen.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import {
  Package,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Key,
  FileText,
  ClipboardList,
  MinusCircle,
  LogOut,
  Upload,
  Download,
} from 'lucide-react-native';
import { getDaysUntilExpiry, formatDate, getExpiryCategory } from '../utils/dateUtils';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { loadFromVPS, saveToVPS, hasLocalData } from '../services/SyncService';
import { initDatabase, checkTablesStatus, exportDatabaseToFile } from '../services/SQLiteService';
import { medicamentosList, pedidosList, entregasList } from '../services/LocalDataService';

export default function HomeScreen({ onOpenApiKeyModal, user, onLogout }) {
  const navigation = useNavigation();

  // Estados
  const [medicamentos, setMedicamentos] = useState([]);
  const [pedidosPendientes, setPedidosPendientes] = useState([]);
  const [entregasAbiertas, setEntregasAbiertas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [syncing, setSyncing] = useState(false); // Estado para sincronización

  // Estados para las listas filtradas
  const [porVencerList, setPorVencerList] = useState([]);
  const [vencidosList, setVencidosList] = useState([]);
  const [totalActivos, setTotalActivos] = useState(0);
  const [totalVigentes, setTotalVigentes] = useState(0);
  const [totalPorVencer, setTotalPorVencer] = useState(0);
  const [totalVencidos, setTotalVencidos] = useState(0);

  // Estados para collapse
  const [showPorVencer, setShowPorVencer] = useState(false);
  const [showVencidos, setShowVencidos] = useState(false);
  const [showPedidosPendientes, setShowPedidosPendientes] = useState(false);
  const [showEntregasAbiertas, setShowEntregasAbiertas] = useState(false);

  // ─────────────────────────────────────────────────────────────
  // FUNCIONES DE SINCRONIZACIÓN
  // ─────────────────────────────────────────────────────────────

  // Cargar BD desde el servidor
  const handleLoadFromServer = async () => {
    if (syncing) return;

    Alert.alert(
      'Cargar desde servidor',
      '¿Estás seguro? Esto reemplazará TODOS los datos locales con la versión del servidor.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cargar',
          style: 'destructive',
          onPress: async () => {
            setSyncing(true);
            try {
              await loadFromVPS(user?.nombre || 'usuario', (mensaje) => {
                console.log('📡 Sync:', mensaje);
              });
              Alert.alert('Éxito', 'Base de datos cargada desde el servidor');
              await loadData(); // Recargar la UI
            } catch (error) {
              console.error('Error cargando desde servidor:', error);
              Alert.alert('Error', 'No se pudo cargar la base de datos desde el servidor');
            } finally {
              setSyncing(false);
            }
          },
        },
      ]
    );
  };

  // Guardar BD en el servidor
  const handleSaveToServer = async () => {
    if (syncing) return;

    Alert.alert(
      'Guardar en servidor',
      '¿Estás seguro? Esto subirá tus datos locales al servidor, reemplazando la versión remota.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Guardar',
          onPress: async () => {
            setSyncing(true);
            try {
              await saveToVPS(user?.nombre || 'usuario', (mensaje) => {
                console.log('📡 Sync:', mensaje);
              });
              Alert.alert('Éxito', 'Base de datos guardada en el servidor');
            } catch (error) {
              console.error('Error guardando en servidor:', error);
              Alert.alert('Error', 'No se pudo guardar la base de datos en el servidor');
            } finally {
              setSyncing(false);
            }
          },
        },
      ]
    );
  };

  // ─────────────────────────────────────────────────────────────
  // FUNCIONES EXISTENTES (sin cambios)
  // ─────────────────────────────────────────────────────────────

  // Función para filtrar medicamentos - calcula fechas frescas CADA VEZ
  const filtrarMedicamentos = useCallback((items) => {
    if (!items || items.length === 0) return;

    const today = new Date();
    const hoyStr = today.toISOString().split('T')[0];
    const dentro30Dias = new Date();
    dentro30Dias.setDate(today.getDate() + 30);
    const dentro30DiasStr = dentro30Dias.toISOString().split('T')[0];

    console.log('📅 HomeScreen - Hoy UTC:', hoyStr);
    console.log('📅 HomeScreen - Dentro 30 días UTC:', dentro30DiasStr);

    // Solo activos
    const activos = items.filter((m) => m.activo === true);

    const vigentes = [];
    const porVencer = [];
    const vencidos = [];

    activos.forEach((med) => {
      if (!med.vencimiento) {
        vigentes.push(med);
        return;
      }

      // ✅ CRÍTICO: Extraer solo YYYY-MM-DD
      const fechaVen = med.vencimiento.split('T')[0];

      if (fechaVen < hoyStr) {
        vencidos.push(med);
      } else if (fechaVen <= dentro30DiasStr) {
        porVencer.push(med);
      } else {
        vigentes.push(med);
      }
    });

    // Ordenar
    const porVencerOrdenados = [...porVencer].sort((a, b) =>
      (a.vencimiento?.split('T')[0] || '') > (b.vencimiento?.split('T')[0] || '') ? 1 : -1
    );

    const vencidosOrdenados = [...vencidos].sort((a, b) =>
      (b.vencimiento?.split('T')[0] || '') > (a.vencimiento?.split('T')[0] || '') ? 1 : -1
    );

    setPorVencerList(porVencerOrdenados);
    setVencidosList(vencidosOrdenados);
    setTotalActivos(activos.length);
    setTotalVigentes(vigentes.length);
    setTotalPorVencer(porVencer.length);
    setTotalVencidos(vencidos.length);

    console.log('📊 HomeScreen - Activos:', activos.length);
    console.log('📊 HomeScreen - Vigentes:', vigentes.length);
    console.log('📊 HomeScreen - Por vencer:', porVencer.length);
    console.log('📊 HomeScreen - Vencidos:', vencidos.length);

    // Mostrar los primeros 5 por vencer
    porVencerOrdenados.slice(0, 5).forEach((med) => {
      console.log(`   📅 ${med.nombre}: ${med.vencimiento?.split('T')[0]}`);
    });
  }, []);

  // Cargar datos
  const loadData = async () => {
    try {
      // Inicializar SQLite
      await initDatabase();

      // Cargar medicamentos activos desde SQLite local (sin red de por medio)
      const medicamentosActivos = await medicamentosList(true);

      // Cargar pedidos y entregas, y filtrar en JS (igual que antes hacía PocketBase)
      const [todosPedidos, todasEntregas] = await Promise.all([pedidosList(), entregasList()]);

      const pedidosPendientesList = todosPedidos.filter((p) => p.atendido === false);
      const entregasAbiertasList = todasEntregas.filter(
        (e) => e.estado === 'abierta' && !e.pedidoId
      );

      setMedicamentos(medicamentosActivos);
      setPedidosPendientes(pedidosPendientesList);
      setEntregasAbiertas(entregasAbiertasList);

      // Filtrar
      filtrarMedicamentos(medicamentosActivos);

      console.log('📦 HomeScreen - Total medicamentos activos:', medicamentosActivos.length);
    } catch (error) {
      console.error('Error cargando datos:', error);
      Alert.alert('Error', 'No se pudieron cargar los datos');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Carga inicial
  useEffect(() => {
    loadData();
  }, []);

  // Recargar cuando la pantalla recibe foco
  useFocusEffect(
    useCallback(() => {
      console.log('🏠 HomeScreen enfocada - recargando datos');
      loadData();
    }, [])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, []);

  // Navegación
  const navigateToInventoryWithFilter = (medicamento, filterType = null) => {
    const uniqueId = Date.now();
    navigation.reset({
      index: 1,
      routes: [
        { name: 'Inicio' },
        {
          name: 'Inventario',
          params: {
            medicamentoNombre: medicamento?.nombre || '',
            filterType: filterType,
            _timestamp: uniqueId,
            _forceRefresh: true,
          },
        },
      ],
    });
  };

  const navigateToInventoryWithFilterType = (filterType) => {
    const uniqueId = Date.now();
    navigation.reset({
      index: 1,
      routes: [
        { name: 'Inicio' },
        {
          name: 'Inventario',
          params: {
            filterType: filterType,
            _timestamp: uniqueId,
            _forceRefresh: true,
          },
        },
      ],
    });
  };

  const handleUserPress = () => {
    Alert.alert('Cerrar Sesión', `¿Deseas cerrar la sesión de ${user?.nombre || 'usuario'}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: () => onLogout() },
    ]);
  };

  // PDF
  const generatePDFForList = async (lista, title) => {
    if (!lista || lista.length === 0) {
      Alert.alert('Sin datos', `No hay medicamentos para generar el PDF de ${title}`);
      return;
    }

    setGeneratingPDF(true);
    try {
      let tableRows = '';
      lista.forEach((med, index) => {
        tableRows += `
          <tr style="background-color: ${index % 2 === 0 ? '#f9fafb' : 'white'}">
            <td style="padding:8px;border:1px solid #ddd;text-align:center;">${index + 1}</td>
            <td style="padding:8px;border:1px solid #ddd;">${med.nombre || ''}</td>
            <td style="padding:8px;border:1px solid #ddd;">${med.presentacion || ''}</td>
            <td style="padding:8px;border:1px solid #ddd;text-align:center;">${med.cantidad || 0}</td>
            <td style="padding:8px;border:1px solid #ddd;text-align:center;">${formatDate(med.vencimiento)}</td>
           </tr>`;
      });
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
        <style>body{font-family:Arial;padding:20px}th{background:#7C3AED;color:white;padding:8px;}</style></head>
        <body><h2>${title}</h2><p>Total: ${lista.length}</p>
        <table border="1" style="width:100%;border-collapse:collapse;">
          <thead><tr><th>#</th><th>Nombre</th><th>Presentación</th><th>Cantidad</th><th>Vencimiento</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table></body></html>`;
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setGeneratingPDF(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#7C3AED" />
        <Text style={styles.loadingText}>Cargando estadísticas...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Package color="white" size={28} />
          <Text style={styles.headerTitle}>FarmaRincón</Text>
          <TouchableOpacity style={styles.apiKeyButton} onPress={onOpenApiKeyModal}>
            <Key color="white" size={20} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.userBadge} onPress={handleUserPress}>
          <Text style={styles.userName}>👤 {user?.nombre || 'Usuario'}</Text>
          <LogOut color="white" size={18} />
        </TouchableOpacity>
      </View>

      {/* ✅ NUEVOS BOTONES DE SINCRONIZACIÓN */}
      <View style={styles.syncButtonsContainer}>
        <TouchableOpacity
          style={[styles.syncButton, styles.syncButtonLoad]}
          onPress={handleLoadFromServer}
          disabled={syncing}
        >
          {syncing ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <>
              <Download color="white" size={18} />
              <Text style={styles.syncButtonText}>Cargar BD del Server</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.syncButton, styles.syncButtonSave]}
          onPress={handleSaveToServer}
          disabled={syncing}
        >
          {syncing ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <>
              <Upload color="white" size={18} />
              <Text style={styles.syncButtonText}>Salvar BD y Cerrar</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.statsGrid}>
        <TouchableOpacity
          style={styles.statCard}
          onPress={() => navigateToInventoryWithFilterType('todos')}
        >
          <Text style={styles.statNumber}>{totalActivos}</Text>
          <Text style={styles.statLabel}>Activos</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.statCard, styles.statVigente]}
          onPress={() => navigateToInventoryWithFilterType('vigentes')}
        >
          <Text style={styles.statNumber}>{totalVigentes}</Text>
          <Text style={styles.statLabel}>Vigentes</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.statCard, styles.statPorVencer]}
          onPress={() => navigateToInventoryWithFilterType('porVencer')}
        >
          <Text style={styles.statNumber}>{totalPorVencer}</Text>
          <Text style={styles.statLabel}>Por vencer</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.statCard, styles.statVencido]}
          onPress={() => navigateToInventoryWithFilterType('vencidos')}
        >
          <Text style={styles.statNumber}>{totalVencidos}</Text>
          <Text style={styles.statLabel}>Vencidos</Text>
        </TouchableOpacity>
      </View>

      {pedidosPendientes.length > 0 && (
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setShowPedidosPendientes(!showPedidosPendientes)}
          >
            <View style={styles.sectionTitle}>
              <ClipboardList color="#7C3AED" size={20} />
              <Text style={[styles.sectionTitleText, { color: '#7C3AED' }]}>
                Pedidos Pendientes ({pedidosPendientes.length})
              </Text>
            </View>
            {showPedidosPendientes ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </TouchableOpacity>
          {showPedidosPendientes &&
            pedidosPendientes.map((pedido) => (
              <View key={pedido.id} style={styles.pedidoCard}>
                <Text style={styles.pedidoNombre}>{pedido.nombreSolicitante}</Text>
                <Text style={styles.pedidoInfo}>
                  {pedido.medicamentosSolicitados?.length || 0} medicamentos
                </Text>
              </View>
            ))}
        </View>
      )}

      {entregasAbiertas.length > 0 && (
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setShowEntregasAbiertas(!showEntregasAbiertas)}
          >
            <View style={styles.sectionTitle}>
              <MinusCircle color="#EA580C" size={20} />
              <Text style={[styles.sectionTitleText, { color: '#EA580C' }]}>
                Entregas Abiertas ({entregasAbiertas.length})
              </Text>
            </View>
            {showEntregasAbiertas ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </TouchableOpacity>
          {showEntregasAbiertas &&
            entregasAbiertas.map((entrega) => (
              <View key={entrega.id} style={styles.entregaCard}>
                <Text style={styles.entregaDestino}>{entrega.destino}</Text>
                <Text style={styles.entregaInfo}>{entrega.items?.length || 0} medicamentos</Text>
              </View>
            ))}
        </View>
      )}

      {porVencerList.length > 0 && (
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setShowPorVencer(!showPorVencer)}
          >
            <View style={styles.sectionTitle}>
              <AlertCircle color="#EA580C" size={20} />
              <Text style={[styles.sectionTitleText, { color: '#EA580C' }]}>
                Por Vencer ({porVencerList.length})
              </Text>
              <TouchableOpacity
                onPress={() => generatePDFForList(porVencerList, 'Por Vencer')}
                style={styles.pdfIconButton}
              >
                <FileText size={16} color="#EA580C" />
              </TouchableOpacity>
            </View>
            {showPorVencer ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </TouchableOpacity>
          {showPorVencer &&
            porVencerList.slice(0, 5).map((med) => (
              <TouchableOpacity
                key={med.id}
                style={styles.medCard}
                onPress={() => navigateToInventoryWithFilter(med, 'porVencer')}
              >
                <Text style={styles.medName}>{med.nombre}</Text>
                <Text style={styles.medInfo}>
                  {med.presentacion || 'Sin presentación'} • {med.cantidad} uds • Vence en{' '}
                  {getDaysUntilExpiry(med.vencimiento)} días ({formatDate(med.vencimiento)})
                </Text>
              </TouchableOpacity>
            ))}
          {porVencerList.length > 5 && (
            <TouchableOpacity onPress={() => navigateToInventoryWithFilterType('porVencer')}>
              <Text style={styles.viewAll}>Ver todos los {porVencerList.length}...</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {vencidosList.length > 0 && (
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setShowVencidos(!showVencidos)}
          >
            <View style={styles.sectionTitle}>
              <AlertCircle color="#DC2626" size={20} />
              <Text style={[styles.sectionTitleText, { color: '#DC2626' }]}>
                Vencidos ({vencidosList.length})
              </Text>
              <TouchableOpacity
                onPress={() => generatePDFForList(vencidosList, 'Vencidos')}
                style={styles.pdfIconButton}
              >
                <FileText size={16} color="#DC2626" />
              </TouchableOpacity>
            </View>
            {showVencidos ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </TouchableOpacity>
          {showVencidos &&
            vencidosList.slice(0, 5).map((med) => (
              <TouchableOpacity
                key={med.id}
                style={[styles.medCard, styles.medCardVencido]}
                onPress={() => navigateToInventoryWithFilter(med, 'vencidos')}
              >
                <Text style={styles.medName}>{med.nombre}</Text>
                <Text style={styles.medInfo}>
                  {med.presentacion || 'Sin presentación'} • {med.cantidad} uds • Venció el{' '}
                  {formatDate(med.vencimiento)} (hace{' '}
                  {Math.abs(getDaysUntilExpiry(med.vencimiento))} días)
                </Text>
              </TouchableOpacity>
            ))}
          {vencidosList.length > 5 && (
            <TouchableOpacity onPress={() => navigateToInventoryWithFilterType('vencidos')}>
              <Text style={styles.viewAll}>Ver todos los {vencidosList.length}...</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F3F4F6' },
  loadingText: { marginTop: 10, fontSize: 14, color: '#6B7280' },
  header: {
    backgroundColor: '#7C3AED',
    padding: 20,
    paddingTop: 15,
    paddingBottom: 15,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  apiKeyButton: { backgroundColor: 'rgba(255,255,255,0.2)', padding: 8, borderRadius: 20 },
  headerTitle: { color: 'white', fontSize: 22, fontWeight: 'bold' },
  userBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 12,
  },
  userName: { fontSize: 12, fontWeight: '600', color: 'white' },

  // ✅ NUEVOS ESTILOS PARA BOTONES DE SINCRONIZACIÓN
  syncButtonsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  syncButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  syncButtonLoad: {
    backgroundColor: '#3B82F6',
  },
  syncButtonSave: {
    backgroundColor: '#10B981',
  },
  syncButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 12 },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 16,
    alignItems: 'center',
    elevation: 2,
  },
  statVigente: { backgroundColor: '#DCFCE7' },
  statPorVencer: { backgroundColor: '#FFEDD5' },
  statVencido: { backgroundColor: '#FEE2E2' },
  statNumber: { fontSize: 28, fontWeight: 'bold', color: '#1F2937' },
  statLabel: { fontSize: 12, color: '#6B7280', marginTop: 5 },
  pdfIconButton: { marginLeft: 8, padding: 4 },
  section: { backgroundColor: 'white', margin: 12, borderRadius: 12, padding: 12, elevation: 2 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 8,
  },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  sectionTitleText: { fontSize: 16, fontWeight: 'bold' },
  medCard: {
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 10,
    marginVertical: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#EA580C',
  },
  medCardVencido: { borderLeftColor: '#DC2626' },
  medName: { fontSize: 14, fontWeight: '600', color: '#1F2937' },
  medInfo: { fontSize: 11, color: '#6B7280', marginTop: 4 },
  pedidoCard: {
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 10,
    marginVertical: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#7C3AED',
  },
  pedidoNombre: { fontSize: 14, fontWeight: '600', color: '#1F2937' },
  pedidoInfo: { fontSize: 11, color: '#6B7280', marginTop: 4 },
  entregaCard: {
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 10,
    marginVertical: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#EA580C',
  },
  entregaDestino: { fontSize: 14, fontWeight: '600', color: '#1F2937' },
  entregaInfo: { fontSize: 11, color: '#6B7280', marginTop: 4 },
  viewAll: { textAlign: 'center', color: '#7C3AED', marginTop: 8, fontSize: 12, fontWeight: '500' },
});
