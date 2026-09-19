# Real secrets, generated here (never leave AWS) or left as an empty
# placeholder for you to fill in later (deploy.sh degrades gracefully to
# "not configured", same as Home's scripts/deploy.sh pattern, rather than
# failing the whole deploy on a missing third-party credential).

resource "random_password" "db" {
  length  = 32
  special = false
}

resource "random_password" "session_secret" {
  length  = 64
  special = false
}

locals {
  db_name = "babuki"
  db_user = "babuki"
  db_url  = "postgres://${local.db_user}:${random_password.db.result}@localhost:5432/${local.db_name}"
}

resource "aws_secretsmanager_secret" "db_url" {
  name = "babuki/prod/db-url"
}

resource "aws_secretsmanager_secret_version" "db_url" {
  secret_id     = aws_secretsmanager_secret.db_url.id
  secret_string = local.db_url
}

# Raw password too (not just the composite URL above) — user_data reads
# this one directly to create/align the actual Postgres role at boot.
resource "aws_secretsmanager_secret" "db_password" {
  name = "babuki/prod/db-password"
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = random_password.db.result
}

resource "aws_secretsmanager_secret" "session_secret" {
  name = "babuki/prod/session-secret"
}

resource "aws_secretsmanager_secret_version" "session_secret" {
  secret_id     = aws_secretsmanager_secret.session_secret.id
  secret_string = random_password.session_secret.result
}

# --- Placeholders: real values come from you, never fabricated here -------

resource "aws_secretsmanager_secret" "msg91_auth_key" {
  name = "babuki/prod/msg91-auth-key"
}
resource "aws_secretsmanager_secret_version" "msg91_auth_key" {
  secret_id     = aws_secretsmanager_secret.msg91_auth_key.id
  secret_string = "not-configured-yet"
  lifecycle {
    ignore_changes = [secret_string] # don't clobber a real value set later out-of-band
  }
}

resource "aws_secretsmanager_secret" "razorpay_key_secret" {
  name = "babuki/prod/razorpay-key-secret"
}
resource "aws_secretsmanager_secret_version" "razorpay_key_secret" {
  secret_id     = aws_secretsmanager_secret.razorpay_key_secret.id
  secret_string = "not-configured-yet"
  lifecycle {
    ignore_changes = [secret_string]
  }
}

resource "aws_secretsmanager_secret" "razorpay_webhook_secret" {
  name = "babuki/prod/razorpay-webhook-secret"
}
resource "aws_secretsmanager_secret_version" "razorpay_webhook_secret" {
  secret_id     = aws_secretsmanager_secret.razorpay_webhook_secret.id
  secret_string = "not-configured-yet"
  lifecycle {
    ignore_changes = [secret_string]
  }
}

# --- Razorpay TEST-mode credentials --------------------------------------
# APP_MODE=test (scripts/set-app-mode.sh) makes the API use these instead of
# the LIVE ones above — one switch for everything, same convention as the Home
# repo. Placeholders until you paste the real values from Razorpay's TEST-mode
# dashboard (Settings -> API Keys / Webhooks, and a ₹500/mo plan created while
# in Test mode). Until then test-mode payments fail closed ("not configured");
# they never fall back to the LIVE keys. Set values in the Secrets Manager
# console — no code change or redeploy of the secrets themselves is needed.
locals {
  razorpay_test_secrets = {
    "razorpay-key-id-test"         = "Razorpay TEST key id (rzp_test_...)"
    "razorpay-key-secret-test"     = "Razorpay TEST key secret"
    "razorpay-webhook-secret-test" = "Razorpay TEST webhook signing secret"
    "razorpay-vendor-plan-id-test" = "Razorpay TEST-mode INR 500/mo vendor plan id"
  }
}

resource "aws_secretsmanager_secret" "razorpay_test" {
  for_each    = local.razorpay_test_secrets
  name        = "babuki/prod/${each.key}"
  description = each.value
}

resource "aws_secretsmanager_secret_version" "razorpay_test" {
  for_each      = local.razorpay_test_secrets
  secret_id     = aws_secretsmanager_secret.razorpay_test[each.key].id
  secret_string = "not-configured-yet"
  lifecycle {
    ignore_changes = [secret_string] # never clobber a real value set later
  }
}
