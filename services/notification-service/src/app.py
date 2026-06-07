from __future__ import annotations

import logging
import os
import html
from email.message import EmailMessage
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI
from pydantic import BaseModel, EmailStr

try:
    import aiosmtplib
except Exception:  # pragma: no cover - optional dependency fallback
    aiosmtplib = None


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARENT_ENV = os.path.join(BASE_DIR, "..", ".env")
load_dotenv(PARENT_ENV) if os.path.exists(PARENT_ENV) else load_dotenv()

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("notification-service")


class NotificationRequest(BaseModel):
    type: str
    user_id: Optional[str] = None
    email: Optional[EmailStr] = None
    subject: Optional[str] = None
    message: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


app = FastAPI(title="notification-service")

SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT") or "587")
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM = os.getenv("SMTP_FROM")
SMTP_STARTTLS = os.getenv("SMTP_STARTTLS", "true").lower() in {"1", "true", "yes", "on"}


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "smtp": bool(SMTP_HOST and SMTP_FROM)}


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
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
    </head>
    <body style="margin:0;background:#0b0b0f;font-family:Arial,Helvetica,sans-serif;color:#f5f5f5;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:linear-gradient(180deg,#0b0b0f 0%,#111118 100%);padding:40px 16px;">
            <tr>
                <td align="center">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#15151d;border:1px solid #2a2a35;border-radius:20px;overflow:hidden;box-shadow:0 16px 40px rgba(0,0,0,.45);">
                        <tr>
                            <td style="background:linear-gradient(135deg,#e50914 0%,#b20710 100%);padding:24px 32px;">
                                <div style="font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.82);margin-bottom:10px;">Quetxal TV</div>
                                <div style="font-size:30px;line-height:1.1;font-weight:700;color:#ffffff;">{safe_subject}</div>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:32px;">
                                <p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#e8e8ea;">{safe_body}</p>
                                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0 8px;">
                                    <tr>
                                        <td style="background:#e50914;border-radius:999px;">
                                            <a href="#" style="display:inline-block;padding:14px 24px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:.02em;">Ver en Quetxal TV</a>
                                        </td>
                                    </tr>
                                </table>
                                <p style="margin:22px 0 0;font-size:12px;line-height:1.5;color:#9b9ba7;">Si no reconoces esta notificación, puedes ignorarla sin problema.</p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
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


def _build_notification_content(payload: Dict[str, Any]) -> dict[str, str]:
    notification_type = str(payload.get("type") or "generic").strip().lower()
    metadata = payload.get("metadata") or {}

    if notification_type == "registration":
        full_name = html.escape(str(metadata.get("full_name") or ""))
        subject = payload.get("subject") or "Confirmación de registro en Quetxal TV"
        heading = "Registro confirmado"
        body = (
            f"Hola {full_name}, tu cuenta ya quedó activa. "
            if full_name
            else "Tu cuenta ya quedó activa. "
        ) + "Ya puedes iniciar sesión y empezar a explorar el catálogo."
        cta_text = metadata.get("cta_text") or "Iniciar sesión"
        accent = "#e50914"
        footer = "Gracias por unirte a Quetxal TV."
    elif notification_type == "purchase":
        action = str(metadata.get("action") or "created").lower()
        plan_name = html.escape(str(metadata.get("plan_name") or "Plan activo"))
        price_usd = metadata.get("price_usd")
        subject = payload.get("subject") or (
            "Actualización de tu suscripción en Quetxal TV"
            if action == "updated"
            else "Recibo de compra en Quetxal TV"
        )
        heading = "Tu suscripción está lista"
        body = (
            "Tu suscripción fue actualizada correctamente."
            if action == "updated"
            else "Tu suscripción quedó activa correctamente."
        )
        if plan_name:
            body += f" Plan: {plan_name}."
        if price_usd is not None:
            body += f" Total: USD {price_usd}."
        cta_text = metadata.get("cta_text") or "Ver mi cuenta"
        accent = "#e50914"
        footer = "Guarda este correo como comprobante."
    elif notification_type in {"content-publication", "publication", "content"}:
        content_title = html.escape(
            str(metadata.get("content_title") or metadata.get("title") or "Nueva publicación")
        )
        category = html.escape(str(metadata.get("category") or "Destacado"))
        subject = payload.get("subject") or "Nueva publicación en Quetxal TV"
        heading = "Nuevo contenido disponible"
        body = (
            f"Ya está disponible {content_title}. "
            f"Categoría: {category}."
        )
        cta_text = metadata.get("cta_text") or "Ver contenido"
        accent = "#e50914"
        footer = "Compártelo con tus usuarios y mantén la parrilla activa."
    else:
        subject = payload.get("subject") or "Notification"
        heading = html.escape(subject)
        body = payload.get("message") or str(payload)
        cta_text = payload.get("metadata", {}).get("cta_text") or "Ver en Quetxal TV"
        accent = "#e50914"
        footer = "Si no reconoces esta notificación, puedes ignorarla sin problema."

    cta_url = str(metadata.get("cta_url") or payload.get("cta_url") or "#")
    plain_text = body

    return {
        "subject": str(subject),
        "heading": str(heading),
        "body": str(body),
        "cta_text": str(cta_text),
        "cta_url": cta_url,
        "accent": accent,
        "footer": footer,
        "plain_text": plain_text
    }


async def _process_notification(payload: Dict[str, Any]) -> None:
    to_addr = payload.get("email") or payload.get("to")
    content = _build_notification_content(payload)

    if to_addr and await _send_email(to_addr, content["subject"], content["plain_text"]):
        return

    logger.info("Queued notification (console fallback): %s", payload)


@app.post("/notify")
async def notify(payload: NotificationRequest, background_tasks: BackgroundTasks) -> dict:
    payload_dict = payload.dict()
    logger.info("[receive] %s", payload_dict)
    background_tasks.add_task(_process_notification, payload_dict)
    return {"status": "queued", "delivery": "smtp" if SMTP_HOST and SMTP_FROM else "console"}


@app.post("/notify/raw")
async def notify_raw(payload: Dict[str, Any], background_tasks: BackgroundTasks) -> dict:
    logger.info("[receive_raw] %s", payload)
    background_tasks.add_task(_process_notification, payload)
    return {"status": "queued", "delivery": "smtp" if SMTP_HOST and SMTP_FROM else "console"}
