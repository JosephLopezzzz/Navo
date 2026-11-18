import { requireNativeView } from 'expo';
import { Platform, View, type NativeSyntheticEvent, type ViewProps } from 'react-native';

type StationHoverEvent = {
  phase: 'move' | 'exit';
  x: number;
  y: number;
};

type Props = ViewProps & {
  observing: boolean;
  onStationHover: (event: NativeSyntheticEvent<StationHoverEvent>) => void;
};

const AndroidObserver = Platform.OS === 'android'
  ? requireNativeView<Props>('NavoMapHover')
  : null;

/** Observes Android hover without intercepting MapLibre touch gestures. */
export function NativeHoverObserver({ observing, onStationHover, ...props }: Props) {
  return AndroidObserver
    ? <AndroidObserver {...props} observing={observing} onStationHover={onStationHover} />
    : <View {...props} />;
}
