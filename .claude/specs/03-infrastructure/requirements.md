# Feature: Infrastructure & Deployment

## Overview
Setup production-ready infrastructure including Docker, Kubernetes, Terraform,
and CI/CD pipelines.

---

## Docker Configuration

### Dockerfile Requirements

**Multi-stage build with 3 stages:**

1. **Development Stage**
   - Full Node.js image
   - All dev dependencies
   - Hot reload support
   - Debug capabilities

2. **Build Stage**
   - Compile TypeScript
   - Run tests
   - Generate Prisma client

3. **Production Stage**
   - Alpine-based minimal image
   - Only production dependencies
   - Non-root user
   - Health check

**Security Requirements:**
- Use specific Node.js version tag (node:20-alpine)
- Run as non-root user (node)
- No shell in production image
- Read-only filesystem where possible

### docker-compose.yml

**Services:**
- app: Main application
- db: PostgreSQL 16
- db-test: PostgreSQL for tests (separate)

**Features:**
- Volume for database persistence
- Health checks
- Environment variable management
- Network isolation

---

## Kubernetes Configuration

### Required Manifests

1. **namespace.yaml**
   - Dedicated namespace: `refacil-wallet`

2. **configmap.yaml**
   - Non-sensitive configuration
   - LOG_LEVEL, NODE_ENV, PORT

3. **secret.yaml** (template)
   - DATABASE_URL placeholder
   - Fraud detection thresholds (if sensitive)

4. **deployment.yaml**
   - Replicas: 3 (configurable)
   - Resource limits and requests
   - Readiness probe: /health
   - Liveness probe: /health
   - Rolling update strategy
   - Pod anti-affinity for HA

5. **service.yaml**
   - ClusterIP type
   - Port 3000

6. **hpa.yaml**
   - Min replicas: 2
   - Max replicas: 10
   - Target CPU: 70%
   - Target Memory: 80%

7. **ingress.yaml** (optional)
   - NGINX ingress
   - TLS termination
   - Rate limiting annotations

8. **network-policy.yaml**
   - Ingress from ingress controller only
   - Egress to database only

### Resource Specifications

```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "100m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

### Health Probes

```yaml
readinessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 5
  failureThreshold: 3

livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10
  failureThreshold: 3
```

---

## Terraform Configuration

### AWS Infrastructure

**VPC Module:**
- VPC with CIDR 10.0.0.0/16
- 3 public subnets (for ALB)
- 3 private subnets (for EKS nodes and RDS)
- NAT Gateway for private subnet egress
- Internet Gateway for public subnets

**EKS Module:**
- Kubernetes version: 1.29
- Managed node groups
- Node instance type: t3.medium
- Min nodes: 2, Max nodes: 6
- Cluster autoscaler enabled

**RDS Module:**
- PostgreSQL 16
- Instance class: db.t3.medium
- Multi-AZ: true (production)
- Automated backups: 7 days
- Encryption at rest: enabled
- Private subnets only

**ECR Module:**
- Repository for container images
- Image scanning on push
- Lifecycle policy (keep last 10 images)

**IAM Module:**
- EKS cluster role
- EKS node role
- Service account roles (IRSA)

**Security Groups:**
- ALB: 80, 443 from internet
- EKS nodes: All from ALB SG
- RDS: 5432 from EKS nodes SG only

### File Structure

```
terraform/
├── main.tf           # Provider and backend config
├── variables.tf      # Input variables
├── outputs.tf        # Output values
├── providers.tf      # Provider configuration
├── vpc.tf            # VPC resources
├── eks.tf            # EKS cluster
├── rds.tf            # RDS PostgreSQL
├── ecr.tf            # ECR repository
├── iam.tf            # IAM roles and policies
├── security-groups.tf # Security groups
└── terraform.tfvars.example
```

### Backend Configuration

```hcl
terraform {
  backend "s3" {
    bucket         = "refacil-terraform-state"
    key            = "wallet/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-locks"
  }
}
```

---

## CI/CD Configuration

### GitHub Actions Workflows

**1. ci.yml (Pull Requests)**

Triggers: push to feature branches, pull requests

Jobs:
1. **lint** - Run ESLint
2. **test** - Run unit tests
3. **build** - Verify Docker build
4. **security** - Run Trivy scan

```yaml
name: CI
on:
  push:
    branches: [develop, feature/*]
  pull_request:
    branches: [main, develop]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_PASSWORD: test
          POSTGRES_DB: test
        ports:
          - 5432:5432
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run test:cov
      - uses: codecov/codecov-action@v3

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t wallet:test .

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          severity: 'CRITICAL,HIGH'
```

**2. cd-staging.yml (Deploy to Staging)**

Triggers: push to develop

Jobs:
1. Build and push to ECR
2. Update Kubernetes deployment (staging)
3. Run smoke tests

**3. cd-production.yml (Deploy to Production)**

Triggers: push to main (after approval)

Jobs:
1. Build and push to ECR
2. Update Kubernetes deployment (production)
3. Run smoke tests
4. Rollback on failure

---

## Environment Configuration

### Development (.env.development)
```
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/wallet_dev
LOG_LEVEL=debug
FRAUD_AMOUNT_THRESHOLD=10000
FRAUD_VELOCITY_WINDOW_MINUTES=5
FRAUD_VELOCITY_MAX_TRANSACTIONS=10
```

### Test (.env.test)
```
NODE_ENV=test
DATABASE_URL=postgresql://postgres:test@localhost:5433/wallet_test
LOG_LEVEL=error
```

### Production (via K8s secrets)
```
NODE_ENV=production
PORT=3000
DATABASE_URL=<from-secret>
LOG_LEVEL=info
```
