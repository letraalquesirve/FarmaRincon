// src/screens/UsuariosScreen.js
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
import { Users, Plus, Shield, User as UserIcon, Trash2, X, Check } from 'lucide-react-native';
import {
  usuariosList,
  usuarioCreate,
  usuarioUpdate,
  usuarioDelete,
  usuarioGetByNombre,
} from '../services/LocalDataService';

export default function UsuariosScreen({ visible, onClose, user: usuarioActual }) {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editando, setEditando] = useState(null); // null = crear, objeto = editar
  const [nombreForm, setNombreForm] = useState('');
  const [tipoForm, setTipoForm] = useState('user');
  const [guardando, setGuardando] = useState(false);

  const cargarUsuarios = useCallback(async () => {
    try {
      const items = await usuariosList();
      setUsuarios(items);
    } catch (error) {
      console.error('Error cargando usuarios:', error);
      Alert.alert('Error', 'No se pudieron cargar los usuarios');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setLoading(true);
      cargarUsuarios();
    }
  }, [visible, cargarUsuarios]);

  const abrirCrear = () => {
    setEditando(null);
    setNombreForm('');
    setTipoForm('user');
    setModalVisible(true);
  };

  const abrirEditar = (item) => {
    setEditando(item);
    setNombreForm(item.nombre);
    setTipoForm(item.tipo || 'user');
    setModalVisible(true);
  };

  const guardar = async () => {
    const nombreLimpio = nombreForm.trim();
    if (!nombreLimpio) {
      Alert.alert('Falta el nombre', 'Escribe el nombre con el que esta persona iniciará sesión');
      return;
    }

    setGuardando(true);
    try {
      // Evitar nombres duplicados (el login busca por nombre, sin distinguir mayúsculas)
      const existente = await usuarioGetByNombre(nombreLimpio);
      const esOtroUsuario = existente && (!editando || existente.id !== editando.id);
      if (esOtroUsuario) {
        Alert.alert('Nombre en uso', 'Ya existe otro usuario con ese nombre');
        setGuardando(false);
        return;
      }

      if (editando) {
        await usuarioUpdate(editando.id, { nombre: nombreLimpio, tipo: tipoForm });
      } else {
        await usuarioCreate({ nombre: nombreLimpio, tipo: tipoForm });
      }

      setModalVisible(false);
      await cargarUsuarios();
    } catch (error) {
      console.error('Error guardando usuario:', error);
      Alert.alert('Error', 'No se pudo guardar el usuario');
    } finally {
      setGuardando(false);
    }
  };

  const confirmarEliminar = (item) => {
    const esUnoMismo = item.nombre.toLowerCase() === (usuarioActual?.nombre || '').toLowerCase();
    Alert.alert(
      'Eliminar usuario',
      esUnoMismo
        ? `${item.nombre} eres tú mismo. Si te eliminas, no podrás volver a iniciar sesión con este nombre. ¿Continuar de todas formas?`
        : `¿Eliminar a ${item.nombre}? Ya no podrá iniciar sesión.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await usuarioDelete(item.id);
              await cargarUsuarios();
            } catch (error) {
              console.error('Error eliminando usuario:', error);
              Alert.alert('Error', 'No se pudo eliminar el usuario');
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.card} onPress={() => abrirEditar(item)}>
      <View style={styles.cardIcon}>
        {item.tipo === 'admin' ? (
          <Shield color="#7C3AED" size={22} />
        ) : (
          <UserIcon color="#6B7280" size={22} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardNombre}>{item.nombre}</Text>
        <Text style={styles.cardTipo}>
          {item.tipo === 'admin' ? 'Administrador' : 'Usuario (solo lectura)'}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => confirmarEliminar(item)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Trash2 color="#DC2626" size={20} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Users color="#7C3AED" size={26} />
            <Text style={styles.headerTitle}>Usuarios ({usuarios.length})</Text>
          </View>
          <TouchableOpacity onPress={onClose}>
            <X color="#6B7280" size={26} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#7C3AED" style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={usuarios}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No hay usuarios registrados todavía</Text>
            }
          />
        )}

        <TouchableOpacity style={styles.fab} onPress={abrirCrear}>
          <Plus color="white" size={26} />
        </TouchableOpacity>

        <Modal visible={modalVisible} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editando ? 'Editar usuario' : 'Nuevo usuario'}
                </Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <X color="#6B7280" size={24} />
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Nombre (con esto inicia sesión)</Text>
              <TextInput
                style={styles.input}
                value={nombreForm}
                onChangeText={setNombreForm}
                placeholder="ej. Maria"
                autoCapitalize="words"
                autoCorrect={false}
              />

              <Text style={styles.label}>Rol</Text>
              <View style={styles.tipoRow}>
                <TouchableOpacity
                  style={[styles.tipoOption, tipoForm === 'user' && styles.tipoOptionActive]}
                  onPress={() => setTipoForm('user')}
                >
                  <UserIcon color={tipoForm === 'user' ? 'white' : '#6B7280'} size={18} />
                  <Text
                    style={[styles.tipoOptionText, tipoForm === 'user' && styles.tipoOptionTextActive]}
                  >
                    Usuario (solo lectura)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tipoOption, tipoForm === 'admin' && styles.tipoOptionActive]}
                  onPress={() => setTipoForm('admin')}
                >
                  <Shield color={tipoForm === 'admin' ? 'white' : '#6B7280'} size={18} />
                  <Text
                    style={[
                      styles.tipoOptionText,
                      tipoForm === 'admin' && styles.tipoOptionTextActive,
                    ]}
                  >
                    Administrador
                  </Text>
                </TouchableOpacity>
              </View>

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
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F3F4F6' },
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F3FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardNombre: { fontSize: 16, fontWeight: '600', color: '#1F2937' },
  cardTipo: { fontSize: 12, color: '#6B7280', marginTop: 2 },
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
  tipoRow: { flexDirection: 'row', gap: 10 },
  tipoOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingVertical: 12,
  },
  tipoOptionActive: {
    backgroundColor: '#7C3AED',
    borderColor: '#7C3AED',
  },
  tipoOptionText: { fontSize: 13, color: '#6B7280', fontWeight: '600' },
  tipoOptionTextActive: { color: 'white' },
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
