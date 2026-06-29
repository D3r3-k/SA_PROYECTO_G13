from __future__ import annotations

import csv
import io
import os
import random
import time
from dataclasses import dataclass
from typing import Any, Iterable
from urllib.parse import urlparse

from locust import HttpUser, between, events, task
from locust.exception import StopUser

try:  
    import websocket  # type: ignore
except Exception:  # pragma: no cover - se valida en ejecucion cloud
    websocket = None


@dataclass(frozen=True)
class TestAccount:
    email: str
    password: str
    plan_tier: str = "standard"
    profile_id: str = ""
    is_admin: bool = False


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "si", "s"}


def split_env(name: str, default: Iterable[str]) -> list[str]:
    raw = os.getenv(name, "")
    values = [item.strip() for item in raw.split(",") if item.strip()]
    return values or list(default)


def normalize_plan(value: str) -> str:
    normalized = value.strip().lower()
    if "premium" in normalized:
        return "premium"
    if "standard" in normalized or "estandar" in normalized or "estándar" in normalized:
        return "standard"
    if "basic" in normalized or "basico" in normalized or "básico" in normalized:
        return "basic"
    return normalized or "standard"


def parse_csv_accounts(csv_text: str) -> list[TestAccount]:
    accounts: list[TestAccount] = []
    reader = csv.DictReader(io.StringIO(csv_text.strip()))
    for row in reader:
        email = (row.get("email") or "").strip()
        password = (row.get("password") or "").strip()
        if not email or not password:
            continue
        accounts.append(
            TestAccount(
                email=email,
                password=password,
                plan_tier=normalize_plan(row.get("plan_tier") or row.get("plan") or "standard"),
                profile_id=(row.get("profile_id") or "").strip(),
                is_admin=str(row.get("is_admin") or "").strip().lower() in {"1", "true", "yes", "si", "s"},
            )
        )
    return accounts


def accounts_from_env() -> list[TestAccount]:
    direct_csv = os.getenv("LOCUST_USERS_CSV", "").strip()
    if direct_csv:
        accounts = parse_csv_accounts(direct_csv)
        if accounts:
            return accounts

    users_file = os.getenv("LOCUST_USERS_FILE", "tests/load/users.example.csv")
    if os.path.exists(users_file):
        with open(users_file, "r", encoding="utf-8") as file:
            accounts = parse_csv_accounts(file.read())
            # users.example.csv trae credenciales dummy. Solo se usan si el usuario decide mantenerlas.
            accounts = [account for account in accounts if "example.com" not in account.email]
            if accounts:
                return accounts

    candidates = [
        ("LOCUST_PREMIUM_EMAIL", "LOCUST_PREMIUM_PASSWORD", "premium"),
        ("LOCUST_STANDARD_EMAIL", "LOCUST_STANDARD_PASSWORD", "standard"),
        ("LOCUST_BASIC_EMAIL", "LOCUST_BASIC_PASSWORD", "basic"),
        ("LOCUST_ADMIN_EMAIL", "LOCUST_ADMIN_PASSWORD", "premium"),
        ("LOCUST_USER_EMAIL", "LOCUST_USER_PASSWORD", os.getenv("LOCUST_USER_PLAN", "standard")),
    ]

    accounts = []
    for email_key, password_key, plan_tier in candidates:
        email = os.getenv(email_key, "").strip()
        password = os.getenv(password_key, "").strip()
        if not email or not password:
            continue
        accounts.append(
            TestAccount(
                email=email,
                password=password,
                plan_tier=normalize_plan(plan_tier),
                profile_id=os.getenv(email_key.replace("EMAIL", "PROFILE_ID"), "").strip(),
                is_admin="ADMIN" in email_key,
            )
        )
    return accounts


ACCOUNTS = accounts_from_env()
SEARCH_TERMS = split_env("LOCUST_SEARCH_TERMS", ["accion", "drama", "comedia", "familia", "aventura"])
STATIC_CONTENT_IDS = split_env("LOCUST_CONTENT_IDS", [])
AUTO_SELECT_PROFILE = env_bool("LOCUST_AUTO_SELECT_PROFILE", True)
STRICT_AUTH = env_bool("LOCUST_STRICT_AUTH", True)
ENABLE_WS = env_bool("LOCUST_ENABLE_WS", True)


def choose_account() -> TestAccount | None:
    if not ACCOUNTS:
        return None
    return random.choice(ACCOUNTS)


def response_json(response: Any) -> dict[str, Any]:
    try:
        payload = response.json()
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def extract_content_ids(payload: dict[str, Any]) -> list[str]:
    candidates: list[Any] = []
    for key in ("items", "content", "contents", "results", "data"):
        value = payload.get(key)
        if isinstance(value, list):
            candidates = value
            break
    ids: list[str] = []
    for item in candidates:
        if not isinstance(item, dict):
            continue
        content_id = str(item.get("content_id") or item.get("id") or "").strip()
        if content_id:
            ids.append(content_id)
    return ids


def ws_base_url(host: str) -> str:
    explicit = os.getenv("LOCUST_WS_BASE_URL", "").strip()
    if explicit:
        return explicit.rstrip("/")
    parsed = urlparse(host)
    scheme = "wss" if parsed.scheme == "https" else "ws"
    return f"{scheme}://{parsed.netloc}"


class QuetxalTvUser(HttpUser):
    """Usuario virtual que reproduce flujos reales de navegacion y consumo."""

    wait_time = between(1, 4)

    account: TestAccount | None = None
    authenticated: bool = False
    profile_id: str = ""
    content_ids: list[str]
    watch_party_codes: list[str]

    def on_start(self) -> None:
        self.content_ids = list(STATIC_CONTENT_IDS)
        self.watch_party_codes = []
        self.account = choose_account()

        if not self.account:
            # Permite ejecutar al menos health checks si aun no hay data de prueba configurada.
            self.authenticated = False
            if STRICT_AUTH:
                raise StopUser("No hay usuarios de prueba configurados para Locust")
            return

        self.login()
        if self.authenticated:
            self.ensure_profile()
            self.discover_content_ids()

    def login(self) -> None:
        assert self.account is not None
        with self.client.post(
            "/api/auth/login",
            json={"email": self.account.email, "password": self.account.password},
            name="POST /api/auth/login",
            catch_response=True,
        ) as response:
            payload = response_json(response)
            if response.status_code == 200 and payload.get("success", False):
                self.authenticated = True
                return
            message = payload.get("message") or response.text[:200]
            response.failure(f"login failed for {self.account.email}: {response.status_code} {message}")
            self.authenticated = False

        if STRICT_AUTH:
            raise StopUser(f"No se pudo autenticar {self.account.email}")

    def ensure_profile(self) -> None:
        assert self.account is not None
        if self.account.profile_id:
            self.profile_id = self.account.profile_id
            return

        with self.client.get("/api/auth/me", name="GET /api/auth/me", catch_response=True) as response:
            payload = response_json(response)
            profile_id = str(payload.get("user", {}).get("profile_id") or "").strip()
            if response.status_code == 200:
                self.profile_id = profile_id
            else:
                response.failure(f"auth/me failed: {response.status_code}")

        if self.profile_id or not AUTO_SELECT_PROFILE:
            return

        with self.client.get("/api/profiles", name="GET /api/profiles", catch_response=True) as response:
            payload = response_json(response)
            profiles = payload.get("profiles") or []
            if response.status_code != 200:
                response.failure(f"profiles failed: {response.status_code}")
                return
            if not profiles:
                response.success()
                return

            first_profile = profiles[0]
            if isinstance(first_profile, dict):
                candidate = str(first_profile.get("profile_id") or "").strip()
                if candidate:
                    self.select_profile(candidate)

    def select_profile(self, profile_id: str) -> None:
        with self.client.post(
            f"/api/profiles/{profile_id}/select",
            name="POST /api/profiles/[id]/select",
            catch_response=True,
        ) as response:
            payload = response_json(response)
            if response.status_code == 200 and payload.get("success", False):
                self.profile_id = profile_id
                return
            response.failure(f"select profile failed: {response.status_code} {payload.get('message', '')}")

    def discover_content_ids(self) -> None:
        if self.content_ids:
            return
        with self.client.get("/api/catalog", name="GET /api/catalog", catch_response=True) as response:
            payload = response_json(response)
            if response.status_code == 200:
                self.content_ids = extract_content_ids(payload)
                return
            response.failure(f"catalog discovery failed: {response.status_code} {payload.get('message', '')}")

    def random_content_id(self) -> str | None:
        if not self.content_ids:
            return None
        return random.choice(self.content_ids)

    @task(5)
    def health(self) -> None:
        self.client.get("/api/health", name="GET /api/health")

    @task(8)
    def browse_catalog(self) -> None:
        if not self.authenticated:
            return
        with self.client.get("/api/catalog", name="GET /api/catalog", catch_response=True) as response:
            if response.status_code == 200:
                payload = response_json(response)
                ids = extract_content_ids(payload)
                if ids:
                    self.content_ids = list({*self.content_ids, *ids})
                return
            response.failure(f"catalog status {response.status_code}")

    @task(6)
    def search_catalog(self) -> None:
        if not self.authenticated:
            return
        term = random.choice(SEARCH_TERMS)
        self.client.get("/api/catalog/search", params={"q": term, "limit": 20}, name="GET /api/catalog/search")

    @task(7)
    def view_content_detail(self) -> None:
        if not self.authenticated:
            return
        content_id = self.random_content_id()
        if not content_id:
            return
        self.client.get(f"/api/catalog/{content_id}", name="GET /api/catalog/[contentId]")

    @task(4)
    def recommendations(self) -> None:
        if not self.authenticated or not self.profile_id:
            return
        self.client.get("/api/recommendations", params={"limit": 10}, name="GET /api/recommendations")

    @task(3)
    def save_progress(self) -> None:
        if not self.authenticated or not self.profile_id:
            return
        content_id = self.random_content_id()
        if not content_id:
            return
        self.client.post(
            f"/api/engagement/content/{content_id}/progress",
            json={"profile_id": self.profile_id, "minute": random.randint(1, 90), "season_number": 0, "episode_number": 0},
            name="POST /api/engagement/content/[contentId]/progress",
        )

    @task(2)
    def rate_content(self) -> None:
        if not self.authenticated or not self.profile_id:
            return
        content_id = self.random_content_id()
        if not content_id:
            return
        self.client.post(
            f"/api/engagement/content/{content_id}/rating",
            json={"profile_id": self.profile_id, "rating": random.choice(["THUMBS_UP", "THUMBS_DOWN"])},
            name="POST /api/engagement/content/[contentId]/rating",
        )

    @task(2)
    def download_grant_standard(self) -> None:
        if not self.authenticated or not self.account or self.account.plan_tier != "standard":
            return
        content_id = self.random_content_id()
        if not content_id:
            return
        with self.client.get(
            f"/api/catalog/{content_id}/download",
            name="GET /api/catalog/[contentId]/download",
            catch_response=True,
        ) as response:
            # 403 puede ser esperado si el perfil infantil requiere PIN. Se documenta sin romper toda la prueba.
            if response.status_code in {200, 403}:
                return
            response.failure(f"download grant returned {response.status_code}")

    @task(2)
    def create_watch_party_premium(self) -> None:
        if not self.authenticated or not self.account or self.account.plan_tier != "premium":
            return
        content_id = self.random_content_id()
        if not content_id:
            return
        with self.client.post(
            "/api/watch-party/rooms",
            json={"content_id": content_id},
            name="POST /api/watch-party/rooms",
            catch_response=True,
        ) as response:
            payload = response_json(response)
            if response.status_code == 201 and payload.get("code"):
                self.watch_party_codes.append(str(payload["code"]))
                self.watch_party_codes = self.watch_party_codes[-5:]
                return
            if response.status_code == 403 and payload.get("code") == "PARENTAL_PIN_REQUIRED":
                return
            response.failure(f"watch party create returned {response.status_code}: {payload.get('message', '')}")

    @task(1)
    def inspect_watch_party_room(self) -> None:
        if not self.authenticated or not self.watch_party_codes:
            return
        code = random.choice(self.watch_party_codes)
        self.client.get(f"/api/watch-party/rooms/{code}", name="GET /api/watch-party/rooms/[code]")

    @task(1)
    def join_watch_party_websocket(self) -> None:
        if not ENABLE_WS or websocket is None or not self.authenticated or not self.watch_party_codes:
            return
        code = random.choice(self.watch_party_codes)
        url = f"{ws_base_url(self.host)}/api/watch-party/ws/{code}"
        cookies = self.client.cookies.get_dict()
        cookie_header = "; ".join(f"{key}={value}" for key, value in cookies.items())
        start = time.perf_counter()
        exception: Exception | None = None
        response_length = 0
        try:
            ws = websocket.create_connection(url, timeout=3, header=[f"Cookie: {cookie_header}"])
            message = ws.recv()
            response_length = len(message or "")
            ws.close()
        except Exception as error:  # pragma: no cover - depende de red/ingress.
            exception = error
        finally:
            events.request.fire(
                request_type="WS",
                name="WS /api/watch-party/ws/[code]",
                response_time=(time.perf_counter() - start) * 1000,
                response_length=response_length,
                exception=exception,
                context={},
            )
