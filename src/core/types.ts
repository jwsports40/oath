// core/types.ts — the vocabulary of the whole app
export type Difficulty = 'trivial'|'easy'|'medium'|'hard'|'elite';
export const DIFFICULTY: Record<Difficulty,{xp:number;weight:number;label:string}> = {
  trivial:{xp:5,weight:1,label:'TRIVIAL'}, easy:{xp:10,weight:2,label:'EASY'},
  medium:{xp:25,weight:4,label:'MEDIUM'}, hard:{xp:50,weight:7,label:'HARD'},
  elite:{xp:100,weight:10,label:'ELITE'} };
export type Rank = 'F'|'D'|'C'|'B'|'A'|'S'|'S+';
export type QuestKind = 'binary'|'quantity'|'workout'|'nutrition';
export type Recurrence =
  | {type:'everyDay'} | {type:'weekdays'} | {type:'weekends'}
  | {type:'daysOfWeek'; days:number[]}            // 1=Mon..7=Sun
  | {type:'everyN'; n:number; anchor:string}       // anchor = day key
  | {type:'perWeek'; times:number}                 // weekly goal; materializes daily as optional
  | {type:'monthly'; dayOfMonth:number}
  | {type:'oneTime'; date:string};
export interface Category { id:string; name:string; builtin:boolean; }
export interface QuestTemplate {
  id:string; name:string; categoryId:string; difficulty:Difficulty; kind:QuestKind;
  main:boolean; optional:boolean; recurrence:Recurrence;
  target?:number; unit?:string;                    // quantity kind
  reminders:string[];                              // 'HH:MM'
  createdAt:string; archivedAt?:string;
}
export type InstanceStatus = 'todo'|'done'|'failed';
export interface QuestInstance {
  id:string; templateId:string; date:string;       // day key
  name:string; categoryId:string; difficulty:Difficulty; kind:QuestKind;
  main:boolean; optional:boolean; target?:number; unit?:string;
  status:InstanceStatus; progress:number;          // quantity progress; binary: 0|1
  completedAt?:string;
}
export interface QuestCompletion { id:string; instanceId:string; templateId:string; date:string; at:string; xp:number; crit:boolean; }
export interface XPEvent { id:string; date:string; at:string; amount:number; source:'quest'|'siegeKill'|'pr'|'bonus'; refId?:string; }
export interface DailyScore { date:string; score:number; rank:Rank; requiredDone:number; requiredTotal:number; emberSpent:boolean; sealed:boolean; }
export interface StreakState { overall:number; overallBest:number; perfect:number; perfectBest:number; sRank:number; sRankBest:number; embers:number; cPlusRun:number; }
export interface SiegeState {
  weekStart:string; name:string; maxHp:number; hp:number; generation:number;   // generation increments on survive
  carryover:number; overkill:number; log:{at:string; label:string; amount:number; crit:boolean}[];
  killed:boolean; fragmentsAwarded:boolean;
}
export interface WorkoutProgram { id:string; name:string; days:WorkoutDay[]; active:boolean; }
export interface WorkoutDay { id:string; name:string; weekday:number[]; exercises:PlannedExercise[]; }  // weekday 1..7
export interface PlannedExercise { exerciseId:string; sets:number; reps:number; weight?:number; }
export interface Exercise { id:string; name:string; }
export interface WorkoutSession { id:string; date:string; workoutDayId:string; startedAt:string; finishedAt?:string; notes?:string; sets:ExerciseSet[]; }
export interface ExerciseSet { exerciseId:string; setIndex:number; weight:number; reps:number; rpe?:number; }
export interface PersonalRecord { id:string; exerciseId:string; date:string; weight:number; reps:number; e1rm:number; }
export interface NutritionGoal { calories:number; protein:number; carbs:number; fat:number; waterOz:number; mealPlanRules:{proteinGoal:boolean; calorieBandPct:number; minMeals:number}; }
export interface FoodEntry { food:string; quantity:number; unit:string; calories:number; protein_g:number; carbs_g:number; fat_g:number; confidence:number; corrected:boolean; assumptions?:string[]; }
export interface Meal { id:string; date:string; at:string; entries:FoodEntry[]; utterance?:string; status:'done'|'estimating'|'pending'|'needs_review'; }
export interface HydrationEntry { id:string; date:string; at:string; oz:number; }
export interface Character { level:number; xpTotal:number; str:number; vit:number; wil:number; }
export interface Unlock { id:string; kind:'armorAge'|'helm'|'cape'|'crest'|'title'|'environment'; name:string; unlockedAt:string; }
export interface Achievement { id:string; name:string; desc:string; target:number; progress:number; unlockedAt?:string; }
export interface UserSettings {
  units:'oz'|'ml'; sound:boolean; haptics:boolean; crt:boolean; fxIntensity:'full'|'reduced'|'off';
  resetHour:number;                                // daily reset hour, default 0
  quietHours:[number,number];                      // [22,8]
  notifications:{questReminders:boolean; eveningSweep:boolean; threshold:boolean; streakGuard:boolean; workout:boolean; sweepTime:string};
  anthropicKey?:string;
  bridgeUrl?:string;                               // SCRIBE bridge override (e.g. https tunnel to home PC)
}
export interface WorldState { vigor:number; }      // bands derived
export const VIGOR_BANDS:[number,string][]= [[90,'BEACON'],[75,'STRONGHOLD'],[60,'CAMP'],[40,'EMBER CAMP'],[0,'RUINS']];
export const ARMOR_AGES:[number,string,string][] = [
  [1,'WANDERER','roughspun cloak, walking staff'],[10,'SWORN','gambeson, iron cap, buckler'],
  [20,'CRUSADER','mail + surcoat, red cross, kite shield'],[30,'SERGEANT','riveted plate, heater shield'],
  [40,'VETERAN','battle-notched plate, greatsword'],[50,'WARDEN','cape, gold trim, gold sigil'],
  [60,'CHAMPION','gilt greaves, halo sigil'],[70,'BANNERET','war banner, gold cross'],
  [80,'SENTINEL','blackened plate, ember visor, dark mantle'],[90,'PALADIN','rune-etched plate, ember cross'],
  [100,'LEGEND','hooded black requiem plate — the oath kept']];
export const TITLES:[number,string][] = [[100,'Legend'],[50,'Warden'],[25,'Knight'],[10,'Oathbound'],[1,'Wanderer']];
