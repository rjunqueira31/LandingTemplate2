const {PrismaClient} = require('@prisma/client');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

require('dotenv').config({path: path.join(__dirname, '..', '.env')});

const prisma = new PrismaClient();

const COMPANY_DIR = path.resolve(process.env.COMPANY_DATA_PATH || path.join(__dirname, '..', 'company'));

async function main() {
  const username = (process.env.ADMIN_USERNAME || 'admin').trim();
  const existing = await prisma.user.findUnique({where: {username}});

  if (!existing) {
    const password = process.env.ADMIN_PASSWORD;
    if (!password) {
      console.error(
          'ADMIN_PASSWORD env var is required to create the admin user.');
      console.error(
          'Set it (a strong, unique value), run the seed once, then remove it.');
      process.exit(1);
    }
    const hash = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: {
        username,
        passwordHash: hash,
        role: 'admin',
      },
    });
    console.log(`Created admin user "${username}".`);
    console.log(
        'Log in, change the password, then you can remove ADMIN_PASSWORD ' +
        'from the environment (the DB stores only the hash).');
  } else {
    console.log('Admin user already exists, skipping.');
  }

  // Migrate bookings from JSON file if DB is empty
  const bookingCount = await prisma.booking.count();
  if (bookingCount === 0) {
    const bookingsFile = path.join(COMPANY_DIR, 'bookings.json');
    try {
      const bookings = JSON.parse(fs.readFileSync(bookingsFile, 'utf8'));
      if (bookings.length > 0) {
        for (const b of bookings) {
          await prisma.booking.create({
            data: {
              date: b.date,
              time: b.time,
              serviceId: b.serviceId,
              serviceName: b.serviceName,
              customerName: b.customerName || '',
              customerPhone: b.customerPhone || '',
              notes: b.notes || '',
              source: b.source || 'website',
              createdAt: b.createdAt ? new Date(b.createdAt) : new Date(),
            },
          });
        }
        console.log(
            `Migrated ${bookings.length} bookings from JSON to database.`);
      }
    } catch {
      console.log(
          'No bookings.json found or empty, skipping booking migration.');
    }
  } else {
    console.log(
        `${bookingCount} bookings already in database, skipping migration.`);
  }
}

main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
