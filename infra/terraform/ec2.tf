data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_instance" "babuki_app_box" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.babuki_app_box.id]
  iam_instance_profile   = aws_iam_instance_profile.babuki_app_box.name
  key_name               = aws_key_pair.babuki_app_box.key_name

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
  }

  user_data = templatefile("${path.module}/templates/user_data.sh.tpl", {
    region = var.region
  })

  # A redeploy (scripts/deploy.sh) never needs an instance replacement —
  # user_data only ever runs once, at first boot.
  lifecycle {
    ignore_changes = [user_data, ami]
  }

  tags = { Name = "babuki-app-box" }
}

resource "aws_eip" "babuki_app_box" {
  instance = aws_instance.babuki_app_box.id
  domain   = "vpc"
  tags     = { Name = "babuki-app-box" }
}

output "app_box_public_ip" {
  description = "Elastic IP of the app box. scripts/deploy.sh targets this."
  value       = aws_eip.babuki_app_box.public_ip
}

output "app_box_instance_id" {
  value = aws_instance.babuki_app_box.id
}
