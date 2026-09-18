# Babuki's own VPC — not a subnet inside Home's VPC. A single public-facing
# box with an Elastic IP doesn't need a NAT Gateway, so full VPC separation
# adds no ongoing AWS cost (VPC/subnet/IGW/route table are all free).

resource "aws_vpc" "babuki" {
  cidr_block           = "10.20.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "babuki" }
}

resource "aws_internet_gateway" "babuki" {
  vpc_id = aws_vpc.babuki.id
  tags   = { Name = "babuki" }
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.babuki.id
  cidr_block              = "10.20.1.0/24"
  availability_zone       = "${var.region}a"
  map_public_ip_on_launch = true

  tags = { Name = "babuki-public" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.babuki.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.babuki.id
  }

  tags = { Name = "babuki-public" }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}
