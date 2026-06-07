from __future__ import annotations

import asyncio
import html
import json
import logging
import os
import uuid
from email.message import EmailMessage
from typing import Any

import grpc
import redis.asyncio as redis
from dotenv import load_dotenv

import notification_pb2
import notification_pb2_grpc

try:
    import aiosmtplib
except Exception:
    aiosmtplib = None


load_dotenv()

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(message)s"
)
logger = logging.getLogger("notification-service-grpc")


REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
NOTIFICATION_QUEUE_NAME = os.getenv("NOTIFICATION_QUEUE_NAME", "notification:queue")

SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT") or "587")
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM = os.getenv("SMTP_FROM")
SMTP_STARTTLS = os.getenv("SMTP_STARTTLS", "true").lower() in {"1", "true", "yes", "on"}

redis_client = redis.from_url(REDIS_URL, decode_responses=True)


async def _send_email(to_address: str, subject: str, body: str) -> bool:
    if not (SMTP_HOST and SMTP_FROM):
        logger.info("SMTP not configured; using console fallback")
        return False

    if aiosmtplib is None:
        logger.warning("aiosmtplib is not installed; using console fallback")
        return False

    message = EmailMessage()
    message["From"] = SMTP_FROM
    message["To"] = to_address
    message["Subject"] = subject

    safe_subject = html.escape(subject)
    safe_body = html.escape(body).replace("\n", "<br>")

    html_content = f"""
<!doctype html>
<html lang="es">
  <body style="margin:0;background:#0b0b0f;font-family:Arial;color:#f5f5f5;">
    <div style="max-width:640px;margin:40px auto;background:#15151d;border-radius:20px;overflow:hidden;">
      <div style="background:#e50914;padding:24px 32px;">
        <div style="font-size:12px;letter-spacing:.22em;text-transform:uppercase;">Quetxal TV</div>
        <h1 style="margin:8px 0 0;color:#fff;">{safe_subject}</h1>
      </div>
      <div style="padding:32px;">
        <p style="font-size:16px;line-height:1.6;">{safe_body}</p>
      </div>
    </div>
  </body>
</html>
"""

    message.set_content(body)
    message.add_alternative(html_content, subtype="html")

    try:
        send_kwargs: dict[str, Any] = {
            "hostname": SMTP_HOST,
            "port": SMTP_PORT,
            "start_tls": SMTP_STARTTLS,
        }

        if SMTP_USER:
            send_kwargs["username"] = SMTP_USER
            send_kwargs["password"] = SMTP_PASSWORD

        await aiosmtplib.send(message, **send_kwargs)

        logger.info("Email sent to %s via %s:%s", to_address, SMTP_HOST, SMTP_PORT)
        return True

    except Exception:
        logger.exception("Failed to send email to %s", to_address)
        return False


def _build_notification_content(payload: dict[str, Any]) -> dict[str, str]:
    notification_type = str(payload.get("type") or "generic").strip().lower()
    metadata = payload.get("metadata") or {}

    if notification_type == "registration":
        full_name = metadata.get("full_name") or ""
        subject = payload.get("subject") or "Confirmación de registro en Quetxal TV"
        body = (
            f"Hola {full_name}, tu cuenta ya quedó activa. "
            if full_name
            else "Tu cuenta ya quedó activa. "
        ) + "Ya puedes iniciar sesión y empezar a explorar el catálogo."

    elif notification_type == "purchase":
        action = metadata.get("action") or "created"
        plan_name = metadata.get("plan_name") or "Plan activo"
        price_usd = metadata.get("price_usd") or ""

        subject = payload.get("subject") or (
            "Actualización de tu suscripción en Quetxal TV"
            if action == "updated"
            else "Recibo de compra en Quetxal TV"
        )

        body = (
            "Tu suscripción fue actualizada correctamente."
            if action == "updated"
            else "Tu suscripción quedó activa correctamente."
        )

        body += f" Plan: {plan_name}."

        if price_usd:
            body += f" Total: USD {price_usd}."

    elif notification_type in {"content-publication", "publication", "content"}:
        content_title = metadata.get("content_title") or metadata.get("title") or "Nueva publicación"
        category = metadata.get("category") or "Destacado"

        subject = payload.get("subject") or "Nueva publicación en Quetxal TV"
        body = f"Ya está disponible {content_title}. Categoría: {category}."

    else:
        subject = payload.get("subject") or "Notificación Quetxal TV"
        body = payload.get("body") or str(payload)

    return {
        "subject": str(subject),
        "body": str(body)
    }


async def _process_notification(payload: dict[str, Any]) -> None:
    to_addr = payload.get("email") or payload.get("to")
    content = _build_notification_content(payload)

    if to_addr and await _send_email(to_addr, content["subject"], content["body"]):
        return

    logger.info("[console_fallback] %s", payload)


async def _notification_worker() -> None:
    logger.info("notification worker started queue=%s", NOTIFICATION_QUEUE_NAME)

    while True:
        try:
            item = await redis_client.blpop(NOTIFICATION_QUEUE_NAME, timeout=5)

            if item is None:
                continue

            _, raw_payload = item
            payload = json.loads(raw_payload)

            logger.info("[dequeued_redis] %s", payload)

            await _process_notification(payload)

        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("notification worker error")
            await asyncio.sleep(2)


class NotificationServiceServicer(notification_pb2_grpc.NotificationServiceServicer):
    async def Health(self, request, context):
        redis_ok = False

        try:
            redis_ok = bool(await redis_client.ping())
        except Exception:
            logger.exception("redis health failed")

        return notification_pb2.NotificationHealthResponse(
            success=True,
            status="ok" if redis_ok else "degraded",
            redis=redis_ok,
            smtp=bool(SMTP_HOST and SMTP_FROM)
        )

    async def Send(self, request, context):
        message_id = str(uuid.uuid4())

        payload = {
            "message_id": message_id,
            "type": request.type,
            "user_id": request.user_id,
            "email": request.email,
            "subject": request.subject,
            "body": request.body,
            "metadata": dict(request.metadata)
        }

        await redis_client.rpush(NOTIFICATION_QUEUE_NAME, json.dumps(payload))

        logger.info("[queued_redis] %s", payload)

        return notification_pb2.NotifyResponse(
            accepted=True,
            message_id=message_id,
            message="notification queued"
        )


async def serve() -> None:
    worker_task = asyncio.create_task(_notification_worker())

    server = grpc.aio.server()
    notification_pb2_grpc.add_NotificationServiceServicer_to_server(
        NotificationServiceServicer(),
        server
    )

    listen_addr = "[::]:50054"
    server.add_insecure_port(listen_addr)

    logger.info("Notification Service gRPC running on %s", listen_addr)

    await server.start()

    try:
        await server.wait_for_termination()
    finally:
        worker_task.cancel()
        await redis_client.aclose()


if __name__ == "__main__":
    asyncio.run(serve())