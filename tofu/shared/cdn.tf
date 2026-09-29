# CloudFront: public read of outputs

locals {
  # AWS managed policy IDs
  cache_optimized = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  cache_disabled  = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
  simple_cors     = "60669652-455b-4ae9-85a4-c4c02393f86c"
}

resource "aws_cloudfront_origin_access_control" "data" {
  name                              = "tito-data"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "outputs" {
  enabled         = true
  comment         = "TITO outputs"
  price_class     = "PriceClass_100"
  is_ipv6_enabled = true

  origin {
    origin_id                = "data"
    domain_name              = aws_s3_bucket.data.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.data.id
  }

  default_cache_behavior {
    target_origin_id           = "data"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    cache_policy_id            = local.cache_optimized
    response_headers_policy_id = local.simple_cors
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
    response_headers_policy_id = local.simple_cors
    compress                   = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
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

  # Only outputs, only this distribution
  statement {
    sid       = "CloudFrontReadOutputs"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.data.arn}/outputs/*"]
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
