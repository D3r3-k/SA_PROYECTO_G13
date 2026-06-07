import os
import grpc

import identity_pb2
import identity_pb2_grpc
import notification_pb2
import notification_pb2_grpc


IDENTITY_GRPC_URL = os.getenv("IDENTITY_GRPC_URL", "identity-service:50051")
NOTIFICATION_GRPC_URL = os.getenv("NOTIFICATION_GRPC_URL", "notification-service:50054")


async def get_user_email(user_id: str) -> str | None:
    async with grpc.aio.insecure_channel(IDENTITY_GRPC_URL) as channel:
        client = identity_pb2_grpc.IdentityServiceStub(channel)

        response = await client.GetUserById(
            identity_pb2.GetUserByIdRequest(user_id=user_id)
        )

        if not response.success:
            return None

        return response.email or None


async def send_purchase_notification(subscription: dict, action: str) -> None:
    email = await get_user_email(str(subscription["user_id"]))

    if not email:
        return

    is_update = action == "updated"

    subject = (
        "Actualización de tu suscripción en Quetxal TV"
        if is_update
        else "Recibo de compra en Quetxal TV"
    )

    body = (
        "Tu suscripción fue actualizada correctamente."
        if is_update
        else "Tu suscripción quedó activa correctamente."
    )

    async with grpc.aio.insecure_channel(NOTIFICATION_GRPC_URL) as channel:
        client = notification_pb2_grpc.NotificationServiceStub(channel)

        await client.Send(
            notification_pb2.NotifyRequest(
                type="purchase",
                user_id=str(subscription["user_id"]),
                email=email,
                subject=subject,
                body=body,
                metadata={
                    "action": action,
                    "subscription_id": str(subscription["id"]),
                    "user_id": str(subscription["user_id"]),
                    "plan_name": str(subscription["plan_name"]),
                    "price_usd": str(subscription["price_usd"]),
                    "status": str(subscription["status"]),
                    "started_at": str(subscription["started_at"]),
                    "updated_at": str(subscription["updated_at"]),
                    "cta_text": "Ir a mi cuenta"
                }
            )
        )