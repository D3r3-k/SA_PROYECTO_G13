import { pool } from "../db/pool";

export type ProfileRecord = {
  profile_id: string;
  user_id: string;
  name: string;
  avatar_url: string | null;
  created_at?: Date;
  updated_at?: Date;
};

export type BasicDbResponse = {
  success: boolean;
  message: string;
};

export async function createProfile(params: {
  id: string;
  userId: string;
  name: string;
  avatarUrl: string;
}): Promise<void> {
  await pool.query(
    `
    CALL sp_create_profile(
      $1::uuid,
      $2::uuid,
      $3::varchar,
      $4::text
    )
    `,
    [params.id, params.userId, params.name, params.avatarUrl]
  );
}

export async function findProfilesByUserId(
  userId: string
): Promise<ProfileRecord[]> {
  const result = await pool.query<ProfileRecord>(
    `
    SELECT *
    FROM sp_list_profiles_by_user($1::uuid)
    `,
    [userId]
  );

  return result.rows;
}

export async function findProfileByUserAndProfileId(params: {
  userId: string;
  profileId: string;
}): Promise<ProfileRecord | null> {
  const result = await pool.query<ProfileRecord>(
    `
    SELECT *
    FROM sp_find_profile_by_user_and_profile(
      $1::uuid,
      $2::uuid
    )
    `,
    [params.userId, params.profileId]
  );

  return result.rows[0] ?? null;
}

export async function updateProfileByUserAndProfileId(params: {
  userId: string;
  profileId: string;
  name: string;
  avatarUrl: string;
}): Promise<ProfileRecord | null> {
  const result = await pool.query<ProfileRecord>(
    `
    SELECT *
    FROM sp_update_profile(
      $1::uuid,
      $2::uuid,
      $3::varchar,
      $4::text
    )
    `,
    [params.userId, params.profileId, params.name, params.avatarUrl]
  );

  return result.rows[0] ?? null;
}

export async function deleteProfileByUserAndProfileId(params: {
  userId: string;
  profileId: string;
}): Promise<BasicDbResponse> {
  const result = await pool.query<BasicDbResponse>(
    `
    SELECT *
    FROM sp_delete_profile(
      $1::uuid,
      $2::uuid
    )
    `,
    [params.userId, params.profileId]
  );

  return (
    result.rows[0] || {
      success: false,
      message: "Profile not found for this user"
    }
  );
}