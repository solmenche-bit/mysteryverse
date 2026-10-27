// Offline knowledge engine. Every subject has a fixed table of facts, so answers are
// deterministic and can never contradict each other. Used by Twenty Questions, the
// Mystery Box and AI Password when no AI provider is configured, and as ground truth
// handed to the AI when one is.
import { normalize, similarity, canonical } from './answers.js';

const re = (p) => new RegExp(`\\b(?:${p})\\b`);
const P = (id, q, patterns, dflt = 'no', inv = []) => ({ id, q, patterns: patterns.map((p) => [p, re(p)]), inv: inv.map((p) => [p, re(p)]), dflt });

// Order matters only for ties (same matched length): earlier wins.
export const PROPS = [
  P('person', 'Is it a person?', ['person', 'people', 'human', 'humans', 'someone', 'man', 'woman', 'boy', 'girl', 'baby']),
  P('alive', 'Is it alive?', ['alive', 'living', 'a living thing', 'living thing', 'breathe', 'breathes', 'breathing', 'organism', 'grow', 'grows'], 'no', ['dead', 'nonliving', 'non living']),
  P('animal', 'Is it an animal?', ['animal', 'animals', 'creature', 'critter']),
  P('mammal', 'Is it a mammal?', ['mammal', 'mammals']),
  P('bird', 'Is it a bird?', ['bird', 'birds']),
  P('fish', 'Is it a fish?', ['a fish', 'fish', 'fishes']),
  P('insect', 'Is it an insect?', ['insect', 'insects', 'bug', 'bugs']),
  P('reptile', 'Is it a reptile?', ['reptile', 'reptiles', 'amphibian', 'amphibians', 'lizard']),
  P('plant', 'Is it a plant?', ['plant', 'plants', 'flower', 'flowers', 'vegetation', 'tree', 'trees']),
  P('object', 'Is it an object?', ['object', 'objects', 'physical', 'item', 'touch it', 'can you touch', 'physical thing', 'solid object'], 'unknown'),
  P('food', 'Can you eat it?', ['food', 'foods', 'edible', 'eat it', 'eat them', 'you eat', 'eaten', 'eat', 'eatable', 'snack', 'meal', 'taste', 'tasty', 'delicious', 'yummy']),
  P('fruit', 'Is it a fruit?', ['fruit', 'fruits']),
  P('vegetable', 'Is it a vegetable?', ['vegetable', 'vegetables', 'veggie', 'veggies']),
  P('drink', 'Can you drink it?', ['drink', 'drinks', 'beverage', 'drinkable', 'sip', 'juice']),
  P('sweet', 'Is it sweet?', ['sweet', 'sugary', 'sugar', 'dessert', 'candy', 'treat']),
  P('dairy', 'Is it dairy?', ['dairy', 'milchig', 'milchik', 'milky', 'made from milk', 'milk', 'cheese']),
  P('meat', 'Is it meat?', ['meat', 'fleishig', 'fleishik', 'meaty', 'chicken', 'beef']),
  P('baked', 'Is it baked?', ['baked', 'bake', 'bakes', 'oven', 'bread', 'bakery', 'pastry', 'dough', 'flour']),
  P('vehicle', 'Is it a vehicle?', ['vehicle', 'vehicles', 'transport', 'transportation', 'ride in it', 'ride on it', 'ride it', 'ride', 'drive it', 'drive', 'travel in', 'travel on', 'carry people', 'passengers', 'get around']),
  P('tool', 'Is it a tool?', ['tool', 'tools', 'utensil', 'utensils', 'gadget', 'equipment']),
  P('toy', 'Is it a toy?', ['toy', 'toys', 'play with it', 'play with', 'plaything', 'kids play', 'children play']),
  P('game', 'Is it a game?', ['game', 'games', 'board game']),
  P('instrument', 'Is it a musical instrument?', ['instrument', 'instruments', 'play music', 'musical', 'make music', 'music', 'play a song', 'tune']),
  P('furniture', 'Is it furniture?', ['furniture', 'sit on it', 'sit on', 'sit in', 'sleep on', 'lie on', 'lay on']),
  P('appliance', 'Is it an appliance?', ['appliance', 'appliances', 'machine', 'machines']),
  P('clothing', 'Do you wear it?', ['clothing', 'clothes', 'wear it', 'wear them', 'wearable', 'garment', 'you wear', 'put it on', 'wear', 'worn', 'outfit', 'accessory']),
  P('building', 'Is it a building?', ['building', 'buildings', 'structure', 'skyscraper', 'tower']),
  P('place', 'Is it a place?', ['place', 'places', 'location', 'somewhere', 'go there', 'visit it', 'visit', 'destination', 'area', 'landmark', 'travel to', 'go to']),
  P('city', 'Is it a city?', ['city', 'cities', 'town', 'village']),
  P('country', 'Is it a country?', ['country', 'countries', 'nation']),
  P('sport', 'Is it used in sports?', ['sport', 'sports', 'athletic', 'athletics', 'exercise', 'team', 'score', 'goal', 'athlete']),
  P('reading', 'Do you read it?', ['read it', 'read', 'reading', 'book', 'books', 'pages', 'page', 'words on it', 'letters on it', 'text', 'words']),
  P('writing', 'Is it used for writing or drawing?', ['write', 'writing', 'writes', 'draw', 'drawing', 'used to write', 'write with', 'color with']),
  P('container', 'Does it hold things?', ['container', 'hold things', 'holds things', 'store things', 'stores things', 'put things in', 'put things inside', 'carry things', 'hold stuff', 'contain', 'contains', 'storage', 'hold food', 'hold water', 'put stuff in', 'keep things in']),
  P('electronic', 'Does it use electricity?', ['electronic', 'electronics', 'electric', 'electrical', 'electricity', 'battery', 'batteries', 'plug', 'plugged', 'plug in', 'powered', 'power', 'charge', 'charging', 'charger', 'technology', 'tech', 'device', 'digital', 'turn it on', 'switch it on', 'computer', 'wifi', 'internet']),
  P('screen', 'Does it have a screen?', ['screen', 'screens', 'display', 'monitor']),
  P('buttons', 'Does it have buttons?', ['button', 'buttons', 'have keys', 'has keys', 'keypad', 'switches', 'switch', 'remote']),
  P('engine', 'Does it have an engine?', ['engine', 'engines', 'motor', 'motors', 'fuel', 'gas', 'gasoline', 'petrol', 'diesel']),
  P('wheels', 'Does it have wheels?', ['wheel', 'wheels', 'tire', 'tires', 'tyre', 'tyres']),
  P('rolls', 'Can it roll?', ['roll', 'rolls', 'rolling']),
  P('moves', 'Does it move by itself?', ['move', 'moves', 'moving', 'motion', 'run', 'runs', 'walk', 'walks', 'crawl', 'crawls', 'jump', 'jumps', 'hop', 'hops'], 'no', ['still', 'stationary']),
  P('flies', 'Can it fly?', ['fly', 'flies', 'flying', 'flight', 'airborne', 'float in the air', 'in the air']),
  P('water', 'Is it found in or used with water?', ['water', 'swim', 'swims', 'swimming', 'ocean', 'sea', 'river', 'lake', 'wet', 'underwater', 'aquatic', 'pool', 'float', 'floats', 'rain']),
  P('sky', 'Is it found in the sky?', ['in the sky', 'the sky', 'sky', 'space', 'outer space', 'up high', 'above us', 'heavens', 'universe', 'planet']),
  P('outdoor', 'Is it usually found outside?', ['outside', 'outdoors', 'outdoor', 'in nature', 'in the street', 'in a park', 'on the street', 'in the park', 'park', 'street', 'road', 'nature']),
  P('indoor', 'Is it usually found indoors?', ['inside', 'indoors', 'indoor', 'in a house', 'in the house', 'at home', 'in your home', 'in a home', 'in my house', 'in a room', 'household', 'in the home', 'in your house', 'home', 'house', 'room', 'bedroom', 'living room']),
  P('kitchen', 'Is it found in a kitchen?', ['kitchen', 'kitchens', 'cook', 'cooking', 'cooked', 'chef', 'recipe']),
  P('bathroom', 'Would you find it in a bathroom?', ['bathroom', 'bath', 'shower', 'sink']),
  P('school', 'Would you find it in a school?', ['school', 'schools', 'classroom', 'class', 'yeshiva', 'cheder', 'student', 'students', 'teacher', 'teachers', 'homework', 'learn', 'learning', 'study', 'studying', 'rebbi']),
  P('shul', 'Would you find it in a shul?', ['shul', 'synagogue', 'beis medrash', 'bais medrash', 'beit midrash', 'beis hamedrash', 'davening', 'daven', 'pray', 'praying', 'prayer', 'prayers']),
  P('office', 'Would you find it in an office?', ['office', 'offices', 'at work', 'business', 'businesses', 'work']),
  P('garden', 'Would you find it in a garden?', ['garden', 'gardens', 'backyard', 'yard', 'lawn', 'grass']),
  P('farm', 'Would you find it on a farm?', ['farm', 'farms', 'farmer', 'barn']),
  P('zoo', 'Would you see it at a zoo?', ['zoo', 'zoos']),
  P('wild', 'Does it live in the wild?', ['wild', 'jungle', 'forest', 'safari', 'woods', 'africa']),
  P('desert', 'Is it found in the desert?', ['desert', 'deserts']),
  P('sand', 'Is there sand?', ['sand', 'sandy']),
  P('fast', 'Is it fast?', ['fast', 'quick', 'speedy', 'speed', 'go fast'], 'unknown', ['slow']),
  P('grows', 'Does it grow on a plant or a tree?', ['grow on a tree', 'grows on a tree', 'grow on trees', 'grows on trees', 'grow on a plant', 'grows on a plant', 'grows on plants', 'grow in the ground', 'grows in the ground', 'grow in a garden', 'grows in a garden', 'grow underground', 'grows underground']),
  P('pet', 'Can it be a pet?', ['pet', 'pets', 'keep at home', 'domestic', 'domesticated', 'tame']),
  P('store', 'Can you buy it in a store?', ['buy it', 'buy one', 'buy', 'store', 'stores', 'shop', 'shops', 'purchase', 'sell', 'sold', 'supermarket', 'grocery', 'money']),
  P('handheld', 'Can you hold it in one hand?', ['hold it', 'hold in', 'in your hand', 'in one hand', 'handheld', 'pick it up', 'lift it', 'fit in your hand', 'fit in a hand', 'fits in your hand', 'fits in my hand', 'carry it', 'hold', 'in my hand', 'with one hand', 'hands']),
  P('pocket', 'Does it fit in a pocket?', ['pocket', 'pockets']),
  P('metal', 'Is it made of metal?', ['metal', 'metallic', 'steel', 'iron', 'aluminum', 'aluminium', 'copper', 'tin', 'brass']),
  P('wood', 'Is it made of wood?', ['wood', 'wooden', 'timber']),
  P('plastic', 'Is it made of plastic?', ['plastic', 'plastics']),
  P('glass', 'Is it made of glass?', ['glass']),
  P('paper', 'Is it made of paper?', ['paper', 'cardboard']),
  P('fabric', 'Is it made of fabric?', ['fabric', 'cloth', 'cotton', 'wool', 'textile', 'leather', 'silk', 'material']),
  P('rubber', 'Is it made of rubber?', ['rubber']),
  P('stone', 'Is it made of stone?', ['stone', 'stones', 'rock', 'rocks', 'concrete', 'brick', 'bricks']),
  P('natural', 'Is it natural?', ['natural', 'made by nature', 'found in nature', 'from nature']),
  P('manmade', 'Is it made by people?', ['man made', 'manmade', 'made by people', 'made by humans', 'human made', 'humanmade', 'invented', 'invention', 'artificial', 'factory', 'manufactured', 'made by a person', 'built', 'people make', 'someone made', 'invent', 'made in a factory']),
  P('round', 'Is it round?', ['round', 'circle', 'circular', 'sphere', 'spherical', 'ball shaped', 'oval', 'curved'], 'no', ['square', 'rectangle', 'rectangular', 'flat']),
  P('sharp', 'Is it sharp?', ['sharp', 'pointy', 'pointed', 'cut', 'cuts', 'cutting', 'blade', 'poke']),
  P('soft', 'Is it soft?', ['soft', 'squishy', 'fluffy', 'cuddly', 'squeezable', 'fuzzy', 'squish'], 'unknown'),
  P('hard', 'Is it hard?', ['hard', 'solid', 'rigid', 'firm'], 'unknown'),
  P('hot', 'Is it hot?', ['hot', 'warm', 'heat', 'heats', 'fire', 'burn', 'burns', 'flame', 'flames']),
  P('cold', 'Is it cold?', ['cold', 'cool', 'freeze', 'frozen', 'icy', 'ice', 'freezer', 'chilly', 'refrigerated']),
  P('liquid', 'Is it a liquid?', ['liquid', 'liquids', 'pour', 'pours', 'fluid']),
  P('breakable', 'Can it break easily?', ['break', 'breaks', 'breakable', 'fragile', 'shatter', 'delicate', 'pop', 'pops'], 'unknown'),
  P('colorful', 'Is it colorful?', ['colorful', 'colourful', 'many colors', 'bright colors', 'rainbow colored', 'colors'], 'unknown'),
  P('legs', 'Does it have legs?', ['leg', 'legs', 'feet', 'paws', 'foot']),
  P('fur', 'Does it have fur?', ['fur', 'furry', 'hair', 'hairy']),
  P('feathers', 'Does it have feathers?', ['feather', 'feathers']),
  P('wings', 'Does it have wings?', ['wing', 'wings']),
  P('tail', 'Does it have a tail?', ['tail', 'tails']),
  P('shell', 'Does it have a shell?', ['shell', 'shells']),
  P('eggs', 'Does it lay eggs?', ['lay eggs', 'lays eggs', 'laying eggs', 'hatch', 'hatches']),
  P('eatsmeat', 'Does it eat meat?', ['eat meat', 'eats meat', 'carnivore', 'carnivorous', 'eat other animals', 'eats other animals', 'predator', 'hunt', 'hunts', 'hunter']),
  P('dangerous', 'Can it be dangerous?', ['dangerous', 'danger', 'hurt', 'hurts', 'bite', 'bites', 'sting', 'stings', 'poisonous', 'scary', 'harmful'], 'no', ['safe', 'harmless', 'friendly', 'gentle']),
  P('sound', 'Does it make a sound?', ['sound', 'sounds', 'noise', 'noises', 'noisy', 'loud', 'beep', 'beeps', 'ring', 'rings', 'hear it', 'bark', 'barks', 'sing', 'sings', 'talk', 'talks', 'make noise'], 'unknown', ['quiet', 'silent']),
  P('daily', 'Do people use it every day?', ['every day', 'everyday', 'daily', 'all the time', 'often', 'common', 'regularly', 'used a lot'], 'unknown', ['rare', 'rarely', 'unusual']),
  P('cleaning', 'Is it used for cleaning?', ['clean', 'cleaning', 'cleans', 'wash', 'washing', 'washes', 'scrub', 'soap']),
  P('glows', 'Does it give off light?', ['give light', 'gives light', 'give off light', 'gives off light', 'light up', 'lights up', 'glow', 'glows', 'shine', 'shines', 'bright', 'lamp', 'illuminate', 'make light', 'makes light', 'produce light', 'light'], 'no', ['dark']),
  P('time', 'Does it tell time?', ['tell time', 'tells time', 'tell the time', 'shows the time', 'time', 'clock', 'hours', 'minutes']),
  P('jewish', 'Is it connected to Jewish life?', ['jewish', 'judaism', 'torah', 'mitzvah', 'mitzva', 'mitzvos', 'mitzvot', 'religious', 'holy', 'rabbi', 'rebbe', 'yid', 'yidden', 'judaica']),
  P('holiday', 'Is it connected to a holiday?', ['holiday', 'holidays', 'yom tov', 'yomtov', 'chag', 'festival', 'pesach', 'passover', 'sukkos', 'sukkot', 'chanukah', 'hanukkah', 'purim', 'rosh hashana', 'rosh hashanah', 'shavuos', 'shavuot', 'yom kippur', 'tu bishvat', 'lag baomer', 'seder']),
  P('shabbos', 'Is it connected to Shabbos?', ['shabbos', 'shabbat', 'sabbath', 'shabbos table']),
  P('israel', 'Is it connected to Israel?', ['israel', 'eretz yisrael', 'eretz yisroel', 'israeli', 'jerusalem', 'yerushalayim']),
  P('old', 'Did it exist 100 years ago?', ['100 years', 'hundred years', 'long ago', 'ancient', 'old', 'antique', 'invented before', 'olden days', 'history', 'historical', 'years ago'], 'unknown', ['modern', 'new', 'recent', 'recently']),
  P('expensive', 'Is it expensive?', ['expensive', 'cost a lot', 'costs a lot', 'costly', 'pricey', 'valuable', 'worth a lot'], 'unknown', ['cheap', 'inexpensive']),
  P('tall', 'Is it tall?', ['tall', 'high', 'height'], 'no', ['short']),
  P('heavy', 'Is it heavy?', ['heavy', 'weigh a lot', 'weighs a lot', 'weight', 'heavier'], 'unknown', ['lightweight', 'light weight']),
  P('big', 'Is it big?', ['big', 'large', 'huge', 'giant', 'enormous', 'massive', 'bigger'], 'unknown', ['small', 'tiny', 'little', 'miniature', 'smaller']),
  P('night', 'Is it seen or used at night?', ['night', 'nocturnal', 'nighttime', 'bedtime']),
  P('pattern', 'Does it have stripes or spots?', ['stripe', 'stripes', 'striped', 'spots', 'spotted', 'pattern', 'patterns', 'dots']),
  P('summer', 'Is it connected to summer?', ['summer', 'beach', 'sunny', 'hot weather']),
  P('winter', 'Is it connected to winter?', ['winter', 'snow', 'snowy', 'cold weather']),
  P('numbers', 'Does it have numbers on it?', ['numbers', 'number', 'digits', 'math', 'count', 'counting']),
  P('unlocks', 'Does it unlock things?', ['unlock', 'unlocks', 'open locks', 'opens locks', 'open a lock', 'opens a lock', 'open the door', 'opens the door', 'open doors', 'opens doors', 'lock', 'locks']),
  P('opens', 'Does it open and close?', ['open', 'opens', 'close', 'closes', 'lid', 'door', 'doors', 'zipper']),
  P('fold', 'Can it fold?', ['fold', 'folds', 'folding', 'foldable', 'bend']),
  P('strings', 'Does it have strings or a cord?', ['string', 'strings', 'rope', 'ropes', 'cord', 'cords', 'wire', 'wires']),
  P('pairs', 'Does it come in pairs?', ['pair', 'pairs', 'two of them', 'come in twos']),
  P('handle', 'Does it have a handle?', ['handle', 'handles']),
  P('smell', 'Does it have a strong smell?', ['smell', 'smells', 'scent', 'stinky', 'fragrant', 'odor']),
  P('famous', 'Is it famous?', ['famous', 'well known', 'popular', 'world famous', 'tourists', 'tourist']),
];
export const PROP_MAP = Object.fromEntries(PROPS.map((p) => [p.id, p]));

// Category defaults. A subject inherits its category chain; its own facts override.
const CATS = {
  animal: { p: 'alive animal natural object- person- food- drink- plant- manmade- electronic- place- vehicle- tool- toy- clothing- building- furniture- appliance- instrument- moves sound store- indoor- outdoor screen- buttons- engine- wheels- metal- wood- plastic- glass- paper- fabric- rubber- stone- liquid- container- writing- reading- cleaning- glows- time- jewish- holiday- shabbos- sharp- hot- cold- breakable- old daily/ expensive/ fold- strings- handle- opens- numbers- sport- game- kitchen- school- shul- office- bathroom- city- country- sky- rolls-' },
  mammal: { parent: 'animal', p: 'mammal fur legs eggs- bird- fish- insect- reptile- feathers- wings- shell- tail' },
  bird: { parent: 'animal', p: 'bird feathers wings eggs legs flies mammal- fur- fish- insect- reptile- shell- tail', legs: 2 },
  fish: { parent: 'animal', p: 'fish water eggs legs- fur- feathers- wings- flies- mammal- bird- insect- reptile- shell- tail', legs: 0 },
  insect: { parent: 'animal', p: 'insect legs eggs mammal- bird- fish- reptile- fur- feathers- shell- tail- wild garden', legs: 6, size: 1 },
  reptile: { parent: 'animal', p: 'reptile eggs legs fur- feathers- mammal- bird- insect- fish-' },
  plant: { p: 'alive plant grows natural object- person- animal- manmade- electronic- moves- sound- legs- outdoor fur- feathers- wings- eggs- vehicle- tool- toy- clothing- building- metal- plastic- glass- paper- fabric- rubber- stone- glows- engine- wheels- screen- buttons- liquid- store~ kitchen- school- shul- sharp~ soft~ old' },
  food: { p: 'food object person- alive- animal- plant- electronic- place- moves- sound- legs- kitchen store indoor breakable~ vehicle- tool- toy- clothing- building- furniture- appliance- instrument- drink- liquid- metal- wood- plastic- glass- paper- fabric- rubber- stone- engine- wheels- screen- buttons- glows- time- writing- reading- cleaning- container- sport- game- sharp- fur- feathers- wings- eggs- tail- shell- flies- expensive- old daily~ shul- office- bathroom- city- country- sky- strings- handle- opens- fold- numbers- smell~ famous~' },
  fruit: { parent: 'food', p: 'fruit grows natural manmade- sweet vegetable- meat- dairy- baked- outdoor~ garden~ hot- cold- round~' },
  vegetable: { parent: 'food', p: 'vegetable grows natural manmade- sweet- fruit- meat- dairy- baked- garden farm' },
  dish: { parent: 'food', p: 'manmade natural- fruit- vegetable- cooked' },
  drink: { parent: 'food', p: 'drink liquid food- container- sound-' },
  object: { p: 'object manmade natural- alive- person- animal- plant- food- drink- place- legs- fur- feathers- wings- eggs- tail- shell- moves- store city- country- eatsmeat- liquid- sky- building- dangerous-' },
  vehicle: { parent: 'object', p: 'vehicle moves outdoor indoor- handheld- pocket- metal sound expensive tool- toy- clothing- furniture- food- kitchen- school- shul- office- bathroom- writing- reading- time-', size: 5 },
  tool: { parent: 'object', p: 'tool hard', size: 2 },
  toy: { parent: 'object', p: 'toy store daily~ school- shul- office- kitchen- vehicle- clothing- food- tool-', size: 2 },
  instrument: { parent: 'object', p: 'instrument sound store toy- food- clothing- vehicle- electronic~ shul-', size: 3 },
  furniture: { parent: 'object', p: 'furniture indoor handheld- pocket- moves- electronic- sound- hard~ store vehicle- toy- clothing- food- flies-', size: 4 },
  appliance: { parent: 'object', p: 'appliance electronic indoor handheld- pocket- buttons hard store old- school- shul- toy- clothing- vehicle- food- flies-', size: 3 },
  device: { parent: 'object', p: 'electronic buttons hard store old- toy- clothing- food- vehicle- furniture- flies- breakable~ expensive~', size: 2 },
  clothing: { parent: 'object', p: 'clothing fabric soft handheld store daily electronic- hard- sound- vehicle- toy- food- tool- furniture- metal- glass- breakable- pairs~ kitchen- old', size: 2 },
  supply: { parent: 'object', p: 'school handheld store daily office~ electronic- vehicle- clothing- food- furniture- breakable- expensive- sound- old', size: 2 },
  kitchenware: { parent: 'object', p: 'kitchen indoor handheld store daily tool electronic- vehicle- clothing- toy- old school- shul-', size: 2 },
  sports: { parent: 'object', p: 'sport store toy~ game~ electronic- vehicle- clothing- food- kitchen- shul- office-', size: 3 },
  judaica: { parent: 'object', p: 'jewish indoor store electronic- vehicle- toy- clothing- food- sport- game- office- bathroom- kitchen- old', size: 2 },
  building: { p: 'building place manmade object- person- alive- animal- plant- food- drink- outdoor handheld- pocket- moves- legs- fur- vehicle- tool- toy- clothing- furniture- appliance- instrument- electronic~ store- sky- flies- liquid- big tall', size: 6 },
  place: { p: 'place object- person- alive- animal- plant- food- drink- handheld- pocket- moves- legs- fur- vehicle- tool- toy- clothing- furniture- appliance- instrument- electronic- store- liquid- container- writing- reading- big', size: 7 },
  nature: { p: 'natural manmade- alive- person- animal- plant- food- drink- electronic- outdoor indoor- handheld- pocket- store- legs- fur- vehicle- tool- toy- clothing- furniture- appliance- instrument- building- place- metal- wood- plastic- glass- paper- fabric- rubber- kitchen- school- shul- office- bathroom- jewish- holiday- shabbos- screen- buttons- engine- wheels- writing- reading- container- old', size: 6 },
  concept: { p: 'object- alive- person- animal- plant- food- drink- handheld/ pocket/ store- legs- fur- vehicle- tool- toy- clothing- furniture- appliance- instrument- building- place- electronic- metal/ wood/ plastic/ glass/ paper/ fabric/ rubber/ stone/ round/ sharp/ soft/ hard/ hot/ cold/ big/ heavy/ tall/ breakable/ colorful/ liquid- screen- buttons- engine- wheels- container- old', size: 0 },
};

// Size tiers, used by "bigger than ..." questions. 0 = not a physical thing.
export const SIZE_WORDS = {
  1: ['coin', 'ant', 'button', 'marble', 'pea', 'grape', 'fingernail', 'bee', 'penny', 'ring', 'dime', 'thumb', 'raisin', 'bean'],
  2: ['hand', 'fist', 'phone', 'apple', 'pencil', 'cup', 'mug', 'egg', 'mouse', 'baseball', 'tennis ball', 'banana', 'shoe', 'orange', 'spoon', 'key', 'cellphone'],
  3: ['shoebox', 'shoe box', 'breadbox', 'bread box', 'microwave', 'basketball', 'football', 'soccer ball', 'book', 'cat', 'laptop', 'toaster', 'backpack', 'chicken', 'bowling ball', 'loaf of bread', 'pillow', 'watermelon', 'rabbit', 'computer', 'tv', 'television'],
  4: ['chair', 'dog', 'person', 'human', 'me', 'you', 'man', 'kid', 'child', 'adult', 'door', 'table', 'desk', 'refrigerator', 'fridge', 'bike', 'bicycle', 'sofa', 'couch', 'bed', 'boy', 'girl', 'student', 'teacher', 'oven', 'stove', 'sheep', 'kangaroo'],
  5: ['car', 'horse', 'cow', 'piano', 'elephant', 'camel', 'giraffe', 'boat', 'van', 'room', 'tractor', 'dolphin'],
  6: ['house', 'building', 'bus', 'truck', 'tree', 'whale', 'school', 'train', 'airplane', 'plane', 'shul', 'synagogue', 'ship', 'helicopter'],
  7: ['mountain', 'city', 'country', 'ocean', 'earth', 'planet', 'world', 'sun', 'island', 'continent', 'desert', 'sky'],
};
const SIZE_LOOKUP = Object.entries(SIZE_WORDS)
  .flatMap(([tier, words]) => words.map((w) => [w, Number(tier)]))
  .sort((a, b) => b[0].length - a[0].length);
const SIZE_LABEL = { 1: 'tiny', 2: 'about hand-sized', 3: 'about the size of a shoebox', 4: 'around the size of a person or a chair', 5: 'about car-sized', 6: 'about house-sized', 7: 'enormous' };

const COLOR_WORDS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'brown', 'black', 'white', 'gray', 'grey', 'silver', 'gold', 'golden'];
const HOLIDAYS = {
  pesach: ['pesach', 'passover', 'seder'],
  sukkos: ['sukkos', 'sukkot', 'succos'],
  chanukah: ['chanukah', 'hanukkah', 'chanuka'],
  purim: ['purim'],
  roshhashana: ['rosh hashana', 'rosh hashanah'],
  yomkippur: ['yom kippur'],
  shavuos: ['shavuos', 'shavuot'],
  tubishvat: ['tu bishvat', 'tu bshvat'],
  lagbaomer: ['lag baomer', 'lag bomer'],
};
const NUMBER_WORDS = { zero: 0, no: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, ten: 10, many: 99 };

const VAL = { '': 'yes', '-': 'no', '~': 'sometimes', '?': 'unknown', '/': 'na' };

function parseFacts(str) {
  const out = {};
  for (const tok of (str || '').split(/\s+/).filter(Boolean)) {
    const m = tok.match(/^([a-z]+)([-~?/]?)$/);
    if (m) out[m[1]] = VAL[m[2]];
  }
  return out;
}

const subjects = new Map();

/** Register subjects (shared by every game that uses the knowledge base). */
export function registerSubjects(list) {
  for (const s of list) {
    const chain = [];
    for (let c = s.cat; c; c = CATS[c]?.parent) chain.unshift(c);
    const facts = {};
    let size = null;
    let legs = null;
    for (const c of chain) {
      Object.assign(facts, parseFacts(CATS[c]?.p));
      if (CATS[c]?.size != null) size = CATS[c].size;
      if (CATS[c]?.legs != null) legs = CATS[c].legs;
    }
    Object.assign(facts, parseFacts(s.p));
    subjects.set(s.id, {
      ...s,
      chain,
      facts,
      size: s.size ?? size,
      weight: s.weight ?? s.size ?? size,
      legs: s.legs ?? legs,
      names: [s.name, ...(s.aliases || [])].map((n) => normalize(n)),
    });
  }
}

export const getSubject = (id) => subjects.get(id) || null;
export const allSubjects = () => [...subjects.values()];

/** The fixed answer for one property. Returns yes | no | sometimes | unknown | na. */
export function valueOf(subj, propId) {
  const f = subj.facts;
  if (f[propId]) return f[propId];
  switch (propId) {
    case 'big':
      if (!subj.size) return 'na';
      return subj.size >= 4 ? 'yes' : subj.size <= 2 ? 'no' : 'sometimes';
    case 'heavy':
      if (!subj.weight) return 'na';
      return subj.weight >= 4 ? 'yes' : subj.weight <= 2 ? 'no' : 'sometimes';
    case 'tall':
      return subj.size >= 6 ? 'yes' : subj.size ? 'no' : 'na';
    case 'handheld':
      if (!subj.size) return 'na';
      return subj.size <= 2 ? 'yes' : subj.size >= 4 ? 'no' : 'sometimes';
    case 'pocket':
      if (!subj.size) return 'na';
      return subj.size <= 1 ? 'yes' : 'no';
    case 'legs':
      return subj.legs == null ? PROP_MAP.legs.dflt : subj.legs > 0 ? 'yes' : 'no';
    case 'natural':
      return f.manmade === 'yes' ? 'no' : f.manmade === 'no' ? 'yes' : 'unknown';
    case 'manmade':
      return f.natural === 'yes' ? 'no' : f.natural === 'no' ? 'yes' : 'unknown';
    case 'colorful':
      return subj.colors === '*' ? 'sometimes' : Array.isArray(subj.colors) && subj.colors.length >= 3 ? 'yes' : subj.colors ? 'no' : 'unknown';
    case 'object':
      return subj.chain.includes('object') || subj.chain.includes('food') ? 'yes' : 'no';
    default:
      return PROP_MAP[propId]?.dflt || 'unknown';
  }
}

const invert = (v) => (v === 'yes' ? 'no' : v === 'no' ? 'yes' : v);

/** Expand contractions so negation and patterns are easier to spot. */
export function prepQuestion(text) {
  return normalize(String(text).replace(/n['’]t\b/gi, ' not').replace(/['’]s\b/gi, ' is'))
    .replace(/\bcan not\b/g, 'cannot');
}

function findSize(text) {
  for (const [word, tier] of SIZE_LOOKUP) if (re(word).test(text)) return { word, tier };
  return null;
}

/**
 * Interpret a natural-language yes/no question against a subject.
 * @returns {{kind: 'answer'|'guess'|'unclear'|'notyesno', value?: string, propId?: string, comment?: string, guess?: string, correct?: boolean}}
 */
export function interpret(subj, question) {
  const q = prepQuestion(question);
  if (!q) return { kind: 'unclear' };
  const negated = /\b(not|never|cannot)\b/.test(q);
  const flip = (v) => (negated ? invert(v) : v);

  if (/^(what|which|where|how|why|who|when|tell me|describe|give me|say)\b/.test(q) && !/^how (big|heavy|tall)\b/.test(q)) {
    return { kind: 'notyesno' };
  }

  // Direct guess: "is it a bicycle?", "a bicycle?", "bicycle"
  const guessText = q
    .replace(/^(is it|is this|is that|could it be|can it be|would it be|it is|its|it s|maybe|guess|i think it is|i guess|are you thinking of|are you thinking about|is the answer|the answer is|do you mean)\b\s*/, '')
    .replace(/^(a|an|the|some)\s+/, '')
    .trim();
  if (guessText && guessText.split(' ').length <= 4) {
    const exact = matchSubjectName(guessText);
    const asProp = matchProp(guessText);
    // "Is it quiet?" is a question about a property, even though "quiet" is also a subject alias.
    if (exact && !(asProp && asProp.len >= guessText.length)) return { kind: 'guess', guess: guessText, correct: exact.id === subj.id, subjectId: exact.id };
  }

  // "bigger / smaller than X"
  const cmp = q.match(/\b(bigger|larger|taller|heavier|longer|wider|smaller|shorter|lighter|tinier|littler)\s+than\b(.*)$/);
  if (cmp) {
    const ref = findSize(cmp[2]);
    if (ref) {
      if (!subj.size) return { kind: 'answer', value: 'na', propId: 'big', comment: "It doesn't really have a size." };
      const bigger = /bigger|larger|taller|heavier|longer|wider/.test(cmp[1]);
      const mine = /heavier|lighter/.test(cmp[1]) ? subj.weight : subj.size;
      let v = mine === ref.tier ? 'sometimes' : (mine > ref.tier) === bigger ? 'yes' : 'no';
      return { kind: 'answer', value: flip(v), propId: 'big', comment: v === 'sometimes' ? 'About the same size!' : '' };
    }
  }
  if (/^how (big|tall)\b/.test(q) && subj.size) return { kind: 'answer', value: 'na', propId: 'big', comment: `It's ${SIZE_LABEL[subj.size]}.`, sizeHint: true };

  // Number of legs
  const legs = q.match(/\b(no|zero|one|two|three|four|five|six|seven|eight|ten|many|\d+)\s+(legs|feet|paws)\b/);
  if (legs && subj.legs != null) {
    const n = NUMBER_WORDS[legs[1]] ?? Number(legs[1]);
    const v = n === 99 ? (subj.legs > 4 ? 'yes' : 'no') : subj.legs === n ? 'yes' : 'no';
    return { kind: 'answer', value: flip(v), propId: 'legs' };
  }

  // Colors
  const color = COLOR_WORDS.find((c) => re(c).test(q));
  if (color && /\b(is it|is the|color|colour|colored|coloured|are they|does it come)\b/.test(q) && !/\bmade of\b/.test(q)) {
    const c = color === 'grey' ? 'gray' : color === 'golden' ? 'gold' : color;
    if (subj.colors === '*') return { kind: 'answer', value: 'sometimes', propId: 'colorful', comment: 'It comes in lots of colors.' };
    if (Array.isArray(subj.colors)) return { kind: 'answer', value: flip(subj.colors.includes(c) ? 'yes' : 'no'), propId: 'colorful' };
    if (subj.chain.includes('concept')) return { kind: 'answer', value: 'na', propId: 'colorful' };
  }

  // Specific holiday
  for (const [hid, words] of Object.entries(HOLIDAYS)) {
    if (words.some((w) => re(w).test(q))) {
      const v = (subj.holidays || []).includes(hid) ? 'yes' : 'no';
      return { kind: 'answer', value: flip(v), propId: 'holiday' };
    }
  }

  const best = matchProp(q);
  if (best) {
    let v = valueOf(subj, best.prop.id);
    if (best.inverted) v = invert(v);
    return { kind: 'answer', value: flip(v), propId: best.prop.id, comment: subj.notes?.[best.prop.id] || '' };
  }

  // "is it a <category word>?" checked against the subject's tags
  const cat = guessText.match(/^([a-z]+(?: [a-z]+)?)$/);
  if (cat && /^(is it|is this|could it be|are they|is it a kind of|is it a type of)\b/.test(q)) {
    const word = cat[1].replace(/^(kind of|type of)\s+/, '');
    const tags = (subj.tags || []).map((t) => normalize(t));
    if (tags.some((t) => t === word || similarity(t, word) > 0.85 || t === word.replace(/s$/, ''))) return { kind: 'answer', value: flip('yes'), propId: 'tag' };
    return { kind: 'guess', guess: word, correct: subj.names.some((n) => similarity(n, word) > 0.85) };
  }
  return { kind: 'unclear' };
}

export function matchProp(q) {
  let best = null;
  for (const prop of PROPS) {
    for (const [src, rx] of prop.patterns) if (rx.test(q) && (!best || src.length > best.len)) best = { prop, len: src.length, inverted: false };
    for (const [src, rx] of prop.inv) if (rx.test(q) && (!best || src.length > best.len)) best = { prop, len: src.length, inverted: true };
  }
  return best;
}

/** Find a registered subject named exactly (or nearly) like `text`. */
export function matchSubjectName(text) {
  const t = canonical(text);
  if (!t) return null;
  let best = null;
  for (const s of subjects.values()) {
    for (const n of s.names) {
      const c = canonical(n);
      if (!c) continue;
      const sim = c === t ? 1 : similarity(c.replace(/ /g, ''), t.replace(/ /g, ''));
      const need = c.length <= 4 ? 1 : 0.84;
      if (sim >= need && (!best || sim > best.sim)) best = { id: s.id, sim };
    }
  }
  return best;
}

/** True if the guess names this subject. */
export function isSubjectGuess(subj, text) {
  const t = canonical(text);
  return subj.names.some((n) => {
    const c = canonical(n);
    return c === t || (c.length > 4 && similarity(c.replace(/ /g, ''), t.replace(/ /g, '')) >= 0.84);
  });
}

export const ANSWER_TEXT = { yes: 'Yes', no: 'No', sometimes: 'Sometimes', unknown: 'Unknown', na: 'Not applicable' };

/** Facts list (for hints, AI ground truth and the admin preview). */
export function describe(subj, max = 200) {
  const lines = [];
  for (const p of PROPS) {
    const v = valueOf(subj, p.id);
    if (v !== 'unknown') lines.push(`${p.q} ${ANSWER_TEXT[v]}`);
    if (lines.length >= max) break;
  }
  if (subj.size) lines.push(`Size: ${SIZE_LABEL[subj.size]}`);
  if (subj.legs != null && subj.chain.includes('animal')) lines.push(`Legs: ${subj.legs}`);
  if (subj.colors) lines.push(`Colors: ${subj.colors === '*' ? 'many different colors' : subj.colors.join(', ')}`);
  if (subj.holidays?.length) lines.push(`Holidays: ${subj.holidays.join(', ')}`);
  return lines;
}

// ---------- Reverse mode: the computer asks, the class answers ----------

const REVERSE_PROPS = ['alive', 'animal', 'food', 'electronic', 'manmade', 'handheld', 'outdoor', 'kitchen', 'school', 'wheels',
  'metal', 'wood', 'plastic', 'fur', 'flies', 'water', 'sweet', 'fruit', 'toy', 'sport', 'vehicle', 'clothing', 'jewish',
  'holiday', 'place', 'mammal', 'bird', 'round', 'sound', 'screen', 'legs', 'farm', 'pet', 'wild', 'container', 'paper',
  'fabric', 'glass', 'soft', 'baked', 'dairy', 'instrument', 'furniture', 'appliance', 'sky', 'natural', 'shul', 'shabbos',
  'israel', 'building', 'tool', 'engine', 'writing', 'reading', 'hot', 'cold', 'big', 'eggs', 'buttons', 'drink', 'vegetable'];

const SIZE_QUESTIONS = [
  { id: 'size>2', q: 'Is it bigger than your hand?', test: (s) => (s.size ? (s.size > 2 ? 'yes' : 'no') : 'na') },
  { id: 'size>3', q: 'Is it bigger than a shoebox?', test: (s) => (s.size ? (s.size > 3 ? 'yes' : 'no') : 'na') },
  { id: 'size>4', q: 'Is it bigger than a person?', test: (s) => (s.size ? (s.size > 4 ? 'yes' : 'no') : 'na') },
  { id: 'size>5', q: 'Is it bigger than a car?', test: (s) => (s.size ? (s.size > 5 ? 'yes' : 'no') : 'na') },
];

function questionValue(subj, qid) {
  const sq = SIZE_QUESTIONS.find((s) => s.id === qid);
  return sq ? sq.test(subj) : valueOf(subj, qid);
}

export function newReverseState() {
  const weights = {};
  for (const s of subjects.values()) weights[s.id] = 1;
  return { weights, asked: [], rejected: [], history: [] };
}

/** Pick the most informative next question, or decide to guess. */
export function reverseNext(state, questionsLeft) {
  const live = Object.entries(state.weights).filter(([id, w]) => w > 0.0005 && !state.rejected.includes(id));
  const total = live.reduce((s, [, w]) => s + w, 0);
  live.sort((a, b) => b[1] - a[1]);
  if (!live.length || total < 0.002) return { type: 'giveup' };
  const [topId, topW] = live[0];
  const share = topW / total;
  const second = live[1]?.[1] || 0;
  const askedCount = state.asked.length;
  if (questionsLeft <= 1 || share > 0.6 || (share > 0.35 && topW > second * 3 && askedCount >= 6) || (askedCount >= 12 && share > 0.25)) {
    return { type: 'guess', subjectId: topId, confidence: share };
  }
  const options = [...REVERSE_PROPS.map((id) => ({ id, q: PROP_MAP[id].q })), ...SIZE_QUESTIONS].filter((o) => !state.asked.includes(o.id));
  let scored = options.map((o) => {
    let yes = 0;
    let no = 0;
    let other = 0;
    for (const [id, w] of live) {
      const v = questionValue(subjects.get(id), o.id);
      if (v === 'yes') yes += w;
      else if (v === 'no') no += w;
      else other += w;
    }
    return { ...o, score: Math.min(yes, no) / total - (other / total) * 0.35 };
  });
  scored = scored.sort((a, b) => b.score - a.score).slice(0, 3);
  const pick = scored[Math.floor(Math.random() * Math.min(scored.length, scored[0]?.score > 0.3 ? 2 : 1))];
  if (!pick || pick.score <= 0.01) return { type: 'guess', subjectId: topId, confidence: share };
  return { type: 'question', qid: pick.id, text: pick.q };
}

/** Apply the class's answer (yes | no | sometimes | unknown) to the candidate weights. */
export function reverseAnswer(state, qid, answer) {
  state.asked.push(qid);
  for (const id of Object.keys(state.weights)) {
    const v = questionValue(subjects.get(id), qid);
    let f = 1;
    if (answer === 'yes' || answer === 'no') {
      if (v === answer) f = 1;
      else if (v === 'yes' || v === 'no') f = 0.04; // tolerate an occasional mistaken answer
      else f = 0.5;
    } else {
      f = v === 'sometimes' || v === 'unknown' || v === 'na' ? 1 : 0.6;
    }
    state.weights[id] *= f;
  }
}
