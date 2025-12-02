# **SysSentinel Agent**

**SysSentinel Agent** is a lightweight, secure, and reliable telemetry collector designed for VPS and Server infrastructure. Written in TypeScript and distributed via Docker, it ensures minimal footprint while providing production-grade monitoring.

## **🚀 Features**

* **Real-time Metrics:** Captures CPU, Memory, Disk, and Network I/O.  
* **Zero-Config Networking:** Uses outbound HTTP/S requests. No firewall ports need to be opened.  
* **Lightweight:** Optimized Node.js runtime with strict resource limits.  
* **Secure:** Runs in a read-only Docker container; data is authenticated via API Keys.  
* **Resilient:** Auto-restarts on failure and queues metrics if the network momentarily drops.

## **🛠 Installation (For Users)**

### **Option 1: The One-Line Installer (Recommended)**

This script detects your OS, installs Docker (if missing), and configures the agent.
```sh
# Replace variables with your actual dashboard credentials
export VPS_ID="your-vps-id"
export API_KEY="your-api-key"
export API_ENDPOINT="https://api.sys-sentinel.com/api/ingest/stats"

curl -sL https://raw.githubusercontent.com/SysSentinel/agent-ts/main/install_agent.sh | sudo -E bash -
```


### **Option 2: Manual Docker Run**

If you prefer to run the container manually:
```sh
docker run -d \
  --name sys-sentinel \
  --restart unless-stopped \
  --network host \
  --pid host \
  --memory="150m" \
  --cpus="0.1" \
  -v /:/host/root:ro \
  -v /sys:/host/sys:ro \
  -v /proc:/host/proc:ro \
  -e VPS_ID="<YOUR_VPS_ID>" \
  -e API_KEY="<YOUR_API_KEY>" \
  -e API_ENDPOINT="https://api.sys-sentinel.com/api/ingest/stats" \
  ghcr.io/syssentinel/agent-ts:latest
```

## **⚙️ Configuration**

The agent is configured entirely via Environment Variables.

| Variable | Description | Default | Required |
| :---- | :---- | :---- | :---- |
| VPS_ID | Unique ID from your SysSentinel Dashboard | null | **Yes** |
| API_KEY | Secret Key for authentication | null | **Yes** |
| API_ENDPOINT | The ingest URL of the backend | http://localhost... | **Yes** |
| INTERVAL | Time between checks (in seconds) | 60 | No |
| NODE_ENV | Environment mode | production | No |

## **💻 Development Setup**

To contribute to the agent or build it locally:

1. **Clone & Install**  
  ```sh
   git clone https://github.com/SysSentinel/agent-ts.git
   cd agent-ts
   npm install
   ```

2. Configure Environment  
   Create a `.env` file in the root:  
   ```.env
   API_ENDPOINT=http://localhost:3000/api/ingest/stats  
   VPS_ID=test-vps-id  
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
   docker build -t sys-sentinel-agent .
   ```

## **🔒 Security Architecture**

* **Read-Only Access:** The container mounts the host filesystem as Read-Only (:ro). It cannot modify your system files.  
* **Privilege Isolation:** The agent does not require sudo privileges to run, only docker group access.  
* **Outbound Only:** The agent initiates all connections. No listening ports are exposed to the internet.

## **🆘 Troubleshooting**

Logs:  
View the agent logs to see connection status:  
```sh
docker logs -f sys-sentinel
```

"Connection Refused":  
Ensure your `API_ENDPOINT` is reachable from the server. If testing locally with Docker, use `http://host.docker.internal:3000` instead of `localhost`.