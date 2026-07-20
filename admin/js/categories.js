const categoryRows = document.getElementById('categoryRows');
const categoryEmpty = document.getElementById('categoryEmpty');
const categoryModal = document.getElementById('categoryModal');
const categoryModalTitle = document.getElementById('categoryModalTitle');
const categoryForm = document.getElementById('categoryForm');
const categoryIdField = document.getElementById('categoryId');
const categoryNameField = document.getElementById('categoryName');
const categoryParentField = document.getElementById('categoryParent');
const categoryImageField = document.getElementById('categoryImage');
const categoryImagePreview = document.getElementById('categoryImagePreview');

let categories = [];

async function loadCategories() {
  categories = await api('/api/categories');
  renderCategories();
}

function parentName(parentId) {
  const parent = categories.find((c) => c.id === parentId);
  return parent ? parent.name : '';
}

// Categories can nest to any depth — walk the tree depth-first so each
// category sorts right under its parent, however many levels deep.
function orderedCategoriesTree() {
  const byParent = new Map();
  categories.forEach((c) => {
    const key = c.parentId || null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(c);
  });

  const ordered = [];
  const visited = new Set();
  function walk(parentId, depth) {
    (byParent.get(parentId) || []).forEach((cat) => {
      if (visited.has(cat.id)) return;
      visited.add(cat.id);
      ordered.push({ cat, depth });
      walk(cat.id, depth + 1);
    });
  }
  walk(null, 0);
  // Any orphaned category (parent deleted/missing) still shows up at the end.
  categories.forEach((c) => {
    if (!visited.has(c.id)) ordered.push({ cat: c, depth: 0 });
  });
  return ordered;
}

// A category can't become its own descendant's child — collect the full
// subtree so the parent picker can exclude it when editing.
function descendantIds(id) {
  const result = new Set();
  function walk(parentId) {
    categories.filter((c) => c.parentId === parentId).forEach((c) => {
      result.add(c.id);
      walk(c.id);
    });
  }
  walk(id);
  return result;
}

function renderCategories() {
  categoryRows.innerHTML = '';
  categoryEmpty.style.display = categories.length ? 'none' : 'block';

  orderedCategoriesTree().forEach(({ cat, depth }) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${cat.image ? `<img class="thumb" src="${cat.image}">` : `<div class="thumb"></div>`}</td>
      <td>${depth > 0 ? '&nbsp;&nbsp;'.repeat(depth) + '&#8627; ' : ''}${escapeHtml(cat.name)}</td>
      <td>${escapeHtml(cat.slug)}</td>
      <td>${depth > 0 ? escapeHtml(parentName(cat.parentId)) : '<span style="color:var(--color-text-muted);">&mdash;</span>'}</td>
      <td class="row-actions">
        <button class="btn btn-sm btn-outline" data-add-child="${cat.id}">+ 子分类</button>
        <button class="btn btn-sm btn-outline" data-edit="${cat.id}">编辑</button>
        <button class="btn btn-sm btn-danger" data-delete="${cat.id}">删除</button>
      </td>
    `;
    categoryRows.appendChild(tr);
  });
}

function populateParentSelect(excludeId) {
  const excluded = excludeId ? descendantIds(excludeId) : new Set();
  if (excludeId) excluded.add(excludeId);
  const options = orderedCategoriesTree().filter(({ cat }) => !excluded.has(cat.id));
  categoryParentField.innerHTML =
    '<option value="">无（顶级分类）</option>' +
    options.map(({ cat, depth }) => `<option value="${cat.id}">${depth > 0 ? '&nbsp;&nbsp;'.repeat(depth) + '&#8627; ' : ''}${escapeHtml(cat.name)}</option>`).join('');
}

function openCategoryModal(category, presetParentId) {
  categoryForm.reset();
  categoryImagePreview.style.display = 'none';
  populateParentSelect(category ? category.id : null);

  if (category) {
    categoryModalTitle.textContent = '编辑分类';
    categoryIdField.value = category.id;
    categoryNameField.value = category.name;
    categoryParentField.value = category.parentId || '';
    if (category.image) {
      categoryImagePreview.src = category.image;
      categoryImagePreview.style.display = 'block';
    }
  } else {
    categoryModalTitle.textContent = presetParentId ? '添加子分类' : '添加分类';
    categoryIdField.value = '';
    if (presetParentId) categoryParentField.value = presetParentId;
  }
  categoryModal.classList.add('open');
}

function closeCategoryModal() {
  categoryModal.classList.remove('open');
}

document.getElementById('addCategoryBtn').addEventListener('click', () => openCategoryModal(null));
document.getElementById('categoryCancelBtn').addEventListener('click', closeCategoryModal);

categoryRows.addEventListener('click', async (e) => {
  const editId = e.target.dataset.edit;
  const deleteId = e.target.dataset.delete;
  const addChildId = e.target.dataset.addChild;

  if (editId) {
    const category = categories.find((c) => c.id === Number(editId));
    openCategoryModal(category);
  }

  if (addChildId) {
    openCategoryModal(null, Number(addChildId));
  }

  if (deleteId) {
    if (!confirm('确定要删除该分类吗？其下的子分类将自动升级为顶级分类。')) return;
    try {
      await api(`/api/categories/${deleteId}`, { method: 'DELETE' });
      showToast('分类已删除');
      loadCategories();
    } catch (err) {
      showToast(err.message);
    }
  }
});

categoryForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData();
  formData.append('name', categoryNameField.value.trim());
  formData.append('parentId', categoryParentField.value);
  if (categoryImageField.files[0]) formData.append('image', categoryImageField.files[0]);

  const id = categoryIdField.value;
  try {
    if (id) {
      await api(`/api/categories/${id}`, { method: 'PUT', body: formData });
      showToast('分类已更新');
    } else {
      await api('/api/categories', { method: 'POST', body: formData });
      showToast('分类已创建');
    }
    closeCategoryModal();
    loadCategories();
  } catch (err) {
    showToast(err.message);
  }
});

loadCategories();
