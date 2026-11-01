// Runs with any of:
//   node --test tests/
//   jsc js/calc.js tests/calc.test.js   (macOS built-in engine)
//   opening tests/index.html in a browser and reading the console
var C = typeof Calc !== 'undefined' ? Calc : require('../js/calc.js');
var log = typeof console !== 'undefined' ? console.log : print;

var passed = 0;
var failures = [];

function check(name, actual, expected) {
  var a = JSON.stringify(actual);
  var e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failures.push(name + ': expected ' + e + ', got ' + a);
  }
}

function texts(result) {
  return result.messages.map(function (m) { return m.text; });
}

var bag = { emptyWeightKg: 2, capacityL: 40, weightLimitKg: 10, interiorCm: [52, 36, 21] };
var items = {
  shirt: { name: 'Shirt', weightKg: 0.2, volumeL: 1.5 },
  brick: { name: 'Brick', weightKg: 3, volumeL: 1 },
  big: { name: 'Big box', weightKg: 1, volumeL: 36 },
  tripod: { name: 'Tripod', weightKg: 1.5, volumeL: 3, dimsCm: [12, 62, 12] },
  board: { name: 'Board', weightKg: 1, volumeL: 3, dimsCm: [40, 40, 2] },
  slab: { name: 'Slab', weightKg: 1, volumeL: 3, dimsCm: [30, 30, 30] },
  laptop: { name: 'Laptop', weightKg: 1.4, volumeL: 1, dimsCm: [2, 22, 32] }
};

// Totals and quantities
var r = C.evaluate(bag, { shirt: 3 }, items);
check('weight includes bag and quantity', r.weightKg, 2.6);
check('volume uses quantity', r.volumeL, 4.5);
check('count uses quantity', r.count, 3);
check('fits when small', r.fits, true);
check('fit message', texts(r), ['Everything fits']);

check('floating point totals stay tidy', C.evaluate(bag, { shirt: 1 }, { shirt: { name: 's', weightKg: 0.1, volumeL: 0.1 + 0.2 } }).volumeL, 0.3);

r = C.evaluate(bag, {}, items);
check('empty bag still counts its own weight', r.weightKg, 2);
check('empty bag message', texts(r), ['This bag is empty']);
check('undefined packed is treated as empty', C.evaluate(bag, undefined, items).count, 0);
check('unknown ids are ignored', C.evaluate(bag, { ghost: 2 }, items).count, 0);
check('zero quantity is ignored', C.evaluate(bag, { shirt: 0 }, items).count, 0);

// Thresholds
check('below 90% is ok', C.level(35.9, 40), 'ok');
check('exactly 90% warns', C.level(36, 40), 'warn');
check('exactly at the limit warns', C.level(40, 40), 'warn');
check('just above the limit is over', C.level(40.1, 40), 'over');
check('no limit with contents is over', C.level(1, 0), 'over');
check('no limit and empty is ok', C.level(0, 0), 'ok');

// Volume
r = C.evaluate(bag, { big: 1 }, items);
check('at 90% volume still fits', r.fits, true);
check('nearly full warning', texts(r), ['Everything fits', 'Nearly full: 4 L left']);
check('overall level warns', r.level, 'warn');

r = C.evaluate(bag, { big: 1, slab: 2, shirt: 1 }, items);
check('over capacity does not fit', r.fits, false);
check('over capacity message', texts(r).indexOf('Over by 3.5 L') !== -1, true);
check('over capacity level', r.level, 'over');

// Weight is separate from fit
r = C.evaluate(bag, { brick: 3 }, items);
check('overweight bag can still fit', r.fits, true);
check('overweight level', r.weightLevel, 'over');
check('overweight message', texts(r), ['Everything fits', '1 kg over the weight limit']);

// Dimensions, including rotation
check('rotated item fits', C.sizeProblem(items.laptop, bag), null);
check('longest side too long', C.sizeProblem(items.tripod, bag), 'too long');
check('second side too wide', C.sizeProblem(items.board, bag), 'too wide');
check('third side too thick', C.sizeProblem(items.slab, bag), 'too thick');
check('no item dimensions means no problem', C.sizeProblem(items.shirt, bag), null);
check('no bag dimensions means no problem', C.sizeProblem(items.tripod, { interiorCm: null }), null);
check('exact match fits', C.sizeProblem({ dimsCm: [21, 52, 36] }, bag), null);

r = C.evaluate(bag, { tripod: 1 }, items);
check('oversized item does not fit', r.fits, false);
check('oversized item is named', texts(r), ['Tripod is too long for this bag']);

// Trip total
var bags = { a: bag, b: { emptyWeightKg: 1, capacityL: 20, weightLimitKg: 5, interiorCm: [40, 30, 20] } };
var trip = { bagIds: ['a', 'b'], packed: { a: { shirt: 1 }, b: { brick: 1 } } };
check('trip total covers all bags', C.tripWeightKg(trip, bags, items), 6.2);
check('trip total skips deleted bags', C.tripWeightKg({ bagIds: ['a', 'gone'], packed: {} }, bags, items), 2);

// Volume from dimensions
check('litres from centimetres', C.volumeFromDims([52, 36, 21]), 39.31);
check('whole litres', C.volumeFromDims([10, 10, 10]), 1);
check('incomplete dimensions give no volume', C.volumeFromDims([10, null, 10]), null);
check('zero dimension gives no volume', C.volumeFromDims([10, 0, 10]), null);

// Carry-on rule
var checked = { name: 'Checked', emptyWeightKg: 4, capacityL: 90, weightLimitKg: 23, isCarryOn: false };
var cabin = { name: 'Cabin', emptyWeightKg: 2, capacityL: 40, weightLimitKg: 10, isCarryOn: true };
var battery = { name: 'Power bank', weightKg: 0.4, volumeL: 0.25, carryOnOnly: true };
check('carry-on-only item blocked from checked bag', C.carryOnBlocked(battery, checked), true);
check('carry-on-only item allowed in carry-on', C.carryOnBlocked(battery, cabin), false);
check('normal item allowed anywhere', C.carryOnBlocked(items.shirt, checked), false);
r = C.evaluate(checked, { battery: 1 }, { battery: battery });
check('misplaced item is named', texts(r), ['Everything fits', 'Power bank must go in a carry-on bag']);
check('misplaced item is a red status', r.level, 'over');
check('carry-on has no misplaced items', C.evaluate(cabin, { battery: 1 }, { battery: battery }).misplaced.length, 0);

// Owned quantity across a trip's bags
var ownedTrip = { bagIds: ['a', 'b'], packed: { a: { cable: 1, sock: 2 }, b: { cable: 1 }, gone: { cable: 9 } } };
check('counts every bag on the trip', C.packedInTrip(ownedTrip, 'cable'), 2);
check('ignores bags not on the trip', C.remaining({ id: 'cable', ownedQty: 3 }, ownedTrip), 1);
check('nothing left once all are packed', C.remaining({ id: 'sock', ownedQty: 2 }, ownedTrip), 0);
check('over-packed old data stays at zero', C.remaining({ id: 'sock', ownedQty: 1 }, ownedTrip), 0);
check('missing quantity means one', C.remaining({ id: 'hat' }, ownedTrip), 1);

// Packing cubes
var cubeItems = {
  cube: { id: 'cube', name: 'Cube', cube: true, weightKg: 0.08, volumeL: 0.2, capacityL: 10, dimsCm: [39, 31, 10] },
  fleece: { id: 'fleece', name: 'Fleece', weightKg: 0.5, volumeL: 5 },
  top: { id: 'top', name: 'Top', weightKg: 0.2, volumeL: 1 },
  cam: { id: 'cam', name: 'Cam', weightKg: 0.3, volumeL: 1, carryOnOnly: true }
};
var cabinBag = { emptyWeightKg: 2, capacityL: 40, weightLimitKg: 10, interiorCm: [52, 36, 21], isCarryOn: true };
var holdBag = { emptyWeightKg: 4, capacityL: 90, weightLimitKg: 23, interiorCm: [70, 46, 28], isCarryOn: false };
var t = C.cubeTotals(cubeItems.cube, { fleece: 1, top: 2 }, cubeItems);
check('cube weight includes itself', t.weightKg, 0.98);
check('cube contents volume', t.contentsL, 7);
check('cube takes contents volume', t.volumeL, 7);
check('cube count', t.count, 3);
check('empty cube takes its folded size', C.cubeTotals(cubeItems.cube, {}, cubeItems).volumeL, 0.2);
check('missing contents are fine', C.cubeTotals(cubeItems.cube, undefined, cubeItems).count, 0);

r = C.evaluate(cabinBag, { cube: 1, top: 1 }, cubeItems, { cube: { fleece: 1 } });
check('bag weight includes cube and contents', r.weightKg, 2.78);
check('bag volume counts contents once', r.volumeL, 6);
check('cube counts as one thing in the bag', r.count, 2);
check('cube in bag fits', r.fits, true);

r = C.evaluate(cabinBag, { cube: 1 }, cubeItems, { cube: { fleece: 3 } });
check('overfull cube does not fit', r.fits, false);
check('overfull cube is named', texts(r), ['Cube is over by 5 L']);

r = C.evaluate(holdBag, { cube: 1 }, cubeItems, { cube: { cam: 1 } });
check('carry-on item inside a cube is reported', texts(r), ['Everything fits', 'Cam must go in a carry-on bag']);
check('same cube is fine in a carry-on', C.evaluate(cabinBag, { cube: 1 }, cubeItems, { cube: { cam: 1 } }).misplaced.length, 0);

var slim = { noun: 'cube', emptyWeightKg: 0.08, capacityL: 10, weightLimitKg: Infinity, interiorCm: [39, 31, 10], isCarryOn: true };
check('open cube has no weight warning', C.evaluate(slim, { fleece: 1 }, cubeItems).weightLevel, 'ok');
check('open cube uses its own word', texts(C.evaluate(slim, {}, cubeItems)), ['This cube is empty']);
check('open cube names thick items', C.sizeProblem({ dimsCm: [32, 22, 15] }, slim), 'too thick');

var cubeTrip = { bagIds: ['a', 'b'], packed: { a: { cube: 1 }, b: { top: 1 } }, cubes: { cube: { fleece: 1 }, loose: { top: 1 } } };
check('item inside a cube counts as packed', C.packedInTrip(cubeTrip, 'fleece'), 1);
check('items in bags and cubes add up', C.packedInTrip(cubeTrip, 'top'), 2);
check('finds the bag holding a cube', C.cubeBagId(cubeTrip, 'cube'), 'a');
check('cube not in a bag', C.cubeBagId(cubeTrip, 'loose'), null);
var cubeItems2 = { cube: cubeItems.cube, loose: { id: 'loose', name: 'Loose', cube: true, weightKg: 0.1, volumeL: 0.2, capacityL: 5 }, fleece: cubeItems.fleece, top: cubeItems.top };
var cubeBags = { a: cabinBag, b: holdBag };
check('loose cubes found', C.looseCubeIds(cubeTrip, cubeItems2), ['loose']);
check('empty loose cubes are ignored', C.looseCubeIds({ bagIds: [], packed: {}, cubes: { loose: {} } }, cubeItems2), []);
check('trip total includes cubes everywhere', C.tripWeightKg(cubeTrip, cubeBags, cubeItems2), 7.08);

// Density
check('density is kg per litre', C.density(1.6, 2), 0.8);
check('no volume counts as medium', C.densityLabel(C.density(1, 0)), 'medium density');
check('fleece reads light', C.densityLabel(C.density(0.5, 5)), 'light for its size');
check('laptop reads dense', C.densityLabel(C.density(1.6, 1.5)), 'dense for its size');
check('shade floor', C.densityShade(0.01), 0);
check('shade ceiling', C.densityShade(5), 1);
check('denser is darker', C.densityShade(1) > C.densityShade(0.2), true);

check('MT100 jacket is the palest shade', C.densityShade(C.density(0.32, 4)), 0);
var lastLuminance = 2;
var darkensSteadily = true;
var readable = true;
for (var step = 0; step <= 100; step++) {
  var colors = C.densityColors(step / 100);
  if (colors.luminance >= lastLuminance) darkensSteadily = false;
  lastLuminance = colors.luminance;
  var textLuminance = colors.text === '#000' ? 0 : 1;
  var contrast = (Math.max(colors.luminance, textLuminance) + 0.05) / (Math.min(colors.luminance, textLuminance) + 0.05);
  if (contrast < 4.5) readable = false;
}
check('higher density is always darker', darkensSteadily, true);
check('text stays readable on every shade', readable, true);

// Box sizes
function tile(volumeL, name, capacityL, widthPx, heightPx) {
  return C.tileSize({
    volumeL: volumeL,
    capacityL: capacityL || 40,
    widthPx: widthPx || 490,
    heightPx: heightPx || 380,
    name: name || 'Item',
    detail: '0.5 kg · 1 L'
  });
}
function area(s) {
  return (s.cols * 16 - 4) * (s.rows * 16 - 4);
}
check('bigger items get bigger boxes', area(tile(12)) > area(tile(6)), true);
var twelve = area(tile(12));
var six = area(tile(6));
check('area roughly follows volume', twelve / six > 1.7 && twelve / six < 2.3, true);
check('share of the bag is about right', Math.abs(area(tile(12)) / (490 * 380) - 0.27) < 0.05, true);
check('same volume looks bigger in a smaller container', area(tile(4, 'Item', 5.4)) > area(tile(4, 'Item', 40)), true);
check('tiny items keep a minimum width', tile(0.1).cols, 6);
check('no volume keeps a minimum width', tile(0).cols, 6);
check('no capacity is safe', tile(1, 'Item', 0).cols, 6);
check('long names get taller boxes', tile(0.2, 'Columbia Silver Ridge Utility II shirt').rows > tile(0.2, 'Cap').rows, true);
check('boxes never exceed the container width', tile(500).cols <= Math.floor((490 + 4) / 16), true);
check('icon stays in range', tile(40).iconPx <= 56 && tile(0.1).iconPx >= 22, true);

// Formatting
check('format trims zeros', C.fmt(3.5), '3.5');
check('format rounds to two decimals', C.fmt(1.2345), '1.23');

failures.forEach(function (f) { log('FAIL ' + f); });
log(passed + ' passed, ' + failures.length + ' failed');
if (failures.length) throw new Error(failures.length + ' test(s) failed');
