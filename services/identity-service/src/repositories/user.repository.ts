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
    SELECT *
    FROM sp_find_user_by_email($1::varchar)
    `,
    [email]
  );

  return result.rows[0] ?? null;
}

export async function findUserById(userId: string): Promise<UserRecord | null> {
  const result = await pool.query<UserRecord>(
    `
    SELECT *
    FROM sp_find_user_by_id($1::uuid)
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
    CALL sp_update_user_password(
      $1::uuid,
      $2::text
    )
    `,
    [params.userId, params.passwordHash]
  );
}