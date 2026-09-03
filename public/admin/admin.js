/* GOLD SKULL — painel admin */
(() => {
  const $ = (s) => document.querySelector(s);
  const money = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const state = {
    user: null,
    products: [],
    categories: [],
    settings: {},
    users: [],
    ledger: [],
    editingId: null,
    search: '',
    catFilter: '',
    stockSearch: '',
    stockCat: '',
    profitPeriod: 'today',
  };

  function sellPrice(p) {
    if (p.promoPrice != null && p.promoPrice < p.price) return Number(p.promoPrice) || 0;
    return Number(p.price) || 0;
  }
  function unitProfit(p) {
    if (p.cost == null || p.cost === '') return null;
    return sellPrice(p) - Number(p.cost);
  }

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 2800);
  }

  async function api(url, opts = {}) {
    if (opts.json) {
      opts.method = opts.method || 'POST';
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(opts.json);
    }
    const res = await fetch(url, opts);
    if (res.status === 401 && !url.includes('/api/login')) { showLogin(); throw new Error('unauthorized'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Algo deu errado.');
    return data;
  }

  /* ---------- auth ---------- */
  function showLogin() {
    $('#panel').classList.add('hidden');
    $('#login-view').classList.remove('hidden');
  }
  function showPanel() {
    $('#login-view').classList.add('hidden');
    $('#panel').classList.remove('hidden');
    const isAdmin = state.user.role === 'admin';
    document.querySelectorAll('.admin-only').forEach((el) => el.classList.toggle('hidden', !isAdmin));
    document.querySelectorAll('.editor-only').forEach((el) => el.classList.toggle('hidden', isAdmin));
    $('#whoami').textContent = state.user.name || state.user.username;
    loadAll();
  }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#login-error').classList.add('hidden');
    try {
      const data = await api('/api/login', { json: { username: $('#login-username').value, password: $('#login-password').value } });
      state.user = data.user;
      $('#login-password').value = '';
      showPanel();
    } catch (err) {
      $('#login-error').textContent = err.message;
      $('#login-error').classList.remove('hidden');
    }
  });

  $('#logout-btn').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' });
    state.user = null;
    showLogin();
  });

  /* ---------- tabs ---------- */
  const TAB_IDS = ['products', 'stock', 'profit', 'categories', 'settings', 'users', 'account'];
  function switchTab(id) {
    if (!TAB_IDS.includes(id)) return;
    const more = $('#more-sheet');
    if (more) more.classList.add('hidden');
    document.querySelectorAll('.tab').forEach((x) => {
      const active = x.dataset.tab === id;
      x.classList.toggle('active', active);
      x.setAttribute('aria-pressed', String(active));
    });
    const dockMain = ['products', 'stock', 'profit'].includes(id);
    document.querySelectorAll('.dock-btn[data-tab]').forEach((x) => {
      const active = x.dataset.tab === id;
      x.classList.toggle('active', active);
      x.setAttribute('aria-pressed', String(active));
    });
    const moreBtn = $('#dock-more');
    if (moreBtn) moreBtn.classList.toggle('active', !dockMain);
    TAB_IDS.forEach((tab) => {
      const panel = $(`#tab-${tab}`);
      if (panel) panel.classList.toggle('hidden', tab !== id);
    });
  }
  document.querySelectorAll('.tab, .dock-btn[data-tab]').forEach((t) =>
    t.addEventListener('click', () => switchTab(t.dataset.tab))
  );
  $('#dock-more').addEventListener('click', () => {
    $('#more-sheet').classList.toggle('hidden');
  });
  document.querySelectorAll('#more-sheet [data-tab]').forEach((b) =>
    b.addEventListener('click', () => switchTab(b.dataset.tab))
  );
  $('#more-logout').addEventListener('click', () => $('#logout-btn').click());

  /* ---------- data ---------- */
  async function loadAll() {
    const [{ products, categories }, ledgerRes] = await Promise.all([
      api('/api/products'),
      api('/api/ledger').catch(() => ({ ledger: [] })),
    ]);
    state.products = products;
    state.categories = categories;
    state.ledger = ledgerRes.ledger || [];
    const catOpts =
      '<option value="">Todas categorias</option>' +
      categories.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    const sel = $('#admin-cat-filter');
    if (sel) {
      sel.innerHTML = catOpts;
      sel.value = state.catFilter;
    }
    const stockSel = $('#stock-cat-filter');
    if (stockSel) {
      stockSel.innerHTML = catOpts;
      stockSel.value = state.stockCat;
    }
    renderProducts();
    renderStock();
    renderProfit();
    if (state.user.role === 'admin') {
      const [pub, users] = await Promise.all([api('/api/public/store'), api('/api/users')]);
      state.settings = pub.settings || {};
      state.users = users.users || [];
      renderCategories();
      renderSettings();
      renderUsers();
    }
  }

  /* ---------- products ---------- */
  function renderProducts() {
    const q = state.search.trim().toLowerCase();
    const cat = state.catFilter;
    const list = state.products.filter((p) => {
      if (cat && p.category !== cat) return false;
      return !q || [p.name, p.category].join(' ').toLowerCase().includes(q);
    });
    $('#products-tbody').innerHTML = list
      .map((p) => {
        const promo = p.promoPrice != null && p.promoPrice < p.price;
        const tracking = p.stockActive && p.stock != null;
        const outOfStock = tracking && p.stock <= 0;
        return `
        <tr>
          <td><img class="t-thumb" src="${esc(p.image)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" /></td>
          <td class="t-name">${esc(p.name)}</td>
          <td class="t-cat t-cat-col">${esc(p.category || '—')}</td>
          <td class="t-price">${money(promo ? p.promoPrice : p.price)}${promo ? `<small>${money(p.price)}</small>` : ''}</td>
          <td><div class="status">
            <button type="button" class="status-toggle ${p.active ? 'on' : 'off'}" data-act="toggle-active" data-id="${esc(p.id)}" title="Visível na loja">${p.active ? 'Visível' : 'Oculto'}</button>
            <button type="button" class="status-toggle ${p.pin ? 'promo' : ''}" data-act="toggle-pin" data-id="${esc(p.id)}" title="Destaque">${p.pin ? '★ Destaque' : '☆ Normal'}</button>
            ${outOfStock ? '<span class="out">Esgotado</span>' : tracking ? `<span class="${p.stock <= 3 ? 'out' : 'on'}">${p.stock} un.</span>` : ''}
          </div></td>
          <td><div class="t-actions">
            <button class="icon-btn" data-act="edit" data-id="${esc(p.id)}" title="Editar">✏️</button>
            <button class="icon-btn" data-act="dup" data-id="${esc(p.id)}" title="Duplicar">📋</button>
            <button class="icon-btn danger" data-act="del" data-id="${esc(p.id)}" title="Tirar">🗑</button>
          </div></td>
        </tr>`;
      })
      .join('');
    $('#products-tbody').querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => {
        const { act, id } = b.dataset;
        if (act === 'edit') openProductModal(id);
        else if (act === 'dup') duplicateProduct(id);
        else if (act === 'del') deleteProduct(id);
        else if (act === 'toggle-active') quickToggle(id, 'active');
        else if (act === 'toggle-pin') quickToggle(id, 'pin');
      })
    );
    const cards = $('#product-cards');
    if (cards) {
      cards.innerHTML = list
        .map((p) => {
          const promo = p.promoPrice != null && p.promoPrice < p.price;
          const tracking = p.stockActive && p.stock != null;
          const outOfStock = tracking && p.stock <= 0;
          return `
          <button type="button" class="product-card" data-id="${esc(p.id)}">
            <img src="${esc(p.image || '')}" alt="" onerror="this.style.visibility='hidden'" />
            <div>
              <div class="product-card-name">${esc(p.name)}</div>
              <div class="product-card-meta">${esc(p.category || '—')}${outOfStock ? ' · esgotado' : tracking ? ` · ${p.stock} un.` : ''} · ${p.active ? 'visível' : 'oculto'}</div>
            </div>
            <strong class="product-card-price">${money(promo ? p.promoPrice : p.price)}</strong>
          </button>`;
        })
        .join('') || '<p class="profit-empty">Nenhum produto nesta busca.</p>';
      cards.querySelectorAll('.product-card').forEach((b) =>
        b.addEventListener('click', () => openProductModal(b.dataset.id))
      );
    }
  }

  async function quickToggle(id, field) {
    const p = state.products.find((x) => x.id === id);
    if (!p) return;
    try {
      await api(`/api/products/${id}/quick`, { method: 'PATCH', json: { [field]: !p[field] } });
      await loadAll();
      toast('Atualizado');
    } catch (err) { toast(err.message); }
  }

  async function duplicateProduct(id) {
    try {
      await api(`/api/products/${id}/duplicate`, { method: 'POST' });
      toast('Produto duplicado (fica oculto até você editar)');
      await loadAll();
    } catch (err) { toast(err.message); }
  }

  $('#admin-search').addEventListener('input', (e) => { state.search = e.target.value; renderProducts(); });
  $('#admin-cat-filter').addEventListener('change', (e) => { state.catFilter = e.target.value; renderProducts(); });
  $('#add-product-btn').addEventListener('click', () => openProductModal(null));
  $('#fab-add').addEventListener('click', () => openProductModal(null));
  $('#stock-search').addEventListener('input', (e) => { state.stockSearch = e.target.value; renderStock(); });
  $('#stock-cat-filter').addEventListener('change', (e) => { state.stockCat = e.target.value; renderStock(); });
  $('#profit-period').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-period]');
    if (!btn) return;
    state.profitPeriod = btn.dataset.period;
    renderProfit();
  });

  /* ---------- stock ---------- */
  function stockList() {
    const q = state.stockSearch.trim().toLowerCase();
    const cat = state.stockCat;
    return state.products.filter((p) => {
      if (cat && p.category !== cat) return false;
      return !q || [p.name, p.category].join(' ').toLowerCase().includes(q);
    });
  }

  function renderStock() {
    const list = stockList();
    const low = state.products.filter((p) => p.stockActive && p.stock != null && p.stock <= 3);
    const alert = $('#stock-alert');
    if (low.length) {
      alert.classList.remove('hidden');
      alert.textContent = `${low.length} produto${low.length === 1 ? '' : 's'} com estoque baixo (3 ou menos).`;
    } else {
      alert.classList.add('hidden');
    }
    $('#stock-list').innerHTML = list
      .map((p) => {
        const price = sellPrice(p);
        const profit = unitProfit(p);
        const tracking = p.stockActive && p.stock != null;
        const qty = tracking ? p.stock : null;
        const lowStock = tracking && qty <= 3;
        return `
        <article class="stock-card" data-id="${esc(p.id)}">
          <img src="${esc(p.image || '')}" alt="" onerror="this.style.visibility='hidden'" />
          <div>
            <div class="stock-card-name">${esc(p.name)}</div>
            <div class="stock-card-meta">${esc(p.category || '—')} · <strong>${money(price)}</strong></div>
            <div class="${profit == null ? 'unit-profit missing' : 'unit-profit'}">${
              profit == null ? 'Informe o custo para ver o lucro' : `Lucro ${money(profit)} / un.`
            }</div>
          </div>
          <div class="stock-cost-row">
            <label>Custo (R$)
              <input type="number" min="0" step="0.01" inputmode="decimal" class="stock-cost" value="${p.cost != null ? p.cost : ''}" placeholder="O que você pagou" />
            </label>
          </div>
          <div class="stock-qty-line">
            <span class="stock-count ${!tracking ? 'off' : lowStock ? 'low' : ''}">${
              tracking ? `Estoque ${qty}` : 'Sem controle ainda'
            }</span>
            <div class="qty-step">
              <button type="button" data-act="qty-minus">−</button>
              <span class="move-qty">1</span>
              <button type="button" data-act="qty-plus">+</button>
            </div>
          </div>
          <div class="stock-actions">
            <button type="button" class="btn btn-ghost" data-act="in">+ Entrada</button>
            <button type="button" class="btn btn-gold" data-act="sale">Vendi</button>
          </div>
        </article>`;
      })
      .join('') || '<p class="profit-empty">Nenhum produto nesta busca.</p>';

    $('#stock-list').querySelectorAll('.stock-card').forEach((card) => {
      const id = card.dataset.id;
      const qtyEl = card.querySelector('.move-qty');
      const costInput = card.querySelector('.stock-cost');
      const readQty = () => Math.max(1, parseInt(qtyEl.textContent, 10) || 1);
      card.querySelector('[data-act="qty-minus"]').addEventListener('click', () => {
        qtyEl.textContent = Math.max(1, readQty() - 1);
      });
      card.querySelector('[data-act="qty-plus"]').addEventListener('click', () => {
        qtyEl.textContent = Math.min(99, readQty() + 1);
      });
      card.querySelector('[data-act="in"]').addEventListener('click', () => stockMove(id, 'in', readQty()));
      card.querySelector('[data-act="sale"]').addEventListener('click', () => stockMove(id, 'sale', readQty()));
      costInput.addEventListener('change', () => saveCost(id, costInput.value));
    });
  }

  async function saveCost(id, raw) {
    try {
      await api(`/api/products/${id}/quick`, { method: 'PATCH', json: { cost: raw === '' ? null : Number(raw) } });
      await loadAll();
      toast('Custo salvo');
    } catch (err) { toast(err.message); }
  }

  async function stockMove(id, type, qty) {
    try {
      await api('/api/stock/move', { json: { productId: id, type, qty } });
      await loadAll();
      toast(type === 'sale' ? 'Venda registrada' : type === 'in' ? 'Entrada no estoque' : 'Estoque atualizado');
    } catch (err) { toast(err.message); }
  }

  /* ---------- profit ---------- */
  function periodStart(period) {
    const now = new Date();
    if (period === 'all') return null;
    const d = new Date(now);
    if (period === 'today') d.setHours(0, 0, 0, 0);
    else if (period === 'week') d.setDate(d.getDate() - 7);
    else if (period === 'month') d.setDate(1), d.setHours(0, 0, 0, 0);
    return d;
  }

  function renderProfit() {
    document.querySelectorAll('#profit-period .period-btn').forEach((b) =>
      b.classList.toggle('active', b.dataset.period === state.profitPeriod)
    );
    const start = periodStart(state.profitPeriod);
    const rows = (state.ledger || []).filter((e) => !start || new Date(e.createdAt) >= start);
    const sales = rows.filter((e) => e.type === 'sale');
    const revenue = sales.reduce((s, e) => s + (Number(e.price) || 0) * (e.qty || 0), 0);
    const known = sales.filter((e) => e.cost != null && e.cost !== '');
    const costSum = known.reduce((s, e) => s + (Number(e.cost) || 0) * (e.qty || 0), 0);
    const profit = known.reduce((s, e) => s + ((Number(e.price) || 0) - (Number(e.cost) || 0)) * (e.qty || 0), 0);
    const missing = sales.length - known.length;
    $('#profit-cards').innerHTML = `
      <div class="profit-card"><span>Faturamento</span><strong>${money(revenue)}</strong></div>
      <div class="profit-card ok"><span>Lucro</span><strong>${money(profit)}</strong></div>
      <div class="profit-card"><span>Vendas</span><strong>${sales.reduce((s, e) => s + (e.qty || 0), 0)}</strong></div>
    `;
    const warn = missing
      ? `<p class="hint">${missing} venda${missing === 1 ? '' : 's'} sem custo — o lucro dessas ficou de fora. Preencha o custo no Estoque.</p>`
      : (known.length ? `<p class="hint">Custo das vendas: ${money(costSum)}</p>` : '');
    const list = rows.length
      ? rows
          .map((e) => {
            const when = new Date(e.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            const kind = e.type === 'sale' ? 'Venda' : e.type === 'in' ? 'Entrada' : 'Baixa';
            const val =
              e.type === 'sale'
                ? money((Number(e.price) || 0) * (e.qty || 0))
                : `${e.type === 'in' ? '+' : '−'}${e.qty}`;
            const extra =
              e.type === 'sale'
                ? (e.cost != null && e.cost !== ''
                    ? ` · lucro ${money(((Number(e.price) || 0) - (Number(e.cost) || 0)) * (e.qty || 0))}`
                    : ' · sem custo')
                : '';
            return `
            <div class="profit-row">
              <div class="profit-row-name">${esc(e.productName)}</div>
              <div class="profit-row-value ${esc(e.type)}">${val}</div>
              <div class="profit-row-meta">${kind} · ${e.qty} un. · ${when}${extra}
                <button type="button" class="icon-btn danger" data-undo="${esc(e.id)}" title="Desfazer" style="width:28px;height:28px;display:inline-flex;margin-left:6px">↩</button>
              </div>
            </div>`;
          })
          .join('')
      : '<p class="profit-empty">Nenhuma movimentação neste período. Use Vendi no Estoque.</p>';
    $('#profit-list').innerHTML = warn + list;
    $('#profit-list').querySelectorAll('[data-undo]').forEach((b) =>
      b.addEventListener('click', () => undoLedger(b.dataset.undo))
    );
  }

  async function undoLedger(id) {
    if (!confirm('Desfazer essa movimentação? O estoque volta como estava.')) return;
    try {
      await api(`/api/ledger/${id}`, { method: 'DELETE' });
      await loadAll();
      toast('Movimentação desfeita');
    } catch (err) { toast(err.message); }
  }

  function fillCategorySelect(selected) {
    const sel = $('#p-category');
    sel.innerHTML =
      '<option value="">Sem categoria</option>' +
      state.categories.map((c) => `<option value="${esc(c)}" ${selected === c ? 'selected' : ''}>${esc(c)}</option>`).join('') +
      '<option value="__new">➕ Criar nova categoria...</option>';
    $('#p-newcat-wrap').classList.add('hidden');
    $('#p-newcat').value = '';
  }
  $('#p-category').addEventListener('change', (e) => {
    $('#p-newcat-wrap').classList.toggle('hidden', e.target.value !== '__new');
  });

  function openProductModal(id) {
    state.editingId = id;
    const p = id ? state.products.find((x) => x.id === id) : null;
    $('#product-form-title').textContent = p ? 'Editar produto' : 'Anunciar produto';
    $('#product-delete').classList.toggle('hidden', !p);
    $('#p-name').value = p ? p.name : '';
    $('#p-price').value = p ? p.price : '';
    $('#p-promoPrice').value = p && p.promoPrice != null ? p.promoPrice : '';
    $('#p-cost').value = p && p.cost != null ? p.cost : '';
    $('#p-description').value = p ? p.description || '' : '';
    $('#p-optionGroup').value = p ? p.optionGroup || '' : '';
    $('#p-options').value = p && Array.isArray(p.options) ? p.options.map((o) => o.title).join('\n') : '';
    $('#p-active').checked = p ? p.active !== false : true;
    $('#p-pin').checked = p ? !!p.pin : false;
    $('#p-stock').value = p && p.stock != null ? p.stock : '';
    $('#p-stockActive').checked = p ? !!p.stockActive : false;
    $('#p-image-file').value = '';
    $('#p-image-hint').textContent = p && p.image ? 'manter foto atual' : 'nenhuma foto selecionada';
    const prev = $('#p-image-preview');
    if (p && p.image) { prev.src = p.image; prev.style.visibility = 'visible'; }
    else { prev.removeAttribute('src'); prev.style.visibility = 'hidden'; }
    fillCategorySelect(p ? p.category : '');
    $('#product-modal').classList.remove('hidden');
  }
  function closeProductModal() { $('#product-modal').classList.add('hidden'); state.editingId = null; }
  $('#product-close').addEventListener('click', closeProductModal);

  $('#p-image-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    $('#p-image-preview').src = URL.createObjectURL(file);
    $('#p-image-preview').style.visibility = 'visible';
    $('#p-image-hint').textContent = file.name;
  });

  $('#product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    let category = $('#p-category').value;
    if (category === '__new') category = $('#p-newcat').value.trim();
    const fd = new FormData();
    fd.append('name', $('#p-name').value);
    fd.append('price', $('#p-price').value);
    fd.append('promoPrice', $('#p-promoPrice').value);
    fd.append('cost', $('#p-cost').value);
    fd.append('category', category);
    fd.append('description', $('#p-description').value);
    fd.append('optionGroup', $('#p-optionGroup').value);
    fd.append(
      'options',
      JSON.stringify(
        $('#p-options')
          .value.split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)
          .map((title) => ({ title }))
      )
    );
    fd.append('stock', $('#p-stock').value);
    fd.append('stockActive', $('#p-stockActive').checked);
    fd.append('pin', $('#p-pin').checked);
    fd.append('active', $('#p-active').checked);
    const file = $('#p-image-file').files[0];
    if (file) fd.append('image', file);
    const editing = !!state.editingId;
    try {
      if (editing) await api(`/api/products/${state.editingId}`, { method: 'PUT', body: fd });
      else await api('/api/products', { method: 'POST', body: fd });
      closeProductModal();
      toast(editing ? 'Produto atualizado' : 'Produto anunciado');
      await loadAll();
    } catch (err) { toast(err.message); }
  });

  async function deleteProduct(id) {
    const p = state.products.find((x) => x.id === id);
    if (!p || !confirm(`Tirar "${p.name}" da loja? Essa ação não pode ser desfeita.`)) return;
    try {
      await api(`/api/products/${id}`, { method: 'DELETE' });
      toast('Produto retirado');
      await loadAll();
    } catch (err) { toast(err.message); }
  }
  $('#product-delete').addEventListener('click', () => {
    const id = state.editingId;
    closeProductModal();
    if (id) deleteProduct(id);
  });

  /* ---------- categories (via settings) ---------- */
  async function saveCategories(categories) {
    await api('/api/settings', { method: 'PUT', json: { categories } });
  }
  function renderCategories() {
    $('#categories-list').innerHTML = state.categories
      .map((c) => {
        const count = state.products.filter((p) => p.category === c).length;
        return `
        <div class="cat-row">
          <span class="cat-name">${esc(c)}</span>
          <span class="cat-count">${count} ${count === 1 ? 'produto' : 'produtos'}</span>
          <button class="icon-btn danger" data-cat="${esc(c)}" title="Excluir">🗑</button>
        </div>`;
      })
      .join('') || '<p class="hint">Nenhuma categoria ainda.</p>';
    $('#categories-list').querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm(`Excluir a categoria "${b.dataset.cat}"? Os produtos dela ficam sem categoria.`)) return;
        try {
          await saveCategories(state.categories.filter((c) => c !== b.dataset.cat));
          toast('Categoria excluída');
          await loadAll();
        } catch (err) { toast(err.message); }
      })
    );
  }
  $('#add-category-btn').addEventListener('click', async () => {
    const name = $('#new-category').value.trim();
    if (!name) return;
    if (state.categories.some((c) => c.toLowerCase() === name.toLowerCase())) return toast('Essa categoria já existe.');
    try {
      await saveCategories([...state.categories, name]);
      $('#new-category').value = '';
      toast('Categoria adicionada');
      await loadAll();
    } catch (err) { toast(err.message); }
  });

  /* ---------- settings ---------- */
  function renderSettings() {
    const s = state.settings;
    $('#s-name').value = s.name || '';
    $('#s-tagline').value = s.tagline || '';
    $('#s-extra').value = s.extra || '';
    $('#s-whatsapp').value = s.whatsapp || '';
    $('#s-address').value = s.address || '';
    $('#s-checkoutMessage').value = s.checkoutMessage || '';
    $('#s-payments').value = (s.payments || []).join('\n');
    const prev = $('#s-banner-preview');
    if (s.banner) { prev.src = s.banner; prev.style.display = ''; } else prev.style.display = 'none';
    renderShippingRows();
  }

  function shippingRowHtml(sh) {
    return `
        <input class="ship-name" value="${esc(sh.name || '')}" placeholder="Região (ex.: Joinville)" />
        <input class="ship-price" type="number" step="0.01" min="0" value="${sh.price ?? ''}" placeholder="R$" />
        <input class="ship-desc" value="${esc(sh.description || '')}" placeholder="Detalhe (ex.: Motoboy — entrega rápida)" />
      <button type="button" class="icon-btn danger" title="Remover">🗑</button>`;
  }
  function renderShippingRows() {
    $('#shipping-list').innerHTML = (state.settings.shipping || [])
      .map((sh) => `<div class="ship-row">${shippingRowHtml(sh)}</div>`)
      .join('');
    $('#shipping-list').querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => b.closest('.ship-row').remove())
    );
  }
  $('#add-shipping-btn').addEventListener('click', () => {
    const div = document.createElement('div');
    div.className = 'ship-row';
    div.innerHTML = shippingRowHtml({});
    div.querySelector('button').addEventListener('click', () => div.remove());
    $('#shipping-list').appendChild(div);
  });

  $('#s-banner-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('image', file);
    try {
      const data = await api('/api/settings/banner', { method: 'POST', body: fd });
      $('#s-banner-preview').src = data.banner;
      $('#s-banner-preview').style.display = '';
      toast('Banner atualizado');
    } catch (err) { toast(err.message); }
  });

  $('#settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const shipping = [...document.querySelectorAll('#shipping-list .ship-row')].map((row) => ({
      name: row.querySelector('.ship-name').value,
      price: row.querySelector('.ship-price').value,
      description: row.querySelector('.ship-desc').value,
    })).filter((s) => s.name.trim());
    try {
      await api('/api/settings', {
        method: 'PUT',
        json: {
          name: $('#s-name').value,
          tagline: $('#s-tagline').value,
          extra: $('#s-extra').value,
          whatsapp: $('#s-whatsapp').value.replace(/\D/g, ''),
          address: $('#s-address').value,
          checkoutMessage: $('#s-checkoutMessage').value,
          payments: $('#s-payments').value.split('\n').map((x) => x.trim()).filter(Boolean),
          shipping,
        },
      });
      toast('Loja atualizada');
      await loadAll();
    } catch (err) { toast(err.message); }
  });

  /* ---------- users ---------- */
  function renderUsers() {
    $('#users-list').innerHTML = state.users
      .map(
        (u) => `
      <div class="cat-row">
        <span class="cat-name">${esc(u.name)} <small style="color:var(--text-2)">@${esc(u.username)}</small></span>
        <span class="cat-count">${u.role === 'admin' ? 'Administrador' : 'Editor'}</span>
        ${u.id !== state.user.id ? `<button class="icon-btn danger" data-id="${esc(u.id)}" title="Excluir">🗑</button>` : '<span class="cat-count">você</span>'}
      </div>`
      )
      .join('');
    $('#users-list').querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm('Excluir esse acesso?')) return;
        try { await api(`/api/users/${b.dataset.id}`, { method: 'DELETE' }); toast('Acesso excluído'); await loadAll(); }
        catch (err) { toast(err.message); }
      })
    );
  }
  $('#user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/users', {
        json: { name: $('#u-name').value, username: $('#u-username').value, password: $('#u-password').value, role: $('#u-role').value },
      });
      $('#u-name').value = ''; $('#u-username').value = ''; $('#u-password').value = '';
      toast('Acesso criado');
      await loadAll();
    } catch (err) { toast(err.message); }
  });

  async function changeOwnPassword(inputSel) {
    const password = $(inputSel).value;
    if (password.length < 4) return toast('A senha precisa de ao menos 4 caracteres.');
    try {
      await api(`/api/users/${state.user.id}/password`, { method: 'PUT', json: { password } });
      $(inputSel).value = '';
      toast('Senha alterada');
    } catch (err) { toast(err.message); }
  }
  $('#admin-password-form').addEventListener('submit', (e) => { e.preventDefault(); changeOwnPassword('#apw-next'); });
  $('#editor-password-form').addEventListener('submit', (e) => { e.preventDefault(); changeOwnPassword('#epw-next'); });

  /* ---------- init ---------- */
  api('/api/me')
    .then((data) => { state.user = data.user; showPanel(); })
    .catch(showLogin);
})();
