#!/bin/bash
# One TITO cycle per task.
set -uo pipefail

: "${TITO_REGION:?}" "${TITO_S3_BUCKET:?}" "${TITO_STATIC_PREFIX:?}" "${TITO_OUTPUT_PREFIX:?}"

APP="${TITO_APP_DIR:-/app}"
PY="${TITO_PYTHON:-/opt/conda/envs/tito_env2/bin/python}"
HERE="${TITO_TASK_DIR:-/opt/tito-task}"
ENTRYPOINT="${TITO_ENTRYPOINT:-/docker-entrypoint.sh}"
CYCLE_TIMEOUT="${TITO_CYCLE_TIMEOUT_S:-3000}"
SS="$APP/tito_utils/qpe_utils/STREAM-Sat-realtime/extension"
DOMAIN="${TITO_STREAMSAT_DOMAIN:-caribbean}"
LOCK="${TITO_LOCK_FILE:-/run/tito/cycle.lock}"
STRICT="${TITO_STRICT_CHECKS:-1}"
STATE_MAX_AGE="${TITO_STREAMSAT_MAX_AGE_S:-21600}"

fail() {
    echo "TITO_TASK_FAILED: $*"
    exit 1
}

check() {
    if [ "$STRICT" = "1" ]; then
        fail "precondition: $*"
    fi
    echo "WARNING precondition: $*"
}

# Skip if previous cycle runs
exec 9>"$LOCK" || fail "cannot open lock $LOCK"
if ! flock -n 9; then
    echo "TITO_CYCLE_SKIPPED: previous cycle still running"
    exit 0
fi

echo "cycle start $(date -u +%FT%TZ) region=$TITO_REGION image=${TITO_IMAGE_TAG:-}"

"$PY" "$HERE/tito_s3.py" fetch-static || fail "static data fetch"

if compgen -G "$APP/fim_store/$TITO_REGION/*.zarr.zip*" >/dev/null; then
    (cd "$APP" && "$PY" fim_store/unzip_stores.py "$TITO_REGION") || fail "FIM store unzip"
fi

# Temporary PPS workaround, self-disabling
if [ "${TITO_USES_STREAMSAT:-0}" = "1" ] && [ "${TITO_PPS_YAML_OVERRIDE:-0}" = "1" ]; then
    yaml="$SS/config_${DOMAIN}.yaml"
    if grep -qE '^imerg_pps_email: *"[^"]+"' "$yaml"; then
        sed -i -E 's/^(imerg_pps_email: *)"[^"]+"/\1""/' "$yaml" || fail "PPS override failed"
        if grep -qE '^imerg_pps_email: *"[^"]+"' "$yaml"; then
            fail "PPS override did not apply"
        fi
        echo "PPS_YAML_OVERRIDE: blanked imerg_pps_email in the task copy of config_${DOMAIN}.yaml"
    fi
fi

# Preconditions, read only
[ -x "$APP/EF5/bin/ef5" ] || fail "EF5 binary missing"
[ "${EF5_RUNTIME:-}" = "local" ] || check "EF5_RUNTIME is not local"
[ -n "${TITO_GPM_EMAIL:-}" ] || check "TITO_GPM_EMAIL is empty"
if [ -n "${EF5_MAX_WORKERS:-}" ] && ! grep -qs EF5_MAX_WORKERS "$APP/tito_utils/ef5/jobs/workers.py"; then
    check "this TITO release ignores EF5_MAX_WORKERS"
fi
if [ "${TITO_USES_STREAMSAT:-0}" = "1" ]; then
    if grep -qE '^imerg_pps_email: *"[^"]+"' "$SS/config_${DOMAIN}.yaml"; then
        check "imerg_pps_email is hardcoded in config_${DOMAIN}.yaml"
    fi
    state="${STREAM_SAT_STATE_DIR:-$SS/realtime/state}/state_${DOMAIN}.pkl"
    if [ ! -f "$state" ]; then
        echo "STREAMSAT_COLD_START: no state file $state"
    elif [ $(($(date +%s) - $(stat -c %Y "$state"))) -gt "$STATE_MAX_AGE" ]; then
        echo "STREAMSAT_COLD_START: state older than ${STATE_MAX_AGE}s"
    fi
fi

# Default operational; args override
if [ "$#" -gt 0 ]; then
    mode=("$@")
    export TITO_UPDATE_LATEST=0
else
    mode=(operational)
    export TITO_UPDATE_LATEST=1
fi
timeout --kill-after=60 "$CYCLE_TIMEOUT" "$ENTRYPOINT" "${mode[@]}" --regions "$TITO_REGION"
rc=$?
[ "$rc" -ne 124 ] || fail "orchestrator timed out after ${CYCLE_TIMEOUT}s"
[ "$rc" -eq 0 ] || fail "orchestrator exit $rc"

"$PY" "$HERE/tito_s3.py" publish-outputs || fail "output upload"

echo "TITO_CYCLE_OK $(date -u +%FT%TZ)"
