locals {
  environment = [
    { name = "TITO_REGION", value = var.tito_region },
    { name = "TITO_S3_BUCKET", value = local.shared.bucket_name },
    { name = "TITO_STATIC_PREFIX", value = local.static_prefix },
    { name = "TITO_OUTPUT_PREFIX", value = local.output_prefix },
    { name = "TITO_USES_STREAMSAT", value = var.uses_streamsat ? "1" : "0" },
    { name = "TITO_STREAMSAT_DOMAIN", value = var.streamsat_domain },
    { name = "TITO_STRICT_CHECKS", value = var.strict_checks ? "1" : "0" },
    { name = "TITO_IMAGE_TAG", value = local.image_tag },
    { name = "TITO_CYCLE_TIMEOUT_S", value = tostring(var.cycle_timeout_s) },
    { name = "EF5_RUNTIME", value = "local" },
    { name = "EF5_LOCAL_BIN", value = "/app/EF5/bin/ef5" },
    { name = "EF5_OMP_NUM_THREADS", value = "1" },
    { name = "EF5_MAX_WORKERS", value = tostring(var.ef5_max_workers) },
    { name = "TITO_FIM_ROOT", value = "/app" },
    { name = "STORMLAB_USE_TITO_ENV", value = "1" },
    { name = "PYTHONUNBUFFERED", value = "1" },
    { name = "TZ", value = "Etc/UTC" },
    { name = "AWS_REGION", value = var.region },
  ]

  pps_secrets = [
    { name = "TITO_GPM_EMAIL", valueFrom = local.shared.pps_secret_arn },
    { name = "IMERG_PPS_EMAIL", valueFrom = local.shared.pps_secret_arn },
  ]
  hsaf_secrets = [
    { name = "TITO_HSAF_FTP_USER", valueFrom = "${local.shared.hsaf_secret_arn}:user::" },
    { name = "TITO_HSAF_FTP_PASS", valueFrom = "${local.shared.hsaf_secret_arn}:password::" },
  ]
}

resource "aws_ecs_task_definition" "cycle" {
  family                   = local.name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.exec.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  ephemeral_storage {
    size_in_gib = var.ephemeral_storage_gib
  }

  dynamic "volume" {
    for_each = local.efs_mounts
    content {
      name = volume.key
      efs_volume_configuration {
        file_system_id     = local.shared.efs_id
        transit_encryption = "ENABLED"
        authorization_config {
          access_point_id = aws_efs_access_point.this[volume.key].id
          iam             = "ENABLED"
        }
      }
    }
  }

  container_definitions = jsonencode([{
    name        = "tito"
    image       = "${local.shared.ecr_repository_url}:${local.image_tag}"
    essential   = true
    environment = local.environment
    secrets     = concat(local.pps_secrets, var.uses_hsaf ? local.hsaf_secrets : [])
    mountPoints = [for k, path in local.efs_mounts : {
      sourceVolume  = k
      containerPath = path
      readOnly      = false
    }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.task.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "cycle"
      }
    }
  }])
}

# Hourly cycle, hh:05 UTC

resource "aws_scheduler_schedule" "cycle" {
  name                         = local.name
  schedule_expression          = var.schedule_expression
  schedule_expression_timezone = "UTC"
  state                        = var.schedule_enabled ? "ENABLED" : "DISABLED"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = local.shared.cluster_arn
    role_arn = aws_iam_role.scheduler.arn

    ecs_parameters {
      task_definition_arn     = aws_ecs_task_definition.cycle.arn
      task_count              = 1
      platform_version        = "LATEST"
      propagate_tags          = "TASK_DEFINITION"
      enable_ecs_managed_tags = true

      capacity_provider_strategy {
        capacity_provider = var.capacity_provider
        weight            = 1
      }

      network_configuration {
        subnets          = local.shared.subnet_ids
        security_groups  = [local.shared.task_security_group_id]
        assign_public_ip = true
      }
    }

    retry_policy {
      maximum_retry_attempts       = 3
      maximum_event_age_in_seconds = 900
    }

    dead_letter_config {
      arn = aws_sqs_queue.scheduler_dlq.arn
    }
  }
}

# Failed scheduler invocations land here

resource "aws_sqs_queue" "scheduler_dlq" {
  name                      = "${local.name}-scheduler-dlq"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
}
