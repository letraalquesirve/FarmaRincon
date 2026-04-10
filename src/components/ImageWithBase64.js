// components/ImageWithBase64.js
import React from 'react';
import { Image } from 'react-native';

export default function ImageWithBase64({ base64, style, ...props }) {
  if (!base64) return null;

  const uri = base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;

  return <Image source={{ uri }} style={style} {...props} />;
}
