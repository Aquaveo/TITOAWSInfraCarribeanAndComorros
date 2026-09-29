output "task_definition_arn" {
  value = aws_ecs_task_definition.cycle.arn
}

output "schedule_name" {
  value = aws_scheduler_schedule.cycle.name
}

output "log_group" {
  value = aws_cloudwatch_log_group.task.name
}

output "static_prefix" {
  value = local.static_prefix
}

output "output_prefix" {
  value = local.output_prefix
}

output "image_tag" {
  value = local.image_tag
}

output "scheduler_dlq_url" {
  value = aws_sqs_queue.scheduler_dlq.url
}
