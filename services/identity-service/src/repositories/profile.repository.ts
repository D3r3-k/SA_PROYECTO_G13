import { pool } from "../db/pool";

export type ProfileRecord = {
  profile_id: string;
  user_id: string;
  name: string;
  avatar_url: string | null;
  created_at?: Date;
  updated_at?: Date;
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
    SELECT
      profile_id,
      user_id,
      name,
      avatar_url,
      created_at,
      updated_at
    FROM vw_user_profiles
    WHERE user_id = $1
    ORDER BY created_at ASC
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
    SELECT
      profile_id,
      user_id,
      name,
      avatar_url,
      created_at,
      updated_at
    FROM vw_user_profiles
    WHERE user_id = $1
      AND profile_id = $2
    LIMIT 1
    `,
    [params.userId, params.profileId]
  );

  return result.rows[0] ?? null;
}