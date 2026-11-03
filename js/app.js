// Rendering, events and dialogs.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var fmt = Calc.fmt;

  var ui = { search: '', category: 'All', justPacked: null, flying: {} };
  var itemDraft = null;
  var copySourceId = null;
  var bagDraft = null;
  var nameSubmit = null;
  var toastTimer = null;

  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Skips the DOM write when nothing changed, which avoids image flicker and lost focus.
  // When it does write, focus returns to the element with the same data-fk.
  function setHTML(el, html) {
    if (el._html === html) return;
    var active = document.activeElement;
    var focusKey = active && el.contains(active) ? active.dataset.fk : null;
    el._html = html;
    el.innerHTML = html;
    if (focusKey) (el.querySelector('[data-fk="' + focusKey + '"]') || el).focus();
  }

  function toast(message) {
    var el = $('toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 4500);
  }

  function media(item) {
    return item.photo
      ? '<img src="' + esc(item.photo) + '" alt="" draggable="false">'
      : esc(item.icon);
  }

  // ----- Rendering -----

  function applyTheme() {
    var theme = Store.state.theme;
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    $('theme-select').value = theme;
  }

  function planning() {
    return Store.state.view === 'plan';
  }

  function render() {
    applyTheme();
    renderTopbar();
    renderView();
    renderTabs();
    renderBag();
    renderFilters();
    renderCards();
    renderInBagBadges();
    renderPlan();
  }

  function renderView() {
    var plan = planning();
    $('plan-view').hidden = !plan;
    $('pack-view').hidden = plan;
    $('view-plan').setAttribute('aria-selected', String(plan));
    $('view-pack').setAttribute('aria-selected', String(!plan));
  }

  function renderTopbar() {
    var state = Store.state;
    var trip = Store.trip();
    setHTML($('trip-select'), state.trips.map(function (t) {
      return '<option value="' + esc(t.id) + '">' + esc(t.name) + '</option>';
    }).join(''));
    $('trip-select').value = trip.id;
    $('trip-delete').disabled = state.trips.length < 2;
    var total = Calc.tripWeightKg(trip, Store.bagsById(), Store.itemsById());
    var bagCount = trip.bagIds.length;
    var looseCount = Calc.looseCubeIds(trip, Store.itemsById()).length;
    $('trip-total').innerHTML = 'Trip total: <b>' + fmt(total) + ' kg</b> across ' +
      bagCount + (bagCount === 1 ? ' bag' : ' bags') +
      (looseCount ? ', with ' + looseCount + (looseCount === 1 ? ' cube' : ' cubes') + ' not in a bag' : '');
  }

  function renderTabs() {
    var trip = Store.trip();
    var bags = Store.bagsById();
    setHTML($('bag-tabs'), trip.bagIds.map(function (id) {
      var selected = !trip.activeCubeId && id === trip.activeBagId;
      return '<button class="tab" role="tab" data-action="bag-select" data-id="' + esc(id) + '" data-fk="tab-' + esc(id) + '" aria-selected="' + selected + '">' +
        esc(bags[id].name) + '<span class="tab-count">' + Store.bagItemCountInTrip(id) + '</span></button>';
    }).join(''));
    var cubes = Store.state.items.filter(function (item) { return item.cube === true; });
    $('cube-row').hidden = cubes.length === 0;
    setHTML($('cube-tabs'), cubes.map(function (cube) {
      var count = Calc.cubeTotals(cube, trip.cubes[cube.id], Store.itemsById()).count;
      return '<button class="tab tab-cube" role="tab" data-action="cube-select" data-id="' + esc(cube.id) + '" data-fk="tab-' + esc(cube.id) + '" aria-selected="' + (cube.id === trip.activeCubeId) + '">' +
        esc(cube.name) + '<span class="tab-count">' + count + '</span></button>';
    }).join(''));
    $('bag-edit').textContent = trip.activeCubeId ? 'Edit cube' : 'Edit bag';
    $('bag-edit').disabled = !trip.activeBagId && !trip.activeCubeId;
  }

  function renderBag() {
    var bag = Store.container();
    var openCube = Store.cube();
    $('suitcase').classList.toggle('is-cube', !!openCube);
    $('bag-tag').textContent = bag ? bag.name : 'No bag';
    $('open-title').textContent = openCube ? 'Filling ' + openCube.name : bag ? 'Packing ' + bag.name : '';
    if (!bag) {
      updateMeter($('meter-weight'), 0, 0, 'ok', '');
      updateMeter($('meter-volume'), 0, 0, 'ok', '');
      setHTML($('status'), '');
      $('room').hidden = true;
      $('fill').style.height = '0';
      $('suitcase').dataset.level = 'ok';
      setHTML($('packed'), '<p class="empty-hint">This trip has no bags yet. Use “+ Add bag” to choose one.</p>');
      return;
    }
    var items = Store.itemsById();
    var packed = Store.packedInBag();
    var trip = Store.trip();
    var result = Calc.evaluate(bag, packed, items, trip.cubes);

    if (openCube) {
      var bagId = Calc.cubeBagId(trip, openCube.id);
      result.messages.push(bagId
        ? { level: 'ok', text: 'In ' + Store.bagsById()[bagId].name }
        : { level: 'warn', text: 'Not in a bag yet' });
    }

    updateMeter($('meter-weight'), result.weightKg, bag.weightLimitKg, result.weightLevel,
      'Includes the ' + fmt(bag.emptyWeightKg) + ' kg ' + (openCube ? 'cube' : 'bag'));
    updateMeter($('meter-volume'), result.volumeL, bag.capacityL, result.volumeLevel,
      result.volumeL <= bag.capacityL ? fmt(bag.capacityL - result.volumeL) + ' L free' : 'No space left');

    var symbols = { ok: '✓', warn: '!', over: '✕' };
    setHTML($('status'), result.messages.map(function (m) {
      return '<li data-level="' + m.level + '">' + symbols[m.level] + ' ' + esc(m.text) + '</li>';
    }).join(''));

    $('suitcase').dataset.level = result.volumeLevel;
    var fillPct = bag.capacityL > 0 ? Math.min(100, result.volumeL / bag.capacityL * 100) : 0;
    $('fill').style.height = 'calc((100% - 18px) * ' + fillPct / 100 + ')';

    renderRoom(Calc.makeRoom(bag, packed, items, trip.cubes));

    // An open cube has no limit of its own, so it borrows the limit of its bag.
    var limitBagId = openCube ? Calc.cubeBagId(trip, openCube.id) || trip.activeBagId : null;
    var weightLimit = openCube
      ? (limitBagId ? Store.bagsById()[limitBagId].weightLimitKg : 10)
      : bag.weightLimitKg;
    renderPacked(packed, items, result, bag.capacityL, weightLimit);
  }

  var ROOM_ROWS_SHOWN = 6;

  function roomSectionHTML(section, unit, label) {
    var summary = section.overBy > 0
      ? 'Over by ' + fmt(section.overBy) + ' ' + unit + '. Biggest ' + label + ':'
      : 'Near the limit, ' + fmt(section.left) + ' ' + unit + ' left. Biggest ' + label + ':';
    var cubeNames = Store.itemsById();
    var rows = section.rows.slice(0, ROOM_ROWS_SHOWN).map(function (row) {
      var where = row.cubeId ? '<small>in ' + esc(cubeNames[row.cubeId].name) + '</small>' : '';
      var fix = '';
      if (row.fixCount === 1) fix = row.qty > 1 ? 'Removing 1 fixes it' : 'Removing this fixes it';
      else if (row.fixCount) fix = 'Removing ' + row.fixCount + ' fixes it';
      var key = 'room-' + unit + '-' + row.item.id;
      return '<li class="room-row">' +
        '<span class="room-name">' + esc(row.item.name) + (row.qty > 1 ? ' x' + row.qty : '') + where + '</span>' +
        '<span class="room-value">' + fmt(row.total) + ' ' + unit + '</span>' +
        '<span class="room-percent">' + row.percent + '%</span>' +
        '<button class="btn room-remove" data-action="room-remove" data-id="' + esc(row.item.id) + '" data-cube="' + esc(row.cubeId || '') + '" data-fk="' + esc(key) + '"' +
        ' aria-label="Remove one ' + esc(row.item.name) + '">Remove</button>' +
        (fix ? '<span class="room-fix">' + fix + '</span>' : '') +
        '</li>';
    }).join('');
    var extra = section.noSingleFix ? '<p class="room-note">No one item clears this, so you need to remove several.</p>' : '';
    var more = section.rows.length > ROOM_ROWS_SHOWN
      ? '<p class="room-note">And ' + (section.rows.length - ROOM_ROWS_SHOWN) + ' smaller.</p>'
      : '';
    return '<div class="room-section" data-level="' + section.level + '" data-unit="' + unit + '">' +
      '<p class="room-summary">' + summary + '</p>' + extra +
      '<ol class="room-rows">' + rows + '</ol>' + more + '</div>';
  }

  function renderRoom(room) {
    var weight = room.weight && room.weight.rows.length ? roomSectionHTML(room.weight, 'kg', 'weights') : '';
    var volume = room.volume && room.volume.rows.length ? roomSectionHTML(room.volume, 'L', 'volumes') : '';
    $('room').hidden = !weight && !volume;
    setHTML($('room-body'), weight + volume);
  }

  function renderPacked(packed, items, result, capacityL, weightLimit) {
    var problems = {};
    result.oversized.forEach(function (o) { problems[o.item.id] = true; });
    result.misplaced.forEach(function (item) { problems[item.id] = true; });
    result.overfull.forEach(function (o) { problems[o.item.id] = true; });

    var container = $('packed');
    var styles = getComputedStyle(container);
    var box = {
      width: container.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight),
      height: container.clientHeight - parseFloat(styles.paddingTop) - parseFloat(styles.paddingBottom)
    };
    var cubes = Store.trip().cubes;

    // Biggest first, which leaves the fewest gaps in the grid.
    var tiles = Store.state.items.filter(function (item) { return packed[item.id] > 0; }).map(function (item) {
      var qty = packed[item.id];
      var cube = item.cube === true ? Calc.cubeTotals(item, cubes[item.id], items) : null;
      return {
        item: item,
        qty: qty,
        cube: cube,
        weightKg: cube ? cube.weightKg : item.weightKg * qty,
        volumeL: cube ? cube.volumeL : item.volumeL * qty
      };
    }).sort(function (a, b) { return b.volumeL - a.volumeL; });

    var html = tiles.map(function (tile) {
      return tileHTML(tile, capacityL, weightLimit, box, problems);
    }).join('') || '<p class="empty-hint">Drag items here to pack them</p>';

    setHTML(container, html);

    if (ui.justPacked) {
      var chip = container.querySelector('.chip[data-id="' + ui.justPacked + '"]');
      if (chip) chip.classList.add('pop');
      ui.justPacked = null;
    }
  }

  // A box sized by volume and shaded by weight.
  function tileHTML(tile, capacityL, weightLimit, box, problems) {
    var item = tile.item;
    var name = esc(item.name);
    var detail = fmt(tile.weightKg) + ' kg · ' + fmt(tile.volumeL) + ' L';
    if (tile.cube) detail = tile.cube.count + (tile.cube.count === 1 ? ' item · ' : ' items · ') + detail;
    var size = Calc.tileSize({
      volumeL: tile.volumeL,
      capacityL: capacityL,
      widthPx: box.width,
      heightPx: box.height,
      name: item.name,
      detail: detail,
      extraPx: tile.cube ? 28 : 0
    });
    var density = Calc.density(tile.weightKg, tile.volumeL);
    var shade = Calc.weightShade(tile.weightKg, weightLimit);
    var colors = Calc.shadeColors(shade);
    var removeLabel = tile.cube ? 'Take ' + name + ' out of the bag' : 'Remove one ' + name;
    var hint = tile.cube ? 'Drag out to take it out of the bag. What is inside stays in the cube.' : 'Drag out to remove.';
    return '<div class="chip" data-drag="packed" data-id="' + esc(item.id) + '" data-problem="' + (problems[item.id] === true) + '"' +
      ' data-cols="' + size.cols + '" data-rows="' + size.rows + '" data-shade="' + shade + '"' +
      ' style="grid-column:span ' + size.cols + ';grid-row:span ' + size.rows +
      ';background:' + colors.background + ';color:' + colors.text + ';--icon:' + size.iconPx + 'px"' +
      ' title="' + name + ', ' + detail + ', ' + Calc.densityLabel(density) + '. ' + hint + '">' +
      (tile.qty > 1 ? '<span class="chip-qty">x' + tile.qty + '</span>' : '') +
      '<button class="chip-remove" data-action="unpack" data-id="' + esc(item.id) + '" data-fk="unpack-' + esc(item.id) + '" aria-label="' + removeLabel + '">×</button>' +
      '<span class="chip-media">' + media(item) + '</span>' +
      '<span class="chip-name">' + name + '</span>' +
      '<span class="chip-detail">' + detail + '</span>' +
      (tile.cube ? '<button class="btn chip-open" data-action="cube-select" data-id="' + esc(item.id) + '">Open</button>' : '') +
      '</div>';
  }

  function updateMeter(el, value, limit, level, note) {
    el.dataset.level = level;
    var hasLimit = limit !== Infinity;
    el.querySelector('[data-limit-wrap]').hidden = !hasLimit;
    el.querySelector('[data-limit]').textContent = hasLimit ? fmt(limit) : '';
    el.querySelector('[data-note]').textContent = note;
    var track = el.querySelector('.meter-track');
    if (hasLimit) track.setAttribute('aria-valuemax', limit);
    else track.removeAttribute('aria-valuemax');
    track.setAttribute('aria-valuenow', value);
    el.querySelector('.meter-bar').style.width = (limit > 0 ? Math.min(100, value / limit * 100) : 0) + '%';
    countTo(el.querySelector('[data-value]'), value);
  }

  function countTo(el, target) {
    var from = el._value === undefined ? target : el._value;
    el._value = target;
    cancelAnimationFrame(el._frame);
    if (from === target || Drag.reducedMotion()) {
      el.textContent = fmt(target);
      return;
    }
    var start = performance.now();
    (function step(now) {
      var t = Math.min(1, (now - start) / 450);
      var eased = 1 - Math.pow(1 - t, 3);
      el.textContent = fmt(from + (target - from) * eased);
      if (t < 1) el._frame = requestAnimationFrame(step);
    })(start);
  }

  function categories() {
    var seen = {};
    return Store.state.items.reduce(function (list, item) {
      if (seen[item.category] !== true) {
        seen[item.category] = true;
        list.push(item.category);
      }
      return list;
    }, []);
  }

  function renderFilters() {
    var cats = categories();
    if (ui.category !== 'All' && cats.indexOf(ui.category) === -1) ui.category = 'All';
    setHTML($('filters'), ['All'].concat(cats).map(function (c, i) {
      return '<button class="filter" data-action="filter" data-category="' + esc(c) + '" data-fk="filter-' + i + '" aria-pressed="' + (c === ui.category) + '">' + esc(c) + '</button>';
    }).join(''));
  }

  function visibleItems() {
    var query = ui.search.trim().toLowerCase();
    var trip = Store.trip();
    var plan = planning();
    return Store.state.items.filter(function (item) {
      // Outfits draw on everything you own, packed or not.
      if (!plan && Calc.remaining(item, trip) === 0) return false;
      if (ui.category !== 'All' && item.category !== ui.category) return false;
      if (!query) return true;
      return (item.name + ' ' + item.description + ' ' + item.category).toLowerCase().indexOf(query) !== -1;
    });
  }

  function renderCards() {
    var list = visibleItems();
    setHTML($('cards'), list.map(function (item) {
      return '<article class="card" data-drag="card" data-id="' + esc(item.id) + '">' +
        '<span class="in-bag" hidden></span>' +
        '<div class="card-media">' + media(item) + '</div>' +
        '<div class="card-body">' +
        '<div class="card-name">' + esc(item.name) + '</div>' +
        '<div class="card-desc">' + esc(item.description) + '</div>' +
        '<div class="card-meta">' + fmt(item.weightKg) + ' kg · ' +
        (item.cube === true ? 'holds ' + fmt(item.capacityL) : fmt(item.volumeL)) + ' L<span class="card-left"></span></div>' +
        (item.carryOnOnly ? '<div class="card-flag">Carry-on only</div>' : '') +
        '<div class="card-actions">' +
        '<button class="btn" data-action="pack" data-id="' + esc(item.id) + '" data-fk="pack-' + esc(item.id) + '" aria-label="Add ' + esc(item.name) + ' to bag">Add</button>' +
        '<button class="btn" data-action="item-edit" data-id="' + esc(item.id) + '" aria-label="Edit ' + esc(item.name) + '">Edit</button>' +
        '<button class="btn" data-action="item-duplicate" data-id="' + esc(item.id) + '" aria-label="Duplicate ' + esc(item.name) + '" title="Duplicate this item">Copy</button>' +
        '</div></div></article>';
    }).join(''));
    $('no-results').hidden = list.length > 0;
    $('no-results').textContent = !ui.search.trim() && ui.category === 'All'
      ? 'Everything in your inventory is packed for this trip.'
      : 'No unpacked items match.';
  }

  function renderInBagBadges() {
    var packed = Store.packedInBag();
    var items = Store.itemsById();
    var bag = Store.bag();
    var openCube = Store.cube();
    var trip = Store.trip();
    if (planning()) {
      var needs = planState().needs;
      document.querySelectorAll('#cards .card').forEach(function (card) {
        var item = items[card.dataset.id];
        var badge = card.querySelector('.in-bag');
        var needed = needs[item.id] ? needs[item.id].needed : 0;
        badge.hidden = needed === 0;
        badge.textContent = 'Planned x' + needed;
        card.querySelector('.card-left').textContent = item.ownedQty > 1 ? ' · own ' + item.ownedQty : '';
        card.classList.toggle('blocked', item.cube === true);
      });
      return;
    }
    document.querySelectorAll('#cards .card').forEach(function (card) {
      var item = items[card.dataset.id];
      var badge = card.querySelector('.in-bag');
      var qty = packed[card.dataset.id] || 0;
      badge.hidden = qty === 0;
      badge.textContent = (openCube ? 'In cube x' : 'In bag x') + qty;
      var left = '';
      if (item.cube === true) {
        var inside = Calc.cubeTotals(item, trip.cubes[item.id], items).count;
        if (inside) left = ' · ' + inside + ' inside';
      } else if (item.ownedQty > 1) {
        left = ' · ' + Calc.remaining(item, trip) + ' of ' + item.ownedQty + ' left';
      }
      card.querySelector('.card-left').textContent = left;
      var blocked = openCube
        ? item.cube === true || item.carryOnOnly === true
        : !!bag && Calc.carryOnBlocked(item, bag);
      card.classList.toggle('blocked', blocked);
    });
  }

  // ----- Itinerary -----

  function planState() {
    var it = Store.trip().itinerary;
    var items = Store.itemsById();
    var days = Calc.tripDays(it.departDate, it.returnDate);
    var plan = Calc.outfitPlan(days, it.days, items);
    var needs = Calc.outfitNeeds(plan.entries);
    var unwashed = Calc.outfitNeeds(Calc.outfitPlan(days, it.days, items, true).entries);
    var saved = Object.keys(unwashed).reduce(function (sum, id) {
      return sum + unwashed[id].needed - (needs[id] ? needs[id].needed : 0);
    }, 0);
    return { it: it, days: days, entries: plan.entries, laundry: plan.laundry, needs: needs, laundrySaves: saved };
  }

  // Leaves a field alone while it is being typed in.
  function setValue(el, value) {
    if (document.activeElement !== el && el.value !== value) el.value = value;
  }

  function planBlockReason(id, date) {
    var item = Store.itemsById()[id];
    if (!date) return 'Set your fly-out and return dates first.';
    if (item && item.cube === true) return 'Packing cubes can’t be part of an outfit.';
    var day = Store.trip().itinerary.days[date];
    if (item && day && day.outfit.some(function (entry) { return entry.itemId === id; })) {
      return item.name + ' is already in this day’s outfit.';
    }
    return null;
  }

  function planAdd(id, date) {
    ui.selectedDay = date;
    ui.justPlanned = { date: date, id: id };
    if (!Store.addToOutfit(date, id)) {
      ui.justPlanned = null;
      toast(planBlockReason(id, date) || 'That could not be added.');
    }
  }

  function dayTarget(date) {
    var day = document.querySelector('#days .day[data-day="' + date + '"]');
    return day ? day.querySelector('.outfit') || day : null;
  }

  function flightLines(date, it) {
    var lines = [];
    [['outbound', 'Flying out'], ['inbound', 'Coming back']].forEach(function (pair) {
      var f = it[pair[0]];
      var name = f.flight || pair[1];
      var departs = f.departs;
      var arrives = f.arrives;
      if (departs && departs.slice(0, 10) === date) {
        var line = '✈ ' + name + ': ' + (f.from ? f.from + ' ' : '') + departs.slice(11, 16);
        if (f.to || arrives) line += ' → ' + (f.to ? f.to + ' ' : '') + (arrives ? arrives.slice(11, 16) : '');
        if (arrives && arrives.slice(0, 10) !== date) line += ' (' + Calc.formatDay(arrives.slice(0, 10)) + ')';
        lines.push(line.trim());
      } else if (arrives && arrives.slice(0, 10) === date) {
        lines.push('✈ ' + name + ' lands' + (f.to ? ' in ' + f.to : '') + ' at ' + arrives.slice(11, 16));
      }
    });
    return lines;
  }

  function outfitChip(date, dayNumber, entry) {
    var id = esc(entry.item.id);
    var tag = '';
    if (entry.kind === 'same') {
      tag = '<span class="outfit-tag" title="You own one, so this is the same one again">Re-worn</span>';
    } else if (entry.kind === 'washed') {
      tag = '<span class="outfit-tag outfit-washed" title="Clean again after laundry, so nothing more to pack">Washed</span>';
    } else if (entry.kind === 'new' || entry.kind === 'rewear') {
      tag = '<button class="outfit-toggle" data-action="outfit-rewear" data-day="' + date + '" data-id="' + id + '"' +
        ' data-fk="rewear-' + date + '-' + id + '" aria-pressed="' + (entry.kind === 'rewear') + '"' +
        ' title="On: wear an earlier one again. Off: a fresh one, which you will need to pack.">Re-wear</button>';
    }
    return '<span class="outfit-item" data-id="' + id + '">' +
      '<span class="outfit-name">' + esc(entry.item.name) + '</span>' + tag +
      '<button class="outfit-remove" data-action="outfit-remove" data-day="' + date + '" data-id="' + id + '"' +
      ' data-fk="outfit-remove-' + date + '-' + id + '" aria-label="Remove ' + esc(entry.item.name) + ' from day ' + dayNumber + '">×</button>' +
      '</span>';
  }

  function laundryHTML(date, list) {
    var items = list.map(function (entry) {
      var id = esc(entry.item.id);
      return '<button class="wash-item" data-action="wash-toggle" data-day="' + date + '" data-id="' + id + '"' +
        ' data-fk="wash-' + date + '-' + id + '" aria-pressed="' + entry.washed + '">' +
        esc(entry.item.name) + (entry.count > 1 ? ' x' + entry.count : '') + '</button>';
    }).join('');
    return '<div class="laundry">' +
      '<p class="laundry-note">Washed at the end of the day, so they can be worn again as fresh pieces. Untick anything you won’t wash.</p>' +
      (items ? '<div class="wash-items">' + items + '</div>' : '<p class="laundry-note">Nothing has been worn yet to wash.</p>') +
      '</div>';
  }

  function dayHTML(date, index, it, entries, laundryList) {
    var plan = it.days[date] || { place: '' };
    var chips = entries.map(function (entry) { return outfitChip(date, index + 1, entry); }).join('');
    var laundryOn = !!plan.laundry;
    return '<article class="day" data-day="' + date + '" data-selected="' + (date === ui.selectedDay) + '" data-action="day-select">' +
      '<div class="day-head"><h3>Day ' + (index + 1) + '</h3><span class="day-date">' + Calc.formatDay(date) + '</span>' +
      '<button class="laundry-toggle" data-action="laundry-toggle" data-day="' + date + '" data-fk="laundry-' + date + '" aria-pressed="' + laundryOn + '">Laundry</button></div>' +
      flightLines(date, it).map(function (line) { return '<p class="day-flight">' + esc(line) + '</p>'; }).join('') +
      '<label class="day-place">Where <input data-day-place="' + date + '" data-fk="place-' + date + '" maxlength="80" placeholder="e.g. Kyoto" value="' + esc(plan.place) + '"></label>' +
      '<div class="outfit">' + (chips || '<span class="outfit-empty">No outfit yet</span>') + '</div>' +
      (laundryOn ? laundryHTML(date, laundryList || []) : '') +
      '</article>';
  }

  function checkHTML(report, laundrySaves) {
    if (!report.rows.length && !report.unplanned.length) {
      return '<p class="check-empty">Add outfits to your days to compare them with what you have packed.</p>';
    }
    var savings = laundrySaves > 0
      ? '<p class="check-laundry">Laundry saves packing ' + laundrySaves + (laundrySaves === 1 ? ' item.' : ' items.') + '</p>'
      : '';
    var toPack = report.rows.filter(function (r) { return r.status === 'short' || r.status === 'owned'; }).length;
    var extra = report.rows.filter(function (r) { return r.status === 'extra'; }).length;
    var parts = [];
    if (toPack) parts.push(toPack + (toPack === 1 ? ' item needs' : ' items need') + ' attention');
    if (extra) parts.push(extra + (extra === 1 ? ' item is' : ' items are') + ' packed more than planned');
    if (report.unplanned.length) parts.push(report.unplanned.length + ' packed ' + (report.unplanned.length === 1 ? 'item isn’t' : 'items aren’t') + ' in any outfit');
    var summary = parts.length ? parts.join(' · ') : 'Your outfits match what you have packed.';
    var rows = report.rows.map(function (r) {
      var status = {
        owned: 'Planned ' + r.needed + ', but you own ' + r.owned,
        short: 'Pack ' + (r.needed - r.packed) + ' more',
        extra: (r.packed - r.needed) + ' more packed than planned',
        ok: 'Packed to match'
      }[r.status];
      var worn = r.days > r.needed ? ' · worn ' + r.days + ' days' : '';
      return '<li class="check-row" data-status="' + r.status + '">' +
        '<span class="check-name">' + esc(r.item.name) + '</span>' +
        '<span class="check-counts">need ' + r.needed + ' · packed ' + r.packed + worn + '</span>' +
        '<span class="check-status">' + status + '</span></li>';
    }).join('');
    var unplanned = report.unplanned.length
      ? '<p class="check-unplanned"><b>Packed but not in any outfit:</b> ' + report.unplanned.map(function (u) {
        return esc(u.item.name) + (u.packed > 1 ? ' x' + u.packed : '');
      }).join(', ') + '. Leave these out if you won’t wear them.</p>'
      : '';
    return '<p class="check-summary">' + summary + '</p>' + savings + (rows ? '<ul class="check-rows">' + rows + '</ul>' : '') + unplanned;
  }

  function renderPlan() {
    if (!planning()) return;
    var trip = Store.trip();
    var state = planState();
    var it = state.it;
    setValue($('depart-date'), it.departDate);
    setValue($('return-date'), it.returnDate);
    document.querySelectorAll('#plan-view [data-flight]').forEach(function (fieldset) {
      var flight = it[fieldset.dataset.flight];
      fieldset.querySelectorAll('[data-flight-field]').forEach(function (input) {
        setValue(input, flight[input.dataset.flightField]);
      });
    });

    var length = Calc.tripLength(it.departDate, it.returnDate);
    var lengthEl = $('plan-length');
    lengthEl.dataset.error = String(!!(it.departDate && it.returnDate && !length));
    if (lengthEl.dataset.error === 'true') {
      lengthEl.textContent = 'Your return date is before you fly out.';
    } else if (!length) {
      lengthEl.textContent = 'Set both dates to plan each day.';
    } else {
      lengthEl.textContent = length + (length === 1 ? ' day' : ' days') +
        (length > 1 ? ', ' + (length - 1) + (length === 2 ? ' night' : ' nights') : '') +
        (length > Calc.MAX_TRIP_DAYS ? '. Only the first ' + Calc.MAX_TRIP_DAYS + ' days are shown.' : '');
    }

    if (state.days.indexOf(ui.selectedDay) === -1) ui.selectedDay = state.days[0] || null;
    setHTML($('days'), state.days.length
      ? state.days.map(function (date, i) { return dayHTML(date, i, it, state.entries[date], state.laundry[date]); }).join('')
      : '<p class="outfit-empty">Your days will appear here once both dates are set.</p>');
    if (ui.justPlanned) {
      var chip = document.querySelector('#days .day[data-day="' + ui.justPlanned.date + '"] .outfit-item[data-id="' + ui.justPlanned.id + '"]');
      if (chip) chip.classList.add('pop');
      ui.justPlanned = null;
    }
    setHTML($('outfit-check'), checkHTML(Calc.outfitCheck(trip, Store.itemsById(), state.needs), state.laundrySaves));
  }

  // ----- Packing -----

  function flyTarget(id) {
    var container = $('packed');
    var chip = container.querySelector('.chip[data-id="' + id + '"]');
    if (chip) {
      var c = chip.getBoundingClientRect();
      var box = container.getBoundingClientRect();
      if (c.top >= box.top && c.bottom <= box.bottom) return chip;
    }
    return container;
  }

  function celebrate() {
    if (Drag.reducedMotion()) return;
    $('suitcase').animate([
      { transform: 'scale(1)' },
      { transform: 'scale(1.025, .97)', offset: 0.3 },
      { transform: 'scale(.99, 1.015)', offset: 0.65 },
      { transform: 'scale(1)' }
    ], { duration: 340, easing: 'ease-out' });
    $('lid').animate([
      { transform: 'perspective(600px) rotateX(16deg)' },
      { transform: 'perspective(600px) rotateX(34deg)', offset: 0.35 },
      { transform: 'perspective(600px) rotateX(10deg)', offset: 0.7 },
      { transform: 'perspective(600px) rotateX(16deg)' }
    ], { duration: 420, easing: 'ease-out' });
  }

  function blockReason(id) {
    var item = Store.itemsById()[id];
    var openCube = Store.cube();
    if (openCube && item && item.cube === true) return 'A cube cannot go inside another cube. Open a bag to pack it.';
    if (openCube && item && item.carryOnOnly === true) {
      return item.name + ' is carry-on only, so pack it straight into your carry-on bag rather than a cube.';
    }
    var bag = Store.bag();
    if (!openCube && !bag) return 'Add a bag to this trip first.';
    if (!openCube && item && Calc.carryOnBlocked(item, bag)) {
      return item.name + ' can only go in a carry-on bag, and ' + bag.name + ' is not one.';
    }
    if (item && Calc.remaining(item, Store.trip()) === 0) {
      return 'All of your ' + item.name + ' are already packed for this trip.';
    }
    return null;
  }

  function refuse(id) {
    toast(blockReason(id));
    if (Drag.reducedMotion()) return;
    $('suitcase').animate([
      { transform: 'translateX(0)' },
      { transform: 'translateX(-7px)', offset: 0.2 },
      { transform: 'translateX(6px)', offset: 0.45 },
      { transform: 'translateX(-3px)', offset: 0.7 },
      { transform: 'translateX(0)' }
    ], { duration: 320, easing: 'ease-out' });
  }

  function pack(id) {
    ui.justPacked = id;
    if (Store.pack(id)) {
      celebrate();
    } else {
      ui.justPacked = null;
      refuse(id);
    }
  }

  // ----- Dialog helpers -----

  function confirmAction(title, text, okLabel) {
    return new Promise(function (resolve) {
      var dialog = $('confirm-dialog');
      $('confirm-title').textContent = title;
      $('confirm-text').textContent = text;
      $('confirm-ok').textContent = okLabel;
      function finish(answer) {
        $('confirm-ok').onclick = null;
        $('confirm-cancel').onclick = null;
        dialog.oncancel = null;
        if (dialog.open) dialog.close();
        resolve(answer);
      }
      $('confirm-ok').onclick = function () { finish(true); };
      $('confirm-cancel').onclick = function () { finish(false); };
      dialog.oncancel = function () { finish(false); };
      dialog.showModal();
    });
  }

  function askName(title, value, submit) {
    $('name-title').textContent = title;
    $('name-error').textContent = '';
    $('name-form').elements.name.value = value;
    nameSubmit = submit;
    $('name-dialog').showModal();
    $('name-form').elements.name.select();
  }

  function numberField(form, name) {
    var raw = form.elements[name].value;
    return raw === '' ? null : Number(raw);
  }

  // Changing a dimension recalculates the volume. The volume can still be typed over afterwards.
  function autoVolume(form, volumeField) {
    form.addEventListener('input', function (e) {
      if (['dimL', 'dimW', 'dimH'].indexOf(e.target.name) === -1) return;
      var volume = Calc.volumeFromDims([numberField(form, 'dimL'), numberField(form, 'dimW'), numberField(form, 'dimH')]);
      if (volume !== null) form.elements[volumeField()].value = volume;
    });
  }

  function syncCubeFields() {
    var form = $('item-form');
    var isCube = form.elements.isCube.checked;
    $('cube-capacity').hidden = !isCube;
    $('owned-field').hidden = isCube;
    $('carry-on-field').hidden = isCube;
    $('volume-label').firstChild.textContent = isCube ? 'Empty volume (L)' : 'Packed volume (L)';
  }

  // ----- Item dialog -----

  // With isCopy, the form starts from item but saves as a new item placed after it.
  function openItemDialog(item, isCopy) {
    itemDraft = item ? JSON.parse(JSON.stringify(item)) : { id: null, icon: '📦' };
    copySourceId = isCopy ? item.id : null;
    if (isCopy) {
      itemDraft.id = null;
      itemDraft.name = item.name + ' (copy)';
    }
    var form = $('item-form');
    var dims = itemDraft.dimsCm || ['', '', ''];
    $('item-dialog-title').textContent = isCopy ? 'Duplicate item' : item ? 'Edit item' : 'Add item';
    form.elements.name.value = itemDraft.name || '';
    form.elements.description.value = itemDraft.description || '';
    form.elements.category.value = itemDraft.category || '';
    form.elements.weightKg.value = item ? itemDraft.weightKg : '';
    form.elements.volumeL.value = item ? itemDraft.volumeL : '';
    form.elements.dimL.value = dims[0];
    form.elements.dimW.value = dims[1];
    form.elements.dimH.value = dims[2];
    form.elements.carryOnOnly.checked = itemDraft.carryOnOnly === true;
    form.elements.ownedQty.value = itemDraft.ownedQty || 1;
    form.elements.isCube.checked = itemDraft.cube === true;
    form.elements.isCube.disabled = !!item && !isCopy;
    form.elements.capacityL.value = itemDraft.cube === true ? itemDraft.capacityL : '';
    syncCubeFields();
    $('photo-input').value = '';
    $('item-error').textContent = '';
    $('item-delete').hidden = !item || !!isCopy;
    $('category-list').innerHTML = categories().map(function (c) {
      return '<option value="' + esc(c) + '"></option>';
    }).join('');
    renderIconPicker();
    renderPhotoPreview();
    $('item-dialog').showModal();
    if (isCopy) form.elements.name.select();
  }

  function renderIconPicker() {
    var icons = Seed.ICONS.indexOf(itemDraft.icon) === -1 ? [itemDraft.icon].concat(Seed.ICONS) : Seed.ICONS;
    $('icon-picker').innerHTML = icons.map(function (icon) {
      return '<button type="button" class="icon-choice" role="radio" data-action="icon-choose" data-icon="' + esc(icon) + '" aria-checked="' + (icon === itemDraft.icon) + '">' + esc(icon) + '</button>';
    }).join('');
  }

  function renderPhotoPreview() {
    $('photo-preview').innerHTML = media(itemDraft);
    $('photo-remove').hidden = !itemDraft.photo;
  }

  function shrinkPhoto(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var SIZE = 200;
        var scale = Math.min(1, SIZE / Math.max(img.naturalWidth, img.naturalHeight));
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('That file could not be read as an image.'));
      };
      img.src = url;
    });
  }

  function submitItem(e) {
    e.preventDefault();
    var form = e.target;
    var name = form.elements.name.value.trim();
    var category = form.elements.category.value.trim();
    var weight = numberField(form, 'weightKg');
    var volume = numberField(form, 'volumeL');
    var dims = [numberField(form, 'dimL'), numberField(form, 'dimW'), numberField(form, 'dimH')];
    var filled = dims.filter(function (d) { return d !== null; }).length;
    var isCube = form.elements.isCube.checked;
    var capacity = numberField(form, 'capacityL');
    var owned = isCube ? 1 : numberField(form, 'ownedQty');
    var error = '';
    if (!name) error = 'Enter a name.';
    else if (!category) error = 'Enter a category.';
    else if (weight === null || weight < 0) error = 'Enter a weight of 0 or more.';
    else if (volume === null || volume < 0) error = 'Enter a volume of 0 or more.';
    else if (owned === null || owned < 1 || owned % 1 !== 0) error = 'Enter how many you own, as a whole number of 1 or more.';
    else if (isCube && (capacity === null || capacity <= 0)) error = 'Enter how many litres the cube holds.';
    else if (filled !== 0 && filled !== 3) error = 'Fill in all three dimensions, or leave them all blank.';
    else if (filled === 3 && dims.some(function (d) { return d <= 0; })) error = 'Dimensions must be greater than 0.';
    $('item-error').textContent = error;
    if (error) return;

    var item = {
      id: itemDraft.id || Store.newItemId(),
      name: name,
      description: form.elements.description.value.trim(),
      category: category,
      weightKg: weight,
      volumeL: volume,
      ownedQty: owned,
      icon: itemDraft.icon
    };
    if (filled === 3) item.dimsCm = dims;
    if (itemDraft.photo) item.photo = itemDraft.photo;
    if (isCube) {
      item.cube = true;
      item.capacityL = capacity;
    } else if (form.elements.carryOnOnly.checked) {
      item.carryOnOnly = true;
    }
    $('item-dialog').close();
    Store.saveItem(item, copySourceId);
  }

  function deleteItem() {
    var id = itemDraft.id;
    var count = Store.itemPackedCount(id);
    var isCube = itemDraft.cube === true;
    $('item-dialog').close();
    var text = count > 0
      ? 'It is packed ' + count + (count === 1 ? ' time' : ' times') + ' across your trips and will be taken out of those bags.'
      : 'It will be removed from your inventory.';
    if (isCube) text += ' Anything inside it goes back to your inventory.';
    confirmAction('Delete this item?', text, 'Delete item').then(function (yes) {
      if (yes) Store.deleteItem(id);
    });
  }

  // ----- Bag dialogs -----

  function openBagDialog(bag) {
    bagDraft = bag || null;
    var form = $('bag-form');
    var interior = (bag && bag.interiorCm) || ['', '', ''];
    $('bag-dialog-title').textContent = bag ? 'Edit bag' : 'New bag';
    form.elements.name.value = bag ? bag.name : '';
    form.elements.emptyWeightKg.value = bag ? bag.emptyWeightKg : '';
    form.elements.weightLimitKg.value = bag ? bag.weightLimitKg : '';
    form.elements.capacityL.value = bag ? bag.capacityL : '';
    form.elements.dimL.value = interior[0];
    form.elements.dimW.value = interior[1];
    form.elements.dimH.value = interior[2];
    form.elements.isCarryOn.checked = !!bag && bag.isCarryOn === true;
    $('bag-error').textContent = '';
    $('bag-delete').hidden = !bag;
    $('bag-remove').hidden = !bag;
    $('bag-dialog').showModal();
  }

  function submitBag(e) {
    e.preventDefault();
    var form = e.target;
    var name = form.elements.name.value.trim();
    var empty = numberField(form, 'emptyWeightKg');
    var limit = numberField(form, 'weightLimitKg');
    var capacity = numberField(form, 'capacityL');
    var interior = [numberField(form, 'dimL'), numberField(form, 'dimW'), numberField(form, 'dimH')];
    var error = '';
    if (!name) error = 'Enter a name.';
    else if (empty === null || empty < 0) error = 'Enter an empty weight of 0 or more.';
    else if (limit === null || limit <= 0) error = 'Enter a weight limit greater than 0.';
    else if (capacity === null || capacity <= 0) error = 'Enter a capacity greater than 0.';
    else if (interior.some(function (d) { return d === null || d <= 0; })) error = 'Enter all three interior sizes.';
    $('bag-error').textContent = error;
    if (error) return;

    var isNew = !bagDraft;
    var record = {
      id: isNew ? Store.newBagId() : bagDraft.id,
      name: name,
      emptyWeightKg: empty,
      capacityL: capacity,
      weightLimitKg: limit,
      interiorCm: interior,
      isCarryOn: form.elements.isCarryOn.checked
    };
    $('bag-dialog').close();
    Store.saveBag(record, isNew);
  }

  function removeBagFromTrip() {
    var bag = bagDraft;
    var count = Store.bagItemCountInTrip(bag.id);
    $('bag-dialog').close();
    if (count === 0) {
      Store.removeBagFromTrip(bag.id);
      return;
    }
    confirmAction('Remove ' + bag.name + ' from this trip?',
      'The ' + count + (count === 1 ? ' item' : ' items') + ' packed in it for this trip will be unpacked. The bag stays in your bag list.',
      'Remove bag').then(function (yes) {
      if (yes) Store.removeBagFromTrip(bag.id);
    });
  }

  function deleteBag() {
    var bag = bagDraft;
    var count = Store.bagItemCountAllTrips(bag.id);
    $('bag-dialog').close();
    var text = 'It will be removed from every trip.' + (count > 0
      ? ' The ' + count + (count === 1 ? ' item' : ' items') + ' packed in it will be unpacked.'
      : '');
    confirmAction('Delete ' + bag.name + '?', text, 'Delete bag').then(function (yes) {
      if (yes) Store.deleteBag(bag.id);
    });
  }

  function openBagPicker() {
    var inTrip = Store.trip().bagIds;
    var available = Store.state.bags.filter(function (b) { return inTrip.indexOf(b.id) === -1; });
    $('bag-picker-list').innerHTML = available.length
      ? available.map(function (b) {
        return '<div class="bag-option"><div><b>' + esc(b.name) + '</b><small>' + fmt(b.capacityL) + ' L, up to ' + fmt(b.weightLimitKg) + ' kg' + (b.isCarryOn ? ', carry-on' : '') + '</small></div>' +
          '<button type="button" class="btn" data-action="bag-pick" data-id="' + esc(b.id) + '">Add</button></div>';
      }).join('')
      : '<p>All your bags are already on this trip.</p>';
    $('bag-picker').showModal();
  }

  // ----- Checklist -----

  function currentChecklist() {
    return Calc.checklist(Store.trip(), Store.bagsById(), Store.itemsById());
  }

  function openChecklist() {
    var list = currentChecklist();
    var hasItems = list.sections.length > 0;
    function items(lines) {
      return lines.length ? '<ul>' + lines.map(function (line) { return '<li>' + esc(line) + '</li>'; }).join('') + '</ul>' : '';
    }
    $('checklist-title').textContent = list.title + ' checklist';
    $('checklist-empty').hidden = hasItems;
    $('checklist-ready').hidden = !hasItems;
    $('checklist-copy').hidden = !hasItems;
    $('checklist-download').hidden = !hasItems;
    $('checklist-message').textContent = '';
    $('checklist-preview').innerHTML = list.sections.map(function (section) {
      return '<h3>' + esc(section.title) + '</h3>' + items(section.lines) +
        section.cubes.map(function (cube) { return '<h4>' + esc(cube.title) + '</h4>' + items(cube.lines); }).join('');
    }).join('');
    $('checklist-dialog').showModal();
  }

  function downloadChecklist() {
    var list = currentChecklist();
    var name = list.title.replace(/[\\/:*?"<>|]/g, '-').trim() || 'Trip';
    downloadFile(name + ' packing list.md', Calc.checklistMarkdown(list), 'text/markdown');
    $('checklist-message').textContent = 'Downloaded. Now import it from File > Import Markdown in Notes.';
  }

  // The older copy route still works where the clipboard API is not available to local files.
  function copyWithSelection(text) {
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    $('checklist-dialog').appendChild(area);
    area.select();
    var copied = false;
    try { copied = document.execCommand('copy'); } catch (err) { copied = false; }
    area.remove();
    return copied;
  }

  function copyChecklist() {
    var text = Calc.checklistText(currentChecklist());
    function report(copied) {
      $('checklist-message').textContent = copied
        ? 'Copied. Paste it into a note, select the items, and click the Checklist button in Notes.'
        : 'Your browser blocked copying. Use Download for Notes instead.';
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { report(true); }, function () { report(copyWithSelection(text)); });
    } else {
      report(copyWithSelection(text));
    }
  }

  // ----- Backups -----

  function downloadFile(filename, contents, type) {
    var blob = new Blob([contents], { type: type });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function exportBackup() {
    downloadFile('packing-backup-' + new Date().toISOString().slice(0, 10) + '.json', Store.exportJSON(), 'application/json');
  }

  function importBackup(file) {
    confirmAction('Replace everything with this backup?',
      'Your current items, bags and trips will be replaced by "' + file.name + '".',
      'Replace').then(function (yes) {
      if (!yes) return null;
      return file.text().then(function (json) {
        Store.importJSON(json);
        toast('Backup imported.');
      });
    }).catch(function (err) {
      toast(err instanceof SyntaxError ? 'That file is not valid JSON.' : err.message);
    });
  }

  // ----- Events -----

  var actions = {
    'pack': function (el) {
      var id = el.dataset.id;
      if (planning()) {
        var date = ui.selectedDay;
        var reason = planBlockReason(id, date);
        if (reason) {
          toast(reason);
          return;
        }
        var key = 'plan:' + date + ':' + id;
        var target = dayTarget(date);
        if (ui.flying[key]) return;
        if (!target) {
          planAdd(id, date);
          return;
        }
        ui.flying[key] = 1;
        Drag.flyFrom(el.closest('.card'), target, function () {
          delete ui.flying[key];
          planAdd(id, date);
        });
        return;
      }
      if (blockReason(id)) {
        refuse(id);
        return;
      }
      // A quick second click must not send more than you own while the first is in the air.
      var left = Calc.remaining(Store.itemsById()[id], Store.trip());
      if ((ui.flying[id] || 0) >= left) return;
      ui.flying[id] = (ui.flying[id] || 0) + 1;
      Drag.flyFrom(el.closest('.card'), flyTarget(id), function () {
        ui.flying[id] -= 1;
        pack(id);
      });
    },
    'unpack': function (el) { Store.unpack(el.dataset.id); },
    'view-pack': function () { Store.setView('pack'); },
    'view-plan': function () { Store.setView('plan'); },
    'day-select': function (el) {
      if (ui.selectedDay === el.dataset.day) return;
      ui.selectedDay = el.dataset.day;
      renderPlan();
    },
    'outfit-remove': function (el) { Store.removeFromOutfit(el.dataset.day, el.dataset.id); },
    'outfit-rewear': function (el) { Store.toggleRewear(el.dataset.day, el.dataset.id); },
    'laundry-toggle': function (el) {
      ui.selectedDay = el.dataset.day;
      Store.toggleLaundry(el.dataset.day);
    },
    'wash-toggle': function (el) { Store.toggleWashItem(el.dataset.day, el.dataset.id); },
    'room-remove': function (el) { Store.unpack(el.dataset.id, el.dataset.cube || null); },
    'filter': function (el) {
      ui.category = el.dataset.category;
      render();
    },
    'item-add': function () { openItemDialog(null); },
    'item-edit': function (el) { openItemDialog(Store.itemsById()[el.dataset.id]); },
    'item-duplicate': function (el) { openItemDialog(Store.itemsById()[el.dataset.id], true); },
    'icon-choose': function (el) {
      itemDraft.icon = el.dataset.icon;
      renderIconPicker();
      renderPhotoPreview();
    },
    'bag-select': function (el) { Store.setActiveBag(el.dataset.id); },
    'cube-select': function (el) { Store.setActiveCube(el.dataset.id); },
    'bag-add': openBagPicker,
    'bag-pick': function (el) {
      $('bag-picker').close();
      Store.addBagToTrip(el.dataset.id);
    },
    'bag-create': function () {
      $('bag-picker').close();
      openBagDialog(null);
    },
    'bag-edit': function () {
      var openCube = Store.cube();
      if (openCube) openItemDialog(openCube);
      else openBagDialog(Store.bag());
    },
    'trip-new': function () {
      askName('New trip', '', function (name) { Store.createTrip(name); });
    },
    'trip-rename': function () {
      askName('Rename trip', Store.trip().name, function (name) { Store.renameTrip(name); });
    },
    'trip-duplicate': function () {
      askName('Duplicate trip', Store.trip().name + ' (copy)', function (name) { Store.duplicateTrip(name); });
    },
    'trip-delete': function () {
      var trip = Store.trip();
      confirmAction('Delete ' + trip.name + '?', 'Its packing lists will be removed. Your items and bags stay.', 'Delete trip').then(function (yes) {
        if (yes) Store.deleteTrip();
      });
    },
    'checklist-open': openChecklist,
    'checklist-download': downloadChecklist,
    'checklist-copy': copyChecklist,
    'export': exportBackup,
    'import': function () { $('import-file').click(); },
    'dialog-close': function (el) { el.closest('dialog').close(); }
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (el && actions[el.dataset.action]) actions[el.dataset.action](el);
  });

  $('trip-select').addEventListener('change', function (e) { Store.setActiveTrip(e.target.value); });
  $('theme-select').addEventListener('change', function (e) { Store.setTheme(e.target.value); });
  $('plan-view').addEventListener('change', function (e) {
    var target = e.target;
    if (target.id === 'depart-date' || target.id === 'return-date') {
      Store.setTripDates($('depart-date').value, $('return-date').value);
    } else if (target.dataset.flightField) {
      Store.setFlight(target.closest('[data-flight]').dataset.flight, target.dataset.flightField, target.value);
    } else if (target.dataset.dayPlace) {
      // Saving redraws the day cards, so wait until Tab has moved focus to the next field.
      var date = target.dataset.dayPlace;
      var place = target.value;
      setTimeout(function () { Store.setDayPlace(date, place); }, 0);
    }
  });
  $('search').addEventListener('input', function (e) {
    ui.search = e.target.value;
    render();
  });
  $('item-form').addEventListener('submit', submitItem);
  $('bag-form').addEventListener('submit', submitBag);
  autoVolume($('item-form'), function () {
    return $('item-form').elements.isCube.checked ? 'capacityL' : 'volumeL';
  });
  autoVolume($('bag-form'), function () { return 'capacityL'; });
  $('item-form').elements.isCube.addEventListener('change', syncCubeFields);
  $('name-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = e.target.elements.name.value.trim();
    if (!name) {
      $('name-error').textContent = 'Enter a name.';
      return;
    }
    $('name-dialog').close();
    nameSubmit(name);
  });
  $('item-delete').addEventListener('click', deleteItem);
  $('bag-remove').addEventListener('click', removeBagFromTrip);
  $('bag-delete').addEventListener('click', deleteBag);
  $('photo-remove').addEventListener('click', function () {
    delete itemDraft.photo;
    $('photo-input').value = '';
    renderPhotoPreview();
  });
  $('photo-input').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    shrinkPhoto(file).then(function (dataUrl) {
      itemDraft.photo = dataUrl;
      $('item-error').textContent = '';
      renderPhotoPreview();
    }).catch(function (err) {
      $('item-error').textContent = err.message;
    });
  });
  $('import-file').addEventListener('change', function (e) {
    var file = e.target.files[0];
    e.target.value = '';
    if (file) importBackup(file);
  });

  Store.setSaveErrorHandler(function () {
    toast('Browser storage is full, so this change is not saved. Remove some photos, then try again.');
  });
  Store.subscribe(render);
  Store.load();
  // Box sizes depend on the space available, so they follow the window.
  new ResizeObserver(function () { renderBag(); }).observe($('packed'));
  Drag.init({
    packZone: function () { return $('suitcase'); },
    zoneAt: function (x, y) {
      if (planning()) {
        var el = document.elementFromPoint(x, y);
        return el ? el.closest('#days .day') : null;
      }
      var r = $('suitcase').getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom ? $('suitcase') : null;
    },
    flyTarget: function (id, zone) {
      return zone.dataset.day ? zone.querySelector('.outfit') || zone : flyTarget(id);
    },
    onPack: function (id, zone) {
      if (zone.dataset.day) planAdd(id, zone.dataset.day);
      else pack(id);
    },
    isBlocked: function (id, zone) {
      return zone.dataset.day ? planBlockReason(id, zone.dataset.day) !== null : blockReason(id) !== null;
    },
    onBlocked: function (id, zone) {
      if (zone.dataset.day) toast(planBlockReason(id, zone.dataset.day));
      else refuse(id);
    },
    onUnpack: function (id) { Store.unpack(id); }
  });
  render();
})();
