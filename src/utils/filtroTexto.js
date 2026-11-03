// src/utils/filtroTexto.js
// Filtro de lista por texto: sin acentos ni mayúsculas, y TODAS las palabras
// escritas deben aparecer en alguno de los campos (en cualquier orden).
const limpiar = (t) =>
  (t || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

export const coincideFiltro = (filtro, ...campos) => {
  const palabras = limpiar(filtro).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return true;
  const pajar = limpiar(campos.join(' '));
  return palabras.every((p) => pajar.includes(p));
};
