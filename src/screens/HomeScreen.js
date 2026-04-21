// src/screens/HomeScreen.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Activity,
  Key,
  FileText,
  ClipboardList,
  MinusCircle,
} from 'lucide-react-native';
import { getDaysUntilExpiry } from '../utils/dateUtils';
import { pb } from '../services/PocketBaseConfig';

export default function HomeScreen({ navigation, onOpenApiKeyModal, user, onLogout }) {
  const [medicamentos, setMedicamentos] = useState([]);
  const [pedidosPendientes, setPedidosPendientes] = useState([]);
  const [entregasAbiertas, setEntregasAbiertas] = useState([]);
  const [showPorVencer, setShowPorVencer] = useState(false);
  const [showVencidos, setShowVencidos] = useState(false);
  const [showInactivos, setShowInactivos] = useState(false);
  const [showPedidosPendientes, setShowPedidosPendientes] = useState(false);
  const [showEntregasAbiertas, setShowEntregasAbiertas] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(false);

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
      const [medicamentosResult, pedidosResult, entregasResult] = await Promise.all([
        pb
          .collection('medicamentos')
          .getList(1, 1000, { sort: '-fechaRegistro', requestKey: null }),
        pb
          .collection('pedidos')
          .getList(1, 100, { filter: 'atendido = false', sort: '-fechaPedido', requestKey: null }),
        pb.collection('entregas').getList(1, 100, {
          filter: 'estado = "abierta"',
          sort: '-fechaCreacion',
          requestKey: null,
        }),
      ]);

      setMedicamentos(medicamentosResult.items);
      setPedidosPendientes(pedidosResult.items);
      setEntregasAbiertas(entregasResult.items);
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

  // ── Realtime subscriptions ──
  const setupRealtimeSubscriptions = useCallback(() => {
    // Limpiar suscripciones anteriores
    subscriptionsRef.current.forEach((unsub) => unsub?.());
    subscriptionsRef.current = [];

    // Suscribirse a cambios en medicamentos
    const medicamentosUnsub = pb.collection('medicamentos').subscribe('*', (e) => {
      console.log('🔄 Cambio en medicamentos (Home):', e.action);
      loadData();
    });

    // Suscribirse a cambios en pedidos
    const pedidosUnsub = pb.collection('pedidos').subscribe('*', (e) => {
      console.log('🔄 Cambio en pedidos (Home):', e.action);
      loadData();
    });

    // Suscribirse a cambios en entregas
    const entregasUnsub = pb.collection('entregas').subscribe('*', (e) => {
      console.log('🔄 Cambio en entregas (Home):', e.action);
      loadData();
    });

    subscriptionsRef.current = [medicamentosUnsub, pedidosUnsub, entregasUnsub];
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

  const handleUserPress = () => {
    Alert.alert('Cerrar Sesión', `¿Deseas cerrar la sesión de ${user?.nombre || 'usuario'}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: () => onLogout() },
    ]);
  };

  const handleDeleteMed = async (medId, medName) => {
    Alert.alert(
      'Eliminar Permanentemente',
      `¿Estás SEGURO de eliminar permanentemente ${medName}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await pb.collection('medicamentos').delete(medId);
              Alert.alert('Éxito', 'Medicamento eliminado permanentemente');
            } catch (error) {
              Alert.alert('Error', 'No se pudo eliminar');
            }
          },
        },
      ]
    );
  };

  const escapeHtml = (text) => {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const generatePDFForMedicamentos = async (medicamentosList, title, subtitle) => {
    if (medicamentosList.length === 0) {
      Alert.alert('Sin datos', `No hay medicamentos para generar el PDF de ${title}`);
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
      medicamentosList.forEach((med, index) => {
        const status =
          med.activo === false
            ? 'INACTIVO'
            : getDaysUntilExpiry(med.vencimiento) < 0
              ? 'VENCIDO'
              : getDaysUntilExpiry(med.vencimiento) <= 30
                ? 'POR VENCER'
                : 'VIGENTE';

        tableRows += `
          <tr style="background-color: ${index % 2 === 0 ? '#f9fafb' : 'white'}">
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; text-align: center;">${index + 1}</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(med.nombre || '')}</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(med.presentacion || '')}</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(med.categoria || '')}</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; text-align: center;">${med.cantidad || 0}</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${new Date(med.vencimiento).toLocaleDateString()}</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(med.ubicacion || '')}</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${status}</td>
          </tr>
      `;
      });

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
        <style>
          *{margin:0;padding:0;box-sizing:border-box}
          body{font-family:'Helvetica','Arial',sans-serif;padding:20px;background:white}
          .header{text-align:center;margin-bottom:20px;padding-bottom:15px;border-bottom:2px solid #7C3AED}
          .title{font-size:20px;font-weight:bold;color:#1F2937;margin-bottom:5px}
          .subtitle{font-size:12px;color:#6B7280}
          .stats{margin-bottom:15px;padding:10px;background:#F3F4F6;border-radius:8px;text-align:center}
          table{width:100%;border-collapse:collapse;font-size:11px}
          th{background:#7C3AED;color:white;padding:10px;text-align:left;font-weight:bold}
          .footer{margin-top:20px;padding-top:10px;text-align:center;font-size:10px;color:#9CA3AF;border-top:1px solid #E5E7EB}
        </style></head><body>
        <div class="header"><div class="title">${title}</div><div class="subtitle">Generado: ${today}</div></div>
        <div class="stats"><div class="stats-text">${subtitle}: ${medicamentosList.length}</div></div>
        <table><thead><tr><th>#</th><th>Nombre</th><th>Presentación</th><th>Categoría</th><th>Stock</th><th>Vencimiento</th><th>Ubicación</th><th>Estado</th></tr></thead>
        <tbody>${tableRows}</tbody></table>
        <div class="footer"><div>FarmaRincón - Sistema de Gestión de Inventario</div></div>
        </body></html>`;

      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Compartir reporte',
        });
      }
    } catch (error) {
      console.error('Error generando PDF:', error);
      Alert.alert('Error', 'No se pudo generar el PDF');
    } finally {
      setGeneratingPDF(false);
    }
  };

  const generatePDFForPedidos = async (pedidosList, title, subtitle) => {
    if (pedidosList.length === 0) return;
    setGeneratingPDF(true);
    try {
      const today = new Date().toLocaleDateString('es-ES');
      let tableRows = '';
      pedidosList.forEach((pedido, index) => {
        tableRows += `<tr><td>${index + 1}</td><td>${escapeHtml(pedido.nombreSolicitante || '')}</td><td>${pedido.medicamentosSolicitados?.length || 0}</td><td>${new Date(pedido.fechaPedido).toLocaleDateString()}</td></tr>`;
      });
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
        <style>body{font-family:Arial;padding:20px}th{background:#7C3AED;color:white}</style></head>
        <body><h2>${title}</h2><p>${subtitle}: ${pedidosList.length}</p>
        <table border="1"><tr><th>#</th><th>Solicitante</th><th>Medicamentos</th><th>Fecha</th></tr>
        ${tableRows}</table></body></html>`;
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
    } finally {
      setGeneratingPDF(false);
    }
  };

  const generatePDFForEntregas = async (entregasList, title, subtitle) => {
    if (entregasList.length === 0) return;
    setGeneratingPDF(true);
    try {
      const today = new Date().toLocaleDateString('es-ES');
      let tableRows = '';
      entregasList.forEach((entrega, index) => {
        tableRows += `<tr><td>${index + 1}</td><td>${escapeHtml(entrega.destino || '')}</td><td>${entrega.items?.length || 0}</td><td>${new Date(entrega.fechaCreacion).toLocaleDateString()}</td></tr>`;
      });
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
        <style>body{font-family:Arial;padding:20px}th{background:#EA580C;color:white}</style></head>
        <body><h2>${title}</h2><p>${subtitle}: ${entregasList.length}</p>
        <table border="1"><tr><th>#</th><th>Destino</th><th>Items</th><th>Fecha</th></tr>
        ${tableRows}</table></body></html>`;
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
    } finally {
      setGeneratingPDF(false);
    }
  };

  const handlePDFActivos = () => {
    const activos = medicamentos.filter((m) => m.activo !== false);
    generatePDFForMedicamentos(
      activos,
      'LISTADO DE MEDICAMENTOS ACTIVOS',
      'Total de medicamentos activos'
    );
  };

  const handlePDFVigentes = () => {
    const vigentes = medicamentos.filter(
      (m) => m.activo !== false && getDaysUntilExpiry(m.vencimiento) > 30
    );
    generatePDFForMedicamentos(
      vigentes,
      'LISTADO DE MEDICAMENTOS VIGENTES',
      'Medicamentos con vencimiento > 30 días'
    );
  };

  const handlePDFPorVencer = () => {
    const porVencer = medicamentos.filter(
      (m) =>
        m.activo !== false &&
        getDaysUntilExpiry(m.vencimiento) >= 0 &&
        getDaysUntilExpiry(m.vencimiento) <= 30
    );
    generatePDFForMedicamentos(
      porVencer,
      'LISTADO DE MEDICAMENTOS POR VENCER',
      'Medicamentos con vencimiento en 0-30 días'
    );
  };

  const handlePDFVencidos = () => {
    const vencidos = medicamentos.filter(
      (m) => m.activo !== false && getDaysUntilExpiry(m.vencimiento) < 0
    );
    generatePDFForMedicamentos(
      vencidos,
      'LISTADO DE MEDICAMENTOS VENCIDOS',
      'Medicamentos vencidos'
    );
  };

  const handlePDFInactivos = () => {
    const inactivos = medicamentos.filter((m) => m.activo === false);
    generatePDFForMedicamentos(
      inactivos,
      'LISTADO DE MEDICAMENTOS INACTIVOS',
      'Total de medicamentos inactivos'
    );
  };

  const handlePDFPedidosPendientes = () => {
    generatePDFForPedidos(
      pedidosPendientes,
      'LISTADO DE PEDIDOS PENDIENTES',
      'Total de pedidos pendientes'
    );
  };

  const handlePDFEntregasAbiertas = () => {
    generatePDFForEntregas(
      entregasAbiertas,
      'LISTADO DE ENTREGAS ABIERTAS',
      'Total de entregas abiertas'
    );
  };

  const medicamentosActivos = medicamentos.filter((m) => m.activo !== false);
  const medicamentosInactivos = medicamentos.filter((m) => m.activo === false);
  const medicamentosVencidos = medicamentosActivos.filter(
    (m) => getDaysUntilExpiry(m.vencimiento) < 0
  );
  const medicamentosPorVencer = medicamentosActivos.filter((m) => {
    const days = getDaysUntilExpiry(m.vencimiento);
    return days >= 0 && days <= 30;
  });
  const medicamentosVigentes = medicamentosActivos.filter(
    (m) => getDaysUntilExpiry(m.vencimiento) > 30
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <Activity size={50} color="#7C3AED" />
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
          <Package color="#7C3AED" size={32} />
          <Text style={styles.headerTitle}>FarmaRincón</Text>
          <TouchableOpacity style={styles.apiKeyButton} onPress={onOpenApiKeyModal}>
            <Key color="white" size={20} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.userBadge} onPress={handleUserPress}>
          <Text style={styles.userName}>👤 {user?.nombre}</Text>
          <Text
            style={[
              styles.userType,
              user?.tipo === 'admin' ? styles.adminType : styles.userTypeText,
            ]}
          >
            {user?.tipo === 'admin' ? '🔓 Admin' : '🔒 Usuario'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsGrid}>
        <TouchableOpacity style={styles.statCard} onPress={handlePDFActivos}>
          <Text style={styles.statNumber}>{medicamentosActivos.length}</Text>
          <Text style={styles.statLabel}>Activos</Text>
          <FileText size={14} color="#7C3AED" style={styles.pdfIcon} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.statCard, styles.statVigente]} onPress={handlePDFVigentes}>
          <Text style={styles.statNumber}>{medicamentosVigentes.length}</Text>
          <Text style={styles.statLabel}>Vigentes</Text>
          <FileText size={14} color="#10B981" style={styles.pdfIcon} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.statCard, styles.statPorVencer]}
          onPress={handlePDFPorVencer}
        >
          <Text style={styles.statNumber}>{medicamentosPorVencer.length}</Text>
          <Text style={styles.statLabel}>Por vencer</Text>
          <FileText size={14} color="#EA580C" style={styles.pdfIcon} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.statCard, styles.statVencido]} onPress={handlePDFVencidos}>
          <Text style={styles.statNumber}>{medicamentosVencidos.length}</Text>
          <Text style={styles.statLabel}>Vencidos</Text>
          <FileText size={14} color="#DC2626" style={styles.pdfIcon} />
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
              <TouchableOpacity onPress={handlePDFPedidosPendientes} style={styles.inlinePdfButton}>
                <FileText size={16} color="#7C3AED" />
              </TouchableOpacity>
            </View>
            {showPedidosPendientes ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </TouchableOpacity>
          {showPedidosPendientes &&
            pedidosPendientes.map((pedido) => (
              <View key={pedido.id} style={styles.pedidoCardCompacto}>
                <Text style={styles.pedidoNombreCompacto}>{pedido.nombreSolicitante}</Text>
                <Text style={styles.pedidoInfoCompacto}>
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
              <TouchableOpacity onPress={handlePDFEntregasAbiertas} style={styles.inlinePdfButton}>
                <FileText size={16} color="#EA580C" />
              </TouchableOpacity>
            </View>
            {showEntregasAbiertas ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </TouchableOpacity>
          {showEntregasAbiertas &&
            entregasAbiertas.map((entrega) => (
              <View key={entrega.id} style={styles.entregaCardCompacto}>
                <Text style={styles.entregaDestinoCompacto}>{entrega.destino}</Text>
                <Text style={styles.entregaInfoCompacto}>
                  {entrega.items?.length || 0} medicamentos
                </Text>
              </View>
            ))}
        </View>
      )}

      {medicamentosPorVencer.length > 0 && (
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setShowPorVencer(!showPorVencer)}
          >
            <View style={styles.sectionTitle}>
              <AlertCircle color="#EA580C" size={20} />
              <Text style={[styles.sectionTitleText, { color: '#EA580C' }]}>
                Por Vencer ({medicamentosPorVencer.length})
              </Text>
              <TouchableOpacity onPress={handlePDFPorVencer} style={styles.inlinePdfButton}>
                <FileText size={16} color="#EA580C" />
              </TouchableOpacity>
            </View>
            {showPorVencer ? (
              <ChevronUp color="#EA580C" size={20} />
            ) : (
              <ChevronDown color="#EA580C" size={20} />
            )}
          </TouchableOpacity>
          {showPorVencer &&
            medicamentosPorVencer.map((med) => (
              <MedicamentoCard key={med.id} med={med} status="porVencer" />
            ))}
        </View>
      )}

      {medicamentosVencidos.length > 0 && (
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setShowVencidos(!showVencidos)}
          >
            <View style={styles.sectionTitle}>
              <AlertCircle color="#DC2626" size={20} />
              <Text style={[styles.sectionTitleText, { color: '#DC2626' }]}>
                Vencidos ({medicamentosVencidos.length})
              </Text>
              <TouchableOpacity onPress={handlePDFVencidos} style={styles.inlinePdfButton}>
                <FileText size={16} color="#DC2626" />
              </TouchableOpacity>
            </View>
            {showVencidos ? (
              <ChevronUp color="#DC2626" size={20} />
            ) : (
              <ChevronDown color="#DC2626" size={20} />
            )}
          </TouchableOpacity>
          {showVencidos &&
            medicamentosVencidos.map((med) => (
              <MedicamentoCard key={med.id} med={med} status="vencido" />
            ))}
        </View>
      )}
    </ScrollView>
  );
}

const MedicamentoCard = ({ med, status }) => {
  const statusColors = {
    vigente: { bg: '#DCFCE7', border: '#22C55E', text: '#166534' },
    porVencer: { bg: '#FFEDD5', border: '#EA580C', text: '#9A3412' },
    vencido: { bg: '#FEE2E2', border: '#DC2626', text: '#991B1B' },
  };
  const colors = statusColors[status] || statusColors.vigente;
  return (
    <View style={[styles.medCard, { borderLeftColor: colors.border }]}>
      <View style={styles.medInfo}>
        <Text style={styles.medName}>{med.nombre}</Text>
        <Text style={styles.medPresentation}>{med.presentacion}</Text>
        <Text style={styles.medCategory}>📋 {med.categoria}</Text>
        <View style={styles.medFooter}>
          <Text style={styles.medQuantity}>{med.cantidad} unidades</Text>
          <Text style={[styles.medExpiry, { color: colors.text }]}>
            {status === 'vencido' ? 'Venció: ' : 'Vence: '}
            {new Date(med.vencimiento).toLocaleDateString()}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F3F4F6' },
  loadingText: { marginTop: 10, fontSize: 14, color: '#6B7280' },
  header: {
    backgroundColor: '#6B21A8',
    padding: 20,
    paddingTop: 15,
    paddingBottom: 15,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  apiKeyButton: { backgroundColor: 'rgba(255,255,255,0.2)', padding: 10, borderRadius: 30 },
  headerTitle: { color: 'white', fontSize: 24, fontWeight: 'bold', flex: 1, textAlign: 'center' },
  userBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 30,
    paddingHorizontal: 15,
    paddingVertical: 8,
    marginTop: 12,
  },
  userName: { fontSize: 14, fontWeight: '600', color: 'white' },
  userType: { fontSize: 11, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  adminType: { backgroundColor: '#EDE9FE', color: '#7C3AED' },
  userTypeText: { backgroundColor: '#F3F4F6', color: '#6B7280' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 12 },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 16,
    alignItems: 'center',
    elevation: 3,
  },
  statVigente: { backgroundColor: '#DCFCE7' },
  statPorVencer: { backgroundColor: '#FFEDD5' },
  statVencido: { backgroundColor: '#FEE2E2' },
  statNumber: { fontSize: 28, fontWeight: 'bold', color: '#1F2937' },
  statLabel: { fontSize: 12, color: '#6B7280', marginTop: 5 },
  pdfIcon: { marginTop: 4, opacity: 0.6 },
  inlinePdfButton: { marginLeft: 8, padding: 4 },
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
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginVertical: 5,
    borderLeftWidth: 4,
    elevation: 1,
  },
  medInfo: { flex: 1 },
  medName: { fontSize: 16, fontWeight: 'bold', color: '#1F2937' },
  medPresentation: { fontSize: 14, color: '#4B5563', marginTop: 2 },
  medCategory: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  medFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  medQuantity: { fontSize: 14, fontWeight: '600', color: '#1F2937' },
  medExpiry: { fontSize: 12 },
  pedidoCardCompacto: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#7C3AED',
  },
  pedidoNombreCompacto: { fontSize: 14, fontWeight: '600', color: '#1F2937' },
  pedidoInfoCompacto: { fontSize: 12, color: '#6B7280', marginTop: 4 },
  entregaCardCompacto: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#EA580C',
  },
  entregaDestinoCompacto: { fontSize: 14, fontWeight: '600', color: '#1F2937' },
  entregaInfoCompacto: { fontSize: 12, color: '#6B7280', marginTop: 4 },
});
