resource "aws_ecr_repository" "wallet" {
  name                 = var.project_name
  image_tag_mutability = "MUTABLE"  # Allow overwriting 'latest' tag

  image_scanning_configuration {
    scan_on_push = true  # Automatically scan images on push
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = { Name = var.project_name }
}

# Lifecycle policy: keep last 10 production images, expire untagged after 1 day
resource "aws_ecr_lifecycle_policy" "wallet" {
  repository = aws_ecr_repository.wallet.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images after 1 day"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Keep only last 10 tagged images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["sha-", "staging-"]
          countType     = "imageCountMoreThan"
          countNumber   = 10
        }
        action = { type = "expire" }
      }
    ]
  })
}
