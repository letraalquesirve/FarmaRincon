// src/components/inventory/DuplicateMedicationModal.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Alert,
} from 'react-native';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LoadingButton } from '../common/LoadingButton';
import DatePickerInput from '../DatePickerInput';
import CategoriaPicker from '../CategoriaPicker';

export const DuplicateMedicationModal = ({
  visible,
  medication,
  onClose,
  onSave,
  obtenerUbicacionDesdeCategoria,
}) => {
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nombre: '',
    presentacion: '',
    categoria: '',
    ubicacion: '',
    cantidad: '',
    vencimiento: '',
  });

  useEffect(() => {
    if (medication && visible) {
      setForm({
        nombre: medication.nombre || '',
        presentacion: medication.presentacion || '',
        categoria: medication.categoria || '',
        ubicacion: medication.ubicacion || '',
        cantidad: '',
        vencimiento: '',
      });
    }
  }, [medication, visible]);

  const handleSave = async () => {
    if (!form.nombre.trim()) {
      Alert.alert('Error', 'El nombre es obligatorio');
      return;
    }
    if (!form.cantidad || parseInt(form.cantidad) <= 0) {
      Alert.alert('Error', 'Ingresa una cantidad válida');
      return;
    }
    if (!form.vencimiento) {
      Alert.alert('Error', 'La fecha de vencimiento es obligatoria');
      return;
    }

    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch (error) {
      console.error('Error duplicando:', error);
      Alert.alert('Error', 'No se pudo duplicar el medicamento');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.keyboardView, { paddingBottom: insets.bottom }]}
        >
          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Duplicar Medicamento</Text>
              <TouchableOpacity onPress={onClose}>
                <X color="#6B7280" size={24} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.label}>Nombre *</Text>
              <TextInput
                style={styles.input}
                value={form.nombre}
                onChangeText={(t) => setForm({ ...form, nombre: t })}
                placeholder="Nombre del medicamento"
              />

              <Text style={styles.label}>Presentación</Text>
              <TextInput
                style={styles.input}
                value={form.presentacion}
                onChangeText={(t) => setForm({ ...form, presentacion: t })}
                placeholder="Ej: Tabletas 500mg"
              />

              <Text style={styles.label}>Categoría</Text>
              <CategoriaPicker
                value={form.categoria}
                onChange={async (text) => {
                  setForm({ ...form, categoria: text });
                  const ubicacion = await obtenerUbicacionDesdeCategoria(text);
                  if (ubicacion) {
                    setForm((prev) => ({ ...prev, ubicacion: ubicacion }));
                  }
                }}
                placeholder="Seleccionar categoría"
                showLabel={false}
              />

              <Text style={styles.label}>Ubicación</Text>
              <TextInput
                style={styles.input}
                value={form.ubicacion}
                onChangeText={(t) => setForm({ ...form, ubicacion: t })}
                placeholder="Ej: Estante A3"
              />

              <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                  <Text style={styles.label}>Cantidad *</Text>
                  <TextInput
                    style={styles.input}
                    value={form.cantidad}
                    onChangeText={(t) => setForm({ ...form, cantidad: t })}
                    keyboardType="numeric"
                    placeholder="Ej: 50"
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Vencimiento *</Text>
                  <DatePickerInput
                    label=""
                    value={form.vencimiento}
                    onChange={(date) => setForm({ ...form, vencimiento: date })}
                    required={true}
                  />
                </View>
              </View>

              <LoadingButton
                onPress={handleSave}
                loading={saving}
                title="Duplicar Medicamento"
                style={styles.saveButton}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 24,
    width: '90%',
    maxHeight: '85%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontWeight: 'bold',
    color: '#1F2937',
    fontSize: 17,
  },
  modalBody: {
    padding: 16,
  },
  label: {
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
    fontSize: 13,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    marginBottom: 12,
    color: '#1F2937',
  },
  row: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 12,
  },
  inputGroup: {
    marginBottom: 0,
  },
  saveButton: {
    marginTop: 16,
  },
});
