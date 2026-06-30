import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379/0";
const auditQueueName = "log_audit_queue";

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        if (times > 3) return null;
        return 1000;
      },
    });
    
    redisClient.on("error", (err) => {
      console.error("[AuditLogger] Redis connection error:", err.message);
    });
  }
  return redisClient;
}

export function logAudit(action: string, userId: string | null, details: any = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    service: "identity-service",
    action,
    user_id: userId || "anonymous",
    details,
  };

  try {
    const client = getRedisClient();
    client.rpush(auditQueueName, JSON.stringify(payload)).catch((err) => {
      console.error("[AuditLogger] Failed to push audit log to Redis", err.message);
    });
    console.log(`[Audit] ${action} - User: ${userId}`);
  } catch (error) {
    console.error("[AuditLogger] Unexpected error pushing log:", error);
  }
}
