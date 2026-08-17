# Knight Statboard & Age Perks — Design

Approved 2026-08-16. Extends spec §3/§5. Rule preserved: nothing ever subtracts XP or levels.

## The 11 knights (rename; replaces both old age names AND the separate title ladder)

| LV | Name | Passive perk |
|---|---|---|
| 1 | ROOKIE KNIGHT | — |
| 10 | TRAINED KNIGHT | +5% workout XP |
| 20 | VETERAN KNIGHT | +5% siege damage |
| 30 | ELITE KNIGHT | optional-XP bonus cap +1 |
| 40 | DUNGEON KNIGHT | boss nightly heal 1.5% → 1.25% |
| 50 | DUNGEON SLAYER | +10% siege damage (stacks: 1.15× total) |
| 60 | ABYSS KNIGHT | Ember capacity 2 → 3 |
| 70 | ABYSS SLAYER | crit cap ×2.0 → ×2.2 |
| 80 | LEGENDARY DUNGEON SLAYER | boss strikes: 10 → 8 HP |
| 90 | MYTHIC DUNGEON SLAYER | HP regen 5 → 8 per C+ day |
| 100 | ULTIMATE DUNGEON SLAYER | siege overkill carryover 25% → 50% |

Perks apply from the CURRENT armor age during recompute (retroactive on fold — deterministic).

## Stats (derived from history on every recompute)

- **STR** = 10 + finished workout sessions. Workout-kind quest XP multiplier:
  `1 + min(0.5, 0.01·(STR−10)) + (age≥10 ? 0.05 : 0)`, applied to base XP before the streak multiplier, round half-up.
- **WIL** = 10 + count of sealed S/S+ days. Main-quest siege crit multiplier:
  `min(cap, 1.5 + 0.01·(WIL−10))`, cap = age≥70 ? 2.2 : 2.0. (Replaces the fixed ×1.5.)
- **STAM** = 10 + water-goal days (sealed days where Σ hydration ≥ goal.waterOz). Optional-bonus cap in day scoring: `min(10, 5 + floor((STAM−10)/5) + (age≥30 ? 1 : 0))`.
- **VIT is retired** as a displayed stat (HP takes its slot).

## HP (protein armor)

- Protein day = sealed day where Σ protein of that day's meals ≥ goal.protein.
- `maxHp = min(100, 20 + 2·proteinDays)`.
- Fold over sealed days in order (inside the streak fold, ONE source of truth for embers):
  - Day sealed < C: hp −= (age≥80 ? 8 : 10). If hp ≤ 0 AND embers > 0: steal 1 ember, hp = ceil(max/2). If hp ≤ 0 and no embers: hp = 0 (floor).
  - Day sealed ≥ C: hp += (age≥90 ? 8 : 5), capped at maxHp.
  - maxHp grows as protein days accumulate through the fold (hp never exceeds current max).
- `wounded = hp < maxHp/2` (visual: dimmed knight card overlay 'WOUNDED', ember-red HP bar).
- Ember capacity: age≥60 ? 3 : 2 (fold banks up to capacity).

## Siege interactions

- damage = round(xpAwarded · dmgMult · (main ? critMult : 1)), dmgMult = 1 + (age≥20?0.05:0) + (age≥50?0.10:0).
- bossHeal pct = age≥40 ? 0.0125 : 0.015.
- overkill carryover factor = age≥100 ? 0.5 : 0.25.

## UI

- Today: `LV n {AGE NAME}`; Hero: HP bar under the knight card (`HP 34/56`, ember-red fill, WOUNDED tag when wounded), stat tiles STR/HP/WIL/STAM each with feeder caption (`4 SESSIONS`, `18 PROTEIN DAYS`, `3 S-DAYS`, `12 WATER DAYS`); Armory tiles: new names + perk line; level-up reveal uses new names.

## Engine surface

New `src/game/body.ts`: AGE_PERKS table + pure helpers `workoutXpMult(str, level)`, `critMult(wil, level)`, `optionalCap(stam, level)`, `strikeDamage(level)`, `regenAmount(level)`, `healPct(level)`, `dmgMult(level)`, `carryFactor(level)`, `emberCapacity(level)`, `maxHpFor(proteinDays)`. `foldStreaks` gains optional per-day body input `{proteinOk, waterOk}` + `level`, returns body state `{hp, maxHp, wounded, proteinDays, waterDays, sRankDays}`; ember banking capacity and boss steals live inside this single fold.
