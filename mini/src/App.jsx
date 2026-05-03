import React, { useState, useEffect } from 'react';
import './App.css';
import {
  vkLogin,
  manualVKLogin,
  checkVKAuth,
  checkTokenInURL,
  vkLogout,
  getVKUserInfo,
  isUserAdmin,
} from './vkAuth';
import {
  createTicketInDB,
  subscribeToTickets,
  updateTicketInDB,
} from './firebase';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [currentView, setCurrentView] = useState('main');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [error, setError] = useState('');
  const [unsubscribe, setUnsubscribe] = useState(null);

  const [formData, setFormData] = useState({
    type: '',
    category: '',
    problem: '',
    printerName: '',
    requirements: '',
    location: '',
    date: '',
    time: '',
  });

  const [adminFilters, setAdminFilters] = useState({
    searchQuery: '',
    type: '',
    status: '',
    priority: '',
  });

  // Инициализация
  useEffect(() => {
    const init = async () => {
      try {
        // Проверка токена в URL (после редиректа от VK)
        const tokenData = await checkTokenInURL();
        if (tokenData) {
          await handleVKAuthSuccess(tokenData.userId);
          setIsLoading(false);
          return;
        }

        // Проверка авторизации в localStorage
        const authStatus = await checkVKAuth();
        if (authStatus.isAuth) {
          await handleVKAuthSuccess(authStatus.userId);
        }
      } catch (err) {
        console.error('Ошибка инициализации:', err);
        setError('Ошибка загрузки приложения');
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, []);

  // Подписка на заявки из Firebase
  useEffect(() => {
    try {
      const unsubFunc = subscribeToTickets((firebaseTickets) => {
        setTickets(firebaseTickets);
      });
      setUnsubscribe(() => unsubFunc);

      return () => {
        if (unsubFunc) unsubFunc();
      };
    } catch (err) {
      console.error('Ошибка подписки на заявки:', err);
    }
  }, []);

  const handleVKAuthSuccess = async (userId) => {
    try {
      setIsAuthLoading(true);
      const userInfo = await getVKUserInfo(userId);
      
      setCurrentUser(userId);
      setUserInfo(userInfo);
      const adminStatus = isUserAdmin(userId);
      setIsAdmin(adminStatus);
      
      localStorage.setItem('vkUser', JSON.stringify({
        userId,
        fullName: `${userInfo.first_name} ${userInfo.last_name}`,
        avatar: userInfo.photo_100,
        isAdmin: adminStatus,
      }));

      setCurrentView(adminStatus ? 'admin' : 'main');
    } catch (err) {
      console.error('Ошибка получения данных:', err);
      setError('Ошибка получения данных пользователя');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleVKLogin = async () => {
    try {
      setIsAuthLoading(true);
      setError('');
      const authData = await vkLogin();
      await handleVKAuthSuccess(authData.userId);
    } catch (err) {
      console.error('Ошибка авторизации:', err);
      setError(err.message || 'Ошибка при авторизации');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleManualLogin = async () => {
    try {
      setIsAuthLoading(true);
      setError('');
      const authData = await manualVKLogin();
      await handleVKAuthSuccess(authData.userId);
    } catch (err) {
      console.error('Ошибка авторизации:', err);
      setError(err.message || 'Ошибка при авторизации');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      setIsAuthLoading(true);
      await vkLogout();
      setCurrentUser(null);
      setUserInfo(null);
      setIsAdmin(false);
      setCurrentView('login');
      if (unsubscribe) unsubscribe();
    } catch (err) {
      console.error('Ошибка выхода:', err);
      setError('Ошибка при выходе');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const createTicket = async () => {
    if (!formData.type) {
      alert('Выберите тип заявки');
      return;
    }

    if (formData.type === 'maintenance') {
      if (!formData.category || !formData.problem) {
        alert('Заполните все поля');
        return;
      }
      if (formData.category === 'printer' && !formData.printerName) {
        alert('Укажите название принтера');
        return;
      }
    } else {
      if (!formData.requirements || !formData.location || !formData.date || !formData.time) {
        alert('Заполните все поля');
        return;
      }
    }

    const newTicket = {
      id: Math.floor(Math.random() * 100000),
      type: formData.type === 'maintenance' ? 'Тех обслуживание' : 'Тех сопровождение',
      category: formData.category,
      problem: formData.problem,
      printerName: formData.printerName,
      requirements: formData.requirements,
      location: formData.location,
      date: formData.date,
      time: formData.time,
      author: userInfo ? `${userInfo.first_name} ${userInfo.last_name}` : 'Неизвестный',
      authorId: currentUser,
      authorAvatar: userInfo?.photo_100,
      status: 'В ожидании',
      priority: 'Средний',
      createdAt: new Date().toLocaleString('ru-RU'),
      completedAt: '',
      timestamp: new Date().getTime(),
    };

    try {
      // Сохранить в Firebase
      await createTicketInDB(newTicket);
      
      setFormData({
        type: '',
        category: '',
        problem: '',
        printerName: '',
        requirements: '',
        location: '',
        date: '',
        time: '',
      });
      setCurrentView('main');
      alert('Заявка успешно создана! Номер: ' + newTicket.id);
    } catch (err) {
      console.error('Ошибка создания заявки:', err);
      alert('Ошибка при создании заявки');
    }
  };

  const updateTicket = async (dbId, updates) => {
    try {
      await updateTicketInDB(dbId, updates);
      
      // Обновить локально
      setTickets(tickets.map(ticket =>
        ticket.dbId === dbId
          ? {
              ...ticket,
              ...updates,
              completedAt: updates.status === 'Выполнена' ? new Date().toLocaleString('ru-RU') : ticket.completedAt,
            }
          : ticket
      ));

      // Обновить выбранную заявку
      if (selectedTicket && selectedTicket.dbId === dbId) {
        setSelectedTicket({
          ...selectedTicket,
          ...updates,
        });
      }
    } catch (err) {
      console.error('Ошибка обновления заявки:', err);
      alert('Ошибка при обновлении заявки');
    }
  };

  const getFilteredTickets = () => {
    let filtered = tickets;

    if (adminFilters.searchQuery) {
      const query = adminFilters.searchQuery.toLowerCase();
      filtered = filtered.filter(t =>
        t.id.toString().includes(query) ||
        t.type.toLowerCase().includes(query) ||
        t.author.toLowerCase().includes(query)
      );
    }

    if (adminFilters.type) {
      filtered = filtered.filter(t => t.type === adminFilters.type);
    }

    if (adminFilters.status) {
      filtered = filtered.filter(t => t.status === adminFilters.status);
    }

    if (adminFilters.priority) {
      filtered = filtered.filter(t => t.priority === adminFilters.priority);
    }

    if (activeTab === 'waiting') {
      filtered = filtered.filter(t => t.status === 'В ожидании');
    } else if (activeTab === 'working') {
      filtered = filtered.filter(t => t.status === 'В работе');
    } else if (activeTab === 'completed') {
      filtered = filtered.filter(t => t.status === 'Выполнена');
    }

    return filtered;
  };

  const getStats = () => {
    return {
      total: tickets.length,
      waiting: tickets.filter(t => t.status === 'В ожидании').length,
      working: tickets.filter(t => t.status === 'В работе').length,
      completed: tickets.filter(t => t.status === 'Выполнена').length,
    };
  };

  const stats = getStats();
  const filteredTickets = getFilteredTickets();

  // ЭКРАН ЗАГРУЗКИ
  if (isLoading) {
    return (
      <div className="app loading-screen">
        <div className="loader">
          <div className="spinner"></div>
          <p>Загрузка приложения...</p>
        </div>
      </div>
    );
  }

  // ЭКРАН ВХОДА
  if (!currentUser) {
    return (
      <div className="app login-page">
        <div className="login-container">
          <div className="login-box">
            <h1>📋 Система управления заявками</h1>
            <p>Вход через ВКонтакте</p>
            
            {error && <div className="error-message">{error}</div>}
            
            <button 
              className="vk-login-btn" 
              onClick={handleVKLogin}
              disabled={isAuthLoading}
            >
              {isAuthLoading ? '⏳ Загрузка...' : '🔗 Вход через ВКонтакте'}
            </button>

            <button 
              className="manual-login-btn" 
              onClick={handleManualLogin}
              disabled={isAuthLoading}
            >
              {isAuthLoading ? '⏳ Загрузка...' : '📝 Ввести VK ID вручную'}
            </button>

            <div className="login-info">
              <p>Для разработки используйте кнопку "Ввести VK ID вручную"</p>
              <p style={{ fontSize: '12px', marginTop: '10px', color: '#999' }}>
                Администраторы должны добавить свой VK ID в массив ADMIN_VK_IDS в файле vkAuth.js
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ГЛАВНЫЙ ЭКРАН
  if (!isAdmin && currentView === 'main') {
    return (
      <div className="app">
        <header className="header">
          <h1>📋 Система управления заявками</h1>
          <div className="user-info">
            {userInfo && (
              <>
                <img src={userInfo.photo_100} alt="avatar" className="user-avatar" />
                <span>{userInfo.first_name} {userInfo.last_name}</span>
              </>
            )}
            <button className="logout-btn" onClick={handleLogout}>Выход</button>
          </div>
        </header>

        <div className="main-content">
          <div className="ticket-blocks">
            <div
              className="ticket-block maintenance"
              onClick={() => {
                setFormData({ ...formData, type: 'maintenance' });
                setCurrentView('form');
              }}
            >
              <h2>🔧</h2>
              <p>Тех обслуживание</p>
            </div>
            <div
              className="ticket-block support"
              onClick={() => {
                setFormData({ ...formData, type: 'support' });
                setCurrentView('form');
              }}
            >
              <h2>👥</h2>
              <p>Тех сопровождение</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ФОРМА ЗАЯВКИ
  if (!isAdmin && currentView === 'form') {
    return (
      <div className="app">
        <header className="header">
          <button className="back-btn" onClick={() => {
            setCurrentView('main');
            setFormData({ type: '', category: '', problem: '', printerName: '', requirements: '', location: '', date: '', time: '' });
          }}>← Назад</button>
          <h1>Новая заявка</h1>
        </header>

        <div className="form-container">
          {formData.type === 'maintenance' ? (
            <div className="form">
              <label>Тип проблемы:</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              >
                <option value="">Выберите...</option>
                <option value="pc">Проблемы с ПК</option>
                <option value="printer">Проблемы с принтером</option>
              </select>

              {formData.category === 'printer' && (
                <>
                  <label>Название принтера:</label>
                  <input
                    type="text"
                    placeholder="Введите название принтера"
                    value={formData.printerName}
                    onChange={(e) => setFormData({ ...formData, printerName: e.target.value })}
                  />
                </>
              )}

              <label>Описание проблемы:</label>
              <textarea
                placeholder="Подробно опишите проблему"
                value={formData.problem}
                onChange={(e) => setFormData({ ...formData, problem: e.target.value })}
                rows="5"
              />

              <button className="submit-btn" onClick={createTicket}>Отправить заявку</button>
            </div>
          ) : (
            <div className="form">
              <label>Требования к сопровождению:</label>
              <textarea
                placeholder="Опишите требования"
                value={formData.requirements}
                onChange={(e) => setFormData({ ...formData, requirements: e.target.value })}
                rows="3"
              />

              <label>Место проведения:</label>
              <input
                type="text"
                placeholder="Укажите место"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              />

              <label>Дата:</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              />

              <label>Время:</label>
              <input
                type="time"
                value={formData.time}
                onChange={(e) => setFormData({ ...formData, time: e.target.value })}
              />

              <button className="submit-btn" onClick={createTicket}>Отправить заявку</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // АДМИН ПАНЕЛЬ
  if (isAdmin) {
    return (
      <div className="app">
        <header className="header">
          <h1>👨‍💼 Админ панель</h1>
          <div className="user-info">
            {userInfo && (
              <>
                <img src={userInfo.photo_100} alt="avatar" className="user-avatar" />
                <span>{userInfo.first_name} {userInfo.last_name}</span>
              </>
            )}
            <button className="logout-btn" onClick={handleLogout}>Выход</button>
          </div>
        </header>

        {selectedTicket ? (
          <div className="ticket-detail">
            <button className="back-btn" onClick={() => setSelectedTicket(null)}>← Назад</button>
            <div className="ticket-info">
              <h2>Заявка №{selectedTicket.id}</h2>
              <div className="user-card">
                {selectedTicket.authorAvatar && (
                  <img src={selectedTicket.authorAvatar} alt="user" className="small-avatar" />
                )}
                <p><strong>От:</strong> {selectedTicket.author}</p>
              </div>
              <p><strong>Тип:</strong> {selectedTicket.type}</p>
              <p><strong>Статус:</strong> {selectedTicket.status}</p>
              <p><strong>Приоритет:</strong> {selectedTicket.priority}</p>
              <p><strong>Дата создания:</strong> {selectedTicket.createdAt}</p>
              {selectedTicket.completedAt && <p><strong>Дата выполнения:</strong> {selectedTicket.completedAt}</p>}
              
              {selectedTicket.type === 'Тех обслуживание' ? (
                <>
                  <p><strong>Категория:</strong> {selectedTicket.category === 'pc' ? 'Проблемы с ПК' : 'Проблемы с принтером'}</p>
                  {selectedTicket.printerName && <p><strong>Принтер:</strong> {selectedTicket.printerName}</p>}
                  <p><strong>Описание:</strong> {selectedTicket.problem}</p>
                </>
              ) : (
                <>
                  <p><strong>Требования:</strong> {selectedTicket.requirements}</p>
                  <p><strong>Место:</strong> {selectedTicket.location}</p>
                  <p><strong>Дата/Время:</strong> {selectedTicket.date} {selectedTicket.time}</p>
                </>
              )}

              <div className="update-section">
                <label>Изменить статус:</label>
                <select onChange={(e) => {
                  updateTicket(selectedTicket.dbId, { status: e.target.value });
                  setSelectedTicket({ ...selectedTicket, status: e.target.value });
                }}>
                  <option value={selectedTicket.status}>{selectedTicket.status}</option>
                  <option value="В ожидании">В ожидании</option>
                  <option value="В работе">В работе</option>
                  <option value="Выполнена">Выполнена</option>
                </select>

                <label>Изменить приоритет:</label>
                <select onChange={(e) => {
                  updateTicket(selectedTicket.dbId, { priority: e.target.value });
                  setSelectedTicket({ ...selectedTicket, priority: e.target.value });
                }}>
                  <option value={selectedTicket.priority}>{selectedTicket.priority}</option>
                  <option value="Низкий">Низкий</option>
                  <option value="Средний">Средний</option>
                  <option value="Высокий">Высокий</option>
                </select>
              </div>
            </div>
          </div>
        ) : (
          <div className="admin-panel">
            <div className="stats">
              <div className="stat-block">
                <h3>{stats.total}</h3>
                <p>Всего заявок</p>
              </div>
              <div className="stat-block">
                <h3>{stats.waiting}</h3>
                <p>В ожидании</p>
              </div>
              <div className="stat-block">
                <h3>{stats.working}</h3>
                <p>В работе</p>
              </div>
              <div className="stat-block">
                <h3>{stats.completed}</h3>
                <p>Выполненные</p>
              </div>
            </div>

            <div className="filters">
              <input
                type="text"
                placeholder="Поиск по номеру или виду заявки"
                value={adminFilters.searchQuery}
                onChange={(e) => setAdminFilters({ ...adminFilters, searchQuery: e.target.value })}
              />
              <select
                value={adminFilters.status}
                onChange={(e) => setAdminFilters({ ...adminFilters, status: e.target.value })}
              >
                <option value="">Все статусы</option>
                <option value="В ожидании">В ожидании</option>
                <option value="В работе">В работе</option>
                <option value="Выполнена">Выполнена</option>
              </select>
              <select
                value={adminFilters.priority}
                onChange={(e) => setAdminFilters({ ...adminFilters, priority: e.target.value })}
              >
                <option value="">Все приоритеты</option>
                <option value="Низкий">Низкий</option>
                <option value="Средний">Средний</option>
                <option value="Высокий">Высокий</option>
              </select>
            </div>

            <div className="tabs">
              <button
                className={`tab ${activeTab === 'all' ? 'active' : ''}`}
                onClick={() => setActiveTab('all')}
              >
                Все заявки
              </button>
              <button
                className={`tab ${activeTab === 'waiting' ? 'active' : ''}`}
                onClick={() => setActiveTab('waiting')}
              >
                В ожидании
              </button>
              <button
                className={`tab ${activeTab === 'working' ? 'active' : ''}`}
                onClick={() => setActiveTab('working')}
              >
                В работе
              </button>
              <button
                className={`tab ${activeTab === 'completed' ? 'active' : ''}`}
                onClick={() => setActiveTab('completed')}
              >
                Выполненные
              </button>
            </div>

            <div className="tickets-list">
              <table>
                <thead>
                  <tr>
                    <th>№ Заявки</th>
                    <th>От кого</th>
                    <th>Вид</th>
                    <th>Статус</th>
                    <th>Приоритет</th>
                    <th>Дата создания</th>
                    <th>Дата выполнения</th>
                    <th>Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.length > 0 ? (
                    filteredTickets.map(ticket => (
                      <tr key={ticket.dbId}>
                        <td>{ticket.id}</td>
                        <td>
                          <div className="ticket-user">
                            {ticket.authorAvatar && <img src={ticket.authorAvatar} alt="user" />}
                            <span>{ticket.author}</span>
                          </div>
                        </td>
                        <td>{ticket.type}</td>
                        <td><span className={`status ${ticket.status.toLowerCase()}`}>{ticket.status}</span></td>
                        <td><span className={`priority ${ticket.priority.toLowerCase()}`}>{ticket.priority}</span></td>
                        <td>{ticket.createdAt}</td>
                        <td>{ticket.completedAt || '-'}</td>
                        <td>
                          <button
                            className="view-btn"
                            onClick={() => setSelectedTicket(ticket)}
                          >
                            Просмотр
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '20px' }}>Заявок не найдено</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}