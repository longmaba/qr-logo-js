const QRCodeGenerator = function (options) {
  // Defaults
  const defaultOptions = {
    value: "https://reactjs.org/",
    ecLevel: "M",
    enableCORS: false,
    size: 150,
    quietZone: 10,
    bgColor: "#FFFFFF",
    fgColor: "#000000",
    logoImage: "",
    logoWidth: 0,
    logoHeight: 0,
    logoOpacity: 1,
    logoOnLoad: null,
    removeQrCodeBehindLogo: false,
    logoPadding: 0,
    logoPaddingStyle: "square",
    eyeRadius: [0, 0, 0],
    eyeColor: null,
    qrStyle: "squares",
    style: null,
    id: null,
  };
  const _ = window._;
  const qrGenerator = window.qrcode;
  this.options = _.assign({}, defaultOptions, options);
  this.canvas = document.createElement("canvas");
  this.init();
};

QRCodeGenerator.prototype.init = function () {
  // Your initialization logic here
  this.update();
};

QRCodeGenerator.prototype.utf16to8 = function (str) {
  let out = "",
    i,
    c;
  const len = str.length;
  for (i = 0; i < len; i++) {
    c = str.charCodeAt(i);
    if (c >= 0x0001 && c <= 0x007f) {
      out += str.charAt(i);
    } else if (c > 0x07ff) {
      out += String.fromCharCode(0xe0 | ((c >> 12) & 0x0f));
      out += String.fromCharCode(0x80 | ((c >> 6) & 0x3f));
      out += String.fromCharCode(0x80 | ((c >> 0) & 0x3f));
    } else {
      out += String.fromCharCode(0xc0 | ((c >> 6) & 0x1f));
      out += String.fromCharCode(0x80 | ((c >> 0) & 0x3f));
    }
  }
  return out;
};

QRCodeGenerator.prototype.drawRoundedSquare = function (lineWidth, x, y, size, color, radii, fill, ctx) {
  ctx.lineWidth = lineWidth;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;

  // Adjust coordinates so that the outside of the stroke is aligned to the edges
  y += lineWidth / 2;
  x += lineWidth / 2;
  size -= lineWidth;

  if (!Array.isArray(radii)) {
    radii = [radii, radii, radii, radii];
  }

  // Radius should not be greater than half the size or less than zero
  radii = radii.map((r) => {
    r = Math.min(r, size / 2);
    return r < 0 ? 0 : r;
  });

  const rTopLeft = radii[0] || 0;
  const rTopRight = radii[1] || 0;
  const rBottomRight = radii[2] || 0;
  const rBottomLeft = radii[3] || 0;

  ctx.beginPath();

  ctx.moveTo(x + rTopLeft, y);

  ctx.lineTo(x + size - rTopRight, y);
  if (rTopRight) ctx.quadraticCurveTo(x + size, y, x + size, y + rTopRight);

  ctx.lineTo(x + size, y + size - rBottomRight);
  if (rBottomRight) ctx.quadraticCurveTo(x + size, y + size, x + size - rBottomRight, y + size);

  ctx.lineTo(x + rBottomLeft, y + size);
  if (rBottomLeft) ctx.quadraticCurveTo(x, y + size, x, y + size - rBottomLeft);

  ctx.lineTo(x, y + rTopLeft);
  if (rTopLeft) ctx.quadraticCurveTo(x, y, x + rTopLeft, y);

  ctx.closePath();

  ctx.stroke();
  if (fill) {
    ctx.fill();
  }
};

QRCodeGenerator.prototype.drawPositioningPattern = function (ctx, cellSize, offset, row, col, color, radii = [0, 0, 0, 0]) {
  const lineWidth = Math.ceil(cellSize);

  let radiiOuter;
  let radiiInner;
  if (typeof radii !== "number" && !Array.isArray(radii)) {
    radiiOuter = radii.outer || 0;
    radiiInner = radii.inner || 0;
  } else {
    radiiOuter = radii;
    radiiInner = radiiOuter;
  }

  let colorOuter;
  let colorInner;
  if (typeof color !== "string") {
    colorOuter = color.outer;
    colorInner = color.inner;
  } else {
    colorOuter = color;
    colorInner = color;
  }

  let y = row * cellSize + offset;
  let x = col * cellSize + offset;
  let size = cellSize * 7;

  // Outer box
  this.drawRoundedSquare(lineWidth, x, y, size, colorOuter, radiiOuter, false, ctx);

  // Inner box
  size = cellSize * 3;
  y += cellSize * 2;
  x += cellSize * 2;
  this.drawRoundedSquare(lineWidth, x, y, size, colorInner, radiiInner, true, ctx);
};

QRCodeGenerator.prototype.isInPositioninZone = function (col, row, zones) {
  return zones.some((zone) => row >= zone.row && row <= zone.row + 7 && col >= zone.col && col <= zone.col + 7);
};

QRCodeGenerator.prototype.transformPixelLengthIntoNumberOfCells = function (pixelLength, cellSize) {
  return pixelLength / cellSize;
};

QRCodeGenerator.prototype.isCoordinateInImage = function (col, row, dWidthLogo, dHeightLogo, dxLogo, dyLogo, cellSize, logoImage) {
  if (logoImage) {
    const numberOfCellsMargin = 2;
    const firstRowOfLogo = this.transformPixelLengthIntoNumberOfCells(dxLogo, cellSize);
    const firstColumnOfLogo = this.transformPixelLengthIntoNumberOfCells(dyLogo, cellSize);
    const logoWidthInCells = this.transformPixelLengthIntoNumberOfCells(dWidthLogo, cellSize) - 1;
    const logoHeightInCells = this.transformPixelLengthIntoNumberOfCells(dHeightLogo, cellSize) - 1;

    return (
      row >= firstRowOfLogo - numberOfCellsMargin &&
      row <= firstRowOfLogo + logoWidthInCells + numberOfCellsMargin && // check rows
      col >= firstColumnOfLogo - numberOfCellsMargin &&
      col <= firstColumnOfLogo + logoHeightInCells + numberOfCellsMargin
    ); // check cols
  } else {
    return false;
  }
};

QRCodeGenerator.prototype.update = function () {
  const {
    value,
    ecLevel,
    enableCORS,
    bgColor,
    fgColor,
    logoImage,
    logoOpacity,
    logoOnLoad,
    removeQrCodeBehindLogo,
    qrStyle,
    eyeRadius,
    eyeColor,
    logoPaddingStyle,
  } = this.options;

  // just make sure that these params are passed as numbers
  const size = +this.options.size;
  const quietZone = +this.options.quietZone;
  const logoWidth = this.options.logoWidth ? +this.options.logoWidth : 0;
  const logoHeight = this.options.logoHeight ? +this.options.logoHeight : 0;
  const logoPadding = this.options.logoPadding ? +this.options.logoPadding : 0;

  const qrCode = qrcode(0, ecLevel);
  qrCode.addData(this.utf16to8(value));
  qrCode.make();

  const canvas = this.canvas;
  const ctx = canvas.getContext("2d");

  const canvasSize = size + 2 * quietZone;
  const length = qrCode.getModuleCount();
  const cellSize = size / length;
  const scale = window.devicePixelRatio || 1;
  canvas.height = canvas.width = canvasSize * scale;
  ctx.scale(scale, scale);

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvasSize, canvasSize);

  const offset = quietZone;

  const positioningZones = [
    { row: 0, col: 0 },
    { row: 0, col: length - 7 },
    { row: length - 7, col: 0 },
  ];

  ctx.strokeStyle = fgColor;
  if (qrStyle === "dots") {
    ctx.fillStyle = fgColor;
    const radius = cellSize / 2;
    for (let row = 0; row < length; row++) {
      for (let col = 0; col < length; col++) {
        if (qrCode.isDark(row, col) && !this.isInPositioninZone(row, col, positioningZones)) {
          ctx.beginPath();
          ctx.arc(
            Math.round(col * cellSize) + radius + offset,
            Math.round(row * cellSize) + radius + offset,
            (radius / 100) * 75,
            0,
            2 * Math.PI,
            false
          );
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  } else {
    for (let row = 0; row < length; row++) {
      for (let col = 0; col < length; col++) {
        if (qrCode.isDark(row, col) && !this.isInPositioninZone(row, col, positioningZones)) {
          ctx.fillStyle = fgColor;
          const w = Math.ceil((col + 1) * cellSize) - Math.floor(col * cellSize);
          const h = Math.ceil((row + 1) * cellSize) - Math.floor(row * cellSize);
          ctx.fillRect(Math.round(col * cellSize) + offset, Math.round(row * cellSize) + offset, w, h);
        }
      }
    }
  }

  // Draw positioning patterns
  for (let i = 0; i < 3; i++) {
    const { row, col } = positioningZones[i];

    let radii = eyeRadius;
    let color;

    if (Array.isArray(radii)) {
      radii = radii[i];
    }
    if (typeof radii == "number") {
      radii = [radii, radii, radii, radii];
    }

    if (!eyeColor) {
      // if not specified, eye color is the same as foreground,
      color = fgColor;
    } else {
      if (Array.isArray(eyeColor)) {
        // if array, we pass the single color
        color = eyeColor[i];
      } else {
        color = eyeColor;
      }
    }

    this.drawPositioningPattern(ctx, cellSize, offset, row, col, color, radii);
  }

  if (logoImage) {
    const image = new Image();
    if (enableCORS) {
      image.crossOrigin = "Anonymous";
    }
    image.onload = () => {
      ctx.save();

      const dWidthLogo = logoWidth || size * 0.2;
      const dHeightLogo = logoHeight || dWidthLogo;
      const dxLogo = (size - dWidthLogo) / 2;
      const dyLogo = (size - dHeightLogo) / 2;

      if (removeQrCodeBehindLogo || logoPadding) {
        ctx.beginPath();

        ctx.strokeStyle = bgColor;
        ctx.fillStyle = bgColor;

        const dWidthLogoPadding = dWidthLogo + 2 * logoPadding;
        const dHeightLogoPadding = dHeightLogo + 2 * logoPadding;
        const dxLogoPadding = dxLogo + offset - logoPadding;
        const dyLogoPadding = dyLogo + offset - logoPadding;

        if (logoPaddingStyle === "circle") {
          const dxCenterLogoPadding = dxLogoPadding + dWidthLogoPadding / 2;
          const dyCenterLogoPadding = dyLogoPadding + dHeightLogoPadding / 2;
          ctx.ellipse(dxCenterLogoPadding, dyCenterLogoPadding, dWidthLogoPadding / 2, dHeightLogoPadding / 2, 0, 0, 2 * Math.PI);
          ctx.stroke();
          ctx.fill();
        } else {
          ctx.fillRect(dxLogoPadding, dyLogoPadding, dWidthLogoPadding, dHeightLogoPadding);
        }
      }

      ctx.globalAlpha = logoOpacity;
      ctx.drawImage(image, dxLogo + offset, dyLogo + offset, dWidthLogo, dHeightLogo);
      ctx.restore();
      if (logoOnLoad) {
        logoOnLoad();
      }
    };
    image.src = logoImage;
  }
};

window.QRCodeGenerator = QRCodeGenerator;
