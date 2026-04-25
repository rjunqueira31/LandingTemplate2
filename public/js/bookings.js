document.addEventListener('DOMContentLoaded', function() {
  var serviceOptions = document.getElementById('serviceOptions');
  if (!serviceOptions) return;  // Not on bookings page

  var slotsGrid = document.getElementById('slotsGrid');
  var slotsEmpty = document.getElementById('slotsEmpty');
  var calDays = document.getElementById('calDays');
  var calMonth = document.getElementById('calMonth');
  var calPrev = document.getElementById('calPrev');
  var calNext = document.getElementById('calNext');
  var btnNext = document.getElementById('btnNext');
  var btnBack = document.getElementById('btnBack');
  var bookingSummary = document.getElementById('bookingSummary');
  var bookingSuccess = document.getElementById('bookingSuccess');
  var bookingError = document.getElementById('bookingError');
  var btnNewBooking = document.getElementById('btnNewBooking');

  var state = {
    step: 1,
    services: [],
    maxAdvanceDays: 30,
    selectedService: null,
    selectedDate: null,
    selectedTime: null,
    calYear: new Date().getFullYear(),
    calMonth: new Date().getMonth()
  };

  // Fetch services on load
  fetch('/api/bookings/services')
      .then(function(r) {
        return r.json();
      })
      .then(function(data) {
        state.services = data.services;
        state.maxAdvanceDays = data.maxAdvanceDays || 30;
        renderServices();
      });

  function renderServices() {
    serviceOptions.innerHTML = '';
    state.services.forEach(function(svc) {
      var btn = document.createElement('button');
      btn.className = 'service-option';
      btn.setAttribute('data-id', svc.id);
      btn.innerHTML = '<span class="svc-title">' + escapeHtml(svc.title) +
          '</span>' +
          '<span class="svc-duration">' + svc.durationMinutes + ' ' +
          i18n.t('min') + '</span>';
      btn.addEventListener('click', function() {
        document.querySelectorAll('.service-option').forEach(function(b) {
          b.classList.remove('selected');
        });
        btn.classList.add('selected');
        state.selectedService = svc;
        btnNext.disabled = false;
      });
      serviceOptions.appendChild(btn);
    });
  }

  // Calendar
  function renderCalendar() {
    var year = state.calYear;
    var month = state.calMonth;
    var monthNames = i18n.t('months');
    calMonth.textContent = monthNames[month] + ' ' + year;

    var firstDay = new Date(year, month, 1).getDay();
    var startOffset = (firstDay === 0 ? 6 : firstDay - 1);  // Monday = 0
    var daysInMonth = new Date(year, month + 1, 0).getDate();

    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + state.maxAdvanceDays);

    calDays.innerHTML = '';

    // Empty cells for offset
    for (var i = 0; i < startOffset; i++) {
      var empty = document.createElement('span');
      empty.className = 'cal-day disabled';
      calDays.appendChild(empty);
    }

    for (var d = 1; d <= daysInMonth; d++) {
      var dayDate = new Date(year, month, d);
      var dateStr = formatDate(dayDate);
      var dayEl = document.createElement('button');
      dayEl.className = 'cal-day';
      dayEl.textContent = d;
      dayEl.setAttribute('data-date', dateStr);

      var isPast = dayDate < today;
      var isTooFar = dayDate > maxDate;
      var isToday = dayDate.getTime() === today.getTime();

      if (isPast || isTooFar) {
        dayEl.classList.add('disabled');
        dayEl.disabled = true;
      } else {
        if (isToday) dayEl.classList.add('today');
        if (state.selectedDate === dateStr) dayEl.classList.add('selected');
        (function(ds, el) {
          el.addEventListener('click', function() {
            document.querySelectorAll('.cal-day').forEach(function(c) {
              c.classList.remove('selected');
            });
            el.classList.add('selected');
            state.selectedDate = ds;
            state.selectedTime = null;
            btnNext.disabled = false;
          });
        })(dateStr, dayEl);
      }

      calDays.appendChild(dayEl);
    }

    // Disable prev button if showing current month
    calPrev.disabled =
        (year === today.getFullYear() && month === today.getMonth());
    var maxMonth = maxDate.getMonth();
    var maxYear = maxDate.getFullYear();
    calNext.disabled = (year === maxYear && month === maxMonth);
  }

  calPrev.addEventListener('click', function() {
    state.calMonth--;
    if (state.calMonth < 0) {
      state.calMonth = 11;
      state.calYear--;
    }
    renderCalendar();
  });

  calNext.addEventListener('click', function() {
    state.calMonth++;
    if (state.calMonth > 11) {
      state.calMonth = 0;
      state.calYear++;
    }
    renderCalendar();
  });

  // Slots
  function loadSlots() {
    slotsGrid.innerHTML = '';
    slotsEmpty.style.display = 'none';
    btnNext.disabled = true;

    fetch(
        '/api/bookings/slots?date=' + state.selectedDate +
        '&serviceId=' + state.selectedService.id)
        .then(function(r) {
          return r.json();
        })
        .then(function(data) {
          if (!data.slots || data.slots.length === 0) {
            slotsEmpty.style.display = 'block';
            return;
          }
          data.slots.forEach(function(slot) {
            var btn = document.createElement('button');
            btn.className = 'slot-btn';
            btn.textContent = slot;
            if (state.selectedTime === slot) btn.classList.add('selected');
            btn.addEventListener('click', function() {
              document.querySelectorAll('.slot-btn').forEach(function(b) {
                b.classList.remove('selected');
              });
              btn.classList.add('selected');
              state.selectedTime = slot;
              btnNext.disabled = false;
            });
            slotsGrid.appendChild(btn);
          });
        });
  }

  // Steps
  function showStep(step) {
    state.step = step;
    document.querySelectorAll('.booking-step').forEach(function(el) {
      el.classList.remove('active');
      if (Number(el.getAttribute('data-step')) === step)
        el.classList.add('active');
    });

    bookingSummary.style.display = 'none';
    bookingSuccess.style.display = 'none';
    bookingError.style.display = 'none';
    btnNext.style.display = '';
    btnBack.style.display = step > 1 ? '' : 'none';

    if (step === 1) {
      btnNext.disabled = !state.selectedService;
      btnNext.textContent = i18n.t('next');
    } else if (step === 2) {
      renderCalendar();
      btnNext.disabled = !state.selectedDate;
      btnNext.textContent = i18n.t('next');
    } else if (step === 3) {
      loadSlots();
      btnNext.textContent = i18n.t('next');
    } else if (step === 4) {
      btnNext.disabled = false;
      btnNext.textContent = i18n.t('review_booking');
      validateDetails();
    } else if (step === 5) {
      // Summary
      document.querySelectorAll('.booking-step').forEach(function(el) {
        el.classList.remove('active');
      });
      bookingSummary.style.display = '';
      document.getElementById('sumService').textContent =
          state.selectedService.title;
      document.getElementById('sumDate').textContent =
          formatDateNice(state.selectedDate);
      document.getElementById('sumTime').textContent = state.selectedTime;
      document.getElementById('sumName').textContent =
          document.getElementById('customerName').value.trim();
      document.getElementById('sumPhone').textContent =
          document.getElementById('customerPhone').value.trim();
      btnNext.textContent = i18n.t('confirm_booking');
      btnNext.disabled = false;
    }
  }

  function validateDetails() {
    var name = document.getElementById('customerName').value.trim();
    var phone = document.getElementById('customerPhone').value.trim();
    btnNext.disabled = !(name && phone);
  }

  document.getElementById('customerName')
      .addEventListener('input', validateDetails);
  document.getElementById('customerPhone')
      .addEventListener('input', validateDetails);

  btnNext.addEventListener('click', function() {
    if (state.step < 5) {
      showStep(state.step + 1);
    } else {
      submitBooking();
    }
  });

  btnBack.addEventListener('click', function() {
    if (state.step === 5) {
      showStep(4);
    } else if (state.step > 1) {
      showStep(state.step - 1);
    }
  });

  btnNewBooking.addEventListener('click', function() {
    state.selectedService = null;
    state.selectedDate = null;
    state.selectedTime = null;
    document.getElementById('customerName').value = '';
    document.getElementById('customerPhone').value = '';
    document.querySelectorAll('.service-option').forEach(function(b) {
      b.classList.remove('selected');
    });
    showStep(1);
  });

  function submitBooking() {
    btnNext.disabled = true;
    btnNext.textContent = i18n.t('booking_loading');
    bookingError.style.display = 'none';

    fetch('/api/bookings', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        date: state.selectedDate,
        time: state.selectedTime,
        serviceId: state.selectedService.id,
        customerName: document.getElementById('customerName').value.trim(),
        customerPhone: document.getElementById('customerPhone').value.trim()
      })
    })
        .then(function(r) {
          return r.json().then(function(d) {
            return {ok: r.ok, data: d};
          });
        })
        .then(function(result) {
          if (!result.ok) {
            bookingError.textContent =
                result.data.error || i18n.t('something_wrong');
            bookingError.style.display = 'block';
            btnNext.disabled = false;
            btnNext.textContent = i18n.t('confirm_booking');
            return;
          }

          // Success
          document.querySelectorAll('.booking-step').forEach(function(el) {
            el.classList.remove('active');
          });
          bookingSummary.style.display = 'none';
          btnNext.style.display = 'none';
          btnBack.style.display = 'none';
          bookingSuccess.style.display = '';
          document.getElementById('successMessage').textContent =
              state.selectedService.title + i18n.t('on') +
              formatDateNice(state.selectedDate) + i18n.t('at') +
              state.selectedTime;
        })
        .catch(function() {
          bookingError.textContent = i18n.t('network_error');
          bookingError.style.display = 'block';
          btnNext.disabled = false;
          btnNext.textContent = i18n.t('confirm_booking');
        });
  }

  // Helpers
  function formatDate(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function formatDateNice(dateStr) {
    var parts = dateStr.split('-');
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    var lang = i18n.getLang();
    var locale = lang === 'pt' ? 'pt-PT' : 'en-US';
    var options =
        {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'};
    return d.toLocaleDateString(locale, options);
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // Re-render on language change
  document.addEventListener('langchange', function() {
    renderCalendar();
    showStep(state.step);
  });

  // Init
  showStep(1);
});
