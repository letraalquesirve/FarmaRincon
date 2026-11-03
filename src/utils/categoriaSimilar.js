// src/utils/categoriaSimilar.js
import { medicamentosListLiviano as medicamentosList } from '../services/LocalDataService';
import { normalizeSearchTerm } from './normalizeText';
import { levenshteinDistance } from './stringDistance';

const UMBRAL_DISTANCIA = 2;
const LARGO_MINIMO_PALABRA = 5;

// Palabras muy cortas o que empiezan con número (dosis, "500mg", "20", "mg",
// "de", etc.) no sirven para comparar - descartarlas evita falsos positivos.
const esPalabraUtil = (palabra) => {
  if (!palabra || palabra.length < LARGO_MINIMO_PALABRA) return false;
  if (/^\d/.test(palabra)) return false;
  return true;
};

// Busca, entre los medicamentos ya registrados localmente, el PRIMERO que
// tenga alguna palabra de su nombre a distancia de edición <= UMBRAL_DISTANCIA
// del nombre que se está registrando/editando. Se compara palabra por
// palabra (no la cadena completa) porque los nombres reales suelen traer
// apellidos de producto, combinaciones o presentaciones metidas en el mismo
// campo de texto (ej. "Metoclopramida Circulan") - comparar la cadena
// completa antes fallaba en encontrar el parecido obvio.
// Ignora candidatos que ellos mismos no tengan una categoría real (vacía u
// "Otros"), para no copiar un vacío. Devuelve { categoria, nombreParecido }
// o null si no encontró nada.
export const buscarCategoriaPorNombreParecido = async (nombreMedicamento) => {
  const nombre = (nombreMedicamento || '').trim();
  if (!nombre) return null;

  try {
    const todos = await medicamentosList();
    const nombreNorm = normalizeSearchTerm(nombre);

    for (const med of todos) {
      const categoria = (med.categoria || '').trim();
      if (!categoria || categoria.toLowerCase() === 'otros') continue;
      // Un insumo médico (gasa, jeringuilla, etc.) nunca es un "parecido"
      // válido de un medicamento - son dominios distintos, sin importar
      // qué tan cerca caiga la distancia de edición entre sus nombres.
      if (categoria.toLowerCase() === 'insumo médico') continue;

      // Separadores típicos de combinados (/, -, ,) deben partir palabras,
      // no pegarlas - si no, "Amoxicilina/Ácido" se normaliza en un solo
      // token "amoxicilinaacido" y nunca matchea con "Amoxicilina" sola.
      const nombreConEspacios = (med.nombre || '').replace(/[/,-]+/g, ' ');
      const palabras = normalizeSearchTerm(nombreConEspacios).split(/\s+/).filter(esPalabraUtil);

      const hayParecido = palabras.some(
        (palabra) => levenshteinDistance(nombreNorm, palabra) <= UMBRAL_DISTANCIA
      );

      if (hayParecido) {
        return { categoria, nombreParecido: med.nombre };
      }
    }
    return null;
  } catch (error) {
    console.error('Error buscando categoría por nombre parecido:', error);
    return null;
  }
};

// Primero busca en TU inventario (activos e inactivos) un medicamento con el
// MISMO nombre (sin acentos/mayúsculas) y devuelve la categoría que más se
// repite entre ellos. Es la fuente más fiable: ya la elegiste tú o salió de
// la carga original. Si no hay uno igual, cae al "nombre parecido".
export const buscarCategoriaEnInventario = async (nombreMedicamento) => {
  const nombre = (nombreMedicamento || '').trim();
  if (!nombre) return null;
  try {
    const todos = await medicamentosList();
    const nombreNorm = normalizeSearchTerm(nombre);
    const cuenta = new Map();
    let ejemplo = {};
    for (const med of todos) {
      const categoria = (med.categoria || '').trim();
      if (!categoria || categoria.toLowerCase() === 'otros') continue;
      if (normalizeSearchTerm(med.nombre || '') !== nombreNorm) continue;
      cuenta.set(categoria, (cuenta.get(categoria) || 0) + 1);
      ejemplo[categoria] = med.nombre;
    }
    if (cuenta.size > 0) {
      const [categoria] = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0];
      return { categoria, nombreParecido: ejemplo[categoria] };
    }
    return await buscarCategoriaPorNombreParecido(nombre);
  } catch (error) {
    console.error('Error buscando categoría en inventario:', error);
    return null;
  }
};

// Medicamentos ya registrados (activos o inactivos) que se parecen al nombre
// que se está escribiendo: todas las palabras del nombre escrito aparecen en
// el nombre existente o al revés. Sirve para avisar ANTES de duplicar.
// Devuelve hasta `limite` coincidencias, las activas primero.
export const buscarCoincidenciasNombre = async (nombreMedicamento, limite = 5) => {
  const nombre = (nombreMedicamento || '').trim();
  if (nombre.length < 3) return [];
  try {
    const todos = await medicamentosList();
    const separar = (t) =>
      normalizeSearchTerm((t || '').replace(/[/,-]+/g, ' '))
        .split(/\s+/)
        .filter((p) => p.length >= 3 && !/^\d/.test(p));
    const palabrasEscritas = separar(nombre);
    if (palabrasEscritas.length === 0) return [];

    const coincidencias = todos.filter((med) => {
      const palabrasMed = separar(med.nombre);
      if (palabrasMed.length === 0) return false;
      const todasEscritasEnMed = palabrasEscritas.every((p) => palabrasMed.some((m) => m.includes(p)));
      const todasMedEnEscritas = palabrasMed.every((m) => palabrasEscritas.some((p) => p.includes(m)));
      return todasEscritasEnMed || todasMedEnEscritas;
    });
    coincidencias.sort((a, b) => Number(b.activo !== false) - Number(a.activo !== false));
    return coincidencias.slice(0, limite);
  } catch (error) {
    console.error('Error buscando coincidencias de nombre:', error);
    return [];
  }
};
