// HoloPrint's player and UI controls reach the armour stand through temp variables, which get wiped whenever an attachable is evaluated, even if it isn't drawn. Worn armour is an attachable, so another player wearing armour nearby broke the controls.
// Resource packs can't override vanilla attachables, and enable_attachables is set per entity type, so attachables are disabled on all players and armour is redrawn by the player's own render controllers instead (these don't wipe temp variables).
// Trade-offs: no enchantment glint, trims or leather dye on player armour; elytra aren't drawn; shields, spears, spyglasses and maces render as regular items.

import { jsonc } from "./utils.js";

/** Armour material item prefix to texture prefix (textures/models/armor/<prefix>_<layer>) */
const ARMOR_MATERIALS = {
	leather: "leather",
	chainmail: "chain",
	copper: "copper",
	iron: "iron",
	golden: "gold",
	diamond: "diamond",
	netherite: "netherite"
};
/** Armour piece (matching the vanilla geometry.player.armor.<piece> geometries) to equipment slot */
const ARMOR_SLOTS = {
	helmet: "slot.armor.head",
	chestplate: "slot.armor.chest",
	leggings: "slot.armor.legs",
	boots: "slot.armor.feet"
};
/** Skin outer layer visibility variables that the armour attachables used to set. The helmet one is already handled by q.has_head_gear in the vanilla player entity. */
const SKIN_LAYER_VARIABLES = {
	chestplate: "v.chest_layer_visible",
	leggings: "v.leg_layer_visible",
	boots: "v.boot_layer_visible"
};
const THIRD_PERSON_RENDER_CONTROLLER = "controller.render.player.third_person";

/**
 * Makes the player entity with attachables disabled, and render controllers to draw armour on it.
 * Armour items and textures are listed here rather than read from the vanilla attachables because not all of them can be fetched.
 * @param {ResourcePackStack} resourcePackStack
 * @returns {Promise<{ playerEntity: Record<string, any>, armorRenderControllers: Record<string, any> }>}
 */
export default async function makePlayerArmorFix(resourcePackStack) {
	let playerEntity = await resourcePackStack.fetchResource("entity/player.entity.json").then(res => jsonc(res));
	let entityDescription = playerEntity["minecraft:client_entity"]["description"];
	entityDescription["enable_attachables"] = false;
	entityDescription["materials"]["holoprint_armor"] = "armor";
	let thirdPersonCondition = entityDescription["render_controllers"].find(renderController => THIRD_PERSON_RENDER_CONTROLLER in renderController)?.[THIRD_PERSON_RENDER_CONTROLLER] ?? "!variable.is_first_person";

	let armorRenderControllers = {};
	Object.entries(ARMOR_SLOTS).forEach(([piece, slotName]) => {
		let textureLayer = piece == "leggings"? 2 : 1;
		/** @type {[string, string][]} item, texture path */
		let armorPieces = Object.entries(ARMOR_MATERIALS).map(([material, texturePrefix]) => [`minecraft:${material}_${piece}`, `textures/models/armor/${texturePrefix}_${textureLayer}`]);
		if(piece == "helmet") {
			armorPieces.push(["minecraft:turtle_helmet", "textures/models/armor/turtle_1"]);
		}
		let isWearingArmor = `q.is_item_name_any('${slotName}', ${armorPieces.map(([item]) => `'${item}'`).join(", ")})`;

		entityDescription["geometry"][`holoprint_armor_${piece}`] = `geometry.player.armor.${piece}`;
		let textureNames = armorPieces.map(([item, texturePath]) => {
			let textureName = `holoprint_armor_${item.replace("minecraft:", "")}`;
			entityDescription["textures"][textureName] = texturePath;
			return `Texture.${textureName}`;
		});
		let textureIndex = armorPieces.map(([item], i) => `${i} * q.is_item_name_any('${slotName}', '${item}')`).slice(1).join(" + "); // only one piece can be worn per slot, so this sum is the index of that piece
		let renderControllerId = `controller.render.holoprint.player_armor.${piece}`;
		armorRenderControllers[renderControllerId] = {
			arrays: {
				textures: {
					"Array.armor": textureNames
				}
			},
			geometry: `Geometry.holoprint_armor_${piece}`,
			materials: [{ "*": "Material.holoprint_armor" }],
			textures: [`Array.armor[${textureIndex}]`]
		};
		entityDescription["render_controllers"].push({
			[renderControllerId]: `(${thirdPersonCondition}) && ${isWearingArmor}`
		});
		if(piece in SKIN_LAYER_VARIABLES) {
			entityDescription["scripts"]["pre_animation"].push(`${SKIN_LAYER_VARIABLES[piece]} = !${isWearingArmor};`);
		}
	});

	return {
		playerEntity,
		armorRenderControllers: {
			format_version: "1.8.0",
			render_controllers: armorRenderControllers
		}
	};
}

/** @import ResourcePackStack from "./ResourcePackStack.js" */
