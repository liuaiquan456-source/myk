const inquiryRows = document.getElementById('inquiryRows');
const inquiryEmpty = document.getElementById('inquiryEmpty');

const INQUIRY_STATUS_LABELS = { new: '待处理', contacted: '已联系', closed: '已完成' };

let inquiries = [];

async function loadInquiries() {
  inquiries = await api('/api/inquiries');
  renderInquiries();
}

function renderInquiries() {
  inquiryRows.innerHTML = '';
  inquiryEmpty.style.display = inquiries.length ? 'none' : 'block';

  inquiries.forEach((inquiry) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${inquiry.image ? `<img class="thumb" src="${inquiry.image}">` : `<div class="thumb"></div>`}</td>
      <td>${escapeHtml(inquiry.name)}</td>
      <td>${escapeHtml(inquiry.city)}, ${escapeHtml(inquiry.country)}</td>
      <td>${escapeHtml(inquiry.contact)}</td>
      <td>
        <select data-status-for="${inquiry.id}">
          ${Object.entries(INQUIRY_STATUS_LABELS).map(([value, label]) => `<option value="${value}" ${inquiry.status === value ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
      </td>
      <td>${new Date(inquiry.createdAt).toLocaleString()}</td>
      <td class="row-actions">
        <button class="btn btn-sm btn-danger" data-delete="${inquiry.id}">删除</button>
      </td>
    `;
    inquiryRows.appendChild(tr);
  });
}

inquiryRows.addEventListener('click', async (e) => {
  if (e.target.matches('img.thumb')) {
    openImageLightbox(e.target.src);
    return;
  }

  const deleteId = e.target.dataset.delete;
  if (deleteId) {
    if (!confirm('确定要删除这条询单吗？')) return;
    try {
      await api(`/api/inquiries/${deleteId}`, { method: 'DELETE' });
      showToast('询单已删除');
      loadInquiries();
    } catch (err) {
      showToast(err.message);
    }
  }
});

inquiryRows.addEventListener('change', async (e) => {
  const statusForId = e.target.dataset.statusFor;
  if (!statusForId) return;
  try {
    await api(`/api/inquiries/${statusForId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: e.target.value }),
    });
    showToast('状态已更新');
    const inquiry = inquiries.find((i) => i.id === Number(statusForId));
    if (inquiry) inquiry.status = e.target.value;
  } catch (err) {
    showToast(err.message);
  }
});

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

loadInquiries();
