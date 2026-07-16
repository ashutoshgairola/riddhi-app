// Lets TypeScript treat `.svg` imports as React components, matching the
// runtime transform configured in metro.config.js (react-native-svg-transformer).
declare module '*.svg' {
  import type { FC } from 'react';
  import type { SvgProps } from 'react-native-svg';
  const content: FC<SvgProps>;
  export default content;
}
