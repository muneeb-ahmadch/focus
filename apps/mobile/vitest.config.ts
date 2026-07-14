import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', '__acceptance__/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'react-native': 'react-native-web',
      '@expo/vector-icons': path.resolve(__dirname, 'src/testing/vectorIconsStub.tsx'),
      'expo-crypto': path.resolve(__dirname, 'src/testing/expoCryptoStub.ts'),
    },
  },
});
