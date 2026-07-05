#!/usr/bin/env node
/**
 * Scaffold a new company deployment folder from company-template/.
 *
 * Usage:
 *   node scripts/new-company.js <company-id>
 *
 * Example:
 *   node scripts/new-company.js acme
 *   -> creates deployments/acme/ with data.json, bookings.json and images/
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TEMPLATE_DIR = path.join(ROOT, 'company-template');
const DEPLOYMENTS_DIR = path.join(ROOT, 'deployments');

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, {recursive: true});
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function main() {
  const rawId = process.argv[2];
  if (!rawId) {
    console.error('Usage: node scripts/new-company.js <company-id>');
    process.exit(1);
  }

  const companyId = rawId.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(companyId)) {
    console.error(
        `Invalid company id: "${rawId}". Use lowercase letters, numbers and dashes only.`);
    process.exit(1);
  }

  if (!fs.existsSync(TEMPLATE_DIR)) {
    console.error(`Template folder not found: ${TEMPLATE_DIR}`);
    process.exit(1);
  }

  const target = path.join(DEPLOYMENTS_DIR, companyId);
  if (fs.existsSync(target)) {
    console.error(`Deployment already exists: ${target}`);
    process.exit(1);
  }

  copyRecursive(TEMPLATE_DIR, target);

  console.log(`Created new company deployment: ${target}`);
  console.log('\nNext steps:');
  console.log(`  1. Edit ${path.join('deployments', companyId, 'data.json')}`);
  console.log(`  2. Add images under ${path.join('deployments', companyId, 'images')}/`);
  console.log(`  3. Point the deployment at it:  COMPANY_DATA_PATH=${target}`);
  console.log(`  4. Provision its database and set DATABASE_URL / SESSION_SECRET.`);
}

main();
