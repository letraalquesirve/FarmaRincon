// src/components/UbicacionPicker.js
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
  Keyboard,
} from 'react-native';
import { Search, X } from 'lucide-react-native';
import { ubicacionesList } from '../services/LocalDataService';

export default function UbicacionPicker({ value, onChange, placeholder, showLabel = true }) {
  const [modalVisible, setModalVisible] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [ubicaciones, setUbicaciones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [alturaTeclado, setAlturaTeclado] = useState(0);
  useEffect(() => {
    const mostrar = Keyboard.addListener('keyboardDidShow', (e) =>
      setAlturaTeclado(e.endCoordinates.height)
    );
    const ocultar = Keyboard.addListener('keyboardDidHide', () => setAlturaTeclado(0));
    return () => {
      mostrar.remove();
      ocultar.remove();
    };
  }, []);

  useEffect(() => {
    cargarUbicaciones();
  }, []);

  const cargarUbicaciones = async () => {
    setLoading(true);
    try {
      const items = await ubicacionesList();
      setUbicaciones(items.map((item) => item.nombre));
    } catch (error) {
      console.error('Error cargando ubicaciones:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectUbicacion = (nombre) => {
    onChange(nombre);
    setModalVisible(false);
    setSearchTerm('');
  };

  const getFilteredUbicaciones = () => {
    if (!searchTerm.trim()) return ubicaciones;
    const term = searchTerm.toLowerCase().trim();
    return ubicaciones.filter((u) => u.toLowerCase().includes(term));
  };

  return (
    <View style={styles.container}>
      {showLabel && <Text style={styles.label}>Ubicación</Text>}
      <TouchableOpacity style={styles.pickerButton} onPress={() => setModalVisible(true)}>
        <Text style={[styles.pickerText, !value && styles.placeholderText]}>
          {value || placeholder || 'Seleccionar ubicación'}
        </Text>
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { marginBottom: alturaTeclado }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Seleccionar Ubicación</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X color="#6B7280" size={24} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchContainer}>
              <Search color="#9CA3AF" size={20} />
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar ubicación..."
                placeholderTextColor="#9CA3AF"
                value={searchTerm}
                onChangeText={setSearchTerm}
              />
            </View>

            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#7C3AED" />
                <Text style={styles.loadingText}>Cargando ubicaciones...</Text>
              </View>
            ) : (
              <FlatList
                data={getFilteredUbicaciones()}
                keyExtractor={(item, index) => index.toString()}
                style={styles.list}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.itemRow} onPress={() => selectUbicacion(item)}>
                    <Text style={styles.itemText}>{item}</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>
                      {ubicaciones.length === 0
                        ? 'No hay ubicaciones catalogadas todavía - agrégalas desde el ícono de ubicaciones en Inicio'
                        : 'No se encontraron ubicaciones'}
                    </Text>
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
  itemRow: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  itemText: { fontSize: 16, color: '#1F2937' },
  emptyContainer: { alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 14, color: '#9CA3AF', textAlign: 'center' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  loadingText: { marginTop: 10, fontSize: 14, color: '#6B7280' },
});
