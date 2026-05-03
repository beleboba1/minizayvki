/* eslint-disable no-undef */

export const VK_APP_ID = 54576043;
export const ADMIN_VK_IDS = [321451736]; // Замените на реальные ID

// Простая форма для ввода VK ID
export const manualVKLogin = () => {
  return new Promise((resolve, reject) => {
    const vkId = prompt('Введите ваш VK ID (числа):\n\nНайти можно на странице профиля: vk.com/id123456789');
    
    if (!vkId || !vkId.trim()) {
      reject(new Error('VK ID не введён'));
      return;
    }

    const userId = parseInt(vkId);
    if (isNaN(userId) || userId <= 0) {
      reject(new Error('Введите корректный VK ID (только цифры)'));
      return;
    }

    const userData = {
      userId: userId,
      token: 'manual_' + Date.now(),
    };
    localStorage.setItem('vkAuth', JSON.stringify(userData));
    resolve(userData);
  });
};

// OAuth вход
export const vkLogin = () => {
  return new Promise((resolve, reject) => {
    try {
      const clientId = VK_APP_ID;
      const redirectUri = `${window.location.origin}/`;
      const scope = '0';
      
      const authUrl = `https://oauth.vk.com/authorize?client_id=${clientId}&display=page&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&response_type=token&v=5.131`;
      
      window.location.href = authUrl;
    } catch (err) {
      reject(err);
    }
  });
};

// Проверка токена в URL после редиректа
export const checkTokenInURL = () => {
  return new Promise((resolve) => {
    const hash = window.location.hash.substring(1);
    if (hash) {
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');
      const userId = params.get('user_id');

      if (accessToken && userId) {
        const userData = {
          userId: parseInt(userId),
          token: accessToken,
        };
        localStorage.setItem('vkAuth', JSON.stringify(userData));
        window.history.replaceState({}, document.title, window.location.pathname);
        resolve(userData);
        return;
      }
    }
    resolve(null);
  });
};

// Получение данных пользователя
export const getVKUserInfo = async (userId) => {
  try {
    return new Promise((resolve) => {
      const callback = 'vkApiCallback_' + Date.now();
      
      window[callback] = (response) => {
        delete window[callback];
        const script = document.querySelector(`script[data-id="${callback}"]`);
        if (script) script.remove();

        if (response.response && response.response[0]) {
          resolve(response.response[0]);
        } else {
          resolve({
            id: userId,
            first_name: 'User',
            last_name: userId,
            photo_100: 'https://vk.com/images/camera_100.png',
          });
        }
      };

      const script = document.createElement('script');
      script.src = `https://api.vk.com/method/users.get?user_ids=${userId}&fields=photo_100,first_name,last_name&callback=${callback}&v=5.131`;
      script.setAttribute('data-id', callback);
      
      script.onerror = () => {
        delete window[callback];
        script.remove();
        resolve({
          id: userId,
          first_name: 'User',
          last_name: userId,
          photo_100: 'https://vk.com/images/camera_100.png',
        });
      };
      
      document.head.appendChild(script);
    });
  } catch (err) {
    return {
      id: userId,
      first_name: 'User',
      last_name: userId,
      photo_100: 'https://vk.com/images/camera_100.png',
    };
  }
};

// Проверка авторизации
export const checkVKAuth = () => {
  return new Promise(async (resolve) => {
    // Сначала проверяем URL
    const tokenData = await checkTokenInURL();
    if (tokenData) {
      resolve({
        isAuth: true,
        userId: tokenData.userId,
        token: tokenData.token,
      });
      return;
    }

    // Потом проверяем localStorage
    const vkAuth = localStorage.getItem('vkAuth');
    if (vkAuth) {
      try {
        const authData = JSON.parse(vkAuth);
        resolve({
          isAuth: true,
          userId: authData.userId,
          token: authData.token,
        });
      } catch {
        resolve({ isAuth: false });
      }
    } else {
      resolve({ isAuth: false });
    }
  });
};

// Выход
export const vkLogout = () => {
  return new Promise((resolve) => {
    localStorage.removeItem('vkAuth');
    localStorage.removeItem('vkUser');
    resolve();
  });
};

// Проверка админа
export const isUserAdmin = (userId) => {
  return ADMIN_VK_IDS.includes(userId);
};