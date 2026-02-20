output "eks_cluster_name" {
  description = "Name of the EKS cluster"
  value       = aws_eks_cluster.main.name
}

output "eks_cluster_endpoint" {
  description = "Endpoint URL for the EKS API server"
  value       = aws_eks_cluster.main.endpoint
  sensitive   = true
}

output "eks_cluster_certificate_authority" {
  description = "Base64-encoded certificate authority data for the EKS cluster"
  value       = aws_eks_cluster.main.certificate_authority[0].data
  sensitive   = true
}

output "rds_endpoint" {
  description = "Connection endpoint for the RDS PostgreSQL instance"
  value       = aws_db_instance.postgres.endpoint
  sensitive   = true
}

output "rds_port" {
  description = "Port for the RDS PostgreSQL instance"
  value       = aws_db_instance.postgres.port
}

output "ecr_repository_url" {
  description = "URL of the ECR container registry repository"
  value       = aws_ecr_repository.wallet.repository_url
}

output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.main.id
}

output "private_subnet_ids" {
  description = "IDs of private subnets (for EKS nodes and RDS)"
  value       = aws_subnet.private[*].id
}

output "aws_account_id" {
  description = "AWS account ID"
  value       = data.aws_caller_identity.current.account_id
}
