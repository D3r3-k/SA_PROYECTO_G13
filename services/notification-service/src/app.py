import os
import logging
from fastapi import FastAPI, BackgroundTasks
from email.message import EmailMessage

try:
    import aiosmtplib
except Exception:
    aiosmtplib = None

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("notification-service")

app = FastAPI(title="notification-service")

# SMTP optional configuration
SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", "0")) if os.getenv("SMTP_PORT") else None
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM = os.getenv("SMTP_FROM")


@app.get("/health")
async def health():
    return {"status": "ok"}


async def _send_email(to_address: str, subject: str, body: str) -> bool:
    """Attempt to send an email via SMTP when configured. Returns True if sent, False otherwise."""
    if not SMTP_HOST or not SMTP_FROM:
        logger.info("SMTP not configured. Skipping send.")
        return False

    if aiosmtplib is None:
        logger.warning("aiosmtplib not installed; cannot send email")
        return False

    message = EmailMessage()
    message["From"] = SMTP_FROM
    message["To"] = to_address
    message["Subject"] = subject
    message.set_content(body)

    try:
        send_kwargs = {"hostname": SMTP_HOST, "port": SMTP_PORT or 25}
        if SMTP_USER:
            send_kwargs["username"] = SMTP_USER
            send_kwargs["password"] = SMTP_PASSWORD
        # If port is 587, prefer start_tls; aiosmtplib.send will handle secure connection if requested by server.
        await aiosmtplib.send(message, **send_kwargs)
        logger.info("Email sent to %s via %s:%s", to_address, SMTP_HOST, SMTP_PORT)
        return True
    except Exception:
        logger.exception("Failed to send email to %s; falling back to console", to_address)
        return False


async def _process_notification(payload: dict) -> None:
    """Process a notification payload. If SMTP configured and payload includes `to`/`email`, attempt send, otherwise log to console."""
    try:
        # Determine recipient and message
        to_addr = payload.get("to") or payload.get("email")
        subject = payload.get("subject") or "Notification"
        body = payload.get("body") or str(payload)

        sent = False
        if to_addr and SMTP_HOST:
            sent = await _send_email(to_addr, subject, body)

        if not sent:
            # fallback: log to console
            logger.info("Queued notification (console fallback): %s", payload)
    except Exception:
        logger.exception("Error processing notification payload")


@app.post("/notify")
async def notify(payload: dict, background_tasks: BackgroundTasks):
    # enqueue processing (sends via SMTP when configured, otherwise logs)
    background_tasks.add_task(_process_notification, payload)
    return {"status": "queued"}


@app.post("/notify/raw")
async def notify_raw(payload: dict, background_tasks: BackgroundTasks):
    background_tasks.add_task(_process_notification, payload)
    return {"status": "queued"}
