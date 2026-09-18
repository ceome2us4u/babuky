terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Dedicated to Babuki — not Home's me2us4u-tfstate-* bucket. Created
  # out-of-band before this config existed (aws s3api create-bucket),
  # same convention as Home: intentionally not managed by this config.
  backend "s3" {
    bucket       = "babuki-tfstate-551362153374"
    key          = "prod/infra.tfstate"
    region       = "ap-south-1"
    encrypt      = true
    use_lockfile = true
  }
}
