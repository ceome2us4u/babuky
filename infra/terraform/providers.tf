provider "aws" {
  region  = var.region
  profile = var.aws_profile

  default_tags {
    tags = {
      Project   = "babuki"
      Env       = var.env
      ManagedBy = "terraform"
      # Explicit marker, not just implied by naming — every resource here
      # is isolated from Me2Us4U's own infrastructure by design.
      Isolation = "separate-from-me2us4u"
    }
  }
}
