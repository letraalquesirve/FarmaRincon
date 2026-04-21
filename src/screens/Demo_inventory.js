import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { pb } from '../services/PocketBaseConfig';

const InventoryScreen = () => {
  const navigation = useNavigation();
  const [activos, setActivos] = useState([]);
  const [filteredActivos, setFilteredActivos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  // ── Ref para evitar cargas simultáneas ──────────────────────
  // El SDK de PocketBase cancela requests duplicados (autocancellation).
  // Con este ref garantizamos que solo corre una carga a la vez.
  const isLoadingRef = useRef(false);

  // ── Función de carga principal ───────────────────────────────
  const loadActivos = useCallback(
    async (isRefresh = false) => {
      if (isLoadingRef.current) return; // ✅ evitar llamadas simultáneas
      isLoadingRef.current = true;

      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const records = await pb.collection('medicamentos').getFullList({
          sort: 'nombre',
          filter: 'activo = true',
          // ✅ requestKey null desactiva autocancellation para esta llamada
          requestKey: null,
        });
        setActivos(records);
        setFilteredActivos(
          search.trim()
            ? records.filter(
                (item) =>
                  item.nombre?.toLowerCase().includes(search.toLowerCase()) ||
                  item.presentacion?.toLowerCase().includes(search.toLowerCase())
              )
            : records
        );
      } catch (error) {
        if (!error.isAbort) {
          console.error('Error cargando activos:', error);
          Alert.alert('Error', 'No se pudo conectar con el servidor.');
        }
      } finally {
        isLoadingRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [search]
  );

  // ── Recarga automática al ganar foco ─────────────────────────
  useFocusEffect(
    useCallback(() => {
      loadActivos();
    }, [])
  );

  // ── Pull-to-refresh manual ───────────────────────────────────
  const handleRefresh = () => loadActivos(true);

  // ── Búsqueda / filtro ────────────────────────────────────────
  const handleSearch = (text) => {
    setSearch(text);
    if (!text.trim()) {
      setFilteredActivos(activos);
    } else {
      const lower = text.toLowerCase();
      setFilteredActivos(
        activos.filter(
          (item) =>
            item.nombre?.toLowerCase().includes(lower) ||
            item.presentacion?.toLowerCase().includes(lower)
        )
      );
    }
  };

  // ── Eliminar ─────────────────────────────────────────────────
  const deleteActivo = (id) => {
    Alert.alert('Confirmar', '¿Deseas eliminar este medicamento?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await pb.collection('medicamentos').delete(id);
            loadActivos();
          } catch (error) {
            Alert.alert('Error', 'No se pudo eliminar el registro.');
          }
        },
      },
    ]);
  };

  // ── Duplicar ─────────────────────────────────────────────────
  const duplicateActivo = async (item) => {
    try {
      const { id, created, updated, collectionId, collectionName, ...dataToCopy } = item;
      await pb.collection('medicamentos').create({
        ...dataToCopy,
        nombre: `${dataToCopy.nombre} (Copia)`,
      });
      await loadActivos();
      Alert.alert('Éxito', 'Medicamento duplicado correctamente.');
    } catch (error) {
      Alert.alert('Error', 'No se pudo duplicar.');
    }
  };

  // ── Render item ───────────────────────────────────────────────
  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.info}>
        <Text style={styles.title}>{item.nombre}</Text>
        <Text style={styles.subtitle}>
          {item.presentacion} — Stock: {item.cantidad}
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity onPress={() => navigation.navigate('Register', { editItem: item })}>
          <MaterialIcons name="edit" size={24} color="#2196F3" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => duplicateActivo(item)} style={{ marginHorizontal: 15 }}>
          <MaterialIcons name="content-copy" size={24} color="#4CAF50" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => deleteActivo(item.id)}>
          <MaterialIcons name="delete" size={24} color="#F44336" />
        </TouchableOpacity>
      </View>
    </View>
  );

  // ── Render ────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <MaterialIcons name="search" size={20} color="#999" />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar medicina..."
          value={search}
          onChangeText={handleSearch}
          clearButtonMode="while-editing"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => handleSearch('')}>
            <MaterialIcons name="close" size={20} color="#999" />
          </TouchableOpacity>
        )}
      </View>

      {loading && activos.length === 0 ? (
        <ActivityIndicator size="large" color="#0000ff" style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={filteredActivos}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={['#2196F3']}
            />
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {search
                ? 'Sin resultados para esa búsqueda.'
                : 'No hay medicamentos en el inventario.'}
            </Text>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 15,
    paddingHorizontal: 10,
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },
  searchInput: { flex: 1, paddingVertical: 10, paddingHorizontal: 5, fontSize: 16 },
  list: { paddingBottom: 20 },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 15,
    marginBottom: 10,
    padding: 15,
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 1,
  },
  title: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  subtitle: { fontSize: 14, color: '#666', marginTop: 4 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  emptyText: { textAlign: 'center', marginTop: 50, color: '#999', fontSize: 16 },
});

export default InventoryScreen;
