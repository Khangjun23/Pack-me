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

  // Kilograms per litre. Items with no volume count as medium density.
  function density(weightKg, volumeL) {
    return volumeL > 0 ? weightKg / volumeL : 0.4;
  }

  // 0 to 1 by share of the weight limit, reaching full depth at a fifth of the limit.
  function weightShade(weightKg, limitKg) {
    if (!(limitKg > 0)) return 0;
    var shade = (weightKg / limitKg) / 0.2;
    return Math.round(Math.min(1, shade) * 100) / 100;
  }

  // The same scale in light and dark themes, so darker always means heavier.
  // Text is black or white, whichever stays readable on that shade.
  function shadeColors(shade) {
    var pale = [251, 243, 230];
    var deep = [122, 38, 14];
    var rgb = pale.map(function (channel, i) {
      return Math.round(channel + (deep[i] - channel) * shade);
    });
    var linear = rgb.map(function (channel) {
      var c = channel / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    var luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    return {
      background: 'rgb(' + rgb.join(',') + ')',
      text: luminance > 0.18 ? '#000' : '#fff',
      luminance: luminance
    };
  }

  function densityLabel(kgPerL) {
    if (kgPerL < 0.3) return 'light for its size';
    return kgPerL < 0.7 ? 'medium density' : 'dense for its size';
  }

  // Grid tracks for a box in the open bag. The box's area matches the item's share
  // of the bag's capacity, but never gets too small to show its full name and details.
  var CELL_PITCH = 16;
  var CELL_GAP = 4;
  var MIN_COLS = 6;
  var MIN_ICON = 22;
  var MAX_ICON = 56;
  var LAYOUT_EFFICIENCY = 0.9;

  function textLines(length, charPx, innerWidth) {
    var lines = Math.max(1, Math.ceil(length * charPx / innerWidth));
    return lines > 1 ? lines + 1 : lines; // Word wrapping rarely fills every line.
  }

  function tileSize(options) {
    var maxCols = Math.max(MIN_COLS, Math.floor((options.widthPx + CELL_GAP) / CELL_PITCH));
    var share = options.capacityL > 0 ? options.volumeL / options.capacityL : 0;
    var area = options.widthPx * options.heightPx * share * LAYOUT_EFFICIENCY;
    var cols = Math.round((Math.sqrt(area * 1.35) + CELL_GAP) / CELL_PITCH);
    cols = Math.min(maxCols, Math.max(MIN_COLS, cols));
    var width = cols * CELL_PITCH - CELL_GAP;

    var inner = width - 12;
    var textHeight = 14 + textLines(options.name.length, 6.3, inner) * 15 +
      textLines(options.detail.length, 5.6, inner) * 14 + (options.extraPx || 0);
    var height = Math.max(area / width, textHeight + MIN_ICON);
    var rows = Math.ceil((height + CELL_GAP) / CELL_PITCH);
    var finalHeight = rows * CELL_PITCH - CELL_GAP;

    return {
      cols: cols,
      rows: rows,
      iconPx: Math.round(Math.max(MIN_ICON, Math.min(MAX_ICON, finalHeight - textHeight, width * 0.4)))
    };
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

  // What is packed, one row per item, with cube contents listed individually.
  function packedRows(packed, itemsById, cubes) {
    var rows = [];
    function add(item, qty, cubeId) {
      rows.push({ item: item, qty: qty, cubeId: cubeId });
    }
    Object.keys(packed || {}).forEach(function (id) {
      var item = itemsById[id];
      if (!item || !(packed[id] > 0)) return;
      if (item.cube !== true) {
        add(item, packed[id], null);
        return;
      }
      var contents = (cubes && cubes[id]) || {};
      var before = rows.length;
      Object.keys(contents).forEach(function (innerId) {
        if (itemsById[innerId] && contents[innerId] > 0) add(itemsById[innerId], contents[innerId], id);
      });
      if (rows.length === before) add(item, packed[id], null); // An empty cube can still come out.
    });
    return rows;
  }

  function roomSection(rows, measure, total, limit, level) {
    if (level === 'ok') return null;
    var overBy = level === 'over' ? round(total - limit) : 0;
    var ranked = rows.map(function (row) {
      var unit = row.item[measure];
      var fixCount = overBy > 0 && unit > 0 ? Math.ceil(round(overBy / unit)) : null;
      return {
        item: row.item,
        qty: row.qty,
        cubeId: row.cubeId,
        total: round(unit * row.qty),
        percent: limit > 0 ? Math.round(unit * row.qty / limit * 100) : 0,
        fixCount: fixCount !== null && fixCount <= row.qty ? fixCount : null
      };
    }).filter(function (row) {
      return row.total > 0;
    }).sort(function (a, b) {
      return b.total - a.total;
    });
    return {
      level: level,
      overBy: overBy,
      left: round(limit - total),
      rows: ranked,
      noSingleFix: overBy > 0 && !ranked.some(function (row) { return row.fixCount !== null; })
    };
  }

  // For a bag near or over a limit: what uses the most, and what removing it would achieve.
  function makeRoom(bag, packed, itemsById, cubes) {
    var totals = evaluate(bag, packed, itemsById, cubes);
    var rows = packedRows(packed, itemsById, cubes);
    return {
      weight: roomSection(rows, 'weightKg', totals.weightKg, bag.weightLimitKg, totals.weightLevel),
      volume: roomSection(rows, 'volumeL', totals.volumeL, bag.capacityL, totals.volumeLevel)
    };
  }

  // ----- Itinerary -----

  var MAX_TRIP_DAYS = 60;

  function parseDate(iso) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    var date = new Date(iso + 'T00:00:00Z');
    return isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso ? null : date;
  }

  // Days from fly-out to coming back, inclusive. Zero when either is missing or out of order.
  function tripLength(departIso, returnIso) {
    var start = parseDate(departIso);
    var end = parseDate(returnIso);
    if (!start || !end || end < start) return 0;
    return Math.round((end - start) / 86400000) + 1;
  }

  function tripDays(departIso, returnIso) {
    var count = Math.min(MAX_TRIP_DAYS, tripLength(departIso, returnIso));
    var start = parseDate(departIso);
    var days = [];
    for (var i = 0; i < count; i++) {
      days.push(new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10));
    }
    return days;
  }

  function formatDay(iso) {
    var date = parseDate(iso);
    if (!date) return '';
    var names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return names[date.getUTCDay()] + ' ' + date.getUTCDate() + ' ' + months[date.getUTCMonth()];
  }

  // Each outfit entry, in date order, marked as one of:
  //   first   the first time the item is worn on the trip
  //   new     another one of an item you own several of
  //   rewear  wearing an earlier one again, by choice
  //   same    the only one you own, so it can only be worn again
  function outfitEntries(days, dayPlans, itemsById) {
    var worn = {};
    var result = {};
    days.forEach(function (date) {
      var outfit = (dayPlans[date] && dayPlans[date].outfit) || [];
      result[date] = outfit.filter(function (entry) { return itemsById[entry.itemId]; }).map(function (entry) {
        var item = itemsById[entry.itemId];
        var kind;
        if (!worn[entry.itemId]) kind = 'first';
        else if (!(item.ownedQty > 1)) kind = 'same';
        else kind = entry.rewear ? 'rewear' : 'new';
        worn[entry.itemId] = true;
        return { item: item, kind: kind };
      });
    });
    return result;
  }

  // How many of each item the outfits need: one for the first wear, plus one per fresh one after.
  function outfitNeeds(entriesByDay) {
    var needs = {};
    Object.keys(entriesByDay).forEach(function (date) {
      entriesByDay[date].forEach(function (entry) {
        var id = entry.item.id;
        needs[id] = needs[id] || { item: entry.item, needed: 0, days: 0 };
        needs[id].days += 1;
        if (entry.kind === 'first' || entry.kind === 'new') needs[id].needed += 1;
      });
    });
    return needs;
  }

  var WEARABLE = ['Clothes', 'Shoes'];

  // Outfits compared with what is packed anywhere on the trip.
  function outfitCheck(trip, itemsById, needs) {
    var order = { owned: 0, short: 1, extra: 2, ok: 3 };
    var rows = Object.keys(needs).map(function (id) {
      var need = needs[id];
      var owned = need.item.ownedQty >= 1 ? need.item.ownedQty : 1;
      var packed = packedInTrip(trip, id);
      var status = 'ok';
      if (need.needed > owned) status = 'owned';
      else if (packed < need.needed) status = 'short';
      else if (packed > need.needed) status = 'extra';
      return { item: need.item, needed: need.needed, days: need.days, packed: packed, owned: owned, status: status };
    }).sort(function (a, b) {
      return order[a.status] - order[b.status] || a.item.name.localeCompare(b.item.name);
    });
    var unplanned = Object.keys(itemsById).filter(function (id) {
      var item = itemsById[id];
      return !needs[id] && item.cube !== true && WEARABLE.indexOf(item.category) !== -1 && packedInTrip(trip, id) > 0;
    }).map(function (id) {
      return { item: itemsById[id], packed: packedInTrip(trip, id) };
    });
    return { rows: rows, unplanned: unplanned };
  }

  // The trip as a list to tick off: one section per bag, with each packed cube's
  // contents grouped under it, and any filled cubes not yet in a bag at the end.
  function checklist(trip, bagsById, itemsById) {
    var order = Object.keys(itemsById);
    function entries(packed) {
      return order.filter(function (id) { return packed && packed[id] > 0; }).map(function (id) {
        return { item: itemsById[id], qty: packed[id] };
      });
    }
    function label(entry) {
      return entry.item.name + (entry.qty > 1 ? ' x' + entry.qty : '');
    }
    function cubeGroup(cubeId) {
      return { title: itemsById[cubeId].name, lines: entries(trip.cubes && trip.cubes[cubeId]).map(label) };
    }

    var sections = [];
    trip.bagIds.forEach(function (bagId) {
      var section = { title: bagsById[bagId] ? bagsById[bagId].name : '', lines: [], cubes: [] };
      entries(trip.packed[bagId]).forEach(function (entry) {
        if (entry.item.cube !== true) {
          section.lines.push(label(entry));
          return;
        }
        var group = cubeGroup(entry.item.id);
        if (group.lines.length) section.cubes.push(group);
        else section.lines.push(entry.item.name + ' (empty)');
      });
      if (section.lines.length || section.cubes.length) sections.push(section);
    });

    var loose = order.filter(function (id) {
      return looseCubeIds(trip, itemsById).indexOf(id) !== -1;
    }).map(cubeGroup);
    if (loose.length) sections.push({ title: 'Cubes not in a bag yet', lines: [], cubes: loose });
    return { title: trip.name, sections: sections };
  }

  function escapeMarkdown(text) {
    return text.replace(/[\\`*_[\]<>#]/g, '\\$&');
  }

  function checklistMarkdown(list) {
    function items(lines) {
      return lines.map(function (line) { return '- [ ] ' + escapeMarkdown(line); }).join('\n') + '\n';
    }
    var parts = ['# ' + escapeMarkdown(list.title) + ' packing list\n'];
    list.sections.forEach(function (section) {
      parts.push('## ' + escapeMarkdown(section.title) + '\n');
      if (section.lines.length) parts.push(items(section.lines));
      section.cubes.forEach(function (cube) {
        parts.push('### ' + escapeMarkdown(cube.title) + '\n');
        parts.push(items(cube.lines));
      });
    });
    return parts.join('\n');
  }

  function checklistText(list) {
    var parts = [list.title + ' packing list'];
    list.sections.forEach(function (section) {
      parts.push('', section.title);
      parts = parts.concat(section.lines);
      section.cubes.forEach(function (cube) {
        parts.push('', cube.title);
        parts = parts.concat(cube.lines);
      });
    });
    return parts.join('\n') + '\n';
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
    density: density,
    weightShade: weightShade,
    shadeColors: shadeColors,
    densityLabel: densityLabel,
    makeRoom: makeRoom,
    MAX_TRIP_DAYS: MAX_TRIP_DAYS,
    isDate: function (iso) { return parseDate(iso) !== null; },
    tripLength: tripLength,
    tripDays: tripDays,
    formatDay: formatDay,
    outfitEntries: outfitEntries,
    outfitNeeds: outfitNeeds,
    outfitCheck: outfitCheck,
    checklist: checklist,
    checklistMarkdown: checklistMarkdown,
    checklistText: checklistText,
    tileSize: tileSize,
    cubeTotals: cubeTotals,
    cubeBagId: cubeBagId,
    looseCubeIds: looseCubeIds,
    evaluate: evaluate,
    tripWeightKg: tripWeightKg
  };
})();

if (typeof module !== 'undefined') module.exports = Calc;
