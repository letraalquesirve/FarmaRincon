export const getDaysUntilExpiry = (fecha) => {
  const today = new Date();
  const expiry = new Date(fecha);
  const diffTime = expiry - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

export const getExpiryStatus = (fecha) => {
  const days = getDaysUntilExpiry(fecha);
  if (days < 0) return { color: '#FEE2E2', text: 'VENCIDO', borderColor: '#DC2626' };
  if (days <= 30) return { color: '#FFEDD5', text: `Vence en ${days} días`, borderColor: '#EA580C' };
  return { color: '#DCFCE7', text: 'Vigente', borderColor: '#22C55E' };
};