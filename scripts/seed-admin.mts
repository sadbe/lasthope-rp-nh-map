#!/usr/bin/env node
/**
 * Seed script — creates the first admin user in the AdminUser table.
 *
 * Usage:
 *   npm run db:seed
 *
 * Reads from env:
 *   ADMIN_EMAIL       — admin email (required)
 *   ADMIN_PASSWORD     — plain-text password (required, will be bcrypt-hashed)
 *   ADMIN_NAME         — display name (optional)
 *
 * If the admin already exists, prints a notice and exits without clobbering.
 */
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME;

  if (!email || !password) {
    console.error('Missing ADMIN_EMAIL or ADMIN_PASSWORD environment variables.');
    console.error('');
    console.error('Create a .env file (or export them in your shell) with:');
    console.error('  ADMIN_EMAIL=admin@lasthope.zone');
    console.error('  ADMIN_PASSWORD=your-strong-password-here');
    console.error('');
    console.error('Then run: npm run db:seed');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('ADMIN_PASSWORD must be at least 8 characters long.');
    process.exit(1);
  }

  const existing = await prisma.adminUser.findUnique({
    where: { email: email.toLowerCase().trim() },
  });
  if (existing) {
    console.log(`Admin user ${email} already exists (id=${existing.id}).`);
    console.log('To reset the password, delete the row in AdminUser and re-run.');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12); // cost factor 12 = ~250ms

  const admin = await prisma.adminUser.create({
    data: {
      email: email.toLowerCase().trim(),
      passwordHash,
      name: name ?? null,
      role: 'admin',
    },
  });

  console.log('Admin user created:');
  console.log(`  id:    ${admin.id}`);
  console.log(`  email: ${admin.email}`);
  console.log(`  name:  ${admin.name ?? '(none)'}`);
  console.log(`  role:  ${admin.role}`);
  console.log('');
  console.log('You can now sign in at /login.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
