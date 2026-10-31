// Totals and fit logic. No page access, so it can be tested on its own.
var Calc = (function () {
  var WARN_RATIO = 0.9;

  function round(n) {
    return Math.round(n * 1000) / 1000;
  }

  // Up to two decimals, without trailing zeros: 3.50 -> "3.5".
  function fmt(n) {
    return String(Math.round(n * 100) / 100);
  }

  function level(total, limit) {
    if (limit <= 0) return total > 0 ? 'over' : 'ok';
    if (total > limit) return 'over';
    return total / limit >= WARN_RATIO ? 'warn' : 'ok';
  }

  function hasDims(dims) {
    return Array.isArray(dims) && dims.length === 3 && dims.every(function (d) { return d > 0; });
  }

  function sortedDesc(dims) {
    return dims.slice().sort(function (a, b) { return b - a; });
  }

  // Returns null when the item fits in some rotation, otherwise the problem.
  function sizeProblem(item, bag) {
    if (!hasDims(item.dimsCm) || !hasDims(bag.interiorCm)) return null;
    var a = sortedDesc(item.dimsCm);
    var b = sortedDesc(bag.interiorCm);
    if (a[0] > b[0]) return 'too long';
    if (a[1] > b[1]) return 'too wide';
    if (a[2] > b[2]) return 'too thick';
    return null;
  }

  // Litres from centimetres, to two decimals. Null until all three sides are set.
  function volumeFromDims(dims) {
    if (!hasDims(dims)) return null;
    return Math.round(dims[0] * dims[1] * dims[2] / 10) / 100;
  }

  function carryOnBlocked(item, bag) {
    return item.carryOnOnly === true && bag.isCarryOn !== true;
  }

  // How many of an item are packed across every bag on the trip.
  function packedInTrip(trip, itemId) {
    var inBags = trip.bagIds.reduce(function (sum, bagId) {
      return sum + ((trip.packed[bagId] && trip.packed[bagId][itemId]) || 0);
    }, 0);
    var cubes = trip.cubes || {};
    return Object.keys(cubes).reduce(function (sum, cubeId) {
      return sum + (cubes[cubeId][itemId] || 0);
    }, inBags);
  }

  // A soft cube takes up the space of what is inside it, or its own folded size when nearly empty.
  function cubeTotals(cube, contents, itemsById) {
    var weight = cube.weightKg;
    var contentsVolume = 0;
    var count = 0;
    var misplaced = [];
    Object.keys(contents || {}).forEach(function (id) {
      var item = itemsById[id];
      var qty = contents[id];
      if (!item || !(qty > 0)) return;
      weight += item.weightKg * qty;
      contentsVolume += item.volumeL * qty;
      count += qty;
      if (item.carryOnOnly === true) misplaced.push(item);
    });
    contentsVolume = round(contentsVolume);
    return {
      weightKg: round(weight),
      contentsL: contentsVolume,
      volumeL: Math.max(cube.volumeL, contentsVolume),
      count: count,
      misplaced: misplaced
    };
  }

  // The bag a cube is packed in on this trip, or null.
  function cubeBagId(trip, cubeId) {
    return trip.bagIds.filter(function (bagId) {
      return trip.packed[bagId] && trip.packed[bagId][cubeId] > 0;
    })[0] || null;
  }

  function remaining(item, trip) {
    var owned = item.ownedQty >= 1 ? item.ownedQty : 1;
    return Math.max(0, owned - packedInTrip(trip, item.id));
  }

  function worst(levels) {
    if (levels.indexOf('over') !== -1) return 'over';
    return levels.indexOf('warn') !== -1 ? 'warn' : 'ok';
  }

  // packed is { itemId: quantity }. Ids with no matching item are ignored.
  // cubes is { cubeId: { itemId: quantity } }, for any cubes packed in this bag.
  function evaluate(bag, packed, itemsById, cubes) {
    var noun = bag.noun || 'bag';
    var itemsWeight = 0;
    var volume = 0;
    var count = 0;
    var oversized = [];
    var misplaced = [];
    var overfull = [];

    Object.keys(packed || {}).forEach(function (id) {
      var item = itemsById[id];
      var qty = packed[id];
      if (!item || !(qty > 0)) return;
      if (item.cube === true) {
        var cube = cubeTotals(item, cubes && cubes[id], itemsById);
        itemsWeight += cube.weightKg * qty;
        volume += cube.volumeL * qty;
        if (cube.contentsL > item.capacityL) overfull.push({ item: item, overL: cube.contentsL - item.capacityL });
        if (bag.isCarryOn !== true) misplaced = misplaced.concat(cube.misplaced);
      } else {
        itemsWeight += item.weightKg * qty;
        volume += item.volumeL * qty;
        if (carryOnBlocked(item, bag)) misplaced.push(item);
      }
      count += qty;
      var problem = sizeProblem(item, bag);
      if (problem) oversized.push({ item: item, problem: problem });
    });

    var weightKg = round(bag.emptyWeightKg + itemsWeight);
    var volumeL = round(volume);
    var weightLevel = level(weightKg, bag.weightLimitKg);
    var volumeLevel = level(volumeL, bag.capacityL);
    var fits = volumeL <= bag.capacityL && oversized.length === 0 && overfull.length === 0;
    var messages = [];

    if (count === 0) {
      messages.push({ level: 'ok', text: 'This ' + noun + ' is empty' });
    } else if (fits) {
      messages.push({ level: 'ok', text: 'Everything fits' });
    }
    if (volumeLevel === 'over') {
      messages.push({ level: 'over', text: 'Over by ' + fmt(volumeL - bag.capacityL) + ' L' });
    } else if (volumeLevel === 'warn') {
      messages.push({ level: 'warn', text: 'Nearly full: ' + fmt(bag.capacityL - volumeL) + ' L left' });
    }
    oversized.forEach(function (o) {
      messages.push({ level: 'over', text: o.item.name + ' is ' + o.problem + ' for this ' + noun });
    });
    overfull.forEach(function (o) {
      messages.push({ level: 'over', text: o.item.name + ' is over by ' + fmt(o.overL) + ' L' });
    });
    // Packing these is blocked, but editing a bag or item later can still cause it.
    misplaced.forEach(function (item) {
      messages.push({ level: 'over', text: item.name + ' must go in a carry-on bag' });
    });
    if (weightLevel === 'over') {
      messages.push({ level: 'over', text: fmt(weightKg - bag.weightLimitKg) + ' kg over the weight limit' });
    } else if (weightLevel === 'warn') {
      messages.push({ level: 'warn', text: 'Near the weight limit: ' + fmt(bag.weightLimitKg - weightKg) + ' kg left' });
    }

    return {
      weightKg: weightKg,
      volumeL: volumeL,
      count: count,
      weightLevel: weightLevel,
      volumeLevel: volumeLevel,
      fits: fits,
      oversized: oversized,
      misplaced: misplaced,
      overfull: overfull,
      messages: messages,
      level: worst(messages.map(function (m) { return m.level; }))
    };
  }

  // Every bag on the trip, including the weight of the bags themselves, plus
  // filled cubes that have not been put in a bag yet.
  function tripWeightKg(trip, bagsById, itemsById) {
    var total = 0;
    trip.bagIds.forEach(function (bagId) {
      var bag = bagsById[bagId];
      if (bag) total += evaluate(bag, trip.packed[bagId], itemsById, trip.cubes).weightKg;
    });
    looseCubeIds(trip, itemsById).forEach(function (cubeId) {
      total += cubeTotals(itemsById[cubeId], trip.cubes[cubeId], itemsById).weightKg;
    });
    return round(total);
  }

  // Cubes with something in them that are not in a bag.
  function looseCubeIds(trip, itemsById) {
    return Object.keys(trip.cubes || {}).filter(function (cubeId) {
      var cube = itemsById[cubeId];
      return cube && cubeTotals(cube, trip.cubes[cubeId], itemsById).count > 0 && !cubeBagId(trip, cubeId);
    });
  }

  return {
    fmt: fmt,
    level: level,
    sizeProblem: sizeProblem,
    volumeFromDims: volumeFromDims,
    carryOnBlocked: carryOnBlocked,
    packedInTrip: packedInTrip,
    remaining: remaining,
    cubeTotals: cubeTotals,
    cubeBagId: cubeBagId,
    looseCubeIds: looseCubeIds,
    evaluate: evaluate,
    tripWeightKg: tripWeightKg
  };
})();

if (typeof module !== 'undefined') module.exports = Calc;
