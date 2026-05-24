#!/bin/bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────
# Senzor Agent Installer
# Production-grade installer for the Senzor VPS monitoring agent.
# Supports interactive and non-interactive (CI/automation) modes.
# ─────────────────────────────────────────────────────────────

readonly VERSION="1.2.0"
readonly IMAGE_NAME="ghcr.io/senzops/server-agent"
readonly CONTAINER_NAME="senzor"
readonly DEFAULT_API_ENDPOINT="https://api.senzor.dev/api/ingest/stats"
readonly MIN_DOCKER_VERSION="20.10"

# ── Colors ──────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ── Helpers ─────────────────────────────────────────────────

log_info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }
log_step()  { echo -e "\n${BOLD}${CYAN}▸ $*${NC}"; }

bail() {
  log_error "$@"
  exit 1
}

confirm() {
  local prompt="$1"
  local default="${2:-n}"
  if [[ -n "${NON_INTERACTIVE:-}" ]]; then
    return 0
  fi
  local yn
  read -r -p "$(echo -e "${BOLD}${prompt}${NC} ")" yn
  yn="${yn:-$default}"
  [[ "$yn" =~ ^[Yy]$ ]]
}

prompt_value() {
  local var_name="$1"
  local prompt_text="$2"
  local default_val="${3:-}"
  local current_val="${!var_name:-}"

  if [[ -n "$current_val" ]]; then
    return
  fi

  if [[ -n "${NON_INTERACTIVE:-}" ]]; then
    if [[ -n "$default_val" ]]; then
      eval "$var_name=\"$default_val\""
      return
    fi
    bail "Missing required variable $var_name in non-interactive mode"
  fi

  local display_prompt="$prompt_text"
  if [[ -n "$default_val" ]]; then
    display_prompt="$prompt_text (default: $default_val)"
  fi

  local input
  read -r -p "$(echo -e "${BOLD}${display_prompt}: ${NC}")" input
  input="${input:-$default_val}"

  if [[ -z "$input" ]]; then
    bail "$var_name is required"
  fi

  eval "$var_name=\"$input\""
}

usage() {
  cat <<EOF
${BOLD}Senzor Agent Installer v${VERSION}${NC}

${BOLD}Usage:${NC}
  curl -fsSL https://install.senzor.dev | bash
  bash install_agent.sh [OPTIONS]

${BOLD}Options:${NC}
  --uninstall          Remove the Senzor agent completely
  --upgrade            Pull latest image and restart the agent
  --status             Show agent container status and recent logs
  --non-interactive    Run without prompts (all config via env vars)
  --image-tag TAG      Image tag to use (default: latest)
  --help               Show this help message

${BOLD}Environment Variables (for non-interactive mode):${NC}
  SERVER_ID            (required)  Your server identifier
  API_KEY              (required)  Your agent API key
  API_ENDPOINT         (optional)  Backend endpoint URL
  ENABLE_NGINX         (optional)  true/false
  NGINX_STATUS_URL     (optional)  Nginx stub_status URL
  ENABLE_TRAEFIK       (optional)  true/false
  TRAEFIK_API_URL      (optional)  Traefik API URL
  TRAEFIK_USER         (optional)  Traefik basic auth username
  TRAEFIK_PASSWORD     (optional)  Traefik basic auth password
  ENABLE_TERMINAL      (optional)  true/false

${BOLD}Examples:${NC}
  # Interactive
  bash install_agent.sh

  # Non-interactive (CI/automation)
  SERVER_ID=abc API_KEY=xyz bash install_agent.sh --non-interactive

  # Upgrade to latest
  bash install_agent.sh --upgrade

  # Uninstall
  bash install_agent.sh --uninstall
EOF
  exit 0
}

# ── Preflight Checks ───────────────────────────────────────

check_root() {
  if [[ $EUID -ne 0 ]]; then
    bail "This installer must be run as root (or with sudo)"
  fi
}

check_docker() {
  if ! command -v docker &>/dev/null; then
    bail "Docker is not installed. Install it first: curl -fsSL https://get.docker.com | sh"
  fi

  if ! docker info &>/dev/null; then
    bail "Docker daemon is not running or current user lacks permissions"
  fi

  local docker_version
  docker_version="$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo "0.0")"
  local major minor
  major="$(echo "$docker_version" | cut -d. -f1)"
  minor="$(echo "$docker_version" | cut -d. -f2)"
  local req_major req_minor
  req_major="$(echo "$MIN_DOCKER_VERSION" | cut -d. -f1)"
  req_minor="$(echo "$MIN_DOCKER_VERSION" | cut -d. -f2)"

  if [[ "$major" -lt "$req_major" ]] || { [[ "$major" -eq "$req_major" ]] && [[ "$minor" -lt "$req_minor" ]]; }; then
    bail "Docker version $docker_version is too old. Minimum required: $MIN_DOCKER_VERSION"
  fi

  log_ok "Docker $docker_version detected"
}

check_connectivity() {
  if ! docker pull --quiet "$IMAGE_NAME:${IMAGE_TAG}" >/dev/null 2>&1; then
    bail "Cannot pull image $IMAGE_NAME:${IMAGE_TAG}. Check network connectivity and that the package is accessible."
  fi
  log_ok "Image pulled: $IMAGE_NAME:${IMAGE_TAG}"
}

# ── Container Management ───────────────────────────────────

stop_existing() {
  if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    log_info "Stopping existing agent container..."
    docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
    docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true
    log_ok "Existing container removed"
  fi
}

do_uninstall() {
  log_step "Uninstalling Senzor Agent"

  if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
    docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true
    log_ok "Container removed"
  else
    log_info "No running container found"
  fi

  if docker images "$IMAGE_NAME" -q | head -1 | grep -q .; then
    docker rmi "$(docker images "$IMAGE_NAME" -q)" >/dev/null 2>&1 || true
    log_ok "Image removed"
  fi

  echo ""
  log_ok "Senzor Agent has been completely removed."
  exit 0
}

do_upgrade() {
  log_step "Upgrading Senzor Agent"

  if ! docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    bail "No existing agent found. Run the installer without --upgrade first."
  fi

  log_info "Pulling latest image..."
  docker pull "$IMAGE_NAME:${IMAGE_TAG}" || bail "Failed to pull image"

  local old_image
  old_image="$(docker inspect --format='{{.Image}}' "$CONTAINER_NAME" 2>/dev/null || echo "")"

  docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
  docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true

  # Re-read config from the old container's env (docker inspect)
  log_warn "Container removed. Re-run the full installer to reconfigure, or use docker-compose."

  echo ""
  log_ok "Image updated. Please re-run the installer or restart via docker-compose."
  exit 0
}

do_status() {
  log_step "Senzor Agent Status"

  if ! docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    log_warn "No agent container found"
    exit 1
  fi

  echo ""
  docker ps -a --filter "name=^${CONTAINER_NAME}$" --format "table {{.Status}}\t{{.Image}}\t{{.CreatedAt}}"
  echo ""
  log_info "Recent logs:"
  docker logs --tail 20 "$CONTAINER_NAME" 2>&1
  exit 0
}

# ── Validation ─────────────────────────────────────────────

validate_url() {
  local url="$1"
  local label="$2"
  if [[ ! "$url" =~ ^https?:// ]]; then
    bail "Invalid $label: '$url' — must start with http:// or https://"
  fi
}

validate_non_empty() {
  local val="$1"
  local label="$2"
  if [[ -z "$val" ]]; then
    bail "$label cannot be empty"
  fi
}

# ── Interactive Configuration ──────────────────────────────

collect_config() {
  log_step "Configuration"

  prompt_value SERVER_ID "Enter your SERVER ID"
  validate_non_empty "$SERVER_ID" "SERVER_ID"

  prompt_value API_KEY "Enter your Agent API KEY"
  validate_non_empty "$API_KEY" "API_KEY"

  prompt_value API_ENDPOINT "Enter API Endpoint" "$DEFAULT_API_ENDPOINT"
  validate_url "$API_ENDPOINT" "API_ENDPOINT"

  log_step "Integrations (Optional)"

  # ── Nginx
  ENABLE_NGINX="${ENABLE_NGINX:-false}"
  if [[ "$ENABLE_NGINX" != "true" ]] && [[ -z "${NON_INTERACTIVE:-}" ]]; then
    if confirm "Enable Nginx Monitoring? (y/N)" "n"; then
      ENABLE_NGINX="true"
      prompt_value NGINX_STATUS_URL "Nginx Status URL" "http://127.0.0.1/nginx_status"
      validate_url "$NGINX_STATUS_URL" "NGINX_STATUS_URL"
    fi
  fi
  if [[ "$ENABLE_NGINX" == "true" ]]; then
    NGINX_STATUS_URL="${NGINX_STATUS_URL:-http://127.0.0.1/nginx_status}"
    validate_url "$NGINX_STATUS_URL" "NGINX_STATUS_URL"
  fi

  # ── Traefik
  ENABLE_TRAEFIK="${ENABLE_TRAEFIK:-false}"
  if [[ "$ENABLE_TRAEFIK" != "true" ]] && [[ -z "${NON_INTERACTIVE:-}" ]]; then
    if confirm "Enable Traefik Monitoring? (y/N)" "n"; then
      ENABLE_TRAEFIK="true"
      prompt_value TRAEFIK_API_URL "Traefik API URL" "http://127.0.0.1:8080"
      validate_url "$TRAEFIK_API_URL" "TRAEFIK_API_URL"

      if confirm "Does Traefik require Basic Auth? (y/N)" "n"; then
        prompt_value TRAEFIK_USER "Traefik Username"
        prompt_value TRAEFIK_PASSWORD "Traefik Password"
      fi
    fi
  fi
  if [[ "$ENABLE_TRAEFIK" == "true" ]]; then
    TRAEFIK_API_URL="${TRAEFIK_API_URL:-http://127.0.0.1:8080}"
    validate_url "$TRAEFIK_API_URL" "TRAEFIK_API_URL"
  fi

  # ── Terminal
  ENABLE_TERMINAL="${ENABLE_TERMINAL:-false}"
  if [[ "$ENABLE_TERMINAL" != "true" ]] && [[ -z "${NON_INTERACTIVE:-}" ]]; then
    if confirm "Enable Web Terminal? (y/N)" "n"; then
      ENABLE_TERMINAL="true"
    fi
  fi
}

# ── Docker Run ─────────────────────────────────────────────

run_agent() {
  log_step "Starting Senzor Agent"

  local docker_args=(
    -d
    --name "$CONTAINER_NAME"
    --restart unless-stopped
    --network host
    --pid host
    -v /:/host/root:ro
    -v /sys:/host/sys:ro
    -v /proc:/host/proc:ro
    -v /etc/os-release:/etc/os-release:ro
    -v /etc/hostname:/etc/hostname:ro
    -v /var/run/docker.sock:/var/run/docker.sock:ro
    -e SERVER_ID="$SERVER_ID"
    -e API_KEY="$API_KEY"
    -e API_ENDPOINT="$API_ENDPOINT"
    -e INTERVAL="${INTERVAL:-60}"
    -e ENABLE_NGINX="${ENABLE_NGINX:-false}"
    -e NGINX_STATUS_URL="${NGINX_STATUS_URL:-}"
    -e ENABLE_TRAEFIK="${ENABLE_TRAEFIK:-false}"
    -e TRAEFIK_API_URL="${TRAEFIK_API_URL:-}"
    -e TRAEFIK_USER="${TRAEFIK_USER:-}"
    -e TRAEFIK_PASSWORD="${TRAEFIK_PASSWORD:-}"
    -e ENABLE_TERMINAL="${ENABLE_TERMINAL:-false}"
  )

  # Terminal requires privileged mode for nsenter host access
  if [[ "${ENABLE_TERMINAL:-false}" == "true" ]]; then
    docker_args+=(--privileged -e ALLOW_HOST_ACCESS=true)
    log_warn "Privileged mode enabled for web terminal host access"
  fi

  # Resource limits
  docker_args+=(
    --memory=256m
    --cpus=0.20
  )

  docker run "${docker_args[@]}" "$IMAGE_NAME:${IMAGE_TAG}"

  if [[ $? -eq 0 ]]; then
    echo ""
    log_ok "Senzor Agent is running!"
    echo ""
    echo -e "  ${BOLD}Container:${NC}  $CONTAINER_NAME"
    echo -e "  ${BOLD}Image:${NC}      $IMAGE_NAME:${IMAGE_TAG}"
    echo -e "  ${BOLD}Server ID:${NC}  $SERVER_ID"
    echo -e "  ${BOLD}Endpoint:${NC}   $API_ENDPOINT"
    echo -e "  ${BOLD}Nginx:${NC}      ${ENABLE_NGINX:-false}"
    echo -e "  ${BOLD}Traefik:${NC}    ${ENABLE_TRAEFIK:-false}"
    echo -e "  ${BOLD}Terminal:${NC}   ${ENABLE_TERMINAL:-false}"
    echo ""
    echo -e "  ${CYAN}View logs:${NC}  docker logs -f $CONTAINER_NAME"
    echo -e "  ${CYAN}Status:${NC}     bash install_agent.sh --status"
    echo -e "  ${CYAN}Uninstall:${NC}  bash install_agent.sh --uninstall"
    echo ""
  else
    bail "Failed to start agent container. Check 'docker logs $CONTAINER_NAME' for details."
  fi
}

# ── Banner ─────────────────────────────────────────────────

show_banner() {
  echo -e "${BLUE}"
  echo "   _____                               "
  echo "  / ____|                              "
  echo " | (___   ___ _ __  ____ ___  _ __     "
  echo "  \\___ \\ / _ \\ '_ \\|_  // _ \\| '__|    "
  echo "  ____) |  __/ | | |/ /| (_) | |       "
  echo " |_____/ \\___|_| |_/___|\\___/|_|       "
  echo -e "${NC}"
  echo -e "${BOLD}Senzor Agent Installer${NC} v${VERSION}"
  echo "─────────────────────────────────────────"
}

# ── Main ───────────────────────────────────────────────────

main() {
  IMAGE_TAG="latest"

  # Parse arguments
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --uninstall)    do_uninstall ;;
      --upgrade)      do_upgrade ;;
      --status)       do_status ;;
      --non-interactive) NON_INTERACTIVE=1; shift ;;
      --image-tag)    IMAGE_TAG="$2"; shift 2 ;;
      --help|-h)      usage ;;
      *)              bail "Unknown option: $1. Use --help for usage." ;;
    esac
  done

  show_banner

  log_step "Preflight Checks"
  check_root
  check_docker

  log_info "Pulling image $IMAGE_NAME:${IMAGE_TAG}..."
  check_connectivity

  collect_config
  stop_existing
  run_agent
}

main "$@"
