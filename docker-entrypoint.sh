#!/bin/sh
#
# Prepares the container before handing over to the server. Everything here is
# specific to running in Docker: the systemd deployment gets the same settings
# from the environment file that .github/workflows/deploy.yml writes.
set -eu

DATA_DIR="$(dirname "${NUXT_DATABASE_PATH:-/data/uptime.db}")"
SECRET_FILE="${DATA_DIR}/.session_password"

mkdir -p "${DATA_DIR}"

# The image starts as root so this can run. A named volume inherits the
# ownership baked into the image, but a bind mounted host directory belongs to
# whoever created it, and the unprivileged user the server runs as could not
# write into it. Handing it over here is what makes `-v ./data:/data` work.
#
# Only when it is not ours already, so a directory holding a large database and
# its backups is not walked on every restart.
if [ "$(id -u)" = "0" ] && [ "$(stat -c %u "${DATA_DIR}")" != "$(id -u bun)" ]; then
  chown -R bun:bun "${DATA_DIR}"
fi

# nuxt-auth-utils reads this variable on the first request rather than at import
# time, so exporting it here is early enough. Generating one keeps `docker run`
# free of required configuration; storing it next to the database keeps a
# restart from signing every open session out.
if [ -z "${NUXT_SESSION_PASSWORD:-}" ]; then
  if [ ! -f "${SECRET_FILE}" ]; then
    (
      umask 077
      bun -e "console.log([crypto.randomUUID(),crypto.randomUUID()].join('').replace(/-/g,''))" > "${SECRET_FILE}"
    )

    if [ "$(id -u)" = "0" ]; then
      chown bun:bun "${SECRET_FILE}"
    fi

    echo "[entrypoint] generated a session password in ${SECRET_FILE}." \
      "Set NUXT_SESSION_PASSWORD to manage it yourself."
  fi

  NUXT_SESSION_PASSWORD="$(cat "${SECRET_FILE}")"
  export NUXT_SESSION_PASSWORD
elif [ "${NUXT_SESSION_PASSWORD}" = "change-me-to-a-random-string-of-32-chars" ]; then
  # The placeholder from .env.example, which is published and therefore known to
  # everyone. Sealing sessions with it lets anyone forge an admin cookie.
  echo "[entrypoint] WARNING: NUXT_SESSION_PASSWORD is still the example value." \
    "Replace it with a secret of your own: openssl rand -base64 32"
fi

# A browser silently drops a cookie marked Secure on a plain http:// origin, so
# an instance that is not behind TLS could never sign in. NUXT_PUBLIC_APP_URL is
# the one setting that says which origin this instance is served on, so it
# decides. An explicit NUXT_SESSION_COOKIE_SECURE still wins over both.
if [ -z "${NUXT_SESSION_COOKIE_SECURE:-}" ]; then
  case "${NUXT_PUBLIC_APP_URL:-}" in
    https://*)
      NUXT_SESSION_COOKIE_SECURE=true
      ;;
    *)
      NUXT_SESSION_COOKIE_SECURE=false
      echo "[entrypoint] NUXT_PUBLIC_APP_URL is not an https:// origin, so session" \
        "cookies are not marked Secure. Set it once this instance is behind TLS."
      ;;
  esac

  export NUXT_SESSION_COOKIE_SECURE
fi

# setpriv comes from util-linux, which Debian always carries. The file
# capability on /bin/ping survives the switch, so ping monitors keep working.
if [ "$(id -u)" = "0" ]; then
  exec setpriv --reuid=bun --regid=bun --init-groups "$@"
fi

exec "$@"
