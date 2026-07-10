import { Text } from 'react-native';

// @expo/vector-icons ships untranspiled ESM with extensionless relative imports
// (e.g. `import createIconSet from './createIconSet'`), which Node's native ESM
// resolver rejects. Metro/webpack tolerate this; plain Node under Vitest does not.
// This stub stands in for the package in tests so components can import real
// Ionicons without every test needing its own vi.mock.
export function Ionicons(props: { name: string; size?: number; color?: string }) {
  return <Text>{props.name}</Text>;
}
