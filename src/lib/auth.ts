import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { google } from 'better-auth/social-providers';
import { db } from '@/lib/db';
import * as schema from '@/db/schema';

const secret = process.env.BETTER_AUTH_SECRET ?? 'dev-secret-change-me';
const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

const socialProviders = googleClientId && googleClientSecret
  ? {
      google: google({
        clientId: googleClientId,
        clientSecret: googleClientSecret,
      }).options,
    }
  : {};

export const auth = betterAuth({
  secret,
  baseURL,
  trustedOrigins: [baseURL],
  ...(db
    ? {
        database: drizzleAdapter(db, {
          provider: 'pg',
          schema,
          usePlural: true,
        }),
      }
    : {}),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  socialProviders,
});
