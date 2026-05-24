# **Senzor Server Agent**

**Senzor Server Agent** is a lightweight, secure, and reliable telemetry collector designed for Server infrastructure. Written in TypeScript and distributed via Docker, it ensures minimal footprint while providing production-grade monitoring.

## **Features**

- **Real-time Metrics:** Captures CPU, Memory, Disk (multi-mount), Network I/O, GPU, Docker containers, and process stats.
- **Web Terminal**: Secure, browser-based SSH access to your server (supports Host Shell via `nsenter`).
- **Integrations:** Built-in Nginx and Traefik monitoring with auto-discovery.
- **Zero-Config Networking:** Uses outbound HTTP/S requests. No firewall ports need to be opened.
- **Lightweight:** Optimized Node.js 22 Alpine runtime with strict resource limits (256MB RAM, 0.2 CPU).
- **Secure:** Runs in a read-only Docker container; data is authenticated via API Keys.
- **Resilient:** Auto-restarts on failure, retries with exponential backoff, and gracefully shuts down on SIGTERM/SIGINT.

## **Installation**

### **Option 1: One-Line Installer (Recommended)**

```sh
export SERVER_ID="your-server-id"
export API_KEY="your-api-key"

curl -fsSL https://raw.githubusercontent.com/senzops/server-agent/main/install_agent.sh | sudo -E bash -
```

### **Option 2: Interactive Installation**

Download the script, review it, then run interactively:

```sh
curl -fsSLO https://raw.githubusercontent.com/senzops/server-agent/main/install_agent.sh
chmod +x install_agent.sh
sudo bash install_agent.sh
```

### **Option 3: Non-Interactive (CI / Automation)**

All configuration is passed via environment variables:

```sh
export SERVER_ID="your-server-id"
export API_KEY="your-api-key"
export API_ENDPOINT="https://api.senzor.dev/api/ingest/stats"
export ENABLE_TERMINAL="true"

curl -fsSL https://raw.githubusercontent.com/senzops/server-agent/main/install_agent.sh | sudo -E bash -s -- --non-interactive
```

### **Option 4: Manual Docker Run**

```sh
docker run -d \
  --name senzor \
  --restart unless-stopped \
  --network host \
  --pid host \
  --memory=256m \
  --cpus=0.20 \
  -v /:/host/root:ro \
  -v /sys:/host/sys:ro \
  -v /proc:/host/proc:ro \
  -v /etc/os-release:/etc/os-release:ro \
  -v /etc/hostname:/etc/hostname:ro \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -e SERVER_ID="<YOUR_SERVER_ID>" \
  -e API_KEY="<YOUR_API_KEY>" \
  -e API_ENDPOINT="https://api.senzor.dev/api/ingest/stats" \
  -e ENABLE_NGINX="false" \
  -e ENABLE_TRAEFIK="false" \
  -e ENABLE_TERMINAL="false" \
  ghcr.io/senzops/server-agent:latest
```

> **Note:** If enabling the web terminal, add `--privileged` and `-e ALLOW_HOST_ACCESS=true` for host shell access.

### **Option 5: Docker Compose**

See the [docker-compose.yml](./docs/docker-compose.yml) for a ready-to-use template.

```sh
docker compose up -d
docker compose logs -f
```

### **Option 6: Coolify Deployment**

1. Docker Image: `ghcr.io/senzops/server-agent`
2. Custom Docker Options:

```
--name senzor --restart unless-stopped --network host --pid host --privileged --memory=256m --cpus=0.20 -v /:/host/root:ro -v /sys:/host/sys:ro -v /proc:/host/proc:ro -v /var/run/docker.sock:/var/run/docker.sock:ro -v /etc/os-release:/etc/os-release:ro -v /etc/hostname:/etc/hostname:ro
```

3. Set environment variables in Coolify's UI (see Configuration table below).

## **Installer Management**

The install script supports management commands:

```sh
# Check agent status and recent logs
sudo bash install_agent.sh --status

# Upgrade to latest image
sudo bash install_agent.sh --upgrade

# Completely remove the agent
sudo bash install_agent.sh --uninstall

# Pin a specific image tag
sudo bash install_agent.sh --image-tag v1.2.0
```

## **Configuration**

The agent is configured entirely via environment variables.

### **Core**

| Variable       | Description                        | Default                                       | Required |
| :------------- | :--------------------------------- | :-------------------------------------------- | :------- |
| `SERVER_ID`    | Unique ID from Senzor Dashboard    | —                                             | **Yes**  |
| `API_KEY`      | Secret key for authentication      | —                                             | **Yes**  |
| `API_ENDPOINT` | Ingest URL (use default for Cloud) | `https://api.senzor.dev/api/ingest/stats`     | No       |
| `INTERVAL`     | Telemetry interval in seconds      | `60` (min: 5, max: 3600)                      | No       |
| `LOG_LEVEL`    | Logging verbosity                  | `info` (options: error, warn, info, debug)     | No       |

### **Integrations**

| Variable                       | Description                           | Default                         | Required   |
| :----------------------------- | :------------------------------------ | :------------------------------ | :--------- |
| `ENABLE_TERMINAL`              | Enable Web SSH Terminal               | `false`                         | No         |
| `ALLOW_HOST_ACCESS`            | Allow terminal to access host via nsenter | `false`                     | No         |
| `ENABLE_NGINX`                 | Enable Nginx stub_status monitoring   | `false`                         | No         |
| `NGINX_STATUS_URL`             | URL for Nginx stub_status             | `http://127.0.0.1/nginx_status` | If enabled |
| `ENABLE_TRAEFIK`               | Enable Traefik API monitoring         | `false`                         | No         |
| `TRAEFIK_API_URL`              | URL for Traefik API                   | `http://127.0.0.1:8080`        | If enabled |
| `TRAEFIK_USER`                 | Traefik Basic Auth username           | —                               | No         |
| `TRAEFIK_PASSWORD`             | Traefik Basic Auth password           | —                               | No         |
| `TRAEFIK_INSECURE_SKIP_VERIFY` | Skip TLS certificate verification    | `false`                         | No         |

## **Development Setup**

1. **Clone & Install**

   ```sh
   git clone https://github.com/senzops/server-agent.git
   cd server-agent
   npm install
   ```

2. **Configure Environment**

   ```sh
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Run Locally**

   ```sh
   npm run dev
   ```

4. **Test**

   ```sh
   npm test
   ```

5. **Build**

   ```sh
   npm run build
   ```

6. **Build Docker Image**

   ```sh
   docker build -t senzor-agent .
   ```

## **Security Architecture**

Senzor is designed with a **Zero-Trust** security model:

1. **Outbound Only:** The agent initiates all connections via HTTPS (Port 443). No inbound ports need to be opened.
2. **Read-Only Filesystem:** The host filesystem is mounted as read-only (`:ro`). The agent cannot modify system files.
3. **Privilege Isolation:**
   - For basic metrics, the agent runs as a standard container.
   - For **Host Terminal** access (nsenter), the container requires `--privileged` mode. Without it, the terminal safely falls back to a restricted container shell.
4. **Credential Isolation:** API keys are excluded from terminal shell environments.
5. **Ephemeral Sessions:** Terminal sessions use secure WebSockets and are killed immediately upon disconnection.
6. **Input Validation:** Terminal input is size-limited to prevent resource exhaustion.
7. **Graceful Shutdown:** SIGTERM/SIGINT are handled cleanly — in-flight requests complete, PTY sessions are terminated, and sockets are disconnected.

## **Troubleshooting**

**View Logs:**

```sh
docker logs -f senzor

# Or with the installer
sudo bash install_agent.sh --status
```

**Enable Debug Logging:**

```sh
# Set LOG_LEVEL=debug in your environment or docker-compose
docker stop senzor && docker rm senzor
# Re-run with -e LOG_LEVEL=debug
```

**"Connection Refused":**
Ensure your `API_ENDPOINT` is reachable from the server. If testing locally with Docker, use `http://host.docker.internal:3000` instead of `localhost`.

**"Permission denied" in Terminal:**
Ensure the container is running with `--privileged` and `ALLOW_HOST_ACCESS=true`. Without these, the agent cannot access the host shell via nsenter.

**"Connection Refused" (Traefik/Nginx):**
Inside Docker, `localhost` refers to the container itself. Use `http://172.17.0.1:8080` (Docker bridge gateway) or `http://host.docker.internal:8080` to reach host services. Traefik auto-discovery will try common endpoints automatically.
