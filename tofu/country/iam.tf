data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Execution role: pull, logs, secrets

resource "aws_iam_role" "exec" {
  name                 = "${local.name}-exec"
  assume_role_policy   = data.aws_iam_policy_document.ecs_assume.json
  permissions_boundary = var.permissions_boundary_arn
}

resource "aws_iam_role_policy_attachment" "exec_managed" {
  role       = aws_iam_role.exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "exec_secrets" {
  statement {
    actions = ["secretsmanager:GetSecretValue"]
    resources = compact([
      local.shared.pps_secret_arn,
      var.uses_hsaf ? local.shared.hsaf_secret_arn : "",
    ])
  }
}

resource "aws_iam_role_policy" "exec_secrets" {
  name   = "read-secrets"
  role   = aws_iam_role.exec.id
  policy = data.aws_iam_policy_document.exec_secrets.json
}

# Task role: S3 and EFS

resource "aws_iam_role" "task" {
  name                 = "${local.name}-task"
  assume_role_policy   = data.aws_iam_policy_document.ecs_assume.json
  permissions_boundary = var.permissions_boundary_arn
}

data "aws_iam_policy_document" "task" {
  statement {
    sid       = "ListOwnPrefixes"
    actions   = ["s3:ListBucket"]
    resources = [local.shared.bucket_arn]
    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["static/${var.country}/*", "${local.output_prefix}/*"]
    }
  }
  statement {
    sid       = "ReadStaticData"
    actions   = ["s3:GetObject"]
    resources = ["${local.shared.bucket_arn}/static/${var.country}/*"]
  }
  statement {
    sid       = "WriteOutputs"
    actions   = ["s3:PutObject", "s3:GetObject"]
    resources = ["${local.shared.bucket_arn}/${local.output_prefix}/*"]
  }
  statement {
    sid       = "MountOwnAccessPoints"
    actions   = ["elasticfilesystem:ClientMount", "elasticfilesystem:ClientWrite", "elasticfilesystem:ClientRootAccess"]
    resources = [local.shared.efs_arn]
    condition {
      test     = "StringEquals"
      variable = "elasticfilesystem:AccessPointArn"
      values   = [for ap in aws_efs_access_point.this : ap.arn]
    }
  }
}

resource "aws_iam_role_policy" "task" {
  name   = "tito-task"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task.json
}

# Scheduler role: start the task

data "aws_iam_policy_document" "scheduler_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  name                 = "${local.name}-scheduler"
  assume_role_policy   = data.aws_iam_policy_document.scheduler_assume.json
  permissions_boundary = var.permissions_boundary_arn
}

data "aws_iam_policy_document" "scheduler" {
  statement {
    actions   = ["ecs:RunTask"]
    resources = ["arn:aws:ecs:${var.region}:${local.account}:task-definition/${local.name}:*"]
    condition {
      test     = "ArnEquals"
      variable = "ecs:cluster"
      values   = [local.shared.cluster_arn]
    }
  }
  statement {
    actions   = ["ecs:TagResource"]
    resources = ["*"]
  }
  statement {
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.scheduler_dlq.arn]
  }
  statement {
    actions   = ["iam:PassRole"]
    resources = [aws_iam_role.exec.arn, aws_iam_role.task.arn]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "scheduler" {
  name   = "run-task"
  role   = aws_iam_role.scheduler.id
  policy = data.aws_iam_policy_document.scheduler.json
}
