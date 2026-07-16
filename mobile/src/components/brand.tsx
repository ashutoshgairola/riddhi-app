// Brand marks backed by the vendored SVGs in assets/brand (rendered as
// components by react-native-svg-transformer). `size` is the rendered height.
import LogomarkSvg from '../../assets/brand/logomark.svg';
import WordmarkSvg from '../../assets/brand/wordmark.svg';

// Wordmark viewBox is 1793×540 (width/height); preserve that aspect ratio.
const WORDMARK_RATIO = 1793 / 540;

export function BrandWordmark({ size = 40 }: { size?: number }) {
  return <WordmarkSvg height={size} width={size * WORDMARK_RATIO} />;
}

export function BrandLogomark({ size = 40 }: { size?: number }) {
  return <LogomarkSvg width={size} height={size} />;
}
