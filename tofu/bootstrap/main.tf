terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
  }
  backend "s3" {
    use_lockfile = true
    encrypt      = true
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { project = "tito", managed-by = "opentofu" }
  }
}

data "aws_caller_identity" "me" {}

locals {
  account     = data.aws_caller_identity.me.account_id
  data_bucket = var.data_bucket != "" ? var.data_bucket : "tito-data-${local.account}"
  gh_repo     = "${var.github_org}@${var.github_org_id}/${var.github_repo}@${var.github_repo_id}"
  oidc_provider_arn = (var.create_oidc_provider
    ? aws_iam_openid_connect_provider.github[0].arn
  : "arn:aws:iam::${local.account}:oidc-provider/token.actions.githubusercontent.com")

  deploy_subjects = [for e in concat(["shared"], var.countries) : "repo:${local.gh_repo}:environment:${e}"]

  role_arn = "arn:aws:iam::${local.account}:role"
  task_roles = flatten([for c in var.countries : [
    "${local.role_arn}/tito-${c}-exec",
    "${local.role_arn}/tito-${c}-task",
  ]])
  scheduler_roles = [for c in var.countries : "${local.role_arn}/tito-${c}-scheduler"]
  managed_roles   = concat(local.task_roles, local.scheduler_roles)
}

resource "aws_iam_openid_connect_provider" "github" {
  count           = var.create_oidc_provider ? 1 : 0
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1", "1c58a3a8518e8759bf075b76b750d4f2df264fcd"]
}

# Shared PassRole statements

data "aws_iam_policy_document" "pass_task_roles" {
  statement {
    sid       = "PassTaskRolesToEcs"
    actions   = ["iam:PassRole"]
    resources = local.task_roles
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "pass_scheduler_roles" {
  statement {
    sid       = "PassSchedulerRoles"
    actions   = ["iam:PassRole"]
    resources = local.scheduler_roles
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["scheduler.amazonaws.com"]
    }
  }
}

# Deploy role, per environment

data "aws_iam_policy_document" "assume_deploy" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [local.oidc_provider_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = local.deploy_subjects
    }
  }
}

resource "aws_iam_role" "deploy" {
  name               = "tito-deploy"
  assume_role_policy = data.aws_iam_policy_document.assume_deploy.json
}

resource "aws_iam_role_policy_attachment" "deploy_poweruser" {
  role       = aws_iam_role.deploy.name
  policy_arn = "arn:aws:iam::aws:policy/PowerUserAccess"
}

# Ceiling for roles CI creates
data "aws_iam_policy_document" "ci_boundary" {
  source_policy_documents = [data.aws_iam_policy_document.pass_task_roles.json]

  statement {
    sid         = "NoIamOrAccountChanges"
    effect      = "Allow"
    not_actions = ["iam:*", "organizations:*", "account:*", "sts:AssumeRole"]
    resources   = ["*"]
  }
}

resource "aws_iam_policy" "ci_boundary" {
  name        = "tito-ci-boundary"
  description = "Ceiling for TITO task, execution and scheduler roles."
  policy      = data.aws_iam_policy_document.ci_boundary.json
}

data "aws_iam_policy_document" "deploy_iam" {
  source_policy_documents = [
    data.aws_iam_policy_document.pass_task_roles.json,
    data.aws_iam_policy_document.pass_scheduler_roles.json,
  ]

  statement {
    sid       = "ReadTitoRoles"
    actions   = ["iam:GetRole", "iam:GetRolePolicy", "iam:ListRolePolicies", "iam:ListAttachedRolePolicies", "iam:ListInstanceProfilesForRole"]
    resources = ["${local.role_arn}/tito-*"]
  }
  statement {
    sid       = "CreateRolesUnderBoundary"
    actions   = ["iam:CreateRole", "iam:PutRolePermissionsBoundary"]
    resources = local.managed_roles
    condition {
      test     = "StringEquals"
      variable = "iam:PermissionsBoundary"
      values   = [aws_iam_policy.ci_boundary.arn]
    }
  }
  statement {
    sid       = "ManageBoundedRoles"
    actions   = ["iam:DeleteRole", "iam:TagRole", "iam:UntagRole", "iam:UpdateAssumeRolePolicy", "iam:PutRolePolicy", "iam:DeleteRolePolicy", "iam:DetachRolePolicy"]
    resources = local.managed_roles
  }
  statement {
    sid       = "AttachOnlyEcsExecutionPolicy"
    actions   = ["iam:AttachRolePolicy"]
    resources = local.managed_roles
    condition {
      test     = "ArnEquals"
      variable = "iam:PolicyARN"
      values   = ["arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"]
    }
  }
}

resource "aws_iam_role_policy" "deploy_iam" {
  name   = "tito-role-management"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy_iam.json
}

data "aws_iam_policy_document" "state_rw" {
  statement {
    actions   = ["s3:ListBucket", "s3:GetBucketVersioning"]
    resources = ["arn:aws:s3:::${var.state_bucket}"]
  }
  statement {
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["arn:aws:s3:::${var.state_bucket}/tito/*"]
  }
}

resource "aws_iam_role_policy" "deploy_state" {
  name   = "tito-state"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.state_rw.json
}

# Plan role: pull requests, read-only

data "aws_iam_policy_document" "assume_plan" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [local.oidc_provider_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${local.gh_repo}:pull_request"]
    }
  }
}

resource "aws_iam_role" "plan" {
  name               = "tito-plan"
  assume_role_policy = data.aws_iam_policy_document.assume_plan.json
}

resource "aws_iam_role_policy_attachment" "plan_readonly" {
  role       = aws_iam_role.plan.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

data "aws_iam_policy_document" "state_read" {
  statement {
    actions   = ["s3:ListBucket"]
    resources = ["arn:aws:s3:::${var.state_bucket}"]
  }
  statement {
    actions   = ["s3:GetObject"]
    resources = ["arn:aws:s3:::${var.state_bucket}/tito/*"]
  }
}

resource "aws_iam_role_policy" "plan_state" {
  name   = "tito-state-read"
  role   = aws_iam_role.plan.id
  policy = data.aws_iam_policy_document.state_read.json
}

# Operator access: IAM Identity Center

data "aws_iam_policy_document" "operator" {
  source_policy_documents = [
    data.aws_iam_policy_document.pass_task_roles.json,
    data.aws_iam_policy_document.pass_scheduler_roles.json,
  ]

  statement {
    sid       = "RunAndStopTitoTasks"
    actions   = ["ecs:RunTask", "ecs:StopTask", "ecs:DescribeTasks", "ecs:ListTasks", "ecs:DescribeTaskDefinition", "ecs:ListTaskDefinitions", "ecs:DescribeClusters"]
    resources = ["*"]
  }
  statement {
    sid       = "PauseAndResumeSchedules"
    actions   = ["scheduler:GetSchedule", "scheduler:ListSchedules", "scheduler:UpdateSchedule"]
    resources = ["arn:aws:scheduler:${var.region}:${local.account}:schedule/default/tito-*"]
  }
  statement {
    sid       = "ReadLogsAndAlarms"
    actions   = ["logs:GetLogEvents", "logs:FilterLogEvents", "logs:DescribeLogGroups", "logs:DescribeLogStreams", "logs:StartQuery", "logs:GetQueryResults", "cloudwatch:DescribeAlarms", "cloudwatch:GetMetricData"]
    resources = ["*"]
  }
  statement {
    sid       = "ListDataBucket"
    actions   = ["s3:ListBucket"]
    resources = ["arn:aws:s3:::${local.data_bucket}"]
  }
  statement {
    sid       = "ReadDataBucket"
    actions   = ["s3:GetObject"]
    resources = ["arn:aws:s3:::${local.data_bucket}/*"]
  }
}

resource "aws_iam_policy" "operator" {
  name        = "tito-operator"
  description = "Run, stop and pause TITO tasks; read logs and outputs."
  policy      = data.aws_iam_policy_document.operator.json
}
