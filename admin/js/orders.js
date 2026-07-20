const buyerRows = document.getElementById('buyerRows');
const buyerEmpty = document.getElementById('buyerEmpty');
const distributorFilterField = document.getElementById('distributorFilter');

const STATUS_LABELS = {
  pending: '待处理',
  processing: '处理中',
  shipped: '已发货',
  completed: '已完成',
  cancelled: '已取消',
};

let orders = [];
let customersById = new Map();

async function loadOrders() {
  const [orderData, customerData] = await Promise.all([api('/api/orders'), api('/api/customers')]);
  orders = orderData;
  customersById = new Map(customerData.map((c) => [c.id, c]));
  populateDistributorFilter();
  renderBuyers();
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

// Orders from a registered buyer group by account id; guest checkouts (no
// account) group by the email they typed in, so repeat guests still cluster.
function buyerKeyForOrder(order) {
  return order.customerId ? `c:${order.customerId}` : `g:${order.customer.email.toLowerCase()}`;
}

function groupOrdersByBuyer(list) {
  const groups = new Map();
  list.forEach((order) => {
    const key = buyerKeyForOrder(order);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        name: order.customer.name,
        email: order.customer.email,
        customerId: order.customerId,
        orders: [],
      });
    }
    groups.get(key).orders.push(order);
  });
  return [...groups.values()].sort((a, b) => {
    const aLatest = Math.max(...a.orders.map((o) => new Date(o.createdAt).getTime()));
    const bLatest = Math.max(...b.orders.map((o) => new Date(o.createdAt).getTime()));
    return bLatest - aLatest;
  });
}

function populateDistributorFilter() {
  const distributors = [...new Set(orders.map(distributorForOrder).filter(Boolean))].sort();
  const current = distributorFilterField.value;
  distributorFilterField.innerHTML =
    '<option value="">全部</option>' +
    distributors.map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('') +
    '<option value="__none__">无分销商</option>';
  if ([...distributorFilterField.options].some((o) => o.value === current)) distributorFilterField.value = current;
}

function currentFilteredOrders() {
  const distributor = distributorFilterField.value;
  return orders.filter((o) => {
    if (distributor === '__none__' && distributorForOrder(o)) return false;
    if (distributor && distributor !== '__none__' && distributorForOrder(o) !== distributor) return false;
    return true;
  });
}

function renderBuyers() {
  const groups = groupOrdersByBuyer(currentFilteredOrders());
  buyerEmpty.style.display = groups.length ? 'none' : 'block';

  buyerRows.innerHTML = groups.map((group) => {
    const orderCount = group.orders.length;
    const total = group.orders.reduce((sum, o) => sum + o.total, 0);
    const distributor = group.customerId ? (customersById.get(group.customerId)?.buyerManager || null) : null;
    const hasUnviewed = group.orders.some((o) => !o.viewed);
    return `
      <tr>
        <td class="row-actions"><a class="btn btn-sm btn-outline" href="order-detail.html?buyer=${encodeURIComponent(group.key)}">查看详情</a></td>
        <td>${escapeHtml(group.name)} <span class="buyer-badge ${group.customerId ? '' : 'guest'}">${group.customerId ? '注册买家' : '访客'}</span> ${hasUnviewed ? '<span class="tag-pill tag-pill-new">NEW</span>' : ''}</td>
        <td>${escapeHtml(group.email)}</td>
        <td>${distributor ? `<span class="tag-pill">${escapeHtml(distributor)}</span>` : '&mdash;'}</td>
        <td>${orderCount}</td>
        <td>$${total.toFixed(2)}</td>
        <td>${formatDate(group.orders[0].createdAt)}</td>
      </tr>
    `;
  }).join('');
}

distributorFilterField.addEventListener('change', renderBuyers);

// ---------- CSV export ----------

function csvEscape(value) {
  const str = String(value ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function exportOrdersToCSV() {
  const header = ['订单号', '日期', '客户姓名', '客户邮箱', '分销商', '商品名称', '颜色', '数量', '单价', '小计', '订单状态'];
  const rows = [header];

  currentFilteredOrders().forEach((order) => {
    order.items.forEach((item) => {
      rows.push([
        order.id,
        formatDate(order.createdAt),
        order.customer.name,
        order.customer.email,
        distributorForOrder(order) || '',
        item.name,
        item.color || '',
        item.quantity,
        item.price.toFixed(2),
        (item.price * item.quantity).toFixed(2),
        STATUS_LABELS[order.status] || order.status,
      ]);
    });
  });

  const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

document.getElementById('exportOrdersBtn').addEventListener('click', () => {
  if (!currentFilteredOrders().length) {
    showToast('暂无订单可导出');
    return;
  }
  exportOrdersToCSV();
});

loadOrders();
