/**
 * Оружейные приёмы (Weapon Masteries) из D&D 5e PHB 2024
 *
 * Каждый приём привязан к конкретному оружию и активируется
 * когда персонаж получает мастерство владения этим оружием.
 */

/** Описание оружейного приёма */
export interface WeaponMastery {
  /** Уникальный ключ приёма (англ.) */
  key: string;
  /** Название на английском и русском */
  name: { en: string; ru: string };
  /** Описание эффекта на английском и русском */
  description: { en: string; ru: string };
  /** Источник правил */
  source: string;
}

/** Все оружейные приёмы PHB 2024 */
export const WEAPON_MASTERIES: WeaponMastery[] = [
  {
    key: 'cleave',
    name: { en: 'Cleave', ru: 'Прорубание' },
    description: {
      en: "If you hit a creature with a melee attack roll using this weapon, you can make a melee attack roll with the weapon against a second creature within 5 feet of the first that is also within your reach. On a hit, the second creature takes the weapon's damage, but don't add your ability modifier to that damage unless that modifier is negative. You can make this extra attack only once per turn.",
      ru: 'Если вы попали по существу рукопашной атакой этим оружием, вы можете совершить рукопашную атаку этим же оружием по второму существу в пределах 5 футов от первого, которое также находится в пределах вашей досягаемости. При попадании второе существо получает урон оружия, но не добавляйте модификатор характеристики к этому урону, если он не отрицательный. Вы можете совершить эту дополнительную атаку только один раз за ход.',
    },
    source: 'PHB 2024',
  },
  {
    key: 'graze',
    name: { en: 'Graze', ru: 'Задевание' },
    description: {
      en: 'If your attack roll with this weapon misses a creature, you can deal damage to that creature equal to the ability modifier you used to make the attack roll. This damage is the same type dealt by the weapon, and the damage can be increased only by increasing the ability modifier.',
      ru: 'Если ваш бросок атаки этим оружием не попал по существу, вы можете нанести этому существу урон, равный модификатору характеристики, который вы использовали для броска атаки. Этот урон того же типа, что и наносимый оружием, и его можно увеличить только увеличением модификатора характеристики.',
    },
    source: 'PHB 2024',
  },
  {
    key: 'nick',
    name: { en: 'Nick', ru: 'Выпад' },
    description: {
      en: 'When you make the extra attack of the Light property, you can make it as part of the Attack action instead of as a Bonus Action. You can make this extra attack only once per turn.',
      ru: 'Когда вы совершаете дополнительную атаку свойства Лёгкое, вы можете совершить её как часть действия Атаки, а не как Бонусное действие. Вы можете совершить эту дополнительную атаку только один раз за ход.',
    },
    source: 'PHB 2024',
  },
  {
    key: 'push',
    name: { en: 'Push', ru: 'Толкание' },
    description: {
      en: 'If you hit a creature with this weapon, you can push the creature up to 10 feet straight away from you if it is Large or smaller.',
      ru: 'Если вы попали по существу этим оружием, вы можете оттолкнуть его на расстояние до 10 футов от себя по прямой, если оно Большого или меньшего размера.',
    },
    source: 'PHB 2024',
  },
  {
    key: 'sap',
    name: { en: 'Sap', ru: 'Изнурение' },
    description: {
      en: 'If you hit a creature with this weapon, that creature has Disadvantage on its next attack roll before the start of your next turn.',
      ru: 'Если вы попали по существу этим оружием, это существо получает Помеху на свой следующий бросок атаки до начала вашего следующего хода.',
    },
    source: 'PHB 2024',
  },
  {
    key: 'slow',
    name: { en: 'Slow', ru: 'Замедление' },
    description: {
      en: "If you hit a creature with this weapon and deal damage to it, you can reduce its Speed by 10 feet until the start of your next turn. If the creature is hit more than once by weapons that have this property, the Speed reduction doesn't exceed 10 feet.",
      ru: 'Если вы попали по существу этим оружием и нанесли ему урон, вы можете уменьшить его скорость на 10 футов до начала вашего следующего хода. Если существо получило попадание более одного раза от оружия с этим свойством, уменьшение скорости не превышает 10 футов.',
    },
    source: 'PHB 2024',
  },
  {
    key: 'topple',
    name: { en: 'Topple', ru: 'Опрокидывание' },
    description: {
      en: 'If you hit a creature with this weapon, you can force the creature to make a Constitution saving throw (DC 8 + the ability modifier used to make the attack roll + your Proficiency Bonus). On a failed save, the creature has the Prone condition.',
      ru: 'Если вы попали по существу этим оружием, вы можете заставить это существо совершить спасбросок Телосложения (Сл 8 + модификатор характеристики, использованный для атаки + ваш бонус мастерства). При провале существо получает состояние Лежащий.',
    },
    source: 'PHB 2024',
  },
  {
    key: 'vex',
    name: { en: 'Vex', ru: 'Подавление' },
    description: {
      en: 'If you hit a creature with this weapon and deal damage to the creature, you have Advantage on your next attack roll against that creature before the end of your next turn.',
      ru: 'Если вы попали по существу этим оружием и нанесли ему урон, вы получаете Преимущество на свой следующий бросок атаки против этого существа до конца вашего следующего хода.',
    },
    source: 'PHB 2024',
  },
];

/**
 * Карта оружейных приёмов по ключу для быстрого поиска
 *
 * @example
 * ```ts
 * const mastery = WEAPON_MASTERY_MAP.get('topple');
 * console.log(mastery?.name.ru); // 'Опрокидывание'
 * ```
 */
export const WEAPON_MASTERY_MAP = new Map<string, WeaponMastery>(
  WEAPON_MASTERIES.map((mastery) => [mastery.key, mastery]),
);
