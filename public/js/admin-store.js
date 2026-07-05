/* ============================== */
/* ADMIN STORE JS                 */
/* ============================== */

(function() {
  'use strict';

  if (!window.PAGES || !window.PAGES.store) return;

  // ==================== PRODUCTS ====================
  let allProducts = [];

  async function loadProducts() {
    try {
      const res = await fetch('/admin/api/store/products');
      const data = await res.json();
      allProducts = data.products || [];
      renderProducts();
    } catch (e) {
      console.error('Failed to load products:', e);
    }
  }

  function renderProducts() {
    const tbody = document.getElementById('productsTableBody');
    if (!tbody) return;

    tbody.innerHTML = allProducts.map(function(p) {
      const images = JSON.parse(p.images || '[]');
      const img = images.length > 0
        ? '<img src="/images/products/' + images[0] + '" class="product-thumb-admin">'
        : '<span class="no-img">—</span>';
      return '<tr>' +
        '<td>' + p.id + '</td>' +
        '<td>' + img + '</td>' +
        '<td>' + escapeHtml(p.title) + '</td>' +
        '<td>€' + p.price.toFixed(2) + '</td>' +
        '<td>' + (p.available ? '✓' : '✗') + '</td>' +
        '<td>' + (p.options ? p.options.length : 0) + '</td>' +
        '<td><button class="btn-icon btn-edit-product" data-id="' + p.id + '"><i class="fas fa-pen"></i></button> ' +
        '<button class="btn-icon btn-delete-product" data-id="' + p.id + '"><i class="fas fa-trash"></i></button></td>' +
        '</tr>';
    }).join('');
  }

  // Product Modal
  function openProductModal(product) {
    const modal = document.getElementById('productModal');
    const title = document.getElementById('productModalTitle');
    const id = document.getElementById('productModalId');
    const titleInput = document.getElementById('productModalTitle2');
    const descInput = document.getElementById('productModalDesc');
    const priceInput = document.getElementById('productModalPrice');
    const availInput = document.getElementById('productModalAvailable');
    const imagesInput = document.getElementById('productModalImages');
    const existingImgs = document.getElementById('productModalExistingImages');
    const optionsContainer = document.getElementById('productModalOptions');

    if (product) {
      title.textContent = 'Edit Product';
      id.value = product.id;
      titleInput.value = product.title;
      descInput.value = product.description;
      priceInput.value = product.price;
      availInput.value = product.available ? 'true' : 'false';

      const images = JSON.parse(product.images || '[]');
      existingImgs.innerHTML = images.map(function(img) {
        return '<div class="existing-img-item">' +
          '<img src="/images/products/' + img + '">' +
          '<button type="button" class="btn-remove-img" data-img="' + escapeHtml(img) + '">&times;</button>' +
          '</div>';
      }).join('');
      existingImgs.dataset.images = JSON.stringify(images);

      optionsContainer.innerHTML = '';
      if (product.options) {
        product.options.forEach(function(opt) {
          addOptionRow(opt.name, opt.price, opt.available);
        });
      }
    } else {
      title.textContent = 'Add Product';
      id.value = '';
      titleInput.value = '';
      descInput.value = '';
      priceInput.value = '';
      availInput.value = 'true';
      existingImgs.innerHTML = '';
      existingImgs.dataset.images = '[]';
      optionsContainer.innerHTML = '';
    }

    imagesInput.value = '';
    modal.classList.add('active');
  }

  function addOptionRow(name, price, available) {
    const container = document.getElementById('productModalOptions');
    const row = document.createElement('div');
    row.className = 'option-row';
    row.innerHTML =
      '<input type="text" class="opt-name" placeholder="Name (e.g. S, M, L)" value="' + escapeHtml(name || '') + '">' +
      '<input type="number" class="opt-price" placeholder="Price (optional)" step="0.01" value="' + (price !== null && price !== undefined ? price : '') + '">' +
      '<select class="opt-available">' +
      '<option value="" ' + (available === null || available === undefined ? 'selected' : '') + '>Default</option>' +
      '<option value="true" ' + (available === true ? 'selected' : '') + '>Yes</option>' +
      '<option value="false" ' + (available === false ? 'selected' : '') + '>No</option>' +
      '</select>' +
      '<button type="button" class="btn-remove-opt">&times;</button>';
    container.appendChild(row);
  }

  async function saveProduct() {
    const id = document.getElementById('productModalId').value;
    const title = document.getElementById('productModalTitle2').value.trim();
    const description = document.getElementById('productModalDesc').value.trim();
    const price = document.getElementById('productModalPrice').value;
    const available = document.getElementById('productModalAvailable').value;
    const existingImgs = document.getElementById('productModalExistingImages');
    const imageFiles = document.getElementById('productModalImages').files;

    if (!title || !price) return alert('Title and price are required');

    // Collect options
    const optionRows = document.querySelectorAll('#productModalOptions .option-row');
    const options = [];
    optionRows.forEach(function(row) {
      const name = row.querySelector('.opt-name').value.trim();
      if (!name) return;
      const p = row.querySelector('.opt-price').value;
      const a = row.querySelector('.opt-available').value;
      options.push({
        name,
        price: p !== '' ? parseFloat(p) : null,
        available: a === '' ? null : a === 'true'
      });
    });

    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description);
    formData.append('price', price);
    formData.append('available', available);
    formData.append('options', JSON.stringify(options));
    formData.append('existingImages', existingImgs.dataset.images || '[]');

    for (let i = 0; i < imageFiles.length; i++) {
      formData.append('images', imageFiles[i]);
    }

    const url = id ? '/admin/api/store/products/' + id : '/admin/api/store/products';
    const method = id ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {method, body: formData});
      const data = await res.json();
      if (data.success || data.product) {
        document.getElementById('productModal').classList.remove('active');
        loadProducts();
      } else {
        alert(data.error || 'Error saving product');
      }
    } catch (e) {
      alert('Connection error');
    }
  }

  async function deleteProduct(id) {
    if (!confirm('Delete this product? This cannot be undone.')) return;
    try {
      await fetch('/admin/api/store/products/' + id, {method: 'DELETE'});
      loadProducts();
    } catch (e) {
      alert('Error deleting product');
    }
  }

  // ==================== ORDERS ====================
  let allOrders = [];

  async function loadOrders() {
    const status = document.getElementById('orderStatusFilter').value;
    const search = document.getElementById('orderSearchInput').value.trim();
    const params = new URLSearchParams();
    if (status !== 'all') params.set('status', status);
    if (search) params.set('search', search);

    try {
      const res = await fetch('/admin/api/store/orders?' + params.toString());
      const data = await res.json();
      allOrders = data.orders || [];
      renderOrders();
    } catch (e) {
      console.error('Failed to load orders:', e);
    }
  }

  function renderOrders() {
    const tbody = document.getElementById('ordersTableBody');
    if (!tbody) return;

    tbody.innerHTML = allOrders.map(function(o) {
      return '<tr class="order-row" data-id="' + o.id + '">' +
        '<td>#' + o.id + '</td>' +
        '<td>' + escapeHtml(o.customerName) + '</td>' +
        '<td>' + escapeHtml(o.customerEmail) + '</td>' +
        '<td>€' + o.total.toFixed(2) + '</td>' +
        '<td><span class="status-badge status-' + o.status + '">' + o.status + '</span></td>' +
        '<td>' + new Date(o.createdAt).toLocaleDateString() + '</td>' +
        '<td><button class="btn-icon btn-edit-order" data-id="' + o.id + '"><i class="fas fa-pen"></i></button></td>' +
        '</tr>';
    }).join('');
  }

  function openOrderModal(order) {
    const modal = document.getElementById('orderModal');
    const title = document.getElementById('orderModalTitle');

    if (order) {
      title.textContent = 'Order #' + order.id;
      document.getElementById('orderModalId').value = order.id;
      document.getElementById('orderModalName').value = order.customerName;
      document.getElementById('orderModalEmail').value = order.customerEmail;
      document.getElementById('orderModalPhone').value = order.customerPhone;
      document.getElementById('orderModalStatus').value = order.status;
      document.getElementById('orderModalShipAddress').value = order.shippingAddress;
      document.getElementById('orderModalBillAddress').value = order.billingAddress;
      document.getElementById('orderModalShipmentId').value = order.shipmentId;
      document.getElementById('orderModalTotal').value = '€' + order.total.toFixed(2);
      document.getElementById('orderModalNotes').value = order.notes;

      const itemsEl = document.getElementById('orderModalItems');
      if (order.items && order.items.length > 0) {
        itemsEl.innerHTML = order.items.map(function(i) {
          return '<div class="order-item-row">' +
            '<span>' + escapeHtml(i.productTitle) + (i.optionName ? ' (' + escapeHtml(i.optionName) + ')' : '') + '</span>' +
            '<span>× ' + i.quantity + '</span>' +
            '<span>€' + (i.unitPrice * i.quantity).toFixed(2) + '</span>' +
            '</div>';
        }).join('');
      } else {
        itemsEl.innerHTML = '<p style="color:#888;">No items</p>';
      }

      const invoiceEl = document.getElementById('orderModalInvoice');
      if (order.stripeInvoiceUrl) {
        document.getElementById('orderModalInvoiceLink').href = order.stripeInvoiceUrl;
        invoiceEl.style.display = '';
      } else {
        invoiceEl.style.display = 'none';
      }

      document.getElementById('btnDeleteOrder').style.display = '';
    } else {
      title.textContent = 'Add Order';
      document.getElementById('orderModalId').value = '';
      document.getElementById('orderModalName').value = '';
      document.getElementById('orderModalEmail').value = '';
      document.getElementById('orderModalPhone').value = '';
      document.getElementById('orderModalStatus').value = 'received';
      document.getElementById('orderModalShipAddress').value = '';
      document.getElementById('orderModalBillAddress').value = '';
      document.getElementById('orderModalShipmentId').value = '';
      document.getElementById('orderModalTotal').value = '';
      document.getElementById('orderModalNotes').value = '';
      document.getElementById('orderModalItems').innerHTML = '<p style="color:#888;">Items will be added after creation</p>';
      document.getElementById('orderModalInvoice').style.display = 'none';
      document.getElementById('btnDeleteOrder').style.display = 'none';
    }

    modal.classList.add('active');
  }

  async function saveOrder() {
    const id = document.getElementById('orderModalId').value;
    const body = {
      customerName: document.getElementById('orderModalName').value.trim(),
      customerEmail: document.getElementById('orderModalEmail').value.trim(),
      customerPhone: document.getElementById('orderModalPhone').value.trim(),
      status: document.getElementById('orderModalStatus').value,
      shippingAddress: document.getElementById('orderModalShipAddress').value.trim(),
      billingAddress: document.getElementById('orderModalBillAddress').value.trim(),
      shipmentId: document.getElementById('orderModalShipmentId').value.trim(),
      notes: document.getElementById('orderModalNotes').value.trim()
    };

    if (!body.customerName || !body.customerEmail) return alert('Name and email are required');

    const url = id ? '/admin/api/store/orders/' + id : '/admin/api/store/orders';
    const method = id ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success || data.order) {
        document.getElementById('orderModal').classList.remove('active');
        loadOrders();
      } else {
        alert(data.error || 'Error saving order');
      }
    } catch (e) {
      alert('Connection error');
    }
  }

  async function deleteOrder(id) {
    if (!confirm('Delete this order? This cannot be undone.')) return;
    try {
      await fetch('/admin/api/store/orders/' + id, {method: 'DELETE'});
      document.getElementById('orderModal').classList.remove('active');
      loadOrders();
    } catch (e) {
      alert('Error deleting order');
    }
  }

  // ==================== HELPERS ====================
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // ==================== EVENT LISTENERS ====================
  document.addEventListener('DOMContentLoaded', function() {
    // Products
    const btnAddProduct = document.getElementById('btnAddProduct');
    if (btnAddProduct) btnAddProduct.addEventListener('click', () => openProductModal(null));

    const productModal = document.getElementById('productModal');
    if (productModal) {
      document.getElementById('productModalClose').addEventListener('click', () => productModal.classList.remove('active'));
      productModal.addEventListener('click', (e) => { if (e.target === productModal) productModal.classList.remove('active'); });
    }

    const btnSaveProduct = document.getElementById('btnSaveProduct');
    if (btnSaveProduct) btnSaveProduct.addEventListener('click', saveProduct);

    const btnAddOption = document.getElementById('btnAddOption');
    if (btnAddOption) btnAddOption.addEventListener('click', () => addOptionRow());

    // Option remove buttons (delegation)
    const optionsEditor = document.getElementById('productModalOptions');
    if (optionsEditor) {
      optionsEditor.addEventListener('click', function(e) {
        if (e.target.classList.contains('btn-remove-opt')) {
          e.target.closest('.option-row').remove();
        }
      });
    }

    // Existing image remove (delegation)
    const existingImgs = document.getElementById('productModalExistingImages');
    if (existingImgs) {
      existingImgs.addEventListener('click', function(e) {
        if (e.target.classList.contains('btn-remove-img')) {
          const img = e.target.dataset.img;
          let images = JSON.parse(existingImgs.dataset.images || '[]');
          images = images.filter(i => i !== img);
          existingImgs.dataset.images = JSON.stringify(images);
          e.target.closest('.existing-img-item').remove();
        }
      });
    }

    // Products table delegation
    const productsBody = document.getElementById('productsTableBody');
    if (productsBody) {
      productsBody.addEventListener('click', function(e) {
        const editBtn = e.target.closest('.btn-edit-product');
        const delBtn = e.target.closest('.btn-delete-product');
        if (editBtn) {
          const p = allProducts.find(p => p.id === parseInt(editBtn.dataset.id, 10));
          if (p) openProductModal(p);
        }
        if (delBtn) deleteProduct(parseInt(delBtn.dataset.id, 10));
      });
    }

    // Orders
    const btnAddOrder = document.getElementById('btnAddOrder');
    if (btnAddOrder) btnAddOrder.addEventListener('click', () => openOrderModal(null));

    const orderModal = document.getElementById('orderModal');
    if (orderModal) {
      document.getElementById('orderModalClose').addEventListener('click', () => orderModal.classList.remove('active'));
      orderModal.addEventListener('click', (e) => { if (e.target === orderModal) orderModal.classList.remove('active'); });
    }

    const btnSaveOrder = document.getElementById('btnSaveOrder');
    if (btnSaveOrder) btnSaveOrder.addEventListener('click', saveOrder);

    const btnDeleteOrder = document.getElementById('btnDeleteOrder');
    if (btnDeleteOrder) btnDeleteOrder.addEventListener('click', function() {
      const id = document.getElementById('orderModalId').value;
      if (id) deleteOrder(parseInt(id, 10));
    });

    // Orders table delegation
    const ordersBody = document.getElementById('ordersTableBody');
    if (ordersBody) {
      ordersBody.addEventListener('click', async function(e) {
        const editBtn = e.target.closest('.btn-edit-order');
        if (editBtn) {
          const id = parseInt(editBtn.dataset.id, 10);
          try {
            const res = await fetch('/admin/api/store/orders/' + id);
            const data = await res.json();
            if (data.order) openOrderModal(data.order);
          } catch (e) { alert('Error loading order'); }
        }
      });
    }

    // Filters
    const statusFilter = document.getElementById('orderStatusFilter');
    if (statusFilter) statusFilter.addEventListener('change', loadOrders);

    const searchInput = document.getElementById('orderSearchInput');
    if (searchInput) {
      let searchTimeout;
      searchInput.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(loadOrders, 300);
      });
    }

    // Load data when pages become visible
    const observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(m) {
        if (m.target.classList.contains('active')) {
          if (m.target.id === 'page-store-products') loadProducts();
          if (m.target.id === 'page-store-orders') loadOrders();
        }
      });
    });

    const productsPage = document.getElementById('page-store-products');
    const ordersPage = document.getElementById('page-store-orders');
    if (productsPage) observer.observe(productsPage, {attributes: true, attributeFilter: ['class']});
    if (ordersPage) observer.observe(ordersPage, {attributes: true, attributeFilter: ['class']});
  });
})();
