// vitest-only stand-in: the real expo-crypto imports expo-modules-core, which
// requires the Expo runtime global and crashes under node/jsdom.
import { randomUUID } from 'node:crypto';

export { randomUUID };
