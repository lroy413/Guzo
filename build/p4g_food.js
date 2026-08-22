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
Shop-bought sandwich|ea|1|420|20|42|18|meal
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
Chicken breast, raw|g|100|120|23|0|2.6|meat
Chicken drumstick, cooked|g|100|172|28|0|6|meat
Chicken wing, cooked|g|100|203|30|0|8.1|meat
Chicken, rotisserie, skin on|g|100|239|27|0|14|meat
Duck breast, cooked|g|100|201|24|0|11|meat
Beef mince 10%, cooked|g|100|217|26|0|12|meat
Beef brisket, cooked|g|100|241|29|0|13|meat
Beef ribeye, cooked|g|100|291|24|0|21|meat
Beef fillet, cooked|g|100|212|29|0|10|meat
Beef, stewing, cooked|g|100|234|30|0|12|meat
Pork chop, cooked|g|100|231|27|0|13|meat
Pork belly, cooked|g|100|518|18|0|49|meat
Pork sausage, cooked|g|100|297|18|4|23|meat
Chorizo|g|100|455|24|2|38|meat
Salami|g|100|407|22|2|34|meat
Pepperoni|g|100|494|21|1|44|meat
Prosciutto|g|100|245|26|1|15|meat
Turkey mince 7%, cooked|g|100|176|27|0|7|meat
Turkey, sliced|g|100|104|17|3|2|meat
Venison, cooked|g|100|187|30|0|7|meat
Lamb chop, cooked|g|100|294|25|0|21|meat
Lamb mince, cooked|g|100|282|25|0|20|meat
Liver, lamb, cooked|g|100|187|26|2|8|meat
Black pudding|g|100|379|13|18|29|meat
Hot dog sausage|ea|1|151|5|2|13|meat
Meatball, beef|ea|1|57|3.4|1.4|4.2|meat
Sea bass, cooked|g|100|124|24|0|2.6|fish
Haddock, cooked|g|100|112|24|0|1|fish
Pollock, cooked|g|100|111|23|0|1.2|fish
Tilapia, cooked|g|100|129|26|0|2.7|fish
Trout, cooked|g|100|190|27|0|8.5|fish
Sardines, tinned in oil|g|100|208|25|0|11|fish
Sardines, tinned in tomato|g|100|162|18|2|9|fish
Tuna, tinned in oil|g|100|186|25|0|9|fish
Tuna steak, cooked|g|100|184|30|0|6|fish
Smoked salmon|g|100|117|18|0|4.3|fish
Anchovies, tinned|g|100|210|29|0|10|fish
Mussels, cooked|g|100|172|24|7|4.5|fish
Squid, cooked|g|100|175|18|8|7.5|fish
Crab, cooked|g|100|97|19|0|1.5|fish
Fish finger|ea|1|58|3|5.5|2.6|fish
Egg, whole, medium|ea|1|63|5.5|0.3|4.2|egg
Egg, fried|ea|1|90|6.3|0.4|7|egg
Egg, scrambled with milk|ea|1|102|6.7|1.3|7.6|egg
Egg yolk, large|ea|1|55|2.7|0.6|4.5|egg
Omelette, 3 egg|ea|1|268|19|1.5|21|egg
Greek yoghurt 2%|g|100|73|10|3.8|1.9|dairy
Yoghurt, natural|g|100|61|3.5|4.7|3.3|dairy
Yoghurt, fruit, low fat|g|100|94|4.1|15|1.5|dairy
Kefir|ml|100|55|3.3|4.5|2.5|dairy
Quark|g|100|68|12|4|0.3|dairy
Ricotta|g|100|174|11|3|13|dairy
Cream cheese|g|100|342|6|4|33|dairy
Cream cheese, light|g|100|180|8|6|14|dairy
Halloumi|g|100|321|22|2|25|dairy
Goat cheese|g|100|364|22|2.5|30|dairy
Brie|g|100|334|21|0.5|28|dairy
Blue cheese|g|100|353|21|2.3|29|dairy
Cheese slice, processed|ea|1|60|3.5|1.5|4.5|dairy
Double cream|ml|100|449|1.7|2.7|48|dairy
Single cream|ml|100|193|2.6|4|18|dairy
Creme fraiche|g|100|299|2.4|3|31|dairy
Soured cream|g|100|193|2.4|4.6|18|dairy
Milk, 1%|ml|100|42|3.4|5|1|dairy
Oat milk|ml|100|46|1|7|1.5|dairy
Almond milk, unsweetened|ml|100|15|0.5|0.3|1.2|dairy
Soya milk, unsweetened|ml|100|33|3.3|0.6|1.8|dairy
Coconut milk, tinned|ml|100|197|2|3|20|dairy
Custard|g|100|103|3|17|3|dairy
Ice cream, vanilla|g|100|207|3.5|24|11|dairy
Bulgur, cooked|g|100|83|3.1|19|0.2|carb
Barley, cooked|g|100|123|2.3|28|0.4|carb
Noodles, rice, cooked|g|100|109|1|24|0.2|carb
Rice, basmati, cooked|g|100|121|2.9|25|0.4|carb
Rice, jasmine, cooked|g|100|129|2.7|28|0.3|carb
Gnocchi, cooked|g|100|133|3.4|27|0.6|carb
Pasta, wholewheat, cooked|g|100|149|6|30|1.3|carb
Potato, roast|g|100|149|2.9|24|4.5|carb
Potato, mashed with milk|g|100|113|2|17|4.2|carb
Chips, oven|g|100|162|2.6|26|5|carb
Chips, fried|g|100|312|3.4|41|15|carb
Hash brown|ea|1|140|1.5|15|8|carb
Bread, sourdough|slice|1|93|3.7|18|0.6|carb
Bread, rye|slice|1|83|2.7|16|1|carb
Bread, seeded|slice|1|107|4.5|15|3|carb
Pitta bread|ea|1|165|5.5|33|0.7|carb
Naan bread|ea|1|300|9|50|7|carb
Roti|ea|1|119|3|18|3.7|carb
English muffin|ea|1|134|4.4|26|1|carb
Crumpet|ea|1|92|3|19|0.4|carb
Croissant|ea|1|272|5.5|31|14|carb
Baguette, half|ea|1|274|9|54|2|carb
Brioche bun|ea|1|235|7|36|7|carb
Oats, rolled, dry|g|100|379|13|68|6.5|carb
Muesli|g|100|363|10|66|6|carb
Weetabix|ea|1|67|2.3|13|0.6|carb
Shredded wheat|ea|1|76|2.5|15|0.6|carb
Rice cake|ea|1|35|0.7|7.3|0.3|carb
Cracker, cream|ea|1|35|0.8|5.7|1|carb
Oatcake|ea|1|43|1.1|5.9|1.7|carb
Red lentils, cooked|g|100|110|8|19|0.4|plant
Kidney beans, cooked|g|100|127|8.7|23|0.5|plant
Butter beans, cooked|g|100|114|7.7|20|0.4|plant
Edamame, cooked|g|100|122|11|10|5|plant
Peas, garden, cooked|g|100|84|5.4|16|0.4|plant
Tofu, silken|g|100|55|5.5|2|3|plant
Seitan|g|100|141|25|8|1|plant
Falafel|ea|1|57|2.3|5.4|3.1|plant
Cauliflower, cooked|g|100|23|1.8|4.1|0.5|veg
Kale, raw|g|100|49|4.3|9|0.9|veg
Courgette, cooked|g|100|17|1.2|3.1|0.3|veg
Aubergine, cooked|g|100|35|0.8|8.7|0.2|veg
Pepper, red, raw|g|100|31|1|6|0.3|veg
Tomato, raw|g|100|18|0.9|3.9|0.2|veg
Cherry tomatoes|g|100|18|0.9|3.9|0.2|veg
Lettuce, mixed leaves|g|100|17|1.4|2.9|0.3|veg
Asparagus, cooked|g|100|22|2.4|4.1|0.2|veg
Brussels sprouts, cooked|g|100|36|2.6|7.1|0.5|veg
Cabbage, cooked|g|100|23|1.3|5.5|0.1|veg
Beetroot, cooked|g|100|44|1.7|10|0.2|veg
Butternut squash, cooked|g|100|40|0.9|10|0.1|veg
Avocado|g|100|160|2|9|15|veg
Olives, green|g|100|145|1|3.8|15|veg
Coleslaw|g|100|172|1|8|15|veg
Apple|ea|1|95|0.5|25|0.3|fruit
Pear|ea|1|101|0.6|27|0.2|fruit
Orange|ea|1|62|1.2|15|0.2|fruit
Satsuma|ea|1|35|0.6|9|0.2|fruit
Grapefruit, half|ea|1|52|1|13|0.2|fruit
Peach|ea|1|59|1.4|14|0.4|fruit
Nectarine|ea|1|62|1.5|15|0.4|fruit
Plum|ea|1|30|0.5|7.5|0.2|fruit
Kiwi|ea|1|42|0.8|10|0.4|fruit
Strawberries|g|100|32|0.7|7.7|0.3|fruit
Raspberries|g|100|52|1.2|12|0.7|fruit
Blueberries|g|100|57|0.7|14|0.3|fruit
Blackberries|g|100|43|1.4|10|0.5|fruit
Cherries|g|100|63|1.1|16|0.2|fruit
Watermelon|g|100|30|0.6|7.6|0.2|fruit
Melon, cantaloupe|g|100|34|0.8|8.2|0.2|fruit
Dates, medjool|ea|1|66|0.4|18|0|fruit
Dried apricots|g|100|241|3.4|63|0.5|fruit
Prunes|g|100|240|2.2|64|0.4|fruit
Banana, small|ea|1|72|0.9|19|0.2|fruit
Banana, large|ea|1|121|1.5|31|0.4|fruit
Pistachios|g|100|560|20|28|45|fat
Pecans|g|100|691|9|14|72|fat
Hazelnuts|g|100|628|15|17|61|fat
Brazil nuts|g|100|659|14|12|67|fat
Macadamias|g|100|718|8|14|76|fat
Mixed nuts|g|100|607|20|21|54|fat
Peanuts, roasted|g|100|587|24|21|50|fat
Almond butter|g|100|614|21|19|56|fat
Tahini|g|100|595|17|21|54|fat
Chia seeds|g|100|486|17|42|31|fat
Flaxseed, ground|g|100|534|18|29|42|fat
Pumpkin seeds|g|100|559|30|11|49|fat
Sunflower seeds|g|100|584|21|20|51|fat
Sesame seeds|g|100|573|18|23|50|fat
Rapeseed oil|ml|100|884|0|0|100|fat
Coconut oil|ml|100|862|0|0|100|fat
Sunflower oil|ml|100|884|0|0|100|fat
Ghee|g|100|900|0|0|100|fat
Margarine|g|100|717|0.2|0.7|80|fat
Mayonnaise|g|100|680|1|1.3|75|fat
Mayonnaise, light|g|100|280|0.8|8|27|fat
Chocolate, milk|g|100|535|7.6|59|30|treat
Chocolate, dark 70%|g|100|598|7.8|46|43|treat
Chocolate, white|g|100|539|5.9|59|32|treat
Biscuit, chocolate|ea|1|84|1|11|4|treat
Cookie, chocolate chip|ea|1|148|1.7|20|7|treat
Doughnut, ring|ea|1|253|3|31|13|treat
Muffin, blueberry|ea|1|380|5|54|16|treat
Brownie|ea|1|243|3|36|10|treat
Cereal bar|ea|1|130|1.5|22|4|treat
Crisps, ready salted|g|100|536|6.6|50|34|treat
Tortilla chips|g|100|489|7|63|23|treat
Popcorn, plain|g|100|387|13|78|4.5|treat
Pretzels|g|100|380|10|80|3|treat
Cake, sponge|g|100|350|5|50|14|treat
Cheesecake|g|100|321|5.5|26|22|treat
Jelly sweets|g|100|335|5|79|0|treat
Honey|g|100|304|0.3|82|0|treat
Jam|g|100|278|0.4|69|0|treat
Maple syrup|ml|100|260|0|67|0|treat
Nutella|g|100|539|6|57|31|treat
Sugar, white|g|100|387|0|100|0|treat
Ketchup|g|100|102|1.2|24|0.1|fat
Brown sauce|g|100|119|1|28|0.1|fat
Soy sauce|ml|100|53|8|5|0.1|fat
Sriracha|g|100|93|2|19|1|fat
Barbecue sauce|g|100|172|0.8|41|0.5|fat
Sweet chilli sauce|g|100|225|0.3|55|0.2|fat
Pesto|g|100|432|5|6|44|fat
Hot sauce|ml|100|21|1|3|0.4|fat
Mustard|g|100|66|4|5|3.3|fat
Vinaigrette|ml|100|449|0.3|4|48|fat
Salad cream|g|100|348|1.5|17|30|fat
Gravy, made up|ml|100|34|0.6|5|1.3|fat
Tomato pasta sauce|g|100|56|1.6|8|1.8|fat
Curry sauce, jarred|g|100|108|1.8|9|7|fat
Stock cube, made up|ml|100|4|0.2|0.6|0.1|fat
Coffee, latte|ml|100|48|2.6|4.6|2.2|drink
Coffee, cappuccino|ml|100|41|2.4|3.6|1.9|drink
Tea, black|ml|100|1|0|0.2|0|drink
Apple juice|ml|100|46|0.1|11|0.1|drink
Smoothie, fruit|ml|100|57|0.8|13|0.3|drink
Cola, diet|ml|100|0.4|0|0|0|drink
Lemonade|ml|100|38|0|9.5|0|drink
Energy drink|ml|100|45|0|11|0|drink
Energy drink, sugar free|ml|100|3|0|0.3|0|drink
Squash, made up|ml|100|10|0|2.4|0|drink
Water, sparkling|ml|100|0|0|0|0|drink
Hot chocolate, made up|ml|100|76|3.4|11|2.2|drink
Milkshake|ml|100|90|3.2|13|2.8|drink
Whey isolate|scoop|1|110|25|1|0.5|supp
Mass gainer|scoop|1|380|30|60|4|supp
Creatine monohydrate|scoop|1|0|0|0|0|supp
Collagen peptides|scoop|1|70|18|0|0|supp
Greens powder|scoop|1|40|2|6|0.5|supp
Protein bar, whey|ea|1|200|20|20|5|supp
BCAA powder|scoop|1|20|5|0|0|supp
Electrolyte tablet|ea|1|8|0|2|0|supp
Pizza, margherita slice|ea|1|230|9|30|8|meal
Pizza, pepperoni slice|ea|1|298|12|32|13|meal
Burrito, chicken|ea|1|620|35|65|22|meal
Chicken wrap|ea|1|450|30|45|16|meal
Chicken salad sandwich|ea|1|380|24|40|13|meal
BLT sandwich|ea|1|450|18|42|23|meal
Jacket potato with beans|ea|1|420|15|75|6|meal
Chilli con carne with rice|ea|1|650|35|75|22|meal
Stir fry, chicken and veg|ea|1|480|38|45|16|meal
Roast dinner|ea|1|780|45|70|33|meal
Shepherd's pie|ea|1|590|30|55|27|meal
Lasagne|ea|1|620|32|55|30|meal
Fish and chips|ea|1|900|38|90|44|meal
Pad thai|ea|1|700|25|85|30|meal
Ramen bowl|ea|1|550|25|65|21|meal
Poke bowl|ea|1|520|32|60|16|meal
Burger, plain|ea|1|450|25|35|24|meal
Kebab, doner|ea|1|750|40|60|40|meal
Soup, vegetable|ml|100|40|1.2|6.5|1.1|meal
Soup, chicken noodle|ml|100|45|3|6|1|meal
Overnight oats|ea|1|380|14|55|11|meal
Yoghurt bowl with granola|ea|1|420|20|55|13|meal
Protein pancakes|ea|1|350|28|35|10|meal
Scrambled eggs on toast|ea|1|400|22|30|21|meal
Chicken and rice, meal prep|ea|1|560|45|65|12|meal
Steak and salad|ea|1|520|48|12|31|meal
Tuna pasta|ea|1|550|38|65|14|meal
Turkey sandwich|ea|1|310|30|31|8|meal
Roast beef sandwich|ea|1|370|30|32|13|meal
Ham and cheese sandwich|ea|1|420|25|33|21|meal
Chicken mayo sandwich|ea|1|400|28|33|17|meal
Tuna mayo sandwich|ea|1|380|26|32|16|meal
Prawn mayo sandwich|ea|1|340|20|33|14|meal
Egg mayo sandwich|ea|1|390|16|32|22|meal
Cheese and pickle sandwich|ea|1|430|19|40|22|meal
Peanut butter and jam sandwich|ea|1|430|14|52|18|meal
Club sandwich|ea|1|590|34|45|30|meal
Steak sandwich|ea|1|550|38|42|25|meal
Tuna melt|ea|1|520|30|38|27|meal
Cheese toastie|ea|1|450|20|36|25|meal
Bacon roll|ea|1|400|20|35|20|meal
Sausage roll|ea|1|330|9|26|21|meal
Meatball sub|ea|1|620|30|62|27|meal
Falafel wrap|ea|1|480|15|55|21|meal
Tuna pasta salad|ea|1|420|28|45|13|meal
Bagel with cream cheese|ea|1|380|12|50|14|meal
Toast with butter|ea|1|190|4|25|8|meal
Toast with peanut butter|ea|1|290|10|27|16|meal
Toast with avocado|ea|1|280|6|28|16|meal
Beans on toast|ea|1|320|14|52|6|meal
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

/* ------------------------------------------------------------
   Corrections to the built-in foods.
   ------------------------------------------------------------
   The catalogue holds one whey protein at 120 kcal and 24g per scoop, which is
   a reasonable average and is wrong for your tub. Before this there was no way
   to say so: the portion stepper changes how many scoops you had, not what a
   scoop contains, so the only way out was to abandon the preset and retype the
   whole food. For a paid feature that is not acceptable — a number you cannot
   correct makes every total built on it wrong.

   Stored as a correction against the preset rather than as a replacement food,
   so the original is still there to fall back to and search still finds the
   thing by its usual name.

   Entries already logged are untouched. They stored their resolved macros at
   the time, which is what you actually ate — retroactively rewriting last
   week's dinner because you corrected a food today would be inventing history. */
function foodFixes() {
  if (!S.nutrition.fix || typeof S.nutrition.fix !== 'object') S.nutrition.fix = {};
  return S.nutrition.fix;
}

function fixFood(id, patch) {
  const base = FOODS.find(f => f.id === id);
  if (!base || !patch) return false;
  const num = (v, fb) => { const n = parseFloat(v); return isNaN(n) || n < 0 ? fb : n; };
  const fix = {
    per:  Math.max(0.01, num(patch.per,  base.per)),
    kcal: Math.round(num(patch.kcal, base.kcal)),
    p:    num(patch.p, base.p), c: num(patch.c, base.c), f: num(patch.f, base.f)
  };
  /* A correction identical to the original is not a correction. */
  const same = ['per','kcal','p','c','f'].every(kk => Math.abs(fix[kk] - base[kk]) < 0.005);
  if (same) delete foodFixes()[id]; else foodFixes()[id] = fix;
  save(true);
  return true;
}

function clearFix(id) {
  const fx = foodFixes();
  if (!fx[id]) return false;
  delete fx[id]; save(true); return true;
}

function foodById(id) {
  const custom = customFoods().find(f => f.id === id);
  if (custom) return custom;
  const base = FOODS.find(f => f.id === id);
  if (!base) return null;
  const fix = foodFixes()[id];
  return fix ? Object.assign({}, base, fix, { fixed: true }) : base;
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

/* ---------- which meal ----------
   Breakfast, lunch, dinner, snack — the grouping every other logger has and
   this one did not, which left a day as one flat list of fourteen things with
   no shape to it. Guessed from the clock at the moment you log, and always
   changeable, because the guess is only ever a starting point.

   Read through today()'s day boundary rather than the wall clock: someone
   whose day ends at 4am eating at 2am is having dinner, not breakfast. */
const MEALS = [
  { id:'b', n:'Breakfast', ico:'meal-b' },
  { id:'l', n:'Lunch',     ico:'meal-l' },
  { id:'d', n:'Dinner',    ico:'meal-d' },
  { id:'s', n:'Snacks',    ico:'meal-s' }
];
function mealById(id) { return MEALS.find(m => m.id === id) || MEALS[3]; }
function mealNow() {
  let hr = new Date().getHours() - dayStartHour();
  if (hr < 0) hr += 24;
  if (hr < 11) return 'b';
  if (hr < 16) return 'l';
  if (hr < 22) return 'd';
  return 's';
}
function setEntryMeal(dateKey, entryId, m) {
  const e = nutDay(dateKey).items.find(x => x.id === entryId);
  if (!e || !mealById(m)) return false;
  e.m = m; save(true); return true;
}

/* ---------- logging ---------- */
/* Eating ends a fast, and it has to be the act of eating that does it rather
   than a render noticing afterwards — renders in this app do not write.

   Three call sites push into a day's items (a logged food, a quick-added set
   of macros, a copied day) and all three come through here first, because a
   day that is both "fasting" and 800 kcal is a contradiction the rest of the
   screen would have to keep resolving. It only ends a fast the day being eaten
   on is actually inside; copying yesterday's dinner onto last Tuesday leaves a
   fast running now well alone. */
function eatingEndsFast(dateKey) {
  const k = key(dateKey || today());
  const f = openFast();
  if (!f || !fastingOn(k)) return false;
  endFast();
  toast('Fast ended', true);
  return true;
}

function logFood(foodId, qty, dateKey) {
  const food = foodById(foodId);
  if (!food) return false;
  const q = Math.max(0, parseFloat(qty) || 0);
  if (!q) return false;
  const m = scaleFood(food, q);
  eatingEndsFast(dateKey);
  const d = nutDay(dateKey || today());
  d.items.push({
    id: 'e' + Date.now().toString(36) + d.items.length,
    foodId: food.id, n: food.n, qty: q, u: food.u,
    kcal: m.kcal, p: m.p, c: m.c, f: m.f,
    m: mealNow(),
    at: new Date().toISOString()
  });
  save(true);
  return true;
}

/* One entry's macros, set directly. For the meal that was bigger than the
   catalogue thinks, without claiming every future one will be. An entry edited
   this way stops tracking its food — otherwise the next quantity nudge would
   silently throw the correction away. */
function setEntryMacros(dateKey, entryId, m) {
  const d = nutDay(dateKey);
  const e = d.items.find(x => x.id === entryId);
  if (!e || !m) return false;
  const num = (v, fb) => { const n = parseFloat(v); return isNaN(n) || n < 0 ? fb : n; };
  e.kcal = Math.round(num(m.kcal, e.kcal));
  e.p = Math.round(num(m.p, e.p) * 10) / 10;
  e.c = Math.round(num(m.c, e.c) * 10) / 10;
  e.f = Math.round(num(m.f, e.f) * 10) / 10;
  e.edited = true;
  save(true); return true;
}

/* Bare macros with no food behind them — the restaurant meal you will never
   log twice. Every logger worth using has this and it was the reason people
   gave up on this one halfway through a day out. */
function quickAdd(vals, dateKey) {
  const num = v => { const n = parseFloat(v); return isNaN(n) || n < 0 ? 0 : n; };
  const kcal = Math.round(num(vals.kcal)), p = num(vals.p), c = num(vals.c), f = num(vals.f);
  if (!kcal && !p && !c && !f) return false;
  eatingEndsFast(dateKey);
  const d = nutDay(dateKey || today());
  d.items.push({
    id: 'e' + Date.now().toString(36) + d.items.length,
    foodId: null, n: (vals.n || '').trim() || 'Quick add', qty: 1, u: 'ea',
    kcal: kcal, p: Math.round(p * 10) / 10, c: Math.round(c * 10) / 10, f: Math.round(f * 10) / 10,
    m: vals.m || mealNow(), edited: true, at: new Date().toISOString()
  });
  save(true); return true;
}

function updateEntry(dateKey, entryId, qty) {
  const d = nutDay(dateKey);
  const e = d.items.find(x => x.id === entryId);
  if (!e) return false;
  /* An entry whose numbers you corrected by hand is scaled, never re-resolved
     from the catalogue — going back to the food would discard the correction. */
  const food = (e.foodId && !e.edited) ? foodById(e.foodId) : null;
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
  eatingEndsFast(toKey);
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

