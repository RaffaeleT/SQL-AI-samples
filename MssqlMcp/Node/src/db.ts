import sql from "mssql";

let globalSqlPool: sql.ConnectionPool | null = null;

export function getSqlPool(): sql.ConnectionPool {
  if (!globalSqlPool || !globalSqlPool.connected) {
    throw new Error('SQL connection pool is not initialized or not connected');
  }
  return globalSqlPool;
}

export function setSqlPool(pool: sql.ConnectionPool | null): void {
  globalSqlPool = pool;
}

export function getRawSqlPool(): sql.ConnectionPool | null {
  return globalSqlPool;
}
