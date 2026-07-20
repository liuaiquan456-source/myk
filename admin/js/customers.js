// ---------- Tabs ----------
document.querySelectorAll('.admin-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.admin-tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.admin-tab-panel').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
  });
});

// ---------- Distributors ----------
const distributorRows = document.getElementById('distributorRows');
const distributorEmpty = document.getElementById('distributorEmpty');
const distributorModal = document.getElementById('distributorModal');
const distributorForm = document.getElementById('distributorForm');

let distributors = [];
let customers = [];

async function loadDistributors() {
  distributors = await api('/api/distributors');
  renderDistributors();
  populateDistributorFilter();
  populateCustomerDistributorSelect();
}

function renderDistributors() {
  distributorRows.innerHTML = '';
  distributorEmpty.style.display = distributors.length ? 'none' : 'block';

  distributors.forEach((d) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(d.name)}</td>
      <td>${escapeHtml(d.wechat || '—')}</td>
      <td>${escapeHtml(d.whatsapp || '—')}</td>
      <td>${escapeHtml(d.country || '—')}</td>
      <td>${escapeHtml(d.address || '—')}</td>
      <td class="row-actions">
        <button class="btn btn-sm btn-outline" data-edit-distributor="${d.id}">编辑</button>
        <button class="btn btn-sm btn-danger" data-delete-distributor="${d.id}">删除</button>
      </td>
    `;
    distributorRows.appendChild(tr);
  });
}

function openDistributorModal(distributor) {
  distributorForm.reset();
  document.getElementById('distributorModalTitle').textContent = distributor ? '编辑分销商' : '添加分销商';
  document.getElementById('distributorId').value = distributor ? distributor.id : '';
  document.getElementById('distributorName').value = distributor ? distributor.name : '';
  document.getElementById('distributorWechat').value = distributor ? distributor.wechat || '' : '';
  document.getElementById('distributorWhatsapp').value = distributor ? distributor.whatsapp || '' : '';
  document.getElementById('distributorCountry').value = distributor ? distributor.country || '' : '';
  document.getElementById('distributorAddress').value = distributor ? distributor.address || '' : '';
  distributorModal.classList.add('open');
}

document.getElementById('addDistributorBtn').addEventListener('click', () => openDistributorModal(null));

document.getElementById('distributorCancelBtn').addEventListener('click', () => {
  distributorModal.classList.remove('open');
});

distributorRows.addEventListener('click', async (e) => {
  const editId = e.target.dataset.editDistributor;
  const deleteId = e.target.dataset.deleteDistributor;

  if (editId) {
    const distributor = distributors.find((d) => d.id === Number(editId));
    if (distributor) openDistributorModal(distributor);
    return;
  }

  if (deleteId) {
    if (!confirm('确定要删除该分销商吗？')) return;
    try {
      await api(`/api/distributors/${deleteId}`, { method: 'DELETE' });
      showToast('分销商已删除');
      await loadDistributors();
      renderCustomers();
    } catch (err) {
      showToast(err.message);
    }
  }
});

distributorForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('distributorId').value;
  const payload = {
    name: document.getElementById('distributorName').value.trim(),
    wechat: document.getElementById('distributorWechat').value.trim(),
    whatsapp: document.getElementById('distributorWhatsapp').value.trim(),
    country: document.getElementById('distributorCountry').value.trim(),
    address: document.getElementById('distributorAddress').value.trim(),
  };

  try {
    if (id) {
      await api(`/api/distributors/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      showToast('分销商信息已更新');
    } else {
      await api('/api/distributors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      showToast('分销商已添加');
    }
    distributorModal.classList.remove('open');
    await loadDistributors();
    await loadCustomers();
  } catch (err) {
    showToast(err.message);
  }
});

// ---------- Buyer accounts ----------
const customerRows = document.getElementById('customerRows');
const customerEmpty = document.getElementById('customerEmpty');
const distributorFilterField = document.getElementById('distributorFilter');
const customerModal = document.getElementById('customerModal');
const customerForm = document.getElementById('customerForm');

async function loadCustomers() {
  customers = await api('/api/customers');
  renderCustomers();
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function populateDistributorFilter() {
  const current = distributorFilterField.value;
  distributorFilterField.innerHTML =
    '<option value="">全部</option>' +
    distributors.map((d) => `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`).join('') +
    '<option value="__none__">无分销商</option>';
  if ([...distributorFilterField.options].some((o) => o.value === current)) distributorFilterField.value = current;
}

function populateCustomerDistributorSelect() {
  const select = document.getElementById('customerBuyerManager');
  select.innerHTML =
    '<option value="">无</option>' +
    distributors.map((d) => `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`).join('');
}

function renderCustomers() {
  const filter = distributorFilterField.value;
  const visible = customers.filter((c) => {
    if (!filter) return true;
    if (filter === '__none__') return !c.buyerManager;
    return c.buyerManager === filter;
  });

  customerRows.innerHTML = '';
  customerEmpty.style.display = visible.length ? 'none' : 'block';

  visible.forEach((c) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(c.name)}</td>
      <td>${escapeHtml(c.email)}</td>
      <td>${escapeHtml(c.country || '—')}</td>
      <td>${c.buyerManager ? `<span class="tag-pill">${escapeHtml(c.buyerManager)}</span>` : '—'}</td>
      <td>${escapeHtml(c.address || '—')}</td>
      <td>${formatDate(c.createdAt)}</td>
      <td class="row-actions">
        <button class="btn btn-sm btn-outline" data-edit="${c.id}">编辑</button>
        <button class="btn btn-sm btn-danger" data-delete="${c.id}">删除</button>
      </td>
    `;
    customerRows.appendChild(tr);
  });
}

distributorFilterField.addEventListener('change', renderCustomers);

function openCustomerModal(customer) {
  customerForm.reset();
  document.getElementById('customerId').value = customer.id;
  document.getElementById('customerName').value = customer.name;
  document.getElementById('customerCountry').value = customer.country || '';
  document.getElementById('customerBuyerManager').value = customer.buyerManager || '';
  document.getElementById('customerAddress').value = customer.address || '';
  customerModal.classList.add('open');
}

document.getElementById('customerCancelBtn').addEventListener('click', () => {
  customerModal.classList.remove('open');
});

customerRows.addEventListener('click', async (e) => {
  const editId = e.target.dataset.edit;
  const deleteId = e.target.dataset.delete;

  if (editId) {
    const customer = customers.find((c) => c.id === Number(editId));
    if (customer) openCustomerModal(customer);
    return;
  }

  if (deleteId) {
    if (!confirm('确定要删除该买家账号吗？')) return;
    try {
      await api(`/api/customers/${deleteId}`, { method: 'DELETE' });
      showToast('账号已删除');
      loadCustomers();
    } catch (err) {
      showToast(err.message);
    }
  }
});

customerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('customerId').value;
  const payload = {
    name: document.getElementById('customerName').value.trim(),
    country: document.getElementById('customerCountry').value.trim(),
    buyerManager: document.getElementById('customerBuyerManager').value.trim(),
    address: document.getElementById('customerAddress').value.trim(),
  };

  try {
    await api(`/api/customers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    showToast('买家信息已更新');
    customerModal.classList.remove('open');
    loadCustomers();
  } catch (err) {
    showToast(err.message);
  }
});

loadDistributors().then(loadCustomers);
