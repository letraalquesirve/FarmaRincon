// src/components/UbicacionesAdminModal.js
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
import { MapPin, Plus, Trash2, X, Check, Pencil } from 'lucide-react-native';
import {
  ubicacionesList,
  ubicacionCreate,
  ubicacionUpdate,
  ubicacionDelete,
  ubicacionGetByNombre,
} from '../services/LocalDataService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function UbicacionesAdminModal({ visible, onClose }) {
  const insets = useSafeAreaInsets();
  const [ubicaciones, setUbicaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formVisible, setFormVisible] = useState(false);
  const [editando, setEditando] = useState(null); // null = crear, objeto = editar
  const [nombreForm, setNombreForm] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const items = await ubicacionesList();
      setUbicaciones(items);
    } catch (error) {
      console.error('Error cargando ubicaciones:', error);
      Alert.alert('Error', 'No se pudieron cargar las ubicaciones');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) cargar();
  }, [visible, cargar]);

  const abrirCrear = () => {
    setEditando(null);
    setNombreForm('');
    setFormVisible(true);
  };

  const abrirEditar = (item) => {
    setEditando(item);
    setNombreForm(item.nombre);
    setFormVisible(true);
  };

  const guardar = async () => {
    const nombreLimpio = nombreForm.trim();
    if (!nombreLimpio) {
      Alert.alert('Falta el nombre', 'Escribe el nombre de la ubicación (ej. "Caja 3-7")');
      return;
    }
    setGuardando(true);
    try {
      const existente = await ubicacionGetByNombre(nombreLimpio);
      const esOtra = existente && (!editando || existente.id !== editando.id);
      if (esOtra) {
        Alert.alert('Ya existe', 'Ya hay una ubicación con ese nombre exacto');
        setGuardando(false);
        return;
      }

      if (editando) {
        await ubicacionUpdate(editando.id, { nombre: nombreLimpio });
      } else {
        await ubicacionCreate({ nombre: nombreLimpio });
      }
      setFormVisible(false);
      await cargar();
    } catch (error) {
      console.error('Error guardando ubicación:', error);
      Alert.alert('Error', 'No se pudo guardar la ubicación');
    } finally {
      setGuardando(false);
    }
  };

  const confirmarEliminar = (item) => {
    Alert.alert(
      'Eliminar ubicación',
      `¿Eliminar "${item.nombre}"? Los medicamentos que ya la tengan asignada no se modifican, pero dejará de aparecer en el selector.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await ubicacionDelete(item.id);
              await cargar();
            } catch (error) {
              console.error('Error eliminando ubicación:', error);
              Alert.alert('Error', 'No se pudo eliminar la ubicación');
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <MapPin color="#7C3AED" size={24} />
            <Text style={styles.headerTitle}>Ubicaciones ({ubicaciones.length})</Text>
          </View>
          <TouchableOpacity onPress={onClose}>
            <X color="#6B7280" size={26} />
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>
          Este catálogo evita que la misma ubicación se escriba de formas distintas (ej. "Caja
          3-7" vs "CJ 3-7"). Al registrar un medicamento, se elige de esta lista en vez de
          escribirla libremente.
        </Text>

        {loading ? (
          <ActivityIndicator size="large" color="#7C3AED" style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={ubicaciones}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No hay ubicaciones catalogadas todavía</Text>
            }
            renderItem={({ item }) => (
              <View style={styles.card}>
                <Text style={styles.cardNombre}>{item.nombre}</Text>
                <View style={{ flexDirection: 'row', gap: 16 }}>
                  <TouchableOpacity onPress={() => abrirEditar(item)}>
                    <Pencil color="#7C3AED" size={20} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => confirmarEliminar(item)}>
                    <Trash2 color="#DC2626" size={20} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        )}

        <TouchableOpacity
          style={[styles.fab, { bottom: 20 + insets.bottom }]}
          onPress={abrirCrear}
        >
          <Plus color="white" size={26} />
        </TouchableOpacity>

        <Modal visible={formVisible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editando ? 'Editar Ubicación' : 'Nueva Ubicación'}</Text>
                <TouchableOpacity onPress={() => setFormVisible(false)}>
                  <X color="#6B7280" size={24} />
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Nombre</Text>
              <TextInput
                style={styles.input}
                value={nombreForm}
                onChangeText={setNombreForm}
                placeholder='ej. "Caja 3-7"'
                autoCapitalize="words"
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
  container: { flex: 1, backgroundColor: 'white' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#1F2937' },
  hint: { fontSize: 12, color: '#6B7280', paddingHorizontal: 20, paddingTop: 12, lineHeight: 17 },
  emptyText: { textAlign: 'center', color: '#9CA3AF', marginTop: 40, fontSize: 14 },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  cardNombre: { fontSize: 15, color: '#1F2937', fontWeight: '600' },
  fab: {
    position: 'absolute',
    right: 20,
    backgroundColor: '#7C3AED',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1F2937' },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
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
    marginTop: 20,
  },
  saveButtonText: { color: 'white', fontSize: 15, fontWeight: 'bold' },
});
