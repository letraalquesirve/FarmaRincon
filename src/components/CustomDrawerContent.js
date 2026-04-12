// CustomDrawerContent.js
// Este archivo ya no es necesario con el nuevo sistema de navegación.
// El drawer ahora está integrado directamente en App.js como componente <CustomDrawer>.
// Puedes eliminar este archivo de tu proyecto.
// Crear un archivo CustomDrawerContent.js
/* import { DrawerContentScrollView, DrawerItem } from '@react-navigation/drawer';
import { View, Text, TouchableOpacity } from 'react-native';
import { LogOut } from 'lucide-react-native';

export default function CustomDrawerContent(props) {
  const { user, onLogout } = props;

  return (
    <DrawerContentScrollView {...props}>
      <View
        style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', marginBottom: 8 }}
      >
        <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1F2937' }}>{user?.nombre}</Text>
        <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
          {user?.tipo === 'admin' ? 'Administrador' : 'Usuario'}
        </Text>
      </View>

      {props.children}

      <DrawerItem
        label="Cerrar Sesión"
        icon={({ color, size }) => <LogOut color="#DC2626" size={size} />}
        labelStyle={{ color: '#DC2626' }}
        onPress={onLogout}
      />
    </DrawerContentScrollView>
  );
}
 */
