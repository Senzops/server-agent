## **📝 TODO: Deployment & Publishing Roadmap**

This section tracks the tasks required to move from "Local Development" to "Public Production".

### **Phase 1: Docker Registry Setup**

- [x] Create `.github/workflows/docker-publish.yml` to build & push to GHCR.
- [x] Push code to `main` branch to trigger first build.
- [x] Verify image exists at `ghcr.io/syssentinel/agent:latest`.
- [x] **Important**: Go to GitHub Package Settings and change visibility to **Public**.

### **Phase 2: Distribution**

- [x] Update `install_agent.sh` to use the GHCR image.
- [x] Host `install_agent.sh` on a public URL (e.g., GitHub Raw, S3, or Vercel).
- [x] Update the curl command in this README with the final script URL.
