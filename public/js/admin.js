document.addEventListener('DOMContentLoaded', function() {
  // Password visibility toggles
  document.querySelectorAll('.toggle-pw').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var input = this.parentElement.querySelector('input');
      var icon = this.querySelector('i');
      if (input.type === 'password') {
        input.type = 'text';
        icon.classList.replace('fa-eye', 'fa-eye-slash');
      } else {
        input.type = 'password';
        icon.classList.replace('fa-eye-slash', 'fa-eye');
      }
    });
  });

  var services = [];
  var capacity = 1;
  var currentWeekStart = getMonday(new Date());
  var selectedDayIndex =
      new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;  // Mon=0

  // ============================
  // SIDEBAR NAV
  // ============================
  document.querySelectorAll('.nav-item').forEach(function(item) {
    item.addEventListener('click', function(e) {
      e.preventDefault();
      document.querySelectorAll('.nav-item').forEach(function(n) {
        n.classList.remove('active');
      });
      item.classList.add('active');
      var page = item.getAttribute('data-page');
      document.querySelectorAll('.admin-page').forEach(function(p) {
        p.classList.remove('active');
      });
      var target = document.getElementById('page-' + page);
      if (target) target.classList.add('active');
    });
  });

  // Mobile sidebar toggle
  var sidebarToggle = document.getElementById('sidebarToggle');
  var sidebar = document.querySelector('.sidebar');
  var sidebarOverlay = document.createElement('div');
  sidebarOverlay.className = 'sidebar-overlay';
  document.body.appendChild(sidebarOverlay);

  function closeSidebar() {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('active');
  }

  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', function() {
      sidebar.classList.toggle('open');
      sidebarOverlay.classList.toggle('active');
    });
  }

  sidebarOverlay.addEventListener('click', closeSidebar);

  // Close sidebar when a nav item is clicked (mobile)
  document.querySelectorAll('.nav-item').forEach(function(item) {
    item.addEventListener('click', closeSidebar);
  });

  // ============================
  // LOAD SERVICES
  // ============================
  if (typeof PAGES !== 'undefined' && PAGES.bookings) {
    fetch('/admin/api/services')
        .then(function(r) {
          return r.json();
        })
        .then(function(data) {
          services = data.services;
          capacity = data.capacity || 1;
          populateServiceDropdown();
          renderWeek();
        });

    function populateServiceDropdown() {
      var sel = document.getElementById('modalService');
      sel.innerHTML = '';
      services.forEach(function(s) {
        var opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.title + ' (' + s.durationMinutes + ' min)';
        sel.appendChild(opt);
      });
    }

    // ============================
    // WEEK NAVIGATION
    // ============================
    document.getElementById('weekPrev').addEventListener('click', function() {
      currentWeekStart = addDays(currentWeekStart, -7);
      renderWeek();
    });

    document.getElementById('weekNext').addEventListener('click', function() {
      currentWeekStart = addDays(currentWeekStart, 7);
      renderWeek();
    });

    document.getElementById('weekToday').addEventListener('click', function() {
      currentWeekStart = getMonday(new Date());
      selectedDayIndex =
          new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
      renderWeek();
    });

    // Mobile date picker (calendar icon)
    var weekDatePicker = document.getElementById('weekDatePicker');
    document.getElementById('weekDateBtn')
        .addEventListener('click', function() {
          var currentDate = addDays(currentWeekStart, selectedDayIndex);
          weekDatePicker.value = formatDate(currentDate);
          weekDatePicker.showPicker();
        });

    weekDatePicker.addEventListener('change', function() {
      if (!weekDatePicker.value) return;
      var parts = weekDatePicker.value.split('-');
      var picked = new Date(
          parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      currentWeekStart = getMonday(picked);
      selectedDayIndex = picked.getDay() === 0 ? 6 : picked.getDay() - 1;
      renderWeek();
    });

    // ============================
    // RENDER WEEK
    // ============================
    function renderWeek() {
      var weekEnd = addDays(currentWeekStart, 6);
      var months = i18n.t('months_short');
      var label = months[currentWeekStart.getMonth()] + ' ' +
          currentWeekStart.getDate();
      if (currentWeekStart.getMonth() !== weekEnd.getMonth()) {
        label += ' — ' + months[weekEnd.getMonth()] + ' ' + weekEnd.getDate();
      } else {
        label += ' — ' + weekEnd.getDate();
      }
      label += ', ' + currentWeekStart.getFullYear();
      document.getElementById('weekLabel').textContent = label;

      renderDayTabs();
      loadDayBookings();
    }

    function renderDayTabs() {
      var tabs = document.getElementById('dayTabs');
      tabs.innerHTML = '';
      var dayNames = [
        i18n.t('mon'), i18n.t('tue'), i18n.t('wed'), i18n.t('thu'),
        i18n.t('fri'), i18n.t('sat'), i18n.t('sun')
      ];
      var today = new Date();
      today.setHours(0, 0, 0, 0);

      for (var i = 0; i < 7; i++) {
        var date = addDays(currentWeekStart, i);
        var tab = document.createElement('button');
        tab.className = 'day-tab';
        if (i === selectedDayIndex) tab.classList.add('active');
        if (date.getTime() === today.getTime()) tab.classList.add('today');
        tab.innerHTML = '<span class="day-name">' + dayNames[i] +
            '</span><span class="day-num">' + date.getDate() + '</span>';
        (function(idx, tabEl) {
          tabEl.addEventListener('click', function() {
            selectedDayIndex = idx;
            document.querySelectorAll('.day-tab').forEach(function(t) {
              t.classList.remove('active');
            });
            tabEl.classList.add('active');
            updateMobileDayLabel();
            loadDayBookings();
          });
        })(i, tab);
        tabs.appendChild(tab);
      }
      updateMobileDayLabel();
    }

    // ============================
    // MOBILE DAY NAV
    // ============================
    var dayNavLabel = document.getElementById('dayNavLabel');
    var dayFullNames = i18n.t('day_names_full');

    function updateMobileDayLabel() {
      if (!dayNavLabel) return;
      var date = addDays(currentWeekStart, selectedDayIndex);
      var names = i18n.t('day_names_full');
      dayNavLabel.textContent = names[selectedDayIndex] + ' ' + date.getDate();
    }

    document.getElementById('dayPrev').addEventListener('click', function() {
      if (selectedDayIndex > 0) {
        selectedDayIndex--;
      } else {
        currentWeekStart = addDays(currentWeekStart, -7);
        selectedDayIndex = 6;
      }
      renderWeek();
    });

    document.getElementById('dayNext').addEventListener('click', function() {
      if (selectedDayIndex < 6) {
        selectedDayIndex++;
      } else {
        currentWeekStart = addDays(currentWeekStart, 7);
        selectedDayIndex = 0;
      }
      renderWeek();
    });

    // ============================
    // LOAD & RENDER DAY BOOKINGS
    // ============================
    function loadDayBookings() {
      var date = addDays(currentWeekStart, selectedDayIndex);
      var dateStr = formatDate(date);

      fetch('/admin/api/bookings?from=' + dateStr + '&to=' + dateStr)
          .then(function(r) {
            return r.json();
          })
          .then(function(data) {
            renderTimeline(data.bookings, dateStr);
          });
    }

    function renderTimeline(bookings, dateStr) {
      var timeline = document.getElementById('dayTimeline');
      timeline.innerHTML = '';

      var slotMin = 30;
      var startHour = 8;
      var endHour = 21;

      // Generate time slots from 08:00 to 21:00
      var slots = [];
      for (var h = startHour; h <= endHour; h++) {
        slots.push(pad(h) + ':00');
        if (h < endHour) slots.push(pad(h) + ':30');
      }

      // Build rows
      var contentEls = {};
      slots.forEach(function(slot) {
        var row = document.createElement('div');
        row.className = 'timeline-row';

        var timeEl = document.createElement('div');
        timeEl.className = 'timeline-time';
        timeEl.textContent = slot;

        var content = document.createElement('div');
        content.className = 'timeline-content';

        content.addEventListener('click', function(e) {
          if (e.target === content) {
            openAddModal(dateStr, slot);
          }
        });

        row.appendChild(timeEl);
        row.appendChild(content);
        timeline.appendChild(row);
        contentEls[slot] = content;
      });

      if (bookings.length === 0) {
        var hint = document.createElement('div');
        hint.className = 'timeline-empty';
        hint.textContent = i18n.t('no_bookings_hint');
        timeline.appendChild(hint);
        return;
      }

      // Measure actual row height from the DOM
      var firstRow = timeline.querySelector('.timeline-row');
      var rowH = firstRow ? firstRow.getBoundingClientRect().height : 38;

      // Assign columns: greedy interval-scheduling
      // Each booking gets { startMin, endMin, column }
      var colWidth = 100 / capacity;  // percentage per column
      var enriched = bookings.map(function(b) {
        var svc = services.find(function(s) {
          return s.id === b.serviceId;
        });
        var dur = (svc && svc.durationMinutes) || slotMin;
        var parts = b.time.split(':').map(Number);
        var startMin = parts[0] * 60 + parts[1];
        return {
          booking: b,
          startMin: startMin,
          endMin: startMin + dur,
          col: -1
        };
      });
      // Sort by start time, then by duration (longer first for nicer layout)
      enriched.sort(function(a, b) {
        return a.startMin - b.startMin ||
            (b.endMin - b.startMin) - (a.endMin - a.startMin);
      });
      // Track when each column becomes free
      var colEnd = [];
      for (var c = 0; c < capacity; c++) colEnd.push(0);
      enriched.forEach(function(item) {
        for (var c = 0; c < capacity; c++) {
          if (colEnd[c] <= item.startMin) {
            item.col = c;
            colEnd[c] = item.endMin;
            break;
          }
        }
        if (item.col === -1) {
          // overflow: put in last column
          item.col = capacity - 1;
        }
      });

      // Place each booking
      enriched.forEach(function(item) {
        var b = item.booking;
        var dur = item.endMin - item.startMin;

        var contentEl = contentEls[b.time];
        if (!contentEl) return;

        var spanHeight = (dur / slotMin) * rowH;

        var chip = document.createElement('button');
        chip.className =
            'booking-chip booking-chip-span source-' + (b.source || 'website');
        chip.style.height = spanHeight + 'px';
        chip.style.width = colWidth + '%';
        chip.style.left = (item.col * colWidth) + '%';
        chip.innerHTML = '<span class="chip-service">' +
            escapeHtml(b.serviceName) + '</span>' +
            '<span class="chip-name">' + escapeHtml(b.customerName || '') +
            '</span>' +
            '<span class="chip-source">' + (b.source || 'web') + '</span>';
        chip.addEventListener('click', function() {
          openEditModal(b);
        });
        contentEl.appendChild(chip);
      });
    }

    // ============================
    // MODAL - ADD / EDIT
    // ============================
    var modal = document.getElementById('bookingModal');
    var modalTitle = document.getElementById('modalTitle');
    var modalBookingId = document.getElementById('modalBookingId');
    var modalService = document.getElementById('modalService');
    var modalDate = document.getElementById('modalDate');
    var modalTime = document.getElementById('modalTime');
    var modalName = document.getElementById('modalName');
    var modalPhone = document.getElementById('modalPhone');
    var modalNotes = document.getElementById('modalNotes');
    var modalDelete = document.getElementById('modalDelete');
    var modalSave = document.getElementById('modalSave');

    document.getElementById('btnAddBooking')
        .addEventListener('click', function() {
          var date = addDays(currentWeekStart, selectedDayIndex);
          openAddModal(formatDate(date), '09:00');
        });

    function openAddModal(dateStr, time) {
      modalTitle.textContent = i18n.t('add_booking');
      modalBookingId.value = '';
      modalService.value = services.length > 0 ? services[0].id : '';
      modalDate.value = dateStr;
      modalTime.value = time;
      modalName.value = '';
      modalPhone.value = '';
      modalNotes.value = '';
      modalDelete.style.display = 'none';
      document.getElementById('modalError').style.display = 'none';
      modal.classList.add('active');
    }

    function openEditModal(booking) {
      modalTitle.textContent = i18n.t('edit_booking');
      modalBookingId.value = booking.id;
      modalService.value = booking.serviceId;
      modalDate.value = booking.date;
      modalTime.value = booking.time;
      modalName.value = booking.customerName || '';
      modalPhone.value = booking.customerPhone || '';
      modalNotes.value = booking.notes || '';
      modalDelete.style.display = '';
      document.getElementById('modalError').style.display = 'none';
      modal.classList.add('active');
    }

    function closeModal() {
      modal.classList.remove('active');
    }

    document.getElementById('modalClose').addEventListener('click', closeModal);
    modal.addEventListener('click', function(e) {
      if (e.target === modal) closeModal();
    });

    // Save
    modalSave.addEventListener('click', function() {
      var id = modalBookingId.value;
      var payload = {
        serviceId: modalService.value,
        date: modalDate.value,
        time: modalTime.value,
        customerName: modalName.value,
        customerPhone: modalPhone.value,
        notes: modalNotes.value
      };

      var url = id ? '/admin/api/bookings/' + id : '/admin/api/bookings';
      var method = id ? 'PUT' : 'POST';

      fetch(url, {
        method: method,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
      })
          .then(function(r) {
            return r.json();
          })
          .then(function(data) {
            if (data.success) {
              closeModal();
              loadDayBookings();
            } else {
              var errKey = data.error === 'All staff occupied at this time' ?
                  'capacity_full' :
                  '';
              var msg = errKey ? i18n.t(errKey) :
                                 (data.error || i18n.t('error_saving'));
              var errEl = document.getElementById('modalError');
              errEl.textContent = msg;
              errEl.style.display = 'block';
            }
          });
    });

    // Delete
    modalDelete.addEventListener('click', function() {
      var id = modalBookingId.value;
      if (!id) return;
      if (!confirm(i18n.t('delete_booking_confirm'))) return;

      fetch('/admin/api/bookings/' + id, {method: 'DELETE'})
          .then(function(r) {
            return r.json();
          })
          .then(function(data) {
            if (data.success) {
              closeModal();
              loadDayBookings();
            }
          });
    });
  }  // end PAGES.bookings

  // ============================
  // CHANGE PASSWORD
  // ============================
  document.getElementById('btnChangePassword')
      .addEventListener('click', function() {
        var msg = document.getElementById('passwordMsg');
        var currentPw = document.getElementById('currentPassword').value;
        var newPw = document.getElementById('newPassword').value;
        msg.textContent = '';
        msg.className = 'settings-msg';

        fetch('/admin/api/change-password', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({currentPassword: currentPw, newPassword: newPw})
        })
            .then(function(r) {
              return r.json().then(function(d) {
                return {ok: r.ok, data: d};
              });
            })
            .then(function(result) {
              if (result.ok) {
                msg.textContent = i18n.t('password_updated');
                msg.classList.add('success');
                document.getElementById('currentPassword').value = '';
                document.getElementById('newPassword').value = '';
              } else {
                msg.textContent = result.data.error || i18n.t('error');
                msg.classList.add('error');
              }
            });
      });

  // ============================
  // HELPERS
  // ============================
  function getMonday(d) {
    var date = new Date(d);
    date.setHours(0, 0, 0, 0);
    var day = date.getDay();
    var diff = (day === 0 ? -6 : 1) - day;
    date.setDate(date.getDate() + diff);
    return date;
  }

  function addDays(d, n) {
    var date = new Date(d);
    date.setDate(date.getDate() + n);
    return date;
  }

  function formatDate(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' +
        pad(d.getDate());
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ============================
  // USER MANAGEMENT (admin only)
  // ============================
  if (typeof USER_ROLE !== 'undefined' && USER_ROLE === 'admin') {
    var userModal = document.getElementById('userModal');
    var usersTableBody = document.getElementById('usersTableBody');

    function loadUsers() {
      fetch('/admin/api/users')
          .then(function(r) {
            return r.json();
          })
          .then(function(data) {
            renderUsersTable(data.users);
          });
    }

    function renderUsersTable(users) {
      usersTableBody.innerHTML = '';
      users.forEach(function(u) {
        var tr = document.createElement('tr');
        tr.innerHTML = '<td>' + escapeHtml(u.username) + '</td>' +
            '<td><span class="role-badge role-' + escapeHtml(u.role) + '">' +
            escapeHtml(u.role) + '</span></td>' +
            '<td>' + u.vacationDays + '</td>' +
            '<td>' + u.used + '</td>' +
            '<td>' + u.booked + '</td>' +
            '<td>' + u.remaining + '</td>' +
            '<td></td>';
        var deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-delete-user';
        deleteBtn.textContent = i18n.t('delete');
        deleteBtn.addEventListener('click', function() {
          if (!confirm(
                  i18n.t('delete_user_confirm').replace('{name}', u.username)))
            return;
          fetch('/admin/api/users/' + u.id, {method: 'DELETE'})
              .then(function(r) {
                return r.json();
              })
              .then(function(data) {
                if (data.success) {
                  loadUsers();
                } else {
                  alert(data.error || i18n.t('error_deleting_user'));
                }
              });
        });
        tr.lastChild.appendChild(deleteBtn);
        usersTableBody.appendChild(tr);
      });
    }

    // Open add user modal
    document.getElementById('btnAddUser').addEventListener('click', function() {
      document.getElementById('userModalUsername').value = '';
      document.getElementById('userModalPassword').value = '';
      document.getElementById('userModalRole').value = 'employee';
      userModal.classList.add('active');
    });

    // Close user modal
    document.getElementById('userModalClose')
        .addEventListener('click', function() {
          userModal.classList.remove('active');
        });
    document.getElementById('userModalCancel')
        .addEventListener('click', function() {
          userModal.classList.remove('active');
        });
    userModal.addEventListener('click', function(e) {
      if (e.target === userModal) userModal.classList.remove('active');
    });

    // Save new user
    document.getElementById('userModalSave')
        .addEventListener('click', function() {
          var vDays = document.getElementById('userModalVacationDays').value;
          var payload = {
            username: document.getElementById('userModalUsername').value,
            password: document.getElementById('userModalPassword').value,
            role: document.getElementById('userModalRole').value
          };
          if (vDays !== '') payload.vacationDays = parseInt(vDays, 10);

          fetch('/admin/api/users', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
          })
              .then(function(r) {
                return r.json().then(function(d) {
                  return {ok: r.ok, data: d};
                });
              })
              .then(function(result) {
                if (result.ok) {
                  userModal.classList.remove('active');
                  loadUsers();
                } else {
                  alert(result.data.error || i18n.t('error_creating_user'));
                }
              });
        });

    // Load users when navigating to users page
    document.querySelectorAll('.nav-item').forEach(function(item) {
      item.addEventListener('click', function() {
        if (item.getAttribute('data-page') === 'users') loadUsers();
      });
    });
  }

  // ============================
  // CONTENT MANAGEMENT (admin only)
  // ============================
  if (typeof USER_ROLE !== 'undefined' && USER_ROLE === 'admin') {
    var contentData = null;

    // Content sub-tabs
    document.querySelectorAll('.content-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        document.querySelectorAll('.content-tab').forEach(function(t) {
          t.classList.remove('active');
        });
        tab.classList.add('active');
        document.querySelectorAll('.content-section').forEach(function(s) {
          s.classList.remove('active');
        });
        var target = document.getElementById(
            'section-' + tab.getAttribute('data-section'));
        if (target) target.classList.add('active');
      });
    });

    function showMsg(id, text, isError) {
      var el = document.getElementById(id);
      if (!el) return;
      el.textContent = text;
      el.className = 'content-msg visible' + (isError ? ' error' : '');
      setTimeout(function() {
        el.classList.remove('visible');
      }, 3000);
    }

    function loadContentData() {
      fetch('/admin/api/content/data')
          .then(function(r) {
            return r.json();
          })
          .then(function(data) {
            contentData = data;
            populateCompanyInfo();
            populateAboutTexts();
            populateServices();
          });
    }

    // --- COMPANY INFO ---
    function populateCompanyInfo() {
      if (!contentData) return;
      document.getElementById('cntCompanyName').value =
          contentData.companyName || '';
      document.getElementById('cntCompanyEmail').value =
          contentData.companyEmail || '';
      document.getElementById('cntCompanyPhone').value =
          (contentData.companyPhoneNumbers || []).join(', ');
      document.getElementById('cntCompanyAddress').value =
          contentData.companyAddress || '';
      document.getElementById('cntCompanySchedule').value =
          contentData.companySchedule || '';
      document.getElementById('cntCompanySlogan').value =
          contentData.companySlogan || '';
      document.getElementById('cntCompanySloganSub').value =
          contentData.companySloganSubtitle || '';
      document.getElementById('cntCompanyDisclaimer').value =
          contentData.companyDisclaimer || '';
    }

    document.getElementById('btnSaveCompanyInfo')
        .addEventListener('click', function() {
          var phones = document.getElementById('cntCompanyPhone')
                           .value.split(',')
                           .map(function(p) {
                             return p.trim();
                           })
                           .filter(function(p) {
                             return p;
                           });
          fetch('/admin/api/content/company-info', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
              companyName: document.getElementById('cntCompanyName').value,
              companyEmail: document.getElementById('cntCompanyEmail').value,
              companyPhoneNumbers: phones,
              companyAddress:
                  document.getElementById('cntCompanyAddress').value,
              companySchedule:
                  document.getElementById('cntCompanySchedule').value,
              companySlogan: document.getElementById('cntCompanySlogan').value,
              companySloganSubtitle:
                  document.getElementById('cntCompanySloganSub').value,
              companyDisclaimer:
                  document.getElementById('cntCompanyDisclaimer').value
            })
          })
              .then(function(r) {
                return r.json();
              })
              .then(function(data) {
                showMsg(
                    'companyInfoMsg',
                    data.success ? i18n.t('cnt_saved') :
                                   (data.error || i18n.t('error')),
                    !data.success);
              });
        });

    // --- ABOUT TEXTS ---
    function populateAboutTexts() {
      var container = document.getElementById('aboutTextsContainer');
      if (!container || !contentData) return;
      container.innerHTML = '';
      (contentData.companyAboutUsTexts || []).forEach(function(text) {
        addAboutTextRow(container, text);
      });
    }

    function addAboutTextRow(container, text) {
      var item = document.createElement('div');
      item.className = 'about-text-item';
      var ta = document.createElement('textarea');
      ta.value = text || '';
      ta.maxLength = 2000;
      ta.setAttribute('data-i18n-placeholder', 'cnt_about_placeholder');
      ta.placeholder = i18n.t('cnt_about_placeholder');
      var btn = document.createElement('button');
      btn.className = 'btn-remove-item';
      btn.innerHTML = '<i class="fas fa-trash"></i>';
      btn.addEventListener('click', function() {
        item.remove();
      });
      item.appendChild(ta);
      item.appendChild(btn);
      container.appendChild(item);
    }

    document.getElementById('btnAddAboutText')
        .addEventListener('click', function() {
          addAboutTextRow(document.getElementById('aboutTextsContainer'), '');
        });

    document.getElementById('btnSaveAboutTexts')
        .addEventListener('click', function() {
          var texts = [];
          document.querySelectorAll('#aboutTextsContainer textarea')
              .forEach(function(ta) {
                if (ta.value.trim()) texts.push(ta.value.trim());
              });
          fetch('/admin/api/content/about', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({texts: texts})
          })
              .then(function(r) {
                return r.json();
              })
              .then(function(data) {
                showMsg(
                    'aboutTextsMsg',
                    data.success ? i18n.t('cnt_saved') :
                                   (data.error || i18n.t('error')),
                    !data.success);
                if (data.success) contentData.companyAboutUsTexts = data.texts;
              });
        });

    // --- SERVICES ---
    function populateServices() {
      var container = document.getElementById('servicesContainer');
      if (!container || !contentData) return;
      container.innerHTML = '';
      (contentData.companyServiceList || []).forEach(function(svc) {
        addServiceRow(container, svc);
      });
    }

    function addServiceRow(container, svc) {
      var item = document.createElement('div');
      item.className = 'service-edit-item';
      var titleInput = document.createElement('input');
      titleInput.type = 'text';
      titleInput.value = svc.title || '';
      titleInput.placeholder = i18n.t('cnt_svc_title');
      titleInput.maxLength = 200;
      var descInput = document.createElement('input');
      descInput.type = 'text';
      descInput.value = svc.description || '';
      descInput.placeholder = i18n.t('cnt_svc_desc');
      descInput.maxLength = 500;
      var priceInput = document.createElement('input');
      priceInput.type = 'text';
      priceInput.value = svc.price || '';
      priceInput.placeholder = i18n.t('cnt_svc_price');
      priceInput.maxLength = 50;
      var btn = document.createElement('button');
      btn.className = 'btn-remove-item';
      btn.innerHTML = '<i class="fas fa-trash"></i>';
      btn.addEventListener('click', function() {
        item.remove();
      });
      item.appendChild(titleInput);
      item.appendChild(descInput);
      item.appendChild(priceInput);
      item.appendChild(btn);
      container.appendChild(item);
    }

    document.getElementById('btnAddService')
        .addEventListener('click', function() {
          addServiceRow(document.getElementById('servicesContainer'), {});
        });

    document.getElementById('btnSaveServices')
        .addEventListener('click', function() {
          var services = [];
          document.querySelectorAll('#servicesContainer .service-edit-item')
              .forEach(function(row) {
                var inputs = row.querySelectorAll('input');
                if (inputs[0].value.trim()) {
                  services.push({
                    title: inputs[0].value.trim(),
                    description: inputs[1].value.trim(),
                    price: inputs[2].value.trim()
                  });
                }
              });
          fetch('/admin/api/content/services', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({services: services})
          })
              .then(function(r) {
                return r.json();
              })
              .then(function(data) {
                showMsg(
                    'servicesMsg',
                    data.success ? i18n.t('cnt_saved') :
                                   (data.error || i18n.t('error')),
                    !data.success);
                if (data.success)
                  contentData.companyServiceList = data.services;
              });
        });

    // --- IMAGE SECTIONS ---
    function loadImageGrid(folder, gridId, msgId, options) {
      fetch('/admin/api/content/images/' + folder)
          .then(function(r) {
            return r.json();
          })
          .then(function(data) {
            renderImageGrid(folder, gridId, data.images, options);
          });
    }

    function renderImageGrid(folder, gridId, images, options) {
      var grid = document.getElementById(gridId);
      if (!grid) return;
      grid.innerHTML = '';
      images.forEach(function(img) {
        var item = document.createElement('div');
        item.className = 'image-grid-item';
        item.innerHTML = '<img src="/images/' + folder + '/' +
            encodeURIComponent(img) + '" alt="" loading="lazy">' +
            '<div class="img-overlay">' +
            '<button class="btn-img-delete" title="Delete"><i class="fas fa-trash"></i></button>' +
            '<span class="img-filename">' + escapeHtml(img) + '</span>' +
            '</div>';
        // Gallery: add description input
        if (options && options.descriptions) {
          var nameNoExt = img.replace(/\.[^.]+$/, '');
          var desc = (contentData && contentData.companyGalleryDescriptions &&
                      contentData.companyGalleryDescriptions[nameNoExt]) ||
              '';
          var descInput = document.createElement('input');
          descInput.type = 'text';
          descInput.className = 'img-desc-input';
          descInput.placeholder = i18n.t('cnt_img_desc');
          descInput.value = desc;
          descInput.setAttribute('data-key', nameNoExt);
          descInput.maxLength = 500;
          item.appendChild(descInput);
        }
        // Delete handler
        item.querySelector('.btn-img-delete')
            .addEventListener('click', function() {
              if (!confirm(i18n.t('cnt_delete_image'))) return;
              fetch(
                  '/admin/api/content/images/' + folder + '/' +
                      encodeURIComponent(img),
                  {method: 'DELETE'})
                  .then(function(r) {
                    return r.json();
                  })
                  .then(function(data) {
                    if (data.success) {
                      item.remove();
                      showMsg(options.msgId, i18n.t('cnt_deleted'), false);
                    }
                  });
            });
        grid.appendChild(item);
      });

      // Gallery: add save descriptions button
      if (options && options.descriptions && images.length > 0) {
        var existing =
            grid.parentElement.querySelector('.gallery-desc-actions');
        if (!existing) {
          var actionsDiv = document.createElement('div');
          actionsDiv.className = 'gallery-desc-actions';
          var saveDescBtn = document.createElement('button');
          saveDescBtn.className = 'btn-primary';
          saveDescBtn.textContent = i18n.t('cnt_save_descriptions');
          saveDescBtn.addEventListener('click', function() {
            var descs = {};
            grid.querySelectorAll('.img-desc-input').forEach(function(inp) {
              if (inp.value.trim())
                descs[inp.getAttribute('data-key')] = inp.value.trim();
            });
            fetch('/admin/api/content/gallery-descriptions', {
              method: 'PUT',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({descriptions: descs})
            })
                .then(function(r) {
                  return r.json();
                })
                .then(function(data) {
                  showMsg(
                      options.msgId,
                      data.success ? i18n.t('cnt_saved') :
                                     (data.error || i18n.t('error')),
                      !data.success);
                  if (data.success)
                    contentData.companyGalleryDescriptions = data.descriptions;
                });
          });
          actionsDiv.appendChild(saveDescBtn);
          grid.parentElement.appendChild(actionsDiv);
        }
      }
    }

    function setupUpload(btnId, inputId, folder, gridId, options) {
      var btn = document.getElementById(btnId);
      var input = document.getElementById(inputId);
      if (!btn || !input) return;
      btn.addEventListener('click', function() {
        input.click();
      });
      input.addEventListener('change', function() {
        if (!input.files || input.files.length === 0) return;
        var fd = new FormData();
        for (var i = 0; i < input.files.length; i++) {
          fd.append('images', input.files[i]);
        }
        fetch('/admin/api/content/images/' + folder, {method: 'POST', body: fd})
            .then(function(r) {
              return r.json();
            })
            .then(function(data) {
              if (data.success) {
                loadImageGrid(folder, gridId, options.msgId, options);
                showMsg(options.msgId, i18n.t('cnt_uploaded'), false);
              } else {
                showMsg(options.msgId, data.error || i18n.t('error'), true);
              }
              input.value = '';
            });
      });
    }

    // Set up all image sections
    setupUpload(
        'btnUploadGallery', 'galleryFileInput', 'gallery', 'galleryGrid',
        {msgId: 'galleryMsg', descriptions: true});
    setupUpload(
        'btnUploadCarousel', 'carouselFileInput', 'carousel', 'carouselGrid',
        {msgId: 'carouselMsg'});
    setupUpload(
        'btnUploadAboutImg', 'aboutImgFileInput', 'about', 'aboutImgGrid',
        {msgId: 'aboutImgMsg'});
    setupUpload(
        'btnUploadPartner', 'partnerFileInput', 'partners', 'partnerGrid',
        {msgId: 'partnerMsg'});
    setupUpload(
        'btnUploadLogo', 'logoFileInput', 'logo', 'logoGrid',
        {msgId: 'logoMsg'});

    // Load content when navigating to content page
    document.querySelectorAll('.nav-item').forEach(function(item) {
      item.addEventListener('click', function() {
        if (item.getAttribute('data-page') === 'content') {
          loadContentData();
          loadImageGrid(
              'gallery', 'galleryGrid', 'galleryMsg',
              {msgId: 'galleryMsg', descriptions: true});
          loadImageGrid(
              'carousel', 'carouselGrid', 'carouselMsg',
              {msgId: 'carouselMsg'});
          loadImageGrid(
              'about', 'aboutImgGrid', 'aboutImgMsg', {msgId: 'aboutImgMsg'});
          loadImageGrid(
              'partners', 'partnerGrid', 'partnerMsg', {msgId: 'partnerMsg'});
          loadImageGrid('logo', 'logoGrid', 'logoMsg', {msgId: 'logoMsg'});
        }
      });
    });
  }  // end content management

  if (typeof PAGES !== 'undefined' && PAGES.vacations) {
    /* ============================== */
    /* VACATION MANAGEMENT            */
    /* ============================== */
    var vacationData = null;
    var vacationYear = new Date().getFullYear();
    var vacMonthIndex = new Date().getMonth();
    var pendingAdds = {};     // date -> true
    var pendingRemoves = {};  // date -> true

    function loadVacations() {
      pendingAdds = {};
      pendingRemoves = {};
      fetch('/admin/api/vacations?year=' + vacationYear)
          .then(function(r) {
            return r.json();
          })
          .then(function(data) {
            vacationData = data;
            renderVacationSummary();
            renderVacationCalendar();
            updateVacActions();
          });
    }

    function renderVacationSummary() {
      var wrap = document.getElementById('vacationSummary');
      if (!wrap || !vacationData) return;
      var me = null;
      vacationData.users.forEach(function(u) {
        if (u.id === USER_ID) me = u;
      });
      if (!me) {
        wrap.innerHTML = '';
        return;
      }
      wrap.innerHTML = '<div class="vacation-user-card">' +
          '<div class="vac-username">' + escapeHtml(me.username) + '</div>' +
          '<div class="vac-stats">' +
          '<span class="vac-stat"><span class="vac-dot dot-total"></span> ' +
          i18n.t('vac_total') + ': ' + me.vacationDays + '</span>' +
          '<span class="vac-stat"><span class="vac-dot dot-used"></span> ' +
          i18n.t('vac_used') + ': ' + me.used + '</span>' +
          '<span class="vac-stat"><span class="vac-dot dot-booked"></span> ' +
          i18n.t('vac_booked') + ': ' + me.booked + '</span>' +
          '<span class="vac-stat"><span class="vac-dot dot-remaining"></span> ' +
          i18n.t('vac_remaining') + ': ' + me.remaining + '</span>' +
          '</div></div>';
    }

    function updateVacActions() {
      var addCount = Object.keys(pendingAdds).length;
      var removeCount = Object.keys(pendingRemoves).length;
      var total = addCount + removeCount;
      var actionsEl = document.getElementById('vacationActions');
      var countEl = document.getElementById('vacChangesCount');
      if (actionsEl) actionsEl.style.display = total > 0 ? 'flex' : 'none';
      if (countEl)
        countEl.textContent = total + ' ' +
            (total === 1 ? i18n.t('vac_change') : i18n.t('vac_changes'));
    }

    function renderVacationCalendar() {
      var wrap = document.getElementById('vacationCalendarWrap');
      if (!wrap || !vacationData) return;

      var year = vacationData.year;
      var moYear = vacMonthIndex < 12 ? year : year + 1;
      var moMonth = vacMonthIndex < 12 ? vacMonthIndex : 0;

      var monthNames = i18n.t('months') || [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct',
        'Nov', 'Dec'
      ];
      var label = document.getElementById('vacMonthLabel');
      if (label) label.textContent = monthNames[moMonth];

      var today = new Date();
      var todayStr = today.getFullYear() + '-' + pad(today.getMonth() + 1) +
          '-' + pad(today.getDate());

      var daysInMonth = new Date(moYear, moMonth + 1, 0).getDate();

      var html = '<div class="vacation-month">';
      html +=
          '<div style="overflow-x:auto"><table class="vacation-grid"><thead><tr>';
      html += '<th class="vac-user-header"></th>';
      for (var d = 1; d <= daysInMonth; d++) {
        html += '<th>' + d + '</th>';
      }
      html += '</tr></thead><tbody>';

      vacationData.users.forEach(function(u) {
        var dateLookup = {};
        u.dates.forEach(function(v) {
          dateLookup[v.date] = true;
        });

        html += '<tr>';
        html +=
            '<td class="vac-user-label">' + escapeHtml(u.username) + '</td>';

        for (var d = 1; d <= daysInMonth; d++) {
          var dateStr = moYear + '-' + pad(moMonth + 1) + '-' + pad(d);
          var dow = (new Date(moYear, moMonth, d).getDay() + 6) % 7;
          var isClosed = vacationData.closedDays &&
              vacationData.closedDays.indexOf(dow) !== -1;

          // Compute effective state considering pending changes
          var serverHas = dateLookup[dateStr] || false;
          var effectiveHas = serverHas;
          if (u.id === USER_ID) {
            if (pendingAdds[dateStr]) effectiveHas = true;
            if (pendingRemoves[dateStr]) effectiveHas = false;
          }

          var isPast = dateStr < todayStr;
          var cls = 'vac-cell';

          if (isClosed) {
            cls += ' vac-closed';
          } else if (effectiveHas && isPast) {
            cls += ' vac-used';
          } else if (effectiveHas) {
            cls += ' vac-booked';
          } else {
            cls += ' vac-empty';
          }

          // Show pending visual
          if (u.id === USER_ID && !isClosed) {
            if (pendingAdds[dateStr]) cls += ' vac-pending-add';
            if (pendingRemoves[dateStr]) cls += ' vac-pending-remove';
            cls += ' vac-clickable';
          }

          if (dateStr === todayStr) cls += ' vac-today';

          html += '<td><span class="' + cls + '"' +
              ' data-user="' + u.id + '"' +
              ' data-date="' + dateStr + '"' +
              ' data-server="' + (serverHas ? '1' : '') + '"' +
              ' title="' + escapeHtml(u.username) + ' - ' + dateStr + '"' +
              '></span></td>';
        }
        html += '</tr>';
      });

      html += '</tbody></table></div></div>';
      wrap.innerHTML = html;

      // Click handler — toggle pending state
      wrap.onclick = function(e) {
        var cell = e.target.closest('.vac-clickable');
        if (!cell) return;
        var userId = parseInt(cell.getAttribute('data-user'), 10);
        if (userId !== USER_ID) return;
        var date = cell.getAttribute('data-date');
        var serverHas = cell.getAttribute('data-server') === '1';

        if (serverHas) {
          // Currently on server: toggle pending remove
          if (pendingRemoves[date]) {
            delete pendingRemoves[date];
          } else {
            delete pendingAdds[date];
            pendingRemoves[date] = true;
          }
        } else {
          // Not on server: toggle pending add
          if (pendingAdds[date]) {
            delete pendingAdds[date];
          } else {
            delete pendingRemoves[date];
            pendingAdds[date] = true;
          }
        }
        renderVacationCalendar();
        updateVacActions();
      };
    }

    // Save button — batch submit
    document.getElementById('vacSaveBtn').addEventListener('click', function() {
      var addDates = Object.keys(pendingAdds);
      var removeDates = Object.keys(pendingRemoves);
      var promises = [];

      if (addDates.length > 0) {
        promises.push(fetch('/admin/api/vacations', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({userId: USER_ID, dates: addDates})
        }));
      }
      if (removeDates.length > 0) {
        promises.push(fetch('/admin/api/vacations', {
          method: 'DELETE',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({userId: USER_ID, dates: removeDates})
        }));
      }

      Promise.all(promises).then(function() {
        loadVacations();
      });
    });

    // Month navigation
    document.getElementById('vacMonthPrev')
        .addEventListener('click', function() {
          if (vacMonthIndex > 0) {
            vacMonthIndex--;
            renderVacationCalendar();
          }
        });
    document.getElementById('vacMonthNext')
        .addEventListener('click', function() {
          if (vacMonthIndex < 12) {
            vacMonthIndex++;
            renderVacationCalendar();
          }
        });

    // Load vacations when navigating to vacations page
    document.querySelectorAll('.nav-item').forEach(function(item) {
      item.addEventListener('click', function() {
        if (item.getAttribute('data-page') === 'vacations') loadVacations();
      });
    });
  }  // end PAGES.vacations

  // Re-render on language change
  document.addEventListener('langchange', function() {
    if (typeof PAGES !== 'undefined' && PAGES.bookings) renderWeek();
    if (typeof PAGES !== 'undefined' && PAGES.vacations && vacationData) {
      renderVacationSummary();
      renderVacationCalendar();
    }
  });
});
