import { StyleSheet, Text, View } from 'react-native';
import type { SignShape } from '@/content/schema';
import { colors, font, space } from '@/theme/tokens';

const RED = '#C0392B';
const BLUE = '#1B5FAA';

export function SignView(props: { shape: SignShape; glyph?: string; label?: string }) {
  return (
    <View style={styles.wrap}>
      {props.shape === 'warning-triangle' && (
        <View style={styles.triangleOuter}>
          <View style={styles.triangleInner} />
          {props.glyph ? <Text style={styles.triangleGlyph}>{props.glyph}</Text> : null}
        </View>
      )}
      {props.shape === 'order-red-ring' && (
        <View style={styles.redRing}>
          <Text style={styles.darkGlyph}>{props.glyph ?? ''}</Text>
        </View>
      )}
      {props.shape === 'mandatory-blue' && (
        <View style={styles.blueCircle}>
          <Text style={styles.lightGlyph}>{props.glyph ?? ''}</Text>
        </View>
      )}
      {props.shape === 'info-rect' && (
        <View style={styles.infoRect}>
          <Text style={styles.lightGlyph}>{props.glyph ?? ''}</Text>
        </View>
      )}
      {props.shape === 'nsl-white' && (
        <View style={styles.nslCircle}>
          <View style={styles.nslBar} />
        </View>
      )}
      {props.label ? <Text style={styles.label}>{props.label}</Text> : null}
    </View>
  );
}

const SIZE = 120;

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space.sm },
  triangleOuter: {
    width: 0,
    height: 0,
    borderLeftWidth: SIZE / 2,
    borderRightWidth: SIZE / 2,
    borderBottomWidth: SIZE,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: RED,
    alignItems: 'center',
  },
  triangleInner: {
    position: 'absolute',
    top: 18,
    left: -SIZE / 2 + 14,
    width: 0,
    height: 0,
    borderLeftWidth: SIZE / 2 - 14,
    borderRightWidth: SIZE / 2 - 14,
    borderBottomWidth: SIZE - 28,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: colors.surface,
  },
  triangleGlyph: {
    position: 'absolute',
    top: SIZE / 2,
    left: -14,
    width: 28,
    textAlign: 'center',
    fontSize: font.lg,
    color: colors.text,
  },
  redRing: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 14,
    borderColor: RED,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blueCircle: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoRect: {
    width: SIZE * 1.2,
    height: SIZE * 0.8,
    borderRadius: 10,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nslCircle: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 3,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  nslBar: {
    width: SIZE * 1.1,
    height: 14,
    backgroundColor: colors.text,
    transform: [{ rotate: '-45deg' }],
  },
  darkGlyph: { fontSize: font.xl, color: colors.text, fontWeight: '700' },
  lightGlyph: { fontSize: font.xl, color: colors.surface, fontWeight: '700' },
  label: { fontSize: font.xs, color: colors.textMuted },
});
