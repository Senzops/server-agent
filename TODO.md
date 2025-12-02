
## **📝 TODO: Deployment & Publishing Roadmap**

This section tracks the tasks required to move from "Local Development" to "Public Production".

### **Phase 1: Docker Registry Setup**

* [ ] Create a Docker Hub organization/repository (e.g., `syssentinel/agent`).  
* [ ] Authenticate local Docker client with registry.  
* [ ] Tag the local image: `docker tag sys-sentinel-agent syssentinel/agent:v1.0.0`.  
* [ ] Push image: `docker push syssentinel/agent:v1.0.0`.  
* [ ] Update `docker-compose` and `install_agent.sh` to pull from this registry instead of building locally.

### **Phase 2: CI/CD Pipeline (GitHub Actions)**

* [ ] Create `.github/workflows/deploy.yml`.  
* [ ] Configure action to run `npm run test` on every PR.  
* [ ] Configure action to build and push Docker image on `git tag` push.  
* [ ] Add `latest` tag logic (so users always get the newest version).

### **Phase 3: Distribution**

* [ ] Host `install_agent.sh` on a public URL (e.g., AWS S3, Vercel Blob, or GitHub Pages).  
* [ ] Ensure the script URL is short and memorable (e.g., `sys-sentinel.com/install`).  
* [ ] Create a "How to Update" guide for existing users (usually `docker pull && docker restart`).
