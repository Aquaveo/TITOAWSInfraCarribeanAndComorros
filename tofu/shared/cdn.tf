# CloudFront: viewer and outputs

locals {
  # AWS managed policy IDs
  cache_optimized  = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  cache_disabled   = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
  security_headers = "67f7725c-6f97-4210-82d7-5512b31e9d03"

  # Extra headers per outputs policy
  outputs_headers = {
    outputs = {}
    latest  = { "Cache-Control" = "no-cache" }
  }
}

resource "aws_cloudfront_origin_access_control" "data" {
  name                              = "tito-data"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# CORS always, even on revalidation
resource "aws_cloudfront_response_headers_policy" "outputs" {
  for_each = local.outputs_headers
  name     = "tito-${each.key}"

  cors_config {
    access_control_allow_credentials = false
    access_control_max_age_sec       = 86400
    origin_override                  = true
    access_control_allow_headers {
      items = ["*"]
    }
    access_control_allow_methods {
      items = ["GET", "HEAD", "OPTIONS"]
    }
    access_control_allow_origins {
      items = ["*"]
    }
  }

  dynamic "custom_headers_config" {
    for_each = length(each.value) > 0 ? [each.value] : []
    content {
      dynamic "items" {
        for_each = custom_headers_config.value
        content {
          header   = items.key
          value    = items.value
          override = true
        }
      }
    }
  }
}

resource "aws_cloudfront_distribution" "outputs" {
  enabled             = true
  comment             = "TITO outputs"
  price_class         = "PriceClass_100"
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  aliases             = local.site_cert ? [var.site_domain] : []

  origin {
    origin_id                = "data"
    domain_name              = aws_s3_bucket.data.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.data.id
  }

  origin {
    origin_id                = "site"
    domain_name              = aws_s3_bucket.data.bucket_regional_domain_name
    origin_path              = "/site"
    origin_access_control_id = aws_cloudfront_origin_access_control.data.id
  }

  default_cache_behavior {
    target_origin_id           = "site"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    cache_policy_id            = local.cache_optimized
    response_headers_policy_id = local.security_headers
    compress                   = true
  }

  # Pointers change every cycle
  ordered_cache_behavior {
    path_pattern               = "outputs/*/latest.json"
    target_origin_id           = "data"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    cache_policy_id            = local.cache_disabled
    response_headers_policy_id = aws_cloudfront_response_headers_policy.outputs["latest"].id
    compress                   = true
  }

  ordered_cache_behavior {
    path_pattern               = "outputs/*"
    target_origin_id           = "data"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    cache_policy_id            = local.cache_optimized
    response_headers_policy_id = aws_cloudfront_response_headers_policy.outputs["outputs"].id
    compress                   = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = !local.site_cert
    acm_certificate_arn            = local.site_cert ? aws_acm_certificate_validation.site[0].certificate_arn : null
    ssl_support_method             = local.site_cert ? "sni-only" : null
    minimum_protocol_version       = local.site_cert ? "TLSv1.2_2021" : "TLSv1"
  }
}

data "aws_iam_policy_document" "data_bucket" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.data.arn, "${aws_s3_bucket.data.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }

  # Only outputs and site
  statement {
    sid       = "CloudFrontRead"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.data.arn}/outputs/*", "${aws_s3_bucket.data.arn}/site/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.outputs.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "data" {
  bucket = aws_s3_bucket.data.id
  policy = data.aws_iam_policy_document.data_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.data]
}
