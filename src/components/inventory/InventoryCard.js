// src/components/inventory/InventoryCard.js
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Pill, MapPin } from 'lucide-react-native';
import { getExpiryStatus, getDaysUntilExpiry, formatDate } from '../../utils/dateUtils';

const getStatusBorderColor = (fecha, activo) => {
  if (!activo) return '#9CA3AF';
  const days = getDaysUntilExpiry(fecha);
  if (days < 0) return '#DC2626'; // VENCIDO - Rojo
  if (days <= 30) return '#EA580C'; // POR VENCER - Naranja
  return '#22C55E'; // VIGENTE - Verde
};

const getStatusText = (fecha, activo) => {
  if (!activo) return 'INACTIVO';
  const days = getDaysUntilExpiry(fecha);
  if (days < 0) return 'VENCIDO';
  if (days <= 30) return `Vence en ${days} días`;
  return 'Vigente';
};

export const InventoryCard = ({ med, onPress }) => {
  const isInactivo = med.activo === false;
  const borderColor = getStatusBorderColor(med.vencimiento, !isInactivo);
  const statusText = getStatusText(med.vencimiento, !isInactivo);

  return (
    <TouchableOpacity
      style={[styles.card, { borderLeftColor: borderColor }]}
      onPress={() => onPress(med)}
      activeOpacity={0.7}
    >
      <View style={styles.cardRow}>
        <View style={styles.medicamentoContainer}>
          <Pill color="#7C3AED" size={10} />
          <Text style={styles.medicamentoText} numberOfLines={1}>
            {med.nombre} {med.presentacion ? `(${med.presentacion})` : ''}
          </Text>
        </View>
        <Text style={styles.cantidadText}>{med.cantidad} uds</Text>
      </View>

      <View style={styles.cardRow}>
        <Text style={styles.categoriaText}>{med.categoria || 'Sin categoría'}</Text>
        <View style={[styles.statusBadge, { backgroundColor: borderColor + '20' }]}>
          <Text style={[styles.statusText, { color: borderColor }]}>{statusText}</Text>
        </View>
      </View>

      {med.ubicacion && (
        <View style={styles.cardRow}>
          <MapPin color="#6B7280" size={8} />
          <Text style={styles.ubicacionText} numberOfLines={1}>
            {med.ubicacion}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    marginBottom: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    elevation: 0.5,
    borderLeftWidth: 3,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
    flexWrap: 'wrap',
    gap: 4,
  },
  medicamentoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  medicamentoText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
  },
  cantidadText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#7C3AED',
  },
  categoriaText: {
    fontSize: 8,
    color: '#6B7280',
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 8,
    fontWeight: '600',
  },
  ubicacionText: {
    fontSize: 8,
    color: '#10B981',
    marginLeft: 4,
  },
});
