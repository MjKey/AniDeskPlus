> [!WARNING]  
> Данный проект находится в стадии бета-тестирования. Это не полноценный релиз, возможны баги и нестабильная работа. Структура проекта может меняться.

<div align="center">

![anidesk-transparent](https://raw.githubusercontent.com/MjKey/AniDeskPlus/refs/heads/main/icon/Logo.png)

# AniDeskPlus
**AniDeskPlus** — это форк неофициального десктоп-клиента **AniDesk** (для мобильного приложения **Anixart**) с открытым исходным кодом, расширяющий базовые возможности плеера и клиента.

> ℹ️ Данный репозиторий является форком [официального проекта AniDesk](https://github.com/theDesConnet/AniDesk) от **theDesConnet**. Проект развивается отдельно и содержит дополнительные функции, правки и улучшенный функционал.

</div>

## 🔧 Возможности

- 🔐 Использование вашего аккаунта Anixart  
- ▶️ Встроенный видеоплеер  
- 🎞️ Улучшение качества видео с помощью Anime4K  
- ✨ Дополнительные возможности и улучшения **AniDeskPlus**

## 📦 Установка

> ⚠️ Актуальные сборки доступны на странице [релизов](https://github.com/MjKey/AniDeskPlus/releases)

Архив
  - Скачайте архив с последней версией для вашей ОС.
  - Распакуйте и запустите файл `AniDeskPlus`.

Установочный файл
 - Скачайте установочный файл последней версии для вашей ОС.
 - Запустите его и дождитесь установки.

Nix / NixOS
  ```nix
  {
    inputs.anideskplus.url = "github:MjKey/AniDeskPlus";

    outputs = { nixpkgs, anideskplus, ... }: {
      nixosConfigurations.<hostname> = nixpkgs.lib.nixosSystem {
        modules = [
          anideskplus.nixosModules.default
        ];
      };
    };
  }
  ```

## 🛠️ Сборка вручную

```bash
git clone [https://github.com/MjKey/AniDeskPlus.git](https://github.com/MjKey/AniDeskPlus.git)
cd AniDeskPlus
npm install
npm run buildAndMake
```

## 💬 Обратная связь

Нашли баг или хотите предложить улучшение? Открывайте [issue](https://github.com/MjKey/AniDeskPlus/issues "issue") или создавайте pull request.

*Официальный репозиторий оригинального проекта: [theDesConnet/AniDesk](https://github.com/theDesConnet/AniDesk)*

## 📜 Лицензия

Этот проект лицензирован под **GPL-2.0**. Подробности см. в файле [LICENSE](LICENSE).
