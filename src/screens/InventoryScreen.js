// src/screens/InventoryScreen.js
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  Modal,
  Share,
  Animated,
} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { db } from '../../firebaseConfig';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, where } from 'firebase/firestore';
import {
  Search,
  Package,
  Trash,
  Filter,
  X,
  AlertCircle,
  ZoomIn,
  Share2,
  MinusCircle,
  FileText,
} from 'lucide-react-native';
import { getDaysUntilExpiry } from '../utils/dateUtils';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import { isAdmin } from '../services/AuthService';

const normalizeText = (text) => {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

export default function InventoryScreen({ user }) {
  const [medicamentos, setMedicamentos] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('todos');
  const [showFilters, setShowFilters] = useState(false);
  const [showInactivos, setShowInactivos] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedMedName, setSelectedMedName] = useState('');
  const [generatingPDF, setGeneratingPDF] = useState(false);

  const scale = useRef(new Animated.Value(1)).current;
  const savedScale = useRef(1);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.setValue(savedScale.current * e.scale);
    })
    .onEnd((e) => {
      savedScale.current = savedScale.current * e.scale;
      if (savedScale.current < 0.5) savedScale.current = 0.5;
      if (savedScale.current > 5) savedScale.current = 5;
      scale.setValue(savedScale.current);
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      savedScale.current = 1;
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
    });

  const composed = Gesture.Race(pinchGesture, doubleTap);

  const resetZoom = () => {
    savedScale.current = 1;
    scale.setValue(1);
  };

  useEffect(() => {
    const constraints = showInactivos ? [] : [where('activo', '==', true)];
    const q = query(collection(db, 'medicamentos'), ...constraints, orderBy('nombre', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = [];
      snapshot.forEach((d) => docs.push({ id: d.id, ...d.data() }));
      setMedicamentos(docs);
    });
    return () => unsubscribe();
  }, [showInactivos]);

  const getFilteredMeds = () => {
    let filtered = medicamentos;
    if (searchTerm) {
      const searchNorm = normalizeText(searchTerm);
      filtered = filtered.filter(
        (m) =>
          normalizeText(m.nombre).includes(searchNorm) ||
          normalizeText(m.presentacion || '').includes(searchNorm) ||
          normalizeText(m.categoria || '').includes(searchNorm) ||
          normalizeText(m.ubicacion || '').includes(searchNorm)
      );
    }
    switch (filter) {
      case 'vigentes':
        filtered = filtered.filter((m) => getDaysUntilExpiry(m.vencimiento) > 30);
        break;
      case 'porVencer':
        filtered = filtered.filter((m) => {
          const days = getDaysUntilExpiry(m.vencimiento);
          return days >= 0 && days <= 30;
        });
        break;
      case 'vencidos':
        filtered = filtered.filter((m) => getDaysUntilExpiry(m.vencimiento) < 0);
        break;
    }
    return filtered;
  };

  const getFilterTitle = () => {
    if (showInactivos) {
      return 'LISTADO DE MEDICAMENTOS INACTIVOS';
    }
    switch (filter) {
      case 'vigentes':
        return 'LISTADO DE MEDICAMENTOS VIGENTES';
      case 'porVencer':
        return 'LISTADO DE MEDICAMENTOS POR VENCER';
      case 'vencidos':
        return 'LISTADO DE MEDICAMENTOS VENCIDOS';
      default:
        return 'LISTADO DE MEDICAMENTOS ACTIVOS';
    }
  };

  // En InventoryScreen.js, reemplaza la función generatePDF por esta:

  const generatePDF = async () => {
    // Obtener los mismos medicamentos que se muestran en pantalla
    let filteredMeds = [...medicamentos];

    // Aplicar búsqueda
    if (searchTerm) {
      const searchNorm = normalizeText(searchTerm);
      filteredMeds = filteredMeds.filter(
        (m) =>
          normalizeText(m.nombre).includes(searchNorm) ||
          normalizeText(m.presentacion || '').includes(searchNorm) ||
          normalizeText(m.categoria || '').includes(searchNorm) ||
          normalizeText(m.ubicacion || '').includes(searchNorm)
      );
    }

    // Aplicar filtro de estado (solo si NO estamos viendo inactivos)
    if (!showInactivos) {
      switch (filter) {
        case 'vigentes':
          filteredMeds = filteredMeds.filter((m) => getDaysUntilExpiry(m.vencimiento) > 30);
          break;
        case 'porVencer':
          filteredMeds = filteredMeds.filter((m) => {
            const days = getDaysUntilExpiry(m.vencimiento);
            return days >= 0 && days <= 30;
          });
          break;
        case 'vencidos':
          filteredMeds = filteredMeds.filter((m) => getDaysUntilExpiry(m.vencimiento) < 0);
          break;
      }
    }

    if (filteredMeds.length === 0) {
      Alert.alert('Sin datos', 'No hay medicamentos para generar el PDF');
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

      // Determinar título según lo que se está mostrando
      let title = '';
      if (showInactivos) {
        title = 'LISTADO DE MEDICAMENTOS INACTIVOS';
      } else {
        switch (filter) {
          case 'vigentes':
            title = 'LISTADO DE MEDICAMENTOS VIGENTES';
            break;
          case 'porVencer':
            title = 'LISTADO DE MEDICAMENTOS POR VENCER';
            break;
          case 'vencidos':
            title = 'LISTADO DE MEDICAMENTOS VENCIDOS';
            break;
          default:
            title = 'LISTADO DE MEDICAMENTOS ACTIVOS';
        }
      }

      let tableRows = '';
      filteredMeds.forEach((med, index) => {
        const status = getStatusText(med.vencimiento);
        const statusColor = getStatusColorForPDF(med.vencimiento);

        tableRows += `
        <tr style="background-color: ${index % 2 === 0 ? '#f9fafb' : 'white'}">
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; text-align: center;">${index + 1}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(med.nombre || '')}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(med.presentacion || '')}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(med.categoria || '')}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; text-align: center;">${med.cantidad || 0}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${new Date(med.vencimiento).toLocaleDateString()}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(med.ubicacion || '')}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: ${statusColor}; font-weight: bold;">${status}</td>
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
            <div class="stats-text">Total de medicamentos: ${filteredMeds.length}</div>
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
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Compartir reporte de medicamentos',
        });
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

  const escapeHtml = (text) => {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const handleSoftDelete = (medId, medName) => {
    Alert.alert(
      'Desactivar Medicamento',
      `¿Estás seguro de desactivar ${medName}?\n\nEl medicamento dejará de estar disponible para nuevos pedidos, pero se conservará el historial.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desactivar',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'medicamentos', medId), {
                activo: false,
                fechaBaja: new Date().toISOString(),
              });
              Alert.alert('Éxito', 'Medicamento desactivado');
            } catch {
              Alert.alert('Error', 'No se pudo desactivar');
            }
          },
        },
      ]
    );
  };

  const handleReactivar = (medId, medName) => {
    Alert.alert('Reactivar Medicamento', `¿Reactivar ${medName}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Reactivar',
        onPress: async () => {
          try {
            await updateDoc(doc(db, 'medicamentos', medId), { activo: true, fechaBaja: null });
            Alert.alert('Éxito', 'Medicamento reactivado');
          } catch {
            Alert.alert('Error', 'No se pudo reactivar');
          }
        },
      },
    ]);
  };

  const openImageModal = (imageUri, medName) => {
    if (!imageUri) return;
    resetZoom();
    const fullUri = `data:image/jpeg;base64,${imageUri}`;
    setSelectedImage(fullUri);
    setSelectedMedName(medName);
    setModalVisible(true);
  };

  const closeImageModal = () => {
    resetZoom();
    setModalVisible(false);
  };

  const shareImage = async () => {
    if (!selectedImage) return;
    try {
      await Share.share({
        url: selectedImage,
        message: `Imagen de ${selectedMedName}`,
      });
    } catch (e) {
      Alert.alert('Error', 'No se pudo compartir la imagen');
    }
  };

  const getStatusColor = (fecha) => {
    const days = getDaysUntilExpiry(fecha);
    if (days < 0) return styles.vencido;
    if (days <= 30) return styles.porVencer;
    return styles.vigente;
  };

  const getStatusText = (fecha) => {
    const days = getDaysUntilExpiry(fecha);
    if (days < 0) return 'VENCIDO';
    if (days <= 30) return `Vence en ${days} días`;
    return 'Vigente';
  };

  const getStatusColorForPDF = (fecha) => {
    const days = getDaysUntilExpiry(fecha);
    if (days < 0) return '#DC2626';
    if (days <= 30) return '#EA580C';
    return '#10B981';
  };

  const filteredMeds = getFilteredMeds();
  const userIsAdmin = isAdmin(user);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.searchContainer}>
          <Search color="#9CA3AF" size={20} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar medicamento..."
            placeholderTextColor="#9CA3AF"
            value={searchTerm}
            onChangeText={setSearchTerm}
          />
          {searchTerm !== '' && (
            <TouchableOpacity onPress={() => setSearchTerm('')}>
              <X color="#9CA3AF" size={20} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => setShowFilters(!showFilters)}
          >
            <Filter color="#7C3AED" size={20} />
            <Text style={styles.filterButtonText}>Filtros</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.inactivosButton, showInactivos && styles.inactivosButtonActive]}
            onPress={() => setShowInactivos(!showInactivos)}
          >
            <AlertCircle color={showInactivos ? 'white' : '#6B7280'} size={20} />
            <Text
              style={[
                styles.inactivosButtonText,
                showInactivos && styles.inactivosButtonTextActive,
              ]}
            >
              Ver inactivos
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {showFilters && (
        <View style={styles.filtersContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {[
              { key: 'todos', label: `Todos (${medicamentos.length})` },
              { key: 'vigentes', label: 'Vigentes' },
              { key: 'porVencer', label: 'Por vencer' },
              { key: 'vencidos', label: 'Vencidos' },
            ].map((f) => (
              <TouchableOpacity
                key={f.key}
                style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
                onPress={() => setFilter(f.key)}
              >
                <Text
                  style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}
                >
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <ScrollView style={styles.content}>
        {filteredMeds.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Package color="#D1D5DB" size={64} />
            <Text style={styles.emptyTitle}>No hay medicamentos</Text>
            <Text style={styles.emptyText}>
              {searchTerm
                ? 'Intenta con otra búsqueda'
                : showInactivos
                  ? 'No hay medicamentos inactivos'
                  : 'Agrega medicamentos desde la pestaña Registrar'}
            </Text>
          </View>
        ) : (
          <>
            {/* El botón PDF siempre visible, no condicional */}
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsText}>{filteredMeds.length} encontrados</Text>
              <TouchableOpacity
                style={styles.pdfButton}
                onPress={generatePDF}
                disabled={generatingPDF}
              >
                <FileText color="#7C3AED" size={18} />
                <Text style={styles.pdfButtonText}>PDF</Text>
              </TouchableOpacity>
            </View>

            {filteredMeds.map((med) => {
              const isInactivo = med.activo === false;
              return (
                <View
                  key={med.id}
                  style={[
                    styles.card,
                    getStatusColor(med.vencimiento),
                    isInactivo && styles.cardInactivo,
                  ]}
                >
                  <View style={styles.cardContent}>
                    <View style={styles.cardHeader}>
                      <View style={styles.medInfo}>
                        <Text style={styles.medName}>
                          {med.nombre}
                          {isInactivo && <Text style={styles.inactivoTag}> (Inactivo)</Text>}
                        </Text>
                        <Text style={styles.medPresentation}>{med.presentacion}</Text>
                        <Text style={styles.medCategory}>📋 {med.categoria}</Text>
                        {med.ubicacion && (
                          <Text style={styles.medUbicacion}>📍 {med.ubicacion}</Text>
                        )}
                        {med.userName && (
                          <Text style={styles.medUser}>👤 Registrado por: {med.userName}</Text>
                        )}
                      </View>
                      {med.imagen && (
                        <TouchableOpacity onPress={() => openImageModal(med.imagen, med.nombre)}>
                          <Image
                            source={{ uri: `data:image/jpeg;base64,${med.imagen}` }}
                            style={styles.medImage}
                          />
                          <View style={styles.zoomHint}>
                            <ZoomIn color="white" size={12} />
                          </View>
                        </TouchableOpacity>
                      )}
                    </View>

                    <View style={styles.medDetails}>
                      <View style={styles.quantityContainer}>
                        <Text style={styles.quantityLabel}>Cantidad:</Text>
                        <Text style={styles.quantityValue}>{med.cantidad} uds</Text>
                      </View>
                      <View style={styles.expiryContainer}>
                        <Text style={styles.expiryLabel}>Vencimiento:</Text>
                        <Text style={styles.expiryValue}>
                          {new Date(med.vencimiento).toLocaleDateString()}
                        </Text>
                      </View>
                      <View style={styles.statusContainer}>
                        <View style={[styles.statusBadge, getStatusColor(med.vencimiento)]}>
                          <Text style={styles.statusText}>{getStatusText(med.vencimiento)}</Text>
                        </View>
                      </View>
                      {med.fechaBaja && (
                        <Text style={styles.fechaBaja}>
                          Dado de baja: {new Date(med.fechaBaja).toLocaleDateString()}
                        </Text>
                      )}
                    </View>

                    {/* Botones de acción */}
                    <View style={styles.actionButtons}>
                      {isInactivo ? (
                        <TouchableOpacity
                          style={styles.reactivarButton}
                          onPress={() => handleReactivar(med.id, med.nombre)}
                        >
                          <Text style={styles.reactivarButtonText}>Reactivar</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={styles.deleteButton}
                          onPress={() => handleSoftDelete(med.id, med.nombre)}
                        >
                          <Trash color="#DC2626" size={18} />
                          <Text style={styles.deleteButtonText}>Desactivar</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      {/* Modal de imagen con zoom */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={closeImageModal}
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {selectedMedName}
              </Text>
              <View style={styles.modalActions}>
                <TouchableOpacity onPress={shareImage} style={styles.modalActionBtn}>
                  <Share2 color="white" size={22} />
                </TouchableOpacity>
                <TouchableOpacity onPress={closeImageModal} style={styles.modalActionBtn}>
                  <X color="white" size={24} />
                </TouchableOpacity>
              </View>
            </View>

            <GestureDetector gesture={composed}>
              <Animated.View style={[styles.modalImageWrapper, { transform: [{ scale }] }]}>
                <Image
                  source={{ uri: selectedImage }}
                  style={styles.modalImage}
                  resizeMode="contain"
                  onError={() => Alert.alert('Error', 'No se pudo cargar la imagen')}
                />
              </Animated.View>
            </GestureDetector>

            <Text style={styles.modalHint}>Pellizca para zoom · Doble toque para resetear</Text>
          </View>
        </GestureHandlerRootView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: {
    backgroundColor: 'white',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 16, color: '#1F2937' },
  headerButtons: { flexDirection: 'row', gap: 8 },
  filterButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  filterButtonText: { color: '#7C3AED', fontWeight: '600' },
  inactivosButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  inactivosButtonActive: { backgroundColor: '#6B7280' },
  inactivosButtonText: { color: '#6B7280', fontWeight: '600' },
  inactivosButtonTextActive: { color: 'white' },
  filtersContainer: { backgroundColor: 'white', paddingHorizontal: 16, paddingBottom: 12 },
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
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  resultsText: { fontSize: 14, color: '#6B7280' },
  pdfButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  pdfButtonText: { color: '#7C3AED', fontWeight: '600', fontSize: 12 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#374151', marginTop: 16 },
  emptyText: { fontSize: 14, color: '#9CA3AF', marginTop: 8, textAlign: 'center' },
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    marginBottom: 16,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardInactivo: { opacity: 0.7, backgroundColor: '#E5E7EB' },
  vigente: { borderLeftWidth: 4, borderLeftColor: '#22C55E' },
  porVencer: { borderLeftWidth: 4, borderLeftColor: '#EA580C' },
  vencido: { borderLeftWidth: 4, borderLeftColor: '#DC2626' },
  cardContent: { flex: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  medInfo: { flex: 1 },
  medName: { fontSize: 18, fontWeight: 'bold', color: '#1F2937', marginBottom: 4 },
  inactivoTag: { fontSize: 14, color: '#6B7280', fontWeight: 'normal' },
  medPresentation: { fontSize: 14, color: '#6B7280', marginBottom: 2 },
  medCategory: { fontSize: 12, color: '#9CA3AF' },
  medUbicacion: { fontSize: 12, color: '#10B981', marginTop: 4 },
  medUser: { fontSize: 10, color: '#7C3AED', fontStyle: 'italic', marginTop: 4 },
  medImage: { width: 60, height: 60, borderRadius: 8, marginLeft: 12 },
  zoomHint: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 6,
    padding: 2,
  },
  medDetails: { marginBottom: 12 },
  quantityContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  quantityLabel: { fontSize: 14, color: '#6B7280' },
  quantityValue: { fontSize: 16, fontWeight: 'bold', color: '#1F2937' },
  expiryContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  expiryLabel: { fontSize: 14, color: '#6B7280' },
  expiryValue: { fontSize: 14, color: '#4B5563' },
  statusContainer: { alignItems: 'flex-end', marginBottom: 8 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 12, fontWeight: 'bold' },
  fechaBaja: { fontSize: 11, color: '#9CA3AF', fontStyle: 'italic', marginTop: 4 },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 8,
  },
  deleteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderRadius: 8,
    gap: 6,
    backgroundColor: '#FEE2E2',
  },
  deleteButtonText: { color: '#DC2626', fontWeight: '600' },
  reactivarButton: {
    flex: 1,
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderRadius: 8,
  },
  reactivarButtonText: { color: 'white', fontWeight: '600' },
  modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.97)' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 12,
  },
  modalTitle: { color: 'white', fontSize: 16, fontWeight: 'bold', flex: 1, marginRight: 12 },
  modalActions: { flexDirection: 'row', gap: 4 },
  modalActionBtn: { padding: 8 },
  modalImageWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  modalImage: { width: '100%', height: '100%' },
  modalHint: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
    textAlign: 'center',
    paddingBottom: 24,
  },
});
