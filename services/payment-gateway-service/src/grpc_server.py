import asyncio
import logging
import random
import re
import uuid
from datetime import datetime, timezone

import grpc

import payment_pb2
import payment_pb2_grpc

from src.config import get_approval_delay_ms, get_grpc_port, get_provider_name


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("payment-gateway-service-grpc")

SUPPORTED_CURRENCIES = {"USD", "GTQ", "MXN", "EUR"}


def _only_digits(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def _luhn_is_valid(card_number: str) -> bool:
    digits = [int(char) for char in card_number]
    checksum = 0
    parity = len(digits) % 2

    for index, digit in enumerate(digits):
        if index % 2 == parity:
            digit *= 2
            if digit > 9:
                digit -= 9
        checksum += digit

    return checksum % 10 == 0


def _validate_request(request) -> tuple[bool, str, str]:
    card_number = _only_digits(request.card_number)
    currency = str(request.currency or "").upper().strip()

    if not request.user_id:
        return False, "user_id is required", card_number

    if not request.email:
        return False, "email is required", card_number

    if request.plan_id <= 0:
        return False, "plan_id must be positive", card_number

    if request.amount <= 0:
        return False, "amount must be positive", card_number

    if currency not in SUPPORTED_CURRENCIES:
        return False, "currency is not supported", card_number

    if len(card_number) < 13 or len(card_number) > 19:
        return False, "card_number must have between 13 and 19 digits", card_number

    if not _luhn_is_valid(card_number):
        return False, "card_number is invalid", card_number

    if not str(request.card_holder or "").strip():
        return False, "card_holder is required", card_number

    if request.exp_month < 1 or request.exp_month > 12:
        return False, "exp_month must be between 1 and 12", card_number

    now = datetime.now(timezone.utc)
    if request.exp_year < now.year or (
        request.exp_year == now.year and request.exp_month < now.month
    ):
        return False, "card is expired", card_number

    cvv = _only_digits(request.cvv)
    if len(cvv) not in (3, 4):
        return False, "cvv must have 3 or 4 digits", card_number

    return True, "ok", card_number


def _decline_reason(card_number: str) -> str | None:
    if card_number.endswith("0000"):
        return "payment declined by issuer"

    if card_number.endswith("1111"):
        return "insufficient funds"

    return None


class PaymentGatewayServiceServicer(payment_pb2_grpc.PaymentGatewayServiceServicer):
    async def Health(self, request, context):
        return payment_pb2.PaymentHealthResponse(
            success=True,
            status="ok",
            provider=get_provider_name(),
        )

    async def AuthorizePayment(self, request, context):
        provider = get_provider_name()
        currency = str(request.currency or "").upper().strip()
        is_valid, message, card_number = _validate_request(request)
        card_last4 = card_number[-4:] if len(card_number) >= 4 else ""

        if not is_valid:
            return payment_pb2.AuthorizePaymentResponse(
                success=False,
                message=message,
                provider=provider,
                status="rejected",
                amount=float(request.amount),
                currency=currency,
                card_last4=card_last4,
            )

        delay_ms = get_approval_delay_ms()
        if delay_ms:
            await asyncio.sleep(delay_ms / 1000)

        decline_reason = _decline_reason(card_number)
        if decline_reason:
            return payment_pb2.AuthorizePaymentResponse(
                success=False,
                message=decline_reason,
                provider=provider,
                status="declined",
                amount=float(request.amount),
                currency=currency,
                card_last4=card_last4,
            )

        transaction_id = f"sandbox-{uuid.uuid4()}"
        authorization_code = f"QT{random.randint(100000, 999999)}"

        logger.info(
            "payment approved provider=%s user_id=%s plan_id=%s amount=%.2f currency=%s transaction_id=%s card_last4=%s",
            provider,
            request.user_id,
            request.plan_id,
            request.amount,
            currency,
            transaction_id,
            card_last4,
        )

        return payment_pb2.AuthorizePaymentResponse(
            success=True,
            message="payment approved",
            provider=provider,
            status="approved",
            transaction_id=transaction_id,
            authorization_code=authorization_code,
            amount=float(request.amount),
            currency=currency,
            card_last4=card_last4,
        )


async def serve() -> None:
    server = grpc.aio.server()
    payment_pb2_grpc.add_PaymentGatewayServiceServicer_to_server(
        PaymentGatewayServiceServicer(),
        server,
    )

    listen_addr = f"[::]:{get_grpc_port()}"
    server.add_insecure_port(listen_addr)

    logger.info("Payment Gateway Service gRPC running on %s", listen_addr)

    await server.start()
    await server.wait_for_termination()


if __name__ == "__main__":
    asyncio.run(serve())