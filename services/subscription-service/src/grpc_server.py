import asyncio
import logging

import grpc

import subscription_pb2
import subscription_pb2_grpc
from src.audit_logger import push_audit_log

from src.db import get_connection
from src.notification_publisher import publish_notification_event
from src.repository import (
    create_subscription,
    delete_subscription,
    get_subscriptions_by_user,
    list_audit_logs,
    list_plans,
    update_plan,
    update_subscription_plan,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("subscription-service-grpc")


async def _publish_subscription_notification(
    subscription: dict,
    email: str,
    action: str
) -> None:
    if not email:
        logger.warning(
            "subscription notification skipped because email is empty user_id=%s",
            subscription.get("user_id")
        )
        return

    is_update = action == "updated"
    plan_name = str(subscription["plan_name"])

    subject = (
        "Actualización de suscripción - Quetxal TV"
        if is_update
        else "Recibo de compra - Quetxal TV"
    )

    body = (
        f"Tu suscripción al plan {plan_name} fue actualizada correctamente."
        if is_update
        else f"Tu suscripción al plan {plan_name} fue creada correctamente."
    )

    await publish_notification_event({
        "type": "subscription_update" if is_update else "purchase_receipt",
        "user_id": str(subscription["user_id"]),
        "email": email,
        "subject": subject,
        "body": body,
        "metadata": {
            "action": action,
            "plan_id": str(subscription["plan_id"]),
            "plan_name": plan_name,
            "price_usd": str(subscription["price_usd"]),
            "subscription_id": str(subscription["id"]),
            "status": str(subscription["status"]),
            "started_at": str(subscription["started_at"]),
            "updated_at": str(subscription["updated_at"]),
            "cta_text": "Ir a mi cuenta",
        },
    })


def _to_plan_message(plan: dict):
    return subscription_pb2.Plan(
        id=int(plan["id"]),
        name=str(plan["name"]),
        price_usd=float(plan["price_usd"]),
        is_active=bool(plan["is_active"])
    )




def _to_audit_message(item: dict):
    return subscription_pb2.AuditLogItem(
        service=str(item.get("service", "subscription")),
        audit_id=str(item.get("id", "")),
        actor_user_id=str(item.get("actor_user_id", "")),
        actor_email=str(item.get("actor_email", "")),
        action=str(item.get("action", "")),
        table_name=str(item.get("table_name", "")),
        record_id=str(item.get("record_id", "")),
        old_state_json=str(item.get("old_state", "")),
        new_state_json=str(item.get("new_state", "")),
        created_at=str(item.get("created_at", "")),
    )

def _to_subscription_message(subscription: dict):
    return subscription_pb2.Subscription(
        id=int(subscription["id"]),
        user_id=str(subscription["user_id"]),
        plan_id=int(subscription["plan_id"]),
        plan_name=str(subscription["plan_name"]),
        price_usd=float(subscription["price_usd"]),
        status=str(subscription["status"]),
        started_at=str(subscription["started_at"]),
        updated_at=str(subscription["updated_at"])
    )


class SubscriptionServiceServicer(subscription_pb2_grpc.SubscriptionServiceServicer):
    async def Health(self, request, context):
        try:
            with get_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT 1;")
                    cursor.fetchone()

            return subscription_pb2.SubscriptionHealthResponse(
                success=True,
                status="ok",
                database=True
            )

        except Exception:
            logger.exception("health check failed")

            return subscription_pb2.SubscriptionHealthResponse(
                success=False,
                status="degraded",
                database=False
            )

    async def UpdatePlan(self, request, context):
        if request.id <= 0:
            return subscription_pb2.UpdatePlanResponse(
                success=False, message="id must be positive"
            )
        if not request.name or not request.name.strip():
            return subscription_pb2.UpdatePlanResponse(
                success=False, message="name is required"
            )
        if request.price_usd < 0:
            return subscription_pb2.UpdatePlanResponse(
                success=False, message="price_usd must be non-negative"
            )

        try:
            plan = update_plan(request.id, request.name.strip(), request.price_usd, request.actor_user_id, request.actor_email)
            
            push_audit_log("subscription-service", "update_plan", request.actor_user_id, {
                "plan_id": request.id, 
                "new_name": request.name.strip(), 
                "new_price": request.price_usd
            })

            return subscription_pb2.UpdatePlanResponse(
                success=True,
                message="plan updated successfully",
                plan=_to_plan_message(plan),
            )
        except ValueError as exc:
            return subscription_pb2.UpdatePlanResponse(success=False, message=str(exc))
        except Exception:
            logger.exception("failed to update plan")
            return subscription_pb2.UpdatePlanResponse(
                success=False, message="could not update plan"
            )

    async def ListPlans(self, request, context):
        try:
            plans = list_plans()

            return subscription_pb2.ListPlansResponse(
                success=True,
                message="plans listed successfully",
                plans=[_to_plan_message(plan) for plan in plans]
            )

        except Exception:
            logger.exception("failed to list plans")

            return subscription_pb2.ListPlansResponse(
                success=False,
                message="could not list plans"
            )

    async def CreateSubscription(self, request, context):
        if not request.user_id:
            return subscription_pb2.SubscriptionResponse(
                success=False,
                message="user_id is required"
            )

        if request.plan_id <= 0:
            return subscription_pb2.SubscriptionResponse(
                success=False,
                message="plan_id must be positive"
            )

        try:
            subscription = create_subscription(request.user_id, request.plan_id)

            try:
                await _publish_subscription_notification(
                    subscription,
                    request.email,
                    "created"
                )
            except Exception:
                logger.warning(
                    "could not publish subscription creation notification",
                    exc_info=True
                )
            push_audit_log("subscription-service", "create_subscription", request.user_id, {"plan_id": request.plan_id})

            return subscription_pb2.SubscriptionResponse(
                success=True,
                message="subscription created successfully",
                subscription=_to_subscription_message(subscription)
            )

        except ValueError as exc:
            return subscription_pb2.SubscriptionResponse(
                success=False,
                message=str(exc)
            )

        except Exception:
            logger.exception("failed to create subscription")

            return subscription_pb2.SubscriptionResponse(
                success=False,
                message="could not create subscription"
            )

    async def UpdateSubscription(self, request, context):
        if request.subscription_id <= 0:
            return subscription_pb2.SubscriptionResponse(
                success=False,
                message="subscription_id must be positive"
            )

        if request.plan_id <= 0:
            return subscription_pb2.SubscriptionResponse(
                success=False,
                message="plan_id must be positive"
            )

        try:

            if not request.user_id:
                return subscription_pb2.SubscriptionResponse(
                    success=False,
                    message="user_id is required"
                )

            subscription = update_subscription_plan(
                request.subscription_id,
                request.plan_id,
                request.user_id
            )

            push_audit_log("subscription-service", "update_subscription", request.user_id, {
                "subscription_id": request.subscription_id, 
                "new_plan_id": request.plan_id
            })

            try:
                await _publish_subscription_notification(
                    subscription,
                    request.email,
                    "updated"
                )
            except Exception:
                logger.warning(
                    "could not publish subscription update notification",
                    exc_info=True
                )

            return subscription_pb2.SubscriptionResponse(
                success=True,
                message="subscription updated successfully",
                subscription=_to_subscription_message(subscription)
            )

        except ValueError as exc:
            return subscription_pb2.SubscriptionResponse(
                success=False,
                message=str(exc)
            )

        except Exception:
            logger.exception("failed to update subscription")

            return subscription_pb2.SubscriptionResponse(
                success=False,
                message="could not update subscription"
            )

    async def ListUserSubscriptions(self, request, context):
        if not request.user_id:
            return subscription_pb2.ListUserSubscriptionsResponse(
                success=False,
                message="user_id is required"
            )

        try:
            rows = get_subscriptions_by_user(request.user_id)

            return subscription_pb2.ListUserSubscriptionsResponse(
                success=True,
                message="subscriptions listed successfully",
                subscriptions=[_to_subscription_message(row) for row in rows]
            )

        except Exception:
            logger.exception("failed to list user subscriptions")

            return subscription_pb2.ListUserSubscriptionsResponse(
                success=False,
                message="could not list user subscriptions"
            )

    async def CancelSubscription(self, request, context):
        if request.subscription_id <= 0:
            return subscription_pb2.BasicSubscriptionResponse(
                success=False,
                message="subscription_id must be positive",
                subscription_id=request.subscription_id
            )

        try:
            cancelled = delete_subscription(request.subscription_id)

            if not cancelled:
                return subscription_pb2.BasicSubscriptionResponse(
                    success=False,
                    message="subscription not found",
                    subscription_id=request.subscription_id
                )

            push_audit_log("subscription-service", "cancel_subscription", "user", {
                "subscription_id": request.subscription_id
            })

            return subscription_pb2.BasicSubscriptionResponse(
                success=True,
                message="subscription cancelled successfully",
                subscription_id=request.subscription_id
            )

        except Exception:
            logger.exception("failed to cancel subscription")

            return subscription_pb2.BasicSubscriptionResponse(
                success=False,
                message="could not cancel subscription",
                subscription_id=request.subscription_id
            )

    async def ListAuditLogs(self, request, context):
        try:
            rows = list_audit_logs(
                table_name=str(request.table_name or ""),
                actor_user_id=str(request.actor_user_id or ""),
                action=str(request.action or ""),
                from_ts=str(getattr(request, "from") or ""),
                to_ts=str(request.to or ""),
                limit=int(request.limit or 100),
                offset=int(request.offset or 0),
            )

            return subscription_pb2.ListAuditLogsResponse(
                success=True,
                message=f"subscription audit logs listed: {len(rows)}",
                items=[_to_audit_message(row) for row in rows]
            )
        except Exception:
            logger.exception("failed to list subscription audit logs")
            return subscription_pb2.ListAuditLogsResponse(
                success=False,
                message="could not list subscription audit logs"
            )


async def serve() -> None:
    server = grpc.aio.server()
    subscription_pb2_grpc.add_SubscriptionServiceServicer_to_server(
        SubscriptionServiceServicer(),
        server
    )

    listen_addr = "[::]:50053"
    server.add_insecure_port(listen_addr)

    logger.info("Subscription Service gRPC running on %s", listen_addr)

    await server.start()
    await server.wait_for_termination()


if __name__ == "__main__":
    asyncio.run(serve())