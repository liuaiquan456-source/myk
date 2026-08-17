const currencyRows = document.getElementById('currencyRows');
const currencyModal = document.getElementById('currencyModal');
const currencyForm = document.getElementById('currencyForm');

let currencies = [];

async function loadCurrencies() {
  currencies = await api('/api/currencies');
  renderCurrencyRows();
}

function renderCurrencyRows() {
  currencyRows.innerHTML = currencies.map((c) => {
    const locked = c.code === 'CNY';
    const undeletable = c.code === 'CNY' || c.code === 'USD';
    return `
    <tr>
      <td><code>${c.code}</code></td>
      <td>${escapeHtml(c.name)}</td>
      <td>${escapeHtml(c.symbol)}</td>
      <td>
        <input type="number" step="0.0001" min="0" class="rate-input" data-code="${c.code}"
          value="${c.rate}" ${locked ? 'disabled' : ''} style="width:110px;">
      </td>
      <td class="row-actions">
        ${locked ? '<span style="color:var(--color-text-muted); font-size:0.8rem;">基准货币</span>' : `
          <button class="btn btn-sm" data-save-rate="${c.code}">保存</button>
          ${undeletable ? '' : `<button class="btn btn-sm btn-danger" data-delete-currency="${c.code}">删除</button>`}
        `}
      </td>
    </tr>
  `;
  }).join('');
}

currencyRows.addEventListener('click', async (e) => {
  const saveCode = e.target.dataset.saveRate;
  const deleteCode = e.target.dataset.deleteCurrency;

  if (saveCode) {
    const input = currencyRows.querySelector(`.rate-input[data-code="${saveCode}"]`);
    const rate = Number(input.value);
    if (!rate || rate <= 0) {
      showToast('汇率必须大于 0');
      return;
    }
    try {
      await api(`/api/currencies/${saveCode}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rate }),
      });
      showToast('汇率已更新');
      loadCurrencies();
    } catch (err) {
      showToast(err.message);
    }
    return;
  }

  if (deleteCode) {
    if (!confirm(`确定要删除 ${deleteCode} 货币吗？`)) return;
    try {
      await api(`/api/currencies/${deleteCode}`, { method: 'DELETE' });
      showToast('货币已删除');
      loadCurrencies();
    } catch (err) {
      showToast(err.message);
    }
  }
});

document.getElementById('addCurrencyBtn').addEventListener('click', () => {
  currencyForm.reset();
  currencyModal.classList.add('open');
});
document.getElementById('currencyCancelBtn').addEventListener('click', () => {
  currencyModal.classList.remove('open');
});

currencyForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    code: document.getElementById('currencyCode').value.trim().toUpperCase(),
    name: document.getElementById('currencyName').value.trim(),
    symbol: document.getElementById('currencySymbol').value.trim(),
    rate: Number(document.getElementById('currencyRate').value),
  };
  try {
    await api('/api/currencies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    showToast('货币已添加');
    currencyModal.classList.remove('open');
    loadCurrencies();
  } catch (err) {
    showToast(err.message);
  }
});

loadCurrencies();
