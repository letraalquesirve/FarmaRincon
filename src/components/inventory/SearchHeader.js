// src/components/inventory/SearchHeader.js
import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Search, Filter, X, AlertCircle } from 'lucide-react-native';

export const SearchHeader = ({
  searchInputValue,
  setSearchInputValue,
  onSearch,
  onClear, // ← Nueva prop para limpiar resultados
  modoInactivos,
  toggleModoInactivos,
  filter,
  setFilter,
  showFilters,
  setShowFilters,
}) => {
  // Función para limpiar búsqueda y resultados
  const limpiarBusqueda = () => {
    setSearchInputValue('');
    if (onClear) {
      onClear(); // ← Llama a la función para limpiar resultados
    }
  };

  const handleSubmitSearch = () => {
    onSearch(searchInputValue);
  };

  return (
    <View style={styles.header}>
      <View style={styles.searchContainer}>
        <Search color="#9CA3AF" size={20} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder={modoInactivos ? 'Buscar medicamento inactivo...' : 'Buscar medicamento...'}
          placeholderTextColor="#9CA3AF"
          value={searchInputValue}
          onChangeText={setSearchInputValue}
          onSubmitEditing={handleSubmitSearch}
          returnKeyType="search"
        />
        {searchInputValue !== '' && (
          <TouchableOpacity onPress={limpiarBusqueda}>
            <X color="#9CA3AF" size={20} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.headerButtons}>
        {!modoInactivos && (
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => setShowFilters(!showFilters)}
          >
            <Filter color="#7C3AED" size={20} />
            <Text style={styles.filterButtonText}>Filtros</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.inactivosButton, modoInactivos && styles.inactivosButtonActive]}
          onPress={toggleModoInactivos}
        >
          <AlertCircle color={modoInactivos ? 'white' : '#6B7280'} size={20} />
          <Text
            style={[styles.inactivosButtonText, modoInactivos && styles.inactivosButtonTextActive]}
          >
            {modoInactivos ? 'Activos' : 'Inactivos'}
          </Text>
        </TouchableOpacity>
      </View>

      {showFilters && !modoInactivos && (
        <View style={styles.filtersContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {[
              { key: 'todos', label: 'Todos' },
              { key: 'vigentes', label: 'Vigentes' },
              { key: 'porVencer', label: 'Por vencer' },
              { key: 'vencidos', label: 'Vencidos' },
            ].map((f) => (
              <TouchableOpacity
                key={f.key}
                style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
                onPress={() => setFilter(f.key)}
              >
                <Text
                  style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}
                >
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    backgroundColor: 'white',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
    gap: 8,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 16, color: '#1F2937' },
  searchButton: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchButtonText: { color: 'white', fontWeight: '600', fontSize: 12 },
  headerButtons: { flexDirection: 'row', gap: 8, marginTop: 8 },
  filterButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 8,
  },
  filterButtonText: { color: '#7C3AED', fontWeight: '600', fontSize: 14 },
  inactivosButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 8,
  },
  inactivosButtonActive: { backgroundColor: '#6B7280' },
  inactivosButtonText: { color: '#6B7280', fontWeight: '600', fontSize: 14 },
  inactivosButtonTextActive: { color: 'white' },
  filtersContainer: {
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingBottom: 12,
    marginTop: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    marginRight: 8,
  },
  filterChipActive: { backgroundColor: '#7C3AED' },
  filterChipText: { color: '#4B5563', fontWeight: '500', fontSize: 13 },
  filterChipTextActive: { color: 'white' },
});
