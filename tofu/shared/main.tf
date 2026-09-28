# ECS cluster

resource "aws_ecs_cluster" "tito" {
  name = "tito"
  setting {
    name  = "containerInsights"
    value = var.container_insights ? "enabled" : "disabled"
  }
}

resource "aws_ecs_cluster_capacity_providers" "tito" {
  cluster_name       = aws_ecs_cluster.tito.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]
}

# Network

resource "aws_security_group" "task" {
  name        = "tito-task"
  description = "TITO tasks, outbound only"
  vpc_id      = var.vpc_id
}

resource "aws_vpc_security_group_egress_rule" "task_all" {
  security_group_id = aws_security_group.task.id
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_security_group" "efs" {
  name        = "tito-efs"
  description = "NFS from TITO tasks"
  vpc_id      = var.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "efs_from_task" {
  security_group_id            = aws_security_group.efs.id
  ip_protocol                  = "tcp"
  from_port                    = 2049
  to_port                      = 2049
  referenced_security_group_id = aws_security_group.task.id
}

# EFS: states between cycles

resource "aws_efs_file_system" "tito" {
  creation_token   = "tito"
  encrypted        = true
  performance_mode = "generalPurpose"
  throughput_mode  = "elastic"
  tags             = { Name = "tito" }
}

resource "aws_efs_mount_target" "tito" {
  for_each        = toset(var.subnet_ids)
  file_system_id  = aws_efs_file_system.tito.id
  subnet_id       = each.value
  security_groups = [aws_security_group.efs.id]
}

data "aws_iam_policy_document" "efs" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["*"]
    }
    resources = [aws_efs_file_system.tito.arn]
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_efs_file_system_policy" "tito" {
  file_system_id = aws_efs_file_system.tito.id
  policy         = data.aws_iam_policy_document.efs.json
}

# S3: static data and outputs

resource "aws_s3_bucket" "data" {
  bucket = local.bucket_name
}

resource "aws_s3_bucket_ownership_controls" "data" {
  bucket = aws_s3_bucket.data.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "data" {
  bucket                  = aws_s3_bucket.data.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "data" {
  bucket = aws_s3_bucket.data.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "data" {
  bucket = aws_s3_bucket.data.id

  rule {
    id     = "expire-outputs"
    status = "Enabled"
    filter {
      prefix = "outputs/"
    }
    expiration {
      days = var.outputs_expiration_days
    }
  }

  rule {
    id     = "abort-incomplete-uploads"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

# ECR: wrapper images

resource "aws_ecr_repository" "tito" {
  name                 = "tito"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "tito" {
  repository = aws_ecr_repository.tito.name
  policy = jsonencode({
    rules = concat(
      [{
        rulePriority = 1
        description  = "Expire untagged images after 1 day"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = { type = "expire" }
      }],
      [for i, c in var.countries : {
        rulePriority = i + 2
        description  = "Keep the newest ${var.images_per_country} ${c} images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["${c}-"]
          countType     = "imageCountMoreThan"
          countNumber   = var.images_per_country
        }
        action = { type = "expire" }
      }],
    )
  })
}

# Secrets: values set outside tofu

resource "aws_secretsmanager_secret" "pps" {
  name                    = "tito/nasa-pps-email"
  description             = "NASA PPS login email for IMERG downloads."
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret" "hsaf" {
  name                    = "tito/hsaf-ftp"
  description             = "HSAF FTP login as JSON: user, password."
  recovery_window_in_days = 7
}

# Alerts

resource "aws_sns_topic" "alerts" {
  name = "tito-alerts"
}

resource "aws_sns_topic_subscription" "email" {
  for_each  = toset(var.alert_emails)
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = each.value
}
