/* BoardV interface language. The page is written in Russian; for English every visible text node and
   the title / placeholder / aria-label attributes are translated in place, phrase by phrase, and restored
   when switching back. Longer phrases win over the words inside them. */
var I18N = (function () {
  'use strict';
  var EN = {
    // ---- toolbar, panels
    'Открыть файлы': 'Open files', 'Открыть файл': 'Open file', 'Открыть': 'Open', 'Сторона платы': 'Board side',
    'Верх': 'Top', 'Низ': 'Bottom', 'Обе': 'Both', 'Повернуть на 90° (R)': 'Rotate 90° (R)', 'Вписать плату': 'Fit board',
    'Показать или скрыть BOM справа': 'Show or hide the BOM on the right', 'Настройки': 'Settings', 'Закрыть настройки': 'Close settings',
    'Закрыть (Esc)': 'Close (Esc)', 'Закрыть BOM': 'Close BOM', 'Закрыть': 'Close', 'Оформление': 'Appearance',
    'Сейчас Ночь. Нажмите, чтобы включить День': 'Night mode. Click for Day', 'Сейчас День. Нажмите, чтобы включить Ночь': 'Day mode. Click for Night',
    'Панели: поиск, BOM, настройки': 'Panels: search, BOM, settings', 'Панели': 'Panels', 'Скрыть панель': 'Hide panel', 'Инспектор': 'Inspector', 'Плата': 'Board',
    'Ширина левой панели': 'Left panel width', 'Ширина правой панели': 'Right panel width', 'Потяните, чтобы изменить ширину. Двойной клик — по умолчанию': 'Drag to resize. Double-click to reset',
    'BOM и настройки': 'BOM and settings', 'Поиск по деталям, цепям и номиналам': 'Search parts, nets and values', 'Результаты': 'Results',
    'Детали': 'Parts', 'Цепи': 'Nets', 'Поиск': 'Search', 'Копировать CSV': 'Copy CSV', 'Фильтр: 100n, 0402, LM…': 'Filter: 100n, 0402, LM…', 'Фильтр BOM': 'BOM filter',
    'Номинал': 'Value', 'Корпус': 'Package', 'Шт': 'Qty', 'Обозначения': 'Designators', 'Описание': 'Description',
    'поз.': 'items', 'шт.': 'pcs', 'позиций': 'items', 'Файл не открыт': 'No file open',
    // ---- empty field, drop, errors
    'Закинь поддерживаемый файл': 'Drop a supported file', 'Перетащи файл в окно или нажми, чтобы выбрать': 'Drag a file into the window or click to choose',
    'Нажми, чтобы выбрать файл': 'Tap to choose a file', 'Открыть файл платы': 'Open a board file', 'Отпустите файл, чтобы открыть': 'Release to open the file',
    'Файл не поддерживается': 'File not supported', 'Отправьте файл в одном из форматов:': 'Use a file in one of these formats:', 'Не удалось открыть файл': 'Could not open the file',
    'Файл пустой': 'The file is empty', 'Сначала откройте плату': 'Open a board first', 'это только номиналы. Добавьте их после файла платы.': 'these are only values. Add them after the board file.',
    'Не удалось загрузить настройки': 'Could not load the settings', 'нужен файл, выгруженный из BoardV': 'use a file exported from BoardV',
    // ---- board card
    'Деталей': 'Parts', 'Пинов': 'Pins', 'Цепей': 'Nets', 'Размер': 'Size', 'Номиналы': 'Values', 'мм': 'mm', 'снизу': 'bottom', 'сверху': 'top', 'из': 'of',
    'Номиналов в файле нет. Добавьте BOM или файл расстановки (CSV) — перетащите его сюда или откройте вместе с платой.': 'The file has no values. Add a BOM or a pick-and-place file (CSV): drop it here or open it together with the board.',
    'сигнал': 'signal', 'выбранная цепь': 'selected net', 'питание': 'power', 'земля': 'ground', 'N/C — не подключён': 'N/C — not connected',
    'ЛКМ': 'LMB', 'выбор пин/компонент': 'select pin / part', 'Пробел': 'Space',
    'Деталь': 'Part', 'Цепь': 'Net', 'Позиция BOM': 'BOM line', 'Позиция': 'Line', 'верх': 'top', 'низ': 'bottom', 'выводной': 'through-hole', 'пин.': 'pins',
    'В формате .brd нет номеров пинов, они пронумерованы по порядку в файле.': 'The .brd format has no pin numbers; pins are numbered in file order.',
    'Цвет этой цепи на плате': 'Colour of this net on the board', 'Убрать': 'Remove', 'пинов на': 'pins on', 'деталях': 'parts',
    'без номинала': 'no value', '— без номинала': '— no value', 'корпус не указан': 'no package', 'Ничего не найдено': 'Nothing found', 'Ещё': 'More:', 'Уточните поиск.': 'Refine the search.',
    'Номиналов нет, позиции сгруппированы только по корпусу.': 'No values; lines are grouped by package only.',
    'Сторона': 'Side', 'низ (зеркально)': 'bottom (mirrored)', 'обе': 'both', 'Поворот': 'Rotation',
    'BOM скопирован. Вставьте в Excel или Google Таблицы.': 'BOM copied. Paste it into Excel or Google Sheets.', 'Браузер не дал скопировать': 'The browser blocked copying',
    'Номиналы добавлены для': 'Values added for', 'деталей': 'parts', 'не нашлось совпадающих позиционных обозначений': 'has no matching designators',
    'Номиналы показаны': 'Values shown', 'Номиналы скрыты': 'Values hidden', 'Номера пинов показаны': 'Pin numbers shown', 'Номера пинов скрыты': 'Pin numbers hidden',
    // ---- settings
    'Тема': 'Theme', 'Язык': 'Language', 'Свои настройки': 'Custom', 'По умолчанию': 'Default', 'Гранд': 'Grand', 'Классика': 'Classic', 'Ночь': 'Night', 'Темная': 'Dark',
    'Синяя': 'Blue', 'Красная': 'Red', 'Светлая': 'Light', 'Неон': 'Neon', 'День': 'Day',
    'Область: фон и подложка': 'Area: background and board', 'Фон окна': 'Window background', 'Подложка платы': 'Board fill', 'Градиент подложки': 'Board gradient',
    'Второй цвет градиента': 'Second gradient colour', 'Контур платы': 'Board outline', 'Толщина контура': 'Outline width', 'Свечение контура': 'Outline glow',
    'Видимость обратной стороны': 'Opposite side visibility', 'Контакты': 'Pads', 'Форма контактов': 'Pad shape', 'Круг': 'Circle', 'Скруглённый квадрат': 'Rounded square', 'Квадрат': 'Square',
    'Сигнальные': 'Signal', 'Питание': 'Power', 'Земля': 'Ground', 'Не подключённые (обводка)': 'Not connected (outline)', 'Свечение сигнальных': 'Signal glow',
    'Свечение питания': 'Power glow', 'Свечение земли': 'Ground glow', 'Компоненты': 'Parts', 'Обводка компонента': 'Part outline', 'Обводка нижних (режим «Обе»)': 'Bottom part outline (Both mode)',
    'Толщина обводки компонента': 'Part outline width', 'Скругление углов': 'Corner radius', 'Яркость обводки': 'Outline brightness', 'Заливка корпуса': 'Body fill',
    'Плотность заливки': 'Fill density', 'Обозначения (R1, U2…)': 'Designators (R1, U2…)', 'Размер подписей': 'Label size', 'Обводка подписей': 'Label outline',
    'Мягкая': 'Soft', 'Контур': 'Outline', 'Тень': 'Shadow', 'Без обводки': 'None', 'Плотность обводки подписей': 'Label outline density', 'Толщина обводки подписей': 'Label outline width',
    'Показывать номиналы': 'Show values', 'Номера пинов при приближении': 'Pin numbers when zoomed in',
    'Выделение компонентов (ЛКМ и BOM)': 'Part highlight (LMB and BOM)', 'Затемнять остальные компоненты': 'Dim other parts', 'На текущем слое': 'On the current side',
    'На противоположном слое (пунктир)': 'On the opposite side (dashed)', 'Свечение': 'Glow', '«Дыхание» свечения': 'Breathing glow', 'Бегущий пунктир': 'Marching dashes',
    'Скорость пунктира': 'Dash speed', 'Выбранная цепь': 'Selected net', 'Цвет цепи': 'Net colour', 'Затемнять остальное': 'Dim the rest', 'Цвет затемнения': 'Dim colour',
    'Свечение цепи': 'Net glow', 'Пульсация': 'Pulse', 'Скорость пульсации': 'Pulse speed', 'Расходящиеся кольца': 'Ripples',
    'Управление': 'Controls', 'Скорость масштаба колесом': 'Wheel zoom speed', 'Обратное направление колеса': 'Reverse wheel direction',
    'Вписывать плату при изменении размеров панелей': 'Fit the board when panels are resized', 'Свои цвета цепей': 'Custom net colours',
    'Имя цепи или маска:': 'Net name or mask:', 'любые символы': 'any characters', 'один. Например': 'one. For example', 'Нижнее правило главнее.': 'Lower rules win.',
    '+ Добавить правило': '+ Add rule', 'Маска цепи': 'Net mask', 'Цвет': 'Colour', 'Удалить правило': 'Delete rule', 'Сбросить группу': 'Reset group',
    'Вернуть значения этой группы из темы': 'Restore this group from the theme',
    'Горячие клавиши': 'Hotkeys', 'Клавиши работают в любой раскладке. Нажмите «+», затем нужную клавишу (можно с Ctrl, Alt, Shift). Esc — отмена.': 'Keys work in any keyboard layout. Press «+», then the key (Ctrl, Alt, Shift allowed). Esc cancels.',
    'Нажмите клавишу…': 'Press a key…', 'Клавиши по умолчанию': 'Default keys', 'Убрать': 'Remove', 'снято с': 'removed from',
    'Перевернуть плату (верх ↔ низ)': 'Flip board (top ↔ bottom)', 'Сторона: верх': 'Side: top', 'Сторона: низ': 'Side: bottom', 'Сторона: обе': 'Side: both',
    'Следующий слой (верх → низ → обе)': 'Next side (top → bottom → both)', 'Поворот на 90°': 'Rotate 90°', 'Сбросить выбор / закрыть настройки': 'Clear selection / close settings',
    'Приблизить': 'Zoom in', 'Отдалить': 'Zoom out', 'Показать / скрыть BOM': 'Show / hide BOM', 'Открыть / закрыть настройки': 'Open / close settings',
    'Оформление: День / Ночь': 'Appearance: Day / Night', 'Номиналы на плате вкл/выкл': 'Values on the board on/off', 'Номера пинов вкл/выкл': 'Pin numbers on/off',
    'Выгрузить настройки': 'Export settings', 'Загрузить настройки': 'Import settings', 'Сбросить всё': 'Reset all',
    'Сохранить все настройки в файл, чтобы перенести на другое устройство': 'Save all settings to a file to move them to another device',
    'Загрузить настройки из ранее выгруженного файла': 'Load settings from an exported file', 'Вернуть все настройки по умолчанию': 'Restore all default settings',
    'Настройки выгружены': 'Settings exported', 'Настройки не сохранены': 'Settings not saved', 'Настройки загружены': 'Settings imported', 'Все настройки сброшены': 'All settings reset',
    'Настройки скопированы': 'Settings copied',
    // ---- updates and version
    'Обновления': 'Updates', 'Проверять обновления при запуске': 'Check for updates at start', 'Установлена версия': 'Installed version', 'Версия': 'Version',
    'Проверяю…': 'Checking…', 'У вас последняя версия.': 'You have the latest version.', 'Есть обновление:': 'Update available:',
    'Скачать новую версию': 'Download the new version', 'Обновить': 'Update', 'Разрешите BoardV устанавливать приложения, вернитесь и нажмите «Обновить».': 'Allow BoardV to install apps, come back and tap «Update».',
    'Открыть разрешение': 'Open permission', 'Загрузка обновления…': 'Downloading update…', 'Открываю установщик…': 'Opening the installer…',
    'Подтвердите установку в окне Android.': 'Confirm the installation in the Android window.', 'Обновление загружено.': 'Update downloaded.',
    'Перезапустить и обновить': 'Restart and update', 'Не получилось:': 'Failed:', 'Проверить обновления': 'Check for updates', 'Обновление BoardV': 'BoardV update',
    'Позже': 'Later', 'нет связи с GitHub': 'no connection to GitHub', 'GitHub ответил': 'GitHub replied', 'Не удалось открыть настройки': 'Could not open settings',
    'Не удалось открыть установщик': 'Could not open the installer', 'установка не удалась': 'installation failed', 'сервер ответил': 'server replied',
    // ---- phone viewing
    'Показать на телефоне': 'Show on phone', 'Открыть с компьютера по QR': 'Open from PC via QR', 'Открыть с компьютера': 'Open from PC',
    'На телефоне в BoardV нажмите «Открыть с компьютера по QR» на стартовом экране и наведите камеру. Телефон и компьютер должны быть в одной Wi-Fi сети.': 'On the phone in BoardV tap «Open from PC via QR» on the start screen and point the camera. The phone and the PC must be on the same Wi-Fi network.',
    'Подготовка…': 'Preparing…', 'Разрешить': 'Allow', 'Отклонить': 'Decline', 'Отмена': 'Cancel',
    'Файл не передаётся. Телефон получает зашифрованную копию платы только для просмотра, держит её лишь в памяти и не может сохранить. Код одноразовый и действует 10 минут.': 'The file is not sent. The phone gets an encrypted, view-only copy of the board, keeps it in memory only and cannot save it. The code works once, for 10 minutes.',
    'Компьютер не подключён к сети. Подключите Wi-Fi или кабель к роутеру.': 'This PC is not on a network. Connect Wi-Fi or a cable to the router.',
    'Ожидание телефона…': 'Waiting for the phone…', 'Телефон': 'Phone', 'просит доступ к плате': 'asks for access to the board',
    'Плата отправлена на телефон. Код больше не действует.': 'The board was sent to the phone. The code no longer works.',
    'Время вышло. Закройте окно и покажите новый код.': 'Time is up. Close this window and show a new code.', 'Отправляю…': 'Sending…', 'Отклонено. Ожидание телефона…': 'Declined. Waiting for the phone…',
    'Наведите камеру на QR-код в окне BoardV на компьютере': 'Point the camera at the QR code in BoardV on the PC', 'Нет доступа к камере. Разрешите BoardV использовать камеру.': 'No camera access. Allow BoardV to use the camera.',
    'Это не код BoardV': 'This is not a BoardV code', 'Подключение… Подтвердите доступ на компьютере': 'Connecting… Confirm access on the PC',
    'Компьютер отклонил подключение': 'The PC declined the connection', 'Компьютер не ответил': 'The PC did not answer', 'Код устарел. Покажите на компьютере новый': 'The code has expired. Show a new one on the PC',
    'Не удалось расшифровать плату. Покажите новый код': 'Could not decrypt the board. Show a new code', 'Нет связи с компьютером. Телефон и компьютер должны быть в одной Wi-Fi сети': 'Cannot reach the PC. The phone and the PC must be on the same Wi-Fi network',
    'с компьютера': 'from PC', 'плата': 'board', 'Плата с компьютера: только просмотр': 'Board from PC: view only', 'из файла платы': 'from the board file',
    'Телефон и компьютер в одной Wi-Fi сети (не гостевой)': 'The phone and the PC are on the same Wi-Fi network (not a guest one)',
    'На телефоне выключен VPN или в нём разрешена локальная сеть': 'VPN on the phone is off, or it allows the local network',
    'В брандмауэре Windows BoardV разрешён для частной сети': 'BoardV is allowed in Windows Firewall for private networks',
    'Сканировать снова': 'Scan again', 'Нет доступа к камере': 'No camera access', 'Разрешите BoardV использовать камеру в настройках Android и попробуйте снова.': 'Allow BoardV to use the camera in Android settings and try again.',
    'Разные версии BoardV': 'Different BoardV versions', 'Обновите BoardV на компьютере и на телефоне до одной версии.': 'Update BoardV on the PC and on the phone to the same version.',
    'Отсканируйте QR-код из окна «Показать на телефоне».': 'Scan the QR code from the «Show on phone» window.', 'Подключение к компьютеру': 'Connecting to the PC',
    'Код устарел': 'The code has expired', 'Закройте окно на компьютере и покажите новый код.': 'Close the window on the PC and show a new code.',
    'Компьютер не отвечает': 'The PC does not answer', 'Телефон не может достучаться до компьютера': 'The phone cannot reach the PC',
    'Подтвердите на компьютере': 'Confirm on the PC', 'На экране компьютера нажмите «Разрешить»': 'Press «Allow» on the PC screen', 'Нет ответа': 'No answer',
    'На компьютере никто не подтвердил доступ.': 'Nobody confirmed access on the PC.', 'Отклонено': 'Declined', 'Компьютер отклонил подключение.': 'The PC declined the connection.',
    'Получение платы': 'Receiving the board', 'Не удалось открыть плату': 'Could not open the board', 'Данные не расшифровались. Покажите на компьютере новый код.': 'The data could not be decrypted. Show a new code on the PC.',
    'Адрес компьютера:': 'PC address:',
    'Сканирование компонентов': 'Scanning parts', 'Сканировать компонент': 'Scan a part', 'Закрыть проект': 'Close project', 'Связь с ПК разорвана': 'The PC closed the link', 'просит подключиться как сканер': 'asks to connect as a scanner', 'Передать плату на телефон': 'Send the board to the phone', 'Подключить телефон-сканер': 'Connect a phone scanner', 'Телефон-сканер подключён': 'Phone scanner connected',
    'Откройте на телефоне в BoardV скрытую кнопку с компьютером и наведите камеру на код. Телефон и компьютер должны быть в одной Wi-Fi сети.': 'Open the hidden button with a computer in BoardV on the phone and point the camera at the code. The phone and the PC must be on the same Wi-Fi network.',
    'На телефоне в BoardV нажмите значок сканера справа сверху и наведите камеру на код. Телефон и компьютер должны быть в одной Wi-Fi сети.': 'On the phone in BoardV tap the scanner icon at the top right and point the camera at the code. The phone and the PC must be on the same Wi-Fi network.',
    'Открыть плату с компьютера': 'Open a board from the PC', 'С компьютера': 'From PC', 'Сканер для компьютера': 'Scanner for the PC', 'Подключиться к компьютеру': 'Connect to the PC',
    'Наведите камеру на QR-код из окна «Подключить телефон-сканер» на компьютере': 'Point the camera at the QR code in the «Connect a phone scanner» window on the PC',
    'Не тот код': 'Wrong code', 'На компьютере нажмите значок телефона сверху — «Подключить телефон-сканер» — и наведите камеру на этот код.': 'On the PC click the phone icon at the top («Connect a phone scanner») and point the camera at that code.',
    'Этот код подключает телефон как сканер. Нажмите значок сканера справа сверху.': 'This code connects the phone as a scanner. Tap the scanner icon at the top right.',
    'Подключено к компьютеру как сканер': 'Connected to the PC as a scanner', 'Отключиться от ПК': 'Disconnect from PC', 'Отключено от компьютера': 'Disconnected from the PC',
    'Проверяю на компьютере…': 'Checking on the PC…', 'Отправлено на компьютер': 'Sent to the PC', 'Нет в BOM на компьютере': 'Not in the PC BOM', 'Телефон успешно подключён': 'Phone connected', 'Телефон отсоединён': 'Phone disconnected', 'Подключить снова': 'Connect again', 'Код устарел': 'The code expired', 'Телефон не на связи…': 'The phone is not responding…', 'Последние версии BoardV': 'Latest BoardV releases', 'Telegram — вопросы и идеи': 'Telegram — questions and ideas',
    'Выгрузить BOM': 'Export BOM', 'Таблица Excel: фактическое наименование (что отсканировано), номинал, корпус, количество': 'Excel table: actual part (what was scanned), value, package, quantity',
    'Ошибочный компонент — снять отметку': 'Wrong part — remove the mark', 'Подходит — отметить зелёным': 'It fits — mark green', 'Отметить как найденный': 'Mark as found',
    'Подходит частично:': 'Fits partly:', 'Отмечен жёлтым — заменится, если найдётся подходящий.': 'Marked yellow — replaced when a matching one is scanned.',
    'BOM выгружен:': 'BOM exported:', 'отметка снята —': 'mark removed —', 'подтверждено —': 'confirmed —',
    'Фактическое наименование': 'Actual part', 'Номинал / комментарий': 'Value / comment', 'Количество': 'Quantity', 'Обозначения': 'Designators', 'Примечание': 'Note', 'Описание': 'Description',
    'а нужен': 'needed', 'Отсканирован': 'Scanned',
    'Телефон подключён. Сканируйте компоненты телефоном — найденные отметятся в BOM.': 'The phone is connected. Scan parts with the phone and the ones found are checked in the BOM.',
    'Телефон не на связи. Он вернётся сам, когда BoardV на телефоне снова откроется в той же сети.': 'The phone is not responding. It comes back by itself when BoardV is open on the phone again on the same network.',
    'Телефон не на связи': 'The phone is not responding', 'Телефон снова на связи': 'The phone is back', 'Телефон отключился.': 'The phone disconnected.', 'Телефон отключился': 'The phone disconnected', 'Связь с телефоном потеряна': 'Lost the phone', 'Компьютер не отвечает — связь закрыта': 'The PC does not answer, the link is closed',
    'Отключить телефон': 'Disconnect the phone', 'Скрыть': 'Hide', 'Телефон подключён — сканы появляются в BOM': 'Phone connected: scans show up in the BOM', 'Компьютер отключил телефон': 'The PC disconnected the phone',
    'нет в BOM': 'not in the BOM', 'номинал совпадает, но': 'value matches, but', 'Отсканировано': 'Scanned',
    'Недавние': 'Recent', 'Палитра': 'Palette', 'Готово': 'Done', 'Код цвета': 'Colour code', 'Было / стало': 'Before / after',
    'Это .brd из Cadence Allegro': 'This is a Cadence Allegro .brd', 'Это закрытый двоичный формат самой САПР, а не boardview. Выгрузите из Allegro файл GenCAD (.cad) или IPC-D-356 — их BoardV откроет.': 'It is the closed binary format of the CAD tool itself, not a boardview. Export GenCAD (.cad) or IPC-D-356 from Allegro and BoardV will open it.',
    'Файл ASUS .fz зашифрован ключом производителя': 'ASUS .fz files are encrypted with the maker key', 'Без ключа ASUS его не прочитать. Попросите файл в формате .brd, .bdv или .bvr.': 'It cannot be read without the ASUS key. Ask for the file as .brd, .bdv or .bvr.',
    'Файл XZZ (.pcb) зашифрован ключом программы XZZ': 'XZZ (.pcb) files are encrypted with the XZZ key', 'Ключа в открытом доступе нет, поэтому такие файлы не открываются. Попросите файл в другом формате.': 'The key is not public, so these files cannot be opened. Ask for the file in another format.',
    'Файл .cae зашифрован ключом производителя': '.cae files are encrypted with the maker key', 'Без ключа его не прочитать. Попросите файл в другом формате.': 'It cannot be read without the key. Ask for the file in another format.', 'Закрыть открытую плату': 'Close the open board', 'Поиск и BOM': 'Search and BOM', 'Наведите камеру на QR или DataMatrix на катушке или пакете компонента': 'Point the camera at the QR or DataMatrix code on the reel or bag',
    'Сканировать QR компонента': 'Scan a part QR code', 'Есть в BOM:': 'In the BOM:', 'Нет в BOM этой платы': 'Not in this board BOM', 'Отсканирован': 'Scanned',
    'Номинал совпадает, но': 'Value matches, but', 'а нужен': 'needed', 'а нужно': 'needed', 'корпус': 'package', 'напряжение': 'voltage', 'диэлектрик': 'dielectric', 'допуск': 'tolerance',
    'мкФ': 'µF', 'нФ': 'nF', 'пФ': 'pF', 'МОм': 'MΩ', 'кОм': 'kΩ', 'Ом': 'Ω',
    // ---- file parsing messages (core.js / pcbdoc.js)
    'компонентов': 'parts', 'падов': 'pads', 'цепей': 'nets', 'номиналы у': 'values for', 'пинов': 'pins', 'точек': 'points', 'отрезков, контур': 'segments, outline',
    'В .PcbDoc не найдены потоки компонентов и падов. Это точно файл платы Altium (а не библиотека .PcbLib)?': 'No parts or pads found in the .PcbDoc. Is it an Altium board file (not a .PcbLib library)?',
    'В .brd не нашлось деталей или пинов': 'No parts or pins found in the .brd', 'В .bvr не нашлось деталей': 'No parts found in the .bvr',
    'Это не файл конвертера': 'Not a converter file', 'Повреждённый .zip': 'Damaged .zip', 'счётчики не совпадают': 'counters do not match', 'строка': 'line',
    'Нет ни одной детали с координатами. Нужен файл платы: .PcbDoc (или PCB ASCII / IPC-D-356A).': 'No parts with coordinates. A board file is needed: .PcbDoc (or PCB ASCII / IPC-D-356A).'
  };
  var keys = Object.keys(EN).sort(function (a, b) { return b.length - a.length; });
  var CYR = /[А-Яа-яЁё]/;
  var RX = new RegExp('(?<![А-Яа-яЁё])(' + keys.map(function (k) { return k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')(?![А-Яа-яЁё])', 'g');
  function tr(s) { return s && CYR.test(s) ? s.replace(RX, function (m) { return EN[m]; }) : s; }
  var lang = 'ru', busy = false, ATTRS = ['title', 'placeholder', 'aria-label'];
  function doText(n) {
    if (lang === 'en') { var src = n.__ru != null ? n.__ru : n.nodeValue; if (!CYR.test(src)) return; var t = tr(src); if (t !== n.nodeValue) { n.__ru = src; n.nodeValue = t; } }
    else if (n.__ru != null) { n.nodeValue = n.__ru; n.__ru = null; }
  }
  function doAttrs(el) {
    ATTRS.forEach(function (a) {
      if (!el.hasAttribute || !el.hasAttribute(a)) return;
      var store = '__ru_' + a, v = el.getAttribute(a);
      if (lang === 'en') { var src = el[store] != null ? el[store] : v; if (!CYR.test(src)) return; var t = tr(src); if (t !== v) { el[store] = src; el.setAttribute(a, t); } }
      else if (el[store] != null) { el.setAttribute(a, el[store]); el[store] = null; }
    });
  }
  function walk(root) {
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1 || /^(SCRIPT|STYLE|CANVAS)$/.test(root.nodeName)) return;
    doAttrs(root);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT), n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
  }
  var obs = new MutationObserver(function (list) {
    if (busy || lang !== 'en') return; busy = true;
    list.forEach(function (m) {
      if (m.type === 'childList') m.addedNodes.forEach(walk);
      else if (m.type === 'characterData') { if (m.target.__ru != null && m.target.nodeValue !== tr(m.target.__ru)) m.target.__ru = null; doText(m.target); }
      else if (m.type === 'attributes') { var s = '__ru_' + m.attributeName; if (m.target[s] != null && m.target.getAttribute(m.attributeName) !== tr(m.target[s])) m.target[s] = null; doAttrs(m.target); }
    });
    obs.takeRecords(); busy = false;
  });
  function set(l) {
    lang = l === 'en' ? 'en' : 'ru';
    document.documentElement.lang = lang;
    busy = true; walk(document.body); obs.takeRecords(); busy = false;
    obs.disconnect();
    if (lang === 'en') obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  return { set: set, get: function () { return lang; }, tr: function (s) { return lang === 'en' ? tr(s) : s; } };
})();
