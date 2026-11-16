/** Консольные команды Deadlock — кураторские данные портала.
 *  Источники (проверено вручную):
 *  – Гайд «Команды легендарных предметов»: steamcommunity.com/sharedfiles/filedetails/?id=3697702292
 *  – Гайд «Deadlock Console Commands»:     steamcommunity.com/sharedfiles/filedetails/?id=3366257359
 *  Иконки легендарных предметов — из гайда, лежат локально в /public/commands (самохостинг для РФ). */

export type CommandCat = "sandbox" | "spawn" | "bots" | "region" | "hud" | "legendary";

export const CAT_LABELS: Record<CommandCat, string> = {
  sandbox: "Читы песочницы",
  spawn: "Спавн юнитов",
  bots: "Боты и карты",
  region: "Сеть и регион",
  hud: "Интерфейс и камера",
  legendary: "Легендарные предметы",
};

export interface CommandEntry {
  cmd: string;
  nameRu: string;
  nameEn?: string;
  desc: string;
  cat: CommandCat;
  img?: string;
  danger?: boolean;
}

/** Порядок категорий в интерфейсе */
export const CAT_ORDER: CommandCat[] = ["sandbox", "spawn", "bots", "region", "hud", "legendary"];

export const COMMANDS: CommandEntry[] = [
  // ---------- Читы песочницы ----------
  { cmd: "sv_cheats 1", nameRu: "Включить читы", desc: "Мастер-ключ для чит-команд. Работает в песочнице и приватных лобби; на официальных серверах матчей заблокирован.", cat: "sandbox", danger: true },
  { cmd: "citadel_hero_testing_enabled 1", nameRu: "Меню песочницы", desc: "Включает меню тестирования героев: выбор любого героя, прокачка и предметы без ограничений.", cat: "sandbox" },
  { cmd: "citadel_hero_testing_infinite_money", nameRu: "Бесконечные души", desc: "Бесконечный запас душ в режиме песочницы — покупай что угодно.", cat: "sandbox" },
  { cmd: "citadel_give_gold X", nameRu: "Выдать души", desc: "Даёт указанное количество душ. Вместо X подставь число, например citadel_give_gold 50000.", cat: "sandbox", danger: true },
  { cmd: "host_timescale X", nameRu: "Скорость игры", desc: "Меняет темп матча: 1 — обычная скорость, 2 — вдвое быстрее, 0.5 — замедление.", cat: "sandbox", danger: true },
  { cmd: "citadel_trooper_force_idle 1", nameRu: "Отключить крипов", desc: "Крифы, казармы и нейтралы перестают двигаться и атаковать — карта полностью пустая.", cat: "sandbox" },
  { cmd: "trooper_kill_all", nameRu: "Убить всех крипов", desc: "Мгновенно уничтожает всех крипов на линии (нейтралов не трогает).", cat: "sandbox" },
  { cmd: "dump_hero_names", nameRu: "Имена героев", desc: "Выводит внутренние имена всех героев — нужны для команд спавна вроде citadel_create_unit.", cat: "sandbox" },
  { cmd: "cl_ent_actornames", nameRu: "Имена объектов", desc: "Показывает служебные имена всех объектов карты прямо над ними.", cat: "sandbox" },

  // ---------- Спавн юнитов ----------
  { cmd: "citadel_create_unit <hero> <team>", nameRu: "Заспавнить героя", desc: "Создаёт героя по имени и стороне. Стороны: sapphire (синие), amber (жёлтые), neutral. Пример: citadel_create_unit dynamo sapphire.", cat: "spawn" },
  { cmd: "citadel_spawn_all_heroes_in_a_line", nameRu: "Все герои в ряд", desc: "Ставит всех героев игры в одну линию — удобно для скриншотов и сравнения моделей.", cat: "spawn" },
  { cmd: "npc_create neutral_trooper_weak", nameRu: "Нейтралы Т1", desc: "Спавнит слабых нейтральных крипов первого тира.", cat: "spawn" },
  { cmd: "npc_create neutral_trooper_strong", nameRu: "Нейтралы Т2", desc: "Спавнит сильных нейтралов второго тира.", cat: "spawn" },
  { cmd: "npc_create neutral_trooper_normal", nameRu: "Нейтралы Т3", desc: "Спавнит нейтралов третьего тира.", cat: "spawn" },
  { cmd: "ent_create citadel_item_pickup", nameRu: "Урна душ", desc: "Создаёт урну душ в точке, куда смотрит камера.", cat: "spawn" },
  { cmd: "ent_create citadel_item_pickup_rejuv", nameRu: "Кристалл омоложения", desc: "Спавнит Rejuv-кристалл — как после смерти верхнего персонажа.", cat: "spawn" },
  { cmd: "npc_create npc_super_neutral", nameRu: "Мид-босс", desc: "Спавнит большого нейтрала (Mid-boss) рядом с местом вызова.", cat: "spawn" },

  // ---------- Боты и карты ----------
  { cmd: "exec citadel_botmatch_practice_6v6_hard.cfg", nameRu: "Матч с ботами 6v6", desc: "Запускает тренировочный матч против ботов 6 на 6 на максимальной сложности.", cat: "bots" },
  { cmd: "map street_test", nameRu: "Новая карта", desc: "Загружает тестовую карту. Если игра не находит её, попробуйте вариант map streets_test.", cat: "bots" },

  // ---------- Сеть и регион ----------
  { cmd: "citadel_region_override 0", nameRu: "Сервера США", desc: "Переключает матчмейкинг на американские сервера. Отменить: citadel_region_override -1.", cat: "region" },
  { cmd: "citadel_region_override 1", nameRu: "Сервера Европы", desc: "Переключает матчмейкинг на европейские сервера — актуально для игры из РФ: пинг ниже, чем на США.", cat: "region" },

  // ---------- Интерфейс и камера ----------
  { cmd: "citadel_hud_visible false", nameRu: "Скрыть интерфейс", desc: "Полностью убирает HUD — идеально для скриншотов и съёмки в спектаторе. Вернуть: citadel_hud_visible true.", cat: "hud" },
  { cmd: "cl_lock_camera true", nameRu: "Закрепить камеру", desc: "Фиксирует камеру в выбранной точке для постановочных кадров. Требует сначала ввести sv_cheats 1.", cat: "hud" },

  // ---------- Легендарные предметы (giveitem) ----------
  { cmd: "giveitem upgrade_runed_gauntlets", nameRu: "Рунные рукавицы", nameEn: "Runed Gauntlets", desc: "Легендарный предмет: усиленные атаки в ближнем бою.", cat: "legendary", img: "/commands/runed_gauntlets.png" },
  { cmd: "giveitem upgrade_infinite_rounds", nameRu: "Бесконечные патроны", nameEn: "Infinite Rounds", desc: "Легендарный предмет: патроны, пробивающие броню.", cat: "legendary", img: "/commands/infinite_rounds.png" },
  { cmd: "giveitem upgrade_eldritch_shot", nameRu: "Терзающий выстрел", nameEn: "Haunting Shot", desc: "Легендарный предмет: проклятые пули, давящие на духовную защиту.", cat: "legendary", img: "/commands/eldritch_shot.png" },
  { cmd: "giveitem upgrade_shadow_strike", nameRu: "Теневой удар", nameEn: "Shadow Strike", desc: "Легендарный предмет: удары из тени с замедлением.", cat: "legendary", img: "/commands/shadow_strike.png" },
  { cmd: "giveitem upgrade_unstable_concoction", nameRu: "Нестабильный отвар", nameEn: "Unstable Concoction", desc: "Легендарный предмет: бомба-отвар с уроном по площади.", cat: "legendary", img: "/commands/unstable_concoction.png" },
  { cmd: "giveitem upgrade_eternal_gift", nameRu: "Вечный дар", nameEn: "Eternal Gift", desc: "Легендарный предмет: усиление лечения и ауры поддержки.", cat: "legendary", img: "/commands/eternal_gift.png" },
  { cmd: "giveitem upgrade_shrink_ray", nameRu: "Луч уменьшения", nameEn: "Shrink Ray", desc: "Легендарный предмет: луч, уменьшающий и ослабляющий цель.", cat: "legendary", img: "/commands/shrink_ray.png" },
  { cmd: "giveitem upgrade_mystical_piano", nameRu: "Мистическое фортепиано", nameEn: "Mystical Piano", desc: "Легендарный предмет: музыкальные волны с уроном.", cat: "legendary", img: "/commands/mystical_piano.png" },
  { cmd: "giveitem upgrade_omnicharge_pendant 0", nameRu: "Кулон всезаряда", nameEn: "Omnicharge Pendant", desc: "Легендарный предмет. Уровень задаётся числом 0–3: giveitem upgrade_omnicharge_pendant 3.", cat: "legendary", img: "/commands/omnicharge_pendant.png" },
  { cmd: "giveitem upgrade_prism_blast", nameRu: "Призматический взрыв", nameEn: "Prism Blast", desc: "Легендарный предмет: призменный залп по площади.", cat: "legendary", img: "/commands/prism_blast.png" },
  { cmd: "giveitem upgrade_nullification_aura", nameRu: "Аура аннулирования", nameEn: "Nullification Aura", desc: "Легендарный предмет: аура, гасящая вражеские снаряды и эффекты.", cat: "legendary", img: "/commands/nullification_aura.png" },
  { cmd: "giveitem upgrade_cloak_of_opportunity", nameRu: "Плащ возможностей", nameEn: "Cloak of Opportunity", desc: "Легендарный предмет: невидимость и рывок при выходе из тени.", cat: "legendary", img: "/commands/cloak_of_opportunity.png" },
  { cmd: "giveitem upgrade_electric_slippers", nameRu: "Электротапки", nameEn: "Electric Slippers", desc: "Легендарный предмет: электрические скольжения и рывки.", cat: "legendary", img: "/commands/electric_slippers.png" },
  { cmd: "giveitem upgrade_celestial_guidance", nameRu: "Небесное благословение", nameEn: "Celestial Blessing", desc: "Легендарный предмет: благословение с защитой и ускорением союзников.", cat: "legendary", img: "/commands/celestial_guidance.png" },
  { cmd: "giveitem upgrade_icarus_wings", nameRu: "Крылья серафима", nameEn: "Seraphim Wings", desc: "Легендарный предмет: полёт и управляемое планирование.", cat: "legendary", img: "/commands/icarus_wings.png" },
  { cmd: "giveitem upgrade_patrons_blessing", nameRu: "Мистическая связь", nameEn: "Mystic Conduit", desc: "Легендарный предмет: канал-связь между героями с передачей эффектов.", cat: "legendary", img: "/commands/patrons_blessing.png" },
  { cmd: "giveitem upgrade_shivas_bracelet 0", nameRu: "Морозящий амулет", nameEn: "Frostbite Charm", desc: "Легендарный предмет. Уровень задаётся числом 0–3: giveitem upgrade_shivas_bracelet 3.", cat: "legendary", img: "/commands/shivas_bracelet.png" },
];

/** Шаги «как открыть консоль» */
export const HOWTO_STEPS = [
  { n: 1, title: "Открой консоль на F7", text: "В игре нажми F7 — откроется консоль разработчика Source 2. Второй раз F7 — закрыть." },
  { n: 2, title: "Включи читы в лобби", text: "В песочнице или лобби с ботами введи sv_cheats 1 — после этого работают чит-команды и giveitem." },
  { n: 3, title: "Вставь команду и Enter", text: "Скопируй команду из каталога ниже кнопкой «Копировать», вставь в консоль (Ctrl+V) и нажми Enter." },
];
