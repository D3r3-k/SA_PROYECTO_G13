import { createClient } from "redis";

const redisUrl = process.env.REDIS_URL || "redis://redis:6379/0";
const queueName = process.env.NOTIFICATION_QUEUE_NAME || "notification:queue";

const redisClient = createClient({
  url: redisUrl
});

redisClient.on("error", (error) => {
  console.error("Redis notification publisher error", error);
});

async function ensureRedisConnection() {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
}

export async function publishNotificationEvent(
  payload: Record<string, unknown>
) {
  await ensureRedisConnection();

  const event = {
    ...payload,
    created_at: new Date().toISOString()
  };

  await redisClient.rPush(queueName, JSON.stringify(event));
}