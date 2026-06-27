import { pool } from "../db/pool";

export type UserRecord = {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  created_at: Date;
  updated_at: Date;
};

export type UserAuthorization = {
  roles: string[];
  permissions: string[];
  isAdmin: boolean;
};

export type AuditLogRecord = {
  service: string;
  audit_id: string;
  actor_user_id: string;
  actor_email: string;
  action: string;
  table_name: string;
  record_id: string;
  old_state_json: string;
  new_state_json: string;
  created_at: string;
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
  await assignRoleToUser(params.id, "user");
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

export async function assignRoleToUser(
  userId: string,
  roleName: string
): Promise<void> {
  await pool.query(
    `CALL sp_assign_role_to_user($1::uuid, $2::varchar);`,
    [userId, roleName]
  );
}

export async function getUserAuthorization(
  userId: string
): Promise<UserAuthorization> {
  const rolesResult = await pool.query<{ role_name: string }>(
    `SELECT role_name FROM fn_list_user_roles($1::uuid);`,
    [userId]
  );
  const permissionsResult = await pool.query<{ permission_code: string }>(
    `SELECT permission_code FROM fn_list_user_permissions($1::uuid);`,
    [userId]
  );

  const roles = rolesResult.rows.map((row: { role_name: string }) => row.role_name);
  const permissions = permissionsResult.rows.map((row: { permission_code: string }) => row.permission_code);

  return {
    roles,
    permissions,
    isAdmin: roles.includes("admin")
  };
}

export async function ensureAdminRoleForEmail(
  userId: string,
  email: string,
  adminEmails: string[]
): Promise<void> {
  if (adminEmails.includes(email.trim().toLowerCase())) {
    await assignRoleToUser(userId, "admin");
  }
}

export async function seedConfiguredAdmins(adminEmails: string[]): Promise<void> {
  const normalized = adminEmails.map((email) => email.trim().toLowerCase()).filter(Boolean);
  if (normalized.length === 0) {
    return;
  }

  const result = await pool.query<{ id: string; email: string }>(
    `SELECT id::text, email FROM users WHERE email = ANY($1::varchar[]);`,
    [normalized]
  );

  for (const row of result.rows) {
    await assignRoleToUser(row.id, "admin");
  }
}

export async function updateLastLogin(userId: string): Promise<void> {
  await pool.query(
    `CALL sp_update_last_login($1::uuid)`,
    [userId]
  );
}

export type InactiveUserRecord = {
  id: string;
  email: string;
  last_login_at: Date | null;
};

export async function listInactiveUsers(thresholdInterval: string): Promise<InactiveUserRecord[]> {
  const result = await pool.query<InactiveUserRecord>(
    `
    SELECT u.id::text, u.email, u.last_login_at
    FROM users u
    WHERE u.deleted_at IS NULL
      AND u.id NOT IN (
          SELECT ur.user_id
          FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
          WHERE r.name = 'admin'
      )
      AND (
          (u.last_login_at IS NULL     AND u.created_at    < NOW() - $1::INTERVAL)
          OR
          (u.last_login_at IS NOT NULL AND u.last_login_at < NOW() - $1::INTERVAL)
      )
    `,
    [thresholdInterval]
  );
  return result.rows;
}

export async function purgeInactiveUsers(thresholdInterval: string): Promise<number> {
  const result = await pool.query<{ fn_purge_inactive_users: number }>(
    `SELECT fn_purge_inactive_users($1::text)`,
    [thresholdInterval]
  );
  return result.rows[0].fn_purge_inactive_users;
}

export async function listAuditLogs(params: {
  tableName?: string;
  actorUserId?: string;
  action?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<AuditLogRecord[]> {
  const result = await pool.query<Omit<AuditLogRecord, "service">>(
    `
    SELECT *
    FROM fn_identity_audit_report(
      $1::text,
      $2::text,
      $3::text,
      NULLIF($4::text, '')::timestamptz,
      NULLIF($5::text, '')::timestamptz,
      $6::integer,
      $7::integer
    );
    `,
    [
      params.tableName || "",
      params.actorUserId || "",
      params.action || "",
      params.from || "",
      params.to || "",
      params.limit || 100,
      params.offset || 0
    ]
  );

  return result.rows.map((row: Omit<AuditLogRecord, "service">) => ({ service: "identity", ...row }));
}
