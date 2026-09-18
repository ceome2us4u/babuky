# babuki.com's hosted zone already exists (Z035744116NBAF9XFN465, confirmed
# via `aws route53 list-hosted-zones`) — a data source, not a new zone.

data "aws_route53_zone" "babuki" {
  name         = "babuki.com."
  private_zone = false
}

# One wildcard record serves every vendor subdomain — no per-signup DNS API
# call needed.
resource "aws_route53_record" "wildcard" {
  zone_id = data.aws_route53_zone.babuki.zone_id
  name    = "*.babuki.com"
  type    = "A"
  ttl     = 300
  records = [aws_eip.babuki_app_box.public_ip]
}

resource "aws_route53_record" "apex" {
  zone_id = data.aws_route53_zone.babuki.zone_id
  name    = "babuki.com"
  type    = "A"
  ttl     = 300
  records = [aws_eip.babuki_app_box.public_ip]
}
