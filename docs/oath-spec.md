# OATH — Complete Project Specification
Dark retro life-RPG for iPhone · Design + systems + architecture · v1.0 · Aug 16, 2026

---

## 1. Concept

Oath is a native iPhone app that turns real daily life into a dark retro RPG. Real-world actions are quests; completing them progresses a low-poly knight, XP, levels, daily rank, streaks, a weekly boss fight, and a medieval world. The game layer is fundamental, not decorative. Target feel: **Dark Souls atmosphere × PS1 low-poly × an RPG quest log, except the quests are my actual life.** Simple, dark, retro, addictive, genuinely useful.

**The 2-second rule:** opening the app must instantly answer — what do I need to do today, what's done, how close am I to finishing, what rank am I on track for. Advanced features live deeper.

---

## 2. Visual system — "the Ledger" (locked)

Every screen is a page of one dark ledger: framed page, blackletter title, roman-numeral day, quest rows. Chosen from 5 explored directions (Character Hub, Quest Log, Adventure Path, Dark HUD, Dungeon Descent) — **Quest Log won.**

### Palette
| Role | Value |
|---|---|
| Background | `#080B08 → #060907` gradient; deepest `#050705` |
| Panels | `#0A100B`, borders `#1C2E22`, hairlines `#14211A` |
| Neon green (THE accent) | `#46FF7D` — progress, done, active, glow |
| Dim greens (text) | `#D6EFDB` high · `#8FAF97` mid · `#5E7565` low · `#52685A` faint |
| Amber (rare) | `#E8B54D` — main quest, PR, Legend tier only; one per screen |
| Ember red (enemy only) | `#E25B4A` — boss, danger, FAILED; never decoration |
| Text on green fills | `#04140A` |

### Type
- **VT323** — HUD numerals, quest names, body (never below 18px in-app)
- **Press Start 2P** — tiny section labels, 6–9px, wide tracking
- **Jacquard 12** — page titles (blackletter-pixel)
- **Cinzel Bold** — rank letters only
- No visible system font.

### Components
- Diamond checkboxes: hollow = todo · filled neon = done · dashed = optional · amber outline = main quest
- Segmented XP bars with neon glow; thin quantity bars (water, hydration)
- Rank letter inside a rotated-square diamond
- Panels: 1px border + 2px neon corner ticks (amber ticks for main quest)
- Page frame: inset 1px border with 4 corner ticks
- CRT: subtle scanlines + vignette overlay, user-toggleable
- Icons: 20px geometric strokes (diamond, list, dumbbell, flask, helm)
- Difficulty pips: 5 small squares

### Avoid
SaaS cards, Material Design, decorative gradients, emoji, cartoons, bright mobile-game clutter, more than one amber accent per screen. Readability beats aesthetic purity.

---

## 3. The Knight (locked)

Low-poly great-helm knight, PS1 rendering: flat per-face normals, vertex lighting, nearest-neighbor textures, low-FOV camera, optional 240p upscale dither. ~800–1,500 tris in SceneKit. Neon visor slit + neon chest sigil. Design reference: user's two paintings (standing crusader; kneeling hooded black knight).

### Armor ages — new age every 10 levels, cosmetic, never lost
| LV | Title | Gear |
|---|---|---|
| 1 | WANDERER | roughspun cloak, walking staff |
| 10 | SWORN | gambeson, iron cap, buckler |
| 20 | CRUSADER | mail + surcoat, red cross, kite shield |
| 30 | SERGEANT | riveted plate, heater shield |
| 40 | VETERAN | battle-notched plate, greatsword |
| 50 | WARDEN | cape, gold trim, gold sigil |
| 60 | CHAMPION | gilt greaves, halo sigil |
| 70 | BANNERET | war banner, gold cross |
| 80 | SENTINEL | blackened plate, ember visor, dark mantle |
| 90 | PALADIN | rune-etched plate, ember cross |
| 100 | LEGEND | hooded black requiem plate — the oath kept |

Stats: **STR** (training), **VIT** (streak consistency), **WIL** (rank history). Cosmetic unlocks beyond ages: helms, capes, crests (from Siege), titles, environments, UI effects.

---

## 4. Navigation — 5 tabs

### TODAY (home)
OATH wordmark · "Quest Log" title · DAY XXXVII (roman) · knight bust panel with LV/title, segmented XP bar, `2,440 / 3,000 XP · STREAK 5`, rank diamond · **MAIN QUEST** panel (amber corner ticks, difficulty pips, +XP) · **DAILY QUESTS n/m** rows (quantity quests show inline progress, e.g. water `92 / 128 OZ`) · **OPTIONAL — NO PENALTY** rows · Siege banner strip (`SIEGE — 70% HP`) · footer band `82% ━━━ RANK A` · tab bar.

### QUESTS (manage)
Week strip: 7 day cells, past days show earned rank letters, today highlighted · category filter chips (extensible, "+ RUNE" to add) · scheduled quest rows: name, MAIN tag, schedule line (`MON·WED·FRI — PPL ROTATION`, `EVERY DAY · AUTO-COMPLETES AT 128 OZ`), difficulty pips, per-quest streak · optional quests with weekly goals (`2/4 WK`) · **FORGE NEW QUEST** button.

**Quest editor fields:** name · category (default set + custom) · difficulty (Trivial/Easy/Medium/Hard/Elite) · kind (binary / quantity+target+unit / workout-linked / nutrition-linked) · main-quest flag · recurrence (every day, weekdays, weekends, specific days, every N days, x-per-week, monthly, one-time, custom) · reminders (multiple times, native notifications). Recurring quests materialize automatically each day — the day is never hand-built.

### TRAIN
Today's assigned workout = the main quest: exercise list (`BENCH PRESS 3×8·220`), **BEGIN SESSION +75 XP** · program week strip (`MON PUSH ✓ · WED PULL ✓ · FRI LEGS ✓ · SAT PUSH`) · session logger: set-by-set weight/reps, optional RPE, notes, rest timer; history saved automatically · exercise detail: stepped e1RM chart (square marks, amber PR point), weight/rep/volume charts, `12 WK AGO 245 → NOW 272 (+12%)` · best-lift tiles (Bench/Squat/Dead) · `NEW PR — 225×8 · +25 XP` banner · programs are reusable (PPL, Upper/Lower, custom), schedulable by weekday; the day's workout auto-becomes a quest. Training feeds STR.

### FUEL (nutrition)
Macro bars vs targets: calories `1,980/2,500`, protein `181/220g`, carbs, fat · **TELL THE LEDGER** natural-language input (`"10 oz chicken breast, 1 cup rice…"` → SCRIBE) routed to the Claude nutrition subagent · meals list with per-meal cal/protein and `EST 0.91` confidence badges; every number tap-to-correct → `CORRECTED` badge · **HYDRATION**: bar + quick-add `+8 / +12 / +16 OZ / CUSTOM` (preferred units switchable), water quest auto-completes at goal · **Meal Plan quest** auto-evaluates from configurable rules (protein goal hit, calories within band, ≥N meals logged). Nutrition never dominates the app.

### HERO
Knight stage: full character render on world-state backdrop, `WORLD: STRONGHOLD · VIGOR 81`, LV/title, STR/VIT/WIL · XP bar + `NEXT: LV 19 — CAPE UNLOCK` · **ARMORY** grid: unlocked and locked gear with unlock conditions (`LV 19`, `S×7`, `PR ✓`) · **CAMPAIGN calendar**: color-coded month (dark red poor `#5C2E22` → orange `#8A4A2E` → green `#2E7A47` → neon S-day `#46FF7D`), today outlined; tapping a day opens full recap: quests, completion %, rank, XP, workouts, nutrition, water, notes · **DEEDS** (achievements) with progress bars · streaks board (overall/perfect/S-rank/per-quest, current + best) · settings.

---

## 5. Game math (deterministic — every rule unit-testable)

### Difficulty table
| Difficulty | XP | Weight w |
|---|---|---|
| Trivial | 5 | 1 |
| Easy | 10 | 2 |
| Medium | 25 | 4 |
| Hard | 50 | 7 |
| Elite | 100 | 10 |

### Day score & rank
- Credit: `c = 1` if done; quantity quests `c = clamp(progress/target, 0, 1)` (partial water counts).
- `S = 100 · Σ(wᵢ·cᵢ) / Σ(wᵢ)` over **required** quests, `+ min(5, Σ(wⱼ·cⱼ·0.5))` from completed optionals (bonus only — optionals can never hurt), capped at 100, round half-up.
- Ranks: `F <40 · D 40–54 · C 55–69 · B 70–79 · A 80–89 · S 90–99 · S+ 100`.
- Gates: **S** requires every Hard/Elite required quest complete. **S+** requires 100 and zero fails. Weights already make a missed Gym (~w7) cost ~4× a missed trivial habit.
- Worked example: Gym H(7)·1 + Meal M(4)·1 + Water M(4)·0.72 + Routine E(2)·0 + Walk E(2)·1 = 15.88/19 → 83.6, +1.0 optional → **85 → A**. One miss ≠ ruin.

### XP & levels
- Award: `xp = base × (1 + 0.05 · min(questStreak, 20))`, cap 2×.
- Level cost: `cost(L→L+1) = round₁₀(40 · L^1.5)` — L2:40 · L5:450 · L10:1,260 · L18:3,060 · L20:3,580 · L50:14,140 · L100:40,000. Constant k=40 is the single tuning knob.
- Titles at 1 / 10 / 25 / 50 / 100 (Wanderer, Oathbound, Knight, Warden, Legend).

### Streaks & Embers
- Overall streak continues while rank ≥ C. Perfect-day streak = 100%. S-streak = rank ≥ S.
- Per-quest streaks skip non-scheduled days (MWF gym isn't broken by Tuesday).
- **Embers:** every 7 consecutive C+ days banks 1 Ember (hold max 2). A sub-C day auto-burns one to preserve the overall streak — shown as `EMBER SPENT`; the day's rank is still recorded.

### World Vigor (cosmetic)
`V(t) = round(0.25·S(t) + 0.75·V(t−1))` — <40 RUINS (rain, dead fire) · 40–59 EMBER CAMP · 60–74 CAMP · 75–89 STRONGHOLD · 90+ BEACON (neon fire, banners). Strong weeks brighten the world; bad weeks dim it.

### The Siege — weekly boss
- A boss rises every Monday: `maxHP = round₅₀(8 × Σ(week's available XP))` (sample week ≈ 9,100 HP).
- **Only completing real quests deals damage** — damage = quest XP, at completion time. Main quests crit ×1.5. No RNG, no idle tapping.
- Each day ending below rank C: boss heals 1.5% of maxHP.
- Kill → **Crest Fragment** (3 forge a cosmetic crest) + 150 XP; overkill carries 25% into next week. Survival → boss returns renamed at +5% maxHP (a grudge, not a punishment).
- Balance: a perfect week + main-quest crits kills with ~8% margin; one skipped day is recoverable.
- Screen: boss name/HP bar (ember red), knight vs boss arena, attack log (`MEAL PLAN STRUCK −40 HP`, `GYM READY — CRIT ×1.5 −112`), kill reward band.

### Failure rules
Missed quests are marked `FAILED` (never silently removed). Consequences hit **rank, streaks, world state, boss regen only**. NEVER: XP loss, level loss, deleted history. A corrected past day recomputes everything downstream.

---

## 6. Architecture

**Stack:** SwiftUI · SwiftData with CloudKit private-database sync (`ModelConfiguration(cloudKitDatabase: .automatic)`) — no custom backend, no sign-in (iCloud identity), offline-first, automatic reinstall restore. Fallback: Core Data + NSPersistentCloudKitContainer, same entity design. SceneKit character · Swift Charts with retro theme (stepped lines, square marks) · CoreHaptics + short PCM chiptune cues (toggleable) · UNUserNotificationCenter local notifications. One non-Apple piece: ~50-line Cloudflare Worker proxy for Claude calls (key off-device).

**Modules:**
```
App (composition root, DI)
├─ OathCore   pure domain types — no imports
├─ OathGame   deterministic engines: Scoring, XP, Rank, Streak,
│             WorldVigor, Siege · pure (State, Event) → State · 100% tested
├─ OathData   SwiftData schema, migrations, repositories, recurrence
│             engine, day-generation job (local midnight), event log
├─ OathAI     NutritionAgent client, offline queue, response cache
└─ OathUI     features: Today, Quests, Train, Fuel, Hero + HUD atoms
```

**Event-sourced core:** `QuestCompletion` and `XPEvent` are the source of truth; `DailyScore`, `Streak`, and Character stats are recomputed caches. Templates are split from instances so editing a quest never rewrites history.

**Entities:** Category · QuestTemplate · QuestSchedule · QuestInstance · QuestCompletion · XPEvent · DailyScore · Streak · WorkoutProgram · WorkoutDay · Exercise · PlannedExercise · WorkoutSession · ExerciseSet · PersonalRecord · NutritionGoal · NutritionDay · Meal · FoodEntry · HydrationEntry · UserProfile · UserSettings · Character · InventoryItem · Unlock · Achievement · NotificationPref.

---

## 7. Claude nutrition subagent (isolated)

One job: natural language → structured macro estimates. Never mixed with UI logic.

**Request:**
```json
{ "utterance": "2 medium waffles, 10 oz cooked chicken breast, a 500ml Powerade",
  "units": "imperial", "localDate": "2026-08-16",
  "knownCorrections": [ { "match": "powerade 500ml", "cal": 130, "p": 0, "c": 34, "f": 0 } ] }
```
**Response:**
```json
{ "entries": [ { "food": "Cooked chicken breast", "quantity": 10, "unit": "oz",
    "calories": 468, "protein_g": 88, "carbs_g": 0, "fat_g": 10,
    "confidence": 0.91, "assumptions": ["boneless, skinless"] } ],
  "totals": { "calories": 1118, "p": 96, "c": 118, "f": 22 },
  "needs_clarification": [] }
```
Rules: estimates render immediately with `EST` badges; every number tap-to-correct; corrections persist as overrides + few-shot context; normalized-food cache (`"10 oz cooked chicken breast"`) skips the network; requests queue offline (`pending → estimating → done | needs_review`).

---

## 8. Notifications (local, all toggleable, max 4/day, quiet hours)

| Type | Example | Trigger |
|---|---|---|
| Quest reminder | "Your Gym quest remains unfinished." | per-quest times |
| Evening sweep | "2 quests stand between you and Rank S." | default 20:00 |
| Threshold | "32 oz remain on Hydration." | quantity quests |
| Streak guard | "The 12-day streak ends at midnight." | only if ≥7 days |
| Workout | "Upper Body quest is available." | program days |

Copy is in-world, never guilt-y.

---

## 9. Achievements (unlock cosmetics)

THE BEGINNING — complete your first day · IRON WILL — Gym ×10 · HYDRATED — water target 30 days · PERFECT WEEK — 7 perfect days · CONSISTENCY — 100 quests completed · S-RANK — first S day · SIEGEBREAKER — first boss kill · CREST — forge 3 fragments · LEGEND — reach level 100.

---

## 10. Settings

Notifications per type · sound · haptics · unit system (oz/ml) · nutrition targets · water goal · daily reset time · difficulty weighting view · cloud sync status · RPG animation intensity · CRT scanlines toggle · character customization.

---

## 11. Offline & performance

All actions save locally instantly; CloudKit syncs on reconnect. Nutrition AI queues offline with clear state. Checklist interactions effectively instant (<400ms feedback); no loading screens; lazy loading; charts responsive with years of data.

**Completion feel:** tap-and-hold → diamond fills, `+75 XP` floats over the knight, XP bar ticks, rank meter moves, retro chirp + haptic, siege damage number. Fast, satisfying, repeatable, skippable. Level-up: full-screen `LEVEL UP 17 → 18`; armor-age reveal at each 10-band. Day seal at reset: `DAY COMPLETE · 94% · S RANK · +280 XP · 5 DAY STREAK`.

---

## 12. Build phases

| Phase | Scope | Exit |
|---|---|---|
| P1 Foundation | shell, tokens, tabs, schema, recurrence engine, day-gen, tap-to-complete | a real week runs itself |
| P2 RPG layer | XP, levels, rank, streaks, character v1, completion burst, recap | |
| P3 Training | programs, logger, PRs, e1RM charts, gym→quest link | |
| P4 Nutrition | food log, subagent + queue, targets, meal-plan auto-quest | |
| P5 Analytics | campaign calendar, category drill-downs, retro charts | |
| P6 World | gear unlocks, achievements, world vigor scenes, the Siege | |
| P7 Polish | CloudKit hardening, notifications, sound/haptics, perf | |

Shared architecture (event log, pure engines) lands in P1 — later phases add, never rewrite.

---

## 13. Design references in this project

- `Home Concepts.dc.html` — the 5 explored home directions (1a–1e)
- `Oath — App Screens.dc.html` — committed 5-tab screens (2a–2e), the Siege (3a), knight rig v2 (3b), Knight's Road (4a photo board → 5a low-poly → 6b high-detail), Crusader detail sheet (6a)
- `Architecture Spec.dc.html` — full spec with worked math (§00–§08)
- `uploads/OIP-333f328d.webp`, `uploads/download.webp` — LV 20 / LV 100 art references
