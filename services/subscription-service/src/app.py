import logging
import json
import os
from urllib.error import URLError
from urllib.request import Request, urlopen

from fastapi import BackgroundTasks, FastAPI, HTTPException, status

from src.db import get_connection
from src.repository import (
    create_subscription,
    delete_subscription,
    get_subscriptions_by_user,
    initialize_database,
    list_plans,
    update_subscription_plan,
)
from src.schemas import SubscriptionCreate, SubscriptionUpdate

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("subscription-service")

app = FastAPI(title="subscription-service")

API_GATEWAY_URL = os.getenv("API_GATEWAY_URL", "http://api-gateway:3000")
NOTIFICATION_SERVICE_URL = os.getenv("NOTIFICATION_SERVICE_URL", "http://notification-service:8000")


def _get_user_email(user_id: str) -> str | None:
    request = Request(
        f"{API_GATEWAY_URL}/api/internal/users/{user_id}",
        headers={"Accept": "application/json"},
    )

    try:
        with urlopen(request, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception as error:
        logger.exception("failed to resolve user email for user_id=%s", user_id)
        logger.warning("user lookup error: %s", error)
        return None

    if not payload.get("success"):
        logger.info("user lookup did not return a usable email for user_id=%s", user_id)
        return None

    return payload.get("email") or None


def _send_notification(payload: dict) -> None:
    data = json.dumps(payload).encode("utf-8")
    request = Request(
        f"{NOTIFICATION_SERVICE_URL}/notify",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urlopen(request, timeout=10) as response:
            response.read()
    except Exception:
        logger.exception("failed to send purchase receipt notification")


def _send_purchase_receipt(subscription: dict, action: str) -> None:
    user_email = _get_user_email(subscription["user_id"])

    if not user_email:
        return

    is_update = action == "updated"
    subject = (
        "Actualización de tu suscripción en Quetxal TV"
        if is_update
        else "Recibo de compra en Quetxal TV"
    )
    message = (
        "Tu suscripción fue actualizada correctamente."
        if is_update
        else "Tu suscripción quedó activa correctamente."
    )

    _send_notification(
        {
            "type": "purchase",
            "email": user_email,
            "subject": subject,
            "message": message,
            "metadata": {
                "action": action,
                "subscription_id": subscription["id"],
                "user_id": subscription["user_id"],
                "plan_name": subscription["plan_name"],
                "price_usd": subscription["price_usd"],
                "status": subscription["status"],
                "started_at": str(subscription["started_at"]),
                "updated_at": str(subscription["updated_at"]),
                "cta_text": "Ir a mi cuenta"
            },
        }
    )


@app.on_event("startup")
def startup_event() -> None:
    try:
        initialize_database()
        logger.info("subscription database initialized")
    except Exception:
        logger.exception("failed to initialize subscription database")
        raise


@app.get("/health")
def health():
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1;")
                cursor.fetchone()
        return {"status": "ok", "database": True}
    except Exception:
        logger.exception("health check failed")
        return {"status": "degraded", "database": False}


@app.get("/plans")
def get_plans():
    try:
        return {"plans": list_plans()}
    except Exception:
        logger.exception("failed to list plans")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="could not list plans")


@app.post("/subscriptions", status_code=status.HTTP_201_CREATED)
def post_subscription(payload: SubscriptionCreate, background_tasks: BackgroundTasks):
    try:
        subscription = create_subscription(payload.user_id, payload.plan_id)
        background_tasks.add_task(_send_purchase_receipt, subscription, "created")
        return subscription
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except Exception:
        logger.exception("failed to create subscription")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="could not create subscription")


@app.put("/subscriptions/{subscription_id}")
def put_subscription(
    subscription_id: int,
    payload: SubscriptionUpdate,
    background_tasks: BackgroundTasks,
):
    if subscription_id <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="subscription_id must be positive")

    try:
        subscription = update_subscription_plan(subscription_id, payload.plan_id)
        background_tasks.add_task(_send_purchase_receipt, subscription, "updated")
        return subscription
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except Exception:
        logger.exception("failed to update subscription_id=%s", subscription_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="could not update subscription")


@app.get("/users/{user_id}/subscriptions")
def get_user_subscriptions(user_id: str):
    try:
        return {"subscriptions": get_subscriptions_by_user(user_id)}
    except Exception:
        logger.exception("failed to fetch subscriptions for user_id=%s", user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="could not fetch subscriptions")


@app.delete("/subscriptions/{subscription_id}")
def remove_subscription(subscription_id: int):
    if subscription_id <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="subscription_id must be positive")

    try:
        deleted = delete_subscription(subscription_id)
        if not deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="subscription not found")
        return {"status": "deleted", "subscription_id": subscription_id}
    except HTTPException:
        raise
    except Exception:
        logger.exception("failed to delete subscription_id=%s", subscription_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="could not delete subscription")
