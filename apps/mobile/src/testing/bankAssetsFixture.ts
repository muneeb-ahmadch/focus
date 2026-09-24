import type { ImageSourcePropType } from 'react-native';

// Synthetic stand-in for the git-excluded bank asset map. Any referenced image resolves to a
// stable fake source so <Image> renders in tests and its accessibilityLabel (the authored
// altText) is queryable. The vitest config aliases @/content/bankAssets to this module.
export function bankAsset(ref?: string): ImageSourcePropType | undefined {
  if (!ref) return undefined;
  return { uri: `bank-asset://${ref}` };
}
