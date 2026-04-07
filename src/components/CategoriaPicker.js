import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { db } from '../../firebaseConfig';
import { collection, getDocs } from 'firebase/firestore';
import { Search, X, ChevronDown } from 'lucide-react-native';

export default function CategoriaPicker({ value, onChange, placeholder, showLabel = true }) {
  const [modalVisible, setModalVisible] = useState(false);
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [manualInput, setManualInput] = useState('');

  useEffect(() => {
    cargarCategorias();
  }, []);

  const cargarCategorias = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'categorias'));
      const lista = [];
      querySnapshot.forEach((doc) => {
        lista.push({ id: doc.id, ...doc.data() });
      });
      setCategorias(lista.sort((a, b) => a.nombre.localeCompare(b.nombre)));
    } catch (error) {
      console.error('Error cargando categorías:', error);
    } finally {
      setLoading(false);
    }
  };

  const getFilteredCategorias = () => {
    if (!searchTerm.trim()) return categorias;
    return categorias.filter((cat) => cat.nombre.toLowerCase().includes(searchTerm.toLowerCase()));
  };

  const seleccionarCategoria = (categoria) => {
    onChange(categoria.nombre);
    setModalVisible(false);
    setSearchTerm('');
    setManualInput('');
  };

  const usarManualInput = () => {
    if (manualInput.trim()) {
      onChange(manualInput.trim());
      setModalVisible(false);
      setSearchTerm('');
      setManualInput('');
    }
  };

  return (
    <View style={styles.container}>
      {showLabel && <Text style={styles.label}>Categoría</Text>}
      <TouchableOpacity style={styles.pickerButton} onPress={() => setModalVisible(true)}>
        <Text style={[styles.pickerButtonText, !value && styles.placeholder]}>
          {value || placeholder || 'Seleccionar categoría'}
        </Text>
        <ChevronDown color="#6B7280" size={20} />
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Seleccionar categoría</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X color="#6B7280" size={24} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchContainer}>
              <Search color="#9CA3AF" size={20} />
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar categoría..."
                value={searchTerm}
                onChangeText={setSearchTerm}
              />
            </View>

            {loading ? (
              <ActivityIndicator size="large" color="#7C3AED" style={styles.loader} />
            ) : (
              <>
                <FlatList
                  data={getFilteredCategorias()}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.categoriaItem}
                      onPress={() => seleccionarCategoria(item)}
                    >
                      <Text style={styles.categoriaNombre}>{item.nombre}</Text>
                      <Text style={styles.categoriaDescripcion}>{item.descripcion}</Text>
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                      <Text style={styles.emptyText}>No se encontraron categorías</Text>
                      <View style={styles.manualInputContainer}>
                        <TextInput
                          style={styles.manualInputField}
                          placeholder="O escribe una nueva..."
                          value={manualInput}
                          onChangeText={setManualInput}
                        />
                        <TouchableOpacity style={styles.manualButton} onPress={usarManualInput}>
                          <Text style={styles.manualButtonText}>Usar</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  }
                />
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 5,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    padding: 12,
  },
  pickerButtonText: {
    fontSize: 16,
    color: '#1F2937',
  },
  placeholder: {
    color: '#9CA3AF',
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
    overflow: 'hidden',
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 12,
    margin: 16,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    marginLeft: 8,
  },
  loader: {
    padding: 40,
  },
  categoriaItem: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  categoriaNombre: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2937',
  },
  categoriaDescripcion: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  emptyContainer: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 16,
  },
  manualInputContainer: {
    flexDirection: 'row',
    width: '100%',
    gap: 8,
  },
  manualInputField: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
  },
  manualButton: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  manualButtonText: {
    color: 'white',
    fontWeight: '600',
  },
});
