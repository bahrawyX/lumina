import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { google, microsoft } from 'better-auth/social-providers';
import { db } from '@/lib/db';
import * as schema from '@/db/schema';

const secret = process.env.BETTER_AUTH_SECRET;
const baseURL = process.env.BETTER_AUTH_URL;
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const microsoftClientId = process.env.MICROSOFT_CLIENT_ID;
const microsoftClientSecret = process.env.MICROSOFT_CLIENT_SECRET;

const hasGoogleCredentials = Boolean(googleClientId && googleClientSecret);
const hasMicrosoftCredentials = Boolean(microsoftClientId && microsoftClientSecret);

if (!db) {
  throw new Error('DATABASE_URL is required for BetterAuth database sessions.');
}

if (!secret) {
  throw new Error('BETTER_AUTH_SECRET is required for BetterAuth.');
}

if (!baseURL) {
  throw new Error('BETTER_AUTH_URL is required for BetterAuth.');
}

const socialProviders = {
  // ── Google login: identity only (openid, email, profile) ──────────────────
  // Calendar scopes are requested separately via the explicit integration connect
  // flow (/api/integrations/google/connect). Never add calendar scopes here.
  ...(hasGoogleCredentials
    ? {
        google: google({
          clientId: googleClientId,
          clientSecret: googleClientSecret,
        }).options,
      }
    : {}),

  // ── Microsoft login: identity only ────────────────────────────────────────
  // Calendar scopes (Calendars.Read) are requested via /api/integrations/microsoft/connect.
  ...(hasMicrosoftCredentials
    ? {
        microsoft: microsoft({
          clientId: microsoftClientId,
          clientSecret: microsoftClientSecret,
        }).options,
      }
    : {}),
};

export const auth = betterAuth({
  secret,
  baseURL,
  trustedOrigins: [baseURL],
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
    usePlural: true,
  }),
  advanced: {
    database: {
      generateId: 'uuid',
    },
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  socialProviders,
});
