(function () {
  "use strict";

  // Paste your Apps Script Web App URL here after deploying it (see SETUP.md, Part 4).
  var CONFIG = {
    API_URL: "PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE",
  };

  var els = {
    loading: document.getElementById("loading-state"),
    empty: document.getElementById("empty-state"),
    grid: document.getElementById("registry-grid"),
    claimedSection: document.getElementById("claimed-section"),
    claimedGrid: document.getElementById("claimed-grid"),
    categoryFilter: document.getElementById("category-filter"),
    sortSelect: document.getElementById("sort-select"),
    itemCount: document.getElementById("item-count"),
    toast: document.getElementById("toast"),

    confirmDialog: document.getElementById("confirm-dialog"),
    confirmText: document.getElementById("confirm-text"),
    confirmCancel: document.getElementById("confirm-cancel"),
    confirmOk: document.getElementById("confirm-ok"),

    codeDialog: document.getElementById("code-dialog"),
    claimCodeDisplay: document.getElementById("claim-code-display"),
    copyCodeBtn: document.getElementById("copy-code-btn"),
    codeDialogClose: document.getElementById("code-dialog-close"),

    undoDialog: document.getElementById("undo-dialog"),
    undoItemName: document.getElementById("undo-item-name"),
    undoCodeInput: document.getElementById("undo-code-input"),
    undoError: document.getElementById("undo-error"),
    undoCancel: document.getElementById("undo-cancel"),
    undoSubmit: document.getElementById("undo-submit"),
  };

  var state = {
    items: [],
    category: "all",
    sort: "default",
    pendingClaimId: null,
    pendingUndoId: null,
  };

  var priceFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });

  var toastTimer = null;

  init();

  function init() {
    els.categoryFilter.addEventListener("change", onCategoryChange);
    els.sortSelect.addEventListener("change", onSortChange);
    els.confirmCancel.addEventListener("click", function () {
      els.confirmDialog.close();
    });
    els.confirmOk.addEventListener("click", onConfirmClaim);
    els.codeDialogClose.addEventListener("click", function () {
      els.codeDialog.close();
    });
    els.copyCodeBtn.addEventListener("click", onCopyCode);
    els.undoCancel.addEventListener("click", closeUndoDialog);
    els.undoSubmit.addEventListener("click", onSubmitUndo);
    els.undoCodeInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") onSubmitUndo();
    });

    loadItems();
  }

  function loadItems() {
    showLoading();
    if (!CONFIG.API_URL || CONFIG.API_URL.indexOf("PASTE_YOUR") === 0) {
      showLoadError({ message: "missing_config" });
      return;
    }
    fetch(CONFIG.API_URL, { method: "GET" })
      .then(function (res) {
        if (!res.ok) throw new Error("http_error");
        return res.json();
      })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || "server_error");
        state.items = data.items || [];
        populateCategoryOptions();
        render();
      })
      .catch(function (err) {
        showLoadError(err);
      });
  }

  function showLoading() {
    els.loading.hidden = false;
    els.empty.hidden = true;
    els.grid.hidden = true;
    els.claimedSection.hidden = true;
  }

  function showLoadError(err) {
    els.loading.hidden = true;
    var message =
      err && err.message === "missing_config"
        ? "The registry isn't connected yet. (Missing API_URL in script.js.)"
        : "We couldn't load the registry right now. Please refresh to try again.";
    showToast(message, "error");
    els.empty.hidden = false;
    els.empty.textContent = message;
  }

  function populateCategoryOptions() {
    var seen = {};
    var categories = [];
    state.items.forEach(function (item) {
      if (item.category && !seen[item.category]) {
        seen[item.category] = true;
        categories.push(item.category);
      }
    });
    categories.sort();

    var current = els.categoryFilter.value || "all";
    els.categoryFilter.innerHTML = "";

    var allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "All categories";
    els.categoryFilter.appendChild(allOption);

    categories.forEach(function (cat) {
      var opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      els.categoryFilter.appendChild(opt);
    });

    els.categoryFilter.value =
      current === "all" || categories.indexOf(current) !== -1 ? current : "all";
    state.category = els.categoryFilter.value;
  }

  function onCategoryChange(e) {
    state.category = e.target.value;
    render();
  }

  function onSortChange(e) {
    state.sort = e.target.value;
    render();
  }

  function render() {
    els.loading.hidden = true;

    var filtered = state.items.filter(function (item) {
      return state.category === "all" ? true : item.category === state.category;
    });

    var unclaimed = filtered.filter(function (i) {
      return !i.claimed;
    });
    var claimed = filtered.filter(function (i) {
      return i.claimed;
    });

    sortItems(unclaimed);
    sortItems(claimed);

    els.grid.innerHTML = "";
    els.claimedGrid.innerHTML = "";

    if (unclaimed.length === 0) {
      els.grid.hidden = true;
      els.empty.hidden = false;
      els.empty.textContent = "No items match this filter yet.";
    } else {
      els.empty.hidden = true;
      els.grid.hidden = false;
      unclaimed.forEach(function (item) {
        els.grid.appendChild(buildCard(item, false));
      });
    }

    if (claimed.length > 0) {
      els.claimedSection.hidden = false;
      claimed.forEach(function (item) {
        els.claimedGrid.appendChild(buildCard(item, true));
      });
    } else {
      els.claimedSection.hidden = true;
    }

    var totalVisible = unclaimed.length + claimed.length;
    els.itemCount.textContent = totalVisible === 1 ? "1 item" : totalVisible + " items";
  }

  function sortItems(list) {
    if (state.sort === "price-asc") {
      list.sort(function (a, b) {
        return priceOrInfinity(a, Infinity) - priceOrInfinity(b, Infinity);
      });
    } else if (state.sort === "price-desc") {
      list.sort(function (a, b) {
        return priceOrInfinity(b, -Infinity) - priceOrInfinity(a, -Infinity);
      });
    }
  }

  function priceOrInfinity(item, fallback) {
    var p = numericPrice(item);
    return p === null ? fallback : p;
  }

  function numericPrice(item) {
    return typeof item.price === "number" && !isNaN(item.price) ? item.price : null;
  }

  function buildCard(item, claimed) {
    var card = document.createElement("article");
    card.className = "card" + (claimed ? " card-claimed" : "");

    if (item.image_url) {
      var imgWrap = document.createElement("div");
      imgWrap.className = "card-image-wrap";
      var img = document.createElement("img");
      img.src = item.image_url;
      img.alt = item.name || "Registry item";
      img.loading = "lazy";
      img.addEventListener("error", function () {
        imgWrap.hidden = true;
      });
      imgWrap.appendChild(img);
      card.appendChild(imgWrap);
    }

    var body = document.createElement("div");
    body.className = "card-body";

    if (claimed) {
      var badge = document.createElement("span");
      badge.className = "badge-claimed";
      badge.textContent = "Claimed";
      body.appendChild(badge);
    }

    if (item.category) {
      var cat = document.createElement("span");
      cat.className = "card-category";
      cat.textContent = item.category;
      body.appendChild(cat);
    }

    var name = document.createElement("h3");
    name.className = "card-name";
    name.textContent = item.name || "Untitled item";
    body.appendChild(name);

    if (item.note) {
      var note = document.createElement("p");
      note.className = "card-note";
      note.textContent = item.note;
      body.appendChild(note);
    }

    var price = numericPrice(item);
    if (price !== null) {
      var priceEl = document.createElement("p");
      priceEl.className = "card-price";
      priceEl.textContent = priceFormatter.format(price);
      body.appendChild(priceEl);
    }

    var actions = document.createElement("div");
    actions.className = "card-actions";

    if (item.link) {
      var link = document.createElement("a");
      link.href = item.link;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "btn btn-link";
      link.textContent = "View item";
      actions.appendChild(link);
    }

    if (claimed) {
      var undoBtn = document.createElement("button");
      undoBtn.type = "button";
      undoBtn.className = "btn btn-text";
      undoBtn.textContent = "Undo claim";
      undoBtn.addEventListener("click", function () {
        openUndoDialog(item);
      });
      actions.appendChild(undoBtn);
    } else {
      var claimBtn = document.createElement("button");
      claimBtn.type = "button";
      claimBtn.className = "btn btn-primary";
      claimBtn.textContent = "Mark as bought";
      claimBtn.addEventListener("click", function () {
        openConfirmDialog(item);
      });
      actions.appendChild(claimBtn);
    }

    body.appendChild(actions);
    card.appendChild(body);
    return card;
  }

  function openConfirmDialog(item) {
    state.pendingClaimId = item.id;
    els.confirmText.textContent =
      'Mark "' +
      item.name +
      '" as bought? Everyone visiting the registry will see it as claimed.';
    els.confirmOk.disabled = false;
    els.confirmOk.textContent = "Yes, I bought this";
    els.confirmDialog.showModal();
  }

  function onConfirmClaim() {
    var id = state.pendingClaimId;
    if (!id) return;
    els.confirmOk.disabled = true;
    els.confirmOk.textContent = "Saving…";

    postAction({ action: "claim", id: id })
      .then(function (data) {
        if (!data.ok) {
          if (data.error === "already_claimed") {
            showToast("Someone just claimed this item. Refreshing the list…", "error");
            els.confirmDialog.close();
            loadItems();
            return;
          }
          throw new Error(data.message || data.error || "claim_failed");
        }
        els.confirmDialog.close();
        var item = findItem(id);
        if (item) item.claimed = true;
        els.claimCodeDisplay.textContent = data.claim_code;
        els.codeDialog.showModal();
        render();
      })
      .catch(function () {
        showToast("Something went wrong claiming this item. Please try again.", "error");
        els.confirmDialog.close();
      })
      .then(function () {
        els.confirmOk.disabled = false;
        els.confirmOk.textContent = "Yes, I bought this";
        state.pendingClaimId = null;
      });
  }

  function onCopyCode() {
    var code = els.claimCodeDisplay.textContent;
    if (navigator.clipboard && code) {
      navigator.clipboard
        .writeText(code)
        .then(function () {
          showToast("Code copied to clipboard.", "success");
        })
        .catch(function () {});
    }
  }

  function openUndoDialog(item) {
    state.pendingUndoId = item.id;
    els.undoItemName.textContent = 'Undo your claim on "' + item.name + '".';
    els.undoCodeInput.value = "";
    els.undoError.hidden = true;
    els.undoDialog.showModal();
    els.undoCodeInput.focus();
  }

  function closeUndoDialog() {
    els.undoDialog.close();
    state.pendingUndoId = null;
  }

  function onSubmitUndo() {
    var id = state.pendingUndoId;
    var code = els.undoCodeInput.value.trim();
    if (!id || !code) {
      els.undoError.hidden = false;
      els.undoError.textContent = "Please enter your claim code.";
      return;
    }

    els.undoSubmit.disabled = true;
    els.undoSubmit.textContent = "Undoing…";

    postAction({ action: "unclaim", id: id, claim_code: code })
      .then(function (data) {
        if (!data.ok) {
          els.undoError.hidden = false;
          els.undoError.textContent =
            data.error === "invalid_code"
              ? "That claim code doesn't match. Please double-check and try again."
              : "Something went wrong. Please try again.";
          return;
        }
        var item = findItem(id);
        if (item) item.claimed = false;
        closeUndoDialog();
        showToast("Claim undone. The item is back on the registry.", "success");
        render();
      })
      .catch(function () {
        els.undoError.hidden = false;
        els.undoError.textContent = "Network error. Please try again.";
      })
      .then(function () {
        els.undoSubmit.disabled = false;
        els.undoSubmit.textContent = "Undo claim";
      });
  }

  function findItem(id) {
    for (var i = 0; i < state.items.length; i++) {
      if (state.items[i].id === id) return state.items[i];
    }
    return null;
  }

  function postAction(payload) {
    // Content-Type text/plain keeps this a CORS "simple request" so the
    // browser skips a preflight OPTIONS call, which Apps Script web apps
    // don't handle. doPost parses the JSON body manually regardless.
    return fetch(CONFIG.API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    }).then(function (res) {
      if (!res.ok) throw new Error("http_error");
      return res.json();
    });
  }

  function showToast(message, kind) {
    els.toast.textContent = message;
    els.toast.className = "toast toast-" + (kind || "info");
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      els.toast.hidden = true;
    }, 5000);
  }
})();
