import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
} from 'react-native';
import { db } from '../../firebaseConfig';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, where } from 'firebase/firestore';
import { Search, Package, Trash, Filter, X, AlertCircle } from 'lucide-react-native';
import { getDaysUntilExpiry } from '../utils/dateUtils';

export default function InventoryScreen() {
  const [medicamentos, setMedicamentos] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('todos'); // todos, vigentes, porVencer, vencidos
  const [showFilters, setShowFilters] = useState(false);
  const [showInactivos, setShowInactivos] = useState(false);

  useEffect(() => {
    // Mostrar solo activos por defecto, o todos si showInactivos es true
    const constraints = showInactivos 
      ? [] 
      : [where("activo", "==", true)];
    
    const q = query(
      collection(db, "medicamentos"),
      ...constraints,
      orderBy("nombre", "asc")
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = [];
      snapshot.forEach(d => docs.push({ id: d.id, ...d.data() }));
      setMedicamentos(docs);
    });
    return () => unsubscribe();
  }, [showInactivos]);

  const getFilteredMeds = () => {
    let filtered = medicamentos;

    if (searchTerm) {
      filtered = filtered.filter(m => 
        m.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.presentacion?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.categoria?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    switch(filter) {
      case 'vigentes':
        filtered = filtered.filter(m => getDaysUntilExpiry(m.vencimiento) > 30);
        break;
      case 'porVencer':
        filtered = filtered.filter(m => {
          const days = getDaysUntilExpiry(m.vencimiento);
          return days >= 0 && days <= 30;
        });
        break;
      case 'vencidos':
        filtered = filtered.filter(m => getDaysUntilExpiry(m.vencimiento) < 0);
        break;
    }

    return filtered;
  };

  // Soft Delete: en lugar de eliminar, marcamos como inactivo
  const handleSoftDelete = (medId, medName) => {
    Alert.alert(
      "Desactivar Medicamento",
      `¿Estás seguro de desactivar ${medName}?\n\nEl medicamento dejará de estar disponible para nuevos pedidos, pero se conservará el historial de entregas y pedidos anteriores.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Desactivar",
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'medicamentos', medId), {
                activo: false,
                fechaBaja: new Date().toISOString()
              });
              Alert.alert("Éxito", "Medicamento desactivado");
            } catch (error) {
              Alert.alert("Error", "No se pudo desactivar");
            }
          },
          style: "destructive"
        }
      ]
    );
  };

  // Reactivar medicamento
  const handleReactivar = (medId, medName) => {
    Alert.alert(
      "Reactivar Medicamento",
      `¿Reactivar ${medName}?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Reactivar",
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'medicamentos', medId), {
                activo: true,
                fechaBaja: null
              });
              Alert.alert("Éxito", "Medicamento reactivado");
            } catch (error) {
              Alert.alert("Error", "No se pudo reactivar");
            }
          }
        }
      ]
    );
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

  const filteredMeds = getFilteredMeds();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.searchContainer}>
          <Search color="#9CA3AF" size={20} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar medicamento..."
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
            <AlertCircle color={showInactivos ? "white" : "#6B7280"} size={20} />
            <Text style={[styles.inactivosButtonText, showInactivos && styles.inactivosButtonTextActive]}>
              Ver inactivos
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {showFilters && (
        <View style={styles.filtersContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <TouchableOpacity
              style={[styles.filterChip, filter === 'todos' && styles.filterChipActive]}
              onPress={() => setFilter('todos')}
            >
              <Text style={[styles.filterChipText, filter === 'todos' && styles.filterChipTextActive]}>
                Todos ({medicamentos.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterChip, filter === 'vigentes' && styles.filterChipActive]}
              onPress={() => setFilter('vigentes')}
            >
              <Text style={[styles.filterChipText, filter === 'vigentes' && styles.filterChipTextActive]}>
                Vigentes
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterChip, filter === 'porVencer' && styles.filterChipActive]}
              onPress={() => setFilter('porVencer')}
            >
              <Text style={[styles.filterChipText, filter === 'porVencer' && styles.filterChipTextActive]}>
                Por vencer
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterChip, filter === 'vencidos' && styles.filterChipActive]}
              onPress={() => setFilter('vencidos')}
            >
              <Text style={[styles.filterChipText, filter === 'vencidos' && styles.filterChipTextActive]}>
                Vencidos
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      <ScrollView style={styles.content}>
        {filteredMeds.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Package color="#D1D5DB" size={64} />
            <Text style={styles.emptyTitle}>No hay medicamentos</Text>
            <Text style={styles.emptyText}>
              {searchTerm ? 'Intenta con otra búsqueda' : 
               showInactivos ? 'No hay medicamentos inactivos' :
               'Agrega medicamentos desde la pestaña Registrar'}
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.resultsText}>
              {filteredMeds.length} {filteredMeds.length === 1 ? 'medicamento' : 'medicamentos'} encontrados
            </Text>
            
            {filteredMeds.map(med => (
              <View key={med.id} style={[
                styles.card, 
                getStatusColor(med.vencimiento),
                med.activo === false && styles.cardInactivo
              ]}>
                <View style={styles.cardContent}>
                  <View style={styles.cardHeader}>
                    <View style={styles.medInfo}>
                      <Text style={styles.medName}>
                        {med.nombre}
                        {med.activo === false && (
                          <Text style={styles.inactivoTag}> (Inactivo)</Text>
                        )}
                      </Text>
                      <Text style={styles.medPresentation}>{med.presentacion}</Text>
                      <Text style={styles.medCategory}>📋 {med.categoria}</Text>
                    </View>
                    {med.imagen && (
                      <Image source={{ uri: med.imagen }} style={styles.medImage} />
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
                        <Text style={styles.statusText}>
                          {getStatusText(med.vencimiento)}
                        </Text>
                      </View>
                    </View>

                    {med.fechaBaja && (
                      <Text style={styles.fechaBaja}>
                        Dado de baja: {new Date(med.fechaBaja).toLocaleDateString()}
                      </Text>
                    )}
                  </View>

                  {med.activo === false ? (
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
                      <Trash color="#DC2626" size={20} />
                      <Text style={styles.deleteButtonText}>Desactivar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
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
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
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
  filterButtonText: {
    color: '#7C3AED',
    fontWeight: '600',
  },
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
  inactivosButtonActive: {
    backgroundColor: '#6B7280',
  },
  inactivosButtonText: {
    color: '#6B7280',
    fontWeight: '600',
  },
  inactivosButtonTextActive: {
    color: 'white',
  },
  filtersContainer: {
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingBottom: 12,
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
  resultsText: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
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
  cardInactivo: {
    opacity: 0.7,
    backgroundColor: '#F3F4F6',
  },
  vigente: {
    borderLeftWidth: 4,
    borderLeftColor: '#22C55E',
  },
  porVencer: {
    borderLeftWidth: 4,
    borderLeftColor: '#EA580C',
  },
  vencido: {
    borderLeftWidth: 4,
    borderLeftColor: '#DC2626',
  },
  cardContent: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  medInfo: {
    flex: 1,
  },
  medName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  inactivoTag: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: 'normal',
  },
  medPresentation: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 2,
  },
  medCategory: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  medImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginLeft: 12,
  },
  medDetails: {
    marginBottom: 12,
  },
  quantityContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  quantityLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  quantityValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  expiryContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  expiryLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  expiryValue: {
    fontSize: 14,
    color: '#4B5563',
  },
  statusContainer: {
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  fechaBaja: {
    fontSize: 11,
    color: '#9CA3AF',
    fontStyle: 'italic',
    marginTop: 4,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    marginTop: 8,
    gap: 8,
  },
  deleteButtonText: {
    color: '#DC2626',
    fontWeight: '600',
  },
  reactivarButton: {
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  reactivarButtonText: {
    color: 'white',
    fontWeight: '600',
  },
});