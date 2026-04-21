# Pokédex Website

A simple Pokédex with Gen 1 & Gen 2 Pokémon, type filtering, and evolution chains.

**Architecture:** Static frontend (HTML/CSS/JS) + Node.js/Express backend (calls PokeAPI).

```
pokemon-website/
├── frontend/          # Static files (index.html, style.css, app.js)
│   └── Dockerfile     # Nginx container
├── backend/           # Node.js API server
│   └── Dockerfile     # Node container
└── README.md
```

---

## 1. Run Locally

### Backend
```bash
cd backend
npm install
npm start
# Runs on http://localhost:3000
```

### Frontend
Open `frontend/index.html` in a browser, or serve it:
```bash
cd frontend
npx serve .
# Runs on http://localhost:3000 (pick another port if backend is on 3000)
# Or simply: python3 -m http.server 8080
```

Visit `http://localhost:8080` — the frontend calls the backend at `localhost:3000`.

---

## 2. Hosting Options on AWS

### Option A: Elastic Beanstalk (Simplest)

Deploy the **backend** as an EB application, and serve the **frontend** from S3+CloudFront.

**Backend on EB:**
1. Zip the `backend/` folder contents (package.json + server.js)
2. Go to AWS Console → Elastic Beanstalk → Create Application
3. Platform: Node.js
4. Upload the zip → Deploy
5. EB gives you a URL like `http://my-pokemon-api.us-east-1.elasticbeanstalk.com`

**Frontend on S3 + CloudFront:**
1. Create an S3 bucket, enable static website hosting
2. Upload `frontend/` files (index.html, style.css, app.js)
3. Update `API` variable in `app.js` to point to your EB backend URL
4. Create a CloudFront distribution pointing to the S3 bucket
5. Your site is live on the CloudFront URL

---

### Option B: CloudFront + S3 (Frontend) + Fargate (Backend)

**Backend on Fargate:**
1. Build & push the backend Docker image to ECR:
   ```bash
   cd backend
   docker build -t pokemon-backend .
   aws ecr create-repository --repository-name pokemon-backend
   # Tag and push to ECR (use the URI from above command)
   docker tag pokemon-backend:latest <account-id>.dkr.ecr.<region>.amazonaws.com/pokemon-backend:latest
   docker push <account-id>.dkr.ecr.<region>.amazonaws.com/pokemon-backend:latest
   ```
2. Create an ECS Cluster (Fargate)
3. Create a Task Definition:
   - Container image: your ECR image URI
   - Port mapping: 3000
   - Memory: 512MB, CPU: 0.25 vCPU
4. Create a Service with an Application Load Balancer (ALB)
   - ALB listens on port 80, forwards to container port 3000
5. Note the ALB DNS name — that's your backend URL

**Frontend on S3 + CloudFront:**
Same as Option A step, but update `app.js` API URL to the ALB DNS name.

---

### Option C: Both Frontend & Backend on Fargate

Run both as separate Fargate services behind the same ALB.

1. Build & push both Docker images to ECR:
   ```bash
   # Backend
   cd backend && docker build -t pokemon-backend .
   # Frontend
   cd frontend && docker build -t pokemon-frontend .
   # Push both to ECR
   ```

2. Create one ECS Cluster with two services:
   - **pokemon-backend**: container port 3000
   - **pokemon-frontend**: container port 80

3. Create an ALB with path-based routing:
   - `/api/*` → backend target group (port 3000)
   - `/*` → frontend target group (port 80)

4. Update `app.js`: change `API` to use relative paths (just `/api`) since both are behind the same ALB.

5. Your entire site runs on a single ALB URL.

---

## Quick Reference

| Component | Local | EB | Fargate |
|-----------|-------|----|---------|
| Frontend  | `python3 -m http.server 8080` | S3 + CloudFront | ECS Service (nginx container) |
| Backend   | `npm start` (port 3000) | EB Node.js platform | ECS Service (node container) |
| Cost      | Free | Low (t3.micro) | Pay per usage |

---

## Next Steps
- **Stage 2:** Convert frontend to React for a more realistic production setup
- Add a custom domain with Route 53
- Add HTTPS with ACM certificates
