// src/utils/categoriaSimilar.js
import { medicamentosList } from '../services/LocalDataService';
import { normalizeSearchTerm } from './normalizeText';
import { levenshteinDistance } from './stringDistance';

const UMBRAL_DISTANCIA = 4;

// Busca, entre los medicamentos ya registrados localmente, el PRIMERO cuyo
// nombre esté a una distancia de edición <= UMBRAL_DISTANCIA del nombre que
// se está registrando/editando. Ignora candidatos que ellos mismos no
// tengan una categoría real (vacía u "Otros"), para no copiar un vacío.
// Devuelve { categoria, nombreParecido } o null si no encontró nada.
export const buscarCategoriaPorNombreParecido = async (nombreMedicamento) => {
  const nombre = (nombreMedicamento || '').trim();
  if (!nombre) return null;

  try {
    const todos = await medicamentosList();
    const nombreNorm = normalizeSearchTerm(nombre);

    for (const med of todos) {
      const categoria = (med.categoria || '').trim();
      if (!categoria || categoria.toLowerCase() === 'otros') continue;

      const distancia = levenshteinDistance(nombreNorm, normalizeSearchTerm(med.nombre || ''));
      if (distancia <= UMBRAL_DISTANCIA) {
        return { categoria, nombreParecido: med.nombre };
      }
    }
    return null;
  } catch (error) {
    console.error('Error buscando categoría por nombre parecido:', error);
    return null;
  }
};
