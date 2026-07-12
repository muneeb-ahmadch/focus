declare const __DEV__: boolean | undefined;

export const MOCKS_ENABLED: boolean = typeof __DEV__ !== 'undefined' && __DEV__;
