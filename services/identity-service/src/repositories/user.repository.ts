import { pool } from "../db/pool";

export type UserRecord = {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  created_at: Date;
  updated_at: Date;
};

export async function findUserByEmail(
  email: string
): Promise<UserRecord | null> {
  const result = await pool.query<UserRecord>(
    `
    SELECT
      id,
      email,
      password_hash,
      full_name,
      created_at,
      updated_at
    FROM users
    WHERE email = LOWER(TRIM($1))
    LIMIT 1
    `,
    [email]
  );

  return result.rows[0] ?? null;
}

export async function findUserById(userId: string): Promise<UserRecord | null> {
  const result = await pool.query<UserRecord>(
    `
    SELECT
      id,
      email,
      password_hash,
      full_name,
      created_at,
      updated_at
    FROM users
    WHERE id = $1
    LIMIT 1
    `,
    [userId]
  );

  return result.rows[0] ?? null;
}

export async function registerUser(params: {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
}): Promise<void> {
  await pool.query(
    `
    CALL sp_register_user(
      $1::uuid,
      $2::varchar,
      $3::text,
      $4::varchar
    )
    `,
    [params.id, params.email, params.passwordHash, params.fullName]
  );
}

export async function updatePasswordHash(params: {
  userId: string;
  passwordHash: string;
}): Promise<void> {
  await pool.query(
    `
    UPDATE users
    SET
      password_hash = $2,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    `,
    [params.userId, params.passwordHash]
  );
}