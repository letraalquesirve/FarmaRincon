// src/components/common/LoadingButton.js
import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native';

export const LoadingButton = ({
  onPress,
  loading,
  disabled,
  title,
  style,
  textStyle,
  loadingText = 'Procesando...',
}) => {
  return (
    <TouchableOpacity
      style={[styles.button, style, (loading || disabled) && styles.buttonDisabled]}
      onPress={onPress}
      disabled={loading || disabled}
    >
      {loading ? (
        <>
          <ActivityIndicator size="small" color="white" />
          <Text style={[styles.buttonText, textStyle]}>{loadingText}</Text>
        </>
      ) : (
        <Text style={[styles.buttonText, textStyle]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#7C3AED',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  buttonDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.7,
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 15,
  },
});
