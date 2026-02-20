variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment (production, staging)"
  type        = string
  default     = "production"
  validation {
    condition     = contains(["production", "staging"], var.environment)
    error_message = "Environment must be 'production' or 'staging'."
  }
}

variable "project_name" {
  description = "Project name used for resource naming and tagging"
  type        = string
  default     = "refacil-wallet"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "eks_cluster_version" {
  description = "Kubernetes version for EKS cluster"
  type        = string
  default     = "1.29"
}

variable "eks_node_instance_types" {
  description = "EC2 instance types for EKS node group"
  type        = list(string)
  default     = ["t3.medium"]
}

variable "eks_min_size" {
  description = "Minimum number of EKS worker nodes"
  type        = number
  default     = 2
}

variable "eks_max_size" {
  description = "Maximum number of EKS worker nodes"
  type        = number
  default     = 10
}

variable "eks_desired_size" {
  description = "Desired number of EKS worker nodes"
  type        = number
  default     = 3
}

variable "rds_instance_class" {
  description = "RDS instance class for PostgreSQL"
  type        = string
  default     = "db.t3.medium"
}

variable "rds_allocated_storage" {
  description = "Initial storage in GB for RDS instance"
  type        = number
  default     = 20
}

variable "rds_max_allocated_storage" {
  description = "Maximum storage in GB for RDS autoscaling"
  type        = number
  default     = 100
}

variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
  # No default - must be explicitly provided
}

variable "db_username" {
  description = "PostgreSQL master username"
  type        = string
  # No default - must be explicitly provided
}
