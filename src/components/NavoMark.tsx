import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

export function NavoMark({ size = 44 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 512 512" accessibilityLabel="Navo" role="img">
      <Defs>
        <LinearGradient id="navoLogoGradient" x1="64" y1="96" x2="452" y2="432" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#2478E6" />
          <Stop offset="1" stopColor="#19B9A7" />
        </LinearGradient>
      </Defs>
      <Rect x="16" y="16" width="480" height="480" rx="138" fill="url(#navoLogoGradient)" />
      <Path d="M139 377V137L373 377V137" fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="48" opacity=".33" />
      <Path d="M133 292C177 292 190 258 223 256C257 254 265 281 297 273C329 265 342 223 373 208" fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="13" />
      <Path d="M373 112C348 112 329 131 329 156C329 190 373 222 373 222C373 222 417 190 417 156C417 131 398 112 373 112Z" fill="#fff" />
      <Circle cx="373" cy="156" r="13" fill="#228FAF" />
    </Svg>
  );
}
