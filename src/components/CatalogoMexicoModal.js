// src/components/CatalogoMexicoModal.js
import React, { useState } from 'react';
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
import { X, FolderOpen, Check, ChevronRight, Search } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  categoriasList,
  categoriaCreate,
  catalogoMexicoReemplazar,
  categoriasMexicoRevisadas,
  guardarEquivalenciasCategorias,
} from '../services/LocalDataService';

// Pasos del flujo: elegir archivo -> revisar categorías nuevas -> importando -> listo
export default function CatalogoMexicoModal({ visible, onClose }) {
  const insets = useSafeAreaInsets();
  const [paso, setPaso] = useState('elegir'); // elegir | revisando | importando | listo
  const [cargandoArchivo, setCargandoArchivo] = useState(false);
  const [filasCatalogo, setFilasCatalogo] = useState([]);
  const [categoriasNuevas, setCategoriasNuevas] = useState([]); // strings crudos de México a revisar
  const [decisiones, setDecisiones] = useState({}); // { categoriaMexico: categoriaPropia | null }
  const [categoriasPropias, setCategoriasPropias] = useState([]);
  const [resumenFinal, setResumenFinal] = useState(null);

  // Selector "es igual a..." - un pequeño buscador aparte, encima de todo
  const [selectorVisible, setSelectorVisible] = useState(false);
  const [categoriaEditando, setCategoriaEditando] = useState(null);
  const [busquedaSelector, setBusquedaSelector] = useState('');

  const cerrarTodo = () => {
    setPaso('elegir');
    setFilasCatalogo([]);
    setCategoriasNuevas([]);
    setDecisiones({});
    setResumenFinal(null);
    onClose();
  };

  const elegirArchivo = async () => {
    if (cargandoArchivo) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const fileUri = result.assets?.[0]?.uri;
      if (!fileUri) return;

      setCargandoArchivo(true);
      const contenido = await FileSystem.readAsStringAsync(fileUri);
      const filas = JSON.parse(contenido);

      if (!Array.isArray(filas) || filas.length === 0 || !filas[0].nombre) {
        Alert.alert('Archivo inválido', 'Ese archivo no tiene el formato esperado del catálogo de México.');
        setCargandoArchivo(false);
        return;
      }

      // Categorías únicas (no vacías) del archivo nuevo
      const categoriasEnArchivo = [...new Set(filas.map((f) => f.categoria).filter(Boolean))];

      const yaRevisadas = await categoriasMexicoRevisadas();
      const nuevasPorRevisar = categoriasEnArchivo.filter((c) => !yaRevisadas.has(c));

      const propias = await categoriasList();
      setCategoriasPropias(propias.map((c) => c.nombre).sort());
      setFilasCatalogo(filas);
      setCategoriasNuevas(nuevasPorRevisar);
      // Por defecto, cada categoría nueva empieza como "Nueva categoría" (null)
      setDecisiones(Object.fromEntries(nuevasPorRevisar.map((c) => [c, null])));

      if (nuevasPorRevisar.length === 0) {
        // No hay nada nuevo que revisar - va directo a importar
        await ejecutarImportacion(filas, {});
      } else {
        setPaso('revisando');
      }
    } catch (error) {
      console.error('Error leyendo catálogo de México:', error);
      Alert.alert('Error', 'No se pudo leer ese archivo. ¿Es el JSON correcto?');
    } finally {
      setCargandoArchivo(false);
    }
  };

  const abrirSelectorPara = (categoriaMexico) => {
    setCategoriaEditando(categoriaMexico);
    setBusquedaSelector('');
    setSelectorVisible(true);
  };

  const elegirEquivalencia = (categoriaPropia) => {
    setDecisiones((prev) => ({ ...prev, [categoriaEditando]: categoriaPropia }));
    setSelectorVisible(false);
  };

  const marcarComoNueva = (categoriaMexico) => {
    setDecisiones((prev) => ({ ...prev, [categoriaMexico]: null }));
  };

  const ejecutarImportacion = async (filas, decisionesFinales) => {
    setPaso('importando');
    try {
      // 1. Guardar las decisiones de equivalencia (para no volver a preguntar)
      const listaDecisiones = Object.entries(decisionesFinales).map(([categoriaMexico, categoriaPropia]) => ({
        categoriaMexico,
        categoriaPropia,
      }));
      if (listaDecisiones.length > 0) {
        await guardarEquivalenciasCategorias(listaDecisiones);
      }

      // 2. Crear como categoría propia nueva cada una marcada como "nueva"
      //    (categoriaPropia === null), si no existe ya con ese nombre exacto
      const propiasActuales = new Set((await categoriasList()).map((c) => c.nombre));
      let categoriasCreadas = 0;
      for (const [categoriaMexico, categoriaPropia] of Object.entries(decisionesFinales)) {
        if (categoriaPropia === null && !propiasActuales.has(categoriaMexico)) {
          await categoriaCreate({ nombre: categoriaMexico, ubicacion: '' });
          propiasActuales.add(categoriaMexico);
          categoriasCreadas++;
        }
      }

      // 3. Reemplazar el catálogo completo de México
      const totalFilas = await catalogoMexicoReemplazar(filas);

      setResumenFinal({
        totalFilas,
        categoriasCreadas,
        categoriasTraducidas: listaDecisiones.filter((d) => d.categoriaPropia).length,
      });
      setPaso('listo');
    } catch (error) {
      console.error('Error importando catálogo de México:', error);
      Alert.alert('Error', 'No se pudo completar la importación');
      setPaso('elegir');
    }
  };

  const confirmarRevision = () => {
    const sinDecidir = categoriasNuevas.length - Object.keys(decisiones).length;
    ejecutarImportacion(filasCatalogo, decisiones);
  };

  const categoriasFiltradasSelector = categoriasPropias.filter((c) =>
    c.toLowerCase().includes(busquedaSelector.toLowerCase())
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={cerrarTodo}>
      <View style={styles.overlay}>
        <View style={[styles.content, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.header}>
            <Text style={styles.title}>Catálogo de México (COFEPRIS)</Text>
            <TouchableOpacity onPress={cerrarTodo}>
              <X color="#6B7280" size={24} />
            </TouchableOpacity>
          </View>

          {paso === 'elegir' && (
            <View style={styles.centrado}>
              <Text style={styles.descripcion}>
                Importa el archivo que te compartí (ya procesado desde el Excel de COFEPRIS) para
                actualizar el catálogo de nombres y categorías de México. Se recomienda hacerlo
                cada 6 meses.
              </Text>
              <TouchableOpacity
                style={styles.botonPrincipal}
                onPress={elegirArchivo}
                disabled={cargandoArchivo}
              >
                {cargandoArchivo ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <FolderOpen color="white" size={20} />
                    <Text style={styles.botonPrincipalTexto}>Elegir archivo</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {paso === 'revisando' && (
            <>
              <Text style={styles.descripcion}>
                {categoriasNuevas.length} categoría(s) nueva(s) de México que no reconozco. Para
                cada una, marca si es igual a una de tus categorías actuales, o si es genuinamente
                nueva.
              </Text>
              <FlatList
                data={categoriasNuevas}
                keyExtractor={(item) => item}
                style={{ marginBottom: 12 }}
                renderItem={({ item }) => {
                  const decision = decisiones[item];
                  return (
                    <View style={styles.filaRevision}>
                      <Text style={styles.nombreMexico} numberOfLines={2}>
                        {item}
                      </Text>
                      <View style={styles.opcionesRevision}>
                        <TouchableOpacity
                          style={[styles.chip, decision === null && styles.chipActivo]}
                          onPress={() => marcarComoNueva(item)}
                        >
                          <Text style={[styles.chipTexto, decision === null && styles.chipTextoActivo]}>
                            Nueva categoría
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.chip, decision && styles.chipActivo]}
                          onPress={() => abrirSelectorPara(item)}
                        >
                          <Text style={[styles.chipTexto, decision && styles.chipTextoActivo]} numberOfLines={1}>
                            {decision ? `= ${decision}` : 'Es igual a...'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                }}
              />
              <TouchableOpacity style={styles.botonPrincipal} onPress={confirmarRevision}>
                <Check color="white" size={20} />
                <Text style={styles.botonPrincipalTexto}>Confirmar e importar</Text>
              </TouchableOpacity>
            </>
          )}

          {paso === 'importando' && (
            <View style={styles.centrado}>
              <ActivityIndicator size="large" color="#7C3AED" />
              <Text style={styles.descripcion}>Importando catálogo...</Text>
            </View>
          )}

          {paso === 'listo' && resumenFinal && (
            <View style={styles.centrado}>
              <Text style={styles.descripcion}>
                ✅ Catálogo actualizado{'\n\n'}
                {resumenFinal.totalFilas} medicamentos cargados{'\n'}
                {resumenFinal.categoriasCreadas} categoría(s) nueva(s) agregada(s){'\n'}
                {resumenFinal.categoriasTraducidas} categoría(s) traducida(s) a una tuya existente
              </Text>
              <TouchableOpacity style={styles.botonPrincipal} onPress={cerrarTodo}>
                <Text style={styles.botonPrincipalTexto}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Selector "es igual a..." - buscador simple sobre la lista de categorías propias */}
        <Modal visible={selectorVisible} animationType="slide" transparent>
          <View style={styles.overlay}>
            <View style={[styles.content, { paddingBottom: insets.bottom + 16, maxHeight: '70%' }]}>
              <View style={styles.header}>
                <Text style={styles.title}>Elige la equivalente</Text>
                <TouchableOpacity onPress={() => setSelectorVisible(false)}>
                  <X color="#6B7280" size={24} />
                </TouchableOpacity>
              </View>
              <View style={styles.buscadorRow}>
                <Search color="#9CA3AF" size={18} />
                <TextInput
                  style={styles.buscadorInput}
                  placeholder="Buscar en tus categorías..."
                  value={busquedaSelector}
                  onChangeText={setBusquedaSelector}
                  autoFocus
                />
              </View>
              <FlatList
                data={categoriasFiltradasSelector}
                keyExtractor={(item) => item}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.opcionCategoria} onPress={() => elegirEquivalencia(item)}>
                    <Text style={styles.opcionCategoriaTexto}>{item}</Text>
                    <ChevronRight color="#9CA3AF" size={18} />
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={styles.sinResultados}>Sin resultados - prueba otra búsqueda</Text>
                }
              />
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  content: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: 'bold', color: '#1F2937', flex: 1 },
  descripcion: { fontSize: 13, color: '#4B5563', marginBottom: 16, lineHeight: 19 },
  centrado: { alignItems: 'center', paddingVertical: 20 },
  botonPrincipal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#7C3AED',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  botonPrincipalTexto: { color: 'white', fontWeight: 'bold', fontSize: 15 },
  filaRevision: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingVertical: 10,
  },
  nombreMexico: { fontSize: 13, color: '#1F2937', marginBottom: 8, fontWeight: '600' },
  opcionesRevision: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  chipActivo: { backgroundColor: '#EDE9FE' },
  chipTexto: { fontSize: 12, color: '#6B7280' },
  chipTextoActivo: { color: '#7C3AED', fontWeight: '600' },
  buscadorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  buscadorInput: { flex: 1, paddingVertical: 10, fontSize: 14 },
  opcionCategoria: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  opcionCategoriaTexto: { fontSize: 14, color: '#1F2937', flex: 1 },
  sinResultados: { textAlign: 'center', color: '#9CA3AF', marginTop: 20 },
});
