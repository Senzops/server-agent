# **Senzor Server Agent**

**Senzor Server Agent** is a lightweight, secure, and reliable telemetry collector designed for Server infrastructure. Written in TypeScript and distributed via Docker, it ensures minimal footprint while providing production-grade monitoring.

## **🚀 Features**

- **Real-time Metrics:** Captures CPU, Memory, Disk, and Network I/O.
- **Web Terminal**: Secure, browser-based SSH access to your server (supports Host Shell via `nsenter`).
- **Zero-Config Networking:** Uses outbound HTTP/S requests. No firewall ports need to be opened.
- **Lightweight:** Optimized Node.js runtime with strict resource limits.
- **Secure:** Runs in a read-only Docker container; data is authenticated via API Keys.
- **Resilient:** Auto-restarts on failure and queues metrics if the network momentarily drops.

## **🛠 Installation (For Users)**

### **Option 1: One-Line Installer (Recommended)**

This script automatically detects your operating system, installs Docker (if required), and configures the Senzor agent.

```sh
# Replace the variables below with your actual Senzor dashboard credentials
export SERVER_ID="your-server-id"
export API_KEY="your-api-key"
export API_ENDPOINT="https://api.senzor.dev/api/ingest/stats"

curl -sL https://raw.githubusercontent.com/senzops/server-agent/main/install_agent.sh | sudo -E bash -
```

### **Option 2: Interactive Installation**

Download the script manually, review it if desired, then run it interactively.

```sh
curl -sLO https://raw.githubusercontent.com/senzops/server-agent/main/install_agent.sh
chmod +x install_agent.sh
sudo -E ./install_agent.sh
```

### **Option 3: Manual Docker Run**

If you prefer to run the container manually:

```sh
docker run -d \
  --name senzor \
  --restart unless-stopped \
  --network host \
  --pid host \
  --privileged \
  --memory="150m" \
  --cpus="0.1" \
  -v /:/host/root:ro \
  -v /sys:/host/sys:ro \
  -v /proc:/host/proc:ro \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -e SERVER_ID="<YOUR_SERVER_ID>" \
  -e API_KEY="<YOUR_API_KEY>" \
  -e API_ENDPOINT="https://api.senzor.dev/api/ingest/stats" \
  -e ENABLE_NGINX="$ENABLE_NGINX" \
  -e NGINX_STATUS_URL="$NGINX_STATUS_URL" \
  -e ENABLE_TRAEFIK="$ENABLE_TRAEFIK" \
  -e TRAEFIK_API_URL="$TRAEFIK_API_URL" \
  -e TRAEFIK_USER="$TRAEFIK_USER" \
  -e TRAEFIK_PASSWORD="$TRAEFIK_PASSWORD" \
  -e ENABLE_TERMINAL="$ENABLE_TERMINAL" \
  -e ALLOW_HOST_ACCESS="$ALLOW_HOST_ACCESS" \
  ghcr.io/senzops/server-agent:latest
```

### **Option 4: Docker Compose Deployment**

**Find the [docker-compose.yml](./docs/docker-compose.yml)**

1. **Download the file**: Save the above linked file as `docker-compose.yml` on your server.
2. **Edit Credentials**: Open the file and replace the placeholders with your actual IDs from the dashboard:

```.env
SERVER_ID="<YOUR_SERVER_ID>"
API_KEY="<YOUR_API_KEY>"
API_ENDPOINT="https://api.senzor.dev/api/ingest/stats"
ENABLE_NGINX="true"
ENABLE_TRAEFIK="false"
ENABLE_TERMINAL="true"
ALLOW_HOST_ACCESS="false"
```

3. **Start the Agent**:

```sh
docker-compose up -d
```

4. **View Logs**:

```sh
docker-compose logs -f
```

### **Option 5: Coolify Deployment Setup**

1. Docker Image: `ghcr.io/senzops/server-agent`
2. Custom Docker Options :

```
--name senzor --restart unless-stopped --network host --pid host --privileged --memory="150m" --cpus="0.1" -v /:/host/root:ro -v /sys:/host/sys:ro -v /proc:/host/proc:ro -v /var/run/docker.sock:/var/run/docker.sock:ro
```

3. Add the following environment variables in **Environment Variables**:

```.env
SERVER_ID="<YOUR_SERVER_ID>"
API_KEY="<YOUR_API_KEY>"
API_ENDPOINT="https://api.senzor.dev/api/ingest/stats"
ENABLE_NGINX="true"
ENABLE_TRAEFIK="false"
ENABLE_TERMINAL="true"
ALLOW_HOST_ACCESS="false"
```

## **⚙️ Configuration**

The agent is configured entirely via Environment Variables.

### **Core Configuration**

| Variable     | Description                        | Default                   | Required |
| :----------- | :--------------------------------- | :------------------------ | :------- |
| SERVER_ID    | Unique ID from Senzor Dashboard    | null                      | **Yes**  |
| API_KEY      | Secret Key for authentication      | null                      | **Yes**  |
| API_ENDPOINT | Ingest URL (Use default for Cloud) | https://api.senzor.dev... | No       |
| INTERVAL     | Telemetry interval (seconds)       | 60                        | No       |

### **Integrations**

| Variable         | Description                         | Default                       | Required   |
| :--------------- | :---------------------------------- | :---------------------------- | :--------- |
| ENABLE_TERMINAL  | Enable Web SSH Terminal             | false                         | No         |
| ENABLE_NGINX     | Enable Nginx Stub Status monitoring | false                         | No         |
| NGINX_STATUS_URL | URL for Nginx stub_status           | http://127.0.0.1/nginx_status | If enabled |
| ENABLE_TRAEFIK   | Enable Traefik API monitoring       | false                         | No         |
| TRAEFIK_API_URL  | URL for Traefik API                 | http://127.0.0.1:8080         | If enabled |
| TRAEFIK_USER     | Basic Auth Username                 | null                          | No         |
| TRAEFIK_PASSWORD | Basic Auth Password                 | null                          | No         |

## **💻 Development Setup**

To contribute to the agent or build it locally:

1. **Clone & Install**

```sh
 git clone https://github.com/senzops/server-agent.git
 cd agent
 npm install
```

2. Configure Environment  
   Create a `.env` file in the root:

   ```.env
   API_ENDPOINT=https://api.senzor.dev/api/ingest/stats
   SERVER_ID=test-server-id
   API_KEY=test-api-key
   INTERVAL=5
   ```

3. **Run Locally (Dev Mode)**

   ```
   npm run dev
   ```

4. **Test**

   ```
   npm test
   ```

5. **Build Docker Image**
   ```sh
   docker build -t senzor-agent .
   ```

## **🔒 Security Architecture**

Senzor is designed with a **Zero-Trust** security model:

1. **Outbound Only:** The agent initiates all connections via HTTPS (Port 443). You do **not** need to open inbound ports.
2. **Read-Only Filesystem:** The host filesystem is mounted as Read-Only (:ro). The agent cannot modify system files.
3. **Privilege Isolation:**
   - For basic metrics, the agent runs as a standard container.
   - For **Host Terminal** access (nsenter), the container requires \--privileged mode. If this is not provided, the terminal will safely fallback to a restricted container shell.
4. **Ephemeral Sessions:** Terminal sessions use secure WebSockets and are killed immediately upon disconnection.

## **🆘 Troubleshooting**

Logs:  
View the agent logs to see connection status:

```sh
docker logs -f senzor
```

"Connection Refused":  
Ensure your `API_ENDPOINT` is reachable from the server. If testing locally with Docker, use `http://host.docker.internal:3000` instead of `localhost`.

"Permission denied" in Terminal:  
If the Web Terminal shows "Host access denied", ensure you ran the container with the \--privileged flag. Without it, the agent cannot break out of the container namespace to access the host shell.

"Connection Refused" (Traefik/Nginx):  
If running inside Docker, localhost refers to the container itself. Use http://172.17.0.1:8080 (Docker Gateway) or http://host.docker.internal:8080 to reach services running on the host or other containers.
