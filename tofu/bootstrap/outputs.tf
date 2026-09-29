output "deploy_role_arn" {
  value = aws_iam_role.deploy.arn
}

output "plan_role_arn" {
  value = aws_iam_role.plan.arn
}

output "ci_boundary_arn" {
  value = aws_iam_policy.ci_boundary.arn
}

output "operator_policy_arn" {
  value = aws_iam_policy.operator.arn
}
