declare const __DEV__: boolean | undefined;

export const MOCKS_ENABLED: boolean = typeof __DEV__ !== 'undefined' && __DEV__;

export const ANALYTICS_URL: string | null = process.env.EXPO_PUBLIC_ANALYTICS_URL ?? null;
