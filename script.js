// ========== КОНФИГУРАЦИЯ ==========
const VK_APP_ID = 54576568;
const ADMIN_VK_IDS = [321451736]; // ID админов
const API_URL = 'https://script.google.com/macros/s/AKfycbyy3AKVy1iZwTz3R4hr_4kprgBM6gMW_7_2V1yNRV68PnpVhetfmoTLLNvzszoSD2avzQ/exec'; // замени на URL из шага 1.2

// ========== СОСТОЯНИЕ ПРИЛОЖЕНИЯ ==========
const state = {
  currentUser: null,          // userId
  userInfo: null,             // объект {first_name, last_name, photo_100}
  isAdmin: false,
  isLoading: true,
  tickets: [],
  currentView: 'main',        // 'login','main','form','admin'
  formData: {
    type: '', category: '', problem: '', printerName: '',
    requirements: '', location: '', date: '', time: ''
  },
  adminFilters: {
    searchQuery: '', type: '', status: '', priority: ''
  },
  activeTab: 'all',
  selectedTicket: null,
  error: ''
};

// ========== ИНИЦИАЛИЗАЦИЯ VK BRIDGE ==========
// ========== ИНИЦИАЛИЗАЦИЯ VK BRIDGE ==========
async function initVK() {
  try {
    // Дожидаемся готовности моста
    await vkBridge.send('VKWebAppInit');
  } catch (e) {
    console.warn('VKWebAppInit error:', e);
  }

  try {
    // Получаем токен (без параметров!)
    const authResult = await vkBridge.send('VKWebAppGetAuthToken');
    if (authResult.access_token) {
      const userInfo = await getUserInfo(authResult.access_token);
      if (userInfo && userInfo.id) {
        await handleAuthSuccess(userInfo.id, userInfo, authResult.access_token);
        return;
      }
    }
  } catch (e) {
    console.error('Ошибка получения токена:', e);
  }

  // Если не удалось авторизоваться – просто показываем экран логина
  finishLoading();
}

async function getUserInfo(token) {
  // Используем универсальный вызов API
  try {
    const data = await vkBridge.send('VKWebAppCallAPIMethod', {
      method: 'users.get',
      params: {
        v: '5.131',
        access_token: token
      }
    });
    if (data.response && data.response[0]) {
      return data.response[0];
    }
  } catch (e) {
    console.error('getUserInfo error:', e);
  }
  return null;
}

async function handleLogin() {
  state.error = '';
  state.isLoading = true;
  render();
  try {
    await vkBridge.send('VKWebAppInit').catch(() => {});
    const authResult = await vkBridge.send('VKWebAppGetAuthToken');
    if (authResult.access_token) {
      const user = await getUserInfo(authResult.access_token);
      if (user && user.id) {
        await handleAuthSuccess(user.id, user, authResult.access_token);
        return;
      }
    }
    state.error = 'Не удалось получить данные пользователя';
  } catch (e) {
    state.error = 'Ошибка авторизации';
    console.error(e);
  }
  state.isLoading = false;
  render();
}

async function getUserInfo(token) {
  try {
    const data = await vkBridge.send('VKWebAppCallAPIMethod', {
      method: 'users.get',
      params: {
        user_ids: 'API',
        fields: 'photo_100,first_name,last_name',
        v: '5.131',
        access_token: token
      }
    });
    return data.response[0];
  } catch {
    // fallback
    return { id: null, first_name: 'User', last_name: 'ID', photo_100: 'https://vk.com/images/camera_100.png' };
  }
}

async function handleAuthSuccess(vkId, user, token) {
  state.currentUser = vkId;
  state.userInfo = user;
  state.isAdmin = ADMIN_VK_IDS.includes(vkId);
  state.currentView = state.isAdmin ? 'admin' : 'main';
  // Сохраним в localStorage для быстрого восстановления
  localStorage.setItem('vk_data', JSON.stringify({ id: vkId, info: user, admin: state.isAdmin }));
  await loadTickets(); // подгрузка заявок
  finishLoading();
  render();
}

function finishLoading() {
  state.isLoading = false;
  render();
}

// ========== РАБОТА С GOOGLE SHEETS API ==========
async function loadTickets() {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'getTickets' })
    });
    const data = await response.json();
    if (Array.isArray(data)) {
      state.tickets = data;
    }
  } catch (er) {
    console.error('Ошибка загрузки заявок:', er);
    state.error = 'Не удалось загрузить заявки';
  }
}

async function createTicket(ticket) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'createTicket', ticket })
    });
    const data = await response.json();
    if (data.success) {
      await loadTickets();
      return true;
    }
  } catch (er) {
    console.error('Ошибка создания заявки:', er);
  }
  return false;
}

async function updateTicket(ticketId, updates) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'updateTicket', ticketId, updates })
    });
    const data = await response.json();
    if (data.success) {
      await loadTickets();
    }
  } catch (er) {
    console.error('Ошибка обновления заявки:', er);
  }
}

// ========== РЕНДЕРИНГ ==========
const appRoot = document.getElementById('app');

function render() {
  if (state.isLoading) {
    appRoot.innerHTML = `
      <div class="app loading-screen">
        <div class="loader">
          <div class="spinner"></div>
          <p>Загрузка приложения...</p>
        </div>
      </div>`;
    return;
  }

  if (!state.currentUser) {
    renderLogin();
  } else if (!state.isAdmin && state.currentView === 'main') {
    renderMain();
  } else if (!state.isAdmin && state.currentView === 'form') {
    renderForm();
  } else if (state.isAdmin) {
    renderAdmin();
  }
}

// ---------- Экран ВХОДА ----------
function renderLogin() {
  appRoot.innerHTML = `
    <div class="app login-page">
      <div class="login-container">
        <div class="login-box">
          <h1>📋 Система управления заявками</h1>
          <p>Войдите через ВКонтакте</p>
          ${state.error ? `<div class="error-message">${state.error}</div>` : ''}
          <button class="vk-login-btn" onclick="handleLogin()">🔗 Войти через VK</button>
        </div>
      </div>`;
}

async function handleLogin() {
  try {
    state.error = '';
    state.isLoading = true;
    render();
    // Повторно запрашиваем токен (VK Bridge)
    const authResult = await vkBridge.send('VKWebAppGetAuthToken', {
      app_id: VK_APP_ID,
      scope: 'friends,photos'
    });
    if (authResult.access_token) {
      const user = await getUserInfo(authResult.access_token);
      await handleAuthSuccess(user.id, user, authResult.access_token);
    }
  } catch (e) {
    state.error = 'Ошибка авторизации';
    state.isLoading = false;
    render();
  }
}

// ---------- ГЛАВНАЯ ----------
function renderMain() {
  const user = state.userInfo;
  appRoot.innerHTML = `
    <div class="app">
      <header class="header">
        <h1>📋 Заявки</h1>
        <div class="user-info">
          ${user ? `<img src="${user.photo_100}" class="user-avatar" />` : ''}
          <span>${user ? user.first_name + ' ' + user.last_name : ''}</span>
          <button class="logout-btn" onclick="handleLogout()">Выход</button>
        </div>
      </header>
      <div class="main-content">
        <div class="ticket-blocks">
          <div class="ticket-block maintenance" onclick="openForm('maintenance')">
            <h2>🔧</h2>
            <p>Тех обслуживание</p>
          </div>
          <div class="ticket-block support" onclick="openForm('support')">
            <h2>👥</h2>
            <p>Тех сопровождение</p>
          </div>
        </div>
      </div>
    </div>`;
}

function openForm(type) {
  state.formData.type = type;
  state.currentView = 'form';
  render();
}

// ---------- ФОРМА ----------
function renderForm() {
  const type = state.formData.type;
  appRoot.innerHTML = `
    <div class="app">
      <header class="header">
        <button class="back-btn" onclick="backToMain()">← Назад</button>
        <h1>Новая заявка</h1>
      </header>
      <div class="form-container">
        ${type === 'maintenance' ? maintenanceFormHTML() : supportFormHTML()}
      </div>
    </div>`;
  bindFormEvents();
}

function maintenanceFormHTML() {
  return `
    <div class="form">
      <label>Тип проблемы:</label>
      <select id="category">
        <option value="">Выберите...</option>
        <option value="pc">Проблемы с ПК</option>
        <option value="printer">Проблемы с принтером</option>
      </select>
      <div id="printerNameBlock" style="display:none">
        <label>Название принтера:</label>
        <input type="text" id="printerName" placeholder="Введите название" />
      </div>
      <label>Описание проблемы:</label>
      <textarea id="problem" rows="5" placeholder="Подробно опишите"></textarea>
      <button class="submit-btn" id="submitBtn">Отправить заявку</button>
    </div>`;
}

function supportFormHTML() {
  return `
    <div class="form">
      <label>Требования к сопровождению:</label>
      <textarea id="requirements" rows="3"></textarea>
      <label>Место проведения:</label>
      <input type="text" id="location" />
      <label>Дата:</label>
      <input type="date" id="date" />
      <label>Время:</label>
      <input type="time" id="time" />
      <button class="submit-btn" id="submitBtn">Отправить заявку</button>
    </div>`;
}

function bindFormEvents() {
  const catSelect = document.getElementById('category');
  if (catSelect) {
    catSelect.addEventListener('change', (e) => {
      document.getElementById('printerNameBlock').style.display = e.target.value === 'printer' ? 'block' : 'none';
    });
  }

  document.getElementById('submitBtn')?.addEventListener('click', async () => {
    const type = state.formData.type;
    // Сбор данных
    const ticket = {
      id: Math.floor(Math.random() * 100000),
      type: type === 'maintenance' ? 'Тех обслуживание' : 'Тех сопровождение',
      author: state.userInfo ? `${state.userInfo.first_name} ${state.userInfo.last_name}` : 'Неизв.',
      authorId: state.currentUser,
      authorAvatar: state.userInfo?.photo_100 || '',
      status: 'В ожидании',
      priority: 'Средний',
      createdAt: new Date().toLocaleString('ru-RU'),
      completedAt: '',
      timestamp: Date.now()
    };

    if (type === 'maintenance') {
      ticket.category = document.getElementById('category').value;
      ticket.problem = document.getElementById('problem').value;
      if (ticket.category === 'printer') {
        ticket.printerName = document.getElementById('printerName').value;
      }
    } else {
      ticket.requirements = document.getElementById('requirements').value;
      ticket.location = document.getElementById('location').value;
      ticket.date = document.getElementById('date').value;
      ticket.time = document.getElementById('time').value;
    }

    if (await createTicket(ticket)) {
      alert('Заявка создана! Номер: ' + ticket.id);
      backToMain();
    } else {
      alert('Ошибка создания заявки');
    }
  });
}

function backToMain() {
  state.currentView = state.isAdmin ? 'admin' : 'main';
  state.selectedTicket = null;
  state.formData = { type: '', category: '', problem: '', printerName: '', requirements: '', location: '', date: '', time: '' };
  render();
}

// ---------- АДМИН ПАНЕЛЬ ----------
function renderAdmin() {
  const stats = getStats();
  const filtered = getFilteredTickets();
  appRoot.innerHTML = `
    <div class="app">
      <header class="header">
        <h1>👨‍💼 Админ панель</h1>
        <div class="user-info">
          ${state.userInfo ? `<img src="${state.userInfo.photo_100}" class="user-avatar" />` : ''}
          <span>${state.userInfo ? state.userInfo.first_name : ''}</span>
          <button class="logout-btn" onclick="handleLogout()">Выход</button>
        </div>
      </header>
      <div class="admin-panel">
        <div class="stats">
          <div class="stat-block"><h3>${stats.total}</h3><p>Всего</p></div>
          <div class="stat-block"><h3>${stats.waiting}</h3><p>В ожидании</p></div>
          <div class="stat-block"><h3>${stats.working}</h3><p>В работе</p></div>
          <div class="stat-block"><h3>${stats.completed}</h3><p>Выполненные</p></div>
        </div>
        <div class="filters">
          <input type="text" placeholder="Поиск" id="searchInput" value="${state.adminFilters.searchQuery}" />
          <select id="statusFilter">
            <option value="">Все статусы</option>
            <option value="В ожидании">В ожидании</option>
            <option value="В работе">В работе</option>
            <option value="Выполнена">Выполнена</option>
          </select>
          <select id="priorityFilter">
            <option value="">Все приоритеты</option>
            <option value="Низкий">Низкий</option>
            <option value="Средний">Средний</option>
            <option value="Высокий">Высокий</option>
          </select>
        </div>
        <div class="tabs">
          <button class="tab ${state.activeTab==='all'?'active':''}" data-tab="all">Все</button>
          <button class="tab ${state.activeTab==='waiting'?'active':''}" data-tab="waiting">В ожидании</button>
          <button class="tab ${state.activeTab==='working'?'active':''}" data-tab="working">В работе</button>
          <button class="tab ${state.activeTab==='completed'?'active':''}" data-tab="completed">Выполненные</button>
        </div>
        <div class="tickets-list">
          <table>
            <thead>
              <tr>
                <th>№</th><th>От кого</th><th>Вид</th><th>Статус</th><th>Приоритет</th><th>Дата создания</th><th>Дата выполнения</th><th>Действие</th>
              </tr>
            </thead>
            <tbody id="ticketTableBody">
              ${filtered.map(t => ticketRowHTML(t)).join('')}
              ${filtered.length===0 ? '<tr><td colspan="8" style="text-align:center;padding:20px">Заявок нет</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
  bindAdminEvents();
}

function ticketRowHTML(ticket) {
  return `
    <tr>
      <td>${ticket.id}</td>
      <td><div class="ticket-user">${ticket.authorAvatar ? `<img src="${ticket.authorAvatar}" />` : ''}<span>${ticket.author}</span></div></td>
      <td>${ticket.type}</td>
      <td><span class="status ${ticket.status.toLowerCase().replace(/ /g,'-')}">${ticket.status}</span></td>
      <td><span class="priority ${ticket.priority.toLowerCase()}">${ticket.priority}</span></td>
      <td>${ticket.createdAt}</td>
      <td>${ticket.completedAt || '-'}</td>
      <td><button class="view-btn" data-id="${ticket.id}">Просмотр</button></td>
    </tr>`;
}

function bindAdminEvents() {
  document.getElementById('searchInput')?.addEventListener('input', e => {
    state.adminFilters.searchQuery = e.target.value;
    render();
  });
  document.getElementById('statusFilter')?.addEventListener('change', e => {
    state.adminFilters.status = e.target.value;
    render();
  });
  document.getElementById('priorityFilter')?.addEventListener('change', e => {
    state.adminFilters.priority = e.target.value;
    render();
  });
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeTab = btn.dataset.tab;
      render();
    });
  });
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id);
      state.selectedTicket = state.tickets.find(t => t.id == id);
      renderTicketDetail();
    });
  });
}

function renderTicketDetail() {
  const t = state.selectedTicket;
  if (!t) return;
  const backBtn = `<button class="back-btn" onclick="closeDetail()">← Назад</button>`;
  appRoot.innerHTML = `
    <div class="app">
      <header class="header"><h1>Админ</h1>${backBtn}</header>
      <div class="ticket-detail">
        <div class="ticket-info">
          <h2>Заявка №${t.id}</h2>
          <div class="user-card">
            ${t.authorAvatar ? `<img src="${t.authorAvatar}" />` : ''}
            <p><strong>От:</strong> ${t.author}</p>
          </div>
          <p><strong>Тип:</strong> ${t.type}</p>
          <p><strong>Статус:</strong> ${t.status}</p>
          <p><strong>Приоритет:</strong> ${t.priority}</p>
          <div class="update-section">
            <label>Изменить статус:</label>
            <select id="statusSelect">
              <option value="В ожидании" ${t.status==='В ожидании'?'selected':''}>В ожидании</option>
              <option value="В работе" ${t.status==='В работе'?'selected':''}>В работе</option>
              <option value="Выполнена" ${t.status==='Выполнена'?'selected':''}>Выполнена</option>
            </select>
            <label>Изменить приоритет:</label>
            <select id="prioritySelect">
              <option value="Низкий" ${t.priority==='Низкий'?'selected':''}>Низкий</option>
              <option value="Средний" ${t.priority==='Средний'?'selected':''}>Средний</option>
              <option value="Высокий" ${t.priority==='Высокий'?'selected':''}>Высокий</option>
            </select>
            <button class="submit-btn" id="saveChanges">Сохранить изменения</button>
          </div>
        </div>
      </div>
    </div>`;
  document.getElementById('saveChanges')?.addEventListener('click', async () => {
    const newStatus = document.getElementById('statusSelect').value;
    const newPriority = document.getElementById('prioritySelect').value;
    await updateTicket(t.id, { status: newStatus, priority: newPriority, completedAt: newStatus==='Выполнена'?new Date().toLocaleString('ru-RU'):t.completedAt });
    closeDetail();
  });
}

function closeDetail() {
  state.selectedTicket = null;
  render();
}

// ---------- ФИЛЬТРЫ И СТАТИСТИКА ----------
function getFilteredTickets() {
  let arr = state.tickets;
  const q = state.adminFilters.searchQuery?.toLowerCase();
  if (q) arr = arr.filter(t => t.id.toString().includes(q) || t.type.toLowerCase().includes(q) || t.author.toLowerCase().includes(q));
  if (state.adminFilters.status) arr = arr.filter(t => t.status === state.adminFilters.status);
  if (state.adminFilters.priority) arr = arr.filter(t => t.priority === state.adminFilters.priority);
  if (state.activeTab === 'waiting') arr = arr.filter(t => t.status === 'В ожидании');
  else if (state.activeTab === 'working') arr = arr.filter(t => t.status === 'В работе');
  else if (state.activeTab === 'completed') arr = arr.filter(t => t.status === 'Выполнена');
  return arr;
}


function getStats() {
  return {
    total: state.tickets.length,
    waiting: state.tickets.filter(t => t.status === 'В ожидании').length,
    working: state.tickets.filter(t => t.status === 'В работе').length,
    completed: state.tickets.filter(t => t.status === 'Выполнена').length
  };
}

// ---------- ВЫХОД ----------
async function handleLogout() {
  // в VK Mini Apps выход не делается явно, просто сбросим состояние
  state.currentUser = null;
  state.userInfo = null;
  state.isAdmin = false;
  state.error = '';
  state.currentView = 'login';
  localStorage.clear();
  render();
}

// ---------- СТАРТ ----------
// При загрузке пытаемся восстановить сессию из localStorage (если есть)
function restoreSession() {
  const saved = localStorage.getItem('vk_data');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      state.currentUser = parsed.id;
      state.userInfo = parsed.info;
      state.isAdmin = parsed.admin;
      state.currentView = parsed.admin ? 'admin' : 'main';
      return true;
    } catch { /* игнорируем */ }
  }
  return false;
}

(async () => {
  // Попытка восстановить сессию из localStorage (ускорение загрузки)
  const saved = restoreSession();
  if (saved) {
    state.isLoading = true;
    render(); // Показываем спиннер
    await loadTickets().catch(console.error);
    state.isLoading = false;
    render();
  } else {
    state.isLoading = true;
    render();
    await initVK(); // теперь корректно отработает в мини-аппе
  }
})();