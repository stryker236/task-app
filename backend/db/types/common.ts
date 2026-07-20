import type { Pool as PgPool, PoolClient } from 'pg';

export type Queryable = PgPool | PoolClient;

export type QueryPatch = Record<string, unknown>;

export type DbRow = Record<string, any>;

