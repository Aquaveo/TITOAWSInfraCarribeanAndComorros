# Markers printed by the wrapper

locals {
  markers = merge(
    {
      failed  = "TITO_TASK_FAILED"
      cycleok = "TITO_CYCLE_OK"
      skipped = "TITO_CYCLE_SKIPPED"
    },
    var.uses_streamsat ? { coldstart = "STREAMSAT_COLD_START" } : {},
  )
}

resource "aws_cloudwatch_log_metric_filter" "marker" {
  for_each       = local.markers
  name           = "${local.name}-${each.key}"
  log_group_name = aws_cloudwatch_log_group.task.name
  pattern        = "\"${each.value}\""

  metric_transformation {
    name          = "${each.key}-${var.country}"
    namespace     = "TITO"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "failed" {
  alarm_name          = "${local.name}-cycle-failed"
  alarm_description   = "A TITO cycle for ${var.tito_region} failed."
  namespace           = "TITO"
  metric_name         = "failed-${var.country}"
  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [local.shared.alerts_topic_arn]
  depends_on          = [aws_cloudwatch_log_metric_filter.marker]
}

resource "aws_cloudwatch_metric_alarm" "no_cycle" {
  count               = var.schedule_enabled ? 1 : 0
  alarm_name          = "${local.name}-no-cycle"
  alarm_description   = "No successful ${var.tito_region} cycle in 2 hours."
  namespace           = "TITO"
  metric_name         = "cycleok-${var.country}"
  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [local.shared.alerts_topic_arn]
  ok_actions          = [local.shared.alerts_topic_arn]
  depends_on          = [aws_cloudwatch_log_metric_filter.marker]
}

resource "aws_cloudwatch_metric_alarm" "coldstart" {
  count               = var.uses_streamsat ? 1 : 0
  alarm_name          = "${local.name}-streamsat-cold-start"
  alarm_description   = "STREAM-Sat ran without its saved state for ${var.tito_region}."
  namespace           = "TITO"
  metric_name         = "coldstart-${var.country}"
  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [local.shared.alerts_topic_arn]
  depends_on          = [aws_cloudwatch_log_metric_filter.marker]
}

resource "aws_cloudwatch_metric_alarm" "skipped" {
  alarm_name          = "${local.name}-cycle-skipped"
  alarm_description   = "A ${var.tito_region} cycle skipped: previous one still running."
  namespace           = "TITO"
  metric_name         = "skipped-${var.country}"
  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [local.shared.alerts_topic_arn]
  depends_on          = [aws_cloudwatch_log_metric_filter.marker]
}

resource "aws_cloudwatch_metric_alarm" "scheduler_dlq" {
  alarm_name          = "${local.name}-scheduler-failed"
  alarm_description   = "The scheduler could not start a ${var.tito_region} task."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  dimensions          = { QueueName = aws_sqs_queue.scheduler_dlq.name }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [local.shared.alerts_topic_arn]
}
