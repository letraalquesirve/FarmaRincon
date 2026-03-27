import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

export default function DatePickerInput({ label, value, onChange, placeholder, required }) {
  const [showPicker, setShowPicker] = useState(false);
  const [tempDate, setTempDate] = useState(value ? new Date(value) : new Date());

  const formatDate = (date) => {
    if (!date) return '';
    return date.toISOString().split('T')[0];
  };

  const handleConfirm = (event, selectedDate) => {
    setShowPicker(false);
    if (selectedDate) {
      const formatted = formatDate(selectedDate);
      onChange(formatted);
    }
  };

  const displayValue = value || '';

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label} {required && '*'}</Text>}
      <TouchableOpacity onPress={() => setShowPicker(true)} activeOpacity={0.7}>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={displayValue}
            placeholder={placeholder || 'Seleccionar fecha'}
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
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 5,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1F2937',
  },
  calendarIcon: {
    fontSize: 18,
    paddingHorizontal: 8,
  },
});