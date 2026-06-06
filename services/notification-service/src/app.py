from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel, EmailStr
from typing import Optional, Dict
import os
import logging
from dotenv import load_dotenv


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BASE_DIR, '..', '.env')) if os.path.exists(os.path.join(BASE_DIR, '..', '.env')) else load_dotenv()

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
logging.basicConfig(level=LOG_LEVEL)
logger = logging.getLogger("notification-service")


class NotificationRequest(BaseModel):
    type: str  # registration, purchase, alert, etc.
    user_id: Optional[str] = None
    email: Optional[EmailStr] = None
    subject: Optional[str] = None
    message: Optional[str] = None
    metadata: Optional[Dict] = None


app = FastAPI(title="notification-service")


@app.get("/health")
async def health():
    return {"status": "ok"}


async def _send_notification(req: NotificationRequest):
    # Simulated send: log to stdout (container logs) and could be replaced with SMTP/API
    logger.info("[send] type=%s user_id=%s email=%s subject=%s metadata=%s",
                req.type, req.user_id, req.email, req.subject, req.metadata)


@app.post("/notify")
async def notify(req: NotificationRequest, background_tasks: BackgroundTasks):
    logger.info("[receive] %s", req.json())
    background_tasks.add_task(_send_notification, req)
    return {"status": "queued", "type": req.type}


@app.post("/notify/raw")
async def notify_raw(payload: Dict, background_tasks: BackgroundTasks):
    # Backwards-compatible endpoint for arbitrary payloads
    logger.info("[receive_raw] %s", payload)
    # Create a minimal NotificationRequest for logging
    nr = NotificationRequest(type=payload.get("type", "raw"),
                             user_id=payload.get("user_id"),
                             email=payload.get("email"),
                             subject=payload.get("subject"),
                             message=payload.get("message"),
                             metadata=payload.get("metadata"))
    background_tasks.add_task(_send_notification, nr)
    return {"status": "queued", "type": nr.type}
