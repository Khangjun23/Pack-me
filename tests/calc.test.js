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

// A camera bag: a cube holding carry-on-only items may only go in a carry-on bag
var camBags = { cabin: cabinBag, hold: holdBag };
var camItems = Object.assign({ cube2: { id: 'cube2', name: 'Cube 2', cube: true, weightKg: 0.1, volumeL: 0.2, capacityL: 5 } }, cubeItems);
var looseTrip = { bagIds: ['cabin', 'hold'], packed: { cabin: {}, hold: {} }, cubes: {} };
var code = function (p) { return p ? p.code : null; };
check('camera can go in a loose cube', code(C.packProblem(cubeItems.cam, { cubeId: 'cube' }, looseTrip, camItems, camBags)), null);
var camInCube = { bagIds: ['cabin', 'hold'], packed: { cabin: {}, hold: {} }, cubes: { cube: { cam: 1 } } };
check('camera bag fits a carry-on', code(C.packProblem(cubeItems.cube, { bag: cabinBag }, camInCube, camItems, camBags)), null);
var held = C.packProblem(cubeItems.cube, { bag: holdBag }, camInCube, camItems, camBags);
check('camera bag refused by a checked bag, naming the camera', [code(held), held.items.map(function (i) { return i.id; })], ['cube-carry-on', ['cam']]);
check('a cube of clothes still goes anywhere', code(C.packProblem(cubeItems.cube, { bag: holdBag }, { bagIds: ['hold'], packed: { hold: {} }, cubes: { cube: { top: 1 } } }, camItems, camBags)), null);
var cubeInHold = { bagIds: ['cabin', 'hold'], packed: { cabin: {}, hold: { cube: 1 } }, cubes: { cube: {} } };
var intoHeld = C.packProblem(cubeItems.cam, { cubeId: 'cube' }, cubeInHold, camItems, camBags);
check('camera refused by a cube already in a checked bag', [code(intoHeld), intoHeld.bag === holdBag], ['cube-in-checked', true]);
check('clothes still go in that cube', code(C.packProblem(cubeItems.top, { cubeId: 'cube' }, cubeInHold, camItems, camBags)), null);
check('camera fine in a cube inside the carry-on', code(C.packProblem(cubeItems.cam, { cubeId: 'cube' }, { bagIds: ['cabin'], packed: { cabin: { cube: 1 } }, cubes: {} }, camItems, camBags)), null);
check('no cube inside a cube', code(C.packProblem(camItems.cube2, { cubeId: 'cube' }, looseTrip, camItems, camBags)), 'cube-in-cube');
check('camera still refused by a checked bag directly', code(C.packProblem(cubeItems.cam, { bag: holdBag }, looseTrip, camItems, camBags)), 'carry-on');
check('no bag open', code(C.packProblem(cubeItems.top, { bag: null }, looseTrip, camItems, camBags)), 'no-bag');
check('none left to pack', code(C.packProblem(cubeItems.cam, { bag: cabinBag }, camInCube, camItems, camBags)), 'none-left');
check('carry-on items in a cube are listed', C.cubeCarryOnItems(camInCube, 'cube', camItems).map(function (i) { return i.id; }), ['cam']);

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

// Box colour follows weight
check('no weight is palest', C.weightShade(0, 10), 0);
check('a fifth of the limit is deepest', C.weightShade(2, 10), 1);
check('more than that stays deepest', C.weightShade(5, 10), 1);
check('shade scales with weight', C.weightShade(1, 10), 0.5);
check('no limit is safe', C.weightShade(1, 0), 0);
check('same item is paler in a bag with a higher limit', C.weightShade(1.1, 23) < C.weightShade(1.1, 10), true);
check('puffer outweighs power bank', C.weightShade(1.1, 10) > C.weightShade(0.2, 10), true);

var lastLuminance = 2;
var darkensSteadily = true;
var readable = true;
for (var step = 0; step <= 100; step++) {
  var colors = C.shadeColors(step / 100);
  if (colors.luminance >= lastLuminance) darkensSteadily = false;
  lastLuminance = colors.luminance;
  var textLuminance = colors.text === '#000' ? 0 : 1;
  var contrast = (Math.max(colors.luminance, textLuminance) + 0.05) / (Math.min(colors.luminance, textLuminance) + 0.05);
  if (contrast < 4.5) readable = false;
}
check('higher shade is always darker', darkensSteadily, true);
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

// Make room
var roomItems = {
  laptop: { id: 'laptop', name: 'Laptop', weightKg: 1.6, volumeL: 1.5 },
  puffer: { id: 'puffer', name: 'Puffer', weightKg: 1.1, volumeL: 12 },
  shirt: { id: 'shirt', name: 'Shirt', weightKg: 0.16, volumeL: 1 },
  fleece: { id: 'fleece', name: 'Fleece', weightKg: 0.5, volumeL: 5 },
  cube: { id: 'cube', name: 'Cube', cube: true, weightKg: 0.08, volumeL: 0.2, capacityL: 12 },
  spare: { id: 'spare', name: 'Spare', cube: true, weightKg: 0.06, volumeL: 0.1, capacityL: 5 }
};
var roomBag = { emptyWeightKg: 2, capacityL: 30, weightLimitKg: 5, interiorCm: [52, 36, 21], isCarryOn: true };
var fine = C.makeRoom(roomBag, { shirt: 1 }, roomItems);
check('nothing shown when well under', [fine.weight, fine.volume], [null, null]);

var room = C.makeRoom(roomBag, { laptop: 1, puffer: 1, shirt: 7 }, roomItems);
check('over by weight', room.weight.overBy, 0.82);
check('no volume section while volume is fine', room.volume, null);
check('heaviest first', room.weight.rows.map(function (x) { return x.item.id; }), ['laptop', 'shirt', 'puffer']);
check('row total covers quantity', room.weight.rows[1].total, 1.12);
check('percent of limit', room.weight.rows[0].percent, 32);
check('single item fixes it', room.weight.rows[0].fixCount, 1);
check('several of a multiple fix it', room.weight.rows[1].fixCount, 6);
check('single item also fixes', room.weight.rows[2].fixCount, 1);
check('solution exists', room.weight.noSingleFix, false);

var tooMany = C.makeRoom(roomBag, { shirt: 40 }, roomItems);
check('count beyond what is packed is no fix', C.makeRoom(roomBag, { shirt: 2, laptop: 2, puffer: 1 }, roomItems).weight.rows.filter(function (x) { return x.item.id === 'shirt'; })[0].fixCount, null);
check('multiple can fix when enough are packed', tooMany.weight.rows[0].fixCount, 22);
var stuck = C.makeRoom(roomBag, { laptop: 3, puffer: 1 }, roomItems);
check('two of one item can clear a big excess', [stuck.weight.overBy, stuck.weight.rows[0].fixCount, stuck.weight.noSingleFix], [2.9, 2, false]);
var stuck2 = C.makeRoom({ emptyWeightKg: 2, capacityL: 90, weightLimitKg: 3, isCarryOn: true }, { fleece: 3, shirt: 2 }, roomItems);
check('some of a multiple clears it', [stuck2.weight.overBy, stuck2.weight.noSingleFix], [0.82, false]);
var stuck3 = C.makeRoom({ emptyWeightKg: 2, capacityL: 90, weightLimitKg: 3, isCarryOn: true }, { fleece: 1, shirt: 1, puffer: 1 }, roomItems);
check('heaviest fixes alone', stuck3.weight.rows[0].fixCount, 1);
var stuck4 = C.makeRoom({ emptyWeightKg: 2, capacityL: 90, weightLimitKg: 2.5, isCarryOn: true }, { fleece: 2, shirt: 2 }, roomItems);
check('needs more than one kind', [stuck4.weight.overBy, stuck4.weight.rows[0].fixCount, stuck4.weight.rows[1].fixCount, stuck4.weight.noSingleFix], [0.82, 2, null, false]);
var stuck5 = C.makeRoom({ emptyWeightKg: 2, capacityL: 90, weightLimitKg: 1.5, isCarryOn: true }, { fleece: 1, shirt: 2 }, roomItems);
check('even all of one kind is not enough', [stuck5.weight.overBy, stuck5.weight.noSingleFix], [1.32, true]);

var cubed = C.makeRoom(roomBag, { cube: 1, puffer: 2 }, roomItems, { cube: { fleece: 2, shirt: 1 } });
check('cube contents ranked individually', cubed.volume.rows.map(function (x) { return [x.item.id, x.cubeId]; }), [['puffer', null], ['fleece', 'cube'], ['shirt', 'cube']]);
check('cube shell not listed when it has contents', cubed.volume.rows.some(function (x) { return x.item.id === 'cube'; }), false);
check('volume over counts cube once', cubed.volume.overBy, 5);
check('item inside a cube can fix it', cubed.volume.rows[1].fixCount, 1);
var withEmpty = C.makeRoom(roomBag, { spare: 1, puffer: 3 }, roomItems);
check('empty cube can still be listed', withEmpty.volume.rows.some(function (x) { return x.item.id === 'spare'; }), true);

var near = C.makeRoom(roomBag, { laptop: 1, puffer: 1 }, roomItems);
check('near the limit gives a list with no fixes', [near.weight.level, near.weight.overBy, near.weight.left, near.weight.rows[0].fixCount], ['warn', 0, 0.3, null]);
check('no weight limit means no weight section', C.makeRoom({ noun: 'cube', emptyWeightKg: 0.1, capacityL: 5, weightLimitKg: Infinity, isCarryOn: true }, { fleece: 2 }, roomItems).weight, null);
check('open cube over volume gets a list', C.makeRoom({ noun: 'cube', emptyWeightKg: 0.1, capacityL: 5, weightLimitKg: Infinity, isCarryOn: true }, { fleece: 2 }, roomItems).volume.overBy, 5);
check('bag over only from its own weight has no rows', C.makeRoom({ emptyWeightKg: 6, capacityL: 40, weightLimitKg: 5 }, {}, roomItems).weight.rows, []);

// Checklist
var listItems = {
  shirt: { id: 'shirt', name: 'Shirt', weightKg: 0.16, volumeL: 1 },
  laptop: { id: 'laptop', name: 'Laptop', weightKg: 1.6, volumeL: 1.5 },
  fleece: { id: 'fleece', name: 'Fleece', weightKg: 0.5, volumeL: 5 },
  cube: { id: 'cube', name: 'Cube A', cube: true, weightKg: 0.08, volumeL: 0.2, capacityL: 12 },
  spare: { id: 'spare', name: 'Cube B', cube: true, weightKg: 0.06, volumeL: 0.1, capacityL: 5 },
  loose: { id: 'loose', name: 'Cube C', cube: true, weightKg: 0.06, volumeL: 0.1, capacityL: 5 },
  odd: { id: 'odd', name: 'Odd *name* [x] #1', weightKg: 0.1, volumeL: 0.1 }
};
var listBags = { a: { name: 'Carry-on' }, b: { name: 'Checked' }, c: { name: 'Daypack' } };
var listTrip = {
  name: 'Japan',
  bagIds: ['a', 'b', 'c'],
  packed: { a: { laptop: 1, shirt: 3, cube: 1, spare: 1 }, b: { odd: 1 }, c: {} },
  cubes: { cube: { fleece: 2 }, loose: { shirt: 1 } }
};
var list = C.checklist(listTrip, listBags, listItems);
check('sections skip empty bags', list.sections.map(function (x) { return x.title; }), ['Carry-on', 'Checked', 'Cubes not in a bag yet']);
check('lines follow inventory order with quantities', list.sections[0].lines, ['Shirt x3', 'Laptop', 'Cube B (empty)']);
check('cube contents grouped', list.sections[0].cubes, [{ title: 'Cube A', lines: ['Fleece x2'] }]);
check('loose cube listed', list.sections[2].cubes, [{ title: 'Cube C', lines: ['Shirt'] }]);
check('markdown', C.checklistMarkdown(list), '# Japan packing list\n\n## Carry-on\n\n- [ ] Shirt x3\n- [ ] Laptop\n- [ ] Cube B (empty)\n\n### Cube A\n\n- [ ] Fleece x2\n\n## Checked\n\n- [ ] Odd \\*name\\* \\[x\\] \\#1\n\n## Cubes not in a bag yet\n\n### Cube C\n\n- [ ] Shirt\n');
check('plain text', C.checklistText(list), 'Japan packing list\n\nCarry-on\nShirt x3\nLaptop\nCube B (empty)\n\nCube A\nFleece x2\n\nChecked\nOdd *name* [x] #1\n\nCubes not in a bag yet\n\nCube C\nShirt\n');
check('nothing packed gives no sections', C.checklist({ name: 'T', bagIds: ['a'], packed: { a: {} }, cubes: {} }, listBags, listItems).sections, []);
check('missing cubes are safe', C.checklist({ name: 'T', bagIds: ['a'], packed: { a: { shirt: 1 } } }, listBags, listItems).sections[0].lines, ['Shirt']);

// Itinerary dates
check('trip length is inclusive', C.tripLength('2026-11-20', '2026-11-25'), 6);
check('same-day trip', C.tripLength('2026-11-20', '2026-11-20'), 1);
check('return before departure', C.tripLength('2026-11-25', '2026-11-20'), 0);
check('missing date', C.tripLength('', '2026-11-20'), 0);
check('impossible date', C.tripLength('2026-02-30', '2026-03-02'), 0);
check('days across a month end', C.tripDays('2026-11-29', '2026-12-02'), ['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02']);
check('days across a leap day', C.tripDays('2028-02-28', '2028-03-01'), ['2028-02-28', '2028-02-29', '2028-03-01']);
check('long trips are capped', C.tripDays('2026-01-01', '2026-12-31').length, C.MAX_TRIP_DAYS);
check('long trip length still reported', C.tripLength('2026-01-01', '2026-12-31'), 365);
check('day label', C.formatDay('2026-11-20'), 'Fri 20 Nov');
check('bad day label', C.formatDay('nope'), '');
check('real date', C.isDate('2028-02-29'), true);
check('no 13th month', C.isDate('2026-13-01'), false);
check('no 30 February', C.isDate('2026-02-30'), false);

// Outfits
var wear = {
  tee: { id: 'tee', name: 'Tee', category: 'Clothes', ownedQty: 7, weightKg: 0.16, volumeL: 1 },
  jeans: { id: 'jeans', name: 'Jeans', category: 'Clothes', ownedQty: 1, weightKg: 0.7, volumeL: 3 },
  boots: { id: 'boots', name: 'Boots', category: 'Shoes', weightKg: 1.2, volumeL: 10 },
  socks: { id: 'socks', name: 'Socks', category: 'Clothes', ownedQty: 2, weightKg: 0.09, volumeL: 0.4 },
  hat: { id: 'hat', name: 'Hat', category: 'Clothes', ownedQty: 1, weightKg: 0.1, volumeL: 1 },
  book: { id: 'book', name: 'Book', category: 'Other', ownedQty: 1, weightKg: 0.35, volumeL: 0.5 }
};
var planDays = ['d1', 'd2', 'd3'];
var plans = {
  d1: { outfit: [{ itemId: 'tee' }, { itemId: 'jeans' }, { itemId: 'socks' }, { itemId: 'gone' }] },
  d2: { outfit: [{ itemId: 'tee' }, { itemId: 'jeans' }, { itemId: 'socks' }] },
  d3: { outfit: [{ itemId: 'tee', rewear: true }, { itemId: 'jeans', rewear: false }, { itemId: 'socks' }] },
  d9: { outfit: [{ itemId: 'boots' }] }
};
var entries = C.outfitEntries(planDays, plans, wear);
check('entry kinds', planDays.map(function (d) { return entries[d].map(function (e) { return e.item.id + ':' + e.kind; }); }),
  [['tee:first', 'jeans:first', 'socks:first'], ['tee:new', 'jeans:same', 'socks:new'], ['tee:rewear', 'jeans:same', 'socks:new']]);
var needs = C.outfitNeeds(entries);
check('fresh tees counted, re-wear not', needs.tee.needed, 2);
check('single jeans worn every day needs one', [needs.jeans.needed, needs.jeans.days], [1, 3]);
check('days outside the trip are ignored', needs.boots, undefined);
check('deleted items are ignored', needs.gone, undefined);

var planTrip = { bagIds: ['a', 'b'], packed: { a: { tee: 1, jeans: 1, boots: 1 }, b: { hat: 1, book: 1, socks: 1 } }, cubes: { c: { tee: 3 } } };
var report = C.outfitCheck(planTrip, wear, needs);
check('check rows ordered by urgency', report.rows.map(function (r) { return r.item.id + ':' + r.status; }), ['socks:owned', 'tee:extra', 'jeans:ok']);
check('packed counted across bags and cubes', report.rows[1].packed, 4);
check('own fewer than needed', [report.rows[0].needed, report.rows[0].owned], [3, 2]);
check('packed clothes and shoes not in outfits', report.unplanned.map(function (u) { return u.item.id; }), ['boots', 'hat']);
var shortTrip = { bagIds: ['a'], packed: { a: { jeans: 1 } }, cubes: {} };
check('needs more packing', C.outfitCheck(shortTrip, wear, needs).rows.filter(function (r) { return r.item.id === 'tee'; })[0].status, 'short');
check('empty plans give an empty check', C.outfitCheck(shortTrip, wear, {}).rows, []);

// Planned items still to pack
var toPackTrip = { bagIds: ['a'], packed: { a: { tee: 1 } }, cubes: { c: { socks: 2 } } };
var toPackNeeds = {
  tee: { item: wear.tee, needed: 3 },
  socks: { item: wear.socks, needed: 3 },
  jeans: { item: wear.jeans, needed: 1 },
  cube: { item: { id: 'cube', cube: true, ownedQty: 1 }, needed: 1 }
};
var toPack = C.plannedToPack(toPackTrip, toPackNeeds);
check('planned items left to pack', Object.keys(toPack).sort(), ['jeans', 'tee']);
check('counts what is left, across bags and cubes', [toPack.tee.toPack, toPack.tee.packed, toPack.jeans.toPack], [2, 1, 1]);
check('capped at what you own', C.plannedToPack({ bagIds: ['a'], packed: { a: {} }, cubes: {} }, { socks: toPackNeeds.socks }).socks.target, 2);
check('nothing planned, nothing to pack', C.plannedToPack(toPackTrip, {}), {});

// Laundry
var wash = {
  tee: { id: 'tee', name: 'Tee', category: 'Clothes', ownedQty: 7 },
  jeans: { id: 'jeans', name: 'Jeans', category: 'Clothes', ownedQty: 1 },
  socks: { id: 'socks', name: 'Socks', category: 'Clothes', ownedQty: 3 }
};
var washDays = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'];
function teeDays(extra) {
  var p = {};
  washDays.forEach(function (d) { p[d] = { outfit: [{ itemId: 'tee' }, { itemId: 'jeans' }] }; });
  Object.keys(extra || {}).forEach(function (d) { p[d].laundry = extra[d]; });
  return p;
}
function kindsOf(plan, id) {
  return washDays.map(function (d) {
    return plan.entries[d].filter(function (e) { return e.item.id === id; })[0].kind;
  });
}
var noWash = C.outfitPlan(washDays, teeDays(), wash);
check('six days without laundry need six tees', C.outfitNeeds(noWash.entries).tee.needed, 6);
var midWash = C.outfitPlan(washDays, teeDays({ d3: { except: [] } }), wash);
check('washing on day 3 reuses those tees', kindsOf(midWash, 'tee'), ['first', 'new', 'new', 'washed', 'washed', 'washed']);
check('so only three tees are needed', C.outfitNeeds(midWash.entries).tee.needed, 3);
check('laundry list shows what was dirty', midWash.laundry.d3.map(function (x) { return [x.item.id, x.count, x.washed]; }), [['tee', 3, true], ['jeans', 1, true]]);
check('single jeans come back washed', kindsOf(midWash, 'jeans'), ['first', 'same', 'same', 'washed', 'same', 'same']);
check('jeans still need one', C.outfitNeeds(midWash.entries).jeans.needed, 1);
var twoWashes = C.outfitPlan(washDays, teeDays({ d2: { except: [] }, d4: { except: [] } }), wash);
check('washing every second day needs two tees', C.outfitNeeds(twoWashes.entries).tee.needed, 2);
var kept = C.outfitPlan(washDays, teeDays({ d3: { except: ['tee'] } }), wash);
check('an item left out of the wash stays dirty', C.outfitNeeds(kept.entries).tee.needed, 6);
check('and is listed as not washed', kept.laundry.d3.filter(function (x) { return x.item.id === 'tee'; })[0].washed, false);
check('ignoring laundry shows the saving', C.outfitNeeds(C.outfitPlan(washDays, teeDays({ d3: { except: [] } }), wash, true).entries).tee.needed, 6);
var early = C.outfitPlan(['d1', 'd2'], { d1: { outfit: [], laundry: { except: [] } }, d2: { outfit: [{ itemId: 'tee' }] } }, wash);
check('laundry before anything is worn washes nothing', [early.laundry.d1, C.outfitNeeds(early.entries).tee.needed], [[], 1]);
var rewearClean = C.outfitPlan(['d1', 'd2', 'd3'], { d1: { outfit: [{ itemId: 'socks' }], laundry: { except: [] } }, d2: { outfit: [{ itemId: 'socks', rewear: true }] }, d3: { outfit: [{ itemId: 'socks' }] } }, wash);
check('re-wear after a full wash uses the clean piece', rewearClean.entries.d2[0].kind, 'washed');
check('then a fresh one is needed', [rewearClean.entries.d3[0].kind, C.outfitNeeds(rewearClean.entries).socks.needed], ['new', 2]);
function rewearDays(days) {
  var p = {};
  washDays.forEach(function (d) { p[d] = { outfit: [{ itemId: 'tee', rewear: days.indexOf(d) !== -1 }] }; });
  p.d2.laundry = { except: [] };
  return p;
}
var washThenRewear = C.outfitPlan(washDays, rewearDays(['d4', 'd5']), wash);
check('wear a washed tee, then re-wear it for two days', kindsOf(washThenRewear, 'tee'), ['first', 'new', 'washed', 'rewear', 'rewear', 'washed']);
check('re-wear is offered on a washed day', [washThenRewear.entries.d6[0].kind, washThenRewear.entries.d6[0].canRewear], ['washed', true]);
check('wear count per piece', washDays.map(function (d) { return washThenRewear.entries[d][0].wear; }), [1, 1, 1, 2, 3, 1]);
check('re-wears are counted', C.outfitNeeds(washThenRewear.entries).tee.rewears, 2);
check('re-wear not offered before anything is dirty', [washThenRewear.entries.d1[0].canRewear, rewearClean.entries.d2[0].canRewear], [false, false]);
check('single jeans count each re-wear', [midWash.entries.d3.filter(function (e) { return e.item.id === 'jeans'; })[0].wear, C.outfitNeeds(midWash.entries).jeans.rewears], [3, 4]);
check('check rows carry the re-wear count', C.outfitCheck(planTrip, wear, needs).rows.map(function (r) { return r.item.id + ':' + r.rewears; }), ['socks:0', 'tee:1', 'jeans:2']);
check('older callers still get entries', C.outfitEntries(washDays, teeDays({ d3: { except: [] } }), wash).d4[0].kind, 'washed');

// Inventory order
var sortList = [
  { id: 'a', name: 'Travel cube small 10', icon: '🎒' },
  { id: 'b', name: 'cotton tee', icon: '👕' },
  { id: 'c', name: 'Travel cube small 2', icon: '🎒' },
  { id: 'd', name: 'Alpaca hat', icon: '🦙' },
  { id: 'e', name: 'Boots', icon: '👕', photo: 'data:image/png;base64,x' },
  { id: 'f', name: 'Base tee', icon: '👕' },
  { id: 'g', name: 'Zebra charm', icon: '🦓' }
];
var ids = function (list) { return list.map(function (x) { return x.id; }).join(''); };
check('your order is kept', ids(C.sortItems(sortList, 'custom', ['👕', '🎒'])), 'abcdefg');
check('A to Z ignores case and counts numbers', ids(C.sortItems(sortList, 'name')), 'dfebcag');
check('by emoji groups picker icons first, then others as they appear, photos last', ids(C.sortItems(sortList, 'icon', ['👕', '🎒'])), 'fbcadge');
check('sorting leaves the original alone', ids(sortList), 'abcdefg');
check('unknown sort keeps your order', ids(C.sortItems(sortList, 'zzz')), 'abcdefg');

// Formatting
check('format trims zeros', C.fmt(3.5), '3.5');
check('format rounds to two decimals', C.fmt(1.2345), '1.23');

failures.forEach(function (f) { log('FAIL ' + f); });
log(passed + ' passed, ' + failures.length + ' failed');
if (failures.length) throw new Error(failures.length + ' test(s) failed');
