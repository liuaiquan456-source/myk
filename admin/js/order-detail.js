const orderGroups = document.getElementById('orderGroups');
const orderEmpty = document.getElementById('orderEmpty');

const STATUS_OPTIONS = ['pending', 'processing', 'shipped', 'completed', 'cancelled'];
const STATUS_LABELS = {
  pending: '待处理',
  processing: '处理中',
  shipped: '已发货',
  completed: '已完成',
  cancelled: '已取消',
};

const buyerKey = new URLSearchParams(window.location.search).get('buyer');

let orders = [];
let customersById = new Map();
// Item rows confirmed in this session (keyed "orderId:itemIndex") render their
// "确认" button as green/已确认; editing that row's inputs again clears it.
let confirmedRowKeys = new Set();

async function loadOrders() {
  const [orderData, customerData] = await Promise.all([api('/api/orders'), api('/api/customers')]);
  orders = orderData;
  customersById = new Map(customerData.map((c) => [c.id, c]));
  renderDetail();
  markUnviewedOrdersAsViewed();
}

// Opening this buyer's detail page is what clears their "NEW" badge on the buyer list.
async function markUnviewedOrdersAsViewed() {
  const unviewed = orders.filter((o) => buyerKeyForOrder(o) === buyerKey && !o.viewed);
  if (!unviewed.length) return;
  await Promise.all(unviewed.map((o) => {
    o.viewed = true;
    return api(`/api/orders/${o.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ viewed: true }),
    });
  }));
}

// A guest checkout (no account) never has a distributor on file.
function distributorForOrder(order) {
  if (!order.customerId) return null;
  const customer = customersById.get(order.customerId);
  return (customer && customer.buyerManager) || null;
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function buyerKeyForOrder(order) {
  return order.customerId ? `c:${order.customerId}` : `g:${order.customer.email.toLowerCase()}`;
}

const CURRENCY_OPTIONS = ['USD', 'CNY', 'EUR', 'GBP', 'JPY'];

function orderItemRowHtml(order, item, itemIndex, itemCount) {
  const skuId = item.resolvedSkuId || item.skuId || '';
  const rowKey = `${order.id}:${itemIndex}`;
  const isConfirmed = confirmedRowKeys.has(rowKey);
  const currency = order.currency || 'USD';

  // Currency applies to the whole order, not each line, so it rowspans like
  // the order-level cells elsewhere in this table.
  const currencyCell = itemIndex === 0 ? `
    <td rowspan="${itemCount}">
      <select class="status-select" data-order-currency="${order.id}">
        ${CURRENCY_OPTIONS.map((c) => `<option value="${c}" ${c === currency ? 'selected' : ''}>${c}</option>`).join('')}
      </select>
    </td>
  ` : '';

  return `
    <tr data-order-id="${order.id}" data-item-index="${itemIndex}">
      <td>${item.image ? `<img class="thumb" src="${item.image}">` : '<div class="thumb-placeholder"></div>'}</td>
      <td>${escapeHtml(item.name)}${item.color ? ` <span class="order-customer-email">(${escapeHtml(item.color)})</span>` : ''}</td>
      <td>${item.size ? escapeHtml(item.size) : '<span class="order-customer-email">&mdash;</span>'}</td>
      <td><input type="number" min="1" class="status-select" data-field="quantity" value="${item.quantity}" style="width:60px;"></td>
      <td><input type="number" min="0" step="0.01" class="status-select" data-field="price" value="${item.price}" style="width:80px;"></td>
      ${currencyCell}
      <td>${skuId ? `<input type="number" min="0" step="1" class="status-select" data-field="stock" data-sku-id="${skuId}" value="${item.stock ?? ''}" placeholder="—" style="width:70px;">` : '<span class="order-customer-email">&mdash;</span>'}</td>
      <td class="order-line-subtotal">$${(item.price * item.quantity).toFixed(2)}</td>
      <td class="row-actions">
        <button class="btn btn-sm ${isConfirmed ? 'btn-confirmed' : ''}" data-confirm-row="${rowKey}">${isConfirmed ? '已确认 ✓' : '确认'}</button>
      </td>
    </tr>
  `;
}

function renderDetail() {
  const myOrders = orders.filter((o) => buyerKeyForOrder(o) === buyerKey);

  if (!myOrders.length) {
    orderGroups.innerHTML = '';
    orderEmpty.style.display = 'block';
    return;
  }
  orderEmpty.style.display = 'none';

  const name = myOrders[0].customer.name;
  const email = myOrders[0].customer.email;
  const customerId = myOrders[0].customerId;
  const distributor = customerId ? (customersById.get(customerId)?.buyerManager || null) : null;

  // One card per order — the order-level status lives in the card header
  // (next to the order time), and each item row saves independently.
  orderGroups.innerHTML = myOrders.map((order) => `
    <div class="buyer-group">
      <div class="buyer-group-header">
        <div>
          <span class="buyer-group-name">${escapeHtml(name)}</span>
          <span class="buyer-badge ${customerId ? '' : 'guest'}">${customerId ? '注册买家' : '访客'}</span>
          ${distributor ? `<span class="tag-pill">分销商：${escapeHtml(distributor)}</span>` : ''}
          <span class="tag-pill">下单时间：${formatDate(order.createdAt)}</span>
          <select class="status-select" data-order-id="${order.id}">
            ${STATUS_OPTIONS.map((s) => `<option value="${s}" ${s === order.status ? 'selected' : ''}>${STATUS_LABELS[s]}</option>`).join('')}
          </select>
          <span class="order-customer-email">${escapeHtml(email)}</span>
          ${order.note ? `<span class="tag-pill" title="${escapeHtml(order.note)}">备注：${escapeHtml(order.note)}</span>` : ''}
        </div>
        <div class="buyer-group-stats">
          订单 #${order.id} &middot; 总额 $${order.total.toFixed(2)}
          <button class="btn btn-sm btn-danger" data-delete="${order.id}" style="margin-left:0.8rem;">删除订单</button>
        </div>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>图片</th>
            <th>商品</th>
            <th>尺寸</th>
            <th>数量</th>
            <th>单价</th>
            <th>币种</th>
            <th>库存</th>
            <th>小计</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${order.items.map((item, i) => orderItemRowHtml(order, item, i, order.items.length || 1)).join('')}</tbody>
      </table>
    </div>
  `).join('');
}

orderGroups.addEventListener('input', (e) => {
  const field = e.target.dataset.field;
  if (field !== 'quantity' && field !== 'price' && field !== 'stock') return;
  const row = e.target.closest('tr');
  if (!row) return;

  if (field === 'quantity' || field === 'price') {
    const qtyInput = row.querySelector('[data-field="quantity"]');
    const priceInput = row.querySelector('[data-field="price"]');
    const qty = Number(qtyInput.value) || 1;
    const price = Number(priceInput.value) || 0;
    row.querySelector('.order-line-subtotal').textContent = `$${(qty * price).toFixed(2)}`;
  }

  const rowKey = `${row.dataset.orderId}:${row.dataset.itemIndex}`;
  if (confirmedRowKeys.delete(rowKey)) {
    const confirmBtn = row.querySelector('[data-confirm-row]');
    if (confirmBtn) {
      confirmBtn.classList.remove('btn-confirmed');
      confirmBtn.textContent = '确认';
    }
  }
});

orderGroups.addEventListener('change', async (e) => {
  const currencyOrderId = e.target.dataset.orderCurrency;
  if (currencyOrderId) {
    try {
      await api(`/api/orders/${currencyOrderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currency: e.target.value }),
      });
      showToast('币种已更新');
    } catch (err) {
      showToast(err.message);
    }
    return;
  }

  const orderId = e.target.dataset.orderId;
  if (!orderId || !e.target.classList.contains('status-select') || e.target.dataset.field) return;
  try {
    await api(`/api/orders/${orderId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: e.target.value }),
    });
    showToast('订单状态已更新');
  } catch (err) {
    showToast(err.message);
  }
});

orderGroups.addEventListener('click', async (e) => {
  if (e.target.matches('img.thumb')) {
    openImageLightbox(e.target.src);
    return;
  }

  const deleteId = e.target.dataset.delete;
  const confirmOrderId = e.target.dataset.confirmRow;

  if (deleteId) {
    if (!confirm('确定要删除该订单吗？')) return;
    try {
      await api(`/api/orders/${deleteId}`, { method: 'DELETE' });
      showToast('订单已删除');
      loadOrders();
    } catch (err) {
      showToast(err.message);
    }
    return;
  }

  if (confirmOrderId) {
    const [orderIdStr, itemIndexStr] = confirmOrderId.split(':');
    const order = orders.find((o) => o.id === Number(orderIdStr));
    const itemIndex = Number(itemIndexStr);
    if (!order || !order.items[itemIndex]) return;
    const row = orderGroups.querySelector(`tr[data-order-id="${order.id}"][data-item-index="${itemIndex}"]`);

    // Only this row's item is edited — the backend keeps any index that
    // arrives as null untouched, so other rows' unsaved edits aren't clobbered.
    const items = order.items.map((_, i) => (i === itemIndex ? {
      quantity: Number(row.querySelector('[data-field="quantity"]').value) || 1,
      price: Number(row.querySelector('[data-field="price"]').value) || 0,
    } : null));

    try {
      await api(`/api/orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });

      // Stock lives on the product's SKU, not on the order, so it's saved separately.
      const stockInput = row.querySelector('[data-field="stock"]');
      const skuId = stockInput && stockInput.dataset.skuId;
      if (stockInput && skuId) {
        await api(`/api/products/${order.items[itemIndex].productId}/skus/${skuId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stock: Number(stockInput.value) || 0 }),
        });
      }

      confirmedRowKeys.add(confirmOrderId);
      showToast('已确认保存');
      loadOrders();
    } catch (err) {
      showToast(err.message);
    }
  }
});

// ---------- Image lightbox ----------

const imageLightbox = document.getElementById('imageLightbox');
const imageLightboxImg = document.getElementById('imageLightboxImg');

function openImageLightbox(src) {
  imageLightboxImg.src = src;
  imageLightbox.classList.add('open');
}

function closeImageLightbox() {
  imageLightbox.classList.remove('open');
  imageLightboxImg.src = '';
}

document.getElementById('imageLightboxClose').addEventListener('click', closeImageLightbox);
imageLightbox.addEventListener('click', (e) => {
  if (e.target === imageLightbox) closeImageLightbox();
});

if (!buyerKey) {
  orderEmpty.style.display = 'block';
} else {
  loadOrders();
}
