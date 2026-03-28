// Polyfill Float16Array if missing
(function () {
    if (typeof globalThis.Float16Array !== "undefined") {
        return; // Already supported
    }

    function float16ToFloat32Bits(h) {
        const s = (h & 0x8000) >> 15;
        const e = (h & 0x7C00) >> 10;
        const f = h & 0x03FF;

        if (e === 0) {
            if (f === 0) {
                // +-0
                return s ? -0 : 0;
            }
            // subnormal
            return (s ? -1 : 1) * Math.pow(2, -14) * (f / 1024);
        }
        if (e === 0x1F) {
            if (f === 0) { return s ? -Infinity : Infinity; }
            return NaN;
        }
        // normal
        return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024);
    }

    function float32ToFloat16Bits(val) {
        if (isNaN(val)) { return 0x7E00; }
        if (!isFinite(val)) { return val < 0 ? 0xFC00 : 0x7C00; }

        const s = val < 0 ? 1 : 0;
        val = Math.abs(val);

        if (val === 0) { return s << 15; }

        let e = Math.floor(Math.log2(val));
        let f = val / Math.pow(2, e) - 1;

        e += 15;

        if (e <= 0) {
            // subnormal
            return (s << 15) | Math.round(val / Math.pow(2, -24));
        }
        if (e >= 0x1F) {
            // overflow -> Inf
            return (s << 15) | 0x7C00;
        }

        return (s << 15) | (e << 10) | Math.round(f * 1024);
    }

    class Float16Array {
        static BYTES_PER_ELEMENT = 2;

        constructor(arg) {
            if (typeof arg === "number") {
                this.buffer = new ArrayBuffer(arg * 2);
                this._u16 = new Uint16Array(this.buffer);
            } else if (ArrayBuffer.isView(arg) || arg instanceof ArrayBuffer) {
                this.buffer = arg.buffer || arg;
                this._u16 = new Uint16Array(this.buffer, arg.byteOffset || 0, arg.length || (this.buffer.byteLength / 2));
            } else if (Array.isArray(arg)) {
                this.buffer = new ArrayBuffer(arg.length * 2);
                this._u16 = new Uint16Array(this.buffer);
                arg.forEach((v, i) => this[i] = v);
            } else {
                throw new TypeError("Unsupported constructor argument");
            }
            this.length = this._u16.length;
        }

        get [Symbol.toStringTag]() { return "Float16Array"; }

        get byteLength() { return this._u16.byteLength; }
        get byteOffset() { return this._u16.byteOffset; }

        // Accessors
        get(index) {
            return float16ToFloat32Bits(this._u16[index]);
        }

        set(index, value) {
            this._u16[index] = float32ToFloat16Bits(value);
        }

        // Make it indexable like a TypedArray
        [Symbol.iterator]() {
            let i = 0;
            return {
                next: () => {
                    if (i < this.length) {
                        return { value: this.get(i++), done: false };
                    }
                    return { done: true };
                }
            };
        }
    }

    window.Float16Array = Float16Array;
})();

const vscode = acquireVsCodeApi();

let selectedDatatype = 'uint';
let selectedTypeSize = 1;
let requestID = 0;

document.querySelectorAll('.datatype').forEach(button => {
    button.addEventListener('click', () => {
        document.querySelectorAll('.datatype').forEach(btn => btn.classList.remove('selected'));
        button.classList.add('selected');

        selectedDatatype = button.getAttribute('data-type');
        selectedTypeSize = parseInt(button.getAttribute('data-size'), 10);

        if (document.getElementById('live').checked)
            fetchImage();
    });
});

function fetchImage() {
    vscode.postMessage({
        command: 'fetch',
        pointerExpr: document.getElementById('ptr').value,
        widthExpr: document.getElementById('width').value,
        heightExpr: document.getElementById('height').value,
        channels: document.getElementById('channels').value,
        datatype: selectedDatatype,
        typeSize: selectedTypeSize,
        requestID: requestID++,
    });
}

function clear() {
    const canvas = document.getElementById("canvas");
    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function parseBuffer(buffer, datatype, typeSize) {
    switch (datatype) {
        case 'uint':
            return typeSize === 1 ? new Uint8Array(buffer) :
                typeSize === 2 ? new Uint16Array(buffer) :
                    typeSize === 4 ? new Uint32Array(buffer) :
                        typeSize === 8 ? new BigUint64Array(buffer) :
                            new Uint8Array(buffer);
        case 'int':
            return typeSize === 1 ? new Int8Array(buffer) :
                typeSize === 2 ? new Int16Array(buffer) :
                    typeSize === 4 ? new Int32Array(buffer) :
                        typeSize === 8 ? new BigInt64Array(buffer) :
                            new Int8Array(buffer);
        case 'float':
            return typeSize === 2 ? new Float16Array(buffer) :
                typeSize === 4 ? new Float32Array(buffer) :
                    typeSize === 8 ? new Float64Array(buffer) :
                        new Float32Array(buffer);
        default:
            return new Uint8Array(buffer);
    }
}

function normalizeValue(v, datatype, typeSize, maxV, minV) {
    switch (datatype) {
        case 'uint':
            if (typeSize === 1) { return v; }
            if (typeSize === 2) {
                const max = 65535;
                return (v / max) * 255;
            }
            break;
        case 'int':
            if (typeSize === 1) {
                return (v + 128) / (255) * 255;
            }
            if (typeSize === 2) {
                return (v + 32768) / (32768 + 32767) * 255;
            }
            if (typeSize === 4) {
                return (v + 2147483648) / (2147483648 + 2147483647) * 255;
            }
            break;
        case 'float':
            maxV -= minV;
            v = ((v - minV) / maxV) * 255;
            return Math.round(v);
        default:
            break;
    }
}

function computeMinMax(arr) {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < arr.length; i++) {
        const v = arr[i];
        if (!Number.isFinite(v)) { continue; } // skip NaN/Inf
        if (v < min) { min = v; }
        if (v > max) { max = v; }
    }
    if (min === Infinity) { min = 0; }
    if (max === -Infinity) { max = 1; }
    return { min, max };
}

let canvasData = null;
let canvas = document.getElementById('canvas');
let ctx = canvas.getContext('2d');

function draw(msg) {
    const { width, height, memory, channels, datatype, typeSize, startRow } = msg;

    if (startRow === 0 || !canvasData) {
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = width;
        canvas.height = height;
        canvasData = ctx.createImageData(width, height);
        buf32 = new Uint32Array(canvasData.data.buffer);
    }

    const typedBuffer = parseBuffer(memory, datatype, typeSize);
    const { min, max } = computeMinMax(typedBuffer);

    const totalPixelsInChunk = typedBuffer.length / channels;
    const startPixelIndex = startRow * width;

    for (let p = 0; p < totalPixelsInChunk; p++) {
        const bIdx = p * channels;
        const canvasIdx = startPixelIndex + p;

        switch (channels) {
            case 4: {
                const r = normalizeValue(typedBuffer[bIdx + 0], datatype, typeSize, max, min);
                const g = normalizeValue(typedBuffer[bIdx + 1], datatype, typeSize, max, min);
                const b = normalizeValue(typedBuffer[bIdx + 2], datatype, typeSize, max, min);
                const a = normalizeValue(typedBuffer[bIdx + 3], datatype, typeSize, max, min);
                buf32[canvasIdx] = (a << 24) | (b << 16) | (g << 8) | r;
            }
                break;
            case 3: {
                const r = normalizeValue(typedBuffer[bIdx + 0], datatype, typeSize, max, min);
                const g = normalizeValue(typedBuffer[bIdx + 1], datatype, typeSize, max, min);
                const b = normalizeValue(typedBuffer[bIdx + 2], datatype, typeSize, max, min);
                buf32[canvasIdx] = (255 << 24) | (b << 16) | (g << 8) | r;
            }
                break;
            case 2: {
                const g = normalizeValue(typedBuffer[bIdx + 0], datatype, typeSize, max, min);
                const a = normalizeValue(typedBuffer[bIdx + 1], datatype, typeSize, max, min);
                buf32[canvasIdx] = (a << 24) | (g << 16) | (g << 8) | g;
            }
                break;
            case 1: {
                const g = normalizeValue(typedBuffer[bIdx + 0], datatype, typeSize, max, min);
                buf32[canvasIdx] = (255 << 24) | (g << 16) | (g << 8) | g;
            }
                break;
        }
    }

    ctx.putImageData(canvasData, 0, 0);

    const rowsInChunk = (memory.byteLength / typeSize) / (width * channels);
    return Math.min(100, Math.round(((startRow + rowsInChunk) / height) * 100));
}

function copyToClipboard() {
    const canvas = document.getElementById('canvas');
    canvas.toBlob(blob => {
        navigator.clipboard.write([
            new ClipboardItem({ [blob.type]: blob })
        ]).catch(err => alert("Copy failed: " + err));
    }, 'image/png');
}

function saveImage(format) {
    const canvas = document.getElementById('canvas');
    const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
    canvas.toBlob(blob => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `memscope-output.${format}`;
        link.click();
    }, mime);
}

window.addEventListener('message', event => {
    const msg = event.data;
    const statusBox = document.getElementById("status-box");
    if (msg.requestID !== undefined && msg.requestID !== requestID - 1) {
        return;
    }
    switch (msg.command) {
        case 'render':
            const progress = draw(msg);

            if (progress >= 100) {
                statusBox.innerText = "Done (100%)";
                statusBox.style.color = "green";
            } else {
                statusBox.innerText = `Loading: ${progress}%`;
                statusBox.style.color = "blue";
            }
            break;
        case 'error':
            statusBox.innerText = `Error: ${msg.message}`;
            statusBox.style.color = "red";
            clear();
            break;
        case 'status':
            statusBox.innerText = msg.message;
            statusBox.style.color = "blue";
            break;
        default:
            statusBox.innerText = "";
    }
});

['ptr', 'width', 'height', 'channels'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
        if (document.getElementById('live').checked) { fetchImage(); }
    });
});