// App state, saving to browser storage, and backup import and export.
var Store = (function () {
  var KEY = 'packing-app-v1';
  var state = null;
  var listeners = [];
  var onSaveError = function () {};

  function newId(prefix) {
    return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function validId(id, prefix) {
    return typeof id === 'string' && id.indexOf(prefix + '-') === 0 && /^[\w-]+$/.test(id);
  }

  function num(value) {
    var n = Number(value);
    return isFinite(n) && n >= 0 ? n : 0;
  }

  function dims(value) {
    if (!Array.isArray(value) || value.length !== 3) return null;
    var d = value.map(num);
    return d.every(function (x) { return x > 0; }) ? d : null;
  }

  function text(value, fallback) {
    return typeof value === 'string' && value.trim() ? value : fallback;
  }

  // Cleans loaded or imported data so the rest of the app can trust its shape.
  function normalize(raw) {
    if (!raw || !Array.isArray(raw.items) || !Array.isArray(raw.bags) || !Array.isArray(raw.trips)) {
      throw new Error('This file is not a packing app backup.');
    }
    // Data saved before the carry-on rule has no flags, so starter records get their defaults.
    var seed = Seed.state();
    var seedItems = byId(seed.items);
    var seedBags = byId(seed.bags);
    var sourceItems = withUpdatedItems(raw.items, seedItems, raw.dataVersion || 1);
    var itemIds = {};
    var cubeIds = {};
    var items = sourceItems.filter(function (i) { return i && validId(i.id, 'item'); }).map(function (i) {
      itemIds[i.id] = true;
      var item = {
        id: i.id,
        name: text(i.name, 'Unnamed item'),
        description: text(i.description, ''),
        category: text(i.category, 'Other'),
        weightKg: num(i.weightKg),
        volumeL: num(i.volumeL),
        icon: text(i.icon, '📦')
      };
      var d = dims(i.dimsCm);
      if (d) item.dimsCm = d;
      var carryOnOnly = typeof i.carryOnOnly === 'boolean' ? i.carryOnOnly : !!(seedItems[i.id] && seedItems[i.id].carryOnOnly);
      if (carryOnOnly) item.carryOnOnly = true;
      applyOwnedQty(item, i, raw.dataVersion >= 3, seedItems[i.id]);
      if (i.cube === true) {
        item.cube = true;
        item.capacityL = num(i.capacityL);
        item.ownedQty = 1;
        cubeIds[i.id] = true;
      }
      if (typeof i.photo === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(i.photo)) item.photo = i.photo;
      return item;
    });

    var bagIds = {};
    var bags = raw.bags.filter(function (b) { return b && validId(b.id, 'bag'); }).map(function (b) {
      bagIds[b.id] = true;
      return {
        id: b.id,
        name: text(b.name, 'Unnamed bag'),
        emptyWeightKg: num(b.emptyWeightKg),
        capacityL: num(b.capacityL),
        weightLimitKg: num(b.weightLimitKg),
        interiorCm: dims(b.interiorCm),
        isCarryOn: typeof b.isCarryOn === 'boolean' ? b.isCarryOn : !!(seedBags[b.id] && seedBags[b.id].isCarryOn)
      };
    });

    var trips = raw.trips.filter(function (t) { return t && validId(t.id, 'trip'); }).map(function (t) {
      var ids = (Array.isArray(t.bagIds) ? t.bagIds : []).filter(function (id) { return bagIds[id] === true; });
      var packed = {};
      ids.forEach(function (bagId) {
        var source = (t.packed && t.packed[bagId]) || {};
        packed[bagId] = {};
        Object.keys(source).forEach(function (itemId) {
          var qty = Math.floor(num(source[itemId]));
          if (itemIds[itemId] === true && qty > 0) packed[bagId][itemId] = qty;
        });
      });
      var cubes = {};
      Object.keys(cubeIds).forEach(function (cubeId) {
        var source = (t.cubes && t.cubes[cubeId]) || {};
        var contents = {};
        Object.keys(source).forEach(function (itemId) {
          var qty = Math.floor(num(source[itemId]));
          if (itemIds[itemId] === true && cubeIds[itemId] !== true && qty > 0) contents[itemId] = qty;
        });
        if (Object.keys(contents).length) cubes[cubeId] = contents;
      });
      return {
        id: t.id,
        name: text(t.name, 'Unnamed trip'),
        bagIds: ids,
        activeBagId: ids.indexOf(t.activeBagId) !== -1 ? t.activeBagId : ids[0] || null,
        activeCubeId: cubeIds[t.activeCubeId] === true ? t.activeCubeId : null,
        packed: packed,
        cubes: cubes,
        itinerary: cleanItinerary(t.itinerary, itemIds, cubeIds)
      };
    });
    if (!trips.length) trips.push(blankTrip('My trip', bags));

    var tripExists = trips.some(function (t) { return t.id === raw.activeTripId; });
    return {
      items: items,
      bags: bags,
      trips: trips,
      activeTripId: tripExists ? raw.activeTripId : trips[0].id,
      theme: Seed.THEMES.indexOf(raw.theme) !== -1 ? raw.theme : 'auto',
      view: raw.view === 'plan' ? 'plan' : 'pack',
      dataVersion: Seed.DATA_VERSION
    };
  }

  // Older data kept quantities as a "You have 3" note in the description, so
  // that note becomes the number and is removed from the text.
  function applyOwnedQty(item, source, isCurrent, seedItem) {
    var note = isCurrent ? null : item.description.match(/\.?\s*You have (\d+)[^.]*$/);
    if (note) item.description = item.description.slice(0, note.index);
    var fallback = note ? Number(note[1]) : (seedItem && seedItem.ownedQty) || 1;
    var qty = Math.floor(num(source.ownedQty));
    item.ownedQty = qty >= 1 ? qty : Math.max(1, fallback);
  }

  // Applies updated starter records to older data. Photos the user added are kept.
  function withUpdatedItems(items, seedItems, fromVersion) {
    var result = fromVersion >= 6 ? items.slice() : items.filter(function (i) {
      return !i || Seed.REMOVED_IN_V6.indexOf(i.id) === -1;
    });
    Seed.ITEM_UPDATES.forEach(function (update) {
      if (update.version <= fromVersion) return;
      update.keys.forEach(function (key) {
        var updated = clone(seedItems['item-' + key]);
        var existing = find(result, updated.id);
        if (existing && update.fields) {
          // A partial update changes only the named fields.
          var merged = clone(existing);
          update.fields.forEach(function (field) { merged[field] = updated[field]; });
          updated = merged;
        } else if (existing && existing.photo) {
          updated.photo = existing.photo;
        }
        upsert(result, updated);
      });
    });
    return result;
  }

  var DATE = /^\d{4}-\d{2}-\d{2}$/;
  var DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

  function shortText(value, max) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
  }

  // Only real calendar dates, so 2026-13-01 or 2026-02-30 are dropped.
  function matching(value, pattern) {
    return typeof value === 'string' && pattern.test(value) && Calc.isDate(value.slice(0, 10)) ? value : '';
  }

  function blankFlight() {
    return { flight: '', from: '', to: '', departs: '', arrives: '', ref: '' };
  }

  function cleanFlight(raw) {
    var f = raw || {};
    return {
      flight: shortText(f.flight, 40),
      from: shortText(f.from, 40),
      to: shortText(f.to, 40),
      departs: matching(f.departs, DATE_TIME),
      arrives: matching(f.arrives, DATE_TIME),
      ref: shortText(f.ref, 30)
    };
  }

  function blankItinerary() {
    return { departDate: '', returnDate: '', outbound: blankFlight(), inbound: blankFlight(), days: {} };
  }

  // Days are kept by date, so changing the trip dates hides a day's plan rather than losing it.
  function cleanItinerary(raw, itemIds, cubeIds) {
    var it = raw || {};
    var days = {};
    Object.keys(it.days || {}).forEach(function (date) {
      if (!DATE.test(date)) return;
      var source = it.days[date] || {};
      var seen = {};
      var outfit = (Array.isArray(source.outfit) ? source.outfit : []).filter(function (entry) {
        var ok = entry && itemIds[entry.itemId] === true && cubeIds[entry.itemId] !== true && !seen[entry.itemId];
        if (ok) seen[entry.itemId] = true;
        return ok;
      }).map(function (entry) {
        return { itemId: entry.itemId, rewear: entry.rewear === true };
      });
      var place = shortText(source.place, 80);
      var laundry = source.laundry ? {
        except: (Array.isArray(source.laundry.except) ? source.laundry.except : []).filter(function (id, i, all) {
          return itemIds[id] === true && all.indexOf(id) === i;
        })
      } : null;
      if (place || outfit.length || laundry) days[date] = { place: place, outfit: outfit, laundry: laundry };
    });
    return {
      departDate: matching(it.departDate, DATE),
      returnDate: matching(it.returnDate, DATE),
      outbound: cleanFlight(it.outbound),
      inbound: cleanFlight(it.inbound),
      days: days
    };
  }

  function blankTrip(name, bags) {
    var first = bags[0] ? bags[0].id : null;
    var packed = {};
    if (first) packed[first] = {};
    return {
      id: newId('trip'),
      name: name,
      bagIds: first ? [first] : [],
      activeBagId: first,
      activeCubeId: null,
      packed: packed,
      cubes: {},
      itinerary: blankItinerary()
    };
  }

  function load() {
    var saved = null;
    try {
      saved = localStorage.getItem(KEY);
      state = normalize(saved ? JSON.parse(saved) : Seed.state());
    } catch (err) {
      // Keep the unreadable copy in case it can be recovered by hand.
      try { if (saved) localStorage.setItem(KEY + '-unreadable', saved); } catch (e) { /* storage unavailable */ }
      state = normalize(Seed.state());
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      onSaveError(err);
    }
  }

  function commit() {
    save();
    listeners.forEach(function (fn) { fn(); });
  }

  function byId(list) {
    var map = {};
    list.forEach(function (x) { map[x.id] = x; });
    return map;
  }

  function find(list, id) {
    return list.filter(function (x) { return x.id === id; })[0] || null;
  }

  function trip() {
    return find(state.trips, state.activeTripId);
  }

  function bag() {
    var t = trip();
    return t.activeBagId ? find(state.bags, t.activeBagId) : null;
  }

  function cube() {
    var t = trip();
    return t.activeCubeId ? find(state.items, t.activeCubeId) : null;
  }

  // Whatever is open for packing: a cube presented in the shape of a bag, or the bag itself.
  function container() {
    var c = cube();
    if (!c) return bag();
    return {
      noun: 'cube',
      name: c.name,
      emptyWeightKg: c.weightKg,
      capacityL: c.capacityL,
      weightLimitKg: Infinity,
      interiorCm: c.dimsCm || null,
      isCarryOn: true
    };
  }

  function packedInBag() {
    var t = trip();
    if (t.activeCubeId) return t.cubes[t.activeCubeId] || {};
    return (t.activeBagId && t.packed[t.activeBagId]) || {};
  }

  function upsert(list, record) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === record.id) {
        list[i] = record;
        return;
      }
    }
    list.push(record);
  }

  function sumValues(map) {
    return Object.keys(map || {}).reduce(function (sum, key) { return sum + map[key]; }, 0);
  }

  return {
    load: load,
    get state() { return state; },
    subscribe: function (fn) { listeners.push(fn); },
    setSaveErrorHandler: function (fn) { onSaveError = fn; },
    trip: trip,
    bag: bag,
    cube: cube,
    container: container,
    packedInBag: packedInBag,
    itemsById: function () { return byId(state.items); },
    bagsById: function () { return byId(state.bags); },

    // Packing
    pack: function (itemId) {
      var t = trip();
      var item = byId(state.items)[itemId];
      var packed;
      if (t.activeCubeId) {
        if (item && (item.cube === true || item.carryOnOnly === true)) return false;
        packed = t.cubes[t.activeCubeId] || (t.cubes[t.activeCubeId] = {});
      } else {
        if (!t.activeBagId) return false;
        if (item && Calc.carryOnBlocked(item, bag())) return false;
        packed = t.packed[t.activeBagId] || (t.packed[t.activeBagId] = {});
      }
      if (item && Calc.remaining(item, t) === 0) return false;
      packed[itemId] = (packed[itemId] || 0) + 1;
      commit();
      return true;
    },
    // With cubeId, takes one out of that cube rather than what is open.
    unpack: function (itemId, cubeId) {
      var packed = cubeId ? trip().cubes[cubeId] || {} : packedInBag();
      if (!packed[itemId]) return;
      packed[itemId] -= 1;
      if (packed[itemId] <= 0) delete packed[itemId];
      commit();
    },

    // Items
    newItemId: function () { return newId('item'); },
    // A new item goes straight after afterId when given, otherwise at the end.
    saveItem: function (item, afterId) {
      var after = afterId ? state.items.indexOf(find(state.items, afterId)) : -1;
      if (after !== -1) state.items.splice(after + 1, 0, item);
      else upsert(state.items, item);
      commit();
    },
    itemPackedCount: function (itemId) {
      var total = 0;
      state.trips.forEach(function (t) {
        Object.keys(t.packed).forEach(function (bagId) { total += t.packed[bagId][itemId] || 0; });
        Object.keys(t.cubes).forEach(function (cubeId) { total += t.cubes[cubeId][itemId] || 0; });
      });
      return total;
    },
    deleteItem: function (itemId) {
      state.items = state.items.filter(function (i) { return i.id !== itemId; });
      state.trips.forEach(function (t) {
        Object.keys(t.packed).forEach(function (bagId) { delete t.packed[bagId][itemId]; });
        Object.keys(t.cubes).forEach(function (cubeId) { delete t.cubes[cubeId][itemId]; });
        delete t.cubes[itemId];
        if (t.activeCubeId === itemId) t.activeCubeId = null;
        Object.keys(t.itinerary.days).forEach(function (date) {
          var day = t.itinerary.days[date];
          day.outfit = day.outfit.filter(function (entry) { return entry.itemId !== itemId; });
          if (day.laundry) day.laundry.except = day.laundry.except.filter(function (id) { return id !== itemId; });
        });
      });
      commit();
    },

    // Bags
    newBagId: function () { return newId('bag'); },
    saveBag: function (record, addToTrip) {
      upsert(state.bags, record);
      if (addToTrip) {
        var t = trip();
        if (t.bagIds.indexOf(record.id) === -1) t.bagIds.push(record.id);
        t.packed[record.id] = t.packed[record.id] || {};
        t.activeBagId = record.id;
        t.activeCubeId = null;
      }
      commit();
    },
    setActiveBag: function (bagId) {
      var t = trip();
      t.activeBagId = bagId;
      t.activeCubeId = null;
      commit();
    },
    setActiveCube: function (cubeId) {
      trip().activeCubeId = cubeId;
      commit();
    },
    addBagToTrip: function (bagId) {
      var t = trip();
      if (t.bagIds.indexOf(bagId) === -1) t.bagIds.push(bagId);
      t.packed[bagId] = t.packed[bagId] || {};
      t.activeBagId = bagId;
      t.activeCubeId = null;
      commit();
    },
    bagItemCountInTrip: function (bagId) {
      return sumValues(trip().packed[bagId]);
    },
    bagItemCountAllTrips: function (bagId) {
      return state.trips.reduce(function (sum, t) { return sum + sumValues(t.packed[bagId]); }, 0);
    },
    removeBagFromTrip: function (bagId) {
      removeFromTrip(trip(), bagId);
      commit();
    },
    deleteBag: function (bagId) {
      state.bags = state.bags.filter(function (b) { return b.id !== bagId; });
      state.trips.forEach(function (t) { removeFromTrip(t, bagId); });
      commit();
    },

    // Trips
    setActiveTrip: function (tripId) {
      state.activeTripId = tripId;
      commit();
    },
    createTrip: function (name) {
      var t = blankTrip(name, state.bags);
      state.trips.push(t);
      state.activeTripId = t.id;
      commit();
    },
    renameTrip: function (name) {
      trip().name = name;
      commit();
    },
    duplicateTrip: function (name) {
      var copy = clone(trip());
      copy.id = newId('trip');
      copy.name = name;
      state.trips.push(copy);
      state.activeTripId = copy.id;
      commit();
    },
    deleteTrip: function () {
      if (state.trips.length < 2) return;
      state.trips = state.trips.filter(function (t) { return t.id !== state.activeTripId; });
      state.activeTripId = state.trips[0].id;
      commit();
    },

    setTheme: function (theme) {
      state.theme = theme;
      commit();
    },
    setView: function (view) {
      state.view = view;
      commit();
    },

    // Itinerary
    setTripDates: function (departDate, returnDate) {
      var it = trip().itinerary;
      it.departDate = matching(departDate, DATE);
      it.returnDate = matching(returnDate, DATE);
      commit();
    },
    setFlight: function (which, field, value) {
      var flight = trip().itinerary[which];
      if (!flight || !(field in flight)) return;
      flight[field] = cleanFlight(Object.assign({}, flight, { [field]: value }))[field];
      commit();
    },
    setDayPlace: function (date, place) {
      planDay(date).place = shortText(place, 80);
      commit();
    },
    addToOutfit: function (date, itemId) {
      var item = byId(state.items)[itemId];
      var day = planDay(date);
      if (!item || item.cube === true || !DATE.test(date)) return false;
      if (day.outfit.some(function (entry) { return entry.itemId === itemId; })) return false;
      day.outfit.push({ itemId: itemId, rewear: false });
      commit();
      return true;
    },
    removeFromOutfit: function (date, itemId) {
      var day = planDay(date);
      day.outfit = day.outfit.filter(function (entry) { return entry.itemId !== itemId; });
      commit();
    },
    toggleLaundry: function (date) {
      var day = planDay(date);
      day.laundry = day.laundry ? null : { except: [] };
      commit();
    },
    // Whether an item goes in that day's wash. Everything dirty is washed unless left out.
    toggleWashItem: function (date, itemId) {
      var day = planDay(date);
      if (!day.laundry) return;
      var except = day.laundry.except;
      var at = except.indexOf(itemId);
      if (at === -1) except.push(itemId);
      else except.splice(at, 1);
      commit();
    },
    toggleRewear: function (date, itemId) {
      planDay(date).outfit.forEach(function (entry) {
        if (entry.itemId === itemId) entry.rewear = !entry.rewear;
      });
      commit();
    },

    // Backups
    exportJSON: function () {
      return JSON.stringify(state, null, 2);
    },
    importJSON: function (json) {
      state = normalize(JSON.parse(json));
      commit();
    }
  };

  function planDay(date) {
    var days = trip().itinerary.days;
    return days[date] || (days[date] = { place: '', outfit: [], laundry: null });
  }

  function removeFromTrip(t, bagId) {
    t.bagIds = t.bagIds.filter(function (id) { return id !== bagId; });
    delete t.packed[bagId];
    if (t.activeBagId === bagId) t.activeBagId = t.bagIds[0] || null;
  }
})();
