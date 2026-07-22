/**
 * РўРѕС‡РєР° РІС…РѕРґР° РЎРђРњРћР”РћРЎРўРђРўРћР§РќРћР“Рћ РєР»РёРµРЅС‚СЃРєРѕРіРѕ Р±Р°РЅРґР»Р° СЃРёСЃС‚РµРјС‹ D&D 5e (Р¤Р°Р·Р° 5, S6).
 *
 * РЎРѕР±РёСЂР°РµС‚СЃСЏ `vite.system.config.ts` РІ РѕРґРёРЅ IIFE-С„Р°Р№Р» `dist/systems/dnd5e/client.js`
 * (+ `client.css`). РџСЂРёР»РѕР¶РµРЅРёРµ-РІРЅСѓС‚СЂРµРЅРЅРёРµ РјРѕРґСѓР»Рё (`@/*`, `pinia`, `@nuxt/ui`,
 * `@vtt/shared`-РєРѕСЂРµРЅСЊвЂ¦) РІ Р±Р°РЅРґР» РќР• РёРЅР»Р°Р№РЅСЏС‚СЃСЏ вЂ” РѕРЅРё РїРѕРјРµС‡РµРЅС‹ external Рё РІ СЂР°РЅС‚Р°Р№РјРµ
 * СЂРµР·РѕР»РІСЏС‚СЃСЏ РёР· `globalThis.__VTTHost` (РѕР±С‰РёРµ СЃРёРЅРіР»С‚РѕРЅС‹ С…РѕСЃС‚Р°), Р° `vue` вЂ” РёР·
 * `globalThis.Vue`. РРЅР»Р°Р№РЅСЏС‚СЃСЏ С‚РѕР»СЊРєРѕ РєРѕРґ `systems/dnd5e/**` Рё РґРІРёР¶РѕРє РїСЂР°РІРёР»
 * `@vtt/shared/system/dnd.js`.
 *
 * РџСЂРё Р·Р°РіСЂСѓР·РєРµ С‡РµСЂРµР· `<script>` (СЂР°РЅС‚Р°Р№Рј-РїСѓС‚СЊ `/system-assets/dnd5e/client.js`) С„Р°Р№Р»
 * СЃР°РјСЂРµРіРёСЃС‚СЂРёСЂСѓРµС‚СЃСЏ вЂ” СЂРѕРІРЅРѕ РєР°Рє РїРѕР»СЊР·РѕРІР°С‚РµР»СЊСЃРєР°СЏ СЃРёСЃС‚РµРјР°. РўР°Рє РІСЃС‚СЂРѕРµРЅРЅР°СЏ dnd5e
 * СЃС‚Р°РЅРѕРІРёС‚СЃСЏ РєРѕРїРёСЂСѓРµРјРѕР№ РїР°РїРєРѕР№ (index.js + client.js + client.css + system.json +
 * data/), РЅРµ РѕС‚Р»РёС‡Р°СЏСЃСЊ РїРѕ РјРµС…Р°РЅРёРєРµ РѕС‚ galaxy-saga.
 *
 * @module systems/dnd5e/systemEntry
 */

import type { ClientSystemAPI } from '@/core/systemBootstrap';

import { registerClientSystem } from './clientSystem';

globalThis.VTTSystems.register('dnd5e-2024', (api: ClientSystemAPI) => {
  registerClientSystem(api);
});
