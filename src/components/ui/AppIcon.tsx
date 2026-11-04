import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

/**
 * Icono por nombre. Los nombres "mci:xxx" usan Material Community Icons (iconos de comida, nevera, despensa…);
 * el resto, Ionicons. Así se pueden guardar en la base de datos como texto.
 */
export function AppIcon({ name, size, color }: { name: string; size: number; color: string }) {
  if (name.startsWith('mci:')) return <MaterialCommunityIcons name={name.slice(4) as never} size={size} color={color} />;
  return <Ionicons name={name as never} size={size} color={color} />;
}
