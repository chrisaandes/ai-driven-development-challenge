---
description: Crea infraestructura con 4 agentes en paralelo
---

Create an agent team named "infra-team" for infrastructure setup.

**All agents work in parallel - no dependencies:**

**Teammate "docker-dev":**
- Dockerfile (multi-stage: dev, build, prod)
- docker-compose.yml (app + postgres)
- docker-compose.test.yml
- .dockerignore

Requirements: Node 20 Alpine, non-root user, health check

**Teammate "k8s-dev":**
Create in k8s/:
- namespace.yaml
- configmap.yaml
- secret.yaml (template)
- deployment.yaml (3 replicas, probes)
- service.yaml
- hpa.yaml (2-10 pods, 70% CPU)
- ingress.yaml
- network-policy.yaml

**Teammate "terraform-dev":**
Create in terraform/:
- main.tf, variables.tf, outputs.tf
- vpc.tf (VPC, subnets, NAT)
- eks.tf (EKS cluster)
- rds.tf (PostgreSQL Multi-AZ)
- ecr.tf, iam.tf, security-groups.tf

**Teammate "cicd-dev":**
Create in .github/workflows/:
- ci.yml (lint, test, build on PR)
- cd-staging.yml (deploy on develop)
- cd-production.yml (deploy on main)

Begin parallel infrastructure setup.
