import { PublicClientApplication, Configuration, LogLevel } from '@azure/msal-browser';

const CLIENT_ID = '0c3c574f-3824-4374-98c3-363554d2773b';
const TENANT_ID = '6845d6ca-1ec5-4c0e-9e9d-34130ce0a0b8';

const msalConfig: Configuration = {
  auth: {
    clientId: CLIENT_ID,
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    redirectUri: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
  },
  cache: {
    cacheLocation: 'localStorage',
  },
  system: {
    loggerOptions: {
      logLevel: LogLevel.Warning,
      loggerCallback: (_level, message, containsPii) => {
        if (containsPii) return;
        console.debug('[MSAL]', message);
      },
    },
  },
};

export const msalInstance = new PublicClientApplication(msalConfig);

export const loginRequest = {
  scopes: ['User.Read', 'Calendars.Read', 'offline_access'],
};

export const graphScopes = {
  scopes: ['User.Read', 'Calendars.Read'],
};
