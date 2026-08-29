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
import { Tag, Plus, MapPin, Trash2, X, Check, FileText } from 'lucide-react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import {
  categoriasList,
  categoriaCreate,
  categoriaUpdate,
  categoriaDelete,
  categoriaGetByNombre,
  medicamentosList,
} from '../services/LocalDataService';
import { normalizeSearchTerm } from '../utils/normalizeText';

export default function CategoriasAdminModal({ visible, onClose }) {
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formVisible, setFormVisible] = useState(false);
  const [editando, setEditando] = useState(null); // null = crear, objeto = editar
  const [nombreForm, setNombreForm] = useState('');
  const [ubicacionForm, setUbicacionForm] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [generandoPDF, setGenerandoPDF] = useState(false);

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

  // PDF: catálogo completo agrupado por categoría, sin duplicados,
  // solo nombre y presentación (no cantidad ni vencimiento - es un
  // listado de referencia, no un reporte de existencias)
  const generarPDFCategorias = async () => {
    setGenerandoPDF(true);
    try {
      const todosMedicamentos = await medicamentosList(true); // solo activos

      if (todosMedicamentos.length === 0) {
        Alert.alert('Sin datos', 'No hay medicamentos activos para generar el PDF');
        return;
      }

      // Quitar duplicados: misma combinación nombre + presentación
      // (sin distinguir mayúsculas/acentos ni espacios de sobra). Se
      // normaliza cada campo por separado y se usa una clave compuesta
      // (no concatenada) para no arriesgar colisiones de texto.
      const vistos = new Set();
      const sinDuplicados = [];
      for (const med of todosMedicamentos) {
        const clave = JSON.stringify([
          normalizeSearchTerm(med.nombre || ''),
          normalizeSearchTerm(med.presentacion || ''),
        ]);
        if (!vistos.has(clave)) {
          vistos.add(clave);
          sinDuplicados.push(med);
        }
      }

      // Agrupar por categoría (las que no tengan, van a "Sin categoría")
      const grupos = {};
      for (const med of sinDuplicados) {
        const cat = (med.categoria || '').trim() || 'Sin categoría';
        if (!grupos[cat]) grupos[cat] = [];
        grupos[cat].push(med);
      }

      // Orden: categorías alfabéticas (respetando el orden ya definido en
      // la tabla de categorías si existe, y dejando "Sin categoría" al final),
      // y dentro de cada una, medicamentos alfabéticos por nombre
      const nombresCategoriasOrdenados = categorias.map((c) => c.nombre);
      const categoriasPresentes = Object.keys(grupos).sort((a, b) => {
        if (a === 'Sin categoría') return 1;
        if (b === 'Sin categoría') return -1;
        const idxA = nombresCategoriasOrdenados.indexOf(a);
        const idxB = nombresCategoriasOrdenados.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        return a.localeCompare(b);
      });

      let seccionesHtml = '';
      let totalListado = 0;
      for (const categoria of categoriasPresentes) {
        const items = [...grupos[categoria]].sort((a, b) =>
          (a.nombre || '').localeCompare(b.nombre || '')
        );
        totalListado += items.length;
        const filas = items
          .map(
            (med) => `
              <tr>
                <td style="padding:6px 8px;border:1px solid #ddd;">${med.nombre || ''}</td>
                <td style="padding:6px 8px;border:1px solid #ddd;">${med.presentacion || ''}</td>
              </tr>`
          )
          .join('');
        seccionesHtml += `
          <h3 style="background:#F5F3FF;color:#7C3AED;padding:8px;margin-top:20px;">
            ${categoria} (${items.length})
          </h3>
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr>
                <th style="text-align:left;padding:6px 8px;background:#EDE9FE;">Nombre</th>
                <th style="text-align:left;padding:6px 8px;background:#EDE9FE;">Presentación</th>
              </tr>
            </thead>
            <tbody>${filas}</tbody>
          </table>`;
      }

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
        <title>Catálogo de medicamentos</title>
        <style>body{font-family:Arial;padding:20px}</style></head>
        <body>
          <h2>Catálogo de medicamentos por categoría</h2>
          <p>Total (sin duplicados): ${totalListado}</p>
          ${seccionesHtml}
        </body></html>`;

      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
    } catch (error) {
      console.error('Error generando PDF de categorías:', error);
      Alert.alert('Error', 'No se pudo generar el PDF');
    } finally {
      setGenerandoPDF(false);
    }
  };

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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <TouchableOpacity onPress={generarPDFCategorias} disabled={generandoPDF}>
              {generandoPDF ? (
                <ActivityIndicator size="small" color="#7C3AED" />
              ) : (
                <FileText color="#7C3AED" size={24} />
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose}>
              <X color="#6B7280" size={26} />
            </TouchableOpacity>
          </View>
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
