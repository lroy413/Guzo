/* ============================================================
   DIET PREFERENCES & SUGGESTED MEALS
   ------------------------------------------------------------
   Fuel knew what you ate. It knew nothing about how you eat — how
   many times a day you actually get to, or what you will not put on
   the plate. Both change what a useful suggestion looks like far
   more than the calorie number does.

   Suggestions are built from the same 113-food library the logger
   uses. No recipes are downloaded, nothing is generated remotely,
   and the same day produces the same suggestions every time it is
   opened: the variety comes from the date, not from a dice roll.
   ============================================================ */

const DIET_PATTERNS = [
  { k:'omni',  label:'Everything',   note:'Nothing off the table' },
  { k:'pesc',  label:'Pescatarian',  note:'Fish and seafood, no other meat' },
  { k:'veg',   label:'Vegetarian',   note:'No meat, no fish' },
  { k:'vegan', label:'Vegan',        note:'No animal products at all' }
];

const EXCLUSIONS = [
  { k:'dairy',     label:'Dairy' },
  { k:'gluten',    label:'Gluten' },
  { k:'nuts',      label:'Nuts' },
  { k:'egg',       label:'Egg' },
  { k:'soy',       label:'Soy' },
  { k:'shellfish', label:'Shellfish' },
  { k:'pork',      label:'Pork' }
];

/* Tags that cannot be read off a food's group. Conservative on purpose:
   where a real product usually contains something, it is tagged, because the
   cost of wrongly excluding a food is one fewer suggestion and the cost of
   wrongly including one is somebody eating it.

   Oats carry `gluten` for that reason — naturally free of it, routinely
   contaminated in milling. Dark chocolate carries `dairy` on the same logic.

   THIS IS NOT AN ALLERGEN DATABASE and the UI says so where it matters.
   These are generic reference foods, not products with labels; a suggestion
   is a starting point, not a clearance. */
const FOOD_TAGS = {
  'Prawns, cooked':      ['shellfish'],
  'Bacon, grilled':      ['pork'],
  'Ham, sliced':         ['pork'],
  'Pork loin, cooked':   ['pork'],
  'Whey protein':        ['dairy'],
  'Casein protein':      ['dairy'],
  'Pasta, cooked':       ['gluten'],
  'Bread, white':        ['gluten'],
  'Bread, wholemeal':    ['gluten'],
  'Bagel':               ['gluten'],
  'Tortilla wrap':       ['gluten'],
  'Couscous, cooked':    ['gluten'],
  'Cornflakes':          ['gluten'],
  'Granola':             ['gluten', 'nuts'],
  'Oats, dry':           ['gluten'],
  'Noodles, egg, cooked':['gluten', 'egg'],
  'Tofu, firm':          ['soy'],
  'Tempeh':              ['soy'],
  'Edamame':             ['soy'],
  'Peanut butter':       ['nuts'],
  'Almonds':             ['nuts'],
  'Walnuts':             ['nuts'],
  'Cashews':             ['nuts'],
  'Dark chocolate 70%':  ['dairy'],
  'Milk chocolate':      ['dairy'],
  'Ice cream':           ['dairy'],
  'Biscuit, digestive':  ['gluten', 'dairy'],
  'Flapjack':            ['gluten'],
  'Doughnut':            ['gluten', 'dairy', 'egg'],
  'Protein bar':         ['dairy'],
  'Coffee, flat white':  ['dairy'],
  'Tea with milk':       ['dairy'],
  'Beer, pint':          ['gluten'],
  'Sandwich, shop-bought':['gluten'],
  'Meal deal, full':     ['gluten'],
  'Burrito':             ['gluten'],
  'Pizza, 2 slices':     ['gluten', 'dairy'],
  'Burger and chips':    ['gluten'],
  'Sushi, 8 pieces':     ['fish', 'soy', 'gluten'],
  'Fry-up, full':        ['meat', 'pork', 'egg', 'gluten'],
  'Salad with chicken':  ['meat'],
  'Porridge with milk':  ['gluten', 'dairy'],
  'Protein shake, made up':['dairy'],
  'Curry with rice':     ['dairy'],
  'Crew catering plate': ['meat', 'gluten', 'dairy']
};

/* Group alone settles the animal-product questions. */
const GROUP_TAGS = {
  meat:  ['meat'],
  fish:  ['fish'],
  egg:   ['egg'],
  dairy: ['dairy']
};

function foodTags(f) {
  const out = new Set(GROUP_TAGS[f.g] || []);
  (FOOD_TAGS[f.n] || []).forEach(t => out.add(t));
  return out;
}

function dietPrefs() {
  const n = S.nutrition || (S.nutrition = {});
  if (!n.prefs) n.prefs = { meals:3, snacks:1, pattern:'omni', exclude:[] };
  if (!Array.isArray(n.prefs.exclude)) n.prefs.exclude = [];
  return n.prefs;
}

/* Does this food survive the pattern and the exclusion list? */
function foodAllowed(f, prefs) {
  prefs = prefs || dietPrefs();
  const t = foodTags(f);
  const pat = prefs.pattern || 'omni';

  if (pat === 'vegan'  && (t.has('meat') || t.has('fish') || t.has('shellfish') || t.has('egg') || t.has('dairy'))) return false;
  if (pat === 'veg'    && (t.has('meat') || t.has('fish') || t.has('shellfish'))) return false;
  if (pat === 'pesc'   && t.has('meat')) return false;

  return !(prefs.exclude || []).some(x => t.has(x));
}

function allowedFoods(prefs) { return FOODS.filter(f => foodAllowed(f, prefs)); }

/* ---------- portions ----------
   Every food is either per-100g or per-unit. Suggestions are rounded to
   something a person would actually measure — 5 g, or a whole unit — because
   "137 g of rice" is a number nobody has ever served. */
function foodKcalPer(f) { return f.kcal / (f.per || 1); }
function foodPPer(f)    { return f.p    / (f.per || 1); }

function roundQty(f, qty) {
  if (f.u === 'g' || f.u === 'ml') return Math.max(5, Math.round(qty / 5) * 5);
  return Math.max(1, Math.round(qty));
}

function portionFor(f, targetKcal, lo, hi) {
  const per = foodKcalPer(f);
  if (!per) return null;
  const raw = targetKcal / per;
  const q = roundQty(f, Math.min(hi, Math.max(lo, raw)));
  const scale = q / (f.per || 1);
  const r = v => Math.round(v * 10) / 10;
  /* Carbs and fat travel with the portion. Logging a suggestion writes a real
     diary entry, and an entry missing two macros would quietly bend the
     week's numbers — and adaptive TDEE reads those numbers back. */
  return { foodId: f.id, n: f.n, u: f.u, qty: q,
           kcal: Math.round(f.kcal * scale), p: r(f.p * scale),
           c: r(f.c * scale), f: r(f.f * scale) };
}

/* ---------- what counts as what ----------
   Deliberately narrower than the food groups. A suggestion should be a plate
   somebody would build, so protein sources are the ones worth building a meal
   around rather than everything that happens to contain some. */
const MEAL_ROLES = {
  protein: f => (['meat','fish','egg','plant'].includes(f.g) && foodPPer(f) >= 0.09) ||
                (f.g === 'dairy' && foodPPer(f) >= 0.09) ||
                (f.g === 'supp'),
  carb:    f => f.g === 'carb',
  veg:     f => f.g === 'veg',
  fat:     f => f.g === 'fat',
  snack:   f => (['fruit','dairy','supp','fat'].includes(f.g) && foodKcalPer(f) > 0) ||
                (f.g === 'treat' && foodPPer(f) >= 0.08)
};

const MEAL_SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Fourth meal', 'Fifth meal', 'Sixth meal'];

/* Stable pseudo-variety: the same date always yields the same plate, so
   reopening Fuel does not reshuffle the day underneath you, while a different
   date looks different. No Math.random anywhere — a suggestion that changed
   every render would be noise, not advice. */
function dayseed(k) {
  let n = 0;
  for (let i = 0; i < k.length; i++) n = (n * 31 + k.charCodeAt(i)) % 100000;
  return n;
}
function pick(list, seed) { return list.length ? list[seed % list.length] : null; }

/* ---------- the suggestion ---------- */
function suggestMeals(kIn) {
  const k = key(kIn || today());
  const prefs = dietPrefs();
  const e = energyTargets();
  const tg = (S.nutrition && S.nutrition.targets) || {};
  const kcalTarget = tg.kcal || (e && e.kcal) || 0;
  const pTarget = proteinTarget() || 0;

  /* Without a calorie target there is nothing to portion against, and
     inventing one would be worse than saying so. */
  if (!kcalTarget) return { ok:false, reason:'no-target' };

  const meals = Math.max(1, Math.min(6, prefs.meals || 3));
  const snacks = Math.max(0, Math.min(3, prefs.snacks || 0));

  const pool = allowedFoods(prefs);
  const proteins = pool.filter(MEAL_ROLES.protein);
  const carbs = pool.filter(MEAL_ROLES.carb);
  const vegs = pool.filter(MEAL_ROLES.veg);
  const snackables = pool.filter(MEAL_ROLES.snack);

  /* A pattern plus a long exclusion list can empty a shelf. Better to say
     which one than to hand back a plate of vegetables. */
  if (!proteins.length) return { ok:false, reason:'no-protein' };

  /* Snacks take a slice off the top, capped so they cannot crowd out the
     meals; whatever is left is split evenly. */
  const snackShare = Math.min(0.30, snacks * 0.12);
  const snackKcal = snacks ? Math.round(kcalTarget * snackShare / snacks) : 0;
  const mealKcal = Math.round(kcalTarget * (1 - (snacks ? snackShare : 0)) / meals);
  const mealP = pTarget ? Math.round(pTarget * (1 - (snacks ? snackShare : 0)) / meals) : 0;

  const seed = dayseed(k);
  const out = [];

  for (let i = 0; i < meals; i++) {
    const s = seed + i * 17;
    const prot = pick(proteins, s);
    const carb = pick(carbs, s * 3 + 1);
    const veg = pick(vegs, s * 7 + 2);
    if (!prot) continue;

    /* Protein leads: portion it to the meal's protein share, then let the
       carb fill whatever calories are left. Protein is the number that moves
       the outcome, so it is the one that gets solved first. */
    const pPer = foodPPer(prot);
    const wantQty = pPer ? mealP / pPer : 0;
    const protItem = portionFor(prot, foodKcalPer(prot) * (wantQty || 1),
                                prot.u === 'g' ? 60 : 1, prot.u === 'g' ? 300 : 4);

    const vegItem = veg ? portionFor(veg, foodKcalPer(veg) * (veg.u === 'g' ? 120 : 1),
                                     veg.u === 'g' ? 80 : 1, veg.u === 'g' ? 200 : 2) : null;

    const used = (protItem ? protItem.kcal : 0) + (vegItem ? vegItem.kcal : 0);
    const left = Math.max(0, mealKcal - used);
    const carbItem = carb && left > 40
      ? portionFor(carb, left, carb.u === 'g' ? 40 : 1, carb.u === 'g' ? 300 : 3)
      : null;

    const items = [protItem, carbItem, vegItem].filter(Boolean);
    out.push({
      slot: MEAL_SLOTS[i] || ('Meal ' + (i + 1)),
      items,
      kcal: items.reduce((a, x) => a + x.kcal, 0),
      p: Math.round(items.reduce((a, x) => a + x.p, 0))
    });
  }

  for (let i = 0; i < snacks; i++) {
    const f = pick(snackables, seed + 101 + i * 29);
    if (!f) break;
    const item = portionFor(f, snackKcal, f.u === 'g' ? 15 : 1, f.u === 'g' ? 120 : 3);
    if (!item) continue;
    out.push({ slot: snacks > 1 ? 'Snack ' + (i + 1) : 'Snack', items:[item],
               kcal:item.kcal, p:Math.round(item.p) });
  }

  return {
    ok: true,
    slots: out,
    kcal: out.reduce((a, s) => a + s.kcal, 0),
    p: out.reduce((a, s) => a + s.p, 0),
    kcalTarget, pTarget,
    poolSize: pool.length
  };
}

/* Log a whole suggested slot in one go. Returns how many items landed.

   Goes through logFood() rather than pushing entries directly: that is where
   an entry gets its id and timestamp, and where portions are scaled. A
   hand-rolled push here would produce diary rows that looked right and could
   not be edited, because the row's edit action keys on the id. */
function logSuggestedSlot(kIn, slotIndex) {
  const k = key(kIn || today());
  const sug = suggestMeals(k);
  if (!sug.ok) return 0;
  const slot = sug.slots[slotIndex];
  if (!slot) return 0;
  let n = 0;
  slot.items.forEach(it => { if (logFood(it.foodId, it.qty, k)) n++; });
  return n;
}
