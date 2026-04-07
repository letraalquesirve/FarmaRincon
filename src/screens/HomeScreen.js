import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { db } from '../../firebaseConfig';
import { collection, onSnapshot, query, orderBy, where, doc, deleteDoc } from 'firebase/firestore';
import {
  Package,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Trash,
  Activity,
  Key,
} from 'lucide-react-native';
import { getDaysUntilExpiry } from '../utils/dateUtils';
import { isAdmin } from '../services/AuthService';

export default function HomeScreen({ navigation, onOpenApiKeyModal, user }) {
  const [medicamentos, setMedicamentos] = useState([]);
  const [showPorVencer, setShowPorVencer] = useState(false);
  const [showVencidos, setShowVencidos] = useState(false);
  const [showInactivos, setShowInactivos] = useState(false);
  const [loading, setLoading] = useState(true);

  const userIsAdmin = isAdmin(user);

  useEffect(() => {
    const q = query(collection(db, 'medicamentos'), orderBy('fechaRegistro', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = [];
      snapshot.forEach((d) => docs.push({ id: d.id, ...d.data() }));
      setMedicamentos(docs);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

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

  if (loading) {
    return (
      <View style={styles.centered}>
        <Activity size={50} color="#7C3AED" />
        <Text style={styles.loadingText}>Cargando estadísticas...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Cabecera con botón de API Key */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Package color="#7C3AED" size={32} />
          <Text style={styles.headerTitle}>Farmacia Iglesia</Text>
          <TouchableOpacity style={styles.apiKeyButton} onPress={onOpenApiKeyModal}>
            <Key color="white" size={20} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Info de usuario */}
      <View style={styles.userInfoCard}>
        <Text style={styles.userName}>👤 {user?.nombre}</Text>
        <Text style={[styles.userType, userIsAdmin ? styles.adminType : styles.userTypeText]}>
          {userIsAdmin ? '🔓 Acceso completo' : '🔒 Solo consulta'}
        </Text>
      </View>

      {/* Tarjetas de estadísticas */}
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{medicamentosActivos.length}</Text>
          <Text style={styles.statLabel}>Medicamentos Activos</Text>
        </View>
        <View style={[styles.statCard, styles.statVigente]}>
          <Text style={styles.statNumber}>{medicamentosVigentes.length}</Text>
          <Text style={styles.statLabel}>Vigentes</Text>
        </View>
        <View style={[styles.statCard, styles.statPorVencer]}>
          <Text style={styles.statNumber}>{medicamentosPorVencer.length}</Text>
          <Text style={styles.statLabel}>Por vencer</Text>
        </View>
        <View style={[styles.statCard, styles.statVencido]}>
          <Text style={styles.statNumber}>{medicamentosVencidos.length}</Text>
          <Text style={styles.statLabel}>Vencidos</Text>
        </View>
      </View>

      {/* Inactivos */}
      {medicamentosInactivos.length > 0 && (
        <TouchableOpacity
          style={styles.inactivosCard}
          onPress={() => setShowInactivos(!showInactivos)}
        >
          <View style={styles.inactivosHeader}>
            <View style={styles.inactivosTitle}>
              <AlertCircle color="#6B7280" size={20} />
              <Text style={styles.inactivosTitleText}>
                Medicamentos Inactivos ({medicamentosInactivos.length})
              </Text>
            </View>
            {showInactivos ? (
              <ChevronUp color="#6B7280" size={20} />
            ) : (
              <ChevronDown color="#6B7280" size={20} />
            )}
          </View>

          {showInactivos && (
            <View style={styles.inactivosList}>
              {medicamentosInactivos.map((med) => (
                <View key={med.id} style={styles.inactivoItem}>
                  <View style={styles.inactivoInfo}>
                    <Text style={styles.inactivoNombre}>{med.nombre}</Text>
                    <Text style={styles.inactivoPresentacion}>{med.presentacion}</Text>
                    <Text style={styles.inactivoFecha}>
                      Dado de baja:{' '}
                      {med.fechaBaja
                        ? new Date(med.fechaBaja).toLocaleDateString()
                        : 'Fecha desconocida'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleDeleteMed(med.id, med.nombre)}
                    style={styles.deleteInactivoButton}
                  >
                    <Trash color="#DC2626" size={18} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </TouchableOpacity>
      )}

      {/* Por vencer */}
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

      {/* Vencidos */}
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
    padding: 30,
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
  userInfoCard: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    elevation: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  userName: { fontSize: 14, fontWeight: '600', color: '#1F2937' },
  userType: { fontSize: 12, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  adminType: { backgroundColor: '#EDE9FE', color: '#7C3AED' },
  userTypeText: { backgroundColor: '#F3F4F6', color: '#6B7280' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 10, gap: 10, marginTop: -20 },
  statCard: {
    flex: 1,
    minWidth: '40%',
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 12,
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
  inactivosCard: {
    backgroundColor: 'white',
    margin: 10,
    borderRadius: 12,
    padding: 10,
    elevation: 2,
  },
  inactivosHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
  },
  inactivosTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inactivosTitleText: { fontSize: 16, fontWeight: '600', color: '#6B7280' },
  inactivosList: { marginTop: 10 },
  inactivoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginBottom: 8,
  },
  inactivoInfo: { flex: 1 },
  inactivoNombre: { fontSize: 14, fontWeight: '600', color: '#1F2937' },
  inactivoPresentacion: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  inactivoFecha: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  deleteInactivoButton: { padding: 8 },
  section: { backgroundColor: 'white', margin: 10, borderRadius: 12, padding: 10, elevation: 2 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
  },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitleText: { fontSize: 16, fontWeight: 'bold' },
  medCard: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginVertical: 5,
    borderLeftWidth: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 1,
  },
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
