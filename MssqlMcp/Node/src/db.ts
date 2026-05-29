#!/usr/bin/env node

import sql from "mssql";
import { InteractiveBrowserCredential } from "@azure/identity";

// For windows-integrated auth, we need the msnodesqlv8 variant of the mssql module.
let sqlConnect: typeof sql | null = null;
async function getSqlModule(): Promise<typeof sql> {
  if (sqlConnect) return sqlConnect;
  if (authMethod === 'windows-integrated') {
    const mod = await import("mssql/msnodesqlv8.js");
    sqlConnect = mod.default;
  } else {
    sqlConnect = sql;
  }
  return sqlConnect;
}

// Globals for connection and token reuse
let globalSqlPool: sql.ConnectionPool | null = null;
let globalAccessToken: string | null = null;
let globalTokenExpiresOn: Date | null = null;

// Export function to get the global SQL pool
export function getSqlPool(): sql.ConnectionPool {
  if (!globalSqlPool || !globalSqlPool.connected) {
    throw new Error('SQL connection pool is not initialized or not connected');
  }
  return globalSqlPool;
}

// Get the authentication method from environment variable
export const authMethod = process.env.AUTH_METHOD?.toLowerCase() || 'azure-ad';

// Function to create SQL config based on authentication method
export async function createSqlConfig(): Promise<{ config: sql.config, token: string | null, expiresOn: Date | null }> {
  const trustServerCertificate = process.env.TRUST_SERVER_CERTIFICATE?.toLowerCase() === 'true';
  const connectionTimeout = process.env.CONNECTION_TIMEOUT ? parseInt(process.env.CONNECTION_TIMEOUT, 10) : 30;

  const baseConfig = {
    server: process.env.SERVER_NAME!,
    database: process.env.DATABASE_NAME!,
    options: {
      encrypt: authMethod === 'azure-ad',
      trustServerCertificate
    },
    connectionTimeout: connectionTimeout * 1000,
  };

  switch (authMethod) {
    case 'sql': {
      const username = process.env.SQL_USERNAME;
      const password = process.env.SQL_PASSWORD;

      if (!username || !password) {
        throw new Error('SQL_USERNAME and SQL_PASSWORD environment variables are required for SQL authentication');
      }

      return {
        config: {
          ...baseConfig,
          user: username,
          password: password,
          options: {
            ...baseConfig.options,
            encrypt: process.env.ENCRYPT?.toLowerCase() === 'true',
          },
        },
        token: null,
        expiresOn: null
      };
    }

    case 'windows': {
      return {
        config: {
          ...baseConfig,
          options: {
            ...baseConfig.options,
            encrypt: process.env.ENCRYPT?.toLowerCase() === 'true',
          },
          authentication: {
            type: 'ntlm',
            options: {
              domain: process.env.DOMAIN || '',
              userName: process.env.USERNAME || '',
              password: process.env.PASSWORD || '',
            },
          },
        },
        token: null,
        expiresOn: null
      };
    }

    case 'windows-integrated': {
      const encrypt = process.env.ENCRYPT?.toLowerCase() === 'true';
      const connectionString = `Driver={ODBC Driver 17 for SQL Server};Server=${process.env.SERVER_NAME};Database=${process.env.DATABASE_NAME};Trusted_Connection=Yes;Encrypt=${encrypt ? 'yes' : 'no'};TrustServerCertificate=${trustServerCertificate ? 'yes' : 'no'};Connection Timeout=${connectionTimeout};`;

      return {
        config: {
          connectionString: connectionString,
        } as unknown as sql.config,
        token: null,
        expiresOn: null
      };
    }

    case 'azure-ad':
    default: {
      const credential = new InteractiveBrowserCredential({
        redirectUri: 'http://localhost'
      });
      const accessToken = await credential.getToken('https://database.windows.net/.default');

      return {
        config: {
          ...baseConfig,
          options: {
            ...baseConfig.options,
            encrypt: true,
          },
          authentication: {
            type: 'azure-active-directory-access-token',
            options: {
              token: accessToken?.token!,
            },
          },
        },
        token: accessToken?.token!,
        expiresOn: accessToken?.expiresOnTimestamp ? new Date(accessToken.expiresOnTimestamp) : new Date(Date.now() + 30 * 60 * 1000)
      };
    }
  }
}

// Connect to SQL only when handling a request
export async function ensureSqlConnection() {
  if (authMethod !== 'azure-ad') {
    if (globalSqlPool && globalSqlPool.connected) {
      return;
    }
  } else {
    if (
      globalSqlPool &&
      globalSqlPool.connected &&
      globalAccessToken &&
      globalTokenExpiresOn &&
      globalTokenExpiresOn > new Date(Date.now() + 2 * 60 * 1000)
    ) {
      return;
    }
  }

  const { config, token, expiresOn } = await createSqlConfig();
  globalAccessToken = token;
  globalTokenExpiresOn = expiresOn;

  if (globalSqlPool && globalSqlPool.connected) {
    await globalSqlPool.close();
  }

  const sqlMod = await getSqlModule();
  globalSqlPool = await sqlMod.connect(config);
}
