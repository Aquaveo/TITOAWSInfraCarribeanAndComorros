output "cluster_arn" {
  value = aws_ecs_cluster.tito.arn
}

output "subnet_ids" {
  value = var.subnet_ids
}

output "task_security_group_id" {
  value = aws_security_group.task.id
}

output "efs_id" {
  value = aws_efs_file_system.tito.id
}

output "efs_arn" {
  value = aws_efs_file_system.tito.arn
}

output "bucket_name" {
  value = aws_s3_bucket.data.bucket
}

output "bucket_arn" {
  value = aws_s3_bucket.data.arn
}

output "ecr_repository_url" {
  value = aws_ecr_repository.tito.repository_url
}

output "pps_secret_arn" {
  value = aws_secretsmanager_secret.pps.arn
}

output "hsaf_secret_arn" {
  value = aws_secretsmanager_secret.hsaf.arn
}

output "alerts_topic_arn" {
  value = aws_sns_topic.alerts.arn
}

output "outputs_url" {
  value = "https://${aws_cloudfront_distribution.outputs.domain_name}/outputs"
}

output "site_url" {
  value = "https://${local.site_cert ? var.site_domain : aws_cloudfront_distribution.outputs.domain_name}/"
}

output "site_name_servers" {
  description = "NS records to add in the parent zone."
  value       = local.site_zone ? aws_route53_zone.site[0].name_servers : []
}

output "distribution_id" {
  value = aws_cloudfront_distribution.outputs.id
}
