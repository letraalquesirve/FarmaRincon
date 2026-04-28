// src/components/CategoriaPicker.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Search, X } from 'lucide-react-native';
import { pb } from '../services/PocketBaseConfig';

export default function CategoriaPicker({
  value,
  onChange,
  onUbicacionChange, // ← Callback cuando se selecciona categoría (envía ubicación)
  placeholder,
  showLabel = true,
}) {
  const [modalVisible, setModalVisible] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [categorias, setCategorias] = useState([]);
  const [categoriasData, setCategoriasData] = useState([]); // Guardar objetos completos
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    cargarCategorias();
  }, []);

  const cargarCategorias = async () => {
    setLoading(true);
    try {
      const result = await pb.collection('categorias').getList(1, 100, {
        sort: 'nombre',
        requestKey: null,
      });
      setCategoriasData(result.items);
      setCategorias(result.items.map((item) => item.nombre));
    } catch (error) {
      console.error('Error cargando categorías:', error);
    } finally {
      setLoading(false);
    }
  };

  const getUbicacionByNombre = (nombreCategoria) => {
    const categoria = categoriasData.find((c) => c.nombre === nombreCategoria);
    return categoria?.ubicacion || '';
  };

  const selectCategoria = (categoriaNombre) => {
    onChange(categoriaNombre);
    const ubicacion = getUbicacionByNombre(categoriaNombre);
    if (onUbicacionChange && ubicacion) {
      onUbicacionChange(ubicacion);
    }
    setModalVisible(false);
    setSearchTerm('');
  };

  const getFilteredCategorias = () => {
    if (!searchTerm.trim()) return categorias;
    const term = searchTerm.toLowerCase().trim();
    return categorias.filter((cat) => cat.toLowerCase().includes(term));
  };

  return (
    <View style={styles.container}>
      {showLabel && <Text style={styles.label}>Categoría</Text>}
      <TouchableOpacity style={styles.pickerButton} onPress={() => setModalVisible(true)}>
        <Text style={[styles.pickerText, !value && styles.placeholderText]}>
          {value || placeholder || 'Seleccionar categoría'}
        </Text>
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Seleccionar Categoría</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X color="#6B7280" size={24} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchContainer}>
              <Search color="#9CA3AF" size={20} />
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar categoría..."
                placeholderTextColor="#9CA3AF"
                value={searchTerm}
                onChangeText={setSearchTerm}
              />
            </View>

            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#7C3AED" />
                <Text style={styles.loadingText}>Cargando categorías...</Text>
              </View>
            ) : (
              <FlatList
                data={getFilteredCategorias()}
                keyExtractor={(item, index) => index.toString()}
                style={styles.list}
                renderItem={({ item }) => {
                  const ubicacion = getUbicacionByNombre(item);
                  return (
                    <TouchableOpacity
                      style={styles.categoryItem}
                      onPress={() => selectCategoria(item)}
                    >
                      <View>
                        <Text style={styles.categoryText}>{item}</Text>
                        {ubicacion ? (
                          <Text style={styles.ubicacionText}>📍 {ubicacion}</Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No se encontraron categorías</Text>
                  </View>
                }
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 5 },
  pickerButton: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    padding: 12,
    justifyContent: 'center',
    minHeight: 48,
  },
  pickerText: { fontSize: 16, color: '#1F2937' },
  placeholderText: { color: '#9CA3AF' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    minHeight: '50%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1F2937' },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 12,
    margin: 16,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 16, marginLeft: 8, color: '#1F2937' },
  list: { flex: 1 },
  categoryItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  categoryText: { fontSize: 16, color: '#1F2937' },
  ubicacionText: { fontSize: 12, color: '#10B981', marginTop: 2 },
  emptyContainer: { alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 14, color: '#9CA3AF' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  loadingText: { marginTop: 10, fontSize: 14, color: '#6B7280' },
});
