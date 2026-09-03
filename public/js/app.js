/* GOLD SKULL — vitrine */
(() => {
  const RETAIL_SKIP = 'Atacado';
  const DEFAULT_CATEGORY = 'Itajaí';

  const state = {
    store: {},
    categories: [],
    products: [],
    activeCategory: DEFAULT_CATEGORY,
    search: '',
    cart: loadCart(),
    modalProduct: null,
    modalQty: 1,
    shipId: '0',
    pay: '',
    checkoutStep: 1,
    cityConfirmed: false,
  };

  const $ = (sel) => document.querySelector(sel);
  const money = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- focus management ---------- */
  let productModalTrigger = null;
  let cartTrigger = null;
  function focusableElements(container) {
    return Array.from(container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((el) => el.offsetParent !== null && !el.disabled);
  }
  function trapFocus(container, returnTo) {
    const handler = (e) => {
      if (e.key !== 'Tab') return;
      const els = focusableElements(container);
      if (els.length === 0) return;
      if (e.shiftKey && document.activeElement === els[0]) { e.preventDefault(); els[els.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === els[els.length - 1]) { e.preventDefault(); els[0].focus(); }
    };
    container._trapHandler = handler;
    container.addEventListener('keydown', handler);
    const first = focusableElements(container)[0];
    if (first) first.focus();
    return () => {
      container.removeEventListener('keydown', handler);
      if (returnTo && returnTo.focus) returnTo.focus();
    };
  }
  let untrapModal = null;
  let untrapCart = null;
  let untrapAge = null;

  /* ---------- storage ---------- */
  function loadCart() {
    try { return JSON.parse(localStorage.getItem('gs_cart')) || []; } catch { return []; }
  }
  function saveCart() {
    localStorage.setItem('gs_cart', JSON.stringify(state.cart));
    renderCartBadge();
    renderCartBar();
  }
  function loadGuest() {
    try { return JSON.parse(localStorage.getItem('gs_guest')) || {}; } catch { return {}; }
  }
  function saveGuest() {
    localStorage.setItem('gs_guest', JSON.stringify({
      name: $('#order-name').value.trim(),
      phone: $('#order-phone').value.trim(),
      address: $('#order-address').value.trim(),
      pay: state.pay || '',
      note: $('#order-note').value.trim(),
    }));
  }
  function fillGuest() {
    const g = loadGuest();
    $('#order-name').value = g.name || '';
    $('#order-phone').value = g.phone || '';
    $('#order-address').value = g.address || '';
    $('#order-note').value = g.note || '';
    if (g.pay) state.pay = g.pay;
  }

  /* ---------- toast ---------- */
  let toastTimer;
  let askYesFn = null;
  let askNoFn = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 4500);
  }
  function closeAsk() {
    $('#toast-ask').classList.add('hidden');
    askYesFn = null;
    askNoFn = null;
  }
  function askToast(msg, onYes, onNo) {
    askYesFn = onYes;
    askNoFn = onNo || null;
    $('#toast-ask-msg').textContent = msg;
    $('#toast-ask').classList.remove('hidden');
  }

  /* ---------- age gate ---------- */
  function initAgeGate() {
    if (localStorage.getItem('gs_age') === 'ok') return;
    const gate = $('#age-gate');
    gate.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    untrapAge = trapFocus(gate, $('#age-yes'));
    $('#age-yes').addEventListener('click', () => {
      localStorage.setItem('gs_age', 'ok');
      gate.classList.add('hidden');
      document.body.style.overflow = '';
      if (untrapAge) { untrapAge(); untrapAge = null; }
    });
  }

  /* ---------- data ---------- */
  async function loadCatalog() {
    renderSkeleton();
    try {
      const res = await fetch('/api/public/store');
      const data = await res.json();
      const s = data.settings || {};
      const shipping = (s.shipping || []).map((sh, i) => ({ id: String(i), name: sh.name, price: Number(sh.price) || 0, description: sh.description || '' }));
      state.store = {
        name: s.name || 'GOLD SKULL',
        tagline: s.tagline || '',
        description: s.extra || '',
        whatsapp: String(s.whatsapp || '').replace(/\D/g, ''),
        address: s.address || '',
        banner: s.banner || '',
        checkoutMessage: s.checkoutMessage || '',
        payments: Array.isArray(s.payments) ? s.payments : [],
        paymentNote: (s.payments || []).join(' • '),
        shipping,
      };
      state.categories = (data.categories || []).map((name) => ({ id: name, name }));
      if (!state.categories.some((c) => c.id === state.activeCategory)) {
        state.activeCategory = state.categories.find((c) => c.id !== RETAIL_SKIP)?.id || 'all';
      }
      state.products = (data.products || []).map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description || '',
        price: p.promoPrice != null ? p.promoPrice : p.price,
        originalPrice: p.promoPrice != null && p.promoPrice < p.price ? p.price : null,
        category: p.category || '',
        categoryId: p.category || '',
        image: p.image || '',
        featured: !!p.pin,
        outOfStock: !!(p.stockActive && p.stock != null && p.stock <= 0),
        optionGroup: p.optionGroup || '',
        options: Array.isArray(p.options) ? p.options : [],
      }));
      renderStore();
      applyCategoryShipping(state.activeCategory);
      renderCategories();
      renderGrid();
    } catch {
      $('#grid').innerHTML = '';
      $('#empty').classList.remove('hidden');
      $('#empty p').textContent = 'Não foi possível carregar o catálogo. Atualize a página.';
    }
  }

  function renderStore() {
    const s = state.store;
    document.title = `${s.name} — Catálogo`;
    $('#brand-name').textContent = s.name;
    $('#store-name').textContent = s.name;
    $('#store-tagline').textContent = s.tagline;
    $('#store-desc').textContent = s.description;
    $('#footer-name').textContent = s.name;
    $('#footer-address').textContent = s.address;
    $('#payment-note').textContent = s.paymentNote;
    $('#checkout-message').textContent = s.checkoutMessage;
      const b = $('#hero-banner');
    const hero = document.querySelector('.hero');
    if (s.banner) {
      b.src = s.banner;
      hero.classList.add('has-banner');
    } else {
      b.style.display = 'none';
      hero.classList.remove('has-banner');
    }
    const wa = s.whatsapp ? `https://wa.me/${s.whatsapp}` : '#';
    $('#wa-float').href = wa;
    $('#footer-wa').href = wa;
    if (!state.shipId && s.shipping[0]) state.shipId = s.shipping[0].id;
    fillGuest();
    if (!state.pay && s.payments[0]) state.pay = s.payments[0];
    renderChoices();
  }

  function payShort(p) {
    if (/pix/i.test(p)) return 'Pix';
    if (/cart/i.test(p)) return 'Cartão';
    return p;
  }

  function fold(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function isRemoteShipping(sh) {
    return /outras|transportadora|correios|sedex|pac/i.test(`${sh.name} ${sh.description}`);
  }

  function shipKind(sh) {
    if (!sh) return '';
    if (isRemoteShipping(sh)) return 'remote';
    const t = fold(`${sh.name} ${sh.description}`);
    if (t.includes('joinville')) return 'joinville';
    if (t.includes('itajai')) return 'itajai';
    return fold(sh.name);
  }

  function shipChoiceHint(sh) {
    const kind = shipKind(sh);
    if (kind === 'itajai') return 'só a cidade de Itajaí';
    if (kind === 'joinville') return 'só a cidade de Joinville';
    if (kind === 'remote') return 'Balneário, Navegantes, resto do Brasil';
    return sh.description || '';
  }

  const OTHER_CITY_WORDS = ['balneario', 'navegantes', 'camboriu', 'curitiba', 'florianopolis', 'floripa'];

  function textHasAny(text, words) {
    return words.some((w) => text.includes(w));
  }

  function addressLooksLikeCity(address, city) {
    const t = fold(address).replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const c = fold(city);
    return t === c || t === `${c} sc` || t === `cidade de ${c}` || t === `${c} santa catarina`;
  }

  function addressConflictsWithShip(address, ship) {
    const addr = fold(address);
    if (!addr || !ship) return null;
    const kind = shipKind(ship);
    if (kind === 'itajai' && textHasAny(addr, ['joinville', ...OTHER_CITY_WORDS])) {
      return { block: true, message: 'Esse endereço não parece Itajaí. Troque a cidade no passo 1 ou o endereço.' };
    }
    if (kind === 'joinville' && textHasAny(addr, ['itajai', ...OTHER_CITY_WORDS])) {
      return { block: true, message: 'Esse endereço não parece Joinville. Troque a cidade no passo 1 ou o endereço.' };
    }
    if (kind === 'remote') {
      const looksLocal = addressLooksLikeCity(address, 'itajai')
        || addressLooksLikeCity(address, 'joinville')
        || (addr.includes('itajai') && !textHasAny(addr, ['joinville', ...OTHER_CITY_WORDS]))
        || (addr.includes('joinville') && !textHasAny(addr, ['itajai', ...OTHER_CITY_WORDS]));
      if (looksLocal) {
        return { block: false, message: 'Se mora na cidade de Itajaí ou Joinville, volte e escolha o motoboy de R$ 15.' };
      }
    }
    return null;
  }

  function shippingForCategory(cat) {
    return (state.store.shipping || []).find((s) => s.name === cat);
  }

  function sortProducts(list) {
    return [...list].sort((a, b) => {
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      return a.name.localeCompare(b.name, 'pt-BR');
    });
  }

  function applyCategoryShipping(catId) {
    const prev = state.shipId;
    if (catId === 'all') return;
    if (catId === RETAIL_SKIP) {
      const remote = (state.store.shipping || []).find((s) => isRemoteShipping(s));
      if (remote) state.shipId = remote.id;
    } else {
      const ship = shippingForCategory(catId);
      if (ship) state.shipId = ship.id;
    }
    if (state.shipId !== prev) setCityConfirmed(false);
  }

  function setCityConfirmed(on) {
    state.cityConfirmed = !!on;
    const box = $('#city-confirm');
    if (box) box.checked = state.cityConfirmed;
  }

  function renderCityConfirm() {
    const ship = currentShipping();
    const text = $('#city-confirm-text');
    if (text) text.textContent = ship ? `Confirmo que estou em ${ship.name}` : 'Confirmo que estou nessa cidade';
    const box = $('#city-confirm');
    if (box) box.checked = state.cityConfirmed;
  }

  function renderCityBanner() {
    const ship = currentShipping();
    const title = $('#city-banner-title');
    if (!title) return;
    title.textContent = ship ? `Entrega: ${ship.name.toUpperCase()} — ${money(ship.price)}` : 'Entrega';
  }

  function renderChoices() {
    const ships = state.store.shipping || [];
    const choiceBtn = (sh) => `<button type="button" class="choice city-choice ${state.shipId === sh.id ? 'selected' : ''}" data-ship="${esc(sh.id)}">
          <strong>${esc(sh.name)}</strong>
          <span class="city-choice-price">${money(sh.price)}</span>
          <small>${esc(shipChoiceHint(sh))}</small>
        </button>`;
    $('#shipping-choices').innerHTML = ships.length
      ? `<div class="choice-list">${ships.map(choiceBtn).join('')}</div>`
      : '<p class="cart-note">Combinamos a entrega no WhatsApp.</p>';
    $('#shipping-choices').querySelectorAll('[data-ship]').forEach((b) =>
      b.addEventListener('click', () => {
        if (state.shipId !== b.dataset.ship) setCityConfirmed(false);
        state.shipId = b.dataset.ship;
        renderChoices();
        renderCart();
      })
    );
    renderCityConfirm();
    renderCityBanner();
    const pays = state.store.payments && state.store.payments.length ? state.store.payments : ['A combinar'];
    if (!state.pay) state.pay = pays[0];
    $('#pay-choices').innerHTML = pays
      .map(
        (p) => `<button type="button" class="choice ${state.pay === p ? 'selected' : ''}" data-pay="${esc(p)}">${esc(payShort(p))}</button>`
      )
      .join('');
    $('#pay-choices').querySelectorAll('[data-pay]').forEach((b) =>
      b.addEventListener('click', () => {
        state.pay = b.dataset.pay;
        saveGuest();
        renderChoices();
      })
    );
  }

  function renderCategories() {
    const nav = $('#categories');
    const pills = [{ id: 'all', name: 'Todas' }, ...state.categories];
    nav.innerHTML = pills
      .map((c) => `<button class="cat-pill ${c.id === state.activeCategory ? 'active' : ''}" data-cat="${esc(c.id)}" aria-pressed="${c.id === state.activeCategory}">${esc(c.name)}</button>`)
      .join('');
    nav.querySelectorAll('.cat-pill').forEach((b) =>
      b.addEventListener('click', () => {
        state.activeCategory = b.dataset.cat;
        applyCategoryShipping(state.activeCategory);
        renderCategories();
        renderGrid();
        renderCartBar();
      })
    );
  }

  function filtered() {
    const q = state.search.trim().toLowerCase();
    let list = state.products.filter((p) => {
      if (state.activeCategory === 'all') {
        if (p.categoryId === RETAIL_SKIP) return false;
      } else if (p.categoryId !== state.activeCategory) return false;
      if (!q) return true;
      return [p.name, p.description, p.category].join(' ').toLowerCase().includes(q);
    });
    if (state.activeCategory === 'all') {
      const byName = new Map();
      for (const p of list) {
        const key = p.name.trim().toLowerCase().replace(/\s+/g, ' ');
        const prev = byName.get(key);
        if (!prev || (p.options || []).length > (prev.options || []).length) byName.set(key, p);
      }
      list = [...byName.values()];
    }
    return sortProducts(list);
  }

  function renderSkeleton() {
    $('#grid').innerHTML = Array.from({ length: 8 })
      .map(() => '<div class="skel"><div class="skel-img"></div><div class="skel-line"></div><div class="skel-line short"></div></div>')
      .join('');
  }

  function renderGrid() {
    const list = filtered();
    const grid = $('#grid');
    const catName = state.activeCategory === 'all'
      ? 'Todas as cidades'
      : (state.categories.find((c) => c.id === state.activeCategory) || {}).name || 'Produtos';
    $('#grid-title').textContent = state.search ? `Busca: "${state.search}"` : catName;
    $('#result-count').textContent = `${list.length} ${list.length === 1 ? 'item' : 'itens'}`;
    $('#empty').classList.toggle('hidden', list.length > 0);
    grid.innerHTML = list.map((p, i) => cardHtml(p, i)).join('');
    grid.querySelectorAll('.card').forEach((el) => {
      el.addEventListener('click', () => openModal(el.dataset.id, el));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(el.dataset.id, el); }
      });
    });
  }

  const IMG_FALLBACK = "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 fill=%22%23efede6%22/><rect x=%2210%22 y=%2210%22 width=%2280%22 height=%2280%22 rx=%2212%22 fill=%22%23ffbe0e%22/><text x=%2250%22 y=%2268%22 text-anchor=%22middle%22 font-size=%2248%22 font-weight=%22bold%22 fill=%22%23181200%22 font-family=%22Arial%22>G</text></svg>";

  function cardHtml(p, i) {
    const promo = p.originalPrice && p.originalPrice > p.price;
    return `
      <article class="card ${p.outOfStock ? 'out' : ''}" data-id="${esc(p.id)}" role="button" tabindex="0" aria-label="${esc(p.outOfStock ? 'Esgotado' : 'Comprar')} ${esc(p.name)} — ${money(p.price)}" style="animation-delay:${Math.min(i * 35, 400)}ms">
        <div class="card-img-wrap">
          <img class="card-img" loading="lazy" src="${esc(p.image)}" alt="${esc(p.name)}" onerror="this.src='${IMG_FALLBACK}'" />
          ${promo ? '<span class="badge badge-promo">Promoção</span>' : ''}
          ${p.featured && !promo ? '<span class="badge badge-feat">Destaque</span>' : ''}
          ${p.outOfStock ? '<span class="badge badge-out">Esgotado</span>' : ''}
        </div>
        <div class="card-body">
          <div class="card-cat">${esc(p.category || 'Geral')}</div>
          <div class="card-name" title="${esc(p.name)}">${esc(p.name)}</div>
          ${p.options && p.options.length ? `<div class="card-opts">${p.options.length} sabores</div>` : ''}
          <div class="card-price-row">
            <span class="card-price">${money(p.price)}</span>
            ${promo ? `<span class="card-price-old">${money(p.originalPrice)}</span>` : ''}
          </div>
          <div class="card-cta">${p.outOfStock ? 'Esgotado' : 'Comprar'}</div>
        </div>
      </article>`;
  }

  /* ---------- product modal ---------- */
  function openModal(id, triggerEl) {
    const p = state.products.find((x) => x.id === id);
    if (!p) return;
    productModalTrigger = triggerEl || document.activeElement;
    state.modalProduct = p;
    state.modalQty = 1;
    state.modalOption = '';
    const promo = p.originalPrice && p.originalPrice > p.price;
    const hasOpts = p.options && p.options.length;
    const firstOk = hasOpts ? p.options.find((o) => o.available !== false) : null;
    state.modalOption = firstOk ? firstOk.title : '';
    const optsHtml = hasOpts
      ? `<div class="opt-wrap">
          <p class="opt-label">1. Toque no sabor</p>
          <div class="opt-list" id="opt-list">
            ${p.options
              .map(
                (o) => `
              <button type="button" class="opt-item ${o.available === false ? 'disabled' : ''} ${state.modalOption === o.title ? 'selected' : ''}" data-opt="${esc(o.title)}" ${o.available === false ? 'disabled' : ''}>
                ${o.image ? `<img src="${esc(o.image)}" alt="" />` : '<span class="opt-dot"></span>'}
                <span>${esc(o.title)}</span>
              </button>`
              )
              .join('')}
          </div>
          <p class="opt-hint" id="opt-hint">${state.modalOption ? 'Sabor: ' + esc(state.modalOption) : 'Escolha um sabor'}</p>
        </div>`
      : '';
    const mainImg = (firstOk && firstOk.image) || p.image;
    $('#modal-body').innerHTML = `
      <div class="modal-grid">
        <div class="modal-img-wrap">
          <img class="modal-img" id="modal-main-img" src="${esc(mainImg)}" alt="${esc(p.name)}" onerror="this.src='${IMG_FALLBACK}'" />
          ${promo ? '<span class="badge badge-promo">Promoção</span>' : ''}
        </div>
        <div class="modal-info">
          <span class="modal-cat">${esc(p.category || 'Geral')}</span>
          <h3 class="modal-name">${esc(p.name)}</h3>
          <div class="modal-price-row">
            <span class="modal-price">${money(p.price)}</span>
            ${promo ? `<span class="modal-price-old">${money(p.originalPrice)}</span>` : ''}
          </div>
          ${optsHtml}
          ${p.description ? `<details class="modal-more"><summary>Ver descrição</summary><div class="modal-desc">${esc(p.description)}</div></details>` : ''}
          <div class="modal-actions">
            ${p.outOfStock
              ? '<span class="badge badge-out" style="position:static">Produto esgotado</span>'
              : `<div class="qty">
                  <button id="qty-minus" aria-label="Diminuir">−</button>
                  <span id="qty-value">1</span>
                  <button id="qty-plus" aria-label="Aumentar">+</button>
                </div>
                <button class="btn btn-gold" id="modal-add" style="flex:1">COLOCAR NO PEDIDO</button>`}
          </div>
        </div>
      </div>`;
    if (hasOpts) {
      $('#opt-list').querySelectorAll('.opt-item:not(.disabled)').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.modalOption = btn.dataset.opt;
          $('#opt-list').querySelectorAll('.opt-item').forEach((x) => x.classList.toggle('selected', x === btn));
          const hint = $('#opt-hint');
          if (hint) hint.textContent = 'Sabor: ' + btn.textContent.trim();
          const chosen = p.options.find((o) => o.title === btn.dataset.opt);
          if (chosen && chosen.image) $('#modal-main-img').src = chosen.image;
        });
      });
    }
    if (!p.outOfStock) {
      $('#qty-minus').addEventListener('click', () => { state.modalQty = Math.max(1, state.modalQty - 1); $('#qty-value').textContent = state.modalQty; });
      $('#qty-plus').addEventListener('click', () => { state.modalQty = Math.min(99, state.modalQty + 1); $('#qty-value').textContent = state.modalQty; });
      $('#modal-add').addEventListener('click', () => {
        if (hasOpts && !state.modalOption) {
          toast('Toque em um sabor primeiro');
          return;
        }
        addToCart(p.id, state.modalQty, state.modalOption);
        openCart(productModalTrigger);
        toast('Pronto. Agora preencha seus dados e aperte ENVIAR.');
      });
    }
    $('#product-modal').classList.remove('hidden');
    $('#drawer-backdrop').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    untrapModal = trapFocus($('#product-modal'), productModalTrigger);
  }
  function closeModal() {
    $('#product-modal').classList.add('hidden');
    if (untrapModal) { untrapModal(); untrapModal = null; }
    if ($('#cart-drawer').classList.contains('hidden')) {
      $('#drawer-backdrop').classList.add('hidden');
      document.body.style.overflow = '';
    }
  }

  /* ---------- cart ---------- */
  function cartKey(id, option) {
    return `${id}::${option || ''}`;
  }
  function promptShippingMix(product) {
    if (!product) return;
    const current = currentShipping();
    if (!current) return;
    const cat = product.category || '';
    if (cat === RETAIL_SKIP) {
      if (!isRemoteShipping(current)) {
        const remote = (state.store.shipping || []).find((s) => isRemoteShipping(s));
        if (remote) {
          askToast(`Esse produto é de Atacado. Trocar entrega para ${remote.name} (${money(remote.price)})?`, () => {
            state.shipId = remote.id;
            setCityConfirmed(false);
            saveCart();
            renderCart();
          });
        }
      }
      return;
    }
    const regionShip = shippingForCategory(cat);
    if (!regionShip || regionShip.id === current.id) return;
    const currentKind = shipKind(current);
    const nextKind = shipKind(regionShip);
    if ((currentKind === 'itajai' && nextKind === 'joinville') || (currentKind === 'joinville' && nextKind === 'itajai')) {
      askToast(`Esse produto é de ${regionShip.name}. Trocar entrega para ${regionShip.name} (${money(regionShip.price)})?`, () => {
        state.shipId = regionShip.id;
        setCityConfirmed(false);
        saveCart();
        renderCart();
      });
    }
  }

  function addToCart(id, qty, option) {
    const key = cartKey(id, option);
    const item = state.cart.find((i) => cartKey(i.id, i.option) === key);
    if (item) item.qty = Math.min(99, item.qty + qty);
    else state.cart.push({ id, qty, option: option || '' });
    const product = state.products.find((p) => p.id === id);
    saveCart();
    renderCart();
    promptShippingMix(product);
  }
  function setQty(key, qty) {
    const item = state.cart.find((i) => cartKey(i.id, i.option) === key);
    if (!item) return;
    item.qty = qty;
    if (item.qty <= 0) state.cart = state.cart.filter((i) => cartKey(i.id, i.option) !== key);
    saveCart();
    renderCart();
  }
  function removeFromCart(key) {
    state.cart = state.cart.filter((i) => cartKey(i.id, i.option) !== key);
    saveCart();
    renderCart();
  }
  function renderCartBadge() {
    const n = state.cart.reduce((s, i) => s + i.qty, 0);
    const el = $('#cart-count');
    el.textContent = n;
    el.classList.toggle('hidden', n === 0);
  }

  function currentShipping() {
    return (state.store.shipping || []).find((s) => s.id === state.shipId) || (state.store.shipping || [])[0] || null;
  }

  function announceCart(msg) {
    const el = $('#cart-live');
    if (el) el.textContent = msg;
  }
  function renderCartBar() {
    const items = state.cart
      .map((i) => ({ ...i, product: state.products.find((p) => p.id === i.id) }))
      .filter((i) => i.product);
    const subtotal = items.reduce((s, i) => s + i.product.price * i.qty, 0);
    const ship = currentShipping();
    const total = subtotal + (ship ? ship.price : 0);
    const bar = $('#cart-bar');
    const n = state.cart.reduce((s, i) => s + i.qty, 0);
    if (bar) bar.classList.toggle('hidden', n === 0);
    document.body.classList.toggle('has-cart-bar', n > 0);
    const totalEl = $('#cart-bar-total');
    if (totalEl) totalEl.textContent = money(total);
    if (n > 0) announceCart(`${n} ${n === 1 ? 'item' : 'itens'} no pedido. Total ${money(total)}`);
  }

  function setCheckoutStep(step) {
    state.checkoutStep = Math.max(1, Math.min(3, step));
    [1, 2, 3].forEach((n) => {
      const panel = $(`#wizard-step-${n}`);
      if (panel) panel.classList.toggle('hidden', n !== state.checkoutStep);
      const dot = document.querySelector(`.wizard-dot[data-step="${n}"]`);
      if (dot) dot.classList.toggle('active', n <= state.checkoutStep);
    });
    const label = $('#wizard-step-label');
    if (label) label.textContent = `Passo ${state.checkoutStep} de 3`;
    const back = $('#wizard-back');
    const next = $('#wizard-next');
    if (back) back.classList.toggle('hidden', state.checkoutStep === 1);
    if (next) {
      next.textContent = state.checkoutStep === 3 ? 'Enviar' : 'Próximo';
      next.classList.toggle('hidden', state.checkoutStep === 3);
    }
  }

  function validateCheckoutStep(step) {
    if (step === 1) {
      if (!currentShipping()) { toast('Escolha sua região de entrega'); return false; }
      if (!state.cityConfirmed) { toast('Marque a confirmação da cidade'); return false; }
      return true;
    }
    if (step === 2) {
      const name = $('#order-name').value.trim();
      const phone = $('#order-phone').value.trim();
      const address = $('#order-address').value.trim();
      if (!name) { toast('Escreva seu nome'); $('#order-name').focus(); return false; }
      if (phone.replace(/\D/g, '').length < 10) { toast('Escreva seu WhatsApp com DDD'); $('#order-phone').focus(); return false; }
      if (!address) { toast('Escreva o bairro e a cidade'); $('#order-address').focus(); return false; }
      const conflict = addressConflictsWithShip(address, currentShipping());
      if (conflict) {
        toast(conflict.message);
        if (conflict.block) {
          $('#order-address').focus();
          return false;
        }
      }
      saveGuest();
      return true;
    }
    return true;
  }

  function renderCart() {
    const wrap = $('#cart-items');
    const items = state.cart
      .map((i) => ({ ...i, product: state.products.find((p) => p.id === i.id) }))
      .filter((i) => i.product);
    const has = items.length > 0;
    $('#cart-empty').classList.toggle('hidden', has);
    $('#cart-foot').classList.toggle('hidden', !has);
    wrap.classList.toggle('hidden', !has);
    wrap.innerHTML = items
      .map((i) => {
        const key = cartKey(i.id, i.option);
        const thumb = (i.product.options || []).find((o) => o.title === i.option);
        return `
      <div class="cart-item">
        <img src="${esc((thumb && thumb.image) || i.product.image)}" alt="" onerror="this.style.visibility='hidden'" />
        <div>
          <div class="cart-item-name">${esc(i.product.name)}</div>
          ${i.option ? `<div class="cart-item-opt">${esc(i.option)}</div>` : ''}
          <div class="cart-item-row">
            <div class="qty small">
              <button data-act="minus" data-key="${esc(key)}" aria-label="Diminuir quantidade">−</button>
              <span aria-label="Quantidade">${i.qty}</span>
              <button data-act="plus" data-key="${esc(key)}" aria-label="Aumentar quantidade">+</button>
            </div>
            <span class="cart-item-price">${money(i.product.price * i.qty)}</span>
          </div>
        </div>
        <button class="cart-item-remove" data-act="rm" data-key="${esc(key)}" aria-label="Remover">🗑</button>
      </div>`;
      })
      .join('');
    wrap.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => {
        const { act, key } = b.dataset;
        if (act === 'rm') removeFromCart(key);
        else setQty(key, (state.cart.find((i) => cartKey(i.id, i.option) === key)?.qty || 1) + (act === 'plus' ? 1 : -1));
      })
    );
    const subtotal = items.reduce((s, i) => s + i.product.price * i.qty, 0);
    const ship = currentShipping();
    const total = subtotal + (ship ? ship.price : 0);
    $('#cart-subtotal').textContent = money(subtotal);
    $('#cart-shipping').textContent = ship ? money(ship.price) : 'A combinar';
    $('#cart-total').textContent = money(total);
    const totalFinal = $('#cart-total-final');
    if (totalFinal) totalFinal.textContent = money(total);
    const n = state.cart.reduce((s, i) => s + i.qty, 0);
    const summary = $('#cart-summary');
    if (summary) {
      summary.classList.toggle('hidden', !has);
      summary.textContent = has ? `${n} ${n === 1 ? 'item' : 'itens'} · ${money(total)}` : '';
    }
    if (has) announceCart(`${n} ${n === 1 ? 'item' : 'itens'} no pedido. Total ${money(total)}`);
    renderChoices();
    renderCityBanner();
    renderCartBar();
    if (has) setCheckoutStep(state.checkoutStep);
  }

  function openCart(triggerEl) {
    if (!$('#product-modal').classList.contains('hidden')) {
      $('#product-modal').classList.add('hidden');
      if (untrapModal) { untrapModal(); untrapModal = null; }
    }
    state.checkoutStep = 1;
    setCityConfirmed(false);
    renderCart();
    setCheckoutStep(1);
    $('#cart-drawer').classList.remove('hidden');
    $('#drawer-backdrop').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    cartTrigger = triggerEl || document.activeElement;
    untrapCart = trapFocus($('#cart-drawer'), cartTrigger);
  }
  function closeCart() {
    $('#cart-drawer').classList.add('hidden');
    if (untrapCart) { untrapCart(); untrapCart = null; }
    if ($('#product-modal').classList.contains('hidden')) {
      $('#drawer-backdrop').classList.add('hidden');
      document.body.style.overflow = '';
    }
  }

  function checkout() {
    if (!state.cart.length) return;
    if (!state.cityConfirmed) {
      setCheckoutStep(1);
      toast('Marque a confirmação da cidade');
      return;
    }
    if (!validateCheckoutStep(2)) {
      setCheckoutStep(2);
      return;
    }
    const name = $('#order-name').value.trim();
    const phone = $('#order-phone').value.trim();
    const address = $('#order-address').value.trim();
    const note = $('#order-note').value.trim();
    const pay = state.pay || 'A combinar';
    if (!state.store.whatsapp) { toast('WhatsApp da loja não configurado'); return; }
    saveGuest();
    const items = state.cart
      .map((i) => ({ ...i, product: state.products.find((p) => p.id === i.id) }))
      .filter((i) => i.product);
    const ship = currentShipping();
    const subtotal = items.reduce((s, i) => s + i.product.price * i.qty, 0);
    const shipPrice = ship ? ship.price : 0;
    const lines = items.map((i) => `• ${i.qty}x ${i.product.name}${i.option ? ` (${i.option})` : ''} — ${money(i.product.price * i.qty)}`);
    const msg = [
      `*Novo pedido — ${state.store.name}*`,
      `*CIDADE:* ${ship ? ship.name : 'A combinar'}`,
      '',
      `*Cliente:* ${name}`,
      `*WhatsApp do cliente:* ${phone}`,
      `*Entrega em:* ${address}`,
      `*Frete:* ${ship ? `${ship.name} (${money(ship.price)})` : 'A combinar'}`,
      `*Pagamento:* ${pay}`,
      '',
      '*Itens:*',
      ...lines,
      '',
      `Subtotal: ${money(subtotal)}`,
      `Entrega: ${ship ? money(shipPrice) : 'A combinar'}`,
      `*Total: ${money(subtotal + shipPrice)}*`,
      ...(note ? ['', `Obs: ${note}`] : []),
    ].join('\n');
    window.open(`https://wa.me/${state.store.whatsapp}?text=${encodeURIComponent(msg)}`, '_blank');
    toast('Abriu o WhatsApp. Agora aperte ENVIAR.');
  }

  /* ---------- events ---------- */
  let searchTimer;
  $('#search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = e.target.value;
      renderGrid();
    }, 160);
  });
  $('#cart-open').addEventListener('click', () => openCart($('#cart-open')));
  $('#cart-bar-open').addEventListener('click', () => openCart($('#cart-bar-open')));
  $('#cart-close').addEventListener('click', closeCart);
  $('#modal-close').addEventListener('click', closeModal);
  $('#drawer-backdrop').addEventListener('click', () => { closeModal(); closeCart(); });
  $('#checkout-btn').addEventListener('click', checkout);
  $('#wizard-next').addEventListener('click', () => {
    if (!validateCheckoutStep(state.checkoutStep)) return;
    if (state.checkoutStep === 2) setCheckoutStep(3);
    else setCheckoutStep(state.checkoutStep + 1);
  });
  $('#wizard-back').addEventListener('click', () => setCheckoutStep(state.checkoutStep - 1));
  $('#city-confirm').addEventListener('change', (e) => {
    state.cityConfirmed = e.target.checked;
  });
  $('#order-address').addEventListener('blur', () => {
    const conflict = addressConflictsWithShip($('#order-address').value.trim(), currentShipping());
    if (conflict) toast(conflict.message);
  });
  $('#toast-ask-yes').addEventListener('click', () => {
    const fn = askYesFn;
    closeAsk();
    if (fn) fn();
  });
  $('#toast-ask-no').addEventListener('click', () => {
    const fn = askNoFn;
    closeAsk();
    if (fn) fn();
  });
  ['order-name', 'order-phone', 'order-address', 'order-note'].forEach((id) => {
    document.getElementById(id).addEventListener('change', saveGuest);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeModal(); closeCart(); }
  });

  /* ---------- init ---------- */
  initAgeGate();
  renderCartBadge();
  renderCartBar();
  loadCatalog();
})();
