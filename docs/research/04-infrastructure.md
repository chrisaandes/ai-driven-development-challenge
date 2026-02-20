# Infrastructure Research: Kubernetes & Terraform Deployment Patterns for Financial Microservices

**Project**: Refacil Wallet - Digital Wallet Microservice
**Author**: devops-researcher agent
**Date**: 2026-02-20
**Status**: Research Complete

---

## Table of Contents

1. [Docker Multi-Stage Build for Node.js](#1-docker-multi-stage-build-for-nodejs)
2. [HPA Configuration for Transaction Spikes](#2-hpa-configuration-for-transaction-spikes)
3. [Health Checks and Readiness Probes](#3-health-checks-and-readiness-probes)
4. [Secrets Management in Kubernetes](#4-secrets-management-in-kubernetes)
5. [Zero-Downtime Deployments](#5-zero-downtime-deployments)
6. [AWS RDS + EKS Best Practices](#6-aws-rds--eks-best-practices)
7. [Terraform Module Structure](#7-terraform-module-structure)
8. [GitHub Actions CI/CD Pipeline](#8-github-actions-cicd-pipeline)
9. [Recommendations for This Project](#9-recommendations-for-this-project)

---

## 1. Docker Multi-Stage Build for Node.js

### 1.1 Optimized Dockerfile for NestJS

A multi-stage build separates the build environment from the runtime environment, producing smaller and more secure images. For a financial microservice, image size, attack surface, and reproducibility are critical.

```dockerfile
# ============================================================
# Stage 1: Dependencies (cached layer for faster rebuilds)
# ============================================================
FROM node:20-alpine AS dependencies

# Security: add non-root user early
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

WORKDIR /app

# Copy only package files first for layer caching
COPY package.json package-lock.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci --ignore-scripts && \
    npm cache clean --force

# ============================================================
# Stage 2: Build (compile TypeScript, generate Prisma client)
# ============================================================
FROM dependencies AS build

WORKDIR /app

# Copy Prisma schema first (for prisma generate caching)
COPY prisma ./prisma/

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src/

# Build the NestJS application
RUN npm run build

# Prune dev dependencies after build
RUN npm prune --production

# ============================================================
# Stage 3: Production (minimal runtime image)
# ============================================================
FROM node:20-alpine AS production

# Labels for image metadata
LABEL maintainer="Refacil Engineering"
LABEL description="Refacil Wallet Microservice"
LABEL version="1.0.0"

# Security: install dumb-init for proper signal handling
# dumb-init ensures SIGTERM is forwarded correctly to Node.js
RUN apk add --no-cache dumb-init

# Security: create non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

WORKDIR /app

# Copy production dependencies from build stage
COPY --from=build --chown=appuser:appgroup /app/node_modules ./node_modules/

# Copy compiled application
COPY --from=build --chown=appuser:appgroup /app/dist ./dist/

# Copy Prisma client and schema (needed at runtime)
COPY --from=build --chown=appuser:appgroup /app/prisma ./prisma/
COPY --from=build --chown=appuser:appgroup /app/node_modules/.prisma ./node_modules/.prisma/

# Copy package.json for metadata (npm scripts, version info)
COPY --from=build --chown=appuser:appgroup /app/package.json ./

# Environment defaults
ENV NODE_ENV=production
ENV PORT=3000

# Expose application port
EXPOSE 3000

# Switch to non-root user
USER appuser

# Health check: verify the container is responding
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Use dumb-init as PID 1 for proper signal forwarding
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/main.js"]
```

### 1.2 Why Alpine-Based Images

| Image Base        | Size (approx.) | Attack Surface | Use Case               |
|-------------------|----------------|----------------|------------------------|
| `node:20`         | ~1.1 GB        | High           | Development only       |
| `node:20-slim`    | ~240 MB        | Medium         | Acceptable for prod    |
| `node:20-alpine`  | ~180 MB        | Low            | Recommended for prod   |
| `distroless`      | ~130 MB        | Minimal        | Maximum security       |

Alpine is recommended for this project because it balances minimal size with the ability to include essential tools like `wget` for health checks. Distroless would be even more secure but makes debugging harder and does not include a shell.

### 1.3 Non-Root User Configuration

Running as root inside a container is a security risk. If an attacker escapes the container, they would have root privileges on the host. Key points:

- Create a dedicated user and group with specific UID/GID (1001) for predictability.
- Use `--chown` on `COPY` instructions so files are owned by the app user.
- Switch to the non-root user with `USER` instruction before `CMD`.
- The `node` user that ships with official Node.js images (UID 1000) is also acceptable but a custom user provides more control.

### 1.4 Layer Caching Optimization

Docker builds layers from top to bottom. Layers that change less frequently should come first:

```
Layer 1: Base image (changes rarely)
Layer 2: System packages like dumb-init (changes rarely)
Layer 3: package.json + package-lock.json (changes when deps change)
Layer 4: npm ci (rebuilds only when Layer 3 changes)
Layer 5: Prisma schema (changes when schema changes)
Layer 6: prisma generate (rebuilds only when Layer 5 changes)
Layer 7: Source code (changes most frequently)
Layer 8: npm run build (rebuilds when Layer 7 changes)
```

This ordering means that a source code change only rebuilds layers 7-8 while reusing the cached dependency layers 1-6.

### 1.5 .dockerignore Best Practices

```dockerignore
# Version control
.git
.gitignore

# Dependencies (installed fresh in container)
node_modules

# Build output (built fresh in container)
dist

# Development files
.env
.env.*
*.md
docs/
.vscode/
.idea/

# Testing
test/
**/*.spec.ts
**/*.test.ts
coverage/
jest.config.*

# CI/CD
.github/
.gitlab-ci.yml

# Infrastructure (not needed in app image)
terraform/
k8s/
docker-compose*.yml
Dockerfile*

# OS files
.DS_Store
Thumbs.db

# Claude/AI development files
.claude/
CLAUDE.md
```

### 1.6 Image Scanning Considerations

For a financial microservice, image scanning is not optional. Integrate scanning at multiple stages:

- **Build Time**: Use `trivy image` or `docker scout` in CI to scan before pushing to registry.
- **Registry Level**: Enable ECR image scanning on push (Amazon ECR supports both basic and enhanced scanning).
- **Runtime**: Use admission controllers in Kubernetes (e.g., Kyverno, OPA Gatekeeper) to block deployment of images with critical vulnerabilities.

```bash
# Scan with Trivy in CI
trivy image --severity CRITICAL,HIGH --exit-code 1 \
  --ignore-unfixed refacil-wallet:latest

# Amazon ECR enhanced scanning (in Terraform)
# Covered in Section 7
```

---

## 2. HPA Configuration for Transaction Spikes

### 2.1 Understanding the Scaling Requirements

The Refacil Wallet targets 1000 TPS peak with 99.9% availability. Node.js is single-threaded, meaning each pod can handle a limited number of concurrent requests before event loop lag increases. For a database-bound workload like transaction processing (< 200ms p99), each Node.js pod can typically handle 100-200 concurrent requests before performance degrades, depending on database latency.

**Capacity Planning Estimate**:

| Parameter                          | Value     |
|------------------------------------|-----------|
| Target TPS                         | 1,000     |
| Average request duration           | ~50ms     |
| Concurrent requests per pod        | ~150      |
| Pods needed for 1000 TPS           | ~7-10     |
| Safety margin (30%)                | ~10-13    |
| Recommended max replicas           | 15        |
| Minimum replicas (baseline)        | 3         |

### 2.2 Horizontal Pod Autoscaler Manifest

```yaml
# k8s/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: refacil-wallet-hpa
  namespace: refacil-wallet
  labels:
    app: refacil-wallet
    component: autoscaler
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: refacil-wallet
  minReplicas: 3
  maxReplicas: 15
  metrics:
    # CPU-based scaling: primary metric
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 65
    # Memory-based scaling: safety net
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 75
  # Scaling behavior: scale up fast, scale down slowly
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 30
      policies:
        # Allow doubling pods quickly during spikes
        - type: Percent
          value: 100
          periodSeconds: 30
        # But also allow adding at least 3 pods at once
        - type: Pods
          value: 3
          periodSeconds: 30
      selectPolicy: Max
    scaleDown:
      stabilizationWindowSeconds: 300  # 5 minutes: avoid flapping
      policies:
        # Scale down at most 1 pod per minute
        - type: Pods
          value: 1
          periodSeconds: 60
      selectPolicy: Min
```

### 2.3 Custom Metrics Scaling (Advanced)

For more precise scaling, use custom metrics from Prometheus via the `prometheus-adapter`:

```yaml
# k8s/hpa-custom-metrics.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: refacil-wallet-hpa-custom
  namespace: refacil-wallet
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: refacil-wallet
  minReplicas: 3
  maxReplicas: 15
  metrics:
    # Scale on HTTP request rate per pod
    - type: Pods
      pods:
        metric:
          name: http_requests_per_second
        target:
          type: AverageValue
          averageValue: "100"  # Scale when > 100 RPS per pod
    # Scale on event loop lag (Node.js specific)
    - type: Pods
      pods:
        metric:
          name: nodejs_eventloop_lag_p99_seconds
        target:
          type: AverageValue
          averageValue: "0.1"  # Scale when event loop lag > 100ms
    # CPU as fallback
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 15  # React quickly to spikes
      policies:
        - type: Percent
          value: 100
          periodSeconds: 15
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Pods
          value: 1
          periodSeconds: 60
```

**Prometheus Adapter Configuration** (for custom metrics):

```yaml
# prometheus-adapter-config.yaml
rules:
  - seriesQuery: 'http_request_duration_seconds_count{namespace="refacil-wallet"}'
    resources:
      overrides:
        namespace: {resource: "namespace"}
        pod: {resource: "pod"}
    name:
      matches: "^(.*)_seconds_count$"
      as: "http_requests_per_second"
    metricsQuery: 'rate(<<.Series>>{<<.LabelMatchers>>}[1m])'
  - seriesQuery: 'nodejs_eventloop_lag_p99_seconds{namespace="refacil-wallet"}'
    resources:
      overrides:
        namespace: {resource: "namespace"}
        pod: {resource: "pod"}
    name:
      as: "nodejs_eventloop_lag_p99_seconds"
    metricsQuery: '<<.Series>>{<<.LabelMatchers>>}'
```

### 2.4 Pod Disruption Budget

A PDB ensures that a minimum number of pods are always available during voluntary disruptions (upgrades, node drains, scaling events):

```yaml
# k8s/pdb.yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: refacil-wallet-pdb
  namespace: refacil-wallet
  labels:
    app: refacil-wallet
spec:
  # Ensure at least 2 pods are always available
  minAvailable: 2
  selector:
    matchLabels:
      app: refacil-wallet
```

For a financial service, `minAvailable: 2` is generally preferred over `maxUnavailable: 1` because it is an absolute guarantee. If you have 3 replicas and `maxUnavailable: 1`, you always have at least 2 pods. But if you scale to 10 replicas, `maxUnavailable: 1` still only allows 1 disruption, which may slow down rolling updates unnecessarily. Consider using `maxUnavailable: "25%"` at higher replica counts:

```yaml
  # Alternative for larger deployments
  maxUnavailable: "25%"
```

### 2.5 Node.js-Specific Scaling Considerations

1. **Single-threaded**: Each Node.js process uses only one CPU core. Set CPU requests to `250m-500m` and limits to `500m-1000m`. Over-provisioning CPU per pod is wasteful; scale horizontally instead.

2. **Memory**: Node.js has a default heap limit (~1.7 GB on 64-bit). For a transaction processing service, 256 MB request / 512 MB limit is usually sufficient. Set `--max-old-space-size` if needed:
   ```yaml
   env:
     - name: NODE_OPTIONS
       value: "--max-old-space-size=384"
   ```

3. **Event Loop Monitoring**: Expose event loop lag as a Prometheus metric. When event loop lag exceeds 50-100ms, the pod is overloaded and new pods should be spawned.

4. **Connection Pooling**: Each Node.js pod opens database connections. With 15 pods and Prisma's default pool size of 5, that is 75 connections. Ensure RDS `max_connections` (or RDS Proxy limits) can handle this.

---

## 3. Health Checks and Readiness Probes

### 3.1 Three Types of Probes

Kubernetes provides three probe types, each serving a distinct purpose:

| Probe     | Question Answered                       | Failure Action              |
|-----------|-----------------------------------------|-----------------------------|
| Startup   | Has the container finished starting?    | Kill and restart container  |
| Liveness  | Is the process alive and not hung?      | Kill and restart container  |
| Readiness | Can the pod accept traffic right now?   | Remove from Service endpoints |

### 3.2 Kubernetes Probe Configuration

```yaml
# In deployment.yaml, under spec.template.spec.containers[]
startupProbe:
  httpGet:
    path: /health
    port: 3000
  # Give the app up to 60s to start (initialDelaySeconds + failureThreshold * periodSeconds)
  initialDelaySeconds: 5
  periodSeconds: 5
  failureThreshold: 12
  timeoutSeconds: 3

livenessProbe:
  httpGet:
    path: /health
    port: 3000
  # Only runs after startup probe succeeds
  initialDelaySeconds: 0
  periodSeconds: 15
  failureThreshold: 3
  timeoutSeconds: 5
  successThreshold: 1

readinessProbe:
  httpGet:
    path: /health/ready
    port: 3000
  initialDelaySeconds: 0
  periodSeconds: 10
  failureThreshold: 3
  timeoutSeconds: 5
  successThreshold: 1
```

**Key differences in the endpoints**:
- `/health` (liveness): Is the Node.js process responsive? Returns 200 if the HTTP server can respond. Should NOT check database connectivity (to avoid cascading restarts when DB is temporarily down).
- `/health/ready` (readiness): Can this pod handle requests? Checks database connectivity. If the database is unreachable, the pod is removed from the Service endpoints so traffic is not routed to it, but the pod is NOT killed.

### 3.3 NestJS Health Check Implementation with @nestjs/terminus

```typescript
// src/presentation/controllers/health.controller.ts
import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthCheckResult,
  PrismaHealthIndicator,
  MemoryHealthIndicator,
  DiskHealthIndicator,
} from '@nestjs/terminus';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly memoryHealth: MemoryHealthIndicator,
    private readonly prismaService: PrismaService,
  ) {}

  /**
   * Liveness probe: Is the process alive?
   * Should be lightweight - no external dependency checks.
   */
  @Get()
  @ApiOperation({ summary: 'Liveness check' })
  @HealthCheck()
  async checkLiveness(): Promise<HealthCheckResult> {
    return this.health.check([
      // Check that heap memory is under 384MB
      () => this.memoryHealth.checkHeap('memory_heap', 384 * 1024 * 1024),
    ]);
  }

  /**
   * Readiness probe: Can this pod accept traffic?
   * Checks database connectivity.
   */
  @Get('ready')
  @ApiOperation({ summary: 'Readiness check' })
  @HealthCheck()
  async checkReadiness(): Promise<HealthCheckResult> {
    return this.health.check([
      // Check database connectivity
      () => this.prismaHealth.pingCheck('database', this.prismaService),
      // Check heap memory
      () => this.memoryHealth.checkHeap('memory_heap', 384 * 1024 * 1024),
    ]);
  }
}
```

**Alternative** if `PrismaHealthIndicator` is not available in your version of `@nestjs/terminus`, implement a custom indicator:

```typescript
// src/infrastructure/health/prisma-health.indicator.ts
import { Injectable } from '@nestjs/common';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class PrismaHealthIndicator extends HealthIndicator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return this.getStatus(key, true);
    } catch (error) {
      throw new HealthCheckError(
        'Database check failed',
        this.getStatus(key, false, { message: error.message }),
      );
    }
  }
}
```

### 3.4 Graceful Shutdown Handling (SIGTERM)

When Kubernetes terminates a pod (during scaling, rolling updates, or node drain), it sends `SIGTERM` and waits for `terminationGracePeriodSeconds` (default 30s) before sending `SIGKILL`. The application must handle this window properly:

```typescript
// src/main.ts
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Enable graceful shutdown hooks
  app.enableShutdownHooks();

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`Application listening on port ${port}`);
}
bootstrap();
```

NestJS's `enableShutdownHooks()` listens for `SIGTERM` and `SIGINT`, then calls `onModuleDestroy()` and `beforeApplicationShutdown()` lifecycle hooks. The PrismaService already implements `OnModuleDestroy` to disconnect from the database.

**Important**: Use `dumb-init` (as shown in the Dockerfile) or `tini` as PID 1 to ensure signals are properly forwarded to the Node.js process. Node.js as PID 1 does not handle signals correctly by default.

### 3.5 Probe Timing Rationale

| Probe     | Setting                  | Value | Rationale                                                    |
|-----------|--------------------------|-------|--------------------------------------------------------------|
| Startup   | initialDelaySeconds      | 5     | NestJS needs time to bootstrap DI container                  |
| Startup   | failureThreshold         | 12    | Allows up to 65s startup (5 + 12*5) for cold starts         |
| Liveness  | periodSeconds            | 15    | Frequent enough to detect hangs, not so frequent to add load |
| Liveness  | failureThreshold         | 3     | 3 failures = 45s of unresponsiveness before restart          |
| Readiness | periodSeconds            | 10    | Detect DB disconnection within 30s (3 failures * 10s)       |
| Readiness | timeoutSeconds           | 5     | DB ping should complete in <5s or something is wrong         |

---

## 4. Secrets Management in Kubernetes

### 4.1 Kubernetes Secrets: Baseline (Not Sufficient for Production)

Kubernetes Secrets are base64-encoded (NOT encrypted at rest by default). They are stored in etcd and anyone with `get secrets` RBAC permission can decode them. For a financial microservice, this is insufficient.

```yaml
# k8s/secret.yaml (template - DO NOT commit real values)
apiVersion: v1
kind: Secret
metadata:
  name: refacil-wallet-secrets
  namespace: refacil-wallet
  labels:
    app: refacil-wallet
type: Opaque
data:
  # base64 encoded values - PLACEHOLDER ONLY
  DATABASE_URL: cG9zdGdyZXNxbDovL3VzZXI6cGFzc0Bob3N0OjU0MzIvd2FsbGV0  # placeholder
stringData:
  # Alternative: stringData accepts plain text (encoded automatically)
  # DATABASE_URL: "postgresql://user:pass@host:5432/wallet"
```

**Limitations**:
- Base64 is not encryption.
- Secrets are visible to anyone who can `kubectl get secret -o yaml`.
- No audit trail for access.
- No automatic rotation.

### 4.2 AWS Secrets Manager Integration (Recommended)

AWS Secrets Manager provides encryption at rest (KMS), automatic rotation, fine-grained IAM policies, and an audit trail via CloudTrail. For the Refacil Wallet, the `DATABASE_URL` and any API keys should be stored here.

**Architecture**:
```
AWS Secrets Manager --> External Secrets Operator --> K8s Secret --> Pod env vars
```

### 4.3 External Secrets Operator (ESO)

The External Secrets Operator watches `ExternalSecret` custom resources and automatically creates/updates Kubernetes Secrets from external providers (AWS Secrets Manager, HashiCorp Vault, GCP Secret Manager, etc.).

**Installation**:
```bash
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets \
  --namespace external-secrets \
  --create-namespace
```

**Secret Store Configuration** (cluster-wide):

```yaml
# k8s/external-secrets/cluster-secret-store.yaml
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: aws-secrets-manager
spec:
  provider:
    aws:
      service: SecretsManager
      region: us-east-1
      auth:
        jwt:
          serviceAccountRef:
            name: external-secrets-sa
            namespace: external-secrets
```

**ExternalSecret for Refacil Wallet**:

```yaml
# k8s/external-secrets/wallet-secrets.yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: refacil-wallet-secrets
  namespace: refacil-wallet
spec:
  refreshInterval: 1h  # Sync secrets every hour
  secretStoreRef:
    name: aws-secrets-manager
    kind: ClusterSecretStore
  target:
    name: refacil-wallet-secrets  # Name of the K8s Secret to create
    creationPolicy: Owner
  data:
    - secretKey: DATABASE_URL
      remoteRef:
        key: refacil-wallet/production  # AWS Secrets Manager secret name
        property: DATABASE_URL
    - secretKey: FRAUD_AMOUNT_THRESHOLD
      remoteRef:
        key: refacil-wallet/production
        property: FRAUD_AMOUNT_THRESHOLD
```

### 4.4 Environment Variable Injection in Deployments

```yaml
# In deployment.yaml
spec:
  template:
    spec:
      containers:
        - name: refacil-wallet
          env:
            # Non-sensitive config from ConfigMap
            - name: NODE_ENV
              valueFrom:
                configMapKeyRef:
                  name: refacil-wallet-config
                  key: NODE_ENV
            - name: PORT
              valueFrom:
                configMapKeyRef:
                  name: refacil-wallet-config
                  key: PORT
            - name: LOG_LEVEL
              valueFrom:
                configMapKeyRef:
                  name: refacil-wallet-config
                  key: LOG_LEVEL
            # Sensitive config from Secret (created by ESO)
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: refacil-wallet-secrets
                  key: DATABASE_URL
          envFrom:
            # Alternative: load all keys from ConfigMap as env vars
            - configMapRef:
                name: refacil-wallet-config
```

**ConfigMap for non-sensitive configuration**:

```yaml
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: refacil-wallet-config
  namespace: refacil-wallet
  labels:
    app: refacil-wallet
data:
  NODE_ENV: "production"
  PORT: "3000"
  LOG_LEVEL: "info"
  FRAUD_VELOCITY_WINDOW_MINUTES: "5"
  FRAUD_VELOCITY_MAX_TRANSACTIONS: "10"
  FRAUD_AMOUNT_THRESHOLD: "10000"
```

### 4.5 Sealed Secrets for GitOps (Alternative)

If the team uses a GitOps workflow (e.g., ArgoCD, Flux), Sealed Secrets allows encrypting secrets that can be safely committed to git:

```bash
# Install kubeseal CLI
brew install kubeseal

# Encrypt a secret
kubectl create secret generic refacil-wallet-secrets \
  --namespace refacil-wallet \
  --from-literal=DATABASE_URL='postgresql://...' \
  --dry-run=client -o yaml | \
  kubeseal --format yaml > k8s/sealed-secret.yaml
```

The resulting `SealedSecret` can be committed to git. Only the Sealed Secrets controller in the cluster can decrypt it.

### 4.6 Recommendation for This Project

| Approach                    | Complexity | Security | Recommendation           |
|-----------------------------|------------|----------|--------------------------|
| K8s Secrets (plain)         | Low        | Low      | Development/testing only |
| Sealed Secrets              | Medium     | Medium   | GitOps workflows         |
| External Secrets + AWS SM   | Medium     | High     | **Recommended for prod** |
| HashiCorp Vault             | High       | Highest  | Overkill for this scope  |

**Recommended approach**: Use **External Secrets Operator with AWS Secrets Manager** for production. It integrates naturally with the AWS infrastructure (EKS + RDS), provides encryption, rotation, and audit logging, and has moderate operational complexity.

---

## 5. Zero-Downtime Deployments

### 5.1 Rolling Update Strategy

The default and most commonly used strategy for stateless applications:

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: refacil-wallet
  namespace: refacil-wallet
  labels:
    app: refacil-wallet
    version: v1
spec:
  replicas: 3
  revisionHistoryLimit: 5
  strategy:
    type: RollingUpdate
    rollingUpdate:
      # Allow 1 extra pod during update (faster rollout)
      maxSurge: 1
      # Never have fewer than replicas-0 pods (0 downtime)
      maxUnavailable: 0
  selector:
    matchLabels:
      app: refacil-wallet
  template:
    metadata:
      labels:
        app: refacil-wallet
      annotations:
        # Force rolling restart when config changes
        checksum/config: "{{ include (print .Template.BasePath \"/configmap.yaml\") . | sha256sum }}"
    spec:
      terminationGracePeriodSeconds: 45
      serviceAccountName: refacil-wallet-sa
      # Spread pods across availability zones
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: topology.kubernetes.io/zone
          whenUnsatisfiable: DoNotSchedule
          labelSelector:
            matchLabels:
              app: refacil-wallet
      # Anti-affinity: avoid scheduling multiple pods on the same node
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                labelSelector:
                  matchLabels:
                    app: refacil-wallet
                topologyKey: kubernetes.io/hostname
      containers:
        - name: refacil-wallet
          image: <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/refacil-wallet:latest
          imagePullPolicy: Always
          ports:
            - containerPort: 3000
              protocol: TCP
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          env:
            - name: NODE_ENV
              valueFrom:
                configMapKeyRef:
                  name: refacil-wallet-config
                  key: NODE_ENV
            - name: PORT
              valueFrom:
                configMapKeyRef:
                  name: refacil-wallet-config
                  key: PORT
            - name: LOG_LEVEL
              valueFrom:
                configMapKeyRef:
                  name: refacil-wallet-config
                  key: LOG_LEVEL
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: refacil-wallet-secrets
                  key: DATABASE_URL
            - name: FRAUD_VELOCITY_WINDOW_MINUTES
              valueFrom:
                configMapKeyRef:
                  name: refacil-wallet-config
                  key: FRAUD_VELOCITY_WINDOW_MINUTES
            - name: FRAUD_VELOCITY_MAX_TRANSACTIONS
              valueFrom:
                configMapKeyRef:
                  name: refacil-wallet-config
                  key: FRAUD_VELOCITY_MAX_TRANSACTIONS
            - name: FRAUD_AMOUNT_THRESHOLD
              valueFrom:
                configMapKeyRef:
                  name: refacil-wallet-config
                  key: FRAUD_AMOUNT_THRESHOLD
            - name: NODE_OPTIONS
              value: "--max-old-space-size=384"
          startupProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
            failureThreshold: 12
            timeoutSeconds: 3
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            periodSeconds: 15
            failureThreshold: 3
            timeoutSeconds: 5
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 3000
            periodSeconds: 10
            failureThreshold: 3
            timeoutSeconds: 5
          lifecycle:
            preStop:
              exec:
                # Give load balancer time to deregister the pod
                command: ["sh", "-c", "sleep 10"]
```

### 5.2 Connection Draining with preStop Hooks

The `preStop` hook is critical for zero-downtime deployments. The sequence when a pod is terminated:

```
1. Pod marked for termination
2. Pod removed from Service endpoints (async)
3. preStop hook runs (sleep 10 - wait for LB to deregister)
4. SIGTERM sent to process
5. NestJS graceful shutdown begins:
   a. Stop accepting new connections
   b. Wait for in-flight requests to complete
   c. Close database connections (PrismaService.onModuleDestroy)
   d. Exit cleanly
6. If still alive after terminationGracePeriodSeconds (45s), SIGKILL
```

The `sleep 10` in preStop ensures that the load balancer has time to stop sending traffic to this pod before the application starts shutting down. Without this, some requests may be routed to a pod that is already shutting down.

### 5.3 Database Migration Strategy with Prisma

Database migrations must run before the new application version starts. There are two approaches:

**Option A: Init Container (Recommended for Simple Migrations)**

```yaml
# Added to deployment.yaml spec.template.spec
initContainers:
  - name: prisma-migrate
    image: <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/refacil-wallet:latest
    command: ["npx", "prisma", "migrate", "deploy"]
    env:
      - name: DATABASE_URL
        valueFrom:
          secretKeyRef:
            name: refacil-wallet-secrets
            key: DATABASE_URL
    resources:
      requests:
        memory: "128Mi"
        cpu: "100m"
      limits:
        memory: "256Mi"
        cpu: "250m"
```

**Caveat**: With multiple replicas, all pods would try to run migrations concurrently. Prisma's `migrate deploy` uses a lock table (`_prisma_migrations`) to prevent concurrent migrations, so this is safe, but wasteful.

**Option B: Kubernetes Job (Recommended for Production)**

```yaml
# k8s/migration-job.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: refacil-wallet-migration-{{ .Values.image.tag }}
  namespace: refacil-wallet
  annotations:
    # If using Helm, run before deployment
    "helm.sh/hook": pre-upgrade
    "helm.sh/hook-weight": "-1"
    "helm.sh/hook-delete-policy": hook-succeeded
spec:
  backoffLimit: 3
  activeDeadlineSeconds: 120
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: migrate
          image: <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/refacil-wallet:{{ .Values.image.tag }}
          command: ["npx", "prisma", "migrate", "deploy"]
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: refacil-wallet-secrets
                  key: DATABASE_URL
```

**Important migration rules for zero-downtime**:
1. **Never drop columns or tables** in the same release that removes the code using them. Do it in a subsequent release after the new version is fully deployed.
2. **Add columns as nullable** first. Make them NOT NULL in a subsequent migration after backfilling.
3. **Rename operations** should be done as add-new, migrate-data, remove-old across multiple releases.
4. Always test migrations against a copy of production data before deploying.

### 5.4 Blue/Green Deployment Pattern

For critical releases (e.g., changes to transaction processing logic), a blue/green deployment provides instant rollback:

```yaml
# Deploy "green" version alongside existing "blue"
# k8s/deployment-green.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: refacil-wallet-green
  namespace: refacil-wallet
  labels:
    app: refacil-wallet
    version: green
spec:
  replicas: 3
  selector:
    matchLabels:
      app: refacil-wallet
      version: green
  template:
    metadata:
      labels:
        app: refacil-wallet
        version: green
    spec:
      containers:
        - name: refacil-wallet
          image: <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/refacil-wallet:v2.0.0
          # ... same config as blue
---
# Switch traffic by updating the Service selector
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: refacil-wallet
  namespace: refacil-wallet
spec:
  selector:
    app: refacil-wallet
    version: green  # Change from "blue" to "green" to switch
  ports:
    - port: 80
      targetPort: 3000
      protocol: TCP
```

**Rollback**: Change the Service selector back to `version: blue`.

### 5.5 Canary Deployments

Route a percentage of traffic to the new version to validate before full rollout. This requires an ingress controller that supports traffic splitting (e.g., NGINX Ingress, Istio, AWS ALB Ingress Controller):

```yaml
# Using NGINX Ingress annotations for canary
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: refacil-wallet-canary
  namespace: refacil-wallet
  annotations:
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-weight: "10"  # 10% of traffic
spec:
  rules:
    - host: wallet.refacil.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: refacil-wallet-canary
                port:
                  number: 80
```

---

## 6. AWS RDS + EKS Best Practices

### 6.1 RDS PostgreSQL 16 Configuration

#### Multi-AZ for High Availability

```hcl
# terraform/rds.tf
resource "aws_db_instance" "wallet" {
  identifier = "refacil-wallet-${var.environment}"

  # Engine
  engine         = "postgres"
  engine_version = "16.4"

  # Instance sizing
  instance_class    = var.environment == "production" ? "db.r6g.large" : "db.t3.medium"
  allocated_storage = 50
  max_allocated_storage = 200  # Auto-scaling storage
  storage_type      = "gp3"
  storage_encrypted = true
  kms_key_id        = aws_kms_key.rds.arn

  # High Availability
  multi_az = var.environment == "production" ? true : false

  # Database
  db_name  = "wallet"
  username = "wallet_admin"
  password = random_password.rds_password.result
  port     = 5432

  # Network
  db_subnet_group_name   = aws_db_subnet_group.wallet.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false

  # Backups
  backup_retention_period   = var.environment == "production" ? 30 : 7
  backup_window             = "03:00-04:00"  # UTC, during low traffic
  maintenance_window        = "Mon:04:00-Mon:05:00"
  copy_tags_to_snapshot     = true
  delete_automated_backups  = false
  final_snapshot_identifier = "refacil-wallet-final-${var.environment}"
  skip_final_snapshot       = var.environment != "production"

  # Performance Insights
  performance_insights_enabled    = true
  performance_insights_retention_period = var.environment == "production" ? 731 : 7

  # Parameter group
  parameter_group_name = aws_db_parameter_group.wallet.name

  # Monitoring
  monitoring_interval = 60
  monitoring_role_arn = aws_iam_role.rds_monitoring.arn

  # Deletion protection
  deletion_protection = var.environment == "production"

  tags = {
    Name        = "refacil-wallet-${var.environment}"
    Environment = var.environment
    Service     = "refacil-wallet"
  }

  lifecycle {
    prevent_destroy = true
  }
}
```

#### Parameter Group Tuning for Transaction Workloads

```hcl
# terraform/rds.tf (continued)
resource "aws_db_parameter_group" "wallet" {
  family = "postgres16"
  name   = "refacil-wallet-${var.environment}"

  # Connection management
  parameter {
    name  = "max_connections"
    value = "200"  # Account for app pods + connection pooling
  }

  # Write-heavy tuning for transactions
  parameter {
    name  = "shared_buffers"
    value = "{DBInstanceClassMemory/4}"  # 25% of RAM
    apply_method = "pending-reboot"
  }

  parameter {
    name  = "effective_cache_size"
    value = "{DBInstanceClassMemory*3/4}"  # 75% of RAM
    apply_method = "pending-reboot"
  }

  parameter {
    name  = "work_mem"
    value = "16384"  # 16MB per operation
  }

  parameter {
    name  = "maintenance_work_mem"
    value = "524288"  # 512MB for vacuum/index ops
  }

  # WAL tuning for transaction workloads
  parameter {
    name  = "wal_buffers"
    value = "16384"  # 16MB
    apply_method = "pending-reboot"
  }

  parameter {
    name  = "checkpoint_completion_target"
    value = "0.9"
  }

  parameter {
    name  = "random_page_cost"
    value = "1.1"  # SSD-optimized (gp3)
  }

  # Logging
  parameter {
    name  = "log_min_duration_statement"
    value = "200"  # Log queries > 200ms
  }

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  # SSL enforcement
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  tags = {
    Name        = "refacil-wallet-${var.environment}"
    Environment = var.environment
  }
}
```

#### Read Replicas

```hcl
resource "aws_db_instance" "wallet_replica" {
  count = var.environment == "production" ? 1 : 0

  identifier          = "refacil-wallet-replica-${var.environment}"
  replicate_source_db = aws_db_instance.wallet.identifier
  instance_class      = "db.r6g.large"

  # Replica-specific settings
  multi_az            = false
  publicly_accessible = false
  storage_encrypted   = true
  kms_key_id          = aws_kms_key.rds.arn

  # Performance Insights
  performance_insights_enabled = true

  tags = {
    Name        = "refacil-wallet-replica-${var.environment}"
    Environment = var.environment
    Service     = "refacil-wallet"
    Role        = "replica"
  }
}
```

### 6.2 EKS Cluster Configuration

```hcl
# terraform/eks.tf
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = "refacil-wallet-${var.environment}"
  cluster_version = "1.30"

  # Network
  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  # Cluster access
  cluster_endpoint_public_access  = true   # For kubectl access
  cluster_endpoint_private_access = true

  # Enable IRSA (IAM Roles for Service Accounts)
  enable_irsa = true

  # Cluster addons
  cluster_addons = {
    coredns = {
      most_recent = true
    }
    kube-proxy = {
      most_recent = true
    }
    vpc-cni = {
      most_recent = true
      configuration_values = jsonencode({
        env = {
          ENABLE_PREFIX_DELEGATION = "true"  # More IPs per node
        }
      })
    }
    aws-ebs-csi-driver = {
      most_recent              = true
      service_account_role_arn = module.ebs_csi_irsa_role.iam_role_arn
    }
  }

  # Managed Node Groups
  eks_managed_node_groups = {
    # Application workloads
    application = {
      name            = "app-nodes"
      instance_types  = ["t3.medium"]
      min_size        = var.environment == "production" ? 3 : 1
      max_size        = var.environment == "production" ? 8 : 3
      desired_size    = var.environment == "production" ? 3 : 2

      labels = {
        workload = "application"
        Environment = var.environment
      }

      tags = {
        "k8s.io/cluster-autoscaler/enabled"                        = "true"
        "k8s.io/cluster-autoscaler/refacil-wallet-${var.environment}" = "owned"
      }
    }
  }

  # Fargate profile (optional for batch/cron jobs)
  # fargate_profiles = {
  #   batch = {
  #     name = "batch-jobs"
  #     selectors = [
  #       { namespace = "refacil-wallet", labels = { workload = "batch" } }
  #     ]
  #   }
  # }

  tags = {
    Environment = var.environment
    Service     = "refacil-wallet"
    ManagedBy   = "terraform"
  }
}
```

### 6.3 VPC Design

```hcl
# terraform/vpc.tf
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "refacil-wallet-${var.environment}"
  cidr = "10.0.0.0/16"

  azs             = ["us-east-1a", "us-east-1b", "us-east-1c"]
  public_subnets  = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  private_subnets = ["10.0.11.0/24", "10.0.12.0/24", "10.0.13.0/24"]
  database_subnets = ["10.0.21.0/24", "10.0.22.0/24", "10.0.23.0/24"]

  # NAT Gateway for private subnet egress
  enable_nat_gateway     = true
  single_nat_gateway     = var.environment != "production"  # Cost optimization
  one_nat_gateway_per_az = var.environment == "production"  # HA in production

  # DNS
  enable_dns_hostnames = true
  enable_dns_support   = true

  # Database subnet group
  create_database_subnet_group           = true
  create_database_subnet_route_table     = true
  create_database_internet_gateway_route = false  # No internet for DB

  # Tags required for EKS
  public_subnet_tags = {
    "kubernetes.io/role/elb"                                        = 1
    "kubernetes.io/cluster/refacil-wallet-${var.environment}"      = "shared"
  }

  private_subnet_tags = {
    "kubernetes.io/role/internal-elb"                               = 1
    "kubernetes.io/cluster/refacil-wallet-${var.environment}"      = "shared"
  }

  tags = {
    Environment = var.environment
    Service     = "refacil-wallet"
    ManagedBy   = "terraform"
  }
}
```

### 6.4 Security Groups

```hcl
# terraform/security-groups.tf

# EKS to RDS
resource "aws_security_group" "rds" {
  name_prefix = "refacil-wallet-rds-"
  vpc_id      = module.vpc.vpc_id
  description = "Security group for RDS PostgreSQL"

  ingress {
    description     = "PostgreSQL from EKS nodes"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [module.eks.node_security_group_id]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "refacil-wallet-rds-${var.environment}"
    Environment = var.environment
  }

  lifecycle {
    create_before_destroy = true
  }
}
```

### 6.5 Connection Pooling: RDS Proxy vs PgBouncer

For a service targeting 1000 TPS with multiple pods, connection pooling is essential.

| Feature             | RDS Proxy                    | PgBouncer (self-managed)     |
|---------------------|------------------------------|------------------------------|
| Management          | Fully managed by AWS         | Self-managed K8s deployment  |
| Cost                | ~$0.015/vCPU/hour           | Only compute cost            |
| IAM Authentication  | Native support               | Requires setup               |
| Failover            | Automatic, ~1s               | Manual failover handling     |
| Connection Pinning  | May pin on certain features  | Transaction mode available   |
| Operational Burden  | Minimal                      | Moderate                     |

**Recommendation**: Use **RDS Proxy** for production. The cost is justified by zero operational burden, automatic failover, and IAM-based authentication.

```hcl
# terraform/rds-proxy.tf
resource "aws_db_proxy" "wallet" {
  count = var.environment == "production" ? 1 : 0

  name                   = "refacil-wallet-proxy-${var.environment}"
  debug_logging          = false
  engine_family          = "POSTGRESQL"
  idle_client_timeout    = 1800
  require_tls            = true
  role_arn               = aws_iam_role.rds_proxy.arn
  vpc_security_group_ids = [aws_security_group.rds.id]
  vpc_subnet_ids         = module.vpc.database_subnets

  auth {
    auth_scheme = "SECRETS"
    iam_auth    = "REQUIRED"
    secret_arn  = aws_secretsmanager_secret.rds_credentials.arn
  }

  tags = {
    Name        = "refacil-wallet-proxy-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_db_proxy_default_target_group" "wallet" {
  count = var.environment == "production" ? 1 : 0

  db_proxy_name = aws_db_proxy.wallet[0].name

  connection_pool_config {
    max_connections_percent      = 90
    max_idle_connections_percent = 50
    connection_borrow_timeout    = 120
  }
}

resource "aws_db_proxy_target" "wallet" {
  count = var.environment == "production" ? 1 : 0

  db_proxy_name          = aws_db_proxy.wallet[0].name
  target_group_name      = aws_db_proxy_default_target_group.wallet[0].name
  db_instance_identifier = aws_db_instance.wallet.identifier
}
```

---

## 7. Terraform Module Structure

### 7.1 Recommended Directory Layout

```
terraform/
├── environments/
│   ├── dev/
│   │   ├── main.tf           # Module invocations for dev
│   │   ├── variables.tf      # Dev-specific variable definitions
│   │   ├── outputs.tf        # Dev outputs
│   │   ├── terraform.tfvars  # Dev values (NOT committed for secrets)
│   │   └── backend.tf        # Dev state backend
│   ├── staging/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   ├── terraform.tfvars
│   │   └── backend.tf
│   └── production/
│       ├── main.tf
│       ├── variables.tf
│       ├── outputs.tf
│       ├── terraform.tfvars
│       └── backend.tf
├── modules/
│   ├── vpc/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── eks/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── rds/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   └── ecr/
│       ├── main.tf
│       ├── variables.tf
│       └── outputs.tf
├── .terraform.lock.hcl       # Provider lock file (COMMIT this)
└── README.md
```

### 7.2 Environment Configuration Example

```hcl
# terraform/environments/production/main.tf
terraform {
  required_version = ">= 1.7.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.27"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.12"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = "production"
      Service     = "refacil-wallet"
      ManagedBy   = "terraform"
      Team        = "engineering"
    }
  }
}

module "vpc" {
  source = "../../modules/vpc"

  environment        = "production"
  vpc_cidr           = "10.0.0.0/16"
  availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]
  single_nat_gateway = false  # HA: one per AZ in production
}

module "eks" {
  source = "../../modules/eks"

  environment     = "production"
  cluster_version = "1.30"
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnet_ids

  node_instance_types = ["t3.medium"]
  node_min_size       = 3
  node_max_size       = 8
  node_desired_size   = 3
}

module "rds" {
  source = "../../modules/rds"

  environment      = "production"
  instance_class   = "db.r6g.large"
  multi_az         = true
  vpc_id           = module.vpc.vpc_id
  subnet_ids       = module.vpc.database_subnet_ids
  eks_sg_id        = module.eks.node_security_group_id
  backup_retention = 30
  enable_proxy     = true
}

module "ecr" {
  source = "../../modules/ecr"

  environment       = "production"
  repository_name   = "refacil-wallet"
  image_scan_on_push = true
  max_image_count   = 20
}
```

### 7.3 State Management

```hcl
# terraform/environments/production/backend.tf
terraform {
  backend "s3" {
    bucket         = "refacil-terraform-state"
    key            = "production/wallet/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    kms_key_id     = "alias/terraform-state"
    dynamodb_table = "terraform-locks"
  }
}
```

**Bootstrap the state backend** (run manually once before any Terraform operations):

```hcl
# terraform/bootstrap/main.tf
# Run this ONCE to create the state backend resources

provider "aws" {
  region = "us-east-1"
}

resource "aws_s3_bucket" "terraform_state" {
  bucket = "refacil-terraform-state"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.terraform_state.id
    }
  }
}

resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_kms_key" "terraform_state" {
  description             = "KMS key for Terraform state encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true
}

resource "aws_kms_alias" "terraform_state" {
  name          = "alias/terraform-state"
  target_key_id = aws_kms_key.terraform_state.key_id
}

resource "aws_dynamodb_table" "terraform_locks" {
  name         = "terraform-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  tags = {
    Name      = "terraform-locks"
    ManagedBy = "terraform-bootstrap"
  }
}
```

### 7.4 ECR Module

```hcl
# terraform/modules/ecr/main.tf
resource "aws_ecr_repository" "wallet" {
  name                 = var.repository_name
  image_tag_mutability = "IMMUTABLE"  # Prevent tag overwriting

  image_scanning_configuration {
    scan_on_push = var.image_scan_on_push
  }

  encryption_configuration {
    encryption_type = "KMS"
  }

  tags = {
    Name        = var.repository_name
    Environment = var.environment
  }
}

# Lifecycle policy: retain last N images
resource "aws_ecr_lifecycle_policy" "wallet" {
  repository = aws_ecr_repository.wallet.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last ${var.max_image_count} images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = var.max_image_count
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}
```

---

## 8. GitHub Actions CI/CD Pipeline

### 8.1 CI Pipeline (Pull Requests)

```yaml
# .github/workflows/ci.yml
name: CI Pipeline

on:
  push:
    branches: [develop, "feature/**"]
  pull_request:
    branches: [main, develop]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: "20"

jobs:
  # ============================================================
  # Job 1: Lint & Format Check
  # ============================================================
  lint:
    name: Lint & Format
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "npm"

      - run: npm ci

      - name: Run ESLint
        run: npm run lint

      - name: Check formatting
        run: npx prettier --check "src/**/*.ts" "test/**/*.ts"

  # ============================================================
  # Job 2: Unit Tests
  # ============================================================
  test-unit:
    name: Unit Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "npm"

      - run: npm ci
      - run: npx prisma generate

      - name: Run unit tests with coverage
        run: npm run test:cov

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          fail_ci_if_error: false

      - name: Check coverage threshold
        run: |
          COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
          echo "Coverage: ${COVERAGE}%"
          if (( $(echo "$COVERAGE < 80" | bc -l) )); then
            echo "Coverage is below 80%"
            exit 1
          fi

  # ============================================================
  # Job 3: Integration Tests (with PostgreSQL)
  # ============================================================
  test-integration:
    name: Integration Tests
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: wallet_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://test:test@localhost:5432/wallet_test
      NODE_ENV: test
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "npm"

      - run: npm ci
      - run: npx prisma generate
      - run: npx prisma migrate deploy

      - name: Run integration tests
        run: npm run test:e2e

  # ============================================================
  # Job 4: Build Verification
  # ============================================================
  build:
    name: Build & Verify
    runs-on: ubuntu-latest
    needs: [lint, test-unit]
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build Docker image
        uses: docker/build-push-action@v6
        with:
          context: .
          push: false
          tags: refacil-wallet:test
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: refacil-wallet:test
          format: "sarif"
          output: "trivy-results.sarif"
          severity: "CRITICAL,HIGH"
          exit-code: "1"
          ignore-unfixed: true

      - name: Upload Trivy scan results
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: "trivy-results.sarif"
```

### 8.2 CD Pipeline (Deploy to Staging)

```yaml
# .github/workflows/cd-staging.yml
name: Deploy to Staging

on:
  push:
    branches: [develop]

concurrency:
  group: deploy-staging
  cancel-in-progress: false  # Never cancel in-progress deployments

env:
  AWS_REGION: us-east-1
  ECR_REPOSITORY: refacil-wallet
  EKS_CLUSTER: refacil-wallet-staging
  K8S_NAMESPACE: refacil-wallet

permissions:
  id-token: write   # For OIDC authentication with AWS
  contents: read

jobs:
  deploy:
    name: Build, Push & Deploy
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4

      # Authenticate with AWS using OIDC (no long-lived credentials)
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN_STAGING }}
          aws-region: ${{ env.AWS_REGION }}

      # Login to ECR
      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      # Build and push Docker image
      - name: Build, tag, and push image
        id: build
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build \
            --build-arg BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ") \
            --build-arg GIT_SHA=${{ github.sha }} \
            -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG \
            -t $ECR_REGISTRY/$ECR_REPOSITORY:staging-latest \
            .
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:staging-latest
          echo "image=$ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG" >> $GITHUB_OUTPUT

      # Configure kubectl
      - name: Update kubeconfig
        run: |
          aws eks update-kubeconfig --name $EKS_CLUSTER --region $AWS_REGION

      # Run database migrations
      - name: Run Prisma migrations
        run: |
          kubectl run prisma-migrate-${{ github.sha }} \
            --namespace=$K8S_NAMESPACE \
            --image=${{ steps.build.outputs.image }} \
            --restart=Never \
            --env="DATABASE_URL=$(kubectl get secret refacil-wallet-secrets -n $K8S_NAMESPACE -o jsonpath='{.data.DATABASE_URL}' | base64 -d)" \
            --command -- npx prisma migrate deploy
          kubectl wait --for=condition=Ready pod/prisma-migrate-${{ github.sha }} \
            --namespace=$K8S_NAMESPACE --timeout=120s || true
          kubectl logs prisma-migrate-${{ github.sha }} --namespace=$K8S_NAMESPACE
          kubectl delete pod prisma-migrate-${{ github.sha }} --namespace=$K8S_NAMESPACE

      # Deploy to Kubernetes
      - name: Deploy to staging
        run: |
          kubectl set image deployment/refacil-wallet \
            refacil-wallet=${{ steps.build.outputs.image }} \
            --namespace=$K8S_NAMESPACE
          kubectl rollout status deployment/refacil-wallet \
            --namespace=$K8S_NAMESPACE \
            --timeout=300s

      # Smoke tests
      - name: Run smoke tests
        run: |
          # Wait for pods to be ready
          kubectl wait --for=condition=ready pod \
            -l app=refacil-wallet \
            --namespace=$K8S_NAMESPACE \
            --timeout=120s

          # Port-forward and test health endpoint
          kubectl port-forward svc/refacil-wallet 8080:80 \
            --namespace=$K8S_NAMESPACE &
          sleep 5

          # Health check
          HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/health)
          if [ "$HTTP_STATUS" != "200" ]; then
            echo "Health check failed with status $HTTP_STATUS"
            exit 1
          fi

          # Readiness check
          HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/health/ready)
          if [ "$HTTP_STATUS" != "200" ]; then
            echo "Readiness check failed with status $HTTP_STATUS"
            exit 1
          fi

          echo "Smoke tests passed"

      # Rollback on failure
      - name: Rollback on failure
        if: failure()
        run: |
          echo "Deployment failed, rolling back..."
          kubectl rollout undo deployment/refacil-wallet \
            --namespace=$K8S_NAMESPACE
          kubectl rollout status deployment/refacil-wallet \
            --namespace=$K8S_NAMESPACE \
            --timeout=300s
```

### 8.3 CD Pipeline (Deploy to Production)

```yaml
# .github/workflows/cd-production.yml
name: Deploy to Production

on:
  push:
    branches: [main]

concurrency:
  group: deploy-production
  cancel-in-progress: false

env:
  AWS_REGION: us-east-1
  ECR_REPOSITORY: refacil-wallet
  EKS_CLUSTER: refacil-wallet-production
  K8S_NAMESPACE: refacil-wallet

permissions:
  id-token: write
  contents: read

jobs:
  # Gate: require manual approval
  approval:
    name: Production Approval
    runs-on: ubuntu-latest
    environment: production  # GitHub environment with required reviewers
    steps:
      - name: Approval confirmed
        run: echo "Production deployment approved"

  deploy:
    name: Deploy to Production
    needs: [approval]
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN_PRODUCTION }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push image
        id: build
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build \
            -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG \
            -t $ECR_REGISTRY/$ECR_REPOSITORY:production-latest \
            .
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:production-latest
          echo "image=$ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG" >> $GITHUB_OUTPUT

      - name: Update kubeconfig
        run: aws eks update-kubeconfig --name $EKS_CLUSTER --region $AWS_REGION

      - name: Run database migrations
        run: |
          kubectl run prisma-migrate-${{ github.sha }} \
            --namespace=$K8S_NAMESPACE \
            --image=${{ steps.build.outputs.image }} \
            --restart=Never \
            --env="DATABASE_URL=$(kubectl get secret refacil-wallet-secrets -n $K8S_NAMESPACE -o jsonpath='{.data.DATABASE_URL}' | base64 -d)" \
            --command -- npx prisma migrate deploy
          kubectl wait --for=condition=Ready pod/prisma-migrate-${{ github.sha }} \
            --namespace=$K8S_NAMESPACE --timeout=120s || true
          kubectl logs prisma-migrate-${{ github.sha }} --namespace=$K8S_NAMESPACE
          kubectl delete pod prisma-migrate-${{ github.sha }} --namespace=$K8S_NAMESPACE

      - name: Deploy with rolling update
        run: |
          kubectl set image deployment/refacil-wallet \
            refacil-wallet=${{ steps.build.outputs.image }} \
            --namespace=$K8S_NAMESPACE
          kubectl rollout status deployment/refacil-wallet \
            --namespace=$K8S_NAMESPACE \
            --timeout=600s

      - name: Run production smoke tests
        run: |
          kubectl wait --for=condition=ready pod \
            -l app=refacil-wallet \
            --namespace=$K8S_NAMESPACE \
            --timeout=120s

          kubectl port-forward svc/refacil-wallet 8080:80 \
            --namespace=$K8S_NAMESPACE &
          sleep 5

          curl -sf http://localhost:8080/health || exit 1
          curl -sf http://localhost:8080/health/ready || exit 1

          echo "Production smoke tests passed"

      - name: Rollback on failure
        if: failure()
        run: |
          echo "Production deployment failed, rolling back..."
          kubectl rollout undo deployment/refacil-wallet \
            --namespace=$K8S_NAMESPACE
          kubectl rollout status deployment/refacil-wallet \
            --namespace=$K8S_NAMESPACE \
            --timeout=600s

      - name: Notify on failure
        if: failure()
        uses: slackapi/slack-github-action@v1.27.0
        with:
          payload: |
            {
              "text": "PRODUCTION DEPLOYMENT FAILED for refacil-wallet. Rollback initiated. Commit: ${{ github.sha }}"
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

### 8.4 Reusable Security Scanning Workflow

```yaml
# .github/workflows/security-scan.yml
name: Security Scan

on:
  schedule:
    - cron: "0 6 * * 1"  # Weekly on Monday at 6 AM UTC
  workflow_dispatch:

jobs:
  dependency-scan:
    name: Dependency Vulnerabilities
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run npm audit
        run: npm audit --audit-level=high
        continue-on-error: true

      - name: Run Snyk (optional)
        uses: snyk/actions/node@master
        continue-on-error: true
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high

  image-scan:
    name: Container Image Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build image
        run: docker build -t refacil-wallet:scan .

      - name: Trivy scan
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: refacil-wallet:scan
          format: "table"
          severity: "CRITICAL,HIGH,MEDIUM"
          exit-code: "0"

  iac-scan:
    name: Infrastructure as Code Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Checkov IaC scan
        uses: bridgecrewio/checkov-action@master
        with:
          directory: terraform/
          framework: terraform
          soft_fail: true
```

---

## 9. Recommendations for This Project

### 9.1 Minimum Viable Infrastructure for the Assessment

Given the assessment context, the infrastructure should demonstrate production-grade patterns without over-engineering. Here is the minimum viable set:

| Component                  | Include? | Priority | Notes                                   |
|----------------------------|----------|----------|-----------------------------------------|
| Multi-stage Dockerfile     | Yes      | P0       | Demonstrates Docker best practices      |
| docker-compose.yml         | Yes      | P0       | Local development environment           |
| .dockerignore              | Yes      | P0       | Trivial but important                   |
| K8s Deployment + Service   | Yes      | P0       | Core deployment manifest                |
| K8s HPA                    | Yes      | P1       | Shows scaling awareness                 |
| K8s ConfigMap + Secret     | Yes      | P0       | Configuration management                |
| K8s PDB                    | Yes      | P1       | Shows availability awareness            |
| K8s Namespace              | Yes      | P0       | Isolation                               |
| Health check endpoints     | Yes      | P0       | Liveness + readiness probes             |
| CI pipeline (GitHub Actions) | Yes    | P0       | lint + test + build + scan              |
| CD pipeline (staging)      | Yes      | P1       | Build + push + deploy                   |
| CD pipeline (production)   | Yes      | P2       | With approval gate and rollback         |
| Terraform VPC              | Yes      | P1       | Network foundation                      |
| Terraform EKS              | Yes      | P1       | Compute platform                        |
| Terraform RDS              | Yes      | P1       | Database                                |
| Terraform ECR              | Yes      | P0       | Image registry                          |
| Terraform state backend    | Yes      | P1       | State management                        |
| External Secrets Operator  | Optional | P2       | Can document pattern without full setup |
| Canary deployments         | No       | P3       | Document the pattern only               |
| Service mesh (Istio)       | No       | P3       | Excessive for this scope                |

### 9.2 Priority-Ordered Implementation Plan

**Phase 1 (Day 1): Local Development Infrastructure**
1. Create the multi-stage `Dockerfile`
2. Create `docker-compose.yml` with app + PostgreSQL
3. Create `.dockerignore`
4. Verify: `docker-compose up` starts the full application

**Phase 2 (Day 1-2): CI Pipeline**
1. Create `.github/workflows/ci.yml` (lint, test, build, scan)
2. Set up Codecov integration for coverage reporting
3. Verify: PR triggers CI and all checks pass

**Phase 3 (Day 2): Kubernetes Manifests**
1. Create `k8s/namespace.yaml`
2. Create `k8s/configmap.yaml`
3. Create `k8s/secret.yaml` (template)
4. Create `k8s/deployment.yaml` (with probes, resources, preStop)
5. Create `k8s/service.yaml`
6. Create `k8s/hpa.yaml`
7. Create `k8s/pdb.yaml`
8. Implement health check endpoints (`/health`, `/health/ready`)

**Phase 4 (Day 2-3): Terraform Infrastructure**
1. Bootstrap state backend (S3 + DynamoDB)
2. Create VPC module
3. Create ECR module
4. Create EKS module
5. Create RDS module
6. Create environment configurations (dev, production)

**Phase 5 (Day 3): CD Pipelines**
1. Create staging deployment pipeline
2. Create production deployment pipeline with approval gate
3. Add rollback mechanisms

### 9.3 Resource Estimates (Pod Sizing for Node.js)

Based on a NestJS application processing financial transactions with Prisma ORM:

| Resource   | Request  | Limit    | Rationale                                    |
|------------|----------|----------|----------------------------------------------|
| CPU        | 250m     | 500m     | Node.js single-threaded; scale horizontally   |
| Memory     | 256Mi    | 512Mi    | Prisma + NestJS overhead ~200MB baseline      |

**Scaling table for load targets**:

| TPS Target | Min Pods | Max Pods | Estimated Monthly Cost (t3.medium) |
|------------|----------|----------|------------------------------------|
| 100        | 2        | 5        | ~$60-$150                          |
| 500        | 3        | 10       | ~$90-$300                          |
| 1,000      | 3        | 15       | ~$90-$450                          |

These costs are for EKS node compute only. Total infrastructure cost including RDS, NAT Gateway, ALB, and data transfer will be approximately 3-5x higher.

### 9.4 Cost Optimization Tips

1. **Use Spot Instances** for non-production EKS node groups. Spot instances are 60-90% cheaper than on-demand for `t3.medium`.
   ```hcl
   # In EKS managed node group
   capacity_type = "SPOT"
   instance_types = ["t3.medium", "t3a.medium"]  # Multiple types for Spot availability
   ```

2. **Single NAT Gateway** in non-production environments. A NAT Gateway costs ~$32/month per AZ.

3. **RDS instance sizing**: Use `db.t3.medium` for dev/staging and `db.r6g.large` only for production.

4. **ECR lifecycle policies**: Automatically delete old images to avoid storage costs.

5. **Reserved Instances** or **Savings Plans** for production workloads with predictable usage (1-year commitment for ~30% savings).

6. **Right-size containers**: Start with the resource requests listed above and adjust based on actual usage metrics. Over-provisioning wastes money; under-provisioning causes throttling.

7. **Use Karpenter** instead of Cluster Autoscaler for more efficient node provisioning. Karpenter can select the cheapest instance type that meets pod requirements.

### 9.5 Monitoring and Observability (Post-Deployment)

While not part of the core infrastructure, monitoring is essential for a financial service. Recommended stack:

- **Metrics**: Prometheus + Grafana (or AWS CloudWatch Container Insights)
- **Logging**: Fluent Bit + CloudWatch Logs (or ELK stack)
- **Tracing**: AWS X-Ray or OpenTelemetry + Jaeger
- **Alerts**: PagerDuty or Opsgenie integration for P99 latency, error rate, and pod health

Key metrics to track for this wallet service:
- Transaction processing latency (p50, p95, p99)
- Error rate by endpoint
- Database connection pool utilization
- Node.js event loop lag
- Pod CPU and memory utilization
- HPA scaling events

---

## Appendix A: Complete Kubernetes Manifest Set

### Namespace

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: refacil-wallet
  labels:
    name: refacil-wallet
    environment: production
```

### Service

```yaml
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: refacil-wallet
  namespace: refacil-wallet
  labels:
    app: refacil-wallet
spec:
  type: ClusterIP
  ports:
    - port: 80
      targetPort: 3000
      protocol: TCP
      name: http
  selector:
    app: refacil-wallet
```

### Network Policy

```yaml
# k8s/network-policy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: refacil-wallet-netpol
  namespace: refacil-wallet
spec:
  podSelector:
    matchLabels:
      app: refacil-wallet
  policyTypes:
    - Ingress
    - Egress
  ingress:
    # Allow traffic from ingress controller
    - from:
        - namespaceSelector:
            matchLabels:
              name: ingress-nginx
      ports:
        - protocol: TCP
          port: 3000
  egress:
    # Allow DNS resolution
    - to:
        - namespaceSelector: {}
      ports:
        - protocol: UDP
          port: 53
        - protocol: TCP
          port: 53
    # Allow PostgreSQL (RDS)
    - to:
        - ipBlock:
            cidr: 10.0.21.0/24  # Database subnet
        - ipBlock:
            cidr: 10.0.22.0/24
        - ipBlock:
            cidr: 10.0.23.0/24
      ports:
        - protocol: TCP
          port: 5432
    # Allow HTTPS egress (for external APIs, AWS services)
    - to:
        - ipBlock:
            cidr: 0.0.0.0/0
      ports:
        - protocol: TCP
          port: 443
```

### Ingress (Optional)

```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: refacil-wallet-ingress
  namespace: refacil-wallet
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/rate-limit-window: "1m"
    nginx.ingress.kubernetes.io/proxy-body-size: "1m"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - wallet-api.refacil.com
      secretName: wallet-api-tls
  rules:
    - host: wallet-api.refacil.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: refacil-wallet
                port:
                  number: 80
```

---

## Appendix B: docker-compose.yml for Local Development

```yaml
# docker-compose.yml
version: "3.9"

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
      target: dependencies  # Use the dependencies stage for dev
    container_name: refacil-wallet-app
    command: npm run start:dev
    ports:
      - "3000:3000"
      - "9229:9229"  # Debug port
    volumes:
      - .:/app
      - /app/node_modules  # Prevent host node_modules from overriding
    environment:
      - NODE_ENV=development
      - PORT=3000
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/wallet_dev
      - LOG_LEVEL=debug
      - FRAUD_AMOUNT_THRESHOLD=10000
      - FRAUD_VELOCITY_WINDOW_MINUTES=5
      - FRAUD_VELOCITY_MAX_TRANSACTIONS=10
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    container_name: refacil-wallet-db
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=wallet_dev
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  db-test:
    image: postgres:16-alpine
    container_name: refacil-wallet-db-test
    ports:
      - "5433:5432"
    environment:
      - POSTGRES_USER=test
      - POSTGRES_PASSWORD=test
      - POSTGRES_DB=wallet_test
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U test"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
    driver: local
```

---

## Appendix C: Summary of Key Decisions

| Decision Area             | Choice                        | Rationale                                          |
|---------------------------|-------------------------------|----------------------------------------------------|
| Docker base image         | `node:20-alpine`              | Small footprint, sufficient for Node.js            |
| Signal handling           | `dumb-init` as PID 1          | Proper SIGTERM forwarding for graceful shutdown     |
| K8s probe separation      | `/health` vs `/health/ready`  | Avoids cascading restarts on DB issues             |
| HPA scaling direction     | Fast up (30s), slow down (5m) | Handle spikes quickly, avoid flapping              |
| Secrets management        | External Secrets + AWS SM     | Encrypted, auditable, auto-rotated                 |
| Deployment strategy       | Rolling update (maxUnavailable: 0) | Zero downtime with simple rollback            |
| DB migrations             | Kubernetes Job (pre-deploy)   | Run once, avoid N concurrent migrations            |
| Connection pooling        | RDS Proxy (production)        | Managed, auto-failover, IAM auth                   |
| Terraform state           | S3 + DynamoDB locking         | Standard AWS pattern, encrypted                    |
| CI/CD authentication      | GitHub OIDC + AWS IAM Roles   | No long-lived credentials                          |
| Node pool instance type   | `t3.medium` (2 vCPU, 4 GB)   | Balanced for Node.js workloads                     |
| Pod resources             | 250m/256Mi req, 500m/512Mi lim | Right-sized for NestJS + Prisma                  |
| Min replicas              | 3                             | HA across AZs, PDB minAvailable: 2                |
| Max replicas              | 15                            | Headroom for 1000 TPS with safety margin           |
