// src/utils/dateUtils.js

/**
 * Obtiene la fecha actual en UTC sin hora
 */
const getTodayUTC = () => {
  const today = new Date();
  return {
    year: today.getUTCFullYear(),
    month: today.getUTCMonth(),
    day: today.getUTCDate(),
  };
};

/**
 * Calcula los días hasta el vencimiento
 */
export const getDaysUntilExpiry = (expiryDate) => {
  if (!expiryDate) return null;

  const expiry = new Date(expiryDate);
  const todayUTC = getTodayUTC();

  const expiryUTC = Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth(), expiry.getUTCDate());
  const todayUTCtime = Date.UTC(todayUTC.year, todayUTC.month, todayUTC.day);

  const diffTime = expiryUTC - todayUTCtime;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
};

/**
 * Formatea una fecha para mostrar en UI (DD/MM/YYYY)
 */
export const formatDate = (dateString) => {
  if (!dateString) return 'N/A';

  const date = new Date(dateString);

  if (isNaN(date.getTime())) {
    return 'N/A';
  }

  const day = date.getUTCDate().toString().padStart(2, '0');
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const year = date.getUTCFullYear();

  return `${day}/${month}/${year}`;
};

/**
 * Obtiene el estado de un medicamento para los colores
 */
export const getExpiryStatus = (vencimiento) => {
  const days = getDaysUntilExpiry(vencimiento);

  if (days === null || isNaN(days)) {
    return {
      color: '#F3F4F6',
      text: 'Fecha inválida',
      borderColor: '#9CA3AF',
      textColor: '#6B7280',
    };
  }

  if (days < 0) {
    return {
      color: '#FEE2E2',
      text: 'VENCIDO',
      borderColor: '#DC2626',
      textColor: '#991B1B',
    };
  }

  if (days <= 30) {
    return {
      color: '#FFEDD5',
      text: `Vence en ${days} días`,
      borderColor: '#EA580C',
      textColor: '#9A3412',
    };
  }

  return {
    color: '#DCFCE7',
    text: 'Vigente',
    borderColor: '#22C55E',
    textColor: '#166534',
  };
};

/**
 * Obtiene las fechas límite para filtros
 */
export const getDateBoundaries = () => {
  const today = new Date();
  const hoyStr = today.toISOString().split('T')[0];

  const dentro30Dias = new Date();
  dentro30Dias.setDate(today.getDate() + 30);
  const dentro30DiasStr = dentro30Dias.toISOString().split('T')[0];

  return { hoyStr, dentro30DiasStr };
};
