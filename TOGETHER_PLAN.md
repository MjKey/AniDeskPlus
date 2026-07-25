# AniTogether: Полная техническая спецификация и архитектурный план (P2P Co-Watch)

Данный документ является исчерпывающим техническим руководством по реализации бессерверного совместного просмотра аниме (AniTogether) в приложении **AniDeskPlus** для ветки `together`.

Спецификация разработана с учетом архитектуры Electron 43, библиотеки Svelte 5, изоляции процессов (`contextIsolation`, `sandbox`), специфики HLS-плеера и отсутствия выделенных серверов.

---

## 1. Обзор и архитектурное разделение процессов

В AniDeskPlus строго соблюдается концепция безопасного разделения процессов Electron. Модули совместного просмотра распределены по соответствующим изолированным средам:

```
+-----------------------------------------------------------------------------------+
| MAIN PROCESS (Node.js Environment / src/main.js)                                  |
| - Регистрация кастомного протокола (app.setAsDefaultProtocolClient)               |
| - Парсинг Deep Links из process.argv и события second-instance                    |
| - LAN Discovery модуль (dgram UDP Broadcast на порту 49494)                       |
| - UPnP проброс портов на роутере (nat-upnp)                                       |
+-----------------------------------------------------------------------------------+
                                         |
                                         | IPC Channels (src/preload.js)
                                         v
+-----------------------------------------------------------------------------------+
| RENDERER PROCESS (Svelte 5 / Web APIs / src/app/)                                 |
| - WebRTC DataChannel Engine (RTCPeerConnection / low-latency P2P)                 |
| - Сигналинг через WebSocket MQTT (wss://broker.emqx.io, wss://broker.hivemq.com) |
| - SdpCompressor (сжатие SDP через pako/zlib в Base64 для оффлайн-обмена)          |
| - SyncEngine (расчет RTT, плавный подгон playbackRate 0.95x-1.05x, Loop Guard)    |
| - Svelte Stores & UI (TogetherOverlay, TogetherChat, FloatingReactions)           |
+-----------------------------------------------------------------------------------+
```

---

## 2. P2P Сетевой слой и Сигналинг (P2P Transport & Signaling Engine)

### 2.1. Конфигурация WebRTC DataChannel
Для прямого P2P обмена командами создается `RTCPeerConnection` со следующей конфигурацией:

```javascript
const peerConfiguration = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun.cloudflare.com:3478" }
    ],
    iceCandidatePoolSize: 10
};

// Создание DataChannel для синхронизации и чата
const dataChannel = peerConnection.createDataChannel("anidesk-together-sync", {
    ordered: true,        // Гарантированный порядок команд
    maxRetransmits: 5      // Ограничение повторов для низкого latency
});
```

---

### 2.2. 4-Уровневый каскад резервирования сигналинга (Failover Cascade)

Для установления P2P соединения без собственного сервера используется 4-уровневая система резервирования. Если один уровень недоступен, система автоматически переключается на следующий.

```
+-------------------------------------------------------------------------+
|                  УРОВЕНЬ 1: Multi-Broker Public Relay Pool              |
| Автоматическая ротация WebSocket MQTT брокеров / Nostr / WebTorrent     |
+-------------------------------------------------------------------------+
                                     | (таймаут 2 сек / ошибка связи)
                                     v
+-------------------------------------------------------------------------+
|                  УРОВЕНЬ 2: Direct Base64 SDP Token (Offline Mode)      |
| Ручной обмен сжатым Base64 кодом оффера/ответа через мессенджеры        |
+-------------------------------------------------------------------------+
                                     | (в локальной сети / VPN)
                                     v
+-------------------------------------------------------------------------+
|                  УРОВЕНЬ 3: LAN Auto-Discovery (Node dgram / mDNS)      |
| Локальный поиск приложений в Wi-Fi/LAN/Tailscale/ZeroTier через UDP     |
+-------------------------------------------------------------------------+
                                     | (при открытом IP или UPnP)
                                     v
+-------------------------------------------------------------------------+
|                  УРОВЕНЬ 4: Direct Socket / UPnP Port Mapping           |
| Прямое сокетное подключение к открытому порту хоста                     |
+-------------------------------------------------------------------------+
```

#### Уровень 1: Пул сигнальных брокеров (Multi-Broker Pool)
При создании или входе в комнату `SignalingAdapter` поочередно пытается подключиться к списку бесплатных брокеров:
1. `wss://broker.emqx.io:8084/mqtt`
2. `wss://broker.hivemq.com:8000/mqtt`
3. `wss://test.mosquitto.org:8081/mqtt`
4. `wss://broker.nanomq.io:8084/mqtt`

*Топик сигналов*: `anideskplus/together/room/{ROOM_CODE}/signaling`

#### Уровень 2: Ручной обмен Base64 кодом-токеном (Offline / Manual SDP Mode)
Если ни один брокер недоступен:
1. Хост нажимает «Скопировать оффлайн-код».
2. `SdpCompressor` берет SDP Offer + ICE candidates, сжимает их алгоритмом `pako.deflate` и кодирует в Base64.
3. Длина токена составляет всего **~200–250 символов** (удобно передавать через Telegram/VK/Discord).
4. Гость вставляет код $\rightarrow$ генерирует ответ `TOGETHER_ANSWER:...` $\rightarrow$ Хост вставляет ответ.
5. P2P соединение устанавливается напрямую **без единого обращения к внешним серверам**.

#### Уровень 3: Поиск в локальной сети (LAN Auto-Discovery)
В `src/main.js` запускается UDP-сокет (`dgram` порт `49494`). При создании комнаты хост вещает локальный шифрованный пакет `ANI_TOGETHER_BEACON`. Приложения в той же Wi-Fi сети или виртуальной сети (ZeroTier/Tailscale) находят комнату за <100 мс.

#### Уровень 4: UPnP / Direct Socket
Модуль `nat-upnp` в `main.js` запрашивает у роутера хоста проброс временного порта, позволяя подключиться по прямому сокету.

---

### 2.3. Решение проблемы Symmetric NAT (MQTT Data Relay Fallback)

> [!IMPORTANT]
> **Проблема**: За Symmetric NAT (мобильный 4G/5G интернет, корпоративный Wi-Fi, CGNAT провайдеров) STUN-серверы не могут получить постоянный внешний порт, из-за чего direct WebRTC сокет не поднимается (~15-25% реальных подключений).
>
> **Решение**: Так как AniTogether передает только текстовые/JSON команды управления и таймкоды (~100 байт), при переходе состояния WebRTC в `failed` система **не прерывает работу**, а бесшовно переключает канал передачи в **MQTT Data Relay Mode**.
> Все JSON-сообщения синхронизации продолжают передаваться через топик MQTT-брокера. Это дает **100% гарантию связи у всех пользователей бесплатно и без аренды TURN-серверов!**

---

## 3. Глубинное связывание и IPC в Electron (Deep Links & Process Communication)

### 3.1. Регистрация схемы `anideskplus://` (`src/main.js`)

```javascript
// 1. Регистрация кастомного протокола
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('anideskplus', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('anideskplus');
}

// 2. Парсинг Deep Link при клике во время работы (Single Instance)
app.on('second-instance', (event, commandLine) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();

    // Ищем аргумент с протоколом anideskplus://
    const deepLink = commandLine.find(arg => arg.startsWith('anideskplus://'));
    if (deepLink) {
      mainWindow.webContents.send('together:deep-link', deepLink);
    }
  }
});

// 3. Парсинг Deep Link при холодном старте приложения
const initialUrl = process.argv.find(arg => arg.startsWith('anideskplus://'));
if (initialUrl) {
  app.once('ready', () => {
    setTimeout(() => {
      mainWindow.webContents.send('together:deep-link', initialUrl);
    }, 1500);
  });
}
```

### 3.2. Мост IPC в `src/preload.js`
```javascript
contextBridge.exposeInMainWorld('togetherApi', {
    onDeepLink: (callback) => ipcRenderer.on('together:deep-link', (event, url) => callback(url)),
    startLanDiscovery: () => ipcRenderer.invoke('together:lan-start'),
    stopLanDiscovery: () => ipcRenderer.invoke('together:lan-stop')
});
```

---

## 4. Спецификация пакетов протокола (JSON Protocol Schema)

Все пакеты обернуты в единую структуру `TogetherPacket`:

```typescript
interface TogetherPacket<T> {
  version: number;        // Версия протокола (1)
  roomId: string;         // Код комнаты (например "TOG-7X9A2")
  senderId: string;       // ID отправителя (user_id Anixart)
  timestamp: number;      // UTC timestamp (ms)
  type: PacketType;       // Тип пакета
  payload: T;             // Данные сообщения
}
```

### 4.1. Реестр типов сообщений

| Тип пакета | Направление | Назначение |
| :--- | :--- | :--- |
| `ROOM_HANDSHAKE` | Guest -> Host | Запрос на присоединение к комнате |
| `ROOM_STATE` | Host -> Guest | Полный снимок состояния комнаты при входе |
| `SYNC_TELEMETRY` | Host -> Guest | Кадр телеметрии плеера (каждые 1.5 сек) |
| `PLAYER_COMMAND` | Host/Guest -> All | Мгновенные действия (`PLAY`, `PAUSE`, `SEEK`, `SKIP_INTRO`, `CHANGE_EPISODE`, `CHANGE_TRANSLATION`) |
| `BUFFER_STATUS` | Guest -> Host | Уведомление о буферизации у ведомого |
| `PING` / `PONG` | Both | Измерение задержки $RTT$ |
| `CHAT_MESSAGE` | All -> All | Текстовое сообщение в чат комнаты |
| `EMOTE_REACTION` | All -> All | Анимированная эмодзи-реакция поверх плеера |

---

### 4.2. Схемы нагрузок (Payload Schemas)

#### 1. `ROOM_STATE` (Снимок состояния при входе)
```json
{
  "type": "ROOM_STATE",
  "version": 1,
  "roomId": "TOG-7X9A2",
  "senderId": "102938",
  "timestamp": 1721932500000,
  "payload": {
    "release": { "id": 45120, "title": "Атака титанов" },
    "episode": { "id": 4, "position": 4, "title": "4 Серия" },
    "translation": { "id": 12, "title": "Anilibria" },
    "currentTime": 420.5,
    "isPaused": false,
    "hostOnlyControl": false,
    "members": [
      { "id": "102938", "name": "HostUser", "avatar": "https://...", "role": "host", "isBuffering": false },
      { "id": "504932", "name": "Friend1", "avatar": "https://...", "role": "guest", "isBuffering": false }
    ]
  }
}
```

#### 2. `PLAYER_COMMAND` (Мгновенное действие)
```json
{
  "type": "PLAYER_COMMAND",
  "version": 1,
  "roomId": "TOG-7X9A2",
  "senderId": "102938",
  "timestamp": 1721932505000,
  "payload": {
    "action": "SKIP_INTRO", // "PLAY" | "PAUSE" | "SEEK" | "SKIP_INTRO" | "CHANGE_EPISODE" | "CHANGE_TRANSLATION"
    "targetTime": 510.0,
    "episodePosition": 4,
    "translationId": 12,
    "skipDuration": 85.0
  }
}
```

#### 3. `BUFFER_STATUS` (Буферизация ведомого)
```json
{
  "type": "BUFFER_STATUS",
  "version": 1,
  "roomId": "TOG-7X9A2",
  "senderId": "504932",
  "timestamp": 1721932508000,
  "payload": {
    "isBuffering": true,
    "bufferedPercent": 34.5
  }
}
```

---

## 5. Математика синхронизации и Time Drift Engine

### 5.1. Точный расчет RTT и односторонней задержки
Каждые 10 секунд посылается парный пакет `PING` / `PONG`:
$$RTT = t_{pong\_recv} - t_{ping\_sent}$$
$$t_{delay} = \frac{RTT}{2}$$

Экспоненциальное сглаживание RTT для исключения сетевых всплесков:
$$RTT_{smooth} = 0.8 \cdot RTT_{prev} + 0.2 \cdot RTT_{new}$$

---

### 5.2. Алгоритм коррекции рассинхрона на стороне ведомого (Guest)

При получении телеметрии от Хоста рассчитывается дельта времени $\Delta t$:
$$\Delta t = (t_{host\_current} + t_{delay}) - t_{guest\_current}$$

```
                          ВЕЛИЧИНА РАССИНХРОНА (Δt)
 ----------------------------------------------------------------------->
 |   < 0.6 сек   |     0.6 сек ... 3.0 сек      |      > 3.0 сек        |
 |  Синхронно!   |  Плавный подгон скорости    |    Прямой Seek       |
 | Ничего не     | (playbackRate = 1.05/0.95)   | (currentTime = host) |
 | делаем        | Без щелчков и паузы          | Резкий прыжок        |
 ----------------------------------------------------------------------->
```

1. **Если $|\Delta t| < 0.6$ сек**: Воспроизведение идеально синхронизировано. `video.playbackRate = 1.0`.
2. **Если $0.6 \le \Delta t \le 3.0$ сек**: Плавная компенсация:
   - Если Guest отстает ($\Delta t > 0$): `video.playbackRate = 1.05`.
   - Если Guest опережает ($\Delta t < 0$): `video.playbackRate = 0.95`.
   - Как только $|\Delta t| < 0.15$ сек — возвращаем `video.playbackRate = 1.0`.
3. **Если $|\Delta t| > 3.0$ сек**: Прямой прыжок `video.currentTime = hostTime + t_delay`.

---

### 5.3. Smart Auto-Pause при буферизации
- Когда ведомый отправляет `BUFFER_STATUS { isBuffering: true }`, плеер хоста автоматически ставится на паузу и отображает плашку: `«Ожидание буферизации у [Имя Друга]...»`.
- Когда у ведомого подгружается видео (`isBuffering: false`), плеер хоста автоматически возобновляет просмотр.

---

### 5.4. Паттерн защиты от цикличных вызовов (Loop Prevention Guard)

```javascript
// SyncEngine.js
export class SyncEngine {
    constructor(videoElement) {
        this.video = videoElement;
        this.isRemoteActionExecuting = false;
    }

    applyRemoteCommand(command) {
        this.isRemoteActionExecuting = true;
        try {
            switch (command.action) {
                case 'SEEK':
                    this.video.currentTime = command.targetTime;
                    break;
                case 'PAUSE':
                    this.video.pause();
                    break;
                case 'PLAY':
                    this.video.play().catch(() => {});
                    break;
                case 'SKIP_INTRO':
                    this.video.currentTime = command.targetTime;
                    break;
            }
        } finally {
            // Сбрасываем флаг с небольшой задержкой для перекрытия асинхронных событий HTML5 video
            setTimeout(() => {
                this.isRemoteActionExecuting = false;
            }, 200);
        }
    }

    bindLocalEvents(onBroadcast) {
        this.video.addEventListener('seeked', () => {
            if (this.isRemoteActionExecuting) return; // Пропускаем эхо-событие!
            onBroadcast({ action: 'SEEK', targetTime: this.video.currentTime });
        });

        this.video.addEventListener('pause', () => {
            if (this.isRemoteActionExecuting) return;
            onBroadcast({ action: 'PAUSE', targetTime: this.video.currentTime });
        });

        this.video.addEventListener('play', () => {
            if (this.isRemoteActionExecuting) return;
            onBroadcast({ action: 'PLAY', targetTime: this.video.currentTime });
        });
    }
}
```

---

## 6. Пользовательский интерфейс и компоненты (UI / UX)

### 6.1. Дерево создаваемых компонентов

```
src/
├── app/
│   ├── utils/
│   │   └── together/
│   │       ├── P2PClient.js        # WebRTC DataChannel менеджер
│   │       ├── SignalingAdapter.js # Менеджер подключения к брокерам MQTT
│   │       ├── SdpCompressor.js    # pako/zlib сжатие SDP в Base64
│   │       ├── SyncEngine.js       # Движок синхронизации и компенсации задержек
│   │       └── Protocol.js         # Схемы и фабрика пакетов
│   ├── stores/
│   │   └── togetherStore.js        # Svelte Store управления состоянием комнаты
│   └── components/
│       └── together/
│           ├── TogetherOverlay.svelte   # Верхняя стеклянная плашка плеера (участники, пинг)
│           ├── TogetherChat.svelte      # Полупрозрачный оверлей-чат в плеере
│           ├── FloatingReactions.svelte # Анимации всплывающих эмодзи поверх видео
│           └── RoomModal.svelte         # Модальное окно создания и входа в комнату
```

---

### 6.2. Интеграция с разделами AniDeskPlus

1. **Карточки друзей (`src/app/pages/Friends.svelte`)**:
   - В карточке каждого друга добавляется кнопка **«Совместный просмотр»** с иконкой двух экранов.
   - Нажатие генерирует комнату `TOG-XXXXX` и отправляет ссылку `anideskplus://together/join?room=TOG-XXXXX` в личное сообщение или копирует в буфер.

2. **Оверлей в плеере (`src/app/pages/Player.svelte`)**:
   - В верхней части экрана размещается `TogetherOverlay.svelte`:
     - Список аватарок участников с индикатором пинга (зеленый/желтый/красный).
     - Бэйдж роли (`Хост` / `Гость`).
     - Кнопка вызова оффлайн-кода.
     - Быстрые эмодзи-реакции (`🔥`, `❤️`, `😂`, `😭`, `😮`).

---

## 7. Пошаговый план разработки (Detailed Action Plan)

### Этап 1: Main Process, IPC и Deep Links
- [ ] Добавить регистрацию схемы `anideskplus://` в `src/main.js`.
- [ ] Обновить обработчик `second-instance` для парсинга `commandLine` на Windows.
- [ ] Пробросить события Deep Link в `src/preload.js` через `contextBridge`.
- [ ] Реализовать UDP broadcast модуль локального поиска в `main.js`.

### Этап 2: Сетевое ядро P2P и Сигналинг
- [ ] Создать `src/app/utils/together/P2PClient.js` (WebRTC DataChannels).
- [ ] Создать `SignalingAdapter.js` с пулом MQTT WebSocket брокеров и ротацией.
- [ ] Создать `SdpCompressor.js` (сжатие SDP оферов через `pako` в Base64).
- [ ] Реализовать бессерверный MQTT Data Relay Fallback при сбое WebRTC.

### Этап 3: Движок синхронизации и Стор
- [ ] Создать `src/app/stores/togetherStore.js` (управление состоянием комнаты, чатом и участниками).
- [ ] Создать `SyncEngine.js` (расчет RTT, компенсация задержки, `playbackRate` $0.95x-1.05x$, Loop Prevention Guard).

### Этап 4: Пользовательский интерфейс (UI / UX)
- [ ] Разработать `TogetherOverlay.svelte` (плашка участников над плеером).
- [ ] Разработать `TogetherChat.svelte` (чат поверх видео).
- [ ] Разработать `FloatingReactions.svelte` (всплывающие эмодзи).
- [ ] Разработать `RoomModal.svelte` (модалка подключения и генерации кодов).
- [ ] Добавить кнопки вызова комнаты в `Friends.svelte`.
- [ ] Встроить `SyncEngine` и оверлей в `Player.svelte`.

### Этап 5: Сборка и финальная верификация
- [ ] Проверить сборку Windows-артефактов в GitHub Actions (`build-together.yml`).
- [ ] Провести сквозное тестирование P2P-соединения и синхронизации.

---

## 8. Матрица верификации и тестирования (Verification Matrix)

| Тест-кейс | Ожидаемый результат | Статус |
| :--- | :--- | :--- |
| **Deep Link Launch** | Клик по `anideskplus://together/join?room=TOG-7X9A2` автоматически открывает приложение и подключает к комнате | ⏳ В плане |
| **Multi-Broker Fallback** | При недоступности первого сигнального брокера происходит бесшовное переключение на второй | ⏳ В плане |
| **Symmetric NAT Relay** | При неудаче WebRTC P2P команды синхронизации передаются через MQTT Relay без разрыва связи | ⏳ В плане |
| **Offline SDP Token** | Вставка сжатого Base64 токена подсоединяет участников без участия каких-либо серверов | ⏳ В плане |
| **Seek Loop Guard** | Перемотка у Хоста меняет время у Гостя без бесконечной обратной петли | ⏳ В плане |
| **Micro Drift Correction** | Рассинхрон в $1$ сек исправляется подгоном `playbackRate = 1.05x` без скачков аудио | ⏳ В плане |
| **Skip Intro Sync** | Пропуск опенинга Хостом синхронно перематывает плеер у всех участников комнаты | ⏳ В плане |
| **Artifact Build** | Сборка ветки `together` в GitHub Actions создает готовый артефакт в инсталляторами | ✅ Готово (`build-together.yml`) |
