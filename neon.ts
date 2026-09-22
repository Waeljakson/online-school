import { createClient } from '@neondatabase/neon-js';
import { BetterAuthReactAdapter } from '@neondatabase/neon-js/auth/react/adapters';

const authUrl = import.meta.env.VITE_NEON_AUTH_URL as string | undefined;
const dataApiUrl = import.meta.env.VITE_NEON_DATA_API_URL as string | undefined;

export const neonConfigured = Boolean(authUrl && dataApiUrl);

export const neon = neonConfigured
  ? createClient({
      auth: {
        adapter: BetterAuthReactAdapter(),
        url: authUrl!,
      },
      dataApi: {
        url: dataApiUrl!,
      },
    })
  : null;
