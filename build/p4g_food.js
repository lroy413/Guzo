/* ============================================================
   FOOD MODEL
   ------------------------------------------------------------
   No barcode scanner and no licensed food database — a single
   HTML file cannot carry USDA's six gigabytes, and the branded
   half of that data is inconsistent anyway. What it carries
   instead is ~110 whole foods and staples at real per-100g
   values, plus anything you save yourself. That covers the
   things people eat repeatedly, which is where a logger earns
   its keep; the long tail goes in as a custom entry once and
   then lives in your own library.

   Values are per 100g for anything you weigh and per item for
   anything you count, drawn from USDA reference (Foundation /
   SR Legacy) figures rather than crowd-sourced branded entries.
   ============================================================ */

/* n | unit | portion the macros describe | kcal | protein | carbs | fat | group */
const FOODDATA = `
Chicken breast, cooked|g|100|165|31|0|3.6|meat
Chicken thigh, cooked|g|100|209|26|0|11|meat
Turkey breast, cooked|g|100|135|30|0|1|meat
Beef mince 5%, cooked|g|100|176|26|0|8|meat
Beef mince 20%, cooked|g|100|254|26|0|17|meat
Steak, sirloin, cooked|g|100|206|30|0|9|meat
Pork loin, cooked|g|100|196|28|0|9|meat
Bacon, grilled|g|100|541|37|1|42|meat
Lamb, cooked|g|100|258|25|0|17|meat
Ham, sliced|g|100|107|17|2|3|meat
Salmon, cooked|g|100|206|22|0|13|fish
Tuna, tinned in water|g|100|116|26|0|1|fish
Cod, cooked|g|100|105|23|0|1|fish
Prawns, cooked|g|100|99|24|0|0.3|fish
Mackerel, cooked|g|100|262|24|0|18|fish
Egg, whole, large|ea|1|72|6.3|0.4|4.8|egg
Egg white, large|ea|1|17|3.6|0.2|0.1|egg
Greek yoghurt 0%|g|100|59|10|3.6|0.4|dairy
Greek yoghurt 5%|g|100|97|9|4|5|dairy
Skyr|g|100|63|11|4|0.2|dairy
Cottage cheese|g|100|98|11|3.4|4.3|dairy
Milk, whole|ml|100|61|3.2|4.8|3.3|dairy
Milk, semi-skimmed|ml|100|47|3.4|4.8|1.7|dairy
Milk, skimmed|ml|100|34|3.4|5|0.1|dairy
Cheddar|g|100|403|25|1.3|33|dairy
Mozzarella|g|100|280|28|3.1|17|dairy
Feta|g|100|264|14|4.1|21|dairy
Parmesan|g|100|392|36|3.2|25|dairy
Butter|g|100|717|0.9|0.1|81|dairy
Whey protein|scoop|1|120|24|3|2|supp
Casein protein|scoop|1|120|24|3|1|supp
Plant protein|scoop|1|120|21|4|2|supp
Rice, white, cooked|g|100|130|2.7|28|0.3|carb
Rice, brown, cooked|g|100|123|2.7|26|1|carb
Pasta, cooked|g|100|158|5.8|31|0.9|carb
Potato, boiled|g|100|87|2|20|0.1|carb
Sweet potato, baked|g|100|90|2|21|0.1|carb
Bread, white|slice|1|79|2.7|15|1|carb
Bread, wholemeal|slice|1|82|4|14|1.1|carb
Bagel|ea|1|245|10|48|1.5|carb
Tortilla wrap|ea|1|218|6|36|5|carb
Oats, dry|g|100|389|17|66|7|carb
Couscous, cooked|g|100|112|3.8|23|0.2|carb
Quinoa, cooked|g|100|120|4.4|21|1.9|carb
Noodles, egg, cooked|g|100|138|4.5|25|2.1|carb
Cornflakes|g|100|357|7|84|0.4|carb
Granola|g|100|471|10|64|20|carb
Banana, medium|ea|1|105|1.3|27|0.4|fruit
Apple, medium|ea|1|95|0.5|25|0.3|fruit
Orange, medium|ea|1|62|1.2|15|0.2|fruit
Berries, mixed|g|100|57|0.7|14|0.3|fruit
Grapes|g|100|69|0.7|18|0.2|fruit
Avocado, half|ea|1|161|2|9|15|fruit
Mango|g|100|60|0.8|15|0.4|fruit
Pineapple|g|100|50|0.5|13|0.1|fruit
Dates, dried|ea|1|66|0.4|18|0|fruit
Raisins|g|100|299|3.1|79|0.5|fruit
Broccoli, cooked|g|100|35|2.4|7|0.4|veg
Spinach, raw|g|100|23|2.9|3.6|0.4|veg
Carrot, raw|g|100|41|0.9|10|0.2|veg
Peas, cooked|g|100|84|5.4|16|0.2|veg
Green beans, cooked|g|100|35|1.9|8|0.1|veg
Tomato|g|100|18|0.9|3.9|0.2|veg
Cucumber|g|100|15|0.7|3.6|0.1|veg
Mixed salad|g|100|17|1.4|2.9|0.2|veg
Mushrooms, cooked|g|100|28|2.2|5.3|0.5|veg
Onion, raw|g|100|40|1.1|9.3|0.1|veg
Pepper, bell|g|100|31|1|6|0.3|veg
Sweetcorn|g|100|86|3.3|19|1.4|veg
Lentils, cooked|g|100|116|9|20|0.4|plant
Chickpeas, cooked|g|100|164|9|27|2.6|plant
Black beans, cooked|g|100|132|9|24|0.5|plant
Baked beans|g|100|94|4.8|17|0.4|plant
Tofu, firm|g|100|144|17|3|9|plant
Tempeh|g|100|192|20|8|11|plant
Edamame|g|100|121|12|9|5|plant
Hummus|g|100|166|8|14|10|plant
Peanut butter|g|100|588|25|20|50|fat
Almonds|g|100|579|21|22|50|fat
Walnuts|g|100|654|15|14|65|fat
Cashews|g|100|553|18|30|44|fat
Olive oil|ml|10|88|0|0|10|fat
Mixed seeds|g|100|559|19|18|48|fat
Dark chocolate 70%|g|100|598|7.8|46|43|treat
Milk chocolate|g|100|535|7.6|59|30|treat
Ice cream|g|100|207|3.5|24|11|treat
Biscuit, digestive|ea|1|71|1|9.5|3.2|treat
Crisps, packet|ea|1|170|2|15|11|treat
Flapjack|ea|1|340|4|45|16|treat
Protein bar|ea|1|210|20|21|6|treat
Doughnut|ea|1|253|4|31|13|treat
Beer, pint|ea|1|208|1.8|17|0|drink
Wine, glass 175ml|ea|1|159|0.1|4.9|0|drink
Spirits, single 25ml|ea|1|56|0|0|0|drink
Coffee, black|ea|1|2|0.3|0|0|drink
Coffee, flat white|ea|1|120|7|9|6|drink
Tea with milk|ea|1|25|1.3|2|1.1|drink
Orange juice|ml|100|45|0.7|10|0.2|drink
Cola|ml|100|42|0|11|0|drink
Diet cola|ml|100|0.4|0|0|0|drink
Sports drink|ml|100|24|0|6|0|drink
Sandwich, shop-bought|ea|1|420|20|42|18|meal
Meal deal, full|ea|1|700|24|80|30|meal
Burrito|ea|1|620|28|70|24|meal
Pizza, 2 slices|ea|1|570|24|64|22|meal
Burger and chips|ea|1|920|35|85|48|meal
Curry with rice|ea|1|780|32|92|30|meal
Sushi, 8 pieces|ea|1|380|14|64|6|meal
Crew catering plate|ea|1|750|35|70|35|meal
Fry-up, full|ea|1|850|38|55|50|meal
Salad with chicken|ea|1|420|38|18|22|meal
Porridge with milk|ea|1|280|12|42|7|meal
Protein shake, made up|ea|1|170|26|10|3|meal
`.trim();

const FOODS = FOODDATA.split('\n').map((line, i) => {
  const p = line.split('|');
  return { id: 'f' + i, n: p[0], u: p[1], per: +p[2],
           kcal: +p[3], p: +p[4], c: +p[5], f: +p[6], g: p[7] };
});

const FOOD_GROUPS = [
  { k:'meal',  label:'Meals & takeaway' },
  { k:'meat',  label:'Meat' },
  { k:'fish',  label:'Fish' },
  { k:'egg',   label:'Eggs' },
  { k:'dairy', label:'Dairy' },
  { k:'supp',  label:'Protein powder' },
  { k:'carb',  label:'Carbs & grains' },
  { k:'plant', label:'Beans, pulses & tofu' },
  { k:'veg',   label:'Vegetables' },
  { k:'fruit', label:'Fruit' },
  { k:'fat',   label:'Nuts, oils & fats' },
  { k:'treat', label:'Snacks & sweets' },
  { k:'drink', label:'Drinks' }
];

/* ---------- your own foods ---------- */
function customFoods() {
  if (!Array.isArray(S.nutrition.custom)) S.nutrition.custom = [];
  return S.nutrition.custom;
}

function saveCustomFood(food) {
  const list = customFoods();
  const f = {
    id: 'c' + Date.now().toString(36),
    n: String(food.n || '').trim().slice(0, 50),
    u: food.u || 'ea', per: +food.per || 1,
    kcal: Math.max(0, +food.kcal || 0), p: Math.max(0, +food.p || 0),
    c: Math.max(0, +food.c || 0), f: Math.max(0, +food.f || 0),
    g: 'mine'
  };
  if (!f.n || f.kcal > 5000) return null;
  list.push(f); save(true);
  return f;
}

function deleteCustomFood(id) {
  const list = customFoods();
  const i = list.findIndex(f => f.id === id);
  if (i < 0) return false;
  list.splice(i, 1); save(true); return true;
}

function foodById(id) {
  return FOODS.find(f => f.id === id) || customFoods().find(f => f.id === id) || null;
}

function allFoods() { return customFoods().concat(FOODS); }

function foodSearch(q) {
  const s = (q || '').trim().toLowerCase();
  if (!s) return [];
  const words = s.split(/\s+/).filter(Boolean);
  return allFoods().filter(f => {
    const hay = (f.n + ' ' + (FOOD_GROUPS.find(g => g.k === f.g) || {}).label).toLowerCase();
    return words.every(w => hay.indexOf(w) >= 0);
  }).slice(0, 40);
}

/* ---------- portions ---------- */
function unitLabel(u) {
  return u === 'g' ? 'g' : u === 'ml' ? 'ml' : u === 'scoop' ? 'scoop' :
         u === 'slice' ? 'slice' : u === 'tbsp' ? 'tbsp' : '';
}

/* The step a portion moves in. Weighing things in 5g increments is what
   a kitchen scale actually does; counting eggs in half-eggs is not. */
function portionStep(u) { return (u === 'g' || u === 'ml') ? 10 : 1; }

function scaleFood(food, qty) {
  const ratio = qty / (food.per || 1);
  const r = v => Math.round(v * ratio * 10) / 10;
  return {
    kcal: Math.round(food.kcal * ratio),
    p: r(food.p), c: r(food.c), f: r(food.f)
  };
}

function portionLabel(food, qty) {
  const u = unitLabel(food.u);
  if (food.u === 'ea') return qty === 1 ? '1' : qty + '×';
  return qty + u + (food.u === 'scoop' && qty !== 1 ? 's' : '');
}

/* ---------- logging ---------- */
function logFood(foodId, qty, dateKey) {
  const food = foodById(foodId);
  if (!food) return false;
  const q = Math.max(0, parseFloat(qty) || 0);
  if (!q) return false;
  const m = scaleFood(food, q);
  const d = nutDay(dateKey || today());
  d.items.push({
    id: 'e' + Date.now().toString(36) + d.items.length,
    foodId: food.id, n: food.n, qty: q, u: food.u,
    kcal: m.kcal, p: m.p, c: m.c, f: m.f,
    at: new Date().toISOString()
  });
  save(true);
  return true;
}

function updateEntry(dateKey, entryId, qty) {
  const d = nutDay(dateKey);
  const e = d.items.find(x => x.id === entryId);
  if (!e) return false;
  const food = e.foodId ? foodById(e.foodId) : null;
  const q = Math.max(0, parseFloat(qty) || 0);
  if (!q) return false;
  if (food) {
    const m = scaleFood(food, q);
    e.qty = q; e.kcal = m.kcal; e.p = m.p; e.c = m.c; e.f = m.f;
  } else {
    const ratio = q / (e.qty || 1);
    e.kcal = Math.round(e.kcal * ratio);
    e.p = Math.round(e.p * ratio * 10) / 10;
    e.c = Math.round(e.c * ratio * 10) / 10;
    e.f = Math.round(e.f * ratio * 10) / 10;
    e.qty = q;
  }
  save(true); return true;
}

function deleteEntry(dateKey, entryId) {
  const d = nutDay(dateKey);
  const i = d.items.findIndex(x => x.id === entryId);
  if (i < 0) return false;
  d.items.splice(i, 1); save(true); return true;
}

function copyDay(fromKey, toKey) {
  const from = (S.nutrition.days[fromKey] || {}).items || [];
  if (!from.length) return 0;
  const to = nutDay(toKey || today());
  from.forEach((e, i) => to.items.push({ ...e, id: 'e' + Date.now().toString(36) + '_' + i, at: new Date().toISOString() }));
  save(true);
  return from.length;
}

/* The most-used foods from the last fortnight. This is the thing that
   actually saves time — people eat the same twenty things. */
function recentFoods(limit) {
  const counts = {};
  for (let i = 0; i < 14; i++) {
    const k = dk(addDays(today(), -i));
    ((S.nutrition.days[k] || {}).items || []).forEach(e => {
      if (!e.foodId) return;
      const key = e.foodId + '|' + e.qty;
      counts[key] = counts[key] || { foodId: e.foodId, qty: e.qty, n: 0 };
      counts[key].n++;
    });
  }
  return Object.values(counts)
    .sort((a, b) => b.n - a.n)
    .slice(0, limit || 8)
    .map(r => ({ ...r, food: foodById(r.foodId) }))
    .filter(r => r.food);
}

