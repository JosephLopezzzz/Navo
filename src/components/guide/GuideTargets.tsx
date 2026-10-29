import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type ViewInstance, type ViewStyle } from 'react-native';

export type GuideTargetId = 'alarms-tab' | 'add-alarm' | 'routes-tab' | 'settings-tab';
export interface GuideBounds { x: number; y: number; width: number; height: number }
interface GuideTargetsValue {
  targets: Partial<Record<GuideTargetId, GuideBounds>>;
  measure: (id: GuideTargetId, view: ViewInstance | null) => void;
}

const GuideTargetsContext = createContext<GuideTargetsValue | null>(null);

export function GuideTargetsProvider({ children }: PropsWithChildren) {
  const [targets, setTargets] = useState<Partial<Record<GuideTargetId, GuideBounds>>>({});
  const measure = useCallback((id: GuideTargetId, view: ViewInstance | null) => {
    view?.measureInWindow((x, y, width, height) => {
      if (width <= 0 || height <= 0) return;
      setTargets((current) => {
        const previous = current[id];
        if (previous && Math.abs(previous.x - x) < 1 && Math.abs(previous.y - y) < 1
          && Math.abs(previous.width - width) < 1 && Math.abs(previous.height - height) < 1) return current;
        return { ...current, [id]: { x, y, width, height } };
      });
    });
  }, []);
  const value = useMemo(() => ({ targets, measure }), [targets, measure]);
  return <GuideTargetsContext.Provider value={value}>{children}</GuideTargetsContext.Provider>;
}

export function GuideTarget({ id, children, style }: PropsWithChildren<{ id: GuideTargetId; style?: ViewStyle }>) {
  const context = useContext(GuideTargetsContext);
  const ref = useRef<ViewInstance>(null);
  const measure = context?.measure;
  const onLayout = useCallback((_event: LayoutChangeEvent) => measure?.(id, ref.current), [id, measure]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => measure?.(id, ref.current));
    return () => cancelAnimationFrame(frame);
  }, [id, measure]);

  return <View ref={ref} collapsable={false} onLayout={onLayout} style={[styles.target, style]}>{children}</View>;
}

export function useGuideTargets() {
  return useContext(GuideTargetsContext)?.targets ?? {};
}

const styles = StyleSheet.create({ target: { minWidth: 0 } });
