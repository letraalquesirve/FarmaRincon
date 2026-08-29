// src/components/CategoriasAdminModal.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Tag, Plus, MapPin, Trash2, X, Check } from 'lucide-react-native';
import {
  categoriasList,
  categoriaCreate,
  categoriaUpdate,
  categoriaDelete,
  categoriaGetByNombre,
} from '../services/LocalDataService';

export default function CategoriasAdminModal({ visible, onClose }) {
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formVisible, setFormVisible] = useState(false);
  const [editando, setEditando] = useState(null); // null = crear, objeto = editar
  const [nombreForm, setNombreForm] = useState('');
  const [ubicacionForm, setUbicacionForm] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const items = await categoriasList();
      setCategorias(items);
    } catch (error) {
      console.error('Error cargando categorías:', error);
      Alert.alert('Error', 'No se pudieron cargar las categorías');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setLoading(true);
      cargar();
    }
  }, [visible, cargar]);

  const abrirCrear = () => {
    setEditando(null);
    setNombreForm('');
    setUbicacionForm('');
    setFormVisible(true);
  };

  const abrirEditar = (item) => {
    setEditando(item);
    setNombreForm(item.nombre);
    setUbicacionForm(item.ubicacion || '');
    setFormVisible(true);
  };

  const guardar = async () => {
    const nombreLimpio = nombreForm.trim();
    if (!nombreLimpio) {
      Alert.alert('Falta el nombre', 'Escribe el nombre de la categoría');
      return;
    }

    setGuardando(true);
    try {
      const existente = await categoriaGetByNombre(nombreLimpio);
      const esOtraCategoria = existente && (!editando || existente.id !== editando.id);
      if (esOtraCategoria) {
        Alert.alert('Nombre en uso', 'Ya existe otra categoría con ese nombre');
        setGuardando(false);
        return;
      }

      if (editando) {
        await categoriaUpdate(editando.id, {
          nombre: nombreLimpio,
          ubicacion: ubicacionForm.trim(),
        });
      } else {
        await categoriaCreate({ nombre: nombreLimpio, ubicacion: ubicacionForm.trim() });
      }

      setFormVisible(false);
      await cargar();
    } catch (error) {
      console.error('Error guardando categoría:', error);
      Alert.alert('Error', 'No se pudo guardar la categoría');
    } finally {
      setGuardando(false);
    }
  };

  const confirmarEliminar = (item) => {
    Alert.alert(
      'Eliminar categoría',
      `¿Eliminar "${item.nombre}"? Los medicamentos que ya la tengan asignada no se borran, solo dejará de aparecer en la lista para elegir.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await categoriaDelete(item.id);
              await cargar();
            } catch (error) {
              console.error('Error eliminando categoría:', error);
              Alert.alert('Error', 'No se pudo eliminar la categoría');
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.card} onPress={() => abrirEditar(item)}>
      <View style={styles.cardIcon}>
        <Tag color="#7C3AED" size={20} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardNombre}>{item.nombre}</Text>
        {!!item.ubicacion && (
          <View style={styles.ubicacionRow}>
            <MapPin color="#6B7280" size={12} />
            <Text style={styles.cardUbicacion}>{item.ubicacion}</Text>
          </View>
        )}
      </View>
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => confirmarEliminar(item)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Trash2 color="#DC2626" size={18} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Tag color="#7C3AED" size={24} />
            <Text style={styles.headerTitle}>Categorías ({categorias.length})</Text>
          </View>
          <TouchableOpacity onPress={onClose}>
            <X color="#6B7280" size={26} />
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>
          La ubicación es dónde queda físicamente esa categoría en la farmacia — se usa para
          sugerir el lugar al registrar un medicamento nuevo.
        </Text>

        {loading ? (
          <ActivityIndicator size="large" color="#7C3AED" style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={categorias}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No hay categorías registradas todavía</Text>
            }
          />
        )}

        <TouchableOpacity style={styles.fab} onPress={abrirCrear}>
          <Plus color="white" size={26} />
        </TouchableOpacity>

        <Modal visible={formVisible} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editando ? 'Editar categoría' : 'Nueva categoría'}
                </Text>
                <TouchableOpacity onPress={() => setFormVisible(false)}>
                  <X color="#6B7280" size={24} />
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Nombre de la categoría</Text>
              <TextInput
                style={styles.input}
                value={nombreForm}
                onChangeText={setNombreForm}
                placeholder="ej. Analgésicos"
                autoCapitalize="sentences"
              />

              <Text style={styles.label}>Ubicación física (opcional)</Text>
              <TextInput
                style={styles.input}
                value={ubicacionForm}
                onChangeText={setUbicacionForm}
                placeholder="ej. Estante 2, gaveta B"
              />

              <TouchableOpacity style={styles.saveButton} onPress={guardar} disabled={guardando}>
                {guardando ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <>
                    <Check color="white" size={20} />
                    <Text style={styles.saveButtonText}>Guardar</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 50,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#1F2937' },
  hint: {
    fontSize: 12,
    color: '#6B7280',
    paddingHorizontal: 16,
    paddingTop: 10,
    fontStyle: 'italic',
  },
  emptyText: { textAlign: 'center', color: '#9CA3AF', marginTop: 40, fontSize: 14 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F5F3FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardNombre: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
  ubicacionRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  cardUbicacion: { fontSize: 12, color: '#6B7280' },
  deleteButton: { padding: 6 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#7C3AED',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1F2937' },
  label: { fontSize: 13, fontWeight: '600', color: '#4B5563', marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1F2937',
  },
  saveButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#7C3AED',
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: 24,
  },
  saveButtonText: { color: 'white', fontSize: 15, fontWeight: 'bold' },
});
