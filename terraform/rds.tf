resource "aws_db_subnet_group" "postgres" {
  name       = "${var.project_name}-db-subnet-group"
  subnet_ids = aws_subnet.private[*].id
  tags       = { Name = "${var.project_name}-db-subnet-group" }
}

resource "aws_db_parameter_group" "postgres" {
  name   = "${var.project_name}-postgres16"
  family = "postgres16"

  # Performance and reliability tuning
  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
  }
  parameter {
    name  = "log_min_duration_statement"
    value = "1000"  # Log queries slower than 1 second
  }
  parameter {
    name  = "log_connections"
    value = "1"
  }
}

resource "aws_db_instance" "postgres" {
  identifier = "${var.project_name}-postgres"

  engine         = "postgres"
  engine_version = "16"
  instance_class = var.rds_instance_class

  allocated_storage     = var.rds_allocated_storage
  max_allocated_storage = var.rds_max_allocated_storage  # Enable storage autoscaling
  storage_type          = "gp3"
  storage_encrypted     = true  # Encryption at rest

  db_name  = var.db_name
  username = var.db_username
  # Password managed via AWS Secrets Manager — see iam.tf
  manage_master_user_password = true

  db_subnet_group_name   = aws_db_subnet_group.postgres.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  parameter_group_name   = aws_db_parameter_group.postgres.name

  multi_az               = true  # Multi-AZ for high availability
  publicly_accessible    = false

  backup_retention_period = 7      # 7-day automated backups
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  performance_insights_enabled          = true
  performance_insights_retention_period = 7

  deletion_protection = true  # Prevent accidental deletion in production
  skip_final_snapshot = false
  final_snapshot_identifier = "${var.project_name}-postgres-final-snapshot"

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  tags = { Name = "${var.project_name}-postgres" }
}
