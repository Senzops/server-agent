# **Senzor Server Agent**

**Senzor Server Agent** is a lightweight, secure, and reliable telemetry collector designed for Server infrastructure. Written in TypeScript and distributed via Docker, it ensures minimal footprint while providing production-grade monitoring.

## **🚀 Features**

- **Real-time Metrics:** Captures CPU, Memory, Disk, and Network I/O.
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
  --memory="150m" \
  --cpus="0.1" \
  -v /:/host/root:ro \
  -v /sys:/host/sys:ro \
  -v /proc:/host/proc:ro \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -e SERVER_ID="<YOUR_SERVER_ID>" \
  -e API_KEY="<YOUR_API_KEY>" \
  -e API_ENDPOINT="https://api.senzor.dev/api/ingest/stats" \
  ghcr.io/senzops/server-agent:latest
```

### **Option 4: Coolify Deployment Setup**

1. Docker Image: `ghcr.io/senzops/server-agent`
2. Custom Docker Options :

```
--name senzor --restart unless-stopped --network host --pid host --memory="150m" --cpus="0.1" -v /:/host/root:ro -v /sys:/host/sys:ro -v /proc:/host/proc:ro -v /var/run/docker.sock:/var/run/docker.sock:ro
```

3. Add the following environment variables in **Environment Variables**:

```.env
SERVER_ID="<YOUR_SERVER_ID>"
API_KEY="<YOUR_API_KEY>"
API_ENDPOINT="https://api.senzor.dev/api/ingest/stats"
```

## **⚙️ Configuration**

The agent is configured entirely via Environment Variables.

| Variable     | Description                          | Default             | Required |
| :----------- | :----------------------------------- | :------------------ | :------- |
| SERVER_ID    | Unique ID from your Senzor Dashboard | null                | **Yes**  |
| API_KEY      | Secret Key for authentication        | null                | **Yes**  |
| API_ENDPOINT | The ingest URL of the backend        | http://localhost... | **Yes**  |
| INTERVAL     | Time between checks (in seconds)     | 60                  | No       |
| NODE_ENV     | Environment mode                     | production          | No       |

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

- **Read-Only Access:** The container mounts the host filesystem as Read-Only (:ro). It cannot modify your system files.
- **Privilege Isolation:** The agent does not require sudo privileges to run, only docker group access.
- **Outbound Only:** The agent initiates all connections. No listening ports are exposed to the internet.

## **🆘 Troubleshooting**

Logs:  
View the agent logs to see connection status:

```sh
docker logs -f senzor
```

"Connection Refused":  
Ensure your `API_ENDPOINT` is reachable from the server. If testing locally with Docker, use `http://host.docker.internal:3000` instead of `localhost`.
