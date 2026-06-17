import os

from dotenv import load_dotenv


load_dotenv()


def get_grpc_port() -> int:
    return int(os.getenv("PAYMENT_GRPC_PORT", "50057"))


def get_provider_name() -> str:
    return os.getenv("PAYMENT_PROVIDER_NAME", "QuetxalPay Sandbox")


def get_approval_delay_ms() -> int:
    return max(0, int(os.getenv("PAYMENT_APPROVAL_DELAY_MS", "500")))