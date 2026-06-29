#!/usr/bin/env bash
set -Eeuo pipefail

trap 'echo "[bootstrap-tls.sh] Error: fallo en la linea ${LINENO}" >&2' ERR

if [ "$#" -ne 3 ]; then
  echo "Uso: $0 <ip-publica> <correo-acme> <staging|production>" >&2
  exit 2
fi

FRONTEND_IP="$1"
ACME_EMAIL="$2"
ACME_ENVIRONMENT="$3"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CERTBOT_BIN="/opt/certbot/bin/certbot"
WEBROOT="/var/www/certbot"
NGINX_SITE="/etc/nginx/sites-available/quetxal-tv"

if [[ ! "${FRONTEND_IP}" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  echo "[bootstrap-tls.sh] Error: la IP publica no es valida" >&2
  exit 2
fi

if [[ ! "${ACME_EMAIL}" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]; then
  echo "[bootstrap-tls.sh] Error: ACME_EMAIL no es valido" >&2
  exit 2
fi

if [ "${ACME_ENVIRONMENT}" != "staging" ] && [ "${ACME_ENVIRONMENT}" != "production" ]; then
  echo "[bootstrap-tls.sh] Error: ACME_ENVIRONMENT debe ser staging o production" >&2
  exit 2
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y nginx python3-venv

if [ ! -x "${CERTBOT_BIN}" ]; then
  python3 -m venv /opt/certbot
fi
/opt/certbot/bin/pip install --disable-pip-version-check --quiet "certbot==5.4.0"

install -d -m 0755 "${WEBROOT}/.well-known/acme-challenge"
rm -f /etc/nginx/sites-enabled/default
sed "s/__FRONTEND_IP__/${FRONTEND_IP}/g" "${SCRIPT_DIR}/nginx-http.conf.template" > "${NGINX_SITE}"
ln -sfn "${NGINX_SITE}" /etc/nginx/sites-enabled/quetxal-tv
nginx -t
systemctl enable --now nginx
systemctl reload nginx

CERT_NAME="quetxal-tv-ip-${ACME_ENVIRONMENT}"
CERTBOT_ARGS=(
  certonly
  --non-interactive
  --agree-tos
  --email "${ACME_EMAIL}"
  --preferred-profile shortlived
  --webroot
  --webroot-path "${WEBROOT}"
  --ip-address "${FRONTEND_IP}"
  --cert-name "${CERT_NAME}"
  --keep-until-expiring
)

if [ "${ACME_ENVIRONMENT}" = "staging" ]; then
  CERTBOT_ARGS+=(--staging)
fi

"${CERTBOT_BIN}" "${CERTBOT_ARGS[@]}"

sed \
  -e "s/__FRONTEND_IP__/${FRONTEND_IP}/g" \
  -e "s/__CERT_NAME__/${CERT_NAME}/g" \
  "${SCRIPT_DIR}/nginx-https.conf.template" > "${NGINX_SITE}"
nginx -t
systemctl reload nginx

if [ "${ACME_ENVIRONMENT}" = "production" ]; then
  install -m 0644 "${SCRIPT_DIR}/certbot-renew.service" /etc/systemd/system/certbot-renew.service
  install -m 0644 "${SCRIPT_DIR}/certbot-renew.timer" /etc/systemd/system/certbot-renew.timer
  systemctl daemon-reload
  systemctl enable --now certbot-renew.timer

  if "${CERTBOT_BIN}" certificates --cert-name quetxal-tv-ip-staging 2>/dev/null | grep -q "Certificate Name"; then
    "${CERTBOT_BIN}" delete --cert-name quetxal-tv-ip-staging --non-interactive
  fi
fi

echo "TLS configurado para https://${FRONTEND_IP} con ${CERT_NAME}"
