// src/utils/normalizeText.js

/**
 * Normaliza un texto eliminando acentos, diacríticos y convirtiendo a minúsculas
 * Útil para búsquedas insensibles a acentos y mayúsculas
 *
 * @param {string} text - Texto a normalizar
 * @returns {string} Texto normalizado
 *
 * @example
 * normalizeSearchTerm("Ácido Nalidíxico") // returns "acido nalidixico"
 * normalizeSearchTerm("PARACETAMOL") // returns "paracetamol"
 * normalizeSearchTerm("Mañána") // returns "manana"
 */
export const normalizeSearchTerm = (text) => {
  if (!text || typeof text !== 'string') return '';

  return text
    .toLowerCase()
    .normalize('NFD') // Descompone caracteres acentuados
    .replace(/[\u0300-\u036f]/g, '') // Elimina los acentos
    .replace(/ñ/g, 'n') // Ñ → n
    .replace(/[^a-z0-9\s]/g, '') // Elimina caracteres especiales
    .trim(); // Elimina espacios al inicio y final
};

/**
 * Versión más simple sin regex complejos
 * Útil si la anterior da problemas en algunas plataformas
 */
export const normalizeSimple = (text) => {
  if (!text) return '';

  const accents = {
    á: 'a',
    é: 'e',
    í: 'i',
    ó: 'o',
    ú: 'u',
    Á: 'a',
    É: 'e',
    Í: 'i',
    Ó: 'o',
    Ú: 'u',
    ñ: 'n',
    Ñ: 'n',
    ü: 'u',
    Ü: 'u',
  };

  return text
    .toLowerCase()
    .split('')
    .map((char) => accents[char] || char)
    .join('')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
};

/**
 * Normaliza y además limpia caracteres especiales para búsqueda en PocketBase
 */
export const normalizeForPocketBase = (text) => {
  if (!text) return '';

  return normalizeSearchTerm(text)
    .replace(/[\\"']/g, '') // Elimina caracteres que podrían romper la consulta
    .replace(/\s+/g, ' '); // Reemplaza múltiples espacios por uno solo
};

// Exportar por defecto la función principal
export default normalizeSearchTerm;
