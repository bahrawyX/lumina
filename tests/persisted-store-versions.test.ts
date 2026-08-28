/**
 * F5.5 — persisted stores with no `version`.
 *
 * Zustand's `persist` writes `{ state, version }`. With no `version` declared,
 * every payload is version 0 and `migrate` never runs, so a store whose shape
 * changes between releases rehydrates last release's object into this
 * release's code — silently, with no error, and with no way to detect it
 * afterwards.
 *
 * These drive the real stores' persist options rather than reading source, so
 * a `version` that is declared but not wired still fails.
 */
import { describe, it, expect } from 'vitest';
import { usePlannerStore } from '@/store/usePlannerStore';
import { useDailyBriefStore } from '@/store/useDailyBriefStore';
import { useAmbientStore } from '@/store/useAmbientStore';
import { useTutorialStore } from '@/store/useTutorialStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useOnboardingStore } from '@/store/useOnboardingStore';
import { useGuestStore } from '@/store/useGuestStore';

interface PersistOptions {
  version?: number;
  migrate?: (persisted: unknown, from: number) => unknown;
  partialize?: (state: unknown) => unknown;
  name?: string;
}

type Persisted = { persist: { getOptions: () => PersistOptions } };

const STORES: Array<[string, Persisted]> = [
  ['usePlannerStore', usePlannerStore as unknown as Persisted],
  ['useDailyBriefStore', useDailyBriefStore as unknown as Persisted],
  ['useAmbientStore', useAmbientStore as unknown as Persisted],
  ['useTutorialStore', useTutorialStore as unknown as Persisted],
  ['useSettingsStore', useSettingsStore as unknown as Persisted],
  ['useOnboardingStore', useOnboardingStore as unknown as Persisted],
  ['useGuestStore', useGuestStore as unknown as Persisted],
];

describe('F5.5 — every persisted store is versioned', () => {
  for (const [name, store] of STORES) {
    it(`${name} declares a version`, () => {
      const options = store.persist.getOptions();
      expect(typeof options.version, name).toBe('number');
      expect(options.version, name).toBeGreaterThanOrEqual(1);
    });

    it(`${name} declares a migrate, so the version can act`, () => {
      // A version with no migrate is decoration: zustand discards the payload
      // on mismatch only if `migrate` is absent AND it decides to, which is
      // not a behaviour to rely on. Being explicit is the point.
      expect(typeof store.persist.getOptions().migrate, name).toBe('function');
    });

    it(`${name} declares a partialize allowlist`, () => {
      // Without one, every derived and transient field lands in localStorage,
      // which is what makes a shape change dangerous in the first place.
      expect(typeof store.persist.getOptions().partialize, name).toBe('function');
    });
  }
});

describe('the migrations actually drop unknown payloads', () => {
  const NEWLY_VERSIONED: Array<[string, Persisted]> = STORES.slice(0, 4);

  for (const [name, store] of NEWLY_VERSIONED) {
    it(`${name} discards a pre-versioning payload`, () => {
      const { migrate, version } = store.persist.getOptions();
      const stale = { someRemovedField: 'from a previous release' };
      const result = migrate!(stale, 0) as Record<string, unknown>;
      expect(result, name).not.toHaveProperty('someRemovedField');
      expect(version, name).toBe(1);
    });

    it(`${name} passes a current-version payload through`, () => {
      const { migrate } = store.persist.getOptions();
      const current = { keep: true };
      expect(migrate!(current, 1), name).toEqual(current);
    });
  }
});
