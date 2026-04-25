require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const multer = require('multer');
const prisma = require('./lib/db');

const app = express();
const PORT = process.env.PORT || 3002;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/images', express.static(path.join(__dirname, 'company', 'images')));

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
  const filePath = path.join(__dirname, 'company', 'data.json');
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveCompanyData(data) {
  const filePath = path.join(__dirname, 'company', 'data.json');
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function getImages(subdir) {
  const dirPath = path.join(__dirname, 'company', 'images', subdir);
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
      const dir = path.join(__dirname, 'company', 'images', folder);
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
          const dir = path.join(__dirname, 'company', 'images', 'logo');
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

      const filePath =
          path.join(__dirname, 'company', 'images', folder, filename);
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

      const dir = path.join(__dirname, 'company', 'images', folder);

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
