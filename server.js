require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const multer = require('multer');
const prisma = require('./lib/db');
const Stripe = require('stripe');

// Company data directory — externalized via env var for multi-tenant deploys
const COMPANY_DIR = path.resolve(
    process.env.COMPANY_DATA_PATH || path.join(__dirname, 'company'));

// Recursively copy a folder (used to seed an empty company directory).
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

// Ensure the company data directory is usable. On first boot against an empty
// volume, seed it from the bundled company-template/ so the app can start and
// the admin can configure everything through the UI. Fail fast otherwise.
(function ensureCompanyDir() {
  const dataFile = path.join(COMPANY_DIR, 'data.json');
  const templateDir = path.join(__dirname, 'company-template');

  if (!fs.existsSync(dataFile)) {
    if (fs.existsSync(path.join(templateDir, 'data.json'))) {
      console.log(`No data.json found in ${
          COMPANY_DIR} — seeding from company-template/`);
      copyRecursive(templateDir, COMPANY_DIR);
    } else {
      console.error(`\n[FATAL] Missing data.json in ${
          COMPANY_DIR} and no company-template/ to seed from.\n`);
      process.exit(1);
    }
  }

  try {
    JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  } catch (err) {
    console.error(`\n[FATAL] Invalid JSON in ${dataFile}: ${err.message}\n`);
    process.exit(1);
  }
  console.log(`Company data loaded from: ${COMPANY_DIR}`);
})();

let stripe = null;
function getStripe() {
  if (!stripe) {
    if (!process.env.STRIPE_SECRET_KEY)
      throw new Error('STRIPE_SECRET_KEY is not configured');
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
}

const app = express();
const PORT = process.env.PORT || 3002;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/images', express.static(path.join(COMPANY_DIR, 'images')));

// Stripe webhook needs raw body — must be before express.json()
app.post(
    '/api/stripe/webhook', express.raw({type: 'application/json'}),
    async (req, res) => {
      const sig = req.headers['stripe-signature'];
      const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
      let event;
      try {
        event =
            getStripe().webhooks.constructEvent(req.body, sig, endpointSecret);
      } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send('Webhook Error');
      }

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        try {
          const order = await prisma.order.findFirst(
              {where: {stripeSessionId: session.id}});
          if (order && order.status === 'received') {
            const updateData = {status: 'received'};
            // Retrieve invoice if available
            if (session.invoice) {
              const invoice =
                  await getStripe().invoices.retrieve(session.invoice);
              updateData.stripeInvoiceId = invoice.id;
              updateData.stripeInvoiceUrl = invoice.hosted_invoice_url || '';
            }
            await prisma.order.update(
                {where: {id: order.id}, data: updateData});
          }
        } catch (err) {
          console.error('Webhook order update error:', err.message);
        }
      }

      res.json({received: true});
    });

app.use(express.json());
app.use(express.urlencoded({extended: true}));

// Session setup
app.use(session({
  secret: process.env.SESSION_SECRET ||
      'change-this-to-a-random-string-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000}  // 8h
}));

function loadCompanyData() {
  const filePath = path.join(COMPANY_DIR, 'data.json');
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveCompanyData(data) {
  const filePath = path.join(COMPANY_DIR, 'data.json');
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function getImages(subdir) {
  const dirPath = path.join(COMPANY_DIR, 'images', subdir);
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath)
      .filter(f => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f))
      .sort();
}

app.use((req, res, next) => {
  const company = loadCompanyData();
  const logoImages = getImages('logo');

  res.locals.company = company;
  res.locals.currentPath = req.path;
  res.locals.logoImage = logoImages.length > 0 ? logoImages[0] : null;
  res.locals.carouselImages = getImages('carousel');
  res.locals.aboutImages = getImages('about');
  res.locals.galleryImages = getImages('gallery');
  res.locals.partnerImages = getImages('partners');
  res.locals.customer = req.session.customer || null;
  next();
});

app.get('/', (req, res) => {
  res.render('home');
});

app.get('/gallery', (req, res) => {
  if (!res.locals.company.pages.gallery) return res.redirect('/');
  res.render('gallery');
});

app.get('/bookings', (req, res) => {
  if (!res.locals.company.pages.bookings) return res.redirect('/');
  res.render('bookings');
});

/* ============================== */
/* BOOKINGS API                   */
/* ============================== */
const DAYS_OF_WEEK = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'
];

// GET /api/bookings/slots?date=YYYY-MM-DD&serviceId=xxx
app.get('/api/bookings/slots', requirePage('bookings'), async (req, res) => {
  const company = loadCompanyData();
  const config = company.bookingConfig;
  if (!config) return res.status(400).json({error: 'Booking not configured'});

  const {date, serviceId} = req.query;
  if (!date || !serviceId)
    return res.status(400).json({error: 'date and serviceId required'});

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return res.status(400).json({error: 'Invalid date format'});

  const service = config.bookableServices.find(s => s.id === serviceId);
  if (!service) return res.status(400).json({error: 'Unknown service'});

  const requestedDate = new Date(date + 'T00:00:00');
  if (isNaN(requestedDate.getTime()))
    return res.status(400).json({error: 'Invalid date'});

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (requestedDate < today) return res.json({slots: []});

  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + config.maxAdvanceDays);
  if (requestedDate > maxDate) return res.json({slots: []});

  const dayName = DAYS_OF_WEEK[requestedDate.getDay()];
  const daySchedule = config.schedule[dayName];
  if (!daySchedule) return res.json({slots: []});  // closed

  // Generate all possible slots
  const [openH, openM] = daySchedule.open.split(':').map(Number);
  const [closeH, closeM] = daySchedule.close.split(':').map(Number);
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;
  const slotDuration = service.durationMinutes || config.slotDurationMinutes;

  const allSlots = [];
  for (let m = openMinutes; m + slotDuration <= closeMinutes;
       m += config.slotDurationMinutes) {
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    allSlots.push(hh + ':' + mm);
  }

  // Load existing bookings for this date and remove taken slots
  const dateBookings = await prisma.booking.findMany({where: {date}});
  const userCount = await prisma.user.count();
  const capacity = Math.max(userCount, 1);

  // Count how many bookings occupy each sub-slot
  const slotCounts = {};
  dateBookings.forEach(b => {
    const bookedService =
        config.bookableServices.find(s => s.id === b.serviceId);
    const dur = (bookedService && bookedService.durationMinutes) ||
        config.slotDurationMinutes;
    const [bh, bm] = b.time.split(':').map(Number);
    const startMin = bh * 60 + bm;
    for (let t = startMin; t < startMin + dur;
         t += config.slotDurationMinutes) {
      const hh = String(Math.floor(t / 60)).padStart(2, '0');
      const mm = String(t % 60).padStart(2, '0');
      const key = hh + ':' + mm;
      slotCounts[key] = (slotCounts[key] || 0) + 1;
    }
  });

  // Filter: a slot is available if ALL sub-slots it needs have room
  const availableSlots = allSlots.filter(slot => {
    const [sh, sm] = slot.split(':').map(Number);
    const startMin = sh * 60 + sm;
    for (let t = startMin; t < startMin + slotDuration;
         t += config.slotDurationMinutes) {
      const hh = String(Math.floor(t / 60)).padStart(2, '0');
      const mm = String(t % 60).padStart(2, '0');
      if ((slotCounts[hh + ':' + mm] || 0) >= capacity) return false;
    }
    return true;
  });

  // If today, remove past slots
  const now = new Date();
  let finalSlots = availableSlots;
  if (date === now.toISOString().slice(0, 10)) {
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    finalSlots = availableSlots.filter(slot => {
      const [h, m] = slot.split(':').map(Number);
      return h * 60 + m > currentMinutes;
    });
  }

  res.json({slots: finalSlots});
});

// GET /api/bookings/services
app.get('/api/bookings/services', requirePage('bookings'), async (req, res) => {
  const company = loadCompanyData();
  const config = company.bookingConfig;
  if (!config) return res.status(400).json({error: 'Booking not configured'});
  const userCount = await prisma.user.count();
  res.json({
    services: config.bookableServices,
    maxAdvanceDays: config.maxAdvanceDays,
    capacity: Math.max(userCount, 1)
  });
});

// POST /api/bookings
app.post('/api/bookings', requirePage('bookings'), async (req, res) => {
  const company = loadCompanyData();
  const config = company.bookingConfig;
  if (!config) return res.status(400).json({error: 'Booking not configured'});

  const {date, time, serviceId, customerName, customerPhone} = req.body;

  // Validate required fields
  if (!date || !time || !serviceId || !customerName || !customerPhone) {
    return res.status(400).json({error: 'All fields are required'});
  }

  // Sanitize inputs
  const cleanName = String(customerName).trim().slice(0, 100);
  const cleanPhone = String(customerPhone).trim().slice(0, 30);
  if (!cleanName || !cleanPhone) {
    return res.status(400).json({error: 'Invalid name or phone'});
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return res.status(400).json({error: 'Invalid date'});
  if (!/^\d{2}:\d{2}$/.test(time))
    return res.status(400).json({error: 'Invalid time'});

  const service = config.bookableServices.find(s => s.id === serviceId);
  if (!service) return res.status(400).json({error: 'Unknown service'});

  // Check date is valid and in range
  const requestedDate = new Date(date + 'T00:00:00');
  if (isNaN(requestedDate.getTime()))
    return res.status(400).json({error: 'Invalid date'});

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (requestedDate < today)
    return res.status(400).json({error: 'Cannot book in the past'});

  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + config.maxAdvanceDays);
  if (requestedDate > maxDate)
    return res.status(400).json({error: 'Date too far in advance'});

  // Check day is open
  const dayName = DAYS_OF_WEEK[requestedDate.getDay()];
  const daySchedule = config.schedule[dayName];
  if (!daySchedule) return res.status(400).json({error: 'Closed on this day'});

  // Check time within schedule
  const [openH, openM] = daySchedule.open.split(':').map(Number);
  const [closeH, closeM] = daySchedule.close.split(':').map(Number);
  const [timeH, timeM] = time.split(':').map(Number);
  const timeMinutes = timeH * 60 + timeM;
  const slotDuration = service.durationMinutes || config.slotDurationMinutes;

  if (timeMinutes < openH * 60 + openM ||
      timeMinutes + slotDuration > closeH * 60 + closeM) {
    return res.status(400).json({error: 'Time outside schedule'});
  }

  // Check slot is still available (re-check to avoid race conditions)
  const dateBookings = await prisma.booking.findMany({where: {date}});
  const userCount = await prisma.user.count();
  const capacity = Math.max(userCount, 1);
  const slotCounts = {};
  dateBookings.forEach(b => {
    const bService = config.bookableServices.find(s => s.id === b.serviceId);
    const dur =
        (bService && bService.durationMinutes) || config.slotDurationMinutes;
    const [bh, bm] = b.time.split(':').map(Number);
    const startMin = bh * 60 + bm;
    for (let t = startMin; t < startMin + dur;
         t += config.slotDurationMinutes) {
      const hh = String(Math.floor(t / 60)).padStart(2, '0');
      const mm = String(t % 60).padStart(2, '0');
      const key = hh + ':' + mm;
      slotCounts[key] = (slotCounts[key] || 0) + 1;
    }
  });

  for (let t = timeMinutes; t < timeMinutes + slotDuration;
       t += config.slotDurationMinutes) {
    const hh = String(Math.floor(t / 60)).padStart(2, '0');
    const mm = String(t % 60).padStart(2, '0');
    if ((slotCounts[hh + ':' + mm] || 0) >= capacity) {
      return res.status(409).json({error: 'Slot no longer available'});
    }
  }

  // Save booking
  const booking = await prisma.booking.create({
    data: {
      date,
      time,
      serviceId,
      serviceName: service.title,
      customerName: cleanName,
      customerPhone: cleanPhone,
      source: 'website',
    }
  });

  res.json({success: true, booking});
});

/* ============================== */
/* ADMIN                          */
/* ============================== */
function requireAuth(req, res, next) {
  if (req.session && req.session.admin) return next();
  res.redirect('/admin/login');
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.admin && req.session.role === 'admin')
    return next();
  res.status(403).json({error: 'Admin access required'});
}

function requirePage(page) {
  return function(req, res, next) {
    if (res.locals.company.pages[page]) return next();
    res.status(404).json({error: 'Not found'});
  };
}

// Login page
app.get('/admin/login', (req, res) => {
  const error = req.query.error === '1' ? 'Invalid username or password' : null;
  res.render('admin/login', {error});
});

// Login POST
app.post('/admin/login', async (req, res) => {
  const {username, password} = req.body;
  const uClean = String(username || '').trim();
  const pClean = String(password || '');

  try {
    const user = await prisma.user.findUnique({where: {username: uClean}});
    if (user && await bcrypt.compare(pClean, user.passwordHash)) {
      req.session.admin = true;
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.role = user.role;
      return res.redirect('/admin');
    }
  } catch (err) {
    console.error('Login error:', err.message);
  }
  res.redirect('/admin/login?error=1');
});

// Logout
app.get('/admin/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

// Dashboard
app.get('/admin', requireAuth, (req, res) => {
  const company = loadCompanyData();
  res.render('admin/dashboard', {
    company,
    username: req.session.username,
    role: req.session.role,
    userId: req.session.userId
  });
});

// Admin API: list bookings for a date range
app.get(
    '/admin/api/bookings', requireAuth, requirePage('bookings'),
    async (req, res) => {
      const {from, to} = req.query;
      const where = {};
      if (from && to) {
        where.date = {gte: from, lte: to};
      } else if (from) {
        where.date = {gte: from};
      } else if (to) {
        where.date = {lte: to};
      }
      const bookings = await prisma.booking.findMany({
        where,
        orderBy: [{date: 'asc'}, {time: 'asc'}],
      });
      res.json({bookings});
    });

// Admin API: create a booking (manual / walk-in / phone call)
app.post(
    '/admin/api/bookings', requireAuth, requirePage('bookings'),
    async (req, res) => {
      const company = loadCompanyData();
      const config = company.bookingConfig;
      const {date, time, serviceId, customerName, customerPhone, notes} =
          req.body;

      if (!date || !time || !serviceId) {
        return res.status(400).json(
            {error: 'date, time, and serviceId are required'});
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
        return res.status(400).json({error: 'Invalid date'});
      if (!/^\d{2}:\d{2}$/.test(time))
        return res.status(400).json({error: 'Invalid time'});

      const service = config.bookableServices.find(s => s.id === serviceId);
      if (!service) return res.status(400).json({error: 'Unknown service'});

      // Check capacity
      const slotDuration =
          service.durationMinutes || config.slotDurationMinutes;
      const [timeH, timeM] = time.split(':').map(Number);
      const timeMinutes = timeH * 60 + timeM;
      const userCount = await prisma.user.count();
      const cap = Math.max(userCount, 1);
      const dateBookings = await prisma.booking.findMany({where: {date}});
      const slotCounts = {};
      dateBookings.forEach(b => {
        const bService =
            config.bookableServices.find(s => s.id === b.serviceId);
        const dur = (bService && bService.durationMinutes) ||
            config.slotDurationMinutes;
        const [bh, bm] = b.time.split(':').map(Number);
        const startMin = bh * 60 + bm;
        for (let t = startMin; t < startMin + dur;
             t += config.slotDurationMinutes) {
          const hh = String(Math.floor(t / 60)).padStart(2, '0');
          const mm = String(t % 60).padStart(2, '0');
          const key = hh + ':' + mm;
          slotCounts[key] = (slotCounts[key] || 0) + 1;
        }
      });
      for (let t = timeMinutes; t < timeMinutes + slotDuration;
           t += config.slotDurationMinutes) {
        const hh = String(Math.floor(t / 60)).padStart(2, '0');
        const mm = String(t % 60).padStart(2, '0');
        if ((slotCounts[hh + ':' + mm] || 0) >= cap) {
          return res.status(409).json(
              {error: 'All staff occupied at this time'});
        }
      }

      const booking = await prisma.booking.create({
        data: {
          date,
          time,
          serviceId,
          serviceName: service.title,
          customerName: String(customerName || '').trim().slice(0, 100),
          customerPhone: String(customerPhone || '').trim().slice(0, 30),
          notes: String(notes || '').trim().slice(0, 500),
          source: 'admin',
        }
      });

      res.json({success: true, booking});
    });

// Admin API: update a booking
app.put(
    '/admin/api/bookings/:id', requireAuth, requirePage('bookings'),
    async (req, res) => {
      const company = loadCompanyData();
      const config = company.bookingConfig;
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({error: 'Invalid booking ID'});

      const existing = await prisma.booking.findUnique({where: {id}});
      if (!existing) return res.status(404).json({error: 'Booking not found'});

      const {date, time, serviceId, customerName, customerPhone, notes} =
          req.body;
      const data = {};

      if (date) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
          return res.status(400).json({error: 'Invalid date'});
        data.date = date;
      }
      if (time) {
        if (!/^\d{2}:\d{2}$/.test(time))
          return res.status(400).json({error: 'Invalid time'});
        data.time = time;
      }
      if (serviceId) {
        const service = config.bookableServices.find(s => s.id === serviceId);
        if (!service) return res.status(400).json({error: 'Unknown service'});
        data.serviceId = serviceId;
        data.serviceName = service.title;
      }
      if (customerName !== undefined)
        data.customerName = String(customerName).trim().slice(0, 100);
      if (customerPhone !== undefined)
        data.customerPhone = String(customerPhone).trim().slice(0, 30);
      if (notes !== undefined) data.notes = String(notes).trim().slice(0, 500);

      const booking = await prisma.booking.update({where: {id}, data});
      res.json({success: true, booking});
    });

// Admin API: delete a booking
app.delete(
    '/admin/api/bookings/:id', requireAuth, requirePage('bookings'),
    async (req, res) => {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({error: 'Invalid booking ID'});

      const existing = await prisma.booking.findUnique({where: {id}});
      if (!existing) return res.status(404).json({error: 'Booking not found'});

      await prisma.booking.delete({where: {id}});
      res.json({success: true});
    });

// Admin API: get services (for dropdowns)
app.get(
    '/admin/api/services', requireAuth, requirePage('bookings'),
    async (req, res) => {
      const company = loadCompanyData();
      const userCount = await prisma.user.count();
      res.json({
        services: company.bookingConfig.bookableServices,
        capacity: Math.max(userCount, 1)
      });
    });

// Admin API: change password
app.post('/admin/api/change-password', requireAuth, async (req, res) => {
  const {currentPassword, newPassword} = req.body;
  if (!currentPassword || !newPassword)
    return res.status(400).json({error: 'Both fields required'});
  if (String(newPassword).length < 6)
    return res.status(400).json(
        {error: 'Password must be at least 6 characters'});

  try {
    const user =
        await prisma.user.findUnique({where: {id: req.session.userId}});
    if (!user) return res.status(404).json({error: 'User not found'});

    const valid =
        await bcrypt.compare(String(currentPassword), user.passwordHash);
    if (!valid)
      return res.status(403).json({error: 'Current password is incorrect'});

    const newHash = await bcrypt.hash(String(newPassword), 10);
    await prisma.user.update(
        {where: {id: user.id}, data: {passwordHash: newHash}});
    res.json({success: true});
  } catch (err) {
    console.error('Change password error:', err.message);
    res.status(500).json({error: 'Internal error'});
  }
});

/* ============================== */
/* USER MANAGEMENT (admin only)   */
/* ============================== */

// List all users
app.get('/admin/api/users', requireAdmin, async (req, res) => {
  try {
    const year = new Date().getFullYear();
    const startDate = year + '-01-01';
    const endDate = year + '-12-31';
    const today = new Date().toISOString().slice(0, 10);

    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        role: true,
        vacationDays: true,
        createdAt: true
      },
      orderBy: {createdAt: 'asc'},
    });

    const vacations = await prisma.vacation.findMany({
      where: {date: {gte: startDate, lte: endDate}},
    });

    const result = users.map(u => {
      const uVacs = vacations.filter(v => v.userId === u.id);
      const used = uVacs.filter(v => v.date < today).length;
      const booked = uVacs.filter(v => v.date >= today).length;
      return {
        ...u,
        used,
        booked,
        remaining: u.vacationDays - used - booked,
      };
    });

    res.json({users: result});
  } catch (err) {
    console.error('List users error:', err.message);
    res.status(500).json({error: 'Internal error'});
  }
});

// Create a user
app.post('/admin/api/users', requireAdmin, async (req, res) => {
  const {username, password, role, vacationDays} = req.body;
  const uClean = String(username || '').trim().slice(0, 50);
  const pClean = String(password || '');
  const rClean = role === 'admin' ? 'admin' : 'employee';
  const config = loadCompanyData();
  const vDays = (vacationDays !== undefined && vacationDays !== '') ?
      Math.max(0, parseInt(vacationDays, 10) || 0) :
      (config.defaultVacationDays || 22);

  if (!uClean || uClean.length < 3)
    return res.status(400).json(
        {error: 'Username must be at least 3 characters'});
  if (!/^[a-zA-Z0-9._-]+$/.test(uClean))
    return res.status(400).json({
      error:
          'Username can only contain letters, numbers, dots, dashes, underscores'
    });
  if (pClean.length < 6)
    return res.status(400).json(
        {error: 'Password must be at least 6 characters'});

  try {
    const existing = await prisma.user.findUnique({where: {username: uClean}});
    if (existing)
      return res.status(409).json({error: 'Username already exists'});

    const hash = await bcrypt.hash(pClean, 10);
    const user = await prisma.user.create({
      data: {
        username: uClean,
        passwordHash: hash,
        role: rClean,
        vacationDays: vDays
      },
      select: {
        id: true,
        username: true,
        role: true,
        vacationDays: true,
        createdAt: true
      },
    });
    res.json({success: true, user});
  } catch (err) {
    console.error('Create user error:', err.message);
    res.status(500).json({error: 'Internal error'});
  }
});

// Delete a user
app.delete('/admin/api/users/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({error: 'Invalid user ID'});
  if (id === req.session.userId)
    return res.status(400).json({error: 'Cannot delete your own account'});

  try {
    const user = await prisma.user.findUnique({where: {id}});
    if (!user) return res.status(404).json({error: 'User not found'});

    if (user.role === 'admin') {
      const adminCount = await prisma.user.count({where: {role: 'admin'}});
      if (adminCount <= 1)
        return res.status(400).json({error: 'Cannot delete the last admin'});
    }

    await prisma.user.delete({where: {id}});
    res.json({success: true});
  } catch (err) {
    console.error('Delete user error:', err.message);
    res.status(500).json({error: 'Internal error'});
  }
});

/* ============================== */
/* VACATION MANAGEMENT             */
/* ============================== */

// List all users with vacation data
app.get(
    '/admin/api/vacations', requireAuth, requirePage('vacations'),
    async (req, res) => {
      try {
        const year = parseInt(req.query.year, 10) || new Date().getFullYear();
        const startDate = year + '-01-01';
        const endDate = year + '-12-31';
        const nextJanStart = (year + 1) + '-01-01';
        const nextJanEnd = (year + 1) + '-01-31';

        const users = await prisma.user.findMany({
          select: {id: true, username: true, role: true, vacationDays: true},
          orderBy: {createdAt: 'asc'},
        });

        const vacations = await prisma.vacation.findMany({
          where: {
            OR: [
              {date: {gte: startDate, lte: endDate}},
              {date: {gte: nextJanStart, lte: nextJanEnd}},
            ],
          },
        });

        const today = new Date().toISOString().slice(0, 10);

        const result = users.map(u => {
          const uVacs = vacations.filter(v => v.userId === u.id);
          const currentYearVacs =
              uVacs.filter(v => v.date >= startDate && v.date <= endDate);
          const used = currentYearVacs.filter(v => v.date < today).length;
          const booked = currentYearVacs.filter(v => v.date >= today).length;
          return {
            id: u.id,
            username: u.username,
            role: u.role,
            vacationDays: u.vacationDays,
            used,
            booked,
            remaining: u.vacationDays - used - booked,
            dates: uVacs.map(v => ({id: v.id, date: v.date})),
          };
        });

        res.json({users: result, year, closedDays: getClosedDays()});
      } catch (err) {
        console.error('List vacations error:', err.message);
        res.status(500).json({error: 'Internal error'});
      }
    });

function getClosedDays() {
  const company = loadCompanyData();
  const schedule =
      company.bookingConfig && company.bookingConfig.schedule || {};
  const dayMap = [
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
  ];
  var closed = [];
  dayMap.forEach(function(name, i) {
    if (!schedule[name]) closed.push(i);
  });
  return closed;  // 0=Mon..6=Sun
}

// Add vacation days for a user
app.post(
    '/admin/api/vacations', requireAuth, requirePage('vacations'),
    async (req, res) => {
      const {userId, dates} = req.body;
      const targetId = parseInt(userId, 10);
      if (isNaN(targetId) || !Array.isArray(dates) || dates.length === 0)
        return res.status(400).json({error: 'Invalid request'});

      // Permission: can only manage own vacations
      if (targetId !== req.session.userId)
        return res.status(403).json(
            {error: 'You can only manage your own vacations'});

      try {
        const user = await prisma.user.findUnique({where: {id: targetId}});
        if (!user) return res.status(404).json({error: 'User not found'});

        // Validate dates format
        const validDates = dates.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
        if (validDates.length === 0)
          return res.status(400).json({error: 'No valid dates provided'});

        // Upsert each date
        for (const date of validDates) {
          await prisma.vacation.upsert({
            where: {userId_date: {userId: targetId, date}},
            update: {},
            create: {userId: targetId, date, status: 'booked'},
          });
        }

        res.json({success: true});
      } catch (err) {
        console.error('Add vacations error:', err.message);
        res.status(500).json({error: 'Internal error'});
      }
    });

// Remove vacation days for a user
app.delete(
    '/admin/api/vacations', requireAuth, requirePage('vacations'),
    async (req, res) => {
      const {userId, dates} = req.body;
      const targetId = parseInt(userId, 10);
      if (isNaN(targetId) || !Array.isArray(dates) || dates.length === 0)
        return res.status(400).json({error: 'Invalid request'});

      if (targetId !== req.session.userId)
        return res.status(403).json(
            {error: 'You can only manage your own vacations'});

      try {
        await prisma.vacation.deleteMany({
          where: {userId: targetId, date: {in : dates}},
        });
        res.json({success: true});
      } catch (err) {
        console.error('Delete vacations error:', err.message);
        res.status(500).json({error: 'Internal error'});
      }
    });

/* ============================== */
/* STORE — CUSTOMER AUTH          */
/* ============================== */

function requireCustomer(req, res, next) {
  if (req.session && req.session.customer) return next();
  res.status(401).json({error: 'Login required'});
}

// Register
app.post('/api/auth/register', requirePage('store'), async (req, res) => {
  const {name, email, password} = req.body;
  const cleanName = String(name || '').trim().slice(0, 100);
  const cleanEmail = String(email || '').trim().toLowerCase().slice(0, 200);
  const cleanPass = String(password || '');

  if (!cleanName || cleanName.length < 2)
    return res.status(400).json({error: 'Name must be at least 2 characters'});
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail))
    return res.status(400).json({error: 'Invalid email'});
  if (cleanPass.length < 6)
    return res.status(400).json(
        {error: 'Password must be at least 6 characters'});

  try {
    const existing =
        await prisma.customer.findUnique({where: {email: cleanEmail}});
    if (existing)
      return res.status(409).json({error: 'Email already registered'});

    const hash = await bcrypt.hash(cleanPass, 10);
    const customer = await prisma.customer.create({
      data: {email: cleanEmail, name: cleanName, passwordHash: hash},
      select: {id: true, email: true, name: true}
    });
    req.session.customer = {
      id: customer.id,
      email: customer.email,
      name: customer.name
    };
    res.json({success: true, customer: req.session.customer});
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({error: 'Internal error'});
  }
});

// Login
app.post('/api/auth/login', requirePage('store'), async (req, res) => {
  const {email, password} = req.body;
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPass = String(password || '');

  try {
    const customer =
        await prisma.customer.findUnique({where: {email: cleanEmail}});
    if (!customer || !(await bcrypt.compare(cleanPass, customer.passwordHash)))
      return res.status(401).json({error: 'Invalid email or password'});

    req.session.customer = {
      id: customer.id,
      email: customer.email,
      name: customer.name
    };
    res.json({success: true, customer: req.session.customer});
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({error: 'Internal error'});
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  delete req.session.customer;
  res.json({success: true});
});

// Get current customer
app.get('/api/auth/me', (req, res) => {
  if (req.session.customer) return res.json({customer: req.session.customer});
  res.json({customer: null});
});

// Update profile
app.put('/api/auth/profile', requireCustomer, async (req, res) => {
  const {name, email, currentPassword, newPassword} = req.body;
  const data = {};

  if (name) data.name = String(name).trim().slice(0, 100);
  if (email) {
    const cleanEmail = String(email).trim().toLowerCase().slice(0, 200);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail))
      return res.status(400).json({error: 'Invalid email'});
    const existing =
        await prisma.customer.findUnique({where: {email: cleanEmail}});
    if (existing && existing.id !== req.session.customer.id)
      return res.status(409).json({error: 'Email already in use'});
    data.email = cleanEmail;
  }

  if (newPassword) {
    if (!currentPassword)
      return res.status(400).json({error: 'Current password required'});
    const cust = await prisma.customer.findUnique(
        {where: {id: req.session.customer.id}});
    if (!cust ||
        !(await bcrypt.compare(String(currentPassword), cust.passwordHash)))
      return res.status(403).json({error: 'Current password is incorrect'});
    if (String(newPassword).length < 6)
      return res.status(400).json(
          {error: 'Password must be at least 6 characters'});
    data.passwordHash = await bcrypt.hash(String(newPassword), 10);
  }

  try {
    const updated = await prisma.customer.update({
      where: {id: req.session.customer.id},
      data,
      select: {id: true, email: true, name: true}
    });
    req.session
        .customer = {id: updated.id, email: updated.email, name: updated.name};
    res.json({success: true, customer: req.session.customer});
  } catch (err) {
    console.error('Update profile error:', err.message);
    res.status(500).json({error: 'Internal error'});
  }
});

/* ============================== */
/* STORE — PUBLIC ROUTES          */
/* ============================== */

// Store page
app.get('/store', (req, res) => {
  if (!res.locals.company.pages.store) return res.redirect('/');
  res.render('store');
});

// Product detail page
app.get('/store/product/:id', async (req, res) => {
  if (!res.locals.company.pages.store) return res.redirect('/');
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.redirect('/store');
  const product =
      await prisma.product.findUnique({where: {id}, include: {options: true}});
  if (!product) return res.redirect('/store');
  res.render('store-product', {product});
});

// Cart page
app.get('/store/cart', (req, res) => {
  if (!res.locals.company.pages.store) return res.redirect('/');
  res.render('store-cart');
});

// Checkout page
app.get('/store/checkout', (req, res) => {
  if (!res.locals.company.pages.store) return res.redirect('/');
  res.render('store-checkout');
});

// Order success page
app.get('/store/order-success', (req, res) => {
  if (!res.locals.company.pages.store) return res.redirect('/');
  res.render('store-order-success');
});

// Customer orders page
app.get('/store/orders', (req, res) => {
  if (!res.locals.company.pages.store) return res.redirect('/');
  res.render('store-orders');
});

/* ============================== */
/* STORE — API                    */
/* ============================== */

// List products
app.get('/api/store/products', requirePage('store'), async (req, res) => {
  const products = await prisma.product.findMany(
      {include: {options: true}, orderBy: {createdAt: 'desc'}});
  res.json({products});
});

// Get single product
app.get('/api/store/products/:id', requirePage('store'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({error: 'Invalid ID'});
  const product =
      await prisma.product.findUnique({where: {id}, include: {options: true}});
  if (!product) return res.status(404).json({error: 'Not found'});
  res.json({product});
});

// Get customer orders
app.get('/api/store/orders', requireCustomer, async (req, res) => {
  const orders = await prisma.order.findMany({
    where: {customerId: req.session.customer.id},
    include: {items: true},
    orderBy: {createdAt: 'desc'}
  });
  res.json({orders});
});

// Create checkout session
app.post('/api/store/checkout', requirePage('store'), async (req, res) => {
  const {items, shipping, billing, paymentMethod} = req.body;

  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({error: 'Cart is empty'});
  if (!shipping || !shipping.name || !shipping.email || !shipping.address)
    return res.status(400).json({error: 'Shipping information required'});
  if (!billing || !billing.address)
    return res.status(400).json({error: 'Billing information required'});

  const cleanShipping = {
    name: String(shipping.name).trim().slice(0, 100),
    email: String(shipping.email).trim().toLowerCase().slice(0, 200),
    phone: String(shipping.phone || '').trim().slice(0, 30),
    address: String(shipping.address).trim().slice(0, 500)
  };
  const cleanBilling = {address: String(billing.address).trim().slice(0, 500)};

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanShipping.email))
    return res.status(400).json({error: 'Invalid email'});

  // Validate items and compute totals
  const lineItems = [];
  const orderItems = [];
  let total = 0;

  for (const item of items) {
    const product = await prisma.product.findUnique(
        {where: {id: item.productId}, include: {options: true}});
    if (!product)
      return res.status(400).json(
          {error: 'Product not found: ' + item.productId});

    let price = product.price;
    let available = product.available;
    let optionName = '';
    let optionId = null;

    if (item.optionId) {
      const option = product.options.find(o => o.id === item.optionId);
      if (!option) return res.status(400).json({error: 'Option not found'});
      price = option.price !== null ? option.price : product.price;
      available =
          option.available !== null ? option.available : product.available;
      optionName = option.name;
      optionId = option.id;
    }

    if (!available)
      return res.status(400).json({error: product.title + ' is not available'});

    const qty = Math.max(1, Math.min(99, parseInt(item.quantity, 10) || 1));
    total += price * qty;

    lineItems.push({
      price_data: {
        currency: 'eur',
        product_data:
            {name: product.title + (optionName ? ' - ' + optionName : '')},
        unit_amount: Math.round(price * 100)
      },
      quantity: qty
    });

    orderItems.push({
      productId: product.id,
      optionId,
      productTitle: product.title,
      optionName,
      quantity: qty,
      unitPrice: price
    });
  }

  // Create order in DB
  const order = await prisma.order.create({
    data: {
      customerId: req.session.customer ? req.session.customer.id : null,
      customerName: cleanShipping.name,
      customerEmail: cleanShipping.email,
      customerPhone: cleanShipping.phone,
      shippingAddress: cleanShipping.address,
      billingAddress: cleanBilling.address,
      total,
      paymentMethod: paymentMethod === 'mbway' ? 'mbway' : 'card',
      items: {create: orderItems}
    }
  });

  // Create Stripe Checkout Session
  try {
    const paymentMethods =
        paymentMethod === 'mbway' ? ['multibanco'] : ['card'];

    const sessionConfig = {
      payment_method_types: paymentMethods,
      line_items: lineItems,
      mode: 'payment',
      customer_email: cleanShipping.email,
      invoice_creation: {enabled: true},
      success_url: `${req.protocol}://${
          req.get(
              'host')}/store/order-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.protocol}://${req.get('host')}/store/checkout`,
      metadata: {orderId: String(order.id)}
    };

    const checkoutSession =
        await getStripe().checkout.sessions.create(sessionConfig);

    await prisma.order.update(
        {where: {id: order.id}, data: {stripeSessionId: checkoutSession.id}});

    res.json({url: checkoutSession.url, orderId: order.id});
  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    // Delete the order if Stripe fails
    await prisma.order.delete({where: {id: order.id}});
    res.status(500).json({error: 'Payment service error. Please try again.'});
  }
});

// Verify order after payment
app.get('/api/store/order-status', async (req, res) => {
  const {session_id} = req.query;
  if (!session_id) return res.status(400).json({error: 'session_id required'});

  try {
    const order = await prisma.order.findFirst(
        {where: {stripeSessionId: String(session_id)}, include: {items: true}});
    if (!order) return res.status(404).json({error: 'Order not found'});

    // Fetch invoice from Stripe if not stored yet
    if (!order.stripeInvoiceUrl) {
      const stripeSession =
          await getStripe().checkout.sessions.retrieve(String(session_id));
      if (stripeSession.invoice) {
        const invoice =
            await getStripe().invoices.retrieve(stripeSession.invoice);
        await prisma.order.update({
          where: {id: order.id},
          data: {
            stripeInvoiceId: invoice.id,
            stripeInvoiceUrl: invoice.hosted_invoice_url || ''
          }
        });
        order.stripeInvoiceUrl = invoice.hosted_invoice_url || '';
        order.stripeInvoiceId = invoice.id;
      }
    }

    res.json({order});
  } catch (err) {
    console.error('Order status error:', err.message);
    res.status(500).json({error: 'Internal error'});
  }
});

/* ============================== */
/* ADMIN — STORE MANAGEMENT       */
/* ============================== */

const PRODUCT_IMAGE_LIMITS = {
  maxCount: 5,
  maxSizeMB: 5
};

function makeProductUpload() {
  const storage = multer.diskStorage({
    destination: function(req, file, cb) {
      const dir = path.join(COMPANY_DIR, 'images', 'products');
      fs.mkdirSync(dir, {recursive: true});
      cb(null, dir);
    },
    filename: function(req, file, cb) {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const ext = path.extname(safe).toLowerCase();
      const base = path.basename(safe, ext);
      cb(null, base + '-' + Date.now() + ext);
    }
  });
  return multer({
    storage,
    limits: {fileSize: PRODUCT_IMAGE_LIMITS.maxSizeMB * 1024 * 1024},
    fileFilter: function(req, file, cb) {
      if (ALLOWED_MIME.includes(file.mimetype))
        cb(null, true);
      else
        cb(new Error('Invalid file type'));
    }
  });
}

// Admin: list all orders
app.get('/admin/api/store/orders', requireAuth, async (req, res) => {
  const {status, search} = req.query;
  const where = {};
  if (status && status !== 'all') where.status = status;
  if (search) {
    const s = String(search).trim();
    const idNum = parseInt(s, 10);
    where.OR = [
      {customerName: {contains: s, mode: 'insensitive'}},
      {customerEmail: {contains: s, mode: 'insensitive'}},
      ...(isNaN(idNum) ? [] : [{id: idNum}])
    ];
  }
  const orders = await prisma.order.findMany(
      {where, include: {items: true}, orderBy: {createdAt: 'desc'}});
  res.json({orders});
});

// Admin: get single order
app.get('/admin/api/store/orders/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({error: 'Invalid ID'});
  const order = await prisma.order.findUnique({
    where: {id},
    include:
        {items: true, customer: {select: {id: true, name: true, email: true}}}
  });
  if (!order) return res.status(404).json({error: 'Not found'});
  res.json({order});
});

// Admin: update order
app.put('/admin/api/store/orders/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({error: 'Invalid ID'});
  const {
    status,
    shipmentId,
    notes,
    customerName,
    customerEmail,
    customerPhone,
    shippingAddress,
    billingAddress
  } = req.body;
  const data = {};
  if (status) {
    const validStatuses = ['received', 'processing', 'shipped', 'finished'];
    if (!validStatuses.includes(status))
      return res.status(400).json({error: 'Invalid status'});
    data.status = status;
  }
  if (shipmentId !== undefined)
    data.shipmentId = String(shipmentId).trim().slice(0, 200);
  if (notes !== undefined) data.notes = String(notes).trim().slice(0, 1000);
  if (customerName !== undefined)
    data.customerName = String(customerName).trim().slice(0, 100);
  if (customerEmail !== undefined)
    data.customerEmail = String(customerEmail).trim().slice(0, 200);
  if (customerPhone !== undefined)
    data.customerPhone = String(customerPhone).trim().slice(0, 30);
  if (shippingAddress !== undefined)
    data.shippingAddress = String(shippingAddress).trim().slice(0, 500);
  if (billingAddress !== undefined)
    data.billingAddress = String(billingAddress).trim().slice(0, 500);

  const order = await prisma.order.update({where: {id}, data});
  res.json({success: true, order});
});

// Admin: delete order
app.delete('/admin/api/store/orders/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({error: 'Invalid ID'});
  await prisma.order.delete({where: {id}});
  res.json({success: true});
});

// Admin: create order (manual)
app.post('/admin/api/store/orders', requireAuth, async (req, res) => {
  const {
    customerName,
    customerEmail,
    customerPhone,
    shippingAddress,
    billingAddress,
    status,
    notes,
    items
  } = req.body;
  if (!customerName || !customerEmail)
    return res.status(400).json({error: 'Name and email required'});

  let total = 0;
  const orderItems = [];
  if (Array.isArray(items)) {
    for (const item of items) {
      const product = await prisma.product.findUnique(
          {where: {id: item.productId}, include: {options: true}});
      if (!product) continue;
      let price = product.price;
      let optionName = '';
      let optionId = null;
      if (item.optionId) {
        const opt = product.options.find(o => o.id === item.optionId);
        if (opt) {
          price = opt.price !== null ? opt.price : product.price;
          optionName = opt.name;
          optionId = opt.id;
        }
      }
      const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
      total += price * qty;
      orderItems.push({
        productId: product.id,
        optionId,
        productTitle: product.title,
        optionName,
        quantity: qty,
        unitPrice: price
      });
    }
  }

  const order = await prisma.order.create({
    data: {
      customerName: String(customerName).trim().slice(0, 100),
      customerEmail: String(customerEmail).trim().slice(0, 200),
      customerPhone: String(customerPhone || '').trim().slice(0, 30),
      shippingAddress: String(shippingAddress || '').trim().slice(0, 500),
      billingAddress: String(billingAddress || '').trim().slice(0, 500),
      status: status || 'received',
      notes: String(notes || '').trim().slice(0, 1000),
      total,
      items: {create: orderItems}
    },
    include: {items: true}
  });
  res.json({success: true, order});
});

// Admin: list products
app.get('/admin/api/store/products', requireAuth, async (req, res) => {
  const products = await prisma.product.findMany(
      {include: {options: true}, orderBy: {createdAt: 'desc'}});
  res.json({products});
});

// Admin: create product
app.post('/admin/api/store/products', requireAuth, async (req, res) => {
  const upload =
      makeProductUpload().array('images', PRODUCT_IMAGE_LIMITS.maxCount);
  upload(req, res, async function(err) {
    if (err) return res.status(400).json({error: err.message});

    const {title, description, price, available, options} = req.body;
    if (!title || !price)
      return res.status(400).json({error: 'Title and price required'});

    const images = (req.files || []).map(f => f.filename);
    let parsedOptions = [];
    if (options) {
      try {
        parsedOptions = JSON.parse(options);
      } catch (e) { /* ignore */
      }
    }

    const product = await prisma.product.create({
      data: {
        title: String(title).trim().slice(0, 200),
        description: String(description || '').trim().slice(0, 2000),
        price: parseFloat(price) || 0,
        available: available !== 'false',
        images: JSON.stringify(images),
        options: {
          create: parsedOptions.map(
              o => ({
                name: String(o.name).trim().slice(0, 100),
                price: o.price !== undefined && o.price !== '' ?
                    parseFloat(o.price) :
                    null,
                available: o.available !== undefined && o.available !== '' ?
                    o.available !== false && o.available !== 'false' :
                    null,
              }))
        }
      },
      include: {options: true}
    });
    res.json({success: true, product});
  });
});

// Admin: update product
app.put('/admin/api/store/products/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({error: 'Invalid ID'});

  const upload =
      makeProductUpload().array('images', PRODUCT_IMAGE_LIMITS.maxCount);
  upload(req, res, async function(err) {
    if (err) return res.status(400).json({error: err.message});

    const existing = await prisma.product.findUnique(
        {where: {id}, include: {options: true}});
    if (!existing) return res.status(404).json({error: 'Product not found'});

    const {title, description, price, available, options, existingImages} =
        req.body;
    const data = {};
    if (title !== undefined) data.title = String(title).trim().slice(0, 200);
    if (description !== undefined)
      data.description = String(description).trim().slice(0, 2000);
    if (price !== undefined) data.price = parseFloat(price) || 0;
    if (available !== undefined)
      data.available = available !== 'false' && available !== false;

    // Handle images: keep existing + add new uploads
    let currentImages = [];
    try {
      currentImages = JSON.parse(existingImages || '[]');
    } catch (e) {
      currentImages = JSON.parse(existing.images);
    }
    const newImages = (req.files || []).map(f => f.filename);
    const allImages = [...currentImages, ...newImages].slice(
        0, PRODUCT_IMAGE_LIMITS.maxCount);
    data.images = JSON.stringify(allImages);

    // Delete removed images from disk
    const oldImages = JSON.parse(existing.images);
    const removed = oldImages.filter(img => !allImages.includes(img));
    removed.forEach(img => {
      const fp = path.join(COMPANY_DIR, 'images', 'products', img);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    });

    // Update options: delete all and recreate
    if (options !== undefined) {
      let parsedOptions = [];
      try {
        parsedOptions = JSON.parse(options);
      } catch (e) { /* ignore */
      }
      await prisma.productOption.deleteMany({where: {productId: id}});
      if (parsedOptions.length > 0) {
        await prisma.productOption.createMany({
          data: parsedOptions.map(
              o => ({
                productId: id,
                name: String(o.name).trim().slice(0, 100),
                price: o.price !== undefined && o.price !== '' &&
                        o.price !== null ?
                    parseFloat(o.price) :
                    null,
                available: o.available !== undefined && o.available !== '' &&
                        o.available !== null ?
                    o.available !== false && o.available !== 'false' :
                    null,
              }))
        });
      }
    }

    const product = await prisma.product.update(
        {where: {id}, data, include: {options: true}});
    res.json({success: true, product});
  });
});

// Admin: delete product
app.delete('/admin/api/store/products/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({error: 'Invalid ID'});

  const product = await prisma.product.findUnique({where: {id}});
  if (!product) return res.status(404).json({error: 'Not found'});

  // Delete product images from disk
  try {
    const images = JSON.parse(product.images);
    images.forEach(img => {
      const fp = path.join(COMPANY_DIR, 'images', 'products', img);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    });
  } catch (e) { /* ignore */
  }

  await prisma.product.delete({where: {id}});
  res.json({success: true});
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

/* ============================== */
/* CONTENT MANAGEMENT API         */
/* ============================== */
const IMAGE_LIMITS = {
  logo: {maxCount: 1, maxSizeMB: 2},
  carousel: {maxCount: 10, maxSizeMB: 5},
  about: {maxCount: 10, maxSizeMB: 5},
  gallery: {maxCount: 50, maxSizeMB: 5},
  partners: {maxCount: 20, maxSizeMB: 2},
};

const ALLOWED_MIME =
    ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];

function makeUpload(folder) {
  const limits = IMAGE_LIMITS[folder] || {maxCount: 10, maxSizeMB: 5};
  const storage = multer.diskStorage({
    destination: function(req, file, cb) {
      const dir = path.join(COMPANY_DIR, 'images', folder);
      fs.mkdirSync(dir, {recursive: true});
      cb(null, dir);
    },
    filename: function(req, file, cb) {
      // Sanitise original name: only keep alphanumeric, dashes, dots
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const ext = path.extname(safe).toLowerCase();
      const base = path.basename(safe, ext);
      const stamp = Date.now();
      cb(null, base + '-' + stamp + ext);
    }
  });
  return multer({
    storage,
    limits: {fileSize: limits.maxSizeMB * 1024 * 1024},
    fileFilter: function(req, file, cb) {
      if (ALLOWED_MIME.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type'));
      }
    }
  });
}

// GET images list for a folder
app.get(
    '/admin/api/content/images/:folder', requireAuth, requireAdmin,
    (req, res) => {
      const folder = req.params.folder;
      if (!IMAGE_LIMITS[folder])
        return res.status(400).json({error: 'Invalid folder'});
      const images = getImages(folder);
      res.json({images, maxCount: IMAGE_LIMITS[folder].maxCount});
    });

// POST upload images
app.post(
    '/admin/api/content/images/:folder', requireAuth, requireAdmin,
    (req, res) => {
      const folder = req.params.folder;
      if (!IMAGE_LIMITS[folder])
        return res.status(400).json({error: 'Invalid folder'});

      const limits = IMAGE_LIMITS[folder];
      const existing = getImages(folder);

      const upload = makeUpload(folder).array('images', limits.maxCount);
      upload(req, res, function(err) {
        if (err) {
          if (err.code === 'LIMIT_FILE_SIZE')
            return res.status(400).json(
                {error: 'File too large (max ' + limits.maxSizeMB + 'MB)'});
          if (err.code === 'LIMIT_UNEXPECTED_FILE')
            return res.status(400).json({error: 'Too many files'});
          return res.status(400).json({error: err.message});
        }
        if (!req.files || req.files.length === 0)
          return res.status(400).json({error: 'No files uploaded'});

        const total = existing.length + req.files.length;
        if (total > limits.maxCount) {
          // Remove uploaded files
          req.files.forEach(f => fs.unlinkSync(f.path));
          return res.status(400).json({
            error: 'Max ' + limits.maxCount + ' images allowed. Currently ' +
                existing.length + '.'
          });
        }

        // For logo, remove old images first (only 1 allowed)
        if (folder === 'logo' && existing.length > 0) {
          const dir = path.join(COMPANY_DIR, 'images', 'logo');
          existing.forEach(f => {
            const fp = path.join(dir, f);
            if (fs.existsSync(fp)) fs.unlinkSync(fp);
          });
        }

        const uploaded = req.files.map(f => f.filename);
        res.json({success: true, images: uploaded});
      });
    });

// DELETE an image
app.delete(
    '/admin/api/content/images/:folder/:filename', requireAuth, requireAdmin,
    (req, res) => {
      const folder = req.params.folder;
      const filename = req.params.filename;
      if (!IMAGE_LIMITS[folder])
        return res.status(400).json({error: 'Invalid folder'});

      // Prevent path traversal
      if (filename.includes('/') || filename.includes('\\') ||
          filename.includes('..')) {
        return res.status(400).json({error: 'Invalid filename'});
      }

      const filePath = path.join(COMPANY_DIR, 'images', folder, filename);
      if (!fs.existsSync(filePath))
        return res.status(404).json({error: 'File not found'});

      fs.unlinkSync(filePath);

      // Clean up gallery description if it was a gallery image
      if (folder === 'gallery') {
        const company = loadCompanyData();
        const nameNoExt = filename.replace(/\.[^.]+$/, '');
        if (company.companyGalleryDescriptions &&
            company.companyGalleryDescriptions[nameNoExt]) {
          delete company.companyGalleryDescriptions[nameNoExt];
          saveCompanyData(company);
        }
      }

      res.json({success: true});
    });

// Reorder images (rename with numeric prefix)
app.put(
    '/admin/api/content/images/:folder/reorder', requireAuth, requireAdmin,
    (req, res) => {
      const folder = req.params.folder;
      if (!IMAGE_LIMITS[folder])
        return res.status(400).json({error: 'Invalid folder'});

      const {order} = req.body;  // array of filenames in desired order
      if (!Array.isArray(order))
        return res.status(400).json({error: 'order must be an array'});

      const dir = path.join(COMPANY_DIR, 'images', folder);

      // Validate all files exist
      for (const f of order) {
        if (f.includes('/') || f.includes('\\') || f.includes('..'))
          return res.status(400).json({error: 'Invalid filename'});
        if (!fs.existsSync(path.join(dir, f)))
          return res.status(404).json({error: 'File not found: ' + f});
      }

      // Rename to temp names first to avoid collisions
      const tempMap = [];
      order.forEach((f, i) => {
        const ext = path.extname(f);
        const temp = '__reorder_' + i + ext;
        fs.renameSync(path.join(dir, f), path.join(dir, temp));
        tempMap.push({
          temp,
          final: String(i + 1).padStart(2, '0') + '_' + f.replace(/^\d+_/, '')
        });
      });

      // Rename from temp to final
      tempMap.forEach(({temp, final}) => {
        fs.renameSync(path.join(dir, temp), path.join(dir, final));
      });

      res.json({success: true, images: getImages(folder)});
    });

/* --- TEXT CONTENT ENDPOINTS --- */

// GET all content (data.json)
app.get('/admin/api/content/data', requireAuth, requireAdmin, (req, res) => {
  const company = loadCompanyData();
  res.json(company);
});

// PUT update about texts
app.put('/admin/api/content/about', requireAuth, requireAdmin, (req, res) => {
  const {texts} = req.body;
  if (!Array.isArray(texts))
    return res.status(400).json({error: 'texts must be an array'});
  // Sanitise: trim strings, limit length
  const clean =
      texts.map(t => String(t).trim().slice(0, 2000)).filter(t => t.length > 0);
  const company = loadCompanyData();
  company.companyAboutUsTexts = clean;
  saveCompanyData(company);
  res.json({success: true, texts: clean});
});

// PUT update services
app.put(
    '/admin/api/content/services', requireAuth, requireAdmin, (req, res) => {
      const {services} = req.body;
      if (!Array.isArray(services))
        return res.status(400).json({error: 'services must be an array'});
      const clean =
          services
              .map(s => ({
                     title: String(s.title || '').trim().slice(0, 200),
                     description:
                         String(s.description || '').trim().slice(0, 500),
                     price: String(s.price || '').trim().slice(0, 50)
                   }))
              .filter(s => s.title.length > 0);
      const company = loadCompanyData();
      company.companyServiceList = clean;
      saveCompanyData(company);
      res.json({success: true, services: clean});
    });

// PUT update gallery descriptions
app.put(
    '/admin/api/content/gallery-descriptions', requireAuth, requireAdmin,
    (req, res) => {
      const {descriptions} = req.body;
      if (typeof descriptions !== 'object')
        return res.status(400).json({error: 'descriptions must be an object'});
      const clean = {};
      Object.keys(descriptions).forEach(key => {
        const safeKey =
            String(key).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
        const val = String(descriptions[key] || '').trim().slice(0, 500);
        if (safeKey && val) clean[safeKey] = val;
      });
      const company = loadCompanyData();
      company.companyGalleryDescriptions = clean;
      saveCompanyData(company);
      res.json({success: true, descriptions: clean});
    });

// PUT update company info (name, email, phones, address, schedule, slogan,
// etc.)
app.put(
    '/admin/api/content/company-info', requireAuth, requireAdmin,
    (req, res) => {
      const allowed = [
        'companyName', 'companyEmail', 'companyPhoneNumbers', 'companySchedule',
        'companyAddress', 'companyDisclaimer', 'companySlogan',
        'companySloganSubtitle'
      ];
      const company = loadCompanyData();
      const updates = req.body;
      allowed.forEach(key => {
        if (updates[key] !== undefined) {
          if (key === 'companyPhoneNumbers') {
            company[key] = Array.isArray(updates[key]) ?
                updates[key].map(p => String(p).trim().slice(0, 30)) :
                [String(updates[key]).trim().slice(0, 30)];
          } else {
            company[key] = String(updates[key]).trim().slice(0, 500);
          }
        }
      });
      saveCompanyData(company);
      res.json({success: true});
    });
