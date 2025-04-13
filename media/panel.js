const vscode = acquireVsCodeApi();

function fetchImage() {
    vscode.postMessage({
        command: 'fetch',
        pointerExpr: document.getElementById('ptr').value,
        widthExpr: document.getElementById('width').value,
        heightExpr: document.getElementById('height').value,
        channels: document.getElementById('channels').value
    });
}

function clear() {
    const canvas = document.getElementById("canvas");
    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function draw(msg) {
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const { width, height, buffer, channels } = msg;

    canvas.width = width;
    canvas.height = height;

    canvas.style.width = width;
    canvas.style.height = 'auto';

    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    for (let i = 0, j = 0; i < width * height; i++, j += channels) {
        const r = buffer[j] || 0;
        const g = buffer[j + 1] || r;
        const b = buffer[j + 2] || r;
        data[i * 4 + 0] = r;
        data[i * 4 + 1] = g;
        data[i * 4 + 2] = b;
        data[i * 4 + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
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
    const errorBox = document.getElementById("error-box");
    if (msg.command === 'render') {
        errorBox.innerText = "";
        draw(msg);
    }
    if (msg.command === 'error') {
        errorBox.innerText = `Error: ${msg.message}`;
        clear();
    }
});

['ptr', 'width', 'height', 'channels'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
        if (document.getElementById('live').checked) { fetchImage(); }
    });
});