// Starter data. Weights and sizes are typical estimates, editable in the app.
var Seed = (function () {
  var ICONS = ['👕', '👖', '🩳', '👗', '🧥', '🧦', '🧤', '🩲', '👟', '🥾', '👡', '🧢', '🧣', '🩱', '🩴',
    '🪥', '🧴', '🧼', '💊', '🩹', '🪒', '💄', '💻', '📱', '📷', '🎧', '🔌', '🔋', '⌚',
    '📚', '🛂', '🕶️', '☂️', '🎒', '💧', '🧸', '🎁', '🧳', '📦'];

  var CARRY_ON_ONLY = ['laptop', 'charger', 'powerbank', 'camera', 'lens', 'djinano', 'headphones'];

  // Bump DATA_VERSION when starter records change. Saved data below a version
  // gets that version's records once, on load (see Store.normalize).
  var DATA_VERSION = 8;
  var OWNED = { usbc: 3, socks: 2, pole: 2, tshirt: 7, drifit: 7, workoutshorts: 5, underwear: 10 };
  var ITEM_UPDATES = [
    { version: 2, keys: ['camera', 'lens', 'charger', 'usbc', 'tripod', 'djinano', 'mt66', 'headphones', 'bottle',
      'powerbank', 'jacket', 'socks', 'mt900', 'pole', 'gloves', 'zipoff'] },
    { version: 4, keys: ['fasttrek', 'glacier', 'energytech'] },
    { version: 5, keys: ['uniqlocargo', 'silverridge', 'heattechtop', 'heattechbottom', 'extrawarmtop',
      'extrawarmbottom', 'ultrawarmtop', 'ultrawarmbottom'] },
    { version: 6, keys: ['halfmoon1', 'halfmoon2', 'cubel1', 'cubel2', 'cubes1', 'cubes2', 'cubes3', 'cubes4'] },
    { version: 7, keys: ['tshirt', 'drifit', 'silverridgeshirt', 'workoutshorts', 'underwear', 'puffer', 'thpuffer',
      'sneakers', 'techamphibian'] },
    { version: 8, keys: ['thpuffer'], fields: ['name', 'description'] }
  ];
  // The bag packs these replaced by individual cubes in version 6.
  var REMOVED_IN_V6 = ['item-halfmoon', 'item-travelbags'];

  function item(key, name, description, category, weightKg, volumeL, icon, dimsCm) {
    var result = {
      id: 'item-' + key,
      name: name,
      description: description,
      category: category,
      weightKg: weightKg,
      volumeL: volumeL,
      ownedQty: OWNED[key] || 1,
      icon: icon
    };
    if (dimsCm) result.dimsCm = dimsCm;
    if (CARRY_ON_ONLY.indexOf(key) !== -1) result.carryOnOnly = true;
    return result;
  }

  // weightKg and volumeL are the empty cube; dimsCm is its full size.
  function cube(key, name, description, weightKg, volumeL, capacityL, dimsCm) {
    var result = item(key, name, description, 'Cubes', weightKg, volumeL, '📦', dimsCm);
    result.cube = true;
    result.capacityL = capacityL;
    return result;
  }

  var ITEMS = [
    item('tshirt', 'Cotton T-shirt', 'Everyday cotton tee, typical weight', 'Clothes', 0.16, 1, '👕'),
    item('drifit', 'Dri-FIT T-shirt', 'Training tee, typical weight', 'Clothes', 0.145, 0.8, '👕'),
    item('silverridgeshirt', 'Columbia Silver Ridge Utility II shirt', 'Short-sleeve hiking shirt', 'Clothes', 0.246, 1.5, '👕'),
    item('shirt', 'Button shirt', 'Smart shirt for dinners out', 'Clothes', 0.25, 1.5, '👕'),
    item('jeans', 'Jeans', 'Classic denim, rolled', 'Clothes', 0.7, 3, '👖'),
    item('trousers', 'Light trousers', 'Quick-dry travel pair', 'Clothes', 0.35, 2, '👖'),
    item('mt900', 'Forclaz MT900 trousers', 'Water-repellent, wind-resistant trekking', 'Clothes', 0.51, 2.5, '👖'),
    item('zipoff', 'Forclaz MT500 zip-off pants', 'Modular 2-in-1 trekking pants', 'Clothes', 0.48, 2.5, '👖'),
    item('uniqlocargo', 'Uniqlo cargo pants', 'Casual cargo pants', 'Clothes', 0.5, 2.5, '👖'),
    item('silverridge', 'Columbia Silver Ridge pants', 'Utility hiking pants', 'Clothes', 0.35, 2, '👖'),
    item('heattechtop', 'Uniqlo HEATTECH top', 'Normal warmth base layer', 'Clothes', 0.11, 0.5, '👕'),
    item('heattechbottom', 'Uniqlo HEATTECH bottom', 'Normal warmth base layer', 'Clothes', 0.11, 0.5, '👖'),
    item('extrawarmtop', 'Uniqlo HEATTECH Extra Warm top', 'About 1.5x warmer than normal', 'Clothes', 0.18, 0.8, '👕'),
    item('extrawarmbottom', 'Uniqlo HEATTECH Extra Warm bottom', 'About 1.5x warmer than normal', 'Clothes', 0.17, 0.7, '👖'),
    item('ultrawarmtop', 'Uniqlo HEATTECH Ultra Warm top', 'About 2.25x warmer than normal', 'Clothes', 0.25, 1.2, '👕'),
    item('ultrawarmbottom', 'Uniqlo HEATTECH Ultra Warm bottom', 'About 2.25x warmer than normal', 'Clothes', 0.23, 1, '👖'),
    item('shorts', 'Shorts', 'Casual warm-weather pair', 'Clothes', 0.25, 1, '🩳'),
    item('workoutshorts', 'Workout shorts', 'Gym pair, typical weight', 'Clothes', 0.15, 0.8, '🩳'),
    item('dress', 'Dress', 'Packs small, dresses up', 'Clothes', 0.3, 1.5, '👗'),
    item('sweater', 'Sweater', 'Warm knit layer', 'Clothes', 0.5, 4, '🧥'),
    item('jacket', 'Kathmandu Trailhead jacket', 'Stretch 2.5-layer rain jacket', 'Clothes', 0.3, 2, '🧥'),
    item('puffer', 'Forclaz MT100 down jacket', 'Water-repellent, hooded, to -5°C', 'Clothes', 0.32, 4, '🧥'),
    item('thpuffer', 'Tommy Hilfiger Classic Hoody puffer', 'Model 156AN122, polyester fill', 'Clothes', 1.1, 12, '🧥'),
    item('fasttrek', 'Columbia Fast Trek II fleece', 'Full-zip microfleece, size L', 'Clothes', 0.545, 5, '🧥'),
    item('glacier', 'North Face TKA Glacier fleece', '100-weight 1/4-zip fleece', 'Clothes', 0.215, 2.5, '🧥'),
    item('socks', 'Kathmandu NuYarn socks', 'Ergonomic hike socks, per pair', 'Clothes', 0.088, 0.4, '🧦'),
    item('gloves', 'Forclaz MT500 gloves', 'Tactile stretch trekking gloves', 'Clothes', 0.06, 0.3, '🧤'),
    item('underwear', 'Underwear', 'One pair, typical weight', 'Clothes', 0.075, 0.2, '🩲'),
    item('swimwear', 'Swimwear', 'For the beach or pool', 'Clothes', 0.15, 0.5, '🩱'),
    item('hat', 'Cap', 'Sun protection', 'Clothes', 0.1, 1, '🧢'),
    item('sneakers', 'Nike Vomero 18 GTX', 'Black, US 9.5, pair', 'Shoes', 0.64, 9.15, '👟', [32, 22, 13]),
    item('techamphibian', 'Salomon Techamphibian', 'Black, US 9.5, pair', 'Shoes', 0.62, 5.58, '👟', [31, 20, 9]),
    item('boots', 'Hiking boots', 'Sturdy pair for trails', 'Shoes', 1.2, 10, '🥾', [33, 24, 16]),
    item('energytech', 'North Face Energy Tech II boots', 'Mid GTX hiking and trekking pair', 'Shoes', 1.05, 10.56, '🥾', [32, 22, 15]),
    item('sandals', 'Sandals', 'Light summer pair', 'Shoes', 0.4, 2, '🩴', [29, 20, 6]),
    item('toiletries', 'Toiletry bag', 'Daily essentials', 'Toiletries', 0.8, 3, '🧴', [24, 14, 11]),
    item('toothbrush', 'Toothbrush kit', 'Brush and travel paste', 'Toiletries', 0.1, 0.3, '🪥', [20, 5, 4]),
    item('sunscreen', 'Sunscreen', '100 ml bottle', 'Toiletries', 0.12, 0.15, '🧴', [13, 5, 3]),
    item('firstaid', 'First aid kit', 'Plasters and basics', 'Toiletries', 0.25, 1, '🩹', [15, 11, 6]),
    item('medicine', 'Medicine', 'Personal prescriptions', 'Toiletries', 0.1, 0.3, '💊', [10, 8, 5]),
    item('laptop', 'Laptop', '14-inch with sleeve', 'Tech', 1.6, 1.5, '💻', [33, 24, 2.5]),
    item('charger', 'UGREEN Nexode 100W charger', '4-port GaN fast charger', 'Tech', 0.21, 0.1, '🔌', [7.08, 4.29, 3.27]),
    item('usbc', 'USB-C cable 1.2 m', 'USB-C to USB-C, per cable', 'Tech', 0.04, 0.16, '🔌', [8, 8, 2.5]),
    item('powerbank', 'UGREEN 10000mAh power bank', '22.5W portable charger', 'Tech', 0.2, 0.15, '🔋', [13.2, 6.6, 1.7]),
    item('camera', 'Sony ZV-E10', 'Camera body with battery and card', 'Tech', 0.343, 0.33, '📷', [11.5, 6.4, 4.5]),
    item('lens', 'Sony 18-105mm F4 lens', 'E PZ 18-105mm F4 G OSS', 'Tech', 0.427, 0.67, '📷', [11, 7.8, 7.8]),
    item('djinano', 'DJI Osmo Nano kit', 'Camera, Vision Dock and box accessories', 'Tech', 0.2, 0.48, '📷', [12, 8, 5]),
    item('tripod', 'SmallRig AP-21 tripod', '71-inch travel tripod', 'Tech', 1.74, 4.86, '📷', [60, 9, 9]),
    item('mt66', 'Ulanzi MT66 ClipMate', 'Mini tripod for action cameras', 'Tech', 0.108, 0.25, '📷', [12.5, 5, 4]),
    item('headphones', 'AirPods Pro 3', 'Earbuds in MagSafe charging case', 'Tech', 0.055, 0.06, '🎧', [6.22, 4.72, 2.18]),
    item('book', 'Book', 'Paperback for the trip', 'Other', 0.35, 0.5, '📚', [20, 13, 3]),
    item('documents', 'Travel documents', 'Passport, cards and tickets', 'Other', 0.15, 0.2, '🛂', [23, 12, 2]),
    item('sunglasses', 'Sunglasses', 'In a hard case', 'Other', 0.1, 0.4, '🕶️', [16, 7, 5]),
    item('umbrella', 'Umbrella', 'Compact folding', 'Other', 0.35, 0.6, '☂️', [28, 6, 6]),
    item('bottle', 'Nalgene 1L bottle', 'Wide mouth, weight when empty', 'Other', 0.177, 1.7, '💧', [21.5, 8.9, 8.9]),
    item('pole', 'Forclaz MT500 hiking pole', 'Anti-shock, grey, per pole', 'Other', 0.265, 1.6, '🥾', [64, 5, 5]),
    cube('halfmoon1', 'Half-moon cube 1', 'Waterproof, 15 L', 0.079, 0.25, 15, [38, 32, 10]),
    cube('halfmoon2', 'Half-moon cube 2', 'Waterproof, 15 L', 0.079, 0.25, 15, [38, 32, 10]),
    cube('cubel1', 'Travel cube large 1', 'Set 1, large', 0.08, 0.2, 12.09, [39, 31, 10]),
    cube('cubel2', 'Travel cube large 2', 'Set 2, large', 0.08, 0.2, 12.09, [39, 31, 10]),
    cube('cubes1', 'Travel cube small 1', 'Set 1, small', 0.06, 0.1, 5.4, [30, 20, 9]),
    cube('cubes2', 'Travel cube small 2', 'Set 1, small', 0.06, 0.1, 5.4, [30, 20, 9]),
    cube('cubes3', 'Travel cube small 3', 'Set 2, small', 0.06, 0.1, 5.4, [30, 20, 9]),
    cube('cubes4', 'Travel cube small 4', 'Set 2, small', 0.06, 0.1, 5.4, [30, 20, 9]),
    item('daypack', 'Packable daypack', 'Folds into its own pocket', 'Other', 0.2, 0.5, '🎒', [15, 12, 4])
  ];

  var BAGS = [
    { id: 'bag-carryon', name: 'Carry-on', emptyWeightKg: 2.6, capacityL: 40, weightLimitKg: 10, interiorCm: [52, 36, 21], isCarryOn: true },
    { id: 'bag-checked', name: 'Checked case', emptyWeightKg: 4.4, capacityL: 90, weightLimitKg: 23, interiorCm: [70, 46, 28], isCarryOn: false },
    { id: 'bag-daypack', name: 'Daypack', emptyWeightKg: 0.9, capacityL: 25, weightLimitKg: 10, interiorCm: [45, 28, 20], isCarryOn: true }
  ];

  function state() {
    return JSON.parse(JSON.stringify({
      items: ITEMS,
      bags: BAGS,
      trips: [{
        id: 'trip-first',
        name: 'My first trip',
        bagIds: ['bag-carryon', 'bag-checked'],
        activeBagId: 'bag-carryon',
        activeCubeId: null,
        packed: {},
        cubes: {}
      }],
      activeTripId: 'trip-first',
      dataVersion: DATA_VERSION
    }));
  }

  return { ICONS: ICONS, DATA_VERSION: DATA_VERSION, ITEM_UPDATES: ITEM_UPDATES, REMOVED_IN_V6: REMOVED_IN_V6, state: state };
})();
