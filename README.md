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

## 1.5. Run with Docker Locally

Test the Dockerfiles before pushing to any cloud.

### Backend
```bash
cd backend
docker build -t pokemon-backend .
docker run -d -p 3000:3000 --name pokemon-backend pokemon-backend
```
Verify: `curl http://localhost:3000/api/types` — should return a JSON array of Pokémon types.

### Frontend
```bash
cd frontend
docker build -t pokemon-frontend .
docker run -d -p 8080:80 --name pokemon-frontend pokemon-frontend
```
Verify:  `curl http://localhost:8080` — you should see the Pokédex page. API calls will work since the frontend calls `localhost:3000` where the backend container is running.

### Both at once with Docker Compose (optional)

Create a `docker-compose.yml` in the project root:
```yaml
services:
  backend:
    build: ./backend
    ports:
      - "3000:3000"
  frontend:
    build: ./frontend
    ports:
      - "8080:80"
    depends_on:
      - backend
```

Then:
```bash
docker compose up -d      # start both
docker compose ps         # check status
docker compose logs -f    # watch logs
docker compose down       # stop and remove
```

### Useful Docker commands
```bash
docker ps                              # list running containers
docker logs pokemon-backend            # check backend logs
docker logs pokemon-frontend           # check frontend logs
docker stop pokemon-backend pokemon-frontend    # stop both
docker rm pokemon-backend pokemon-frontend      # remove both
```

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

### Option B: Single Elastic Beanstalk (Frontend + Backend Together)

Serve both from one EB environment by having Express serve the frontend static files.

**Step 1: Create a deployment folder**
```bash
mkdir eb-deploy
cp backend/server.js backend/package.json eb-deploy/
cp -r frontend eb-deploy/public
```

**Step 2: Update `eb-deploy/public/app.js`** — change the API URL to a relative path:
```js
const API = '/api';
```

**Step 3: Add static file serving to `eb-deploy/server.js`**

Add this line right after `app.use(cors());`:
```js
app.use(express.static('public'));
```

**Step 4: Create a Procfile** (optional but recommended):
```bash
echo "web: node server.js" > eb-deploy/Procfile
```

**Step 5: Zip and deploy**
```bash
cd eb-deploy
zip -r ../pokemon-app.zip .
```

**Step 6: Deploy to Elastic Beanstalk**
1. Go to AWS Console → Elastic Beanstalk → Create Application
2. Application name: `pokemon-website`
3. Platform: **Node.js**
4. Upload the `pokemon-app.zip` file
5. Click **Create environment**

**Step 7: Visit your site**

EB gives you a URL like `http://pokemon-website.us-east-1.elasticbeanstalk.com` — both the frontend and API are served from the same origin.

**Using EB CLI (alternative):**
```bash
cd eb-deploy
eb init -p node.js pokemon-website
eb create pokemon-env
eb open
```

---

### Option C: CloudFront + S3 (Frontend) + Fargate (Backend)

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

### Option D: Both Frontend & Backend on ECS Fargate

Run both as separate Fargate services behind the same ALB. Everything accessible on a single URL.

**Prerequisites:**
- AWS CLI installed and configured (`aws configure`)
- Docker installed and running locally
- Your AWS Account ID (run `aws sts get-caller-identity --query Account --output text`)

Set these variables for the steps below (replace with your values):
```bash
AWS_REGION=us-east-1
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
```

---

**Step 1: Update the frontend API URL**

Edit `frontend/app.js` — change the first line to use a relative path:
```js
const API = '/api';
```
This works because both frontend and backend will be behind the same ALB.

---

**Step 2: Create ECR repositories**
```bash
aws ecr create-repository --repository-name pokemon-frontend --region $AWS_REGION
aws ecr create-repository --repository-name pokemon-backend --region $AWS_REGION
```

---

**Step 3: Authenticate Docker with ECR**
```bash
aws ecr get-login-password --region $ACCOUNT_ID \
| docker login \
  --username AWS \
  --password-stdin $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
```

---

**Step 4: Build and push the backend image**
```bash
cd backend
docker build --platform linux/amd64 -t pokemon-backend .
docker tag pokemon-backend:latest $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/pokemon-backend:latest
docker push $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/pokemon-backend:latest
cd ..
```

---

**Step 5: Build and push the frontend image**
```bash
cd frontend
docker build --platform linux/amd64 -t pokemon-frontend .
docker tag pokemon-frontend:latest $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/pokemon-frontend:latest
docker push $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/pokemon-frontend:latest
cd ..
```

> Note: `--platform linux/amd64` is needed if you're building on an Apple Silicon Mac.

---

**Step 6: Create an ECS cluster**
```bash
aws ecs create-cluster --cluster-name pokemon-cluster --region $AWS_REGION
```

---

**Step 7: Create an IAM role for ECS task execution**

Skip this if you already have an `ecsTaskExecutionRole`.

```bash
# Create the trust policy
cat > ecs-trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "ecs-tasks.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
EOF

# Create the role and attach the managed policy
aws iam create-role \
  --role-name ecsTaskExecutionRole \
  --assume-role-policy-document file://ecs-trust-policy.json

aws iam attach-role-policy \
  --role-name ecsTaskExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

rm ecs-trust-policy.json
```

---

**Step 8: Create task definitions**

Backend task definition:
```bash
cat > backend-task.json << EOF
{
  "family": "pokemon-backend",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::${ACCOUNT_ID}:role/ecsTaskExecutionRole",
  "containerDefinitions": [{
    "name": "pokemon-backend",
    "image": "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/pokemon-backend:latest",
    "portMappings": [{ "containerPort": 3000, "protocol": "tcp" }],
    "essential": true,
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/pokemon-backend",
        "awslogs-region": "${AWS_REGION}",
        "awslogs-stream-prefix": "ecs",
        "awslogs-create-group": "true"
      }
    }
  }]
}
EOF

aws ecs register-task-definition --cli-input-json file://backend-task.json --region $AWS_REGION
```

Frontend task definition:
```bash
cat > frontend-task.json << EOF
{
  "family": "pokemon-frontend",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::${ACCOUNT_ID}:role/ecsTaskExecutionRole",
  "containerDefinitions": [{
    "name": "pokemon-frontend",
    "image": "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/pokemon-frontend:latest",
    "portMappings": [{ "containerPort": 80, "protocol": "tcp" }],
    "essential": true,
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/pokemon-frontend",
        "awslogs-region": "${AWS_REGION}",
        "awslogs-stream-prefix": "ecs",
        "awslogs-create-group": "true"
      }
    }
  }]
}
EOF

aws ecs register-task-definition --cli-input-json file://frontend-task.json --region $AWS_REGION
```

---

**Step 9: Get your VPC, subnets, and create a security group**

```bash
# Get default VPC
VPC_ID=$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true \
  --query 'Vpcs[0].VpcId' --output text --region $AWS_REGION)

# Get subnets (need at least 2 for ALB)
SUBNETS=$(aws ec2 describe-subnets --filters Name=vpc-id,Values=$VPC_ID \
  --query 'Subnets[*].SubnetId' --output text --region $AWS_REGION)
SUBNET_1=$(echo $SUBNETS | awk '{print $1}')
SUBNET_2=$(echo $SUBNETS | awk '{print $2}')

# Create security group allowing HTTP traffic
SG_ID=$(aws ec2 create-security-group \
  --group-name pokemon-ecs-sg \
  --description "Pokemon ECS services" \
  --vpc-id $VPC_ID \
  --query 'GroupId' --output text --region $AWS_REGION)

# Allow inbound HTTP (port 80) from anywhere
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID --protocol tcp --port 80 --cidr 0.0.0.0/0 --region $AWS_REGION

# Allow all traffic within the security group (ALB → containers)
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID --protocol tcp --port 0-65535 --source-group $SG_ID --region $AWS_REGION
```

---

**Step 10: Create an Application Load Balancer**

```bash
# Create ALB
ALB_ARN=$(aws elbv2 create-load-balancer \
  --name pokemon-alb \
  --subnets $SUBNET_1 $SUBNET_2 \
  --security-groups $SG_ID \
  --scheme internet-facing \
  --type application \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text --region $AWS_REGION)

# Create target group for frontend (port 80)
FE_TG_ARN=$(aws elbv2 create-target-group \
  --name pokemon-frontend-tg \
  --protocol HTTP --port 80 \
  --vpc-id $VPC_ID \
  --target-type ip \
  --health-check-path "/" \
  --query 'TargetGroups[0].TargetGroupArn' --output text --region $AWS_REGION)

# Create target group for backend (port 3000)
BE_TG_ARN=$(aws elbv2 create-target-group \
  --name pokemon-backend-tg \
  --protocol HTTP --port 3000 \
  --vpc-id $VPC_ID \
  --target-type ip \
  --health-check-path "/api/types" \
  --query 'TargetGroups[0].TargetGroupArn' --output text --region $AWS_REGION)
```

---

**Step 11: Create ALB listener with path-based routing**

```bash
# Create listener — default action sends to frontend
LISTENER_ARN=$(aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTP --port 80 \
  --default-actions Type=forward,TargetGroupArn=$FE_TG_ARN \
  --query 'Listeners[0].ListenerArn' --output text --region $AWS_REGION)

# Add rule: /api/* goes to backend
aws elbv2 create-rule \
  --listener-arn $LISTENER_ARN \
  --priority 10 \
  --conditions Field=path-pattern,Values='/api/*' \
  --actions Type=forward,TargetGroupArn=$BE_TG_ARN \
  --region $AWS_REGION
```

---

**Step 12: Create ECS services**

```bash
# Backend service
aws ecs create-service \
  --cluster pokemon-cluster \
  --service-name pokemon-backend \
  --task-definition pokemon-backend \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_1,$SUBNET_2],securityGroups=[$SG_ID],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=$BE_TG_ARN,containerName=pokemon-backend,containerPort=3000" \
  --region $AWS_REGION

# Frontend service
aws ecs create-service \
  --cluster pokemon-cluster \
  --service-name pokemon-frontend \
  --task-definition pokemon-frontend \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_1,$SUBNET_2],securityGroups=[$SG_ID],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=$FE_TG_ARN,containerName=pokemon-frontend,containerPort=80" \
  --region $AWS_REGION
```

---

**Step 13: Get your ALB URL and visit the site**

```bash
aws elbv2 describe-load-balancers --names pokemon-alb \
  --query 'LoadBalancers[0].DNSName' --output text --region $AWS_REGION
```

Open `http://<alb-dns-name>` in your browser. Give it 2-3 minutes for the tasks to start and pass health checks.

---

**Troubleshooting:**
```bash
# Check if tasks are running
aws ecs list-tasks --cluster pokemon-cluster --region $AWS_REGION

# Check task status (use task ARN from above)
aws ecs describe-tasks --cluster pokemon-cluster --tasks <task-arn> --region $AWS_REGION

# Check target group health
aws elbv2 describe-target-health --target-group-arn $FE_TG_ARN --region $AWS_REGION
aws elbv2 describe-target-health --target-group-arn $BE_TG_ARN --region $AWS_REGION

# Check container logs
aws logs tail /ecs/pokemon-backend --region $AWS_REGION
aws logs tail /ecs/pokemon-frontend --region $AWS_REGION
```

**Cleanup (to avoid charges):**
```bash
aws ecs update-service --cluster pokemon-cluster --service pokemon-backend --desired-count 0 --region $AWS_REGION
aws ecs update-service --cluster pokemon-cluster --service pokemon-frontend --desired-count 0 --region $AWS_REGION
aws ecs delete-service --cluster pokemon-cluster --service pokemon-backend --force --region $AWS_REGION
aws ecs delete-service --cluster pokemon-cluster --service pokemon-frontend --force --region $AWS_REGION
aws ecs delete-cluster --cluster pokemon-cluster --region $AWS_REGION
aws elbv2 delete-listener --listener-arn $LISTENER_ARN --region $AWS_REGION
aws elbv2 delete-target-group --target-group-arn $FE_TG_ARN --region $AWS_REGION
aws elbv2 delete-target-group --target-group-arn $BE_TG_ARN --region $AWS_REGION
aws elbv2 delete-load-balancer --load-balancer-arn $ALB_ARN --region $AWS_REGION
aws ecr delete-repository --repository-name pokemon-frontend --force --region $AWS_REGION
aws ecr delete-repository --repository-name pokemon-backend --force --region $AWS_REGION
aws ec2 delete-security-group --group-id $SG_ID --region $AWS_REGION
```

---

### Option E: Single EC2 Instance (Frontend + Backend)

Run everything on one EC2 instance using Nginx as a reverse proxy.

**Step 1: Launch an EC2 Instance**
1. Go to AWS Console → EC2 → Launch Instance
2. Choose **Amazon Linux 2023** or **Ubuntu 22.04** AMI
3. Instance type: **t2.micro** (free tier eligible)
4. Create or select a key pair for SSH access
5. Security Group — allow these inbound rules:
   - SSH (port 22) — your IP
   - HTTP (port 80) — `0.0.0.0/0`
   - HTTPS (port 443) — `0.0.0.0/0` (optional, for later)
6. Launch the instance and note the **Public IP**

**Step 2: SSH into the Instance**
```bash
ssh -i your-key.pem ec2-user@<your-ec2-public-ip>
# Use ubuntu@ instead of ec2-user@ if you chose Ubuntu
```

**Step 3: Install Node.js and Nginx**

Amazon Linux 2023:
```bash
sudo dnf update -y
sudo dnf install -y nginx
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo dnf install -y nodejs
```

Ubuntu:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

**Step 4: Upload the Project**
```bash
# From your local machine:
scp -i your-key.pem -r pokemon-website/ ec2-user@<your-ec2-public-ip>:~/
```

**Step 5: Set Up the Backend**
```bash
cd ~/pokemon-website/backend
npm install
```

Install PM2 to keep the backend running:
```bash
sudo npm install -g pm2
pm2 start server.js --name pokemon-backend
pm2 startup   # follow the printed command to enable on reboot
pm2 save
```

**Step 6: Update the Frontend API URL**

Edit `frontend/app.js` — change the first line:
```js
const API = '/api';
```
This uses a relative path since Nginx will proxy `/api` requests to the backend.

**Step 7: Deploy Frontend Files**
```bash
sudo mkdir -p /var/www/pokemon
sudo cp ~/pokemon-website/frontend/* /var/www/pokemon/
```

**Step 8: Configure Nginx**
```bash
sudo tee /etc/nginx/conf.d/pokemon.conf > /dev/null <<'EOF'
server {
    listen 80;
    server_name _;

    root /var/www/pokemon;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
EOF
```

Remove the default config if it conflicts:
```bash
# Amazon Linux:
sudo rm -f /etc/nginx/conf.d/default.conf
# Ubuntu:
sudo rm -f /etc/nginx/sites-enabled/default
```

Start Nginx:
```bash
sudo systemctl restart nginx
sudo systemctl enable nginx
```

**Step 9: Visit Your Site**

Open `http://<your-ec2-public-ip>` in a browser — both frontend and backend are served through port 80.

---

## Quick Reference

| Component | Local | EB (split) | EB (single) | Fargate | EC2 |
|-----------|-------|------------|-------------|---------|-----|
| Frontend  | `python3 -m http.server 8080` | S3 + CloudFront | Express static | ECS Service (nginx) | Nginx static files |
| Backend   | `npm start` (port 3000) | EB Node.js | Same EB app | ECS Service (node) | PM2 + Node.js |
| Cost      | Free | Low | Lowest | Pay per usage | Low (free tier) |

---

## Next Steps
- **Stage 2:** Convert frontend to React for a more realistic production setup
- Add a custom domain with Route 53
- Add HTTPS with ACM certificates
