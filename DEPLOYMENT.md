# MacroVision AI — Deployment Guide

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Variables](#environment-variables)
3. [Local Development](#local-development)
4. [Running Tests](#running-tests)
5. [Docker Build](#docker-build)
6. [Railway (Staging)](#railway-staging)
7. [AWS ECS (Production)](#aws-ecs-production)
8. [Mobile Builds (EAS)](#mobile-builds-eas)
9. [Post-Deploy Checklist](#post-deploy-checklist)

---

## 1. Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 20 LTS | `nvm install 20` |
| Docker + Compose | ≥ 25 | [docker.com](https://docker.com) |
| Railway CLI | latest | `npm i -g @railway/cli` |
| AWS CLI | ≥ 2 | [aws.amazon.com/cli](https://aws.amazon.com/cli) |
| EAS CLI | latest | `npm i -g eas-cli` |
| Prisma CLI | bundled | `npx prisma` |

---

## 2. Environment Variables

Copy `.env.example` to `.env` at the monorepo root and fill in all values:

```bash
cp .env.example .env
```

### Required secrets (never commit these):

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | ≥ 32 random chars (`openssl rand -hex 32`) |
| `JWT_REFRESH_SECRET` | ≥ 32 random chars |
| `OPENAI_API_KEY` | OpenAI API key (GPT-4o access required) |
| `GEMINI_API_KEY` | Google AI Studio API key |
| `AWS_ACCESS_KEY_ID` | IAM user with S3 PutObject/GetObject |
| `AWS_SECRET_ACCESS_KEY` | IAM secret |
| `AWS_S3_BUCKET` | S3 bucket name |
| `STRIPE_SECRET_KEY` | Stripe secret key (sk_live_...) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `NEXTAUTH_SECRET` | ≥ 32 random chars (admin panel) |

---

## 3. Local Development

```bash
# Install all dependencies
npm install

# Start infrastructure (PostgreSQL, Redis)
docker compose up -d postgres redis

# Run migrations and seed
cd apps/backend
npx prisma migrate dev
npx ts-node prisma/seed.ts
cd ../..

# Start all services in parallel
npm run dev
# Or individually:
npm run dev --workspace=apps/backend   # :3000
npm run dev --workspace=apps/admin     # :3001
npm run dev --workspace=apps/mobile    # Expo dev server
```

### Default seeded users:

| Email | Password | Role |
|-------|----------|------|
| `admin@macrovision.ai` | `Admin1234!` | SUPER_ADMIN |
| `demo@macrovision.ai` | `Demo1234!` | USER |

---

## 4. Running Tests

### Backend

```bash
cd apps/backend

# Unit tests
npm test

# Unit tests with coverage
npm run test:cov

# E2E tests (requires running PostgreSQL)
DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:5432/macrovision_test \
  npm run test:e2e
```

### Mobile

```bash
cd apps/mobile

# All tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm test -- --coverage
```

### Admin

```bash
cd apps/admin
npm run type-check  # TypeScript check
npm run lint
```

### CI (all at once)

```bash
# From monorepo root
npm run test --workspaces
npm run type-check --workspaces
npm run lint --workspaces
```

---

## 5. Docker Build

### Build images locally

```bash
# Backend
docker build -f apps/backend/Dockerfile \
  --target production \
  -t macrovision-backend:latest \
  apps/backend

# Verify
docker run --rm macrovision-backend:latest node -e "console.log('ok')"
```

### Full stack with Docker Compose

```bash
# Development
docker compose up --build

# Production (requires .env with production values)
docker compose -f docker-compose.prod.yml up --build -d

# View logs
docker compose logs -f backend
```

---

## 6. Railway (Staging)

### Initial setup

```bash
# Login
railway login

# Link to project
railway link

# Set environment variables
railway variables set \
  DATABASE_URL="postgresql://..." \
  REDIS_URL="redis://..." \
  JWT_SECRET="$(openssl rand -hex 32)" \
  JWT_REFRESH_SECRET="$(openssl rand -hex 32)" \
  OPENAI_API_KEY="sk-..." \
  NODE_ENV="production"
```

### Deploy

```bash
# Deploy backend
railway up --service backend

# Deploy admin
railway up --service admin

# Run migrations after deploy
railway run --service backend npx prisma migrate deploy
```

### Environment-specific Railway services

| Service | Port | Dockerfile |
|---------|------|------------|
| `backend` | 3000 | `apps/backend/Dockerfile` |
| `admin` | 3001 | `apps/admin` (Next.js) |
| `postgres` | 5432 | Railway managed |
| `redis` | 6379 | Railway managed |

---

## 7. AWS ECS (Production)

### One-time setup

```bash
# Configure AWS credentials
aws configure

# Create ECR repositories
aws ecr create-repository --repository-name macrovision/backend --region us-east-1
aws ecr create-repository --repository-name macrovision/admin --region us-east-1

# Create ECS cluster
aws ecs create-cluster --cluster-name macrovision-prod
```

### Build and push Docker images

```bash
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_REGION=us-east-1
export ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# Authenticate
aws ecr get-login-password --region $AWS_REGION | \
  docker login --username AWS --password-stdin $ECR_URI

# Build and push backend
docker build -f apps/backend/Dockerfile --target production \
  -t macrovision-backend:latest apps/backend

docker tag macrovision-backend:latest $ECR_URI/macrovision/backend:latest
docker push $ECR_URI/macrovision/backend:latest

# Build and push admin
docker build -f apps/admin/Dockerfile \
  -t macrovision-admin:latest apps/admin

docker tag macrovision-admin:latest $ECR_URI/macrovision/admin:latest
docker push $ECR_URI/macrovision/admin:latest
```

### Deploy with ECS

```bash
# Update ECS service (triggers rolling deployment)
aws ecs update-service \
  --cluster macrovision-prod \
  --service macrovision-backend \
  --force-new-deployment

# Wait for stability
aws ecs wait services-stable \
  --cluster macrovision-prod \
  --services macrovision-backend

# Run migrations in a one-off task
aws ecs run-task \
  --cluster macrovision-prod \
  --task-definition macrovision-migrate \
  --overrides '{"containerOverrides":[{"name":"backend","command":["npx","prisma","migrate","deploy"]}]}'
```

### Required AWS resources

- **RDS** (PostgreSQL 16) — `db.t3.medium` minimum
- **ElastiCache** (Redis 7) — `cache.t3.micro`
- **S3 Bucket** — with CloudFront CDN
- **ALB** — Application Load Balancer with SSL termination
- **ACM** — SSL certificate for your domain
- **Parameter Store** — Store secrets (DATABASE_URL, JWT_SECRET, etc.)
- **ECR** — Container registry

### ECS Task Definition (backend excerpt)

```json
{
  "family": "macrovision-backend",
  "cpu": "512",
  "memory": "1024",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "containerDefinitions": [{
    "name": "backend",
    "image": "${ECR_URI}/macrovision/backend:latest",
    "portMappings": [{"containerPort": 3000}],
    "healthCheck": {
      "command": ["CMD-SHELL", "wget -qO- http://localhost:3000/health || exit 1"],
      "interval": 30,
      "timeout": 5,
      "retries": 3
    },
    "secrets": [
      {"name": "DATABASE_URL", "valueFrom": "arn:aws:ssm:...:parameter/macrovision/DATABASE_URL"},
      {"name": "JWT_SECRET", "valueFrom": "arn:aws:ssm:...:parameter/macrovision/JWT_SECRET"}
    ]
  }]
}
```

---

## 8. Mobile Builds (EAS)

### Setup

```bash
cd apps/mobile

# Login to Expo
eas login

# Configure project (first time)
eas build:configure
```

### Build for development (TestFlight / internal testing)

```bash
# iOS simulator build
eas build --platform ios --profile development

# Android APK
eas build --platform android --profile development
```

### Build for production

```bash
# iOS (App Store)
eas build --platform ios --profile production

# Android (Google Play)
eas build --platform android --profile production

# Both simultaneously
eas build --platform all --profile production
```

### Submit to stores

```bash
# Submit to App Store Connect
eas submit --platform ios --latest

# Submit to Google Play
eas submit --platform android --latest
```

### Required EAS secrets (set via `eas secret:create`)

```bash
eas secret:create --name EXPO_PUBLIC_API_URL --value "https://api.macrovision.ai"
eas secret:create --name EXPO_PUBLIC_STRIPE_MONTHLY_PRICE_ID --value "price_..."
eas secret:create --name EXPO_PUBLIC_STRIPE_ANNUAL_PRICE_ID --value "price_..."
```

### `eas.json` profiles

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "ios": { "simulator": true }
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {
      "ios": { "appleId": "your@apple.id", "ascAppId": "YOUR_APP_ID" },
      "android": { "serviceAccountKeyPath": "./google-service-account.json" }
    }
  }
}
```

---

## 9. Post-Deploy Checklist

### Backend
- [ ] `GET /health` returns `{ status: "ok" }`
- [ ] `POST /api/v1/auth/register` creates a user
- [ ] `POST /api/v1/auth/login` returns JWT tokens
- [ ] Stripe webhook endpoint reachable (`POST /api/v1/subscriptions/webhook`)
- [ ] S3 image upload works
- [ ] OpenAI analysis returns results
- [ ] Redis caching active (check logs for cache hits)
- [ ] Prisma migrations are up to date (`npx prisma migrate status`)

### Admin
- [ ] Login page accessible at `https://admin.macrovision.ai/login`
- [ ] Admin credentials work
- [ ] Dashboard metrics load
- [ ] Users table paginates

### Mobile
- [ ] App connects to production API
- [ ] Login / register flow works
- [ ] Camera analysis completes in < 30s
- [ ] Push notification token registers
- [ ] Stripe checkout opens in browser

### DNS / SSL
- [ ] `api.macrovision.ai` → ALB / Railway service
- [ ] `admin.macrovision.ai` → Next.js admin
- [ ] SSL certificates valid (not self-signed)
- [ ] HSTS enabled (`Strict-Transport-Security` header)

### Monitoring
- [ ] Health check endpoint configured in load balancer
- [ ] CloudWatch / Railway logs streaming
- [ ] Uptime monitor configured (e.g., Better Uptime)
- [ ] Error tracking configured (e.g., Sentry)

---

## Stripe Webhook Setup

1. In [Stripe Dashboard](https://dashboard.stripe.com/webhooks) → Add endpoint
2. URL: `https://api.macrovision.ai/api/v1/subscriptions/webhook`
3. Events to listen:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
4. Copy signing secret → set as `STRIPE_WEBHOOK_SECRET` env var

---

## Rollback

```bash
# Railway — rollback to previous deployment
railway rollback --service backend

# AWS ECS — rollback to previous task definition revision
aws ecs update-service \
  --cluster macrovision-prod \
  --service macrovision-backend \
  --task-definition macrovision-backend:PREVIOUS_REVISION
```
