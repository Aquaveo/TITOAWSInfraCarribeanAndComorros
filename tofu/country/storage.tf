# One access point per mount

resource "aws_efs_access_point" "this" {
  for_each       = local.efs_mounts
  file_system_id = local.shared.efs_id

  posix_user {
    uid = 0
    gid = 0
  }

  root_directory {
    path = "/${var.country}/${each.key}"
    creation_info {
      owner_uid   = 0
      owner_gid   = 0
      permissions = "0755"
    }
  }

  tags = { Name = "${local.name}-${each.key}" }
}

resource "aws_cloudwatch_log_group" "task" {
  name              = "/tito/${var.country}"
  retention_in_days = var.log_retention_days
}
