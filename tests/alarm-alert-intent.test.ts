import { beforeEach, describe, expect, it, vi } from 'vitest';
import { redirectSystemPath } from '../src/app/+native-intent';
import { alarmAlertReferenceFromUrl } from '../src/domain/alarm-alert-reference';
import { consumeAlarmAlertIntent, getAlarmAlertIntent, queueAlarmAlertIntent, subscribeAlarmAlertIntent } from '../src/state/alarm-alert-intent';

const reference = { alarmId: 'alarm /#1', sessionId: 'session:one', eventId: 'session:one:arrived' };
const url = `navo://alarm/alert?${new URLSearchParams(reference)}`;
beforeEach(() => { const pending = getAlarmAlertIntent(); if (pending) consumeAlarmAlertIntent(pending); });

describe('single-owner alarm notification navigation', () => {
  it('holds an initial native tap before hydration and prevents automatic Router navigation', () => {
    expect(redirectSystemPath({ path: url, initial: true })).toBeNull();
    expect(getAlarmAlertIntent()).toEqual(reference);
    const observer = vi.fn();
    const unsubscribe = subscribeAlarmAlertIntent(observer);
    expect(getAlarmAlertIntent()).toEqual(reference);
    unsubscribe();
  });

  it('also suppresses warm native navigation so the coordinator opens only one alert', () => {
    expect(redirectSystemPath({ path: url, initial: false })).toBeNull();
    const first = getAlarmAlertIntent();
    const observer = vi.fn();
    const unsubscribe = subscribeAlarmAlertIntent(observer);
    queueAlarmAlertIntent({ ...reference });
    expect(getAlarmAlertIntent()).toBe(first);
    expect(observer).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('does not consume a newer tap when an older one finishes processing', () => {
    queueAlarmAlertIntent(reference);
    const old = getAlarmAlertIntent()!;
    const next = { ...reference, eventId: 'session:one:missed' };
    queueAlarmAlertIntent(next);
    consumeAlarmAlertIntent(old);
    expect(getAlarmAlertIntent()).toBe(next);
    consumeAlarmAlertIntent(next);
    expect(getAlarmAlertIntent()).toBeNull();
  });

  it('leaves unrelated links unchanged and rejects ambiguous or malformed alarm identities', () => {
    expect(redirectSystemPath({ path: 'navo://preferences', initial: true })).toBe('navo://preferences');
    for (const value of ['https://example.com/alarm/alert?alarmId=a&sessionId=s&eventId=e', 'navo://alarm/alert?alarmId=a&alarmId=b&sessionId=s&eventId=e', 'navo://alarm/alert?eventId=e', '', null]) {
      expect(alarmAlertReferenceFromUrl(value)).toBeNull();
    }
    expect(getAlarmAlertIntent()).toBeNull();
  });

  it('retains routing intent when an observer fails', () => {
    const removeBroken = subscribeAlarmAlertIntent(() => { throw new Error('Observer unmounted'); });
    const observer = vi.fn();
    const removeObserver = subscribeAlarmAlertIntent(observer);
    expect(() => queueAlarmAlertIntent(reference)).not.toThrow();
    expect(observer).toHaveBeenCalledOnce();
    expect(getAlarmAlertIntent()).toEqual(reference);
    removeBroken(); removeObserver();
  });
});
