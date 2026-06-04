import { app } from "../../scripts/app.js";

const NODE_NAME = "VisualImageCrop";
const PREVIEW_HEIGHT = 286;
const LABEL_HEIGHT = 24;
const HANDLE = 8;
const RATIOS = {
  "1:1": 1,
  "4:3": 4 / 3,
  "3:4": 3 / 4,
  "3:2": 3 / 2,
  "2:3": 2 / 3,
  "16:9": 16 / 9,
  "9:16": 9 / 16,
  "21:9": 21 / 9,
};

function widget(node, name) {
  return node.widgets?.find((w) => w.name === name);
}

function widgetValue(node, name, fallback = 0) {
  const w = widget(node, name);
  return w ? w.value : fallback;
}

function setWidgetValue(node, name, value) {
  const w = widget(node, name);
  if (!w) return;
  if (name === "width" || name === "height") {
    value = Math.max(1, Math.round(value));
  }
  w.value = value;
  w.callback?.(value);
}

function selectedImageUrl(node) {
  const image = widgetValue(node, "image", "");
  if (!image) return null;
  const [filename, subfolder, type] = String(image).split("[");
  const params = new URLSearchParams();
  params.set("filename", filename.trim());
  params.set("type", type ? type.replace("]", "").trim() : "input");
  if (subfolder) params.set("subfolder", subfolder.replace("]", "").trim());
  params.set("rand", node._cropGui?.imageCacheBust ?? 0);
  return `/view?${params.toString()}`;
}

function markDirty(node) {
  node.setDirtyCanvas?.(true, true);
  node.graph?.setDirtyCanvas?.(true, true);
}

function getImage(node) {
  const url = selectedImageUrl(node);
  if (!url) return null;

  node._cropGui ??= {};
  if (node._cropGui.url !== url) {
    const img = new Image();
    img.onload = () => {
      node._cropGui.naturalWidth = img.naturalWidth;
      node._cropGui.naturalHeight = img.naturalHeight;
      const crop = currentCrop(node);
      if (!node._cropGui.hasLoadedImage && crop.x === 0 && crop.y === 0 && crop.w === 1 && crop.h === 1) {
        resetCrop(node);
      }
      node._cropGui.hasLoadedImage = true;
      markDirty(node);
    };
    img.src = url;
    node._cropGui.url = url;
    node._cropGui.img = img;
  }

  return node._cropGui.img;
}

function imageSize(node) {
  const img = getImage(node);
  const fallbackW = Math.max(1, widgetValue(node, "width", 512) || 512);
  const fallbackH = Math.max(1, widgetValue(node, "height", 512) || 512);
  return {
    w: img?.naturalWidth || node._cropGui?.naturalWidth || fallbackW,
    h: img?.naturalHeight || node._cropGui?.naturalHeight || fallbackH,
  };
}

function clampCrop(node, crop) {
  const size = imageSize(node);
  crop.w = Math.max(1, Math.min(Math.round(crop.w), size.w));
  crop.h = Math.max(1, Math.min(Math.round(crop.h), size.h));
  crop.x = Math.max(0, Math.min(Math.round(crop.x), size.w - crop.w));
  crop.y = Math.max(0, Math.min(Math.round(crop.y), size.h - crop.h));
  return crop;
}

function applyCrop(node, crop) {
  crop = clampCrop(node, crop);
  setWidgetValue(node, "x", crop.x);
  setWidgetValue(node, "y", crop.y);
  setWidgetValue(node, "width", crop.w);
  setWidgetValue(node, "height", crop.h);
  markDirty(node);
}

function currentCrop(node) {
  return clampCrop(node, {
    x: widgetValue(node, "x", 0),
    y: widgetValue(node, "y", 0),
    w: widgetValue(node, "width", 0),
    h: widgetValue(node, "height", 0),
  });
}

function resetCrop(node) {
  const size = imageSize(node);
  applyCrop(node, { x: 0, y: 0, w: size.w, h: size.h });
}

function selectedRatio(node) {
  const lock = !!widgetValue(node, "aspect_lock", false);
  const ratio = widgetValue(node, "aspect_ratio", "free");
  return lock && ratio !== "free" ? RATIOS[ratio] : null;
}

function centerCrop(node) {
  const size = imageSize(node);
  const crop = currentCrop(node);
  applyCrop(node, {
    x: Math.round((size.w - crop.w) / 2),
    y: Math.round((size.h - crop.h) / 2),
    w: crop.w,
    h: crop.h,
  });
}

function fitAspect(node) {
  const ratio = selectedRatio(node);
  if (!ratio) return resetCrop(node);

  const size = imageSize(node);
  let w = size.w;
  let h = Math.round(w / ratio);
  if (h > size.h) {
    h = size.h;
    w = Math.round(h * ratio);
  }

  applyCrop(node, {
    x: Math.round((size.w - w) / 2),
    y: Math.round((size.h - h) / 2),
    w,
    h,
  });
}

function displayRect(node, widgetWidth, widgetY) {
  const size = imageSize(node);
  const margin = 12;
  const maxW = widgetWidth - margin * 2;
  const maxH = PREVIEW_HEIGHT - margin * 2 - LABEL_HEIGHT;
  const scale = Math.min(maxW / size.w, maxH / size.h);
  const w = size.w * scale;
  const h = size.h * scale;
  return {
    x: margin + (maxW - w) / 2,
    y: widgetY + margin + (maxH - h) / 2,
    w,
    h,
    scale,
  };
}

function cropToScreen(node, area) {
  const crop = currentCrop(node);
  return {
    x: area.x + crop.x * area.scale,
    y: area.y + crop.y * area.scale,
    w: crop.w * area.scale,
    h: crop.h * area.scale,
  };
}

function hitTest(node, pos) {
  const state = node._cropGui;
  if (!state?.area) return null;
  const c = cropToScreen(node, state.area);
  const nearL = Math.abs(pos[0] - c.x) <= HANDLE;
  const nearR = Math.abs(pos[0] - (c.x + c.w)) <= HANDLE;
  const nearT = Math.abs(pos[1] - c.y) <= HANDLE;
  const nearB = Math.abs(pos[1] - (c.y + c.h)) <= HANDLE;
  const inside = pos[0] >= c.x && pos[0] <= c.x + c.w && pos[1] >= c.y && pos[1] <= c.y + c.h;

  if ((nearL || nearR) && (nearT || nearB)) {
    return `${nearT ? "n" : "s"}${nearL ? "w" : "e"}`;
  }
  if (nearL && inside) return "w";
  if (nearR && inside) return "e";
  if (nearT && inside) return "n";
  if (nearB && inside) return "s";
  if (inside) return "move";
  return null;
}

function dragCrop(node, pos) {
  const state = node._cropGui;
  const size = imageSize(node);
  const scale = state.area.scale || 1;
  const dx = (pos[0] - state.drag.start[0]) / scale;
  const dy = (pos[1] - state.drag.start[1]) / scale;
  const mode = state.drag.mode;
  let crop = { ...state.drag.crop };

  if (mode === "move") {
    crop.x += dx;
    crop.y += dy;
  } else {
    if (mode.includes("w")) {
      crop.x += dx;
      crop.w -= dx;
    }
    if (mode.includes("e")) crop.w += dx;
    if (mode.includes("n")) {
      crop.y += dy;
      crop.h -= dy;
    }
    if (mode.includes("s")) crop.h += dy;

    const ratio = selectedRatio(node);
    if (ratio && crop.w > 1 && crop.h > 1) {
      if (mode.includes("n") || mode.includes("s")) {
        const oldW = crop.w;
        crop.w = crop.h * ratio;
        if (mode.includes("w")) crop.x += oldW - crop.w;
      } else {
        const oldH = crop.h;
        crop.h = crop.w / ratio;
        if (mode.includes("n")) crop.y += oldH - crop.h;
      }
    }
  }

  crop.w = Math.min(crop.w, size.w);
  crop.h = Math.min(crop.h, size.h);
  applyCrop(node, crop);
}

function canvasScale() {
  return app.canvas?.ds?.scale || app.canvas?.ds?._scale || 1;
}

function dragCropByClientDelta(node, event) {
  const state = node._cropGui;
  if (!state?.drag) return;

  const scale = state.area?.scale || 1;
  const zoom = canvasScale();
  const dx = (event.clientX - state.drag.clientStart[0]) / zoom / scale;
  const dy = (event.clientY - state.drag.clientStart[1]) / zoom / scale;
  dragCropFromDelta(node, dx, dy);
}

function dragCropFromDelta(node, dx, dy) {
  const state = node._cropGui;
  const size = imageSize(node);
  const mode = state.drag.mode;
  let crop = { ...state.drag.crop };

  if (mode === "move") {
    crop.x += dx;
    crop.y += dy;
  } else {
    if (mode.includes("w")) {
      crop.x += dx;
      crop.w -= dx;
    }
    if (mode.includes("e")) crop.w += dx;
    if (mode.includes("n")) {
      crop.y += dy;
      crop.h -= dy;
    }
    if (mode.includes("s")) crop.h += dy;

    const ratio = selectedRatio(node);
    if (ratio && crop.w > 1 && crop.h > 1) {
      if (mode.includes("n") || mode.includes("s")) {
        const oldW = crop.w;
        crop.w = crop.h * ratio;
        if (mode.includes("w")) crop.x += oldW - crop.w;
      } else {
        const oldH = crop.h;
        crop.h = crop.w / ratio;
        if (mode.includes("n")) crop.y += oldH - crop.h;
      }
    }
  }

  crop.w = Math.min(crop.w, size.w);
  crop.h = Math.min(crop.h, size.h);
  applyCrop(node, crop);
}

function startDocumentDrag(node, event, pos, mode) {
  event?.preventDefault?.();
  event?.stopPropagation?.();

  node._cropGui.drag = {
    mode,
    start: [...pos],
    clientStart: [event.clientX, event.clientY],
    crop: currentCrop(node),
  };

  const onMove = (moveEvent) => {
    moveEvent.preventDefault();
    dragCropByClientDelta(node, moveEvent);
  };

  const onUp = (upEvent) => {
    upEvent.preventDefault();
    node._cropGui.drag = null;
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("mouseup", onUp, true);
    markDirty(node);
  };

  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("mouseup", onUp, true);
}

function addPreviewWidget(node) {
  const cropWidget = {
    type: "custom",
    name: "crop_preview",
    computeSize(width) {
      return [width, PREVIEW_HEIGHT];
    },
    computeLayoutSize() {
      return { minHeight: PREVIEW_HEIGHT, maxHeight: PREVIEW_HEIGHT };
    },
    mouse(event, pos, node) {
      if (event.type === "pointerdown" || event.type === "mousedown") {
        const mode = hitTest(node, pos);
        if (!mode) return false;
        node._cropGui.drag = { mode, start: [...pos], crop: currentCrop(node) };
        event.preventDefault?.();
        event.stopPropagation?.();
        return true;
      }

      if (event.type === "pointermove" || event.type === "mousemove") {
        if (!node._cropGui?.drag) return false;
        dragCrop(node, pos);
        event.preventDefault?.();
        return true;
      }

      if (event.type === "pointerup" || event.type === "mouseup" || event.type === "pointercancel") {
        if (!node._cropGui?.drag) return false;
        node._cropGui.drag = null;
        event.preventDefault?.();
        return true;
      }

      return false;
    },
    draw(ctx, node, widgetWidth, widgetY) {
      const img = getImage(node);
      const area = displayRect(node, widgetWidth, widgetY);
      node._cropGui ??= {};
      node._cropGui.area = area;

      ctx.save();
      ctx.fillStyle = LiteGraph.WIDGET_BGCOLOR;
      ctx.fillRect(12, widgetY + 8, widgetWidth - 24, PREVIEW_HEIGHT - 16);

      if (img?.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, area.x, area.y, area.w, area.h);
      } else {
        ctx.fillStyle = "#9aa0a6";
        ctx.textAlign = "center";
        ctx.fillText("Select or drop an image", widgetWidth / 2, widgetY + PREVIEW_HEIGHT / 2);
      }

      const c = cropToScreen(node, area);
      ctx.fillStyle = "rgba(0,0,0,0.42)";
      ctx.fillRect(area.x, area.y, area.w, c.y - area.y);
      ctx.fillRect(area.x, c.y + c.h, area.w, area.y + area.h - c.y - c.h);
      ctx.fillRect(area.x, c.y, c.x - area.x, c.h);
      ctx.fillRect(c.x + c.w, c.y, area.x + area.w - c.x - c.w, c.h);

      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.strokeRect(c.x, c.y, c.w, c.h);
      ctx.strokeStyle = "#1f9cf0";
      ctx.lineWidth = 1;
      ctx.strokeRect(c.x + 1, c.y + 1, Math.max(0, c.w - 2), Math.max(0, c.h - 2));

      ctx.fillStyle = "#ffffff";
      for (const [x, y] of [
        [c.x, c.y],
        [c.x + c.w, c.y],
        [c.x, c.y + c.h],
        [c.x + c.w, c.y + c.h],
      ]) {
        ctx.fillRect(x - HANDLE / 2, y - HANDLE / 2, HANDLE, HANDLE);
      }

      const crop = currentCrop(node);
      const label = `${crop.w} x ${crop.h} @ ${crop.x}, ${crop.y}`;
      const labelY = Math.min(widgetY + PREVIEW_HEIGHT - 10, area.y + area.h + 18);
      ctx.fillStyle = "rgba(20,24,30,0.82)";
      ctx.fillRect(area.x - 4, labelY - 15, Math.max(150, ctx.measureText(label).width + 8), 20);
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "left";
      ctx.fillText(label, area.x, labelY);

      ctx.restore();
    },
  };

  node.addCustomWidget(cropWidget);
}

function wireNode(node) {
  node.serialize_widgets = true;
  node._cropGui = {};
  addPreviewWidget(node);

  node.addWidget("button", "Reset crop", null, () => resetCrop(node));
  node.addWidget("button", "Center crop", null, () => centerCrop(node));
  node.addWidget("button", "Fit aspect", null, () => fitAspect(node));

  for (const name of ["width", "height"]) {
    const dimensionWidget = widget(node, name);
    if (!dimensionWidget) continue;
    dimensionWidget.options ??= {};
    dimensionWidget.options.min = 1;
    const original = dimensionWidget.callback;
    dimensionWidget.callback = function (value, ...args) {
      const clamped = Math.max(1, Math.round(Number(value) || 1));
      this.value = clamped;
      return original?.call(this, clamped, ...args);
    };
    if (dimensionWidget.value < 1) {
      dimensionWidget.value = 1;
    }
  }

  const imageWidget = widget(node, "image");
  if (imageWidget) {
    const original = imageWidget.callback;
    imageWidget.callback = function (value, ...args) {
      node._cropGui.imageCacheBust = Date.now();
      node._cropGui.url = null;
      node._cropGui.hasLoadedImage = false;
      const result = original?.call(this, value, ...args);
      markDirty(node);
      return result;
    };
  }

  const originalDown = node.onMouseDown;
  node.onMouseDown = function (event, pos, canvas) {
    const mode = hitTest(this, pos);
    if (mode) {
      startDocumentDrag(this, event, pos, mode);
      return true;
    }
    return originalDown?.apply(this, arguments);
  };

  const originalMove = node.onMouseMove;
  node.onMouseMove = function (event, pos, canvas) {
    if (this._cropGui?.drag) {
      const scale = this._cropGui.area?.scale || 1;
      const dx = (pos[0] - this._cropGui.drag.start[0]) / scale;
      const dy = (pos[1] - this._cropGui.drag.start[1]) / scale;
      dragCropFromDelta(this, dx, dy);
      return true;
    }
    return originalMove?.apply(this, arguments);
  };

  const originalUp = node.onMouseUp;
  node.onMouseUp = function () {
    if (this._cropGui?.drag) {
      this._cropGui.drag = null;
      return true;
    }
    return originalUp?.apply(this, arguments);
  };
}

app.registerExtension({
  name: "image_crop_gui.node",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_NAME) return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const result = onNodeCreated?.apply(this, arguments);
      wireNode(this);
      this.setSize([360, 520]);
      return result;
    };
  },
});
