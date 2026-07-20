import type {
  MeasurementTemplate,
  SceneEntity,
  TypedWebSocketClient,
} from '@vtt/shared';
import type {
  Actor,
  AttackRollMode,
  Creature,
  CreatureAction,
  DnDSceneEntity,
  EffectAttackTrigger,
  GameItem,
  Spell,
} from '@vtt/shared/system/dnd.js';

import type {
  RolledSpellDamagePart,
  SpellDamagePartInput,
} from '../composables/useSpellResolution';

/**
 * Регистрация макро-executor'ов, специфичных для D&D 5e.
 * Вся боевая логика (бросок атаки, двухэтапная атака, криты, урон) вынесена
 * в attackUtils.ts, а здесь остаётся только оркестрация и контекст выполнения макроса.
 */
import { isActorEntity, isCreatureEntity } from '@vtt/shared';
import {
  calculateSpellAttackModifier,
  calculateWeaponAttackModifier,
  checkRange,
  collectActiveEffects,
  combineEffectsWithAmbient,
  damagePartIsHealing,
  describeDamagePart,
  evaluateConditionalBonuses,
  formatConditionalDamageDisplay,
  getAvailableSpellLevels,
  getCreatureSpellRollButtonText,
  getPactSlotInfo,
  getSpellAttackType,
  getSpellDamageParts,
  getSpellPrimaryDamageType,
  getSpellProjectileCount,
  getTotalLevel,
  getWeaponPrimaryDamageType,
  isDnDEffect,
  mergeAppliedEffects,
  pickCantripTierParts,
  resolveActorStats,
  resolveAttackRollMode,
  resolveDamagePartsForCast,
  resolveSpellDamageFormula,
  SPELL_DAMAGE_TEMPLATE_COLORS,
  SPELL_TEMPLATE_DEFAULT_COLOR,
  spellHasDamage,
  spellIsHealing,
} from '@vtt/shared/system/dnd.js';

import { emitEntityUpdate } from '@/core/entityUtils';
import { registerMacro } from '@/core/registries/macroRegistry';
import { useModalManager } from '@/shared_ui/composables/useModalManager';
import { useActionPromptStore } from '@/stores/actionPromptStore';
import { useAuraStore } from '@/stores/auraStore';
import { useChatStore } from '@/stores/chatStore';
import { useSpellTemplateStore } from '@/stores/spellTemplateStore';
import { useTargetStore } from '@/stores/targetStore';
import { useWorldStore } from '@/stores/worldStore';

import {
  getCasterSpellEffects,
  getTargetSpellEffects,
  instantiateSpellEffects,
  stampEffectTurnDuration,
} from '../composables/spellResolutionShared';
import { useBonusDamageParts } from '../composables/useBonusDamageParts';
import {
  getSpellMaxRangeOnScene,
  isSpellCastBlockedByRange,
  isSpellTargetBlockedByRange,
  measureTokenDistanceOnScene,
} from '../composables/useSceneRangeCheck';
import { useSpellResolution } from '../composables/useSpellResolution';
import { checkCreatureActionRangeOnScene } from '../ui/creature/composables/useCreatureRangeCheck';

/**
 * Граница системы: ядро отдаёт макросам НЕЙТРАЛЬНЫЕ сущности
 * (`BaseActor`/`BaseCreature`), но в D&D-мире их содержимое — D&D-форма.
 * Доверенные сужения по дискриминатору `entityType` (без `as`): дают доступ к
 * D&D-полям внутри системы.
 */
function isDnDActorEntity(entity: SceneEntity | null): entity is Actor {
  return entity !== null && entity.entityType === 'actor';
}

function isDnDCreatureEntity(entity: SceneEntity | null): entity is Creature {
  return entity !== null && entity.entityType === 'creature';
}

/**
 * Снимает с сущности одноразовые эффекты, «сгорающие» по указанному триггеру
 * атаки (`consumeOn`), и шлёт полное обновление сущности (как при наложении
 * эффектов через resolveSpellDamage). Если снимать нечего — ничего не делает.
 *
 * @param entity - сущность-носитель эффектов
 * @param trigger - какой триггер расхода снимаем
 * @param socket - сокет для синхронизации
 */
function consumeTriggeredEffects(
  entity: SceneEntity,
  trigger: EffectAttackTrigger,
  socket: TypedWebSocketClient,
): void {
  // Сущность нейтральна (`SceneEntity`) — сужаем эффекты к D&D-форме, чтобы
  // читать D&D-поле `consumeOn` (одноразовость на броске атаки).
  const effects = entity.activeEffects?.filter(isDnDEffect);

  if (!effects?.some((effect) => effect.consumeOn === trigger)) {
    return;
  }

  const filtered = effects.filter((effect) => effect.consumeOn !== trigger);

  // Снимаем эффект в КАНОНИЧЕСКОЙ сущности стора по id (тем же экшеном, что и
  // списание ячейки заклинания). Это важно для триггера `attackOnCarrier`:
  // оркестратор урона позже клонирует ту же сущность цели для своего эмита, и
  // без локального снятия его полный снапшот вернул бы эффект обратно (гонка
  // двух эмитов одной сущности). Расход идёт ДО броска, поэтому HP в этом эмите
  // ещё прежние — итоговую запись с уроном делает оркестратор по уже очищенной
  // сущности.
  const worldStore = useWorldStore();
  const worldId = worldStore.connectionState.currentWorldId;

  if (worldId) {
    if (isActorEntity(entity)) {
      worldStore.updateActor(worldId, entity.id, { activeEffects: filtered });
    } else if (isCreatureEntity(entity)) {
      worldStore.updateCreature(worldId, entity.id, {
        activeEffects: filtered,
      });
    }
  }

  // Deep clone: shallow spread теряет вложенные Vue reactive-свойства.
  const updated: SceneEntity = JSON.parse(JSON.stringify(entity));

  updated.activeEffects = filtered;

  emitEntityUpdate(socket, updated);
}

/**
 * Расход одноразовых эффектов по факту совершённого броска атаки: с атакующего
 * снимаются эффекты `carrierAttack` (помеха/преимущество на свою следующую
 * атаку), с цели — `attackOnCarrier` (преимущество следующей атаки ПО цели).
 *
 * @param attacker - совершающий бросок атаки
 * @param target - текущая цель (на момент броска; может отсутствовать)
 * @param socket - сокет для синхронизации
 */
function consumeAttackRollEffects(
  attacker: SceneEntity,
  target: SceneEntity | null,
  socket: TypedWebSocketClient,
): void {
  consumeTriggeredEffects(attacker, 'carrierAttack', socket);

  if (target) {
    consumeTriggeredEffects(target, 'attackOnCarrier', socket);
  }
}

/**
 * Ищет оружие по ID макроса: сначала в актора-владельца,
 * потом fallback по всем акторам (обратная совместимость).
 *
 * @param ref - ID оружия (macro.ref)
 * @param actor - актор-владелец (из контекста)
 * @param actors - все акторы мира (для fallback)
 * @returns найденное оружие и актор, или null
 */
function findWeapon(
  ref: string,
  actor: Actor | null,
  actors: Actor[],
): { weapon: GameItem; actor: Actor } | null {
  // Прямой поиск в актора-владельца
  if (actor) {
    const weapon = actor.equipment?.find((item: GameItem) => item.id === ref);

    if (weapon) {
      return { weapon, actor };
    }
  }

  // Fallback: перебор всех акторов (обратная совместимость для старых макросов без actorId)
  for (const candidate of actors) {
    const weapon = candidate.equipment?.find(
      (item: GameItem) => item.id === ref,
    );

    if (weapon) {
      return { weapon, actor: candidate };
    }
  }

  return null;
}

/**
 * Ищет заклинание по ID макроса.
 */
function findSpell(
  ref: string,
  actor: Actor | null,
  actors: Actor[],
): { spell: import('@vtt/shared/system/dnd.js').Spell; actor: Actor } | null {
  if (actor) {
    const spell = actor.spells?.find(
      (existingSpell) => existingSpell.id === ref,
    );

    if (spell) {
      return { spell, actor };
    }
  }

  for (const candidate of actors) {
    const spell = candidate.spells?.find(
      (existingSpell) => existingSpell.id === ref,
    );

    if (spell) {
      return { spell, actor: candidate };
    }
  }

  return null;
}

/**
 * Проверяет дистанцию между атакующим и целью на текущей сцене.
 *
 * @param weapon - оружие для атаки
 * @param attackerActorId - ID актора-атакующего
 * @param targetTokenId - ID токена-цели
 * @returns результат проверки дистанции или null
 */
function checkWeaponRangeOnScene(
  weapon: GameItem,
  attackerActorId: string,
  targetTokenId: string,
): {
  allowed: boolean;
  disadvantage: boolean;
  distance: number;
  unitLabel: string;
} | null {
  const measurement = measureTokenDistanceOnScene(
    attackerActorId,
    targetTokenId,
  );

  if (!measurement) {
    return null;
  }

  const rangeResult = checkRange(weapon, measurement.distance);

  return {
    ...rangeResult,
    distance: measurement.distance,
    unitLabel: measurement.unitLabel,
  };
}

/**
 * Вычисляет доступные круги заклинаний для каста.
 *
 * Вынесено из inline-объекта для избежания вложенного тернарника (no-nested-ternary).
 *
 * @param lockedLevel - фиксированный круг (если есть)
 * @param spellLevel - базовый круг заклинания
 * @param actor - актор-заклинатель
 */
function computeAvailableLevels(
  lockedLevel: number | undefined,
  spellLevel: number,
  actor: Actor,
): number[] {
  if (lockedLevel) {
    return [lockedLevel];
  }

  if (spellLevel > 0) {
    return getAvailableSpellLevels(actor, spellLevel);
  }

  return [];
}

/**
 * Определяет, находится ли цель на полном запасе HP (для токенов
 * `@target.full`/`@target.notFull`).
 *
 * @param entity - сущность-цель (или null, если цель не выбрана)
 * @returns true/false по состоянию HP, либо undefined если цели/HP нет
 */
function isTargetFullHp(entity: SceneEntity | null): boolean | undefined {
  if (!entity) {
    return undefined;
  }

  const hp = (
    entity.system as { hitPoints?: { current?: number; max?: number } }
  )?.hitPoints;

  if (!hp || hp.max === undefined) {
    return undefined;
  }

  return (hp.current ?? 0) >= hp.max;
}

/**
 * Регистрирует все D&D 5e macro executor'ы в macroRegistry.
 * Вызывается один раз при монтировании сцены.
 */
export function registerDnd5eMacros(): void {
  registerMacro('weapon-attack', (macro, context) => {
    try {
      const chatStore = useChatStore();
      const targetStore = useTargetStore();

      const actorEntity = isDnDActorEntity(context.actor)
        ? context.actor
        : null;

      const result = findWeapon(
        macro.ref,
        actorEntity,
        context.actors.filter(isDnDActorEntity),
      );

      if (!result || !result.weapon.damageParts?.length) {
        console.warn(
          '[Hotbar] Оружие не найдено или без частей урона:',
          macro.ref,
        );

        return;
      }

      const { weapon: foundWeapon, actor: foundActor } = result;

      // resolvedStats для @mod.* в формулах частей и статического урона
      const auraStore = useAuraStore();

      // Ambient-ауры контракт отдаёт нейтральной базой — сужаем к D&D-форме.
      const ambientEffects = auraStore
        .getAmbientEffectsForActor(foundActor.id)
        .filter(isDnDEffect);

      const resolvedStats = resolveActorStats(foundActor, ambientEffects);

      // --- Проверка дистанции ---
      let isDisadvantage = false;

      if (targetStore.targetTokenId && foundActor.id) {
        const rangeCheck = checkWeaponRangeOnScene(
          foundWeapon,
          foundActor.id,
          targetStore.targetTokenId,
        );

        if (rangeCheck && !rangeCheck.allowed) {
          chatStore.sendMessage(
            `⛔ ${foundWeapon.name}: цель вне досягаемости (${rangeCheck.distance} ${rangeCheck.unitLabel})`,
            'text',
          );

          return;
        }

        if (rangeCheck?.disadvantage) {
          isDisadvantage = true;
        }
      }

      const combinedEffects = combineEffectsWithAmbient(
        collectActiveEffects(foundActor),
        ambientEffects,
      );

      const attackKey =
        foundWeapon.rangeType === 'ranged' ? 'attack.ranged' : 'attack.melee';

      const damageKey =
        foundWeapon.rangeType === 'ranged' ? 'damage.ranged' : 'damage.melee';

      const baseMod = calculateWeaponAttackModifier(
        foundActor,
        foundWeapon,
        resolvedStats,
      );

      // Оружие со спасброском: цель кидает спас, броска попадания нет.
      // DC оружия = 8 + модификатор атаки оружием.
      const hasSave = !!foundWeapon.saveType && foundWeapon.saveType !== 'none';

      const weaponSaveDC = 8 + baseMod;

      const incomingAttackType =
        foundWeapon.rangeType === 'ranged'
          ? ('ranged' as const)
          : ('melee' as const);

      const targetActor = targetStore.getTargetActor();

      let targetFlags = new Set<string>();

      if (targetActor) {
        targetFlags = resolveActorStats(
          targetActor as DnDSceneEntity,
        ).activeFlags;
      }

      // Единый расчёт режима броска: флаги атакующего (общие + профильные),
      // флаги цели (attacksAgainst) и помеха дистанции.
      const initialRollMode = resolveAttackRollMode({
        attackerFlags: resolvedStats.activeFlags,
        attackType: foundWeapon.rangeType === 'ranged' ? 'ranged' : 'melee',
        targetFlags,
        forceDisadvantage: isDisadvantage,
      });

      const { openModal } = useModalManager();

      const { buildWeaponRollSetup, buildTargetHpContext } =
        useBonusDamageParts();

      // Единая со заклинаниями система урона: бросок ВСЕГДА идёт многочастным
      // путём (части урона оружия + бонус-части эффектов). Состояние HP цели
      // нужно для условных веток @target.full/@target.notFull.
      const targetIsFull = isTargetFullHp(targetActor);

      const weaponPartsSetup = buildWeaponRollSetup({
        weapon: foundWeapon,
        actor: foundActor,
        effects: combinedEffects,
        resolvedStats,
        targetIsFull,
      });

      /**
       * Применяет брошенные части урона оружия через многочастный оркестратор
       * (защиты по типу на каждую часть, per-target гейты, спасбросок оружия,
       * единый HP-апдейт).
       *
       * @param parts - брошенные части урона
       */
      function handleWeaponRollParts(parts: RolledSpellDamagePart[]): void {
        const worldStore = useWorldStore();
        const socket = chatStore.getSocket();
        const worldId = worldStore.connectionState.currentWorldId;

        if (!worldId || !socket) {
          return;
        }

        const world = worldStore.worlds.find(
          (worldEntry) => worldEntry.id === worldId,
        );

        const actors = [...(world?.actors ?? []), ...(world?.creatures ?? [])];

        if (actors.length === 0) {
          return;
        }

        const { resolveSpellDamageWithParts } = useSpellResolution();

        void resolveSpellDamageWithParts(
          {
            spell: weaponPartsSetup.pseudoSpell,
            damageTotal: 0,
            spellSaveDC: weaponSaveDC,
            actors,
            socket,
            casterId: foundActor.id,
          },
          parts,
          { scene: worldStore.currentScene },
        );
      }

      openModal('DiceRollModal', {
        title: `Атака — ${foundWeapon.name}`,
        rollLabel: foundWeapon.name,
        rollButtonText: hasSave ? 'Бросить урон' : 'Бросить атаку',
        // Формула для отображения (бросок идёт многочастным путём по damageParts)
        formula: weaponPartsSetup.baseParts[0]?.formula ?? '',
        attackModifier: hasSave ? undefined : baseMod,
        initialRollMode,
        incomingAttackType,
        evaluateConditionalBonuses: (modalContext: {
          hasAdvantage: boolean;
          hasDisadvantage: boolean;
        }) => {
          // HP цели читается в момент броска — для условий target.hp.*
          const rollContext = {
            ...modalContext,
            target: buildTargetHpContext(),
          };

          return {
            attackBonus: evaluateConditionalBonuses(
              combinedEffects,
              attackKey,
              rollContext,
            ),
            damageBonus: evaluateConditionalBonuses(
              combinedEffects,
              damageKey,
              rollContext,
            ),
          };
        },
        damageType: getWeaponPrimaryDamageType(foundWeapon),
        damageParts: weaponPartsSetup.baseParts,
        evaluateBonusDamageParts: weaponPartsSetup.evaluateBonusDamageParts,
        // Эффекты «на цель» гейтит оркестратор (handleWeaponRollParts →
        // resolveSpellDamageWithParts по applySave/приземлению). Прямого onHit
        // нет — он вешал эффект на каждое попадание мимо спасброска.
        onRollParts: handleWeaponRollParts,
        // Расход одноразовых эффектов «следующей атаки» (Злая насмешка и т.п.)
        onAttackRolled: () => {
          const attackSocket = chatStore.getSocket();

          if (attackSocket) {
            consumeAttackRollEffects(
              foundActor,
              targetStore.getTargetActor(),
              attackSocket,
            );
          }
        },
      });
    } catch (err) {
      console.error('[Hotbar] Ошибка выполнения weapon-attack:', err);
    }
  });

  registerMacro('spell-cast', (macro, context) => {
    try {
      const actorEntity = isDnDActorEntity(context.actor)
        ? context.actor
        : null;

      const result = findSpell(
        macro.ref,
        actorEntity,
        context.actors.filter(isDnDActorEntity),
      );

      if (!result) {
        console.warn('[Hotbar] Заклинание не найдено:', macro.ref);

        return;
      }

      const { spell, actor } = result;

      const availableLevels =
        spell.level > 0 ? getAvailableSpellLevels(actor, spell.level) : [0];

      if (spell.level > 0 && availableLevels.length === 0) {
        const chatStore = useChatStore();

        chatStore.sendMessage(
          `⛔ ${spell.name}: у вас нет доступных ячеек заклинаний ${spell.level} круга или выше.`,
          'text',
        );

        return;
      }

      // Снарядный режим: число снарядов зависит от контекста каста
      // (заговоры — от уровня персонажа, уровневые — от круга ячейки)
      const casterLevel = getTotalLevel(actor.system?.classes);

      const baseProjectileCount = getSpellProjectileCount(spell, {
        slotLevel: availableLevels[0] ?? spell.level,
        casterLevel,
      });

      const hasProjectiles = baseProjectileCount > 1 && !spell.areaOfEffect;

      // Проверка дистанции каста до выбранной цели (только одиночная цель:
      // у AoE и снарядов собственные механики таргетинга)
      if (
        !spell.areaOfEffect
        && !hasProjectiles
        && isSpellCastBlockedByRange(spell, actor.id)
      ) {
        return;
      }

      // Если есть область действия — пропускаем зелёный prompt, сразу начинаем применять
      if (spell.areaOfEffect) {
        executeSpellCast(spell, actor);

        return;
      }

      if (hasProjectiles) {
        // Запускаем режим выбора целей (снарядов) с отдельным промптом
        import('@/stores/projectileStore').then(({ useProjectileStore }) => {
          const { openModal } = useModalManager();
          const projectileStore = useProjectileStore();

          projectileStore.startTargeting(
            spell.projectiles?.targetDistribution ?? null,
            baseProjectileCount,
            (tokenId) => !isSpellTargetBlockedByRange(spell, actor.id, tokenId),
          );

          openModal('ProjectilePromptModal', {
            spell,
            casterLevel,
            availableSpellLevels: availableLevels,
            onConfirm: (selectedLevel: number) => {
              // Передаем зафиксированный уровень заклинания в executeSpellCast
              executeSpellCast(spell, actor, selectedLevel);
            },
          });
        });

        return;
      }

      const promptStore = useActionPromptStore();
      const promptId = `spell-cast-${spell.id}-${Date.now()}`;

      promptStore.addPrompt({
        id: promptId,
        icon: 'tabler:wand',
        title: `Применить заклинание: ${spell.name}?`,
        color: 'neutral',
        actions: [
          {
            icon: 'tabler:check',
            color: 'primary',
            onClick: () => {
              promptStore.removePrompt(promptId);
              executeSpellCast(spell, actor);
            },
          },
          {
            icon: 'tabler:x',
            color: 'neutral',
            variant: 'ghost',
            onClick: () => {
              promptStore.removePrompt(promptId);
            },
          },
        ],
      });
    } catch (err) {
      console.error('[Hotbar] Ошибка выполнения spell-cast:', err);
    }
  });

  registerCreatureActionMacro();
  registerCreatureSpellMacro();
}

/**
 * Выполняет каст заклинания после подтверждения в Action Prompt.
 *
 * @param spell - заклинание
 * @param actor - актор-владелец
 */
function executeSpellCast(
  spell: import('@vtt/shared/system/dnd.js').Spell,
  actor: Actor,
  lockedSpellLevel?: number,
): void {
  // Если есть область действия — сначала размещаем шаблон на сцене
  if (spell.areaOfEffect) {
    const templateStore = useSpellTemplateStore();

    const templateColor =
      SPELL_DAMAGE_TEMPLATE_COLORS[getSpellPrimaryDamageType(spell) ?? '']
      ?? SPELL_TEMPLATE_DEFAULT_COLOR;

    templateStore.requestPlacement(
      {
        ...spell.areaOfEffect,
        resizable: spell.areaOfEffect.resizable ?? false,
      },
      templateColor,
      actor.id,
      (templateId) => {
        const promptStore = useActionPromptStore();
        const promptId = `spell-confirm-${spell.id}-${Date.now()}`;

        promptStore.addPrompt({
          id: promptId,
          icon: 'tabler:wand',
          title: `Применить заклинание: ${spell.name}?`,
          color: 'neutral',
          actions: [
            {
              icon: 'tabler:check',
              color: 'primary',
              onClick: () => {
                promptStore.removePrompt(promptId);

                // Кэшируем данные шаблона ДО удаления — они нужны для определения целей
                const cachedTemplate =
                  templateStore.getPlacedTemplate(templateId);

                // Очищаем кэш шаблона (данные уже сохранены в cachedTemplate)
                templateStore.removePlacedTemplate(templateId);
                // Удаляем визуальный шаблон с карты
                templateStore.deleteTemplate(templateId);
                // Открываем окно кубиков для броска урона/атаки
                openDiceRollForSpell(spell, actor, cachedTemplate);
              },
            },
            {
              icon: 'tabler:x',
              color: 'neutral',
              variant: 'ghost',
              onClick: () => {
                promptStore.removePrompt(promptId);
                // Удаляем шаблон так как пользователь отменил заклинание
                templateStore.deleteTemplate(templateId);
              },
            },
          ],
        });
      },
      getSpellMaxRangeOnScene(spell),
    );

    return;
  }

  // Без AoE — сразу открываем DiceRollModal
  openDiceRollForSpell(spell, actor, undefined, lockedSpellLevel);
}

/**
 * Открывает DiceRollModal для заклинания.
 *
 * @param spell - заклинание
 * @param actor - актор-владелец
 * @param cachedTemplate - кэшированные данные шаблона для определения целей
 */
function openDiceRollForSpell(
  spell: import('@vtt/shared/system/dnd.js').Spell,
  actor: Actor,
  cachedTemplate?: MeasurementTemplate,
  lockedSpellLevel?: number,
): void {
  // Проверяем наличие снарядов (до открытия модалки): число снарядов зависит
  // от контекста каста — круга ячейки (уровневые) или уровня персонажа (заговоры)
  const casterLevel = getTotalLevel(actor.system?.classes);

  const projectileCount = getSpellProjectileCount(spell, {
    slotLevel: lockedSpellLevel ?? spell.level,
    casterLevel,
  });

  const hasProjectiles =
    projectileCount > 1 && !spell.areaOfEffect && !cachedTemplate;

  // Окно броска открываем, если есть урон/лечение, РЕАЛЬНЫЙ бросок атаки
  // (getSpellAttackType === undefined при автопопадании — тогда броска нет даже
  // у melee/ranged доставки) или спасбросок. Иначе — путь самобаффа/наложения
  // эффекта без броска (castBuffSpellMacro).
  if (
    spellHasDamage(spell)
    || getSpellAttackType(spell)
    || spell.saveType !== 'none'
  ) {
    const { openModal } = useModalManager();
    const worldStore = useWorldStore();

    const {
      needsAutoResolution,
      resolveSpellDamage,
      resolveSpellDamageWithParts,
    } = useSpellResolution();

    // Итоговые статы с учётом Active Effects — нужны и для @mod.spell в формуле
    // урона (внешние бонусы к стату), и для бонуса атаки заклинанием.
    const resolvedStats = resolveActorStats(actor, []);

    // Выбранная цель (если есть) — для @target-токенов. Кидать ли бросок
    // атаки, решает DiceRollModal по наличию цели в момент броска: без цели
    // заклинание-атака просто катит урон «в пустоту».
    const selectedTargetActor = useTargetStore().getTargetActor();

    // Состояние HP выбранной цели для токенов @target.full/@target.notFull.
    // Для AoE / без цели — undefined: части раскладываются на гейт-ветки
    // (targetGate), и оркестратор выбирает ветку по HP каждой цели (per-target).
    const targetIsFull = spell.areaOfEffect
      ? undefined
      : isTargetFullHp(selectedTargetActor);

    // Масштабирование заговора: на пороге уровня тир целиком заменяет базовые
    // части урона (см. cantripScalingTiers). Авто-умножение кубиков отключено.
    const spellDamageParts =
      spell.level === 0
        ? (pickCantripTierParts(spell, casterLevel)
          ?? getSpellDamageParts(spell))
        : getSpellDamageParts(spell);

    // Legacy одиночная формула (снаряды/одночастный путь): первая часть, с
    // разрешёнными @-переменными (@dmg-токены снимаются внутри resolve).
    const firstPartFormula = spellDamageParts[0]?.formula ?? '';

    const resolvedDamageFormula = resolveSpellDamageFormula(
      spell,
      actor,
      firstPartFormula,
      resolvedStats,
      targetIsFull,
    );

    // Превью формулы для модалки. Когда состояние цели неизвестно (нет цели / AoE)
    // и в части есть взаимоисключающие ветки @target.full/@target.notFull —
    // показываем их через «или» (а не суммируем через «+», как делает strip).
    // Если цель выбрана, targetIsFull известен → resolvedDamageFormula уже содержит
    // нужную ветку, отдельное превью не нужно.
    const damageFormulaForDisplay =
      targetIsFull === undefined && /@target\./i.test(firstPartFormula)
        ? formatConditionalDamageDisplay(firstPartFormula, (subFormula) =>
            resolveSpellDamageFormula(spell, actor, subFormula, resolvedStats),
          )
        : undefined;

    // --- Многочастный путь (несколько частей / нестандартный таргетинг) ---
    // Включая заклинания-атаки: модалка делает бросок попадания, затем части.
    // Исключены только снаряды (своя логика распределения).

    // Кость-формулы бонус-урона заклинаний (damage.spell) в Active Effects
    // катаются отдельными частями — каст идёт многочастным путём даже для
    // одночастного заклинания. Учитываются и ambient-эффекты аур на карте
    // (напр. аура союзника, дающая бонус-урон заклинаниям).
    const { hasSpellBonusDamage, buildSpellBonusEvaluator } =
      useBonusDamageParts();

    const spellEffects = combineEffectsWithAmbient(
      collectActiveEffects(actor),
      useAuraStore().getAmbientEffectsForActor(actor.id).filter(isDnDEffect),
    );

    const hasBonusDamage = hasSpellBonusDamage(spellEffects);

    // Эффекты заклинания, предназначенные цели (effectTarget 'target')
    const hasSpellTargetEffects = getTargetSpellEffects(spell).length > 0;

    const useMultiPart =
      !hasProjectiles
      && (hasBonusDamage
        || spellDamageParts.length > 1
        || spellDamageParts.some(
          (part) =>
            (part.target ?? 'selected') !== 'selected'
            || part.requiresDamage
            || /@dmg\./i.test(part.formula)
            || /@heal/i.test(part.formula)
            || /@target\./i.test(part.formula),
        ));

    const resolvedParts: SpellDamagePartInput[] = useMultiPart
      ? resolveDamagePartsForCast(
          spell,
          actor,
          spellDamageParts,
          resolvedStats,
          targetIsFull,
        )
      : [];

    // Roll-time сборщик бонус-частей: условия (преимущество/помеха, HP цели)
    // оцениваются в момент броска по фактическому режиму из модалки.
    // Снаряды остаются на одноформульном пути, но бонус-части получают:
    // они катаются один раз на каст и применяются каждой задетой цели
    // (per-target гейты, см. resolveSpellDamage).
    const evaluateSpellBonusParts =
      useMultiPart || (hasProjectiles && hasBonusDamage)
        ? buildSpellBonusEvaluator({
            spell,
            actor,
            effects: spellEffects,
            resolvedStats,
            multiTarget:
              spell.areaOfEffect !== undefined
              || cachedTemplate !== undefined
              || hasProjectiles,
          })
        : undefined;

    /** Обработчик многочастного броска: применяет части через оркестратор. */
    function handleSpellRollParts(parts: RolledSpellDamagePart[]): void {
      const scene = worldStore.currentScene;
      const chatStore = useChatStore();
      const socket = chatStore.getSocket();
      const worldId = worldStore.connectionState.currentWorldId;

      if (!worldId || !socket) {
        return;
      }

      const world = worldStore.worlds.find(
        (worldEntry) => worldEntry.id === worldId,
      );

      const actors = [...(world?.actors ?? []), ...(world?.creatures ?? [])];

      if (actors.length === 0) {
        return;
      }

      void resolveSpellDamageWithParts(
        {
          spell,
          damageTotal: 0,
          spellSaveDC: resolvedStats.spellSaveDC,
          actors,
          socket,
          casterId: actor.id,
        },
        parts,
        { scene, cachedTemplate },
      );
    }

    const incomingAttackType = getSpellAttackType(spell);

    // Полный бонус атаки заклинанием: мод характеристики (итоговый) +
    // мастерство + attack.spell + доп. бонус заклинания.
    const baseMod = incomingAttackType
      ? calculateSpellAttackModifier(actor, spell, resolvedStats)
      : 0;

    let rollButtonText = 'Бросить урон';

    if (incomingAttackType) {
      rollButtonText = 'Бросить атаку';
    } else if (spellDamageParts.some((part) => damagePartIsHealing(part))) {
      rollButtonText = 'Лечение';
    }

    /** Нужно ли пропустить автоприменение урона в модалке (обработка делегирована resolveSpellTargets) */
    const shouldSkipModalDamage = needsAutoResolution(spell, hasProjectiles);

    // Определяем наличие и уровень Pact-слота
    const pactInfo = getPactSlotInfo(actor.system?.classes ?? []);
    const pactSlotLevel = pactInfo.level;

    if (hasProjectiles) {
      import('@/stores/projectileStore').then(({ useProjectileStore }) => {
        const projectileStore = useProjectileStore();

        // Не сбрасываем таргетинг если он уже активен (вызов из ProjectilePromptModal)
        if (!projectileStore.isActive) {
          projectileStore.startTargeting(
            spell.projectiles?.targetDistribution ?? null,
            projectileCount,
            (tokenId) => !isSpellTargetBlockedByRange(spell, actor.id, tokenId),
          );
        }
      });
    }

    /**
     * Обработчик подтверждения броска — применяет урон к целям.
     */
    function handleSpellRoll(
      damageTotal: number,
      chosenDamageType?: string,
    ): void {
      // Эффекты на цель без урона тоже требуют резолва (спасбросок у
      // save-заклинаний), поэтому пускаем резолв и при наличии target-эффектов.
      if (
        !needsAutoResolution(spell, hasProjectiles)
        || (damageTotal <= 0 && !hasSpellTargetEffects)
      ) {
        return;
      }

      const scene = worldStore.currentScene;
      const chatStore = useChatStore();
      const socket = chatStore.getSocket();

      const worldId = worldStore.connectionState.currentWorldId;

      if (!worldId) {
        return;
      }

      const world = worldStore.worlds.find(
        (worldEntry) => worldEntry.id === worldId,
      );

      const actors = [...(world?.actors ?? []), ...(world?.creatures ?? [])];

      if (actors.length === 0 || !socket) {
        return;
      }

      const context = {
        spell,
        damageTotal,
        spellSaveDC: resolvedStats.spellSaveDC,
        actors,
        socket,
        casterId: actor.id,
        overrideDamageType: chosenDamageType,
      };

      // Бонус-части для снарядов собираются здесь (в момент подтверждения
      // броска): снаряды autoHit — броска атаки нет, поэтому преимущество/
      // помеха не определены (false); HP-условия отложены в per-target гейты.
      const projectileBonusParts =
        hasProjectiles && evaluateSpellBonusParts
          ? evaluateSpellBonusParts({
              hasAdvantage: false,
              hasDisadvantage: false,
            })
          : undefined;

      resolveSpellDamage(context, {
        hasProjectiles,
        resolvedDamageFormula,
        scene,
        cachedTemplate,
        bonusDamageParts: projectileBonusParts,
      });
    }

    /**
     * Обработчик серии атак снарядов (Мистический заряд, Палящий луч):
     * модалка отдаёт контекст броска, по броску попадания на каждый снаряд
     * выполняет resolveSpellDamage. Бонус-части эффектов собираются с
     * фактическим режимом преимущества/помехи и катаются на каждое попадание.
     */
    function handleProjectileAttackRoll(rollContext: {
      attackModifier: number;
      rollMode: AttackRollMode;
    }): void {
      if (!incomingAttackType) {
        return;
      }

      const scene = worldStore.currentScene;
      const chatStore = useChatStore();
      const socket = chatStore.getSocket();
      const worldId = worldStore.connectionState.currentWorldId;

      if (!worldId || !socket) {
        return;
      }

      const world = worldStore.worlds.find(
        (worldEntry) => worldEntry.id === worldId,
      );

      const actors = [...(world?.actors ?? []), ...(world?.creatures ?? [])];

      if (actors.length === 0) {
        return;
      }

      const projectileBonusParts = evaluateSpellBonusParts
        ? evaluateSpellBonusParts({
            hasAdvantage: rollContext.rollMode === 'advantage',
            hasDisadvantage: rollContext.rollMode === 'disadvantage',
          })
        : undefined;

      resolveSpellDamage(
        {
          spell,
          damageTotal: 0,
          spellSaveDC: resolvedStats.spellSaveDC,
          actors,
          socket,
          casterId: actor.id,
        },
        {
          hasProjectiles: true,
          resolvedDamageFormula,
          scene,
          projectileAttack: {
            attackModifier: rollContext.attackModifier,
            rollMode: rollContext.rollMode,
            attackType: incomingAttackType,
          },
          bonusDamageParts: projectileBonusParts,
        },
      );
    }

    // Помеха/преимущество атакующего заклинанием (Злая насмешка и т.п.): те же
    // флаги, что и у оружия (общие + профильные attack.spell.*), плюс флаги
    // attacksAgainst у цели. Раньше спелл-атаки флаги атакующего игнорировали.
    const spellInitialRollMode: AttackRollMode = incomingAttackType
      ? resolveAttackRollMode({
          attackerFlags: resolvedStats.activeFlags,
          attackType: 'spell',
          targetFlags: useTargetStore().getTargetFlags(),
        })
      : 'normal';

    openModal('DiceRollModal', {
      title: `Заклинание — ${spell.name}`,
      rollLabel: spell.name,
      rollButtonText,
      formula: resolvedDamageFormula,
      formulaDisplay: damageFormulaForDisplay,
      attackModifier: incomingAttackType ? baseMod : undefined,
      incomingAttackType,
      initialRollMode: spellInitialRollMode,
      isHealing: spellIsHealing(spell),
      damageType: getSpellPrimaryDamageType(spell),
      skipDamageApplication: shouldSkipModalDamage,
      skipChatMessage: hasProjectiles,
      onRoll: handleSpellRoll,

      // Атакующее заклинание-эффект (без многочастного пути): эффекты на цель
      // вешаем по ПОПАДАНИЮ. Многочастные уронные накладывают их сами.
      onHit:
        incomingAttackType && hasSpellTargetEffects && !useMultiPart
          ? () => applyTargetSpellEffectsMacro(spell)
          : undefined,

      // Расход одноразовых эффектов «следующей атаки» на броске атаки заклинанием
      onAttackRolled: incomingAttackType
        ? () => {
            const attackSocket = useChatStore().getSocket();

            if (attackSocket) {
              consumeAttackRollEffects(
                actor,
                useTargetStore().getTargetActor(),
                attackSocket,
              );
            }
          }
        : undefined,

      // Атакующие снаряды: модалка отдаёт контекст, серию бросков выполняет
      // resolveSpellDamage (бросок попадания на каждый снаряд)
      onProjectileAttack:
        hasProjectiles && incomingAttackType
          ? handleProjectileAttackRoll
          : undefined,

      // Многочастный путь (если активен) — модалка катает части и зовёт onRollParts
      damageParts: useMultiPart ? resolvedParts : undefined,
      onRollParts: useMultiPart ? handleSpellRollParts : undefined,
      // Снарядам бонус-части катает resolveSpellDamage, а не модалка
      evaluateBonusDamageParts: useMultiPart
        ? evaluateSpellBonusParts
        : undefined,

      // Секция круга заклинания
      spellLevel:
        lockedSpellLevel ?? (spell.level > 0 ? spell.level : undefined),
      availableSpellLevels: computeAvailableLevels(
        lockedSpellLevel,
        spell.level,
        actor,
      ),
      spellScalingDice: spell.scaling?.additionalDice,
      pactSlotLevel,
      onSpellSlotConsume: (
        castLevel: number,
        consumeSlot: boolean,
        isPactSlot: boolean,
      ) => {
        if (!consumeSlot || castLevel <= 0) {
          return;
        }

        const worldId = worldStore.connectionState.currentWorldId;

        if (!worldId) {
          return;
        }

        const chatStore = useChatStore();
        const socket = chatStore.getSocket();

        // Deep clone для отправки через сокет без реактивных прокси
        const updatedActor: Actor = JSON.parse(JSON.stringify(actor));

        if (isPactSlot) {
          const newPactUsed = (actor.system?.pactSlotsUsed ?? 0) + 1;

          const pactUpdate: Partial<Actor> = {
            system: {
              ...actor.system,
              pactSlotsUsed: newPactUsed,
            },
          };

          worldStore.updateActor(worldId, actor.id, pactUpdate);

          if (updatedActor.system) {
            updatedActor.system.pactSlotsUsed = newPactUsed;
          }
        } else {
          const index = castLevel - 1;

          const newUsed = [
            ...(actor.system?.spellSlotsUsed ?? [0, 0, 0, 0, 0, 0, 0, 0, 0]),
          ];

          newUsed[index] = (newUsed[index] ?? 0) + 1;

          const slotUpdate: Partial<Actor> = {
            system: {
              ...actor.system,
              spellSlotsUsed: newUsed,
            },
          };

          worldStore.updateActor(worldId, actor.id, slotUpdate);

          if (updatedActor.system) {
            updatedActor.system.spellSlotsUsed = newUsed;
          }
        }

        if (socket) {
          emitEntityUpdate(socket, updatedActor);
        }
      },
    });
  } else {
    // Заклинание без урона/атаки (самобафф вроде Щита): списываем ячейку
    // (для уровневых) и накладываем эффекты на самого заклинателя.
    castBuffSpellMacro(spell, actor, lockedSpellLevel);
  }
}

/**
 * Накладывает эффекты заклинания с `effectTarget: 'target'` на выбранную цель —
 * для каста с хотбара. Переиспользует общий `targetStore.applyEffectsToTarget`
 * (тот же путь, что у оружия и существ). Для безуронных заклинаний это
 * единственный фидбек, поэтому дополнительно пишем строку в чат.
 *
 * @param spell - заклинание
 */
function applyTargetSpellEffectsMacro(spell: Spell): void {
  const targetEffects = getTargetSpellEffects(spell);

  if (targetEffects.length === 0) {
    return;
  }

  const targetName = useTargetStore().applyEffectsToTarget(
    targetEffects,
    'spell',
  );

  if (targetName) {
    useChatStore().sendMessage(
      `${spell.name}\n→ ${targetName}: [${targetEffects
        .map((effect) => effect.name)
        .join(', ')}]`,
      'text',
    );
  }
}

/**
 * Каст заклинания без урона и без реального броска атаки (самобафф вроде Щита,
 * либо наложение эффекта на цель при автопопадании) через макрос хотбара. Для
 * уровневых не-врождённых открывает окно выбора ячейки и кладёт self-эффекты
 * заклинателю тем же обновлением сущности, что и списание ячейки (без гонки
 * эмитов). Эффекты с effectTarget 'target' вешаются на выбранную цель.
 *
 * @param spell - заклинание
 * @param actor - актор-заклинатель
 * @param lockedSpellLevel - зафиксированный круг (если задан)
 */
function castBuffSpellMacro(
  spell: Spell,
  actor: Actor,
  lockedSpellLevel?: number,
): void {
  const casterEffects = getCasterSpellEffects(spell);
  const isInnate = !!spell.uses;

  const worldStore = useWorldStore();
  const chatStore = useChatStore();

  /**
   * Добавляет эффекты заклинания к клону актёра и шлёт анонс в чат.
   *
   * @param target - клон актёра-заклинателя для отправки
   */
  const appendEffects = (target: Actor): void => {
    if (casterEffects.length === 0) {
      return;
    }

    if (!target.activeEffects) {
      target.activeEffects = [];
    }

    // Само-баффы не стакаются: повтор ЗАМЕНЯЕТ/обновляет прежний (5e 2024).
    // Само-бафф: носитель = источник = кастер (нужно для точной turn-длительности
    // «до конца моего следующего хода» и пропуска текущего хода).
    target.activeEffects = mergeAppliedEffects(
      target.activeEffects,
      instantiateSpellEffects(casterEffects).map((effect) =>
        stampEffectTurnDuration(effect, actor.id, actor.id),
      ),
    );

    chatStore.sendMessage(
      `${spell.name}\n→ ${actor.name}: [${casterEffects
        .map((effect) => effect.name)
        .join(', ')}]`,
      'text',
    );
  };

  // Уровневые (не врождённые): окно выбора круга. Списание ячейки и эффекты —
  // одним обновлением сущности.
  if (spell.level > 0 && !isInnate) {
    const { openModal } = useModalManager();
    const pactInfo = getPactSlotInfo(actor.system?.classes ?? []);

    openModal('DiceRollModal', {
      title: `Заклинание — ${spell.name}`,
      rollLabel: spell.name,
      rollButtonText: 'Применить',
      skipRoll: true,
      spellLevel: lockedSpellLevel ?? spell.level,
      availableSpellLevels: computeAvailableLevels(
        lockedSpellLevel,
        spell.level,
        actor,
      ),
      pactSlotLevel: pactInfo.level,
      onSpellSlotConsume: (
        castLevel: number,
        consumeSlot: boolean,
        isPactSlot: boolean,
      ) => {
        const worldId = worldStore.connectionState.currentWorldId;

        if (!worldId) {
          return;
        }

        const socket = chatStore.getSocket();
        const updatedActor: Actor = JSON.parse(JSON.stringify(actor));

        if (consumeSlot && castLevel > 0 && updatedActor.system) {
          if (isPactSlot) {
            updatedActor.system.pactSlotsUsed =
              (actor.system?.pactSlotsUsed ?? 0) + 1;
          } else {
            const index = castLevel - 1;

            const newUsed = [
              ...(actor.system?.spellSlotsUsed ?? [0, 0, 0, 0, 0, 0, 0, 0, 0]),
            ];

            newUsed[index] = (newUsed[index] ?? 0) + 1;
            updatedActor.system.spellSlotsUsed = newUsed;
          }
        }

        appendEffects(updatedActor);

        // Локальный стор + сервер одним полным обновлением сущности
        worldStore.updateActor(worldId, actor.id, {
          system: updatedActor.system,
          activeEffects: updatedActor.activeEffects,
        });

        if (socket) {
          emitEntityUpdate(socket, updatedActor);
        }

        // Эффекты на выбранную цель (effectTarget 'target') — отдельной
        // сущности, отдельным обновлением (без гонки с апдейтом кастера).
        applyTargetSpellEffectsMacro(spell);
      },
    });

    return;
  }

  // Заговоры/врождённые — без ячеек: применяем эффекты (на себя и/или на цель)
  const worldId = worldStore.connectionState.currentWorldId;

  if (worldId && casterEffects.length > 0) {
    const socket = chatStore.getSocket();
    const updatedActor: Actor = JSON.parse(JSON.stringify(actor));

    appendEffects(updatedActor);

    worldStore.updateActor(worldId, actor.id, {
      activeEffects: updatedActor.activeEffects,
    });

    if (socket) {
      emitEntityUpdate(socket, updatedActor);
    }
  }

  applyTargetSpellEffectsMacro(spell);
}

/**
 * Собирает все действия существа в плоский массив.
 * Включает черты, действия, бонусные действия, реакции и легендарные действия.
 *
 * @param creature - существо
 * @returns плоский массив всех действий
 */
function collectCreatureActions(
  creature: Creature,
): import('@vtt/shared/system/dnd.js').CreatureAction[] {
  return [
    ...(creature.system.traits ?? []),
    ...(creature.system.actions ?? []),
    ...(creature.system.bonusActions ?? []),
    ...(creature.system.reactions ?? []),
    ...(creature.system.legendary?.actions ?? []),
  ];
}

/**
 * Регистрирует executor для макроса типа `creature-action`.
 * Вызывается из `registerDnd5eMacros` при инициализации сцены.
 */
function registerCreatureActionMacro(): void {
  registerMacro('creature-action', (macro, context) => {
    try {
      const rawCreature =
        context.creatures.find(
          (existingCreature) => existingCreature.id === macro.actorId,
        ) ?? context.actor;

      const foundCreature = isDnDCreatureEntity(rawCreature)
        ? rawCreature
        : null;

      if (!foundCreature || !macro.ref) {
        console.warn('[Hotbar] Существо или действие не найдено:', macro.ref);

        return;
      }

      const allActions = collectCreatureActions(foundCreature);

      const action = allActions.find(
        (creatureAction) => creatureAction.name === macro.ref,
      );

      if (!action) {
        console.warn('[Hotbar] Действие не найдено в существе:', macro.ref);

        return;
      }

      const hasAttackParams = !!(
        action.attackBonus !== undefined
        || action.damageParts?.length
        || (action.saveType && action.saveType !== 'none')
      );

      if (!hasAttackParams) {
        const chatStore = useChatStore();

        const description = action.description
          ? action.description.join(' ')
          : '';

        chatStore.sendMessage(
          `<b>${action.name}</b><br/>${description}`,
          'text',
        );

        return;
      }

      const targetStore = useTargetStore();
      const chatStore = useChatStore();

      // --- Проверка дистанции (только для прямых атак; область — шаблоном) ---
      let isDisadvantage = false;

      if (
        !action.areaOfEffect
        && targetStore.targetTokenId
        && foundCreature.id
      ) {
        const rangeCheck = checkCreatureActionRangeOnScene(
          action,
          foundCreature.id,
          targetStore.targetTokenId,
        );

        if (rangeCheck && !rangeCheck.allowed) {
          chatStore.sendMessage(
            `⛔ ${action.name}: цель вне досягаемости (${rangeCheck.distance} ${rangeCheck.unitLabel})`,
            'text',
          );

          return;
        }

        if (rangeCheck?.disadvantage) {
          isDisadvantage = true;
        }
      }

      // Область: размещаем шаблон у токена существа, затем кидаем урон
      if (action.areaOfEffect) {
        const templateStore = useSpellTemplateStore();
        const first = action.damageParts?.[0];

        const primaryType = first
          ? describeDamagePart(first).types[0]
          : undefined;

        const color =
          SPELL_DAMAGE_TEMPLATE_COLORS[primaryType ?? '']
          ?? SPELL_TEMPLATE_DEFAULT_COLOR;

        templateStore.requestPlacement(
          action.areaOfEffect,
          color,
          foundCreature.id,
          (templateId) =>
            openCreatureActionRoll(
              foundCreature,
              action,
              isDisadvantage,
              templateId,
            ),
          null,
        );

        return;
      }

      openCreatureActionRoll(foundCreature, action, isDisadvantage, undefined);
    } catch (err) {
      console.error('[Hotbar] Ошибка выполнения creature-action:', err);
    }
  });
}

/**
 * Открывает DiceRollModal для действия существа (многочастный путь, единая со
 * заклинаниями/оружием система урона). Атаки — с броском попадания и эффектами
 * на цель при попадании; спасброски/область — без броска попадания, спасброски
 * и эффекты применяются оркестратором по каждой задетой цели.
 *
 * @param creature - существо-источник
 * @param action - действие существа
 * @param isDisadvantage - стартовать с помехой (проверка дистанции)
 * @param templateId - id размещённого AoE-шаблона (если действие с областью)
 */
function openCreatureActionRoll(
  creature: Creature,
  action: CreatureAction,
  isDisadvantage: boolean,
  templateId: string | undefined,
): void {
  const { openModal } = useModalManager();

  const { buildCreatureRollSetup, buildTargetHpContext } =
    useBonusDamageParts();

  const usesSaveOrArea =
    (!!action.saveType && action.saveType !== 'none') || !!action.areaOfEffect;

  const effects = collectActiveEffects(creature);

  const targetHp = action.areaOfEffect ? undefined : buildTargetHpContext();

  const targetIsFull = targetHp
    ? targetHp.currentHp >= targetHp.maxHp
    : undefined;

  const setup = buildCreatureRollSetup({
    action,
    creature,
    effects,
    targetIsFull,
  });

  const enabledEffects = action.activeEffects?.filter(
    (effect) => !effect.disabled,
  );

  // Эффекты применяет оркестратор per-target (гейт по applySave/приземлению) —
  // одинаково для атак и для спас/области. Прямое onHit-применение УБРАНО: оно
  // вешало эффект на КАЖДОЕ попадание, игнорируя «Спасбросок при наложении»
  // (баг проявлялся только при запуске действия с хотбара).
  setup.pseudoSpell.activeEffects = enabledEffects?.length
    ? enabledEffects
    : undefined;

  const first = action.damageParts?.[0];
  const damageType = first ? describeDamagePart(first).types[0] : undefined;

  // Помеха/преимущество атакующего существа: флаги существа (общие + профильные)
  // + флаги attacksAgainst цели + помеха дистанции. Раньше действия существа
  // учитывали только дистанцию и игнорировали флаги (Злая насмешка не работала).
  const actionRollMode: AttackRollMode = usesSaveOrArea
    ? 'normal'
    : resolveAttackRollMode({
        attackerFlags: resolveActorStats(creature).activeFlags,
        attackType: action.rangeType === 'ranged' ? 'ranged' : 'melee',
        targetFlags: useTargetStore().getTargetFlags(),
        forceDisadvantage: isDisadvantage,
      });

  openModal('DiceRollModal', {
    title: usesSaveOrArea ? action.name : `Атака — ${action.name}`,
    rollLabel: action.name,
    rollButtonText: usesSaveOrArea ? 'Бросить урон' : 'Атаковать',
    formula: setup.baseParts[0]?.formula ?? '',
    attackModifier: usesSaveOrArea ? undefined : action.attackBonus,
    initialRollMode: actionRollMode,
    incomingAttackType: action.rangeType === 'ranged' ? 'ranged' : 'melee',
    damageType,
    damageParts: setup.baseParts,
    evaluateBonusDamageParts: setup.evaluateBonusDamageParts,
    onRollParts: (parts: RolledSpellDamagePart[]) =>
      applyCreatureActionParts(
        creature,
        action,
        setup.pseudoSpell,
        parts,
        templateId,
      ),
    // Расход одноразовых эффектов «следующей атаки» на броске атаки существа
    onAttackRolled: usesSaveOrArea
      ? undefined
      : () => {
          const attackSocket = useChatStore().getSocket();

          if (attackSocket) {
            consumeAttackRollEffects(
              creature,
              useTargetStore().getTargetActor(),
              attackSocket,
            );
          }
        },
  });
}

/**
 * Применяет брошенные части урона действия существа через многочастный
 * оркестратор (спасброски целей, защиты по типу, AoE-шаблон, единый HP-апдейт).
 *
 * @param creature - существо-источник (casterId)
 * @param action - действие (источник DC спасброска)
 * @param pseudoSpell - псевдо-заклинание действия
 * @param parts - брошенные части урона
 * @param templateId - id размещённого AoE-шаблона (если был)
 */
function applyCreatureActionParts(
  creature: Creature,
  action: CreatureAction,
  pseudoSpell: import('@vtt/shared/system/dnd.js').Spell,
  parts: RolledSpellDamagePart[],
  templateId: string | undefined,
): void {
  const worldStore = useWorldStore();
  const chatStore = useChatStore();
  const socket = chatStore.getSocket();
  const worldId = worldStore.connectionState.currentWorldId;

  if (!worldId || !socket) {
    return;
  }

  const world = worldStore.worlds.find((entry) => entry.id === worldId);
  const actors = [...(world?.actors ?? []), ...(world?.creatures ?? [])];

  const templateStore = useSpellTemplateStore();

  let cachedTemplate: MeasurementTemplate | null = null;

  if (templateId) {
    cachedTemplate = templateStore.getPlacedTemplate(templateId) ?? null;
    templateStore.removePlacedTemplate(templateId);
  }

  if (actors.length > 0) {
    const { resolveSpellDamageWithParts } = useSpellResolution();

    void resolveSpellDamageWithParts(
      {
        spell: pseudoSpell,
        damageTotal: 0,
        spellSaveDC: action.saveDC ?? 10,
        actors,
        socket,
        casterId: creature.id,
      },
      parts,
      { scene: worldStore.currentScene, cachedTemplate },
    );
  }

  if (templateId) {
    templateStore.deleteTemplate(templateId);
  }
}

/**
 * Списывает один заряд заклинания существа (для заклинаний с откатом, не «по
 * желанию») и персистит изменение (локально + сокет).
 *
 * @param creature - существо-источник
 * @param spell - заклинание
 */
function consumeCreatureSpellUse(creature: Creature, spell: Spell): void {
  if (!spell.uses || spell.uses.recovery === 'atWill') {
    return;
  }

  const worldStore = useWorldStore();
  const chatStore = useChatStore();
  const worldId = worldStore.connectionState.currentWorldId;

  if (!worldId) {
    return;
  }

  const updatedSpells = (creature.spells ?? []).map((entry) =>
    entry.id === spell.id && entry.uses
      ? {
          ...entry,
          uses: {
            ...entry.uses,
            current: Math.max(0, entry.uses.current - 1),
          },
        }
      : entry,
  );

  worldStore.updateCreature(worldId, creature.id, { spells: updatedSpells });

  const socket = chatStore.getSocket();

  if (socket) {
    emitEntityUpdate(socket, {
      ...creature,
      spells: updatedSpells,
    } as DnDSceneEntity);
  }
}

/**
 * Регистрирует executor для макроса типа `creature-spell` (заклинания существа
 * с хотбара). Резолвит существо и заклинание по id, списывает заряд и открывает
 * бросок тем же многочастным путём, что и лист существа.
 */
function registerCreatureSpellMacro(): void {
  registerMacro('creature-spell', (macro, context) => {
    try {
      const rawCreature =
        context.creatures.find(
          (existingCreature) => existingCreature.id === macro.actorId,
        ) ?? context.actor;

      const foundCreature = isDnDCreatureEntity(rawCreature)
        ? rawCreature
        : null;

      if (!foundCreature || !macro.ref) {
        console.warn('[Hotbar] Существо или заклинание не найдено:', macro.ref);

        return;
      }

      const spell = foundCreature.spells?.find(
        (entry) => entry.id === macro.ref,
      );

      if (!spell) {
        console.warn('[Hotbar] Заклинание не найдено в существе:', macro.ref);

        return;
      }

      const chatStore = useChatStore();

      if (
        spell.uses
        && spell.uses.recovery !== 'atWill'
        && spell.uses.current <= 0
      ) {
        chatStore.sendMessage(
          `⛔ ${spell.name}: не осталось зарядов — нужен отдых.`,
          'text',
        );

        return;
      }

      consumeCreatureSpellUse(foundCreature, spell);

      // Область: размещаем шаблон у токена существа, затем кидаем урон
      if (spell.areaOfEffect) {
        const templateStore = useSpellTemplateStore();
        const first = spell.damageParts?.[0];

        const primaryType = first
          ? describeDamagePart(first).types[0]
          : undefined;

        const color =
          SPELL_DAMAGE_TEMPLATE_COLORS[primaryType ?? '']
          ?? SPELL_TEMPLATE_DEFAULT_COLOR;

        templateStore.requestPlacement(
          spell.areaOfEffect,
          color,
          foundCreature.id,
          (templateId) =>
            openCreatureSpellRoll(foundCreature, spell, templateId),
          null,
        );

        return;
      }

      openCreatureSpellRoll(foundCreature, spell, undefined);
    } catch (err) {
      console.error('[Hotbar] Ошибка выполнения creature-spell:', err);
    }
  });
}

/**
 * Открывает DiceRollModal для заклинания существа (многочастный путь). Атакующие
 * заклинания — с броском попадания (плоский бонус из блока заклинательства),
 * спасброски/область — без него.
 *
 * @param creature - существо-источник
 * @param spell - заклинание существа
 * @param templateId - id размещённого AoE-шаблона (если область)
 */
function openCreatureSpellRoll(
  creature: Creature,
  spell: Spell,
  templateId: string | undefined,
): void {
  const { openModal } = useModalManager();
  const targetStore = useTargetStore();

  const { buildCreatureSpellRollSetup } = useBonusDamageParts();

  const attackType = getSpellAttackType(spell);

  const usesSaveOrArea =
    (!!spell.saveType && spell.saveType !== 'none') || !!spell.areaOfEffect;

  const usesAttack = attackType !== undefined && !usesSaveOrArea;

  const effects = collectActiveEffects(creature);

  const setup = buildCreatureSpellRollSetup({
    spell,
    creature,
    effects,
    targetIsFull: undefined,
  });

  const enabledEffects = spell.activeEffects?.filter(
    (effect) => !effect.disabled,
  );

  let onHit: (() => void) | undefined;

  if (!usesAttack) {
    setup.pseudoSpell.activeEffects = enabledEffects?.length
      ? enabledEffects
      : undefined;
  } else if (enabledEffects?.length) {
    onHit = () => {
      targetStore.applyEffectsToTarget(enabledEffects, 'feature');
    };
  }

  const isHealing = spellIsHealing(spell);
  const first = spell.damageParts?.[0];
  const damageType = first ? describeDamagePart(first).types[0] : undefined;

  const spellcasting = creature.system.spellcasting;

  // Помеха/преимущество атакующего существа-заклинателя: флаги существа (общие +
  // профильные attack.spell.*) + attacksAgainst цели. Раньше всегда 'normal'.
  const spellRollMode: AttackRollMode = usesAttack
    ? resolveAttackRollMode({
        attackerFlags: resolveActorStats(creature).activeFlags,
        attackType: 'spell',
        targetFlags: targetStore.getTargetFlags(),
      })
    : 'normal';

  openModal('DiceRollModal', {
    title: usesAttack ? `Атака — ${spell.name}` : spell.name,
    rollLabel: spell.name,
    rollButtonText: getCreatureSpellRollButtonText(usesAttack, isHealing),
    formula: setup.baseParts[0]?.formula ?? '',
    attackModifier: usesAttack ? spellcasting?.attackBonus : undefined,
    initialRollMode: spellRollMode,
    incomingAttackType: usesAttack ? attackType : undefined,
    damageType,
    isHealing,
    damageParts: setup.baseParts,
    evaluateBonusDamageParts: setup.evaluateBonusDamageParts,
    onRollParts: (parts: RolledSpellDamagePart[]) =>
      applyCreatureSpellParts(
        creature,
        spell,
        setup.pseudoSpell,
        parts,
        templateId,
      ),
    onHit,
    // Расход одноразовых эффектов «следующей атаки» на броске атаки существа
    onAttackRolled: usesAttack
      ? () => {
          const attackSocket = useChatStore().getSocket();

          if (attackSocket) {
            consumeAttackRollEffects(
              creature,
              targetStore.getTargetActor(),
              attackSocket,
            );
          }
        }
      : undefined,
  });
}

/**
 * Применяет брошенные части урона/лечения заклинания существа через
 * многочастный оркестратор. DC спасброска — плоский из блока заклинательства.
 *
 * @param creature - существо-источник (casterId)
 * @param spell - заклинание (источник saveType/saveEffect)
 * @param pseudoSpell - псевдо-заклинание (клон с activeEffects)
 * @param parts - брошенные части урона
 * @param templateId - id размещённого AoE-шаблона (если был)
 */
function applyCreatureSpellParts(
  creature: Creature,
  spell: Spell,
  pseudoSpell: Spell,
  parts: RolledSpellDamagePart[],
  templateId: string | undefined,
): void {
  const worldStore = useWorldStore();
  const chatStore = useChatStore();
  const socket = chatStore.getSocket();
  const worldId = worldStore.connectionState.currentWorldId;

  if (!worldId || !socket) {
    return;
  }

  const world = worldStore.worlds.find((entry) => entry.id === worldId);
  const actors = [...(world?.actors ?? []), ...(world?.creatures ?? [])];

  const templateStore = useSpellTemplateStore();

  let cachedTemplate: MeasurementTemplate | null = null;

  if (templateId) {
    cachedTemplate = templateStore.getPlacedTemplate(templateId) ?? null;
    templateStore.removePlacedTemplate(templateId);
  }

  if (actors.length > 0) {
    const { resolveSpellDamageWithParts } = useSpellResolution();

    void resolveSpellDamageWithParts(
      {
        spell: pseudoSpell,
        damageTotal: 0,
        spellSaveDC: creature.system.spellcasting?.saveDC ?? 10,
        actors,
        socket,
        casterId: creature.id,
      },
      parts,
      { scene: worldStore.currentScene, cachedTemplate },
    );
  }

  if (templateId) {
    templateStore.deleteTemplate(templateId);
  }
}
