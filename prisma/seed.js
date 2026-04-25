const {PrismaClient} = require('@prisma/client');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.user.findUnique({where: {username: 'admin'}});

  if (!existing) {
    const hash = await bcrypt.hash('admin123', 10);
    await prisma.user.create({
      data: {
        username: 'admin',
        passwordHash: hash,
        role: 'admin',
      },
    });
    console.log(
        'Created default admin user (username: admin, password: admin123)');
    console.log('Change the default password after first login!');
  } else {
    console.log('Admin user already exists, skipping.');
  }

  // Migrate bookings from JSON file if DB is empty
  const bookingCount = await prisma.booking.count();
  if (bookingCount === 0) {
    const bookingsFile = path.join(__dirname, '..', 'company', 'bookings.json');
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
