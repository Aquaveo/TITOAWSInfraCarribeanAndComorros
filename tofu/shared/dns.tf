# Viewer domain, delegated zone

locals {
  site_zone = var.site_domain != ""
  site_cert = local.site_zone && var.site_domain_delegated
}

resource "aws_route53_zone" "site" {
  count = local.site_zone ? 1 : 0
  name  = var.site_domain
}

resource "aws_acm_certificate" "site" {
  count             = local.site_cert ? 1 : 0
  domain_name       = var.site_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "site_validation" {
  for_each = local.site_cert ? {
    for o in aws_acm_certificate.site[0].domain_validation_options : o.domain_name => o
  } : {}
  zone_id = aws_route53_zone.site[0].zone_id
  name    = each.value.resource_record_name
  type    = each.value.resource_record_type
  records = [each.value.resource_record_value]
  ttl     = 300
}

resource "aws_acm_certificate_validation" "site" {
  count                   = local.site_cert ? 1 : 0
  certificate_arn         = aws_acm_certificate.site[0].arn
  validation_record_fqdns = [for r in aws_route53_record.site_validation : r.fqdn]
}

resource "aws_route53_record" "site_alias" {
  for_each = local.site_cert ? toset(["A", "AAAA"]) : toset([])
  zone_id  = aws_route53_zone.site[0].zone_id
  name     = var.site_domain
  type     = each.key

  alias {
    name                   = aws_cloudfront_distribution.outputs.domain_name
    zone_id                = aws_cloudfront_distribution.outputs.hosted_zone_id
    evaluate_target_health = false
  }
}
