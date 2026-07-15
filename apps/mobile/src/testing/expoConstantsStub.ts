// vitest-only stand-in: the real expo-constants imports expo-modules-core, which
// requires the Expo runtime global and ships extensionless ESM that Node rejects.
// Components read only Constants.expoConfig?.version, so a fixed value is enough.
export default { expoConfig: { version: '0.0.0-test' } };
