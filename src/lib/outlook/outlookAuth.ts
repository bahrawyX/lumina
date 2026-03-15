import { msalInstance, loginRequest, graphScopes } from './msalConfig';
import type { AccountInfo, AuthenticationResult } from '@azure/msal-browser';

const TOKEN_KEY = 'lumina_outlook_token';
const ACCOUNT_KEY = 'lumina_outlook_account';

let cachedToken: string | null = null;
let initialized = false;

async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  try {
    await msalInstance.initialize();
    await msalInstance.handleRedirectPromise();
  } catch {
    // Already initialized at boot — safe to proceed
  }
  initialized = true;
}

function getStoredAccount(): AccountInfo | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeAccount(account: AccountInfo): void {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
}

function storeToken(token: string): void {
  cachedToken = token;
  localStorage.setItem(TOKEN_KEY, token);
}

export function getStoredToken(): string | null {
  return cachedToken || localStorage.getItem(TOKEN_KEY);
}

export function isOutlookConnected(): boolean {
  return !!getStoredAccount() && !!getStoredToken();
}

export async function connectOutlook(): Promise<string> {
  await ensureInitialized();

  let result: AuthenticationResult;
  try {
    result = await msalInstance.loginPopup(loginRequest);
  } catch (err: any) {
    if (err.errorCode === 'user_cancelled') {
      throw new Error('Login cancelled by user.');
    }
    throw new Error(`Microsoft login failed: ${err.message || err}`);
  }

  if (!result.account) {
    throw new Error('No account returned from Microsoft login.');
  }

  storeAccount(result.account);
  storeToken(result.accessToken);
  return result.accessToken;
}

export async function acquireToken(): Promise<string> {
  await ensureInitialized();

  const account = getStoredAccount();
  if (!account) {
    throw new Error('No Outlook account found. Please connect first.');
  }

  msalInstance.setActiveAccount(account);

  try {
    const result = await msalInstance.acquireTokenSilent({
      ...graphScopes,
      account,
    });
    storeToken(result.accessToken);
    return result.accessToken;
  } catch {
    try {
      const result = await msalInstance.loginPopup(graphScopes);
      if (result.account) storeAccount(result.account);
      storeToken(result.accessToken);
      return result.accessToken;
    } catch (err: any) {
      throw new Error(`Token refresh failed: ${err.message || err}`);
    }
  }
}

export function disconnectOutlook(): void {
  cachedToken = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ACCOUNT_KEY);
}
