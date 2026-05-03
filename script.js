// ========== КОНФИГУРАЦИЯ ==========
const API_URL = window.API_URL || 'https://script.google.com/macros/s/AKfycbyy3AKVy1iZwTz3R4hr_4kprgBM6gMW_7_2V1yNRV68PnpVhetfmoTLLNvzszoSD2avzQ/exec';
const VK_APP_ID = window.VK_APP_ID || 54576568;
const ADMIN_VK_IDS = window.ADMIN_VK_IDS || [321451736];
const DRIVE_FOLDER_ID = window.DRIVE_FOLDER_ID || '1FhV_8MF-XvRopll1d-50KN2PDpo8M6_L';

// ========== СОСТОЯНИЕ ==========
const state = {
  currentUser: null,
  userInfo: null,
  isAdmin: false,
  isLoading: true,
  tickets: [],
  currentView: 'login',
  formData: { type: '', category: '', problem: '', printerName: '', requirements: '', location: '', date: '', time: '' },
  adminFilters: { searchQuery: '', type: '', status: '', priority: '' },
  activeTab: 'all',
  selectedTicket: null,
  error: ''
};

// ========== VK BRIDGE (с таймаутами) ==========
async function safeVkBridgeCall(method, params, timeout = 10000) {
  return new Promise(async (resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`VK Bridge call ${method} timed out`));
    }, timeout);
    try {
      const result = await vkBridge.send(method, params);
      clearTimeout(timer);
      resolve(result);
    } catch (e) {
      clearTimeout(timer);
      reject(e);
    }
  });
}

async function initVK() {
  try {
    await safeVkBridgeCall('VKWebAppInit', {}, 5000);
    const authResult = await safeVkBridgeCall('VKWebAppGetAuthToken', {
      app_id: VK_APP_ID,
      scope: ''
    }, 10000);
    if (authResult.access_token) {
      const userInfo = await getUserInfo(authResult.access_token);
      if (userInfo && userInfo.id) {
        await handleAuthSuccess(userInfo.id, userInfo);
        return;
      }
    }
  } catch (e) {
    console.error('Init error:', e);
    state.error = 'Ошибка инициализации: ' + (e.message || 'неизвестная');
  }
  finishLoading();
}

async function getUserInfo(token) {
  try {
    const data = await safeVkBridgeCall('VKWebAppCallAPIMethod', {
      method: 'users.get',
      params: { v: '5.131', access_token: token }
    }, 7000);
    if (data.response && data.response[0]) return data.response[0];
  } catch (e) {
    console.error('getUserInfo error:', e);
  }
  return null;
}

async function handleAuthSuccess(userId, user) {
  state.currentUser = userId;
  state.userInfo = user;
  state.isAdmin = ADMIN_VK_IDS.includes(userId);
  state.currentView = state.isAdmin ? 'admin' : 'main';
  localStorage.setItem('vk_data', JSON.stringify({ id: userId, info: user, admin: state.isAdmin }));
  await loadTickets();
  finishLoading();
  render();
}

function finishLoading() {
  state.isLoading = false;
  render();
}

// ========== API (Google Sheets) ==========
async function loadTickets() {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'getTickets' })
    });
    const data = await res.json();
    if (Array.isArray(data)) state.tickets = data;
  } catch (e) {
    console.error('loadTickets error:', e);
  }
}

async function createTicket(ticket) {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'createTicket', ticket })
    });
    const data = await res.json();
    return data.success;
  } catch (e) {
    console.error('createTicket error:', e);
    return false;
  }
}

async function updateTicket(ticketId, updates) {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'updateTicket', ticketId, updates })
    });
    const data = await res.json();
    if (data.success) await loadTickets();
  } catch (e) {
    console.error('updateTicket error:', e);
  }
}

async function uploadFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target.result.split(',')[1];
      try {
        const res = await fetch(API_URL, {
          method: 'POST',
          body: JSON.stringify({
            action: 'uploadFile',
            fileData: base64,
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
            folderId: DRIVE_FOLDER_ID
          })
        });
        const data = await res.json();
        if (data.fileId) resolve(data.fileId);
        else reject(new Error(data.error || 'Ошибка загрузки'));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ========== РЕНДЕРИНГ ==========
const app = document.getElementById('app');

function render() {
  if (state.isLoading) {
    app.innerHTML = `<div class="app loading-screen"><div class="loader"><div class="spinner"></div><p>Загрузка...</p></div></div>`;
    return;
  }
  if (!state.currentUser) renderLogin();
  else if (!state.isAdmin && state.currentView === 'main') renderMain();
  else if (!state.isAdmin && state.currentView === 'form') renderForm();
  else if (state.isAdmin) {
    if (state.selectedTicket) renderTicketDetail();
    else renderAdmin();
  }
}

// ---------- ЭКРАН ВХОДА ----------
function renderLogin() {
  app.innerHTML = `
    <div class="app login-page">
      <div class="login-container">
        <div class="login-box">
          <h1>📋 Система заявок</h1>
          <p>Войдите через ВКонтакте</p>
          ${state.error ? `<div class="error-message">${state.error}</div>` : ''}
          <button class="vk-login-btn" onclick="handleLogin()">🔗 Войти через VK</button>
          <button class="manual-login-btn" onclick="handleManualLogin()">📝 Ввести VK ID вручную</button>
        </div>
      </div>
    </div>`;
}

async function handleLogin() {
  state.error = '';
  state.isLoading = true; render();
  try {
    await safeVkBridgeCall('VKWebAppInit', {}, 5000);
    const authResult = await safeVkBridgeCall('VKWebAppGetAuthToken', {
      app_id: VK_APP_ID,
      scope: ''
    }, 10000);
    if (authResult.access_token) {
      const user = await getUserInfo(authResult.access_token);
      if (user && user.id) {
        await handleAuthSuccess(user.id, user);
        return;
      }
    }
    state.error = 'Не удалось получить данные пользователя';
  } catch (e) {
    state.error = 'Ошибка авторизации: ' + (e.message || '');
  }
  state.isLoading = false;
  render();
}

function handleManualLogin() {
  const vkId = prompt('Введите ваш VK ID (числа):');
  if (!vkId) return;
  const id = parseInt(vkId);
  if (isNaN(id)) return alert('Некорректный ID');
  const user = { id, first_name: 'User', last_name: String(id), photo_100: 'https://vk.com/images/camera_100.png' };
  state.currentUser = id;
  state.userInfo = user;
  state.isAdmin = ADMIN_VK_IDS.includes(id);
  state.currentView = state.isAdmin ? 'admin' : 'main';
  localStorage.setItem('vk_data', JSON.stringify({ id, info: user, admin: state.isAdmin }));
  state.isLoading = true; render();
  loadTickets().finally(() => { state.isLoading = false; render(); });
}

// ---------- ГЛАВНАЯ ----------
function renderMain() {
  const u = state.userInfo;
  app.innerHTML = `
    <div class="app">
      <header class="header">
        <h1>📋 Заявки</h1>
        <div class="user-info">
          ${u && u.photo_100 ? `<img src="${u.photo_100}" class="user-avatar">` : ''}
          <span>${u ? u.first_name + ' ' + u.last_name : ''}</span>
          <button class="logout-btn" onclick="handleLogout()">Выход</button>
        </div>
      </header>
      <div class="main-content">
        <div class="ticket-blocks">
          <div class="ticket-block maintenance" onclick="openForm('maintenance')"><h2>🔧</h2><p>Тех обслуживание</p></div>
          <div class="ticket-block support" onclick="openForm('support')"><h2>👥</h2><p>Тех сопровождение</p></div>
        </div>
      </div>
    </div>`;
}

function openForm(type) {
  state.formData.type = type;
  state.currentView = 'form';
  render();
}

function backToMain() {
  state.currentView = state.isAdmin ? 'admin' : 'main';
  state.selectedTicket = null;
  state.formData = { type: '', category: '', problem: '', printerName: '', requirements: '', location: '', date: '', time: '' };
  render();
}

// ---------- ФОРМА ----------
function renderForm() {
  const type = state.formData.type;
  app.innerHTML = `
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
      <select id="category"><option value="">Выберите...</option><option value="pc">ПК</option><option value="printer">Принтер</option></select>
      <div id="printerNameBlock" style="display:none">
        <label>Название принтера:</label>
        <input type="text" id="printerName" placeholder="Введите название">
      </div>
      <label>Описание:</label>
      <textarea id="problem" rows="5" placeholder="Опишите проблему"></textarea>
      <label>Файл (необязательно):</label>
      <input type="file" id="attachmentFile">
      <div id="uploadStatus" style="display:none; color: #667eea;">Загрузка файла...</div>
      <button class="submit-btn" id="submitBtn">Отправить заявку</button>
    </div>`;
}

function supportFormHTML() {
  return `
    <div class="form">
      <label>Требования:</label>
      <textarea id="requirements" rows="3"></textarea>
      <label>Место:</label>
      <input type="text" id="location">
      <label>Дата:</label>
      <input type="date" id="date">
      <label>Время:</label>
      <input type="time" id="time">
      <label>Файл (необязательно):</label>
      <input type="file" id="attachmentFile">
      <div id="uploadStatus" style="display:none; color: #667eea;">Загрузка файла...</div>
      <button class="submit-btn" id="submitBtn">Отправить заявку</button>
    </div>`;
}

function bindFormEvents() {
  requestAnimationFrame(() => {
    const catSelect = document.getElementById('category');
    if (catSelect) {
      catSelect.addEventListener('change', (e) => {
        const block = document.getElementById('printerNameBlock');
        if (block) block.style.display = e.target.value === 'printer' ? 'block' : 'none';
      });
    }

    document.getElementById('submitBtn')?.addEventListener('click', async () => {
      const type = state.formData.type;
      const ticket = {
        id: Math.floor(Math.random() * 100000),
        type: type === 'maintenance' ? 'Тех обслуживание' : 'Тех сопровождение',
        author: state.userInfo ? `${state.userInfo.first_name} ${state.userInfo.last_name}` : 'Неизвестный',
        authorId: state.currentUser,
        authorAvatar: state.userInfo?.photo_100 || '',
        status: 'В ожидании',
        priority: 'Средний',
        createdAt: new Date().toLocaleString('ru-RU'),
        completedAt: '',
        timestamp: Date.now(),
        fileId: ''
      };

      if (type === 'maintenance') {
        ticket.category = document.getElementById('category')?.value || '';
        ticket.problem = document.getElementById('problem')?.value || '';
        if (ticket.category === 'printer') {
          ticket.printerName = document.getElementById('printerName')?.value || '';
        }
      } else {
        ticket.requirements = document.getElementById('requirements')?.value || '';
        ticket.location = document.getElementById('location')?.value || '';
        ticket.date = document.getElementById('date')?.value || '';
        ticket.time = document.getElementById('time')?.value || '';
      }

      const fileInput = document.getElementById('attachmentFile');
      if (fileInput && fileInput.files.length > 0) {
        const uploadStatus = document.getElementById('uploadStatus');
        if (uploadStatus) uploadStatus.style.display = 'block';
        try {
          ticket.fileId = await uploadFile(fileInput.files[0]);
        } catch (err) {
          alert('Ошибка загрузки файла: ' + err.message);
          if (uploadStatus) uploadStatus.style.display = 'none';
          return;
        }
        if (uploadStatus) uploadStatus.style.display = 'none';
      }

      if (await createTicket(ticket)) {
        alert('Заявка №' + ticket.id + ' создана!');
        backToMain();
      } else {
        alert('Ошибка при создании заявки');
      }
    });
  });
}

// ---------- ВЫХОД ----------
function handleLogout() {
  state.currentUser = null;
  state.userInfo = null;
  state.isAdmin = false;
  state.currentView = 'login';
  localStorage.clear();
  render();
}

// ---------- АДМИНКА ----------
function renderAdmin() {
  const stats = getStats();
  const filtered = getFilteredTickets();
  app.innerHTML = `
    <div class="app">
      <header class="header">
        <h1>👨‍💼 Админ панель</h1>
        <div class="user-info">
          ${state.userInfo && state.userInfo.photo_100 ? `<img src="${state.userInfo.photo_100}" class="user-avatar"><span>${state.userInfo.first_name || ''}</span>` : ''}
          <button class="logout-btn" onclick="handleLogout()">Выход</button>
        </div>
      </header>
      <div class="admin-panel">
        <div class="stats">
          <div class="stat-block"><h3>${stats.total}</h3><p>Всего</p></div>
          <div class="stat-block"><h3>${stats.waiting}</h3><p>В ожидании</p></div>
          <div class="stat-block"><h3>${stats.working}</h3><p>В работе</p></div>
          <div class="stat-block"><h3>${stats.completed}</h3><p>Выполнено</p></div>
        </div>
        <div class="filters">
          <input type="text" id="searchInput" placeholder="Поиск" value="${state.adminFilters.searchQuery}">
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
            <thead><tr><th>№</th><th>От кого</th><th>Вид</th><th>Статус</th><th>Приоритет</th><th>Дата</th><th>Действие</th></tr></thead>
            <tbody id="ticketTableBody">
              ${filtered.map(t => `
                <tr>
                  <td>${t.id}</td>
                  <td>${t.author}</td>
                  <td>${t.type}</td>
                  <td><span class="status ${(t.status || '').toLowerCase().replace(/ /g,'-')}">${t.status || '—'}</span></td>
                  <td><span class="priority ${(t.priority || '').toLowerCase()}">${t.priority || '—'}</span></td>
                  <td>${t.createdAt}</td>
                  <td><button class="view-btn" data-id="${t.id}">Просмотр</button></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
  bindAdminEvents();
}

function bindAdminEvents() {
  document.getElementById('searchInput')?.addEventListener('input', e => {
    state.adminFilters.searchQuery = e.target.value;
    renderAdmin();
  });
  document.getElementById('statusFilter')?.addEventListener('change', e => {
    state.adminFilters.status = e.target.value;
    renderAdmin();
  });
  document.getElementById('priorityFilter')?.addEventListener('change', e => {
    state.adminFilters.priority = e.target.value;
    renderAdmin();
  });
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeTab = btn.dataset.tab;
      renderAdmin();
    });
  });
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id);
      state.selectedTicket = state.tickets.find(t => t.id == id);
      render();
    });
  });
}

function renderTicketDetail() {
  const t = state.selectedTicket;
  if (!t) return;
  let fileLink = '';
  if (t.fileId) {
    fileLink = `<p><strong>Файл:</strong> <a href="https://drive.google.com/uc?export=download&id=${t.fileId}" target="_blank">Скачать файл</a></p>`;
  }
  app.innerHTML = `
    <div class="app">
      <header class="header"><button class="back-btn" onclick="closeDetail()">← Назад</button><h1>Заявка №${t.id}</h1></header>
      <div class="ticket-detail">
        <div class="ticket-info">
          <h2>${t.type}</h2>
          <div class="user-card">
            ${t.authorAvatar ? `<img src="${t.authorAvatar}" alt="user">` : ''}
            <p><strong>От:</strong> ${t.author}</p>
          </div>
          <p><strong>Статус:</strong> ${t.status}</p>
          <p><strong>Приоритет:</strong> ${t.priority}</p>
          <p><strong>Создана:</strong> ${t.createdAt}</p>
          ${t.completedAt ? `<p><strong>Выполнена:</strong> ${t.completedAt}</p>` : ''}
          ${fileLink}
          <div class="update-section">
            <label>Статус:</label>
            <select id="statusSelect">
              <option value="В ожидании" ${t.status==='В ожидании'?'selected':''}>В ожидании</option>
              <option value="В работе" ${t.status==='В работе'?'selected':''}>В работе</option>
              <option value="Выполнена" ${t.status==='Выполнена'?'selected':''}>Выполнена</option>
            </select>
            <label>Приоритет:</label>
            <select id="prioritySelect">
              <option value="Низкий" ${t.priority==='Низкий'?'selected':''}>Низкий</option>
              <option value="Средний" ${t.priority==='Средний'?'selected':''}>Средний</option>
              <option value="Высокий" ${t.priority==='Высокий'?'selected':''}>Высокий</option>
            </select>
            <button class="submit-btn" id="saveChanges">Сохранить</button>
          </div>
        </div>
      </div>
    </div>`;
  document.getElementById('saveChanges')?.addEventListener('click', async () => {
    const newStatus = document.getElementById('statusSelect').value;
    const newPriority = document.getElementById('prioritySelect').value;
    const updates = { status: newStatus, priority: newPriority };
    if (newStatus === 'Выполнена') updates.completedAt = new Date().toLocaleString('ru-RU');
    await updateTicket(t.id, updates);
    closeDetail();
  });
}

function closeDetail() {
  state.selectedTicket = null;
  render();
}

function getFilteredTickets() {
  let arr = state.tickets;
  const q = state.adminFilters.searchQuery?.toLowerCase();
  if (q) arr = arr.filter(t => (t.id+'').includes(q) || t.type.toLowerCase().includes(q) || t.author.toLowerCase().includes(q));
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
    completed: state.tickets.filter(t => t.status === 'Выполнена').length,
  };
}

// ========== СТАРТ ==========
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
    } catch(e) {}
  }
  return false;
}

(async () => {
  if (restoreSession()) {
    state.isLoading = true;
    render();
    await loadTickets();
    state.isLoading = false;
    render();
  } else {
    state.isLoading = true;
    render();
    await initVK();
  }
})();