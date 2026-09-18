---
name: babuki-architecture
description: Babuki/Babuky platform architecture — data model, API surface, infra, and the Me2Us4U isolation rule. Load before touching schema, auth, payments, the catalog, or any infra/terraform/deploy work in this repo.
---

# Babuki architecture

The full, current architecture lives in [`docs/architecture.md`](../../../docs/architecture.md)
at the repo root — read it before making changes in any of the areas this
skill triggers on. It covers: what the product is (hyperlocal vendor
storefronts + software consultancy estimator), the repo layout, the
Me2Us4U isolation rule (what's separate, what's intentionally shared, and
why), the full data model, the API surface, and the Terraform-managed
infrastructure + deploy path.

Working rules for this repo (branching, staging commits, AWS profile
hygiene, verify-before-PR) live in the repo's own root
[`CLAUDE.md`](../../../CLAUDE.md) — always in effect, not conditional on
this skill triggering.

**Keeping this current is non-negotiable, not optional housekeeping**: any
change to the schema, API surface, infra, or the isolation boundary
updates `docs/architecture.md` in the *same* commit/PR that makes the
change — see `CLAUDE.md`'s "Keep docs/architecture.md current" section.
There is no tool that regenerates it automatically; this instruction is
the mechanism. If you find this skill or the doc contradicted by the
actual code, fix the doc in the same change, don't just work around the
discrepancy.
