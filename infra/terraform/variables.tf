variable "region" {
  description = "Primary AWS region for all Babuki infrastructure."
  type        = string
  default     = "ap-south-1"
}

variable "aws_profile" {
  description = "AWS CLI profile for the provider. Same AWS account as Home (551362153374) — that's fine, it's your account either way — but every resource here is new/separate, never shared with Home's."
  type        = string
  default     = "senthilkumar"
}

variable "account_id" {
  description = "AWS account id (same account Home runs in)."
  type        = string
  default     = "551362153374"
}

variable "env" {
  description = "Environment name, used in tags and resource names."
  type        = string
  default     = "prod"
}

variable "admin_cidr" {
  description = "CIDR allowed to SSH into the box (22/tcp). Narrow this to your own IP once known."
  type        = string
  default     = "0.0.0.0/0"
}

variable "instance_type" {
  description = "EC2 instance type. Runs the app + self-hosted Postgres+PostGIS on one box."
  type        = string
  default     = "t3.small"
}

variable "ssh_public_key_path" {
  description = "Local path to the public half of Babuki's own dedicated deploy key (never Home's me2us4u-app-box key — generated fresh with `ssh-keygen -t ed25519 -f ~/.ssh/babuki-app-box`)."
  type        = string
  default     = "C:/Users/prass/.ssh/babuki-app-box.pub"
}
