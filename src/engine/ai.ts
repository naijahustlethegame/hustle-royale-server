import type { BattleState, SkillDef, Unit } from "./types.js";

export const alive = (state: BattleState) => state.units.filter((u) => u.alive);
export const alliesOf = (state: BattleState, unit: Unit) => alive(state).filter((u) => u.side === unit.side);
export const enemiesOf = (state: BattleState, unit: Unit) => alive(state).filter((u) => u.side !== unit.side);

export function isReady(unit: Unit, skillIndex: number): boolean {
  const skill = unit.skills[skillIndex];
  return !!skill && unit.cooldowns[skillIndex] <= 0 && unit.energy >= skill.staminaCost;
}

const hpRatio = (u: Unit) => u.hp / u.maxHp;

/** Is it worth using this special right now? Keeps fighters from wasting skills. */
function worthCasting(state: BattleState, unit: Unit, skill: SkillDef): boolean {
  const allies = alliesOf(state, unit);
  const enemies = enemiesOf(state, unit);
  if (enemies.length === 0) return false;

  switch (skill.kind) {
    case "heal":
      if (skill.targetRule === "all_allies") {
        return allies.filter((a) => hpRatio(a) < 0.75).length >= 2;
      }
      return allies.some((a) => hpRatio(a) < 0.7);
    case "shield":
      if (skill.targetRule === "self") return unit.shield <= 0;
      return allies.some((a) => a.shield <= 0);
    case "buff": {
      const stat = skill.effect.stat;
      return !!stat && allies.some((a) => !a.mods.some((m) => m.stat === stat && m.pct > 0));
    }
    case "debuff": {
      const stat = skill.effect.stat;
      return !!stat && enemies.some((e) => !e.mods.some((m) => m.stat === stat && m.pct < 0));
    }
    case "damage":
      return true;
  }
}

/**
 * Picks which skill a unit should use this tick, or null if nothing is ready.
 * Specials are preferred over the basic attack. Healers keep enough energy in reserve for their heal.
 * Controlled units only ever auto-use the basic attack; their player triggers specials.
 */
export function aiChoose(state: BattleState, unit: Unit): number | null {
  const allowSpecials = !unit.controlled;
  const healReserve =
    unit.role === "healer"
      ? Math.max(0, ...unit.skills.filter((s) => s.kind === "heal").map((s) => s.staminaCost))
      : 0;

  if (allowSpecials) {
    for (let i = unit.skills.length - 1; i >= 1; i--) {
      const skill = unit.skills[i];
      if (!isReady(unit, i)) continue;
      if (skill.kind === "damage" && unit.energy - skill.staminaCost < healReserve) continue;
      if (worthCasting(state, unit, skill)) return i;
    }
  }
  return isReady(unit, 0) ? 0 : null;
}

/** Tanks draw aggro: they are twice as likely to be picked when a target is chosen at random. */
function pickWeighted(state: BattleState, pool: Unit[]): Unit {
  const weights = pool.map((u) => (u.role === "tank" ? 2 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = state.rng.next() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll < 0) return pool[i];
  }
  return pool[pool.length - 1];
}

export function resolveTargets(state: BattleState, unit: Unit, skill: SkillDef, explicitId?: string): Unit[] {
  const allies = alliesOf(state, unit);
  const enemies = enemiesOf(state, unit);
  const byId = (id?: string) => (id ? alive(state).find((u) => u.id === id) : undefined);

  switch (skill.targetRule) {
    case "self":
      return [unit];
    case "all_allies":
      return allies;
    case "all_enemies":
      return enemies;
    case "ally_lowest_hp": {
      const chosen = byId(explicitId);
      if (chosen && chosen.side === unit.side) return [chosen];
      return [allies.reduce((low, a) => (hpRatio(a) < hpRatio(low) ? a : low), allies[0])];
    }
    case "enemy_lowest_hp": {
      const chosen = byId(explicitId);
      if (chosen && chosen.side !== unit.side) return [chosen];
      return [enemies.reduce((low, e) => (e.hp < low.hp ? e : low), enemies[0])];
    }
    case "enemy_nearest": {
      const chosen = byId(explicitId) ?? byId(unit.focusId ?? undefined);
      if (chosen && chosen.side !== unit.side) return [chosen];
      return [pickWeighted(state, enemies)];
    }
  }
}
