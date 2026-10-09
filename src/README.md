# Исходники вьювера

`www/index.html` в корне собирается отсюда — правки делаются здесь, не в `www/`.

- `viewer-ui.html` — интерфейс вьювера (вместо `/*CORE*/` подставляются `core.js` и `pcbdoc.js`)
- `core.js` — разбор форматов (.brd/.bvr/.json, Gerber, IPC-356 и т.д.)
- `pcbdoc.js` — чтение Altium .PcbDoc напрямую
- `ui.html` — страница-конвертер Altium → boardview
- `make_icons.py` — иконки приложения
- `build_apps.py` — сборка: `python3 src/build_apps.py`, затем скопировать `src/out/boardview-app-project/www/` в `www/`
- `dist/BoardV-config.js` — настройки по умолчанию
