import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { Keyboard, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent, type ViewInstance, type ViewStyle } from 'react-native';

export type GuideTargetId = 'saved-alarms' | 'add-alarm' | 'routes-tab' | 'settings-tab';
export interface GuideBounds { x: number; y: number; width: number; height: number }
interface GuideTargetsValue {
  targets: Partial<Record<GuideTargetId, GuideBounds>>;
  overlayBounds: GuideBounds | null;
  guideVisible: boolean;
  guideStep: number;
  setGuideStep: (step: number) => void;
  measure: (id: GuideTargetId, view: ViewInstance | null) => void;
  unregister: (id: GuideTargetId, view: ViewInstance | null) => void;
  measureOverlay: (view: ViewInstance | null) => void;
  refreshTargets: () => void;
  startGuide: () => void;
  finishGuide: () => void;
}

const GuideTargetsContext = createContext<GuideTargetsValue | null>(null);

export function GuideTargetsProvider({ children, onGuideFinish }: PropsWithChildren<{ onGuideFinish: () => void }>) {
  const [targets, setTargets] = useState<Partial<Record<GuideTargetId, GuideBounds>>>({});
  const [overlayBounds, setOverlayBounds] = useState<GuideBounds | null>(null);
  const [guideVisible, setGuideVisible] = useState(false);
  const [guideStep, setGuideStep] = useState(0);
  const targetViews = useRef(new Map<GuideTargetId, ViewInstance>());
  const { width, height } = useWindowDimensions();

  const setBounds = useCallback((id: GuideTargetId, next: GuideBounds) => {
    if (next.width <= 0 || next.height <= 0) return;
    setTargets((current) => {
      const previous = current[id];
      if (previous && Math.abs(previous.x - next.x) < 1 && Math.abs(previous.y - next.y) < 1
        && Math.abs(previous.width - next.width) < 1 && Math.abs(previous.height - next.height) < 1) return current;
      return { ...current, [id]: next };
    });
  }, []);

  const measure = useCallback((id: GuideTargetId, view: ViewInstance | null) => {
    if (!view) return;
    targetViews.current.set(id, view);
    view.measureInWindow((x, y, targetWidth, targetHeight) => setBounds(id, { x, y, width: targetWidth, height: targetHeight }));
  }, [setBounds]);

  const unregister = useCallback((id: GuideTargetId, view: ViewInstance | null) => {
    if (view && targetViews.current.get(id) !== view) return;
    targetViews.current.delete(id);
    setTargets((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  const refreshTargets = useCallback(() => {
    for (const [id, view] of targetViews.current) measure(id, view);
  }, [measure]);

  const measureOverlay = useCallback((view: ViewInstance | null) => {
    view?.measureInWindow((x, y, overlayWidth, overlayHeight) => {
      const next = { x, y, width: overlayWidth, height: overlayHeight };
      setOverlayBounds((previous) => previous && Math.abs(previous.x - x) < 1 && Math.abs(previous.y - y) < 1
        && Math.abs(previous.width - overlayWidth) < 1 && Math.abs(previous.height - overlayHeight) < 1 ? previous : next);
      refreshTargets();
    });
  }, [refreshTargets]);

  const startGuide = useCallback(() => {
    refreshTargets();
    setGuideStep(0);
    setGuideVisible(true);
  }, [refreshTargets]);

  const finishGuide = useCallback(() => {
    setGuideVisible(false);
    onGuideFinish();
  }, [onGuideFinish]);

  useEffect(() => {
    const frame = requestAnimationFrame(refreshTargets);
    return () => cancelAnimationFrame(frame);
  }, [width, height, refreshTargets]);

  useEffect(() => {
    const scheduleRefresh = () => {
      requestAnimationFrame(() => {
        refreshTargets();
        setTimeout(refreshTargets, 120);
      });
    };
    const show = Keyboard.addListener('keyboardDidShow', scheduleRefresh);
    const hide = Keyboard.addListener('keyboardDidHide', scheduleRefresh);
    return () => { show.remove(); hide.remove(); };
  }, [refreshTargets]);

  const value = useMemo(() => ({
    targets, overlayBounds, guideVisible, guideStep, setGuideStep, measure, unregister, measureOverlay, refreshTargets, startGuide, finishGuide,
  }), [targets, overlayBounds, guideVisible, guideStep, measure, unregister, measureOverlay, refreshTargets, startGuide, finishGuide]);

  return <GuideTargetsContext.Provider value={value}>{children}</GuideTargetsContext.Provider>;
}

export function GuideTarget({ id, children, style }: PropsWithChildren<{ id: GuideTargetId; style?: ViewStyle }>) {
  const context = useContext(GuideTargetsContext);
  const ref = useRef<ViewInstance>(null);
  const measure = context?.measure;
  const unregister = context?.unregister;
  const onLayout = useCallback((_event: LayoutChangeEvent) => measure?.(id, ref.current), [id, measure]);

  useEffect(() => {
    const view = ref.current;
    measure?.(id, view);
    return () => unregister?.(id, view);
  }, [id, measure, unregister]);

  return <View ref={ref} collapsable={false} onLayout={onLayout} style={[styles.target, style]}>{children}</View>;
}

export function useGuideTargets() {
  return useContext(GuideTargetsContext)?.targets ?? {};
}

export function useGuideControls() {
  const context = useContext(GuideTargetsContext);
  return {
    visible: context?.guideVisible ?? false,
    step: context?.guideStep ?? 0,
    setStep: context?.setGuideStep ?? (() => undefined),
    startGuide: context?.startGuide ?? (() => undefined),
    finishGuide: context?.finishGuide ?? (() => undefined),
    refreshTargets: context?.refreshTargets ?? (() => undefined),
    measureOverlay: context?.measureOverlay ?? (() => undefined),
    overlayBounds: context?.overlayBounds ?? null,
  };
}

const styles = StyleSheet.create({ target: { minWidth: 0 } });
