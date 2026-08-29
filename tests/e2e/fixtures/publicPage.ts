/**
 * A genuinely signed-out page, for the public routes: `/`, `/auth/signin`,
 * `/onboarding`.
 *
 * The signed-out part is enforced by the `chromium-public` project in
 * `playwright.config.ts`, which runs these specs with `storageState:
 * undefined` while every other project loads the session created by global
 * setup.
 *
 * It lives in the config rather than here on purpose. A public spec that
 * silently inherits the session does not error — it quietly tests the wrong
 * thing, because `/` redirects an authenticated visitor to `/calendar` and a
 * "renders the marketing hero" assertion then fails for a reason that has
 * nothing to do with the hero. Making it a project boundary means it cannot be
 * forgotten by a spec that imports the wrong fixture.
 *
 * Nothing is pre-populated in localStorage either, so these exercise the real
 * first-visit experience.
 */
import { test as base, expect } from '@playwright/test';

export const test = base;
export { expect };
