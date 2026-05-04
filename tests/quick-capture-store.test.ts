import { describe, it, expect, beforeEach } from 'vitest';
import { useQuickCaptureStore } from '@/store/useQuickCaptureStore';

describe('useQuickCaptureStore', () => {
  beforeEach(() => {
    useQuickCaptureStore.setState({ isOpen: false });
  });

  it('starts closed', () => {
    expect(useQuickCaptureStore.getState().isOpen).toBe(false);
  });

  it('open() sets isOpen to true', () => {
    useQuickCaptureStore.getState().open();
    expect(useQuickCaptureStore.getState().isOpen).toBe(true);
  });

  it('close() sets isOpen to false', () => {
    useQuickCaptureStore.getState().open();
    useQuickCaptureStore.getState().close();
    expect(useQuickCaptureStore.getState().isOpen).toBe(false);
  });

  it('toggle() flips isOpen from false → true', () => {
    useQuickCaptureStore.getState().toggle();
    expect(useQuickCaptureStore.getState().isOpen).toBe(true);
  });

  it('toggle() flips isOpen from true → false', () => {
    useQuickCaptureStore.getState().open();
    useQuickCaptureStore.getState().toggle();
    expect(useQuickCaptureStore.getState().isOpen).toBe(false);
  });
});
