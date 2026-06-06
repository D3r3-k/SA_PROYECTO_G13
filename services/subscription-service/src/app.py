import logging

from fastapi import FastAPI, HTTPException, status

from src.db import get_connection
from src.repository import (
    create_subscription,
    delete_subscription,
    get_subscriptions_by_user,
    initialize_database,
    list_plans,
)
from src.schemas import SubscriptionCreate

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("subscription-service")

app = FastAPI(title="subscription-service")


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
def post_subscription(payload: SubscriptionCreate):
    try:
        return create_subscription(payload.user_id, payload.plan_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except Exception:
        logger.exception("failed to create subscription")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="could not create subscription")


@app.get("/subscriptions/{user_id}")
def get_user_subscriptions(user_id: int):
    if user_id <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="user_id must be positive")

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
