import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      const localTime = formatTime(new Date());
      let payload = {};
      if (event.data) {
        try {
          payload = event.data.json();
        } catch {
          payload = { body: event.data.text() };
        }
      }

      const reminder = await resolveReminderNotification(localTime);

      const title = payload.title ?? reminder?.title ?? '給餌リマインダー';
      const options = {
        body: payload.body ?? reminder?.body ?? `${localTime}の給餌の時間です。`,
        data: {
          url: payload.url ?? reminder?.url ?? '/'
        },
        requireInteraction: true,
        tag: reminder?.tag ?? 'food-migration-reminder'
      };

      try {
        await self.registration.showNotification(title, options);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('showNotification failed:', message);
      }
    })()
  );
});

async function resolveReminderNotification(time) {
  const db = await openReminderDb();
  if (!db) {
    return undefined;
  }

  try {
    const reminders = await getDueReminders(db, time);
    if (reminders.length === 0) {
      return undefined;
    }

    const selected = reminders.sort((a, b) => String(a.planId).localeCompare(String(b.planId)))[0];
    const plan = await readByKey(db, 'plans', selected.planId);
    if (!plan) {
      return undefined;
    }

    const oldLabel = formatFoodLabel('旧餌', plan.oldFoodName);
    const newLabel = formatFoodLabel('新餌', plan.newFoodName);
    const feedingTimesPerDay = Number(plan.feedingTimesPerDay) > 0 ? Number(plan.feedingTimesPerDay) : 1;
    const oldAmountPerFeeding = Math.floor(Number(plan.oldFoodAmountPerDay || 0) / feedingTimesPerDay);
    const newAmountPerFeeding = Math.floor(Number(plan.newFoodAmountPerDay || 0) / feedingTimesPerDay);
    const unit = plan.unit || 'g';

    return {
      title: `給餌リマインダー(${plan.petName || 'プラン'})`,
      body: `${time}の給餌の時間です。\n${oldLabel}:${oldAmountPerFeeding}${unit}、${newLabel}:${newAmountPerFeeding}${unit}`,
      url: `/plans/${selected.planId}`,
      tag: `food-migration-reminder-${selected.planId}`
    };
  } catch {
    return undefined;
  } finally {
    db.close();
  }
}

function formatFoodLabel(base, name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return trimmed ? `${base}(${trimmed})` : base;
}

function formatTime(date) {
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${hour}:${minute}`;
}

async function getDueReminders(db, time) {
  const source =
    (await readStoreRows(db, 'reminderSettings')) ??
    (await readStoreRows(db, 'reminders')) ??
    [];

  return source
    .filter((item) => Boolean(item?.enabled) && item?.time === time && item?.planId)
    .map((item) => ({
      planId: item.planId,
      time: item.time
    }));
}

async function readStoreRows(db, storeName) {
  if (!db.objectStoreNames.contains(storeName)) {
    return undefined;
  }
  const tx = db.transaction(storeName, 'readonly');
  const request = tx.objectStore(storeName).getAll();
  return readRequest(request);
}

async function readByKey(db, storeName, key) {
  if (!db.objectStoreNames.contains(storeName)) {
    return undefined;
  }
  const tx = db.transaction(storeName, 'readonly');
  const request = tx.objectStore(storeName).get(key);
  return readRequest(request);
}

function readRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openReminderDb() {
  return new Promise((resolve) => {
    const request = indexedDB.open('pet-food-change-log-db');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(undefined);
    request.onblocked = () => resolve(undefined);
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        const existing = windowClients.find((client) => client.url.includes(targetUrl));
        if (existing) {
          return existing.focus();
        }
        return self.clients.openWindow(targetUrl);
      })
  );
});
