import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', '__acceptance__/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
  resolve: {
    alias: {
      // Must precede the general '@' alias: the real loaders require() git-excluded
      // generated artifacts; tests use synthetic fixtures instead.
      '@/content/bank': path.resolve(__dirname, 'src/testing/bankFixture.ts'),
      '@/content/bankAssets': path.resolve(__dirname, 'src/testing/bankAssetsFixture.ts'),
      '@': path.resolve(__dirname, 'src'),
      'react-native': 'react-native-web',
      '@expo/vector-icons': path.resolve(__dirname, 'src/testing/vectorIconsStub.tsx'),
      'expo-crypto': path.resolve(__dirname, 'src/testing/expoCryptoStub.ts'),
      'expo-constants': path.resolve(__dirname, 'src/testing/expoConstantsStub.ts'),
    },
  },
});
