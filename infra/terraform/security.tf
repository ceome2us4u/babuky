# Babuki's own dedicated deploy key — never Home's me2us4u-app-box key.
resource "aws_key_pair" "babuki_app_box" {
  key_name   = "babuki-app-box"
  public_key = file(var.ssh_public_key_path)
}

resource "aws_security_group" "babuki_app_box" {
  name        = "babuki-app-box"
  description = "Babuki app box: 80/443 open, 22 restricted to admin_cidr"
  vpc_id      = aws_vpc.babuki.id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "SSH (deploys only) - narrow admin_cidr once your IP is known"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.admin_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "babuki-app-box" }
}

# --- Instance role: SSM, Secrets Manager (babuki/* only), S3 (this bucket
# only), Route 53 ChangeResourceRecordSets (babuki.com zone only) ----------

data "aws_iam_policy_document" "ec2_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "babuki_app_box" {
  name               = "babuki-app-box"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.babuki_app_box.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy" "secrets_manager" {
  name = "babuki-secrets-manager-read"
  role = aws_iam_role.babuki_app_box.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:babuki/*"
    }]
  })
}

resource "aws_iam_role_policy" "s3_item_images" {
  name = "babuki-s3-item-images"
  role = aws_iam_role.babuki_app_box.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
        Resource = "${aws_s3_bucket.item_images.arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.item_images.arn
      },
    ]
  })
}

resource "aws_iam_role_policy" "route53_wildcard_cert" {
  name = "babuki-route53-dns01"
  role = aws_iam_role.babuki_app_box.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["route53:ChangeResourceRecordSets", "route53:ListResourceRecordSets"]
        Resource = "arn:aws:route53:::hostedzone/${data.aws_route53_zone.babuki.zone_id}"
      },
      {
        Effect   = "Allow"
        Action   = ["route53:GetChange"]
        Resource = "arn:aws:route53:::change/*"
      },
      {
        Effect   = "Allow"
        Action   = ["route53:ListHostedZones"]
        Resource = "*"
      },
    ]
  })
}

resource "aws_iam_instance_profile" "babuki_app_box" {
  name = "babuki-app-box"
  role = aws_iam_role.babuki_app_box.name
}
