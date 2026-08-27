// src/components/CustomDrawerContent.js
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { DrawerContentScrollView, DrawerItemList, DrawerItem } from '@react-navigation/drawer';
import { LogOut } from 'lucide-react-native';

export default function CustomDrawerContent(props) {
  const { user, onLogout } = props;

  return (
    <DrawerContentScrollView {...props} contentContainerStyle={{ flex: 1 }}>
      <View style={styles.header}>
        <Text style={styles.userName}>{user?.nombre || 'Usuario'}</Text>
        <Text style={styles.userRole}>
          {user?.tipo === 'admin' ? 'Administrador' : 'Usuario'}
        </Text>
      </View>

      <DrawerItemList {...props} />

      <View style={styles.spacer} />

      <DrawerItem
        label="Cerrar Sesión"
        icon={({ size }) => <LogOut color="#DC2626" size={size} />}
        labelStyle={styles.logoutLabel}
        onPress={onLogout}
      />
    </DrawerContentScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    padding: 16,
    paddingTop: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    marginBottom: 8,
    backgroundColor: '#F5F3FF',
  },
  userName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  userRole: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  spacer: {
    flex: 1,
  },
  logoutLabel: {
    color: '#DC2626',
  },
});
