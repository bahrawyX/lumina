/**
 * A clean (non-seeded) page fixture for public / pre-auth routes like
 * landing (/), /auth/signin, /onboarding. No localStorage is pre-populated
 * so we test the real first-visit experience.
 */
import { test as base, expect } from '@playwright/test';

export const test = base;
export { expect };
