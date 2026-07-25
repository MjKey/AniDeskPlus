<div align="center">

<img src="https://raw.githubusercontent.com/MjKey/AniDeskPlus/refs/heads/main/icon/Logo.png" width="128" alt="AniDesk Plus Logo" />

# AniDesk Plus

[![Version](https://img.shields.io/github/v/release/MjKey/AniDeskPlus?color=blue&label=version)](https://github.com/MjKey/AniDeskPlus/releases)
[![License: GPL-2.0](https://img.shields.io/badge/License-GPL--2.0-yellow.svg)](https://opensource.org/licenses/GPL-2.0)
[![Electron](https://img.shields.io/badge/Electron-43.x-47848F.svg)](https://www.electronjs.org/)
[![Svelte](https://img.shields.io/badge/Svelte-5.x-FF3E00.svg)](https://svelte.dev/)

**AniDesk Plus** — форк десктопного клиента AniDesk для сервиса Anixart с расширенным функционалом.

</div>

---

## Возможности AniDesk Plus

- **Скачивание серий** — прямое скачивание эпизодов в выбранном качестве (1080p, 720p, 480p) для плееров Kodik, AniLibria и Sibnet.
- **Интеграция с Shikimori** — авторизация OAuth2, GraphQL API, синхронизация статусов просмотра и прогресса серий, выбор доменов и автообновление просроченных токенов.
- **Пропуск опенингов и эндингов** — визуальное выделение сегментов OP/ED на таймлайне плеера (AniSkip, AniLibria, Kodik) и настраиваемый автопропуск.
- **Сохранение прогресса** — запоминание точного времени остановки и отображение полосы прогресса в списке серий.
- **Приоритетные озвучки** — выбор предпочитаемой озвучки для каждого аниме с фильтрацией системных уведомлений.
- **Фоновый режим** — сворачивание в системный трей Windows и фоновая проверка выходящих серий.
- **Приватность** — полное удаление сторонних трекеров и аналитики.

---

## Сравнение с базовым AniDesk

| Функция | AniDesk | AniDesk Plus |
| :--- | :---: | :---: |
| Скачивание серий | Нет | Да (MP4/MKV) |
| Интеграция с Shikimori | Нет | Да (OAuth2 / GraphQL) |
| Выделение OP/ED на таймлайне | Нет | Да (AniSkip / Kodik) |
| Запоминание позиции просмотра | Нет | Да |
| Приоритетные озвучки | Нет | Да |
| Сворачивание в системный трей | Нет | Да |
| Автообновление | Базовое | Squirrel.Windows |
| Аналитика Aptabase | Да | Удалена |

---

## Установка и запуск

### Готовые сборки
Скачайте установочный файл `.exe` на странице [Releases](https://github.com/MjKey/AniDeskPlus/releases).

### Сборка из исходного кода

Требуются Node.js (v18+) и Git.

```bash
git clone https://github.com/MjKey/AniDeskPlus.git
cd AniDeskPlus
npm install
npm run dev
```

Для создания дистрибутива:

```bash
npm run buildAndMake
```

---

## Лицензия

Проект распространяется под лицензией **GPL-2.0**. Подробности см. в файле [LICENSE](LICENSE).

Отказ от ответственности: AniDesk Plus является неофициальным десктопным клиентом. Все права на контент и товарные знаки принадлежат их владельцам.
