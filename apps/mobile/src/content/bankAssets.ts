import type { ImageSourcePropType } from 'react-native';

// The bundled sign/scene images (bank stem images + image-answer options) live in the
// git-excluded apps/mobile/assets/bank/ (licensed Crown-copyright, tripwire 7). `pnpm content
// ingest` regenerates assetMap.js there, mapping each gif filename to its Metro require() so
// the images bundle offline. It is require()d (not a static import) so tsc tolerates its
// absence on a clean clone; the vitest config aliases this whole module to a synthetic map,
// so tests never touch the real assets. On device the file is always present (you cannot
// build the app without ingesting), so the empty fallback only guards a missing bundle.
type AssetMap = Record<string, ImageSourcePropType>;

function loadAssetMap(): AssetMap {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../../assets/bank/assetMap.js') as AssetMap;
  } catch {
    return {};
  }
}

const ASSETS = loadAssetMap();

export function bankAsset(ref?: string): ImageSourcePropType | undefined {
  if (!ref) return undefined;
  return ASSETS[ref];
}
