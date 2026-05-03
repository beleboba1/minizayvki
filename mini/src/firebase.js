import { initializeApp } from 'firebase/app';
import { getDatabase, ref, push, onValue, update } from 'firebase/database';

// ⚠️ ЗАМЕНИТЕ НА СВОИ ДАННЫЕ ИЗ FIREBASE CONSOLE
const firebaseConfig = {
  apiKey: "AIzaSyCzl0L9-yo7gAzqMEi7xiH7Or_nUblNs_M",
  authDomain: "ticket-app-b9b3a.firebaseapp.com",
  projectId: "ticket-app-b9b3a",
  storageBucket: "ticket-app-b9b3a.firebasestorage.app",
  messagingSenderId: "507478244166",
  appId: "1:507478244166:web:6542048d93f5f075d80347",
  measurementId: "G-ZF5C9CMW03"
};

// Инициализация Firebase
let app;
let database;

try {
  app = initializeApp(firebaseConfig);
  database = getDatabase(app);
  console.log('Firebase инициализи��ован успешно');
} catch (error) {
  console.error('Ошибка инициализации Firebase:', error);
}

// Создание заявки
export const createTicketInDB = async (ticket) => {
  try {
    if (!database) throw new Error('Firebase не инициализирован');
    return await push(ref(database, 'tickets'), ticket);
  } catch (error) {
    console.error('Ошибка создания заявки:', error);
    throw error;
  }
};

// Получение всех заявок в реальном времени
export const subscribeToTickets = (callback) => {
  try {
    if (!database) {
      console.error('Firebase не инициализирован');
      callback([]);
      return () => {};
    }

    const ticketsRef = ref(database, 'tickets');
    
    const unsubscribe = onValue(
      ticketsRef,
      (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const ticketsArray = Object.keys(data).map((key) => ({
            ...data[key],
            dbId: key,
          }));
          callback(ticketsArray);
        } else {
          callback([]);
        }
      },
      (error) => {
        console.error('Ошибка получения заявок:', error);
        callback([]);
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error('Ошибка подписки:', error);
    callback([]);
    return () => {};
  }
};

// Обновление заявки
export const updateTicketInDB = async (ticketDbId, updates) => {
  try {
    if (!database) throw new Error('Firebase не инициализирован');
    return await update(ref(database, `tickets/${ticketDbId}`), updates);
  } catch (error) {
    console.error('Ошибка обновления заявки:', error);
    throw error;
  }
};

// Удаление заявки
export const deleteTicketFromDB = async (ticketDbId) => {
  try {
    if (!database) throw new Error('Firebase не инициализирован');
    return await update(ref(database, `tickets/${ticketDbId}`), null);
  } catch (error) {
    console.error('Ошибка удаления заявки:', error);
    throw error;
  }
};