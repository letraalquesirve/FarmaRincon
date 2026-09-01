// src/utils/categoriaSimilar.js
import { medicamentosList } from '../services/LocalDataService';
import { normalizeSearchTerm } from './normalizeText';
import { levenshteinDistance } from './stringDistance';

const UMBRAL_DISTANCIA = 4;
const LARGO_MINIMO_PALABRA = 4;

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
