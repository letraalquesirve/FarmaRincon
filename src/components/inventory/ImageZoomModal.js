// src/components/inventory/ImageZoomModal.js
import React, { useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  Image,
  Animated,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { X, Share2 } from 'lucide-react-native';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

const { width, height } = Dimensions.get('window');

export const ImageZoomModal = ({ visible, imageBase64, medName, onClose }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const savedScale = useRef(1);

  const cleanImage = imageBase64?.includes('base64,')
    ? imageBase64.split('base64,')[1]
    : imageBase64;

  const pinchGesture = Gesture.Pinch()
    .runOnJS(true)
    .onUpdate((e) => {
      const newScale = Math.max(0.5, Math.min(savedScale.current * e.scale, 5));
      scale.setValue(newScale);
    })
    .onEnd(() => {
      savedScale.current = Math.max(0.5, Math.min(savedScale.current, 5));
      scale.setValue(savedScale.current);
    });

  const doubleTap = Gesture.Tap()
    .runOnJS(true)
    .numberOfTaps(2)
    .onEnd(() => {
      savedScale.current = 1;
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
    });

  const composed = Gesture.Race(pinchGesture, doubleTap);

  const resetZoom = () => {
    savedScale.current = 1;
    scale.setValue(1);
  };

  const shareImage = async () => {
    if (!cleanImage) return;
    try {
      const filename = `${FileSystem.cacheDirectory}med_${Date.now()}.jpg`;
      await FileSystem.writeAsStringAsync(filename, cleanImage, {
        encoding: 'base64',
      });
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(filename, {
          mimeType: 'image/jpeg',
          dialogTitle: `Imagen de ${medName}`,
          UTI: 'public.jpeg',
        });
      } else {
        Alert.alert('No disponible', 'Tu dispositivo no soporta compartir archivos.');
      }
    } catch (error) {
      console.error('Error compartiendo imagen:', error);
      Alert.alert('Error', 'No se pudo compartir la imagen');
    }
  };

  const handleClose = () => {
    resetZoom();
    onClose();
  };

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={handleClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.container}>
          <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
            <X color="white" size={28} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.shareButton} onPress={shareImage}>
            <Share2 color="white" size={24} />
          </TouchableOpacity>

          <GestureDetector gesture={composed}>
            <Animated.View style={[styles.imageWrapper, { transform: [{ scale }] }]}>
              {cleanImage ? (
                <Image
                  source={{ uri: `data:image/jpeg;base64,${cleanImage}` }}
                  style={styles.image}
                  resizeMode="contain"
                />
              ) : (
                <Text style={{ color: 'white' }}>Sin imagen</Text>
              )}
            </Animated.View>
          </GestureDetector>
          <Text style={styles.hint}>Pellizca para zoom · Doble toque para resetear</Text>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 30,
    padding: 10,
  },
  shareButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 30,
    padding: 10,
  },
  imageWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: width,
    height: height * 0.7,
  },
  hint: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
    textAlign: 'center',
    paddingBottom: 24,
  },
});
