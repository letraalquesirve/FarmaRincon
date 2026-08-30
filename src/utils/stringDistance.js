// src/utils/stringDistance.js

// Distancia de Levenshtein: cuántas ediciones (insertar/borrar/cambiar un
// carácter) hacen falta para convertir una cadena en la otra. 0 = idénticas.
export const levenshteinDistance = (a = '', b = '') => {
  const s1 = a || '';
  const s2 = b || '';
  const m = s1.length;
  const n = s2.length;

  if (m === 0) return n;
  if (n === 0) return m;

  // Fila anterior y fila actual (evita guardar la matriz completa)
  let filaAnterior = Array.from({ length: n + 1 }, (_, j) => j);
  let filaActual = new Array(n + 1);

  for (let i = 1; i <= m; i++) {
    filaActual[0] = i;
    for (let j = 1; j <= n; j++) {
      const costo = s1[i - 1] === s2[j - 1] ? 0 : 1;
      filaActual[j] = Math.min(
        filaActual[j - 1] + 1, // inserción
        filaAnterior[j] + 1, // eliminación
        filaAnterior[j - 1] + costo // sustitución
      );
    }
    [filaAnterior, filaActual] = [filaActual, filaAnterior];
  }

  return filaAnterior[n];
};
