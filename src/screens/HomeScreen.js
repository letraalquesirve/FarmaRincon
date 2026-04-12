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
import { db } from '../../firebaseConfig';
import { collection, onSnapshot, query, orderBy, where, doc, deleteDoc, limit, startAfter, getDocs } from 'firebase/firestore';
import {
  Package,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Trash,
  Activity,
  Key,
  FileText,
} from 'lucide-react-native';
import { getDaysUntilExpiry } from '../utils/dateUtils';
import { isAdmin } from '../services/AuthService';

export default function HomeScreen({ navigation, onOpenApiKeyModal, user, onLogout }) {
  const [medicamentos, setMedicamentos] = useState([]);
  const [showPorVencer, setShowPorVencer] = useState(false);
  const [showVencidos, setShowVencidos] = useState(false);
  const [showInactivos, setShowInactivos] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Estados para paginación de inactivos
  const [inactivosVisibles, setInactivosVisibles] = useState([]);
  const [ultimoDocInactivos, setUltimoDocInactivos] = useState(null);
  const [cargandoInactivos, setCargandoInactivos] = useState(false);
  const [hayMasInactivos, setHayMasInactivos] = useState(true);
  const [generatingPDF, setGeneratingPDF] = useState(false);

  const userIsAdmin = isAdmin(user);

  // Cargar medicinos activos (sin paginación, son pocos)
  useEffect(() => {
    const q = query(collection(db, 'medicamentos'), orderBy('fechaRegistro', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = [];
      snapshot.forEach((d) => docs.push({ id: d.id, ...d.data() }));
      setMedicamentos(docs);
      setLoading(false);
      setRefreshing(false);
    });
    return () => unsubscribe();
  }, []);

  // Cargar inactivos con paginación cuando se abre la sección
  useEffect(() => {
    if (showInactivos) {
      cargarInactivos(true);
    }
  }, [showInactivos]);

  const cargarInactivos = async (reset = false) => {
    if (cargandoInactivos) return;
    if (!reset && !hayMasInactivos) return;

    setCargandoInactivos(true);
    try {
      let q;
      if (reset) {
        q = query(
          collection(db, 'medicamentos'),
          where('activo', '==', false),
          orderBy('fechaBaja', 'desc'),  // ← Esto requiere índice
          limit(50)
        );
      } else {
        q = query(
          collection(db, 'medicamentos'),
          where('activo', '==', false),
          orderBy('fechaBaja', 'desc'),
          startAfter(ultimoDocInactivos),
          limit(50)
        );
      }

      const snapshot = await getDocs(q);
      const nuevosInactivos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      if (reset) {
        setInactivosVisibles(nuevosInactivos);
      } else {
        setInactivosVisibles(prev => [...prev, ...nuevosInactivos]);
      }

      setUltimoDocInactivos(snapshot.docs[snapshot.docs.length - 1]);
      setHayMasInactivos(snapshot.docs.length === 50);
    } catch (error) {
      console.error('Error cargando inactivos:', error);
    } finally {
      setCargandoInactivos(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    // Recargar inactivos si están abiertos
    if (showInactivos) {
      cargarInactivos(true);
    }
  };

  const handleUserPress = () => {
    Alert.alert('Cerrar Sesión', `¿Deseas cerrar la sesión de ${user?.nombre || 'usuario'}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: () => onLogout() }
    ]);
  };

  const handleDeleteMed = (medId, medName) => {
    Alert.alert(
      'Eliminar Permanentemente',
      `¿Estás SEGURO de eliminar permanentemente ${medName}?\n\nEsta acción NO se puede deshacer y afectará el historial de pedidos y entregas.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'medicamentos', medId));
              Alert.alert('Éxito', 'Medicamento eliminado permanentemente');
            } catch (error) {
              Alert.alert('Error', 'No se pudo eliminar');
            }
          },
          style: 'destructive',
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
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });

      let tableRows = '';
      medicamentosList.forEach((med, index) => {
        const status = med.activo === false ? 'INACTIVO' : (getDaysUntilExpiry(med.vencimiento) < 0 ? 'VENCIDO' :
          (getDaysUntilExpiry(med.vencimiento) <= 30 ? 'POR VENCER' : 'VIGENTE'));

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

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>${title}</title>
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { font-family: 'Helvetica', 'Arial', sans-serif; padding: 20px; background-color: white; }
              .header { text-align: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #7C3AED; }
              .title { font-size: 20px; font-weight: bold; color: #1F2937; margin-bottom: 5px; }
              .subtitle { font-size: 12px; color: #6B7280; }
              .stats { margin-bottom: 15px; padding: 10px; background-color: #F3F4F6; border-radius: 8px; text-align: center; }
              .stats-text { font-size: 12px; color: #374151; }
              table { width: 100%; border-collapse: collapse; font-size: 11px; }
              th { background-color: #7C3AED; color: white; padding: 10px; text-align: left; font-weight: bold; }
              td { padding: 8px; border-bottom: 1px solid #E5E7EB; }
              .footer { margin-top: 20px; padding-top: 10px; text-align: center; font-size: 10px; color: #9CA3AF; border-top: 1px solid #E5E7EB; }
              @media print {
                body { padding: 10px; }
                th { background-color: #7C3AED; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="title">${title}</div>
              <div class="subtitle">Generado: ${today}</div>
            </div>
            <div class="stats">
              <div class="stats-text">${subtitle}: ${medicamentosList.length}</div>
            </div>
            <table>
              <thead>
                <tr><th>#</th><th>Nombre</th><th>Presentación</th><th>Categoría</th><th>Stock</th><th>Vencimiento</th><th>Ubicación</th><th>Estado</th></tr>
              </thead>
              <tbody>${tableRows}</tbody>
            </table>
            <div class="footer">
              <div>Farmacia Iglesia - Sistema de Gestión de Inventario</div>
              <div>Reporte generado automáticamente</div>
            </div>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Compartir reporte' });
      } else {
        Alert.alert('Error', 'No es posible compartir archivos en este dispositivo');
      }
    } catch (error) {
      console.error('Error generando PDF:', error);
      Alert.alert('Error', 'No se pudo generar el PDF');
    } finally {
      setGeneratingPDF(false);
    }
  };

  // Funciones para cada tipo de PDF
  const handlePDFActivos = () => {
    const activos = medicamentos.filter(m => m.activo !== false);
    generatePDFForMedicamentos(activos, 'LISTADO DE MEDICAMENTOS ACTIVOS', 'Total de medicamentos activos');
  };

  const handlePDFVigentes = () => {
    const vigentes = medicamentos.filter(m => m.activo !== false && getDaysUntilExpiry(m.vencimiento) > 30);
    generatePDFForMedicamentos(vigentes, 'LISTADO DE MEDICAMENTOS VIGENTES', 'Medicamentos con vencimiento > 30 días');
  };

  const handlePDFPorVencer = () => {
    const porVencer = medicamentos.filter(m => m.activo !== false && getDaysUntilExpiry(m.vencimiento) >= 0 && getDaysUntilExpiry(m.vencimiento) <= 30);
    generatePDFForMedicamentos(porVencer, 'LISTADO DE MEDICAMENTOS POR VENCER', 'Medicamentos con vencimiento en 0-30 días');
  };

  const handlePDFVencidos = () => {
    const vencidos = medicamentos.filter(m => m.activo !== false && getDaysUntilExpiry(m.vencimiento) < 0);
    generatePDFForMedicamentos(vencidos, 'LISTADO DE MEDICAMENTOS VENCIDOS', 'Medicamentos vencidos');
  };

  const handlePDFInactivos = () => {
    const inactivos = medicamentos.filter(m => m.activo === false);
    generatePDFForMedicamentos(inactivos, 'LISTADO DE MEDICAMENTOS INACTIVOS', 'Total de medicamentos inactivos');
  };

  const medicamentosActivos = medicamentos.filter((m) => m.activo !== false);
  const medicamentosInactivos = medicamentos.filter((m) => m.activo === false);
  const medicamentosVencidos = medicamentosActivos.filter((m) => getDaysUntilExpiry(m.vencimiento) < 0);
  const medicamentosPorVencer = medicamentosActivos.filter((m) => {
    const days = getDaysUntilExpiry(m.vencimiento);
    return days >= 0 && days <= 30;
  });
  const medicamentosVigentes = medicamentosActivos.filter((m) => getDaysUntilExpiry(m.vencimiento) > 30);

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
      {/* Header con usuario dentro */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Package color="#7C3AED" size={32} />
          <Text style={styles.headerTitle}>Farmacia Iglesia</Text>
          <TouchableOpacity style={styles.apiKeyButton} onPress={onOpenApiKeyModal}>
            <Key color="white" size={20} />
          </TouchableOpacity>
        </View>
        {/* Usuario dentro del header */}
        <TouchableOpacity style={styles.userBadge} onPress={handleUserPress}>
          <Text style={styles.userName}>👤 {user?.nombre}</Text>
          <Text style={[styles.userType, userIsAdmin ? styles.adminType : styles.userTypeText]}>
            {userIsAdmin ? '🔓 Admin' : '🔒 Usuario'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Stats Grid con íconos PDF */}
      <View style={styles.statsGrid}>
        <TouchableOpacity style={styles.statCard} onPress={handlePDFActivos} activeOpacity={0.7}>
          <Text style={styles.statNumber}>{medicamentosActivos.length}</Text>
          <Text style={styles.statLabel}>Activos</Text>
          <FileText size={14} color="#7C3AED" style={styles.pdfIcon} />
        </TouchableOpacity>

        <TouchableOpacity style={[styles.statCard, styles.statVigente]} onPress={handlePDFVigentes} activeOpacity={0.7}>
          <Text style={styles.statNumber}>{medicamentosVigentes.length}</Text>
          <Text style={styles.statLabel}>Vigentes</Text>
          <FileText size={14} color="#10B981" style={styles.pdfIcon} />
        </TouchableOpacity>

        <TouchableOpacity style={[styles.statCard, styles.statPorVencer]} onPress={handlePDFPorVencer} activeOpacity={0.7}>
          <Text style={styles.statNumber}>{medicamentosPorVencer.length}</Text>
          <Text style={styles.statLabel}>Por vencer</Text>
          <FileText size={14} color="#EA580C" style={styles.pdfIcon} />
        </TouchableOpacity>

        <TouchableOpacity style={[styles.statCard, styles.statVencido]} onPress={handlePDFVencidos} activeOpacity={0.7}>
          <Text style={styles.statNumber}>{medicamentosVencidos.length}</Text>
          <Text style={styles.statLabel}>Vencidos</Text>
          <FileText size={14} color="#DC2626" style={styles.pdfIcon} />
        </TouchableOpacity>
      </View>

      {/* Inactivos con paginación */}
      {medicamentosInactivos.length > 0 && (
        <View style={styles.inactivosCard}>
          <TouchableOpacity style={styles.inactivosHeader} onPress={() => setShowInactivos(!showInactivos)}>
            <View style={styles.inactivosTitle}>
              <AlertCircle color="#6B7280" size={20} />
              <Text style={styles.inactivosTitleText}>Medicamentos Inactivos ({medicamentosInactivos.length})</Text>
              <TouchableOpacity onPress={handlePDFInactivos} style={styles.inlinePdfButton}>
                <FileText size={16} color="#7C3AED" />
              </TouchableOpacity>
            </View>
            {showInactivos ? <ChevronUp color="#6B7280" size={20} /> : <ChevronDown color="#6B7280" size={20} />}
          </TouchableOpacity>

          {showInactivos && (
            <View style={styles.inactivosList}>
              {inactivosVisibles.map((med) => (
                <View key={med.id} style={styles.inactivoItem}>
                  <View style={styles.inactivoInfo}>
                    <Text style={styles.inactivoNombre}>{med.nombre}</Text>
                    <Text style={styles.inactivoPresentacion}>{med.presentacion}</Text>
                    <Text style={styles.inactivoFecha}>
                      Dado de baja: {med.fechaBaja ? new Date(med.fechaBaja).toLocaleDateString() : 'Fecha desconocida'}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => handleDeleteMed(med.id, med.nombre)} style={styles.deleteInactivoButton}>
                    <Trash color="#DC2626" size={18} />
                  </TouchableOpacity>
                </View>
              ))}
              {cargandoInactivos && (
                <View style={styles.loadingMore}>
                  <ActivityIndicator size="small" color="#7C3AED" />
                  <Text style={styles.loadingMoreText}>Cargando más...</Text>
                </View>
              )}
              {!cargandoInactivos && hayMasInactivos && (
                <TouchableOpacity style={styles.loadMoreButton} onPress={() => cargarInactivos(false)}>
                  <Text style={styles.loadMoreText}>Cargar más</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}

      {/* Por vencer */}
      {medicamentosPorVencer.length > 0 && (
        <View style={styles.section}>
          <TouchableOpacity style={styles.sectionHeader} onPress={() => setShowPorVencer(!showPorVencer)}>
            <View style={styles.sectionTitle}>
              <AlertCircle color="#EA580C" size={20} />
              <Text style={[styles.sectionTitleText, { color: '#EA580C' }]}>Por Vencer ({medicamentosPorVencer.length})</Text>
              <TouchableOpacity onPress={handlePDFPorVencer} style={styles.inlinePdfButton}>
                <FileText size={16} color="#EA580C" />
              </TouchableOpacity>
            </View>
            {showPorVencer ? <ChevronUp color="#EA580C" size={20} /> : <ChevronDown color="#EA580C" size={20} />}
          </TouchableOpacity>

          {showPorVencer && medicamentosPorVencer.map((med) => <MedicamentoCard key={med.id} med={med} status="porVencer" />)}
        </View>
      )}

      {/* Vencidos */}
      {medicamentosVencidos.length > 0 && (
        <View style={styles.section}>
          <TouchableOpacity style={styles.sectionHeader} onPress={() => setShowVencidos(!showVencidos)}>
            <View style={styles.sectionTitle}>
              <AlertCircle color="#DC2626" size={20} />
              <Text style={[styles.sectionTitleText, { color: '#DC2626' }]}>Vencidos ({medicamentosVencidos.length})</Text>
              <TouchableOpacity onPress={handlePDFVencidos} style={styles.inlinePdfButton}>
                <FileText size={16} color="#DC2626" />
              </TouchableOpacity>
            </View>
            {showVencidos ? <ChevronUp color="#DC2626" size={20} /> : <ChevronDown color="#DC2626" size={20} />}
          </TouchableOpacity>

          {showVencidos && medicamentosVencidos.map((med) => <MedicamentoCard key={med.id} med={med} status="vencido" />)}
        </View>
      )}

      {medicamentosActivos.length === 0 && (
        <View style={styles.emptyContainer}>
          <Package color="#D1D5DB" size={64} />
          <Text style={styles.emptyTitle}>No hay medicamentos activos</Text>
          <Text style={styles.emptyText}>Agrega medicamentos desde la pestaña Registrar</Text>
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
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statVigente: { backgroundColor: '#DCFCE7' },
  statPorVencer: { backgroundColor: '#FFEDD5' },
  statVencido: { backgroundColor: '#FEE2E2' },
  statNumber: { fontSize: 28, fontWeight: 'bold', color: '#1F2937' },
  statLabel: { fontSize: 12, color: '#6B7280', marginTop: 5, textAlign: 'center' },
  pdfIcon: { marginTop: 4, opacity: 0.6 },
  inlinePdfButton: { marginLeft: 8, padding: 4 },
  inactivosCard: { backgroundColor: 'white', margin: 12, borderRadius: 12, padding: 12, elevation: 2 },
  inactivosHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 8 },
  inactivosTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  inactivosTitleText: { fontSize: 16, fontWeight: '600', color: '#6B7280', flex: 1 },
  inactivosList: { marginTop: 10 },
  inactivoItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor: '#F9FAFB', borderRadius: 8, marginBottom: 8 },
  inactivoInfo: { flex: 1 },
  inactivoNombre: { fontSize: 14, fontWeight: '600', color: '#1F2937' },
  inactivoPresentacion: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  inactivoFecha: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  deleteInactivoButton: { padding: 8 },
  loadingMore: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 16, gap: 8 },
  loadingMoreText: { fontSize: 12, color: '#6B7280' },
  loadMoreButton: { backgroundColor: '#F3F4F6', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  loadMoreText: { color: '#7C3AED', fontWeight: '600' },
  section: { backgroundColor: 'white', margin: 12, borderRadius: 12, padding: 12, elevation: 2 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 8 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  sectionTitleText: { fontSize: 16, fontWeight: 'bold' },
  medCard: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginVertical: 5, borderLeftWidth: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 1 },
  medInfo: { flex: 1 },
  medName: { fontSize: 16, fontWeight: 'bold', color: '#1F2937' },
  medPresentation: { fontSize: 14, color: '#4B5563', marginTop: 2 },
  medCategory: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  medFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  medQuantity: { fontSize: 14, fontWeight: '600', color: '#1F2937' },
  medExpiry: { fontSize: 12 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', padding: 40, marginTop: 20 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#374151', marginTop: 16 },
  emptyText: { fontSize: 14, color: '#9CA3AF', marginTop: 8, textAlign: 'center' },
});