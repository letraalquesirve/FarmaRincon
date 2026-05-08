// src/components/DatePickerInput.js
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

export default function DatePickerInput({ label, value, onChange, placeholder, required }) {
  const [showPicker, setShowPicker] = useState(false);

  // Convertir el value a objeto Date
  const getInitialDate = () => {
    console.log('📅 getInitialDate - value recibido:', value);

    if (!value) {
      console.log('📅 No hay value, usando fecha actual');
      return new Date();
    }

    // Limpiar el valor si viene con hora UTC
    let cleanDate = value;
    if (typeof value === 'string') {
      if (value.includes('T')) {
        cleanDate = value.split('T')[0];
      }
      if (cleanDate.includes(' ')) {
        cleanDate = cleanDate.split(' ')[0];
      }
    }

    console.log('📅 cleanDate:', cleanDate);

    // Parsear YYYY-MM-DD
    const parts = cleanDate.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        const date = new Date(year, month, day);
        console.log('📅 Fecha creada:', date);
        return date;
      }
    }

    // Si no se pudo parsear, intentar con Date
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date;
    }

    console.log('📅 Usando fecha actual por defecto');
    return new Date();
  };

  const [tempDate, setTempDate] = useState(getInitialDate());

  // Actualizar tempDate cuando cambia value
  useEffect(() => {
    console.log('📅 useEffect - value cambió a:', value);
    setTempDate(getInitialDate());
  }, [value]);

  // Formatear fecha para mostrar en el input (YYYY-MM-DD)
  const formatDisplayDate = (dateValue) => {
    if (!dateValue) return '';

    // Si ya es string YYYY-MM-DD
    if (typeof dateValue === 'string') {
      let clean = dateValue.split('T')[0];
      if (clean.includes(' ')) clean = clean.split(' ')[0];
      if (clean.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return clean;
      }
    }

    return '';
  };

  const handleConfirm = (event, selectedDate) => {
    setShowPicker(false);
    console.log('📅 handleConfirm - event.type:', event.type);
    console.log('📅 handleConfirm - selectedDate:', selectedDate);

    if (selectedDate && event.type !== 'dismissed') {
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      const formattedDate = `${year}-${month}-${day}`;
      console.log('📅 handleConfirm - formattedDate:', formattedDate);
      onChange(formattedDate);
    }
  };

  const displayValue = formatDisplayDate(value);
  console.log('📅 render - displayValue:', displayValue);

  return (
    <View style={styles.container}>
      {label && (
        <Text style={styles.label}>
          {label} {required && '*'}
        </Text>
      )}
      <TouchableOpacity onPress={() => setShowPicker(true)} activeOpacity={0.7}>
        <View style={styles.pickerButton}>
          <TextInput
            style={styles.pickerText}
            value={displayValue}
            placeholder={placeholder || 'Seleccionar fecha'}
            placeholderTextColor="#9CA3AF"
            editable={false}
            pointerEvents="none"
          />
          <Text style={styles.calendarIcon}>📅</Text>
        </View>
      </TouchableOpacity>

      {showPicker && (
        <DateTimePicker
          value={tempDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleConfirm}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    width: '100%',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 5,
  },
  pickerButton: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  pickerText: {
    fontSize: 10,
    color: '#1F2937',
    flex: 1,
  },
  calendarIcon: {
    fontSize: 18,
    marginLeft: 10,
  },
});
