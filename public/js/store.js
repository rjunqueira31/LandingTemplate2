/* ============================== */
/* STORE.JS — Cart, Auth, Checkout */
/* ============================== */

(function() {
  'use strict';

  // ==================== CART ====================
  const CART_KEY = 'storeCart';

  function getCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
    catch (e) { return []; }
  }

  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartBadge();
  }

  function addToCart(productId, optionId, title, optionName, price, quantity, image) {
    const cart = getCart();
    const key = productId + '-' + (optionId || 'none');
    const existing = cart.find(c => c.key === key);
    if (existing) {
      existing.quantity += quantity;
    } else {
      cart.push({key, productId, optionId, title, optionName, price, quantity, image});
    }
    saveCart(cart);
  }

  function updateCartBadge() {
    const badge = document.getElementById('cartBadge');
    const badgeMobile = document.getElementById('cartBadgeMobile');
    const cart = getCart();
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    [badge, badgeMobile].forEach(b => {
      if (!b) return;
      if (count > 0) {
        b.textContent = count;
        b.style.display = '';
      } else {
        b.style.display = 'none';
      }
    });
  }

  // ==================== AUTH ====================
  let currentCustomer = null;

  async function checkAuth() {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      currentCustomer = data.customer;
      updateAuthUI();
    } catch (e) { /* ignore */ }
  }

  function updateAuthUI() {
    const loggedOut = document.getElementById('userLoggedOut');
    const loggedIn = document.getElementById('userLoggedIn');
    const nameEl = document.getElementById('dropdownUserName');
    const userBtn = document.getElementById('userMenuBtn');
    const mobileUserBtn = document.getElementById('userMenuBtnMobile');

    if (!loggedOut || !loggedIn) return;

    if (currentCustomer) {
      loggedOut.style.display = 'none';
      loggedIn.style.display = '';
      if (nameEl) nameEl.textContent = currentCustomer.name;
      if (userBtn) userBtn.classList.add('logged-in');
      if (mobileUserBtn) mobileUserBtn.classList.add('logged-in');
    } else {
      loggedOut.style.display = '';
      loggedIn.style.display = 'none';
      if (userBtn) userBtn.classList.remove('logged-in');
      if (mobileUserBtn) mobileUserBtn.classList.remove('logged-in');
    }
  }

  // ==================== USER DROPDOWN ====================
  function initUserDropdown() {
    const btn = document.getElementById('userMenuBtn');
    const btnMobile = document.getElementById('userMenuBtnMobile');
    const dropdown = document.getElementById('userDropdown');
    if (!btn || !dropdown) return;

    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      dropdown.style.display = dropdown.style.display === 'none' ? '' : 'none';
    });

    // Mobile button opens the auth modal directly (or shows profile if logged in)
    if (btnMobile) {
      btnMobile.addEventListener('click', function(e) {
        e.stopPropagation();
        // Close mobile menu
        document.querySelector('.mobile-menu')?.classList.remove('active');
        document.querySelector('.mobile-menu-overlay')?.classList.remove('active');
        document.body.classList.remove('mobile-menu-open');

        if (currentCustomer) {
          // Show profile form
          const profileForm = document.getElementById('profileForm');
          const loginForm = document.getElementById('loginForm');
          const registerForm = document.getElementById('registerForm');
          const modal = document.getElementById('authModal');
          [loginForm, registerForm, profileForm].forEach(f => { if (f) f.style.display = 'none'; });
          if (profileForm) profileForm.style.display = '';
          if (modal) modal.style.display = '';
        } else {
          // Show login form
          const loginForm = document.getElementById('loginForm');
          const registerForm = document.getElementById('registerForm');
          const profileForm = document.getElementById('profileForm');
          const modal = document.getElementById('authModal');
          [loginForm, registerForm, profileForm].forEach(f => { if (f) f.style.display = 'none'; });
          if (loginForm) loginForm.style.display = '';
          if (modal) modal.style.display = '';
        }
      });
    }

    document.addEventListener('click', function(e) {
      if (!dropdown.contains(e.target) && e.target !== btn) {
        dropdown.style.display = 'none';
      }
    });
  }

  // ==================== AUTH MODAL ====================
  function initAuthModal() {
    const modal = document.getElementById('authModal');
    if (!modal) return;

    const close = document.getElementById('authModalClose');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const profileForm = document.getElementById('profileForm');

    function showForm(form) {
      [loginForm, registerForm, profileForm].forEach(f => { if (f) f.style.display = 'none'; });
      if (form) form.style.display = '';
      modal.style.display = '';
      document.getElementById('userDropdown').style.display = 'none';
    }

    function hideModal() { modal.style.display = 'none'; }

    if (close) close.addEventListener('click', hideModal);
    modal.addEventListener('click', function(e) { if (e.target === modal) hideModal(); });

    const btnShowLogin = document.getElementById('btnShowLogin');
    const btnShowRegister = document.getElementById('btnShowRegister');
    const btnShowProfile = document.getElementById('btnShowProfile');
    const switchToRegister = document.getElementById('switchToRegister');
    const switchToLogin = document.getElementById('switchToLogin');

    if (btnShowLogin) btnShowLogin.addEventListener('click', () => showForm(loginForm));
    if (btnShowRegister) btnShowRegister.addEventListener('click', () => showForm(registerForm));
    if (btnShowProfile) {
      btnShowProfile.addEventListener('click', function() {
        if (currentCustomer) {
          document.getElementById('profileName').value = currentCustomer.name;
          document.getElementById('profileEmail').value = currentCustomer.email;
          document.getElementById('profileCurrentPassword').value = '';
          document.getElementById('profileNewPassword').value = '';
        }
        showForm(profileForm);
      });
    }
    if (switchToRegister) switchToRegister.addEventListener('click', function(e) { e.preventDefault(); showForm(registerForm); });
    if (switchToLogin) switchToLogin.addEventListener('click', function(e) { e.preventDefault(); showForm(loginForm); });

    // Login
    const btnLogin = document.getElementById('btnLogin');
    if (btnLogin) btnLogin.addEventListener('click', async function() {
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;
      const err = document.getElementById('loginError');
      err.style.display = 'none';

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST', headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({email, password})
        });
        const data = await res.json();
        if (data.success) {
          currentCustomer = data.customer;
          updateAuthUI();
          hideModal();
        } else {
          err.textContent = data.error;
          err.style.display = '';
        }
      } catch (e) {
        err.textContent = 'Connection error';
        err.style.display = '';
      }
    });

    // Register
    const btnRegister = document.getElementById('btnRegister');
    if (btnRegister) btnRegister.addEventListener('click', async function() {
      const name = document.getElementById('registerName').value.trim();
      const email = document.getElementById('registerEmail').value.trim();
      const password = document.getElementById('registerPassword').value;
      const err = document.getElementById('registerError');
      err.style.display = 'none';

      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST', headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({name, email, password})
        });
        const data = await res.json();
        if (data.success) {
          currentCustomer = data.customer;
          updateAuthUI();
          hideModal();
        } else {
          err.textContent = data.error;
          err.style.display = '';
        }
      } catch (e) {
        err.textContent = 'Connection error';
        err.style.display = '';
      }
    });

    // Save Profile
    const btnSaveProfile = document.getElementById('btnSaveProfile');
    if (btnSaveProfile) btnSaveProfile.addEventListener('click', async function() {
      const name = document.getElementById('profileName').value.trim();
      const email = document.getElementById('profileEmail').value.trim();
      const currentPassword = document.getElementById('profileCurrentPassword').value;
      const newPassword = document.getElementById('profileNewPassword').value;
      const err = document.getElementById('profileError');
      err.style.display = 'none';

      const body = {name, email};
      if (newPassword) { body.currentPassword = currentPassword; body.newPassword = newPassword; }

      try {
        const res = await fetch('/api/auth/profile', {
          method: 'PUT', headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.success) {
          currentCustomer = data.customer;
          updateAuthUI();
          hideModal();
        } else {
          err.textContent = data.error;
          err.style.display = '';
        }
      } catch (e) {
        err.textContent = 'Connection error';
        err.style.display = '';
      }
    });

    // Logout
    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) btnLogout.addEventListener('click', async function() {
      await fetch('/api/auth/logout', {method: 'POST'});
      currentCustomer = null;
      updateAuthUI();
      document.getElementById('userDropdown').style.display = 'none';
    });
  }

  // ==================== STORE PAGE ====================
  async function initStorePage() {
    const grid = document.getElementById('storeGrid');
    if (!grid) return;

    try {
      const res = await fetch('/api/store/products');
      const data = await res.json();
      const products = data.products.filter(p => p.available);

      if (products.length === 0) {
        grid.style.display = 'none';
        document.getElementById('storeEmpty').style.display = '';
        return;
      }

      grid.innerHTML = products.map(function(p) {
        const images = JSON.parse(p.images || '[]');
        const img = images.length > 0
          ? '<img src="/images/products/' + encodeURI(images[0]) + '" alt="' + escapeHtml(p.title) + '" loading="lazy">'
          : '<div class="product-no-image"><i class="fas fa-image"></i></div>';

        return '<div class="store-item">' +
          '<a href="/store/product/' + p.id + '" class="store-item-link">' +
          '<div class="store-item-image">' + img + '</div>' +
          '<h3 class="store-item-title">' + escapeHtml(p.title) + '</h3>' +
          '<p class="store-item-price">€' + p.price.toFixed(2) + '</p>' +
          '</a>' +
          '<div class="store-item-actions">' +
          '<button class="btn-buy-now-sm" data-product-id="' + p.id + '" data-i18n="store_buy_now">Buy Now</button>' +
          '<button class="btn-add-cart-sm" data-product-id="' + p.id + '" data-i18n="store_add_to_cart">Add to Cart</button>' +
          '</div>' +
          '</div>';
      }).join('');

      // Quick add to cart from store grid (uses first available option or no option)
      grid.addEventListener('click', async function(e) {
        const addBtn = e.target.closest('.btn-add-cart-sm');
        const buyBtn = e.target.closest('.btn-buy-now-sm');
        if (!addBtn && !buyBtn) return;

        const pid = parseInt((addBtn || buyBtn).dataset.productId, 10);
        const product = products.find(p => p.id === pid);
        if (!product) return;

        const images = JSON.parse(product.images || '[]');
        const firstImage = images[0] || '';
        let optionId = null, optionName = '', price = product.price;

        // If product has options, use first available one
        if (product.options && product.options.length > 0) {
          const avail = product.options.find(o => o.available !== false);
          if (avail) {
            optionId = avail.id;
            optionName = avail.name;
            price = avail.price !== null ? avail.price : product.price;
          }
        }

        addToCart(product.id, optionId, product.title, optionName, price, 1, firstImage);

        if (buyBtn) {
          window.location.href = '/store/checkout';
        } else {
          addBtn.textContent = '✓';
          setTimeout(() => { if (typeof i18n !== 'undefined') i18n.init(); else addBtn.textContent = 'Add to Cart'; }, 1000);
        }
      });

    } catch (e) {
      console.error('Failed to load products:', e);
    }
  }

  // ==================== PRODUCT DETAIL ====================
  function initProductDetail() {
    const detail = document.getElementById('productDetail');
    if (!detail || !window.__product) return;

    const product = window.__product;
    let selectedOption = null;
    let currentPrice = product.price;

    // Option selection
    const optionBtns = document.querySelectorAll('.option-btn');
    optionBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        optionBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedOption = {
          id: parseInt(btn.dataset.optionId, 10),
          name: btn.textContent.trim(),
          available: btn.dataset.available === 'true'
        };
        currentPrice = parseFloat(btn.dataset.price);
        document.getElementById('productPrice').textContent = '€' + currentPrice.toFixed(2);

        // Enable/disable buttons based on option availability
        const addBtn = document.getElementById('btnAddCart');
        const buyBtn = document.getElementById('btnBuyNow');
        if (selectedOption.available) {
          addBtn.disabled = false;
          buyBtn.disabled = false;
        } else {
          addBtn.disabled = true;
          buyBtn.disabled = true;
        }
      });
    });

    // Quantity control
    window.changeQty = function(delta) {
      const input = document.getElementById('productQty');
      let val = parseInt(input.value, 10) + delta;
      if (val < 1) val = 1;
      if (val > 99) val = 99;
      input.value = val;
    };

    // Add to cart
    const addBtn = document.getElementById('btnAddCart');
    if (addBtn) addBtn.addEventListener('click', function() {
      const qty = parseInt(document.getElementById('productQty').value, 10) || 1;
      const images = product.images || [];
      addToCart(
        product.id,
        selectedOption ? selectedOption.id : null,
        product.title,
        selectedOption ? selectedOption.name : '',
        currentPrice,
        qty,
        images[0] || ''
      );
      addBtn.textContent = '✓';
      setTimeout(() => { if (typeof i18n !== 'undefined') i18n.init(); else addBtn.textContent = 'Add to Cart'; }, 1000);
    });

    // Buy now
    const buyBtn = document.getElementById('btnBuyNow');
    if (buyBtn) buyBtn.addEventListener('click', function() {
      const qty = parseInt(document.getElementById('productQty').value, 10) || 1;
      const images = product.images || [];
      addToCart(
        product.id,
        selectedOption ? selectedOption.id : null,
        product.title,
        selectedOption ? selectedOption.name : '',
        currentPrice,
        qty,
        images[0] || ''
      );
      window.location.href = '/store/checkout';
    });
  }

  // ==================== CART PAGE ====================
  function initCartPage() {
    const cartItems = document.getElementById('cartItems');
    if (!cartItems) return;

    function renderCart() {
      const cart = getCart();
      const empty = document.getElementById('cartEmpty');
      const summary = document.getElementById('cartSummary');

      if (cart.length === 0) {
        cartItems.innerHTML = '';
        empty.style.display = '';
        summary.style.display = 'none';
        return;
      }

      empty.style.display = 'none';
      summary.style.display = '';

      let total = 0;
      cartItems.innerHTML = cart.map(function(item, idx) {
        const subtotal = item.price * item.quantity;
        total += subtotal;
        const img = item.image
          ? '<img src="/images/products/' + encodeURI(item.image) + '" alt="' + escapeHtml(item.title) + '">'
          : '<div class="cart-item-no-image"><i class="fas fa-image"></i></div>';

        return '<div class="cart-item" data-idx="' + idx + '">' +
          '<div class="cart-item-image">' + img + '</div>' +
          '<div class="cart-item-info">' +
          '<h4>' + escapeHtml(item.title) + (item.optionName ? ' <span class="cart-option">(' + escapeHtml(item.optionName) + ')</span>' : '') + '</h4>' +
          '<p class="cart-item-price">€' + item.price.toFixed(2) + '</p>' +
          '</div>' +
          '<div class="cart-item-qty">' +
          '<button class="qty-btn cart-qty-minus">-</button>' +
          '<span>' + item.quantity + '</span>' +
          '<button class="qty-btn cart-qty-plus">+</button>' +
          '</div>' +
          '<p class="cart-item-subtotal">€' + subtotal.toFixed(2) + '</p>' +
          '<button class="cart-item-remove" aria-label="Remove"><i class="fas fa-trash"></i></button>' +
          '</div>';
      }).join('');

      document.getElementById('cartTotal').textContent = '€' + total.toFixed(2);

      // Event delegation for cart actions
      cartItems.querySelectorAll('.cart-qty-minus').forEach(function(btn) {
        btn.addEventListener('click', function() {
          const idx = parseInt(btn.closest('.cart-item').dataset.idx, 10);
          const cart = getCart();
          if (cart[idx].quantity > 1) cart[idx].quantity--;
          else cart.splice(idx, 1);
          saveCart(cart);
          renderCart();
        });
      });
      cartItems.querySelectorAll('.cart-qty-plus').forEach(function(btn) {
        btn.addEventListener('click', function() {
          const idx = parseInt(btn.closest('.cart-item').dataset.idx, 10);
          const cart = getCart();
          cart[idx].quantity++;
          saveCart(cart);
          renderCart();
        });
      });
      cartItems.querySelectorAll('.cart-item-remove').forEach(function(btn) {
        btn.addEventListener('click', function() {
          const idx = parseInt(btn.closest('.cart-item').dataset.idx, 10);
          const cart = getCart();
          cart.splice(idx, 1);
          saveCart(cart);
          renderCart();
        });
      });
    }

    renderCart();
  }

  // ==================== CHECKOUT PAGE ====================
  function initCheckoutPage() {
    const container = document.getElementById('checkoutContainer');
    if (!container) return;

    const cart = getCart();
    if (cart.length === 0) {
      window.location.href = '/store/cart';
      return;
    }

    // Render order summary
    const itemsEl = document.getElementById('checkoutItems');
    let total = 0;
    itemsEl.innerHTML = cart.map(function(item) {
      const subtotal = item.price * item.quantity;
      total += subtotal;
      return '<div class="checkout-item">' +
        '<span>' + escapeHtml(item.title) + (item.optionName ? ' (' + escapeHtml(item.optionName) + ')' : '') + ' × ' + item.quantity + '</span>' +
        '<span>€' + subtotal.toFixed(2) + '</span>' +
        '</div>';
    }).join('');
    document.getElementById('checkoutTotal').textContent = '€' + total.toFixed(2);

    // Pre-fill from customer session
    if (currentCustomer) {
      document.getElementById('shipName').value = currentCustomer.name || '';
      document.getElementById('shipEmail').value = currentCustomer.email || '';
    }

    // Same as shipping toggle
    const sameAs = document.getElementById('sameAsShipping');
    const billingGroup = document.getElementById('billingAddressGroup');
    sameAs.addEventListener('change', function() {
      billingGroup.style.display = sameAs.checked ? 'none' : '';
    });

    // Payment method selection styling
    document.querySelectorAll('.payment-option input').forEach(function(radio) {
      radio.addEventListener('change', function() {
        document.querySelectorAll('.payment-option').forEach(o => o.classList.remove('selected'));
        radio.closest('.payment-option').classList.add('selected');
      });
    });

    // Submit checkout
    const btnPay = document.getElementById('btnPay');
    btnPay.addEventListener('click', async function() {
      const errEl = document.getElementById('checkoutError');
      errEl.style.display = 'none';

      const shipName = document.getElementById('shipName').value.trim();
      const shipEmail = document.getElementById('shipEmail').value.trim();
      const shipPhone = document.getElementById('shipPhone').value.trim();
      const shipAddress = document.getElementById('shipAddress').value.trim();
      const billAddress = sameAs.checked ? shipAddress : document.getElementById('billAddress').value.trim();
      const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;

      if (!shipName || !shipEmail || !shipAddress) {
        errEl.textContent = 'Please fill in all required fields.';
        errEl.style.display = '';
        return;
      }

      btnPay.disabled = true;
      btnPay.textContent = 'Processing...';

      try {
        const res = await fetch('/api/store/checkout', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            items: cart.map(item => ({
              productId: item.productId,
              optionId: item.optionId,
              quantity: item.quantity
            })),
            shipping: {name: shipName, email: shipEmail, phone: shipPhone, address: shipAddress},
            billing: {address: billAddress},
            paymentMethod
          })
        });
        const data = await res.json();

        if (data.url) {
          // Clear cart and redirect to Stripe
          saveCart([]);
          window.location.href = data.url;
        } else {
          errEl.textContent = data.error || 'Payment error. Please try again.';
          errEl.style.display = '';
          btnPay.disabled = false;
          btnPay.textContent = 'Complete Purchase';
          if (typeof i18n !== 'undefined') i18n.init();
        }
      } catch (e) {
        errEl.textContent = 'Connection error. Please try again.';
        errEl.style.display = '';
        btnPay.disabled = false;
        btnPay.textContent = 'Complete Purchase';
        if (typeof i18n !== 'undefined') i18n.init();
      }
    });
  }

  // ==================== ORDER SUCCESS PAGE ====================
  async function initOrderSuccess() {
    const container = document.getElementById('successContainer');
    if (!container) return;

    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    if (!sessionId) return;

    try {
      const res = await fetch('/api/store/order-status?session_id=' + encodeURIComponent(sessionId));
      const data = await res.json();
      if (data.order) {
        const order = data.order;
        const details = document.getElementById('orderDetails');
        details.innerHTML =
          '<p><strong data-i18n="store_order_id">Order ID:</strong> #' + order.id + '</p>' +
          '<p><strong data-i18n="store_total">Total:</strong> €' + order.total.toFixed(2) + '</p>' +
          '<p><strong data-i18n="store_status">Status:</strong> <span class="status-badge status-' + order.status + '">' + order.status + '</span></p>';

        if (order.stripeInvoiceUrl) {
          const btn = document.getElementById('btnInvoice');
          btn.href = order.stripeInvoiceUrl;
          btn.style.display = '';
        }

        if (typeof i18n !== 'undefined') i18n.init();
      }
    } catch (e) {
      console.error('Failed to fetch order status:', e);
    }
  }

  // ==================== MY ORDERS PAGE ====================
  async function initOrdersPage() {
    const list = document.getElementById('ordersList');
    if (!list) return;

    if (!currentCustomer) {
      document.getElementById('ordersLogin').style.display = '';
      return;
    }

    try {
      const res = await fetch('/api/store/orders');
      const data = await res.json();

      if (!data.orders || data.orders.length === 0) {
        document.getElementById('ordersEmpty').style.display = '';
        return;
      }

      list.innerHTML = data.orders.map(function(order) {
        const items = order.items.map(i =>
          '<span>' + escapeHtml(i.productTitle) + (i.optionName ? ' (' + escapeHtml(i.optionName) + ')' : '') + ' × ' + i.quantity + '</span>'
        ).join(', ');

        return '<div class="order-card">' +
          '<div class="order-header">' +
          '<span class="order-id">#' + order.id + '</span>' +
          '<span class="order-date">' + new Date(order.createdAt).toLocaleDateString() + '</span>' +
          '<span class="status-badge status-' + order.status + '">' + order.status + '</span>' +
          '</div>' +
          '<div class="order-body">' +
          '<p class="order-items">' + items + '</p>' +
          '<p class="order-total">€' + order.total.toFixed(2) + '</p>' +
          '</div>' +
          (order.stripeInvoiceUrl ? '<a href="' + order.stripeInvoiceUrl + '" target="_blank" class="btn-invoice-sm" data-i18n="store_view_invoice">View Invoice</a>' : '') +
          '</div>';
      }).join('');

    } catch (e) {
      console.error('Failed to load orders:', e);
    }
  }

  // ==================== HELPERS ====================
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ==================== INIT ====================
  document.addEventListener('DOMContentLoaded', function() {
    updateCartBadge();
    checkAuth().then(function() {
      initUserDropdown();
      initAuthModal();
      initStorePage();
      initProductDetail();
      initCartPage();
      initCheckoutPage();
      initOrderSuccess();
      initOrdersPage();
    });
  });
})();
