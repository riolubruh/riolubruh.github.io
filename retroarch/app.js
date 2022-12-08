var VER = 'v20220809'


var isIOS = !!navigator.platform && /iPad|iPhone|iPod/.test(navigator.platform);
var isMacOS = !!navigator.platform && /Mac/.test(navigator.platform);
if (isMacOS) {
    if (navigator.maxTouchPoints > 2) {
        // Nah, it is an iPad pretending to be a Mac
        isIOS = true
        isMacOS = false
    }
}
var isWebApp = navigator.standalone || false
var isSaveSupported = true
var isSaveNagAppeared = false
if (isIOS) {
    //document.getElementById('romFile').files = null;
    if (!isWebApp) {
        // On iOS Safari, the indexedDB will be cleared after 7 days. 
        // To prevent users from frustration, we don't allow savegame on iOS unless the we are in the PWA mode.
        isSaveSupported = false
        var divIosHint = $id('ios-hint')
        divIosHint.hidden = false
        divIosHint.style = 'position: absolute; bottom: ' + divIosHint.clientHeight + 'px;'
        $id('btn-choose-file').hidden = true
    } else {
        $id('ios-power-hint').hidden = false      
    }
}
if (isMacOS) {
    // Check if it is Safari
    if (navigator.userAgent.indexOf('Chrome') < 0) {
        $id('mac-warning').hidden = false
    }
}

function $id(id) {
    return document.getElementById(id);
}

var optScaleMode = 0
var uiCurrentMode = 'welcome'
var plugins = {}
var body = document.getElementsByTagName("body")[0]
var html = document.getElementsByTagName("html")[0]
var config = {
    swapTopBottom: false,
    swapTopBottomL: false,
    powerSave: true,
    micWhenR: true,
    vkEnabled: true,
    muteSound: false,
    useDPad: false,
    lsLayout: 0,
    turbo: false,
    scaleMode: 0,
    fwLang: 1,
}
var emuUseTimer33 = false

function afterConfigUpdated() {
    emuUseTimer33 = false
    if (config.powerSave || config.turbo) {
        emuUseTimer33 = true
    }
}

function loadConfig() {
    var cfg = JSON.parse(window.localStorage['config'] || '{}')
    for (var k in cfg) {
        config[k] = cfg[k]
    }
    $id('power-save').checked = config.powerSave
    $id('vk-enabled').checked = config.vkEnabled
    $id('cfg-mute-sound').checked = config.muteSound
    $id('vk-direction').value = config.useDPad ? "1" : "0"
    $id('cfg-turbo').checked = config.turbo
    $id('cfg-ls-layout').value = config.lsLayout
    $id('cfg-scale-mode').value = config.scaleMode
    $id('cfg-lang').value = config.fwLang
    afterConfigUpdated()
    optScaleMode = config.scaleMode
}
loadConfig()


function uiSaveConfig() {
    config.powerSave = !!($id('power-save').checked)
    config.vkEnabled = !!($id('vk-enabled').checked)
    config.muteSound = !!($id('cfg-mute-sound').checked)
    config.useDPad = !!parseInt($id('vk-direction').value)
    config.turbo = !!($id('cfg-turbo').checked)
    config.lsLayout = parseInt($id('cfg-ls-layout').value)
    config.scaleMode = parseInt($id('cfg-scale-mode').value)
    config.fwLang = parseInt($id('cfg-lang').value)
    window.localStorage['config'] = JSON.stringify(config)
    afterConfigUpdated()
}


function uiMenuBack() {
    tryInitSound()
    uiSaveConfig()

    if (emuIsGameLoaded) {
        uiSwitchTo('player')
    } else {
        uiSwitchTo('welcome')
    }
}

function toyEncrypt(src) {
    var dst = new Uint8Array(src.length)
    for (var i = 0; i < src.length; i++) {
        dst[i] = src[i] ^ 0xFB
    }
    return dst
}

function uiSaveExport() {
    if (isSaveSupported) {
        if (!confirm(`Auto-save is enabled, you DON'T have to export save data manually.
After you saved in the game, wait a few seconds and save data will be stored in the app's local storage automatically.
To prevent the data loss caused by accidential deletion of the Home Screen icon or damaged device, you may export the save data to a safe place.

Do you wish to continue?`)) {
            return
        }
        if (prompt('You HAVE to save in the game before exporting the save data.\n\nPlease enter "Yes" to confirm.') !== 'Yes') {
            return
        }
    }
    var u8Arr = pako.gzip(emuCopySavBuffer())
    var blob = new Blob([u8Arr], { type: "application/binary" });
    var link = document.createElement("a");
    link.href = window.URL.createObjectURL(blob);
    link.download = 'sav-' + gameID + '.dsz';
    link.click();
}

async function uiSaveRestore() {
    var file = $id('restore-file').files[0]
    if (!file) {
        return
    }
    var fileExt = file.name.split('.').pop().toLowerCase()
    var allowedExts = {'4dsav': true, 'sav': true, 'dsv': true, '4dsaz': true, 'dsz': true}
    if (!allowedExts[fileExt]) {
        alert('Invalid file extension: ' + fileExt)
        return
    }
    var u8Arr = new Uint8Array(await file.arrayBuffer())
    if (fileExt == '4dsav') { 
        u8Arr = toyEncrypt(u8Arr)
    }
    if (fileExt == '4dsaz') {
        // Use pako to decompress
        u8Arr = pako.ungzip(toyEncrypt(u8Arr))
    }
    if (fileExt == 'dsz') {
        u8Arr = pako.ungzip(u8Arr)
    }
    if (fileExt == 'sav') {
        var origSave = emuCopySavBuffer()
        if (origSave.length <= 0) {
            alert('You have to save in the game at least once, before importing .sav file.')
            return
        }
        if (u8Arr.length > origSave.length) {
            alert('The .sav file is too large.')
            return
        }
        // Copy the u8Arr to the beginning of origSave, overwriting the original save data.
        origSave.set(u8Arr, 0)
        u8Arr = origSave
    }
    localforage.setItem('sav-' + gameID, u8Arr).then(() => {
        alert('Save data updated. \nPlease close and reopen this app.')
        setTimeout(() => {
            location.reload()
        }, 500)
    })
}

var emuKeyState = new Array(14)
const emuKeyNames = ["right", "left", "down", "up", "select", "start", "b", "a", "y", "x", "l", "r", "debug", "lid"]
var vkMap = {}
var vkState = {}
var keyNameToKeyId = {}
var vkStickPos = [0, 0, 0, 0, 0]
var vkDPadRect = { x: 0, y: 0, w: 0, h: 0 }
for (var i = 0; i < emuKeyNames.length; i++) {
    keyNameToKeyId[emuKeyNames[i]] = i
}
var isLandscape = false

const emuKeyboradMapping = [39, 37, 40, 38, 16, 13, 90, 88, 65, 83, 81, 87, -1, 8]
var emuGameID = 'unknown'
var emuIsRunning = false
var emuIsGameLoaded = false
var fps = 0
var divFPS = $id('fps')
var fileInput = $id('rom')
var romSize = 0

var FB = [0, 0]
var screenCanvas = [document.getElementById('top'), document.getElementById('bottom')]
var ctx2d;

var audioContext
var audioBuffer
var scriptNode
const audioFifoCap = 8192
var audioFifoL = new Int16Array(audioFifoCap)
var audioFifoR = new Int16Array(audioFifoCap)
var audioFifoHead = 0
var audioFifoLen = 0


var frameCount = 0
var prevCalcFPSTime = 0
var touched = 0
var touchX = 0
var touchY = 0
var prevSaveFlag = 0
var lastTwoFrameTime = 10
var fbSize


function callPlugin(type, arg) {
    for (var k in plugins) {
        if (plugins[k].handler) {
            plugins[k].handler(type, arg)
        }
    }
}

function showMsg(msg) {
    document.getElementById('msg-text').innerText = msg
    document.getElementById('msg-layer').hidden = false
    setTimeout(function () {
        document.getElementById('msg-layer').hidden = true
    }, 1000)
}

function emuRunAudio() {
    var samplesRead = Module._fillAudioBuffer(4096)
    if (config.muteSound) {
        return
    }
    for (var i = 0; i < samplesRead; i++) {
        if (audioFifoLen >= audioFifoCap) {
            break
        }
        var wpos = (audioFifoHead + audioFifoLen) % audioFifoCap
        audioFifoL[wpos] = audioBuffer[i * 2]
        audioFifoR[wpos] = audioBuffer[i * 2 + 1]
        audioFifoLen++
    }
}

function emuRunFrame() {
    processGamepadInput()
    var keyMask = 0;
    for (var i = 0; i < 14; i++) {
        if (emuKeyState[i]) {
            keyMask |= 1 << i
        }
    }
    var mic = emuKeyState[11]
    if (mic) {
        keyMask |= 1 << 14
    }
    if (config.turbo) {
        for (var i = 0; i < 2; i++) {
            Module._runFrame(0, keyMask, touched, touchX, touchY)
            emuRunAudio()
        }
    } else if (config.powerSave) {
        Module._runFrame(0, keyMask, touched, touchX, touchY)
        emuRunAudio()
    }

    Module._runFrame(1, keyMask, touched, touchX, touchY)
    emuRunAudio()

    if (optScaleMode < 2) {
        ctx2d[0].putImageData(FB[0], 0, 0)
        ctx2d[1].putImageData(FB[1], 0, 0)
    } else {
        gpuDraw(screenCanvas[0], FB[0])
        gpuDraw(screenCanvas[1], FB[1])
    }


    frameCount += 1
    if (frameCount % 120 == 0) {
        var time = performance.now()
        fps = 120 / ((time - prevCalcFPSTime) / 1000)
        prevCalcFPSTime = time
        divFPS.innerText = 'fps:' + ('' + fps).substring(0, 5)
    }
    if (frameCount % 30 == 0) {
        checkSaveGame()
    }
}


function wasmReady() {
    Module._setSampleRate(47856)
    setTimeout(() => {
        if ($id('loading').hidden == true) {
            return;
        }
        $id('loading').hidden = true
        $id('loadrom').hidden = false
        var btn = $id('btn-choose-file')
        if (!btn.onclick) {
            btn.onclick = () => {
                tryInitSound()
                $id('rom').click()
            }
        }
    }, 2000)
    $id('ver-info').innerText = 'Ver: ' + VER + ' '
    if (optScaleMode < 2) {
        ctx2d = screenCanvas.map((v) => { return v.getContext('2d', { alpha: false }) })
    } else {
        gpuInit()
    }
}

function emuCopySavBuffer() {
    var size = Module._savGetSize()
    if (size > 0) {
        var ptr = Module._savGetPointer(0)
        var tmpSaveBuf = new Uint8Array(size)
        tmpSaveBuf.set(Module.HEAPU8.subarray(ptr, ptr + size))
        return tmpSaveBuf
    } else {
        return new Uint8Array(0)
    }
}

function checkSaveGame() {
    if (!isSaveSupported) {
        return
    }
    var saveUpdateFlag = Module._savUpdateChangeFlag()
    if ((saveUpdateFlag == 0) && (prevSaveFlag == 1)) {
        var savBuf = emuCopySavBuffer()
        if (savBuf.length > 0) {
            localforage.setItem('sav-' + gameID, savBuf)
            showMsg('Auto saving...')
        }
    }
    prevSaveFlag = saveUpdateFlag
}

async function tryLoadROM(file) {
    if (!file) {
        return
    }
    if (file.size < 1024) {
        return
    }
    var header = new Uint8Array(await (file.slice(0, 1024)).arrayBuffer())
    gameID = ''
    for (var i = 0; i < 0x10; i++) {
        gameID += (header[i] == 0) ? ' ' : String.fromCharCode(header[i])
    }
    if (gameID[0xC] == '#') {
        // a homebrew!
        gameID = file.name
    }
    console.log('gameID', gameID)
    romSize = file.size
    var romBufPtr = Module._prepareRomBuffer(romSize)
    console.log(romSize, romBufPtr)
    const blockSize = 4 * 1024 * 1024
    // Load the file by small chunks, to make browser heap happier
    for (var pos = 0; pos < romSize; pos += blockSize) {
        var chunk = await (file.slice(pos, pos + blockSize)).arrayBuffer()
        Module.HEAPU8.set(new Uint8Array(chunk), romBufPtr + pos)
    }
    var saveData = await localforage.getItem('sav-' + gameID)
    if (saveData) {
        Module.HEAPU8.set(saveData, Module._savGetPointer(saveData.length))
    }
    Module._savUpdateChangeFlag()
    Module._emuSetOpt(0, config.fwLang)
    var ret = Module._loadROM(romSize);
    if (ret != 0) {
        msg = 'LoadROM failed: ' + ret + "\n"
        if (ret == -1001) {
            msg += 'This file is encrypted and not supported for now.\n'
        }
        alert(msg)
        return;
    }
    ptrFrontBuffer = Module._getSymbol(5)
    var fb = Module._getSymbol(4)
    for (var i = 0; i < 2; i++) {
        FB[i] = new ImageData(new Uint8ClampedArray(Module.HEAPU8.buffer).subarray(fb + 256 * 192 * 4 * i, fb + 256 * 192 * 4 * (i + 1)), 256, 192)
    }
    var ptrAudio = Module._getSymbol(6)
    audioBuffer = new Int16Array(Module.HEAPU8.buffer).subarray(ptrAudio / 2, ptrAudio / 2 + 16384 * 2)

    emuIsGameLoaded = true
    callPlugin('loaded', gameID)
    if (window.eaRunHook) {
        window.eaRunHook();
    } else {
        emuStart();
    }
}

// Allow drag and drop of files on entire window
window.ondragover = function (e) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
}
window.ondrop = function (e) {
    e.preventDefault()
    tryLoadROM(e.dataTransfer.files[0])
}

function emuStart() {
    if (!emuIsGameLoaded) {
        return
    }
    console.log('Start!!!')
    emuIsRunning = true
    uiSwitchTo('player')
}

function initVK() {
    var vks = document.getElementsByClassName('vk')
    for (var i = 0; i < vks.length; i++) {
        var vk = vks[i]
        var k = vks[i].getAttribute('data-k')
        if (k) {
            vkMap[k] = vk
            vkState[k] = [0, 0]
        }
    }
}
initVK()

function makeVKStyle(top, left, w, h, fontSize) {
    return 'top:' + top + 'px;left:' + left + 'px;width:' + w + 'px;height:' + h + 'px;' + 'font-size:' + fontSize + 'px;line-height:' + h + 'px;'
}


function uiAdjustVKLayout() {
    var baseSize = window.innerWidth * 0.14
    var fontSize = baseSize * 0.7
    var offTop = Math.min(fbSize[0][1] + fbSize[1][1], window.innerHeight - Math.ceil(baseSize * 3.62))
    var offLeft = 0
    var abxyWidth = baseSize * 3
    var abxyHeight = baseSize * 3
    var vkw = baseSize
    var vkh = baseSize

    vkw = baseSize * 1.5
    vkh = baseSize * 0.6
    fontSize = baseSize * 0.5
    vkMap['l'].style = makeVKStyle(offTop, 0, vkw, vkh, fontSize)
    vkMap['r'].style = makeVKStyle(offTop, window.innerWidth - vkw, vkw, vkh, fontSize)
    vkw = baseSize * 0.4
    vkh = baseSize * 0.4
    $id('vk-menu').style = makeVKStyle(offTop, window.innerWidth / 2 - vkw / 2, vkw, vkh, fontSize)


    offTop += baseSize * 0.62
    vkw = baseSize
    vkh = baseSize
    offLeft = window.innerWidth - abxyWidth
    vkMap['a'].style = makeVKStyle(offTop + abxyHeight / 2 - vkh / 2, offLeft + abxyWidth - vkw, vkw, vkh, fontSize)
    vkMap['b'].style = makeVKStyle(offTop + abxyHeight - vkh, offLeft + abxyWidth / 2 - vkw / 2, vkw, vkh, fontSize)
    vkMap['x'].style = makeVKStyle(offTop, offLeft + abxyWidth / 2 - vkw / 2, vkw, vkh, fontSize)
    vkMap['y'].style = makeVKStyle(offTop + abxyHeight / 2 - vkh / 2, offLeft, vkw, vkh, fontSize)

    vkw = baseSize * 1.0
    vkh = baseSize * 1.0
    offLeft = 0
    $id('vk-stick').style = config.useDPad ? 'display:none;' : makeVKStyle(offTop + abxyHeight / 2 - vkh / 2, offLeft + abxyHeight / 2 - vkw / 2, vkw, vkh, fontSize)
    vkStickPos = [offTop + abxyHeight / 2, offLeft + abxyHeight / 2, vkw, vkh, fontSize]

    var dpadW = abxyWidth
    var dpadH = abxyHeight
    var dpadX = offLeft
    var dpadY = offTop
    vkDPadRect = { x: dpadX, y: dpadY, width: dpadW, height: dpadH }
    $id('vk-dpad-1').style = config.useDPad ? makeVKStyle(dpadY + dpadH / 3, dpadX, dpadW, dpadH / 3, fontSize) : 'display:none;'
    $id('vk-dpad-2').style = config.useDPad ? makeVKStyle(dpadY, dpadX + dpadW / 3, dpadW / 3, dpadH, fontSize) : 'display:none;'
    vkw = baseSize * 0.4
    vkh = baseSize * 0.4
    fontSize = baseSize * 0.2
    vkMap['select'].style = makeVKStyle(offTop + abxyHeight - vkh, window.innerWidth / 2 - vkw * 1.5, vkw, vkh, fontSize)
    vkMap['start'].style = makeVKStyle(offTop + abxyHeight - vkh, window.innerWidth / 2 + vkw * 0.5, vkw, vkh, fontSize)
}

function maxScreenSize(maxWidth, maxHeight) {
    var w = maxWidth
    var h = w / 256 * 192
    if (h > maxHeight) {
        h = maxHeight
        w = h / 192 * 256
    }
    return [w, h]
}

function setScreenPos(c, left, top, w, h) {
    var sty ='left:' + left + 'px;top:' + top + "px;width:" + w + "px;height:" + h + "px;"
    if (optScaleMode == 0) {
        sty += 'image-rendering:pixelated;'
    }
    c.style = sty
    if (optScaleMode >= 2) {
        var devicePixelRatio = window.devicePixelRatio || 1
        c.width = w * devicePixelRatio
        c.height = h * devicePixelRatio
    }
}


function uiUpdateLayout() {
    isLandscape = isScreenLandscape()
    if ((!isLandscape) || (config.lsLayout == 0)) {
        // Top-bottom
        var maxWidth = window.innerWidth
        var maxHeight = window.innerHeight / 2
        var sz = maxScreenSize(maxWidth, maxHeight); var w = sz[0]; var h = sz[1];
        var left = 0
        left += (window.innerWidth - w) / 2;
        var top = 0

        fbSize = [[w, h], [w, h]]
        for (var i = 0; i < 2; i++) {
            setScreenPos(screenCanvas[i], left, top, fbSize[i][0], fbSize[i][1])
            top += h
        }
    } else if (config.lsLayout == 1) {
        // Left-right 1:1
        var maxWidth = window.innerWidth / 2
        var maxHeight = window.innerHeight
        var sz = maxScreenSize(maxWidth, maxHeight); var w = sz[0]; var h = sz[1];
        var left = 0
        var top = 0
        fbSize = [[w, h], [w, h]]
        for (var i = 0; i < 2; i++) {
            setScreenPos(screenCanvas[i], left, top, fbSize[i][0], fbSize[i][1])
            left += w
        }
    } else if (config.lsLayout == 2) {
        // Left-right X:1
        var maxWidth = window.innerWidth - 256
        var maxHeight = window.innerHeight
        var sz = maxScreenSize(maxWidth, maxHeight); var w = sz[0]; var h = sz[1];
        var left = 0
        var top = 0
        fbSize = [[w, h], [256, 192]]
        for (var i = 0; i < 2; i++) {
            setScreenPos(screenCanvas[i], left, top, fbSize[i][0], fbSize[i][1])
            left += w
        }

    }

    uiAdjustVKLayout()
}


function uiSwitchTo(mode) {
    if (mode == uiCurrentMode) {
        return
    }
    uiCurrentMode = mode
    $id('welcome').hidden = true
    $id('vk-layer').hidden = true
    $id('menu').hidden = true
    $id('player').hidden = true
    body.style = ''
    html.style = ''
    emuIsRunning = false

    if (mode == 'player') {
        body.style = 'touch-action: none;'
        html.style = 'position: fixed;overflow:hidden;touch-action: none;'
        for (var i = 0; i < 14; i++) {
            emuKeyState[i] = false
        }
        if (config.vkEnabled) {
            $id('vk-layer').hidden = false
        }
        uiUpdateLayout()
        if (emuIsGameLoaded) {
            emuIsRunning = true
        }
        $id('player').hidden = false
    }
    if (mode == 'menu') {
        $id('player').hidden = false
        $id('menu').hidden = false
        $id('menu-savegame').hidden = emuIsGameLoaded ? false : true
    }
    if (mode == 'welcome') {
        $id('welcome').hidden = false
    }

}

fileInput.onchange = async () => {
    var file = fileInput.files[0]
    if (!file) {
        return
    }
    var fileNameLower = file.name.toLowerCase()
    if (fileNameLower.endsWith('.json')) {
        var obj = JSON.parse(await file.text())
        var pluginName = obj.name || 'unknown'
        plugins[pluginName] = obj
        if (obj.js) {
            plugins[pluginName].handler = eval(obj.js)(obj)
        }
        alert('plugin loaded!')
        return
    } else if (fileNameLower.endsWith('.gba')) {
        alert('This is a GBA file, redirecting to the GBA player...')
        window.location.href = '/gba';
    } else if (fileNameLower.endsWith('.zip')) {
        alert('ZIP files are not supported.\nOn iOS, you can unzip it with the built-in Files app.')
    } else if (fileNameLower.endsWith('.3ds')) {
        alert('No, 3DS is not supported.')
    } else if (fileNameLower.endsWith('.nds')) {
        tryLoadROM(file)
        return
    } else {
        alert('Unknown file type!')
    }
}

function onScriptNodeAudioProcess(e) {
    var chanL = e.outputBuffer.getChannelData(0)
    var chanR = e.outputBuffer.getChannelData(1)
    if (config.muteSound) {
        return
    }
    for (var i = 0; i < chanL.length; i++) {
        if (audioFifoLen <= 0) {
            return
        }
        audioFifoLen--
        chanL[i] = audioFifoL[audioFifoHead] / 32768.0
        chanR[i] = audioFifoR[audioFifoHead] / 32768.0
        audioFifoHead = (audioFifoHead + 1) % audioFifoCap
    }
}

// must be called in user gesture
function tryInitSound() {
    try {
        if (audioContext) {
            if (audioContext.state != 'running') {
                audioContext.resume()
            }
            return;
        }
        audioContext = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 0.0001, sampleRate: 48000 });
        scriptNode = audioContext.createScriptProcessor(2048, 0, 2);
        scriptNode.onaudioprocess = onScriptNodeAudioProcess;
        scriptNode.connect(audioContext.destination);
        audioContext.resume()
    } catch (e) {
        console.log(e)
        //alert('Cannnot init sound ')
    }
}

function emuLoop() {
    window.requestAnimationFrame(emuLoop)

    if (emuIsRunning && (!emuUseTimer33)) {
        prevRunFrameTime = performance.now()
        emuRunFrame()
    }
}
emuLoop()

function emuTimer33() {
    if (emuIsRunning && emuUseTimer33) {
        emuRunFrame()
    }
}
setInterval(emuTimer33, 33)

var stickTouchID = null
var tpadTouchID = null

function isPointInRect(x, y, r) {
    if ((x >= r.x) && (x < r.x + r.width)) {
        if ((y >= r.y) && (y < r.y + r.height)) {
            return true
        }
    }
    return false
}

function clamp01(a) {
    if (a < 0) {
        return 0
    }
    if (a > 1) {
        return 1
    }
    return a
}

function handleTouch(event) {
    tryInitSound()
    if (!emuIsRunning) {
        return
    }
    event.preventDefault();
    event.stopPropagation();

    var isDown = false
    var x = 0
    var y = 0

    var needUpdateStick = false
    var stickY = vkStickPos[0]
    var stickX = vkStickPos[1]
    var stickW = vkStickPos[2]
    var stickH = vkStickPos[3]

    var stickPressed = false
    var stickDeadZone = stickW * 0.4

    var nextStickTouchID = null
    var nextTpadTouchID = null

    var tsRect = screenCanvas[1].getBoundingClientRect()

    for (var i = 0; i < emuKeyState.length; i++) {
        emuKeyState[i] = false
    }
    for (var k in vkState) {
        vkState[k][1] = 0
    }

    for (var i = 0; i < event.touches.length; i++) {
        var t = event.touches[i];
        var tid = t.identifier
        var dom = document.elementFromPoint(t.clientX, t.clientY)
        var k = dom ? dom.getAttribute('data-k') : null
        if (config.useDPad) {
            if (isPointInRect(t.clientX, t.clientY, vkDPadRect)) {
                var xgrid = Math.floor((t.clientX - vkDPadRect.x) / vkDPadRect.width * 3)
                var ygrid = Math.floor((t.clientY - vkDPadRect.y) / vkDPadRect.height * 3)
                var xygrid = xgrid + ygrid * 3
                if (xygrid == 5)
                    // right
                    emuKeyState[0] = true
                else if (xygrid == 3)
                    // left
                    emuKeyState[1] = true
                else if (xygrid == 7)
                    // down
                    emuKeyState[2] = true
                else if (xygrid == 1)
                    // up
                    emuKeyState[3] = true
            }
        } else {
            if ((tid === stickTouchID) || ((dom == vkMap['stick']) && (tid != tpadTouchID))) {
                stickPressed = true

                vkState['stick'][1] = 1
                var sx = t.clientX
                var sy = t.clientY
                if (sx < stickX - stickDeadZone) {
                    emuKeyState[1] = true
                }
                if (sx > stickX + stickDeadZone) {
                    emuKeyState[0] = true
                }
                if (sy < stickY - stickDeadZone) {
                    emuKeyState[3] = true
                }
                if (sy > stickY + stickDeadZone) {
                    emuKeyState[2] = true
                }
                sx = Math.max(stickX - stickW / 2, sx)
                sx = Math.min(stickX + stickW / 2, sx)
                sy = Math.max(stickY - stickH / 2, sy)
                sy = Math.min(stickY + stickH / 2, sy)
                stickX = sx
                stickY = sy
                needUpdateStick = true
                nextStickTouchID = tid
                continue
            }
        }
        if ((tid === tpadTouchID) || (isPointInRect(t.clientX, t.clientY, tsRect) && (!k))) {
            isDown = true
            x = clamp01((t.clientX - tsRect.x) / tsRect.width) * 256
            y = clamp01((t.clientY - tsRect.y) / tsRect.height) * 192
            nextTpadTouchID = tid
            continue
        }
        if (k) {
            vkState[k][1] = 1
            continue
        }
    }

    touched = isDown ? 1 : 0;
    touchX = x
    touchY = y

    for (var k in vkState) {
        if (vkState[k][0] != vkState[k][1]) {
            var dom = vkMap[k]
            vkState[k][0] = vkState[k][1]
            if (vkState[k][1]) {
                //dom.classList.add('vk-touched')
                if (k == 'menu') {
                    uiSwitchTo('menu')
                }
            } else {
                //dom.classList.remove('vk-touched')
                if (k == "stick") {
                    needUpdateStick = true
                }
            }

        }
    }

    for (var i = 0; i < emuKeyState.length; i++) {
        var k = emuKeyNames[i]
        if (vkState[k]) {
            if (vkState[k][1]) {
                emuKeyState[i] = true
            }
        }
    }

    if (needUpdateStick) {
        vkMap['stick'].style = makeVKStyle(stickY - stickW / 2, stickX - stickW / 2, stickW, stickH, vkStickPos[4])
    }

    stickTouchID = nextStickTouchID
    tpadTouchID = nextTpadTouchID
}
['touchstart', 'touchmove', 'touchend', 'touchcancel', 'touchenter', 'touchleave'].forEach((val) => {
    window.addEventListener(val, handleTouch)
})




window.onmousedown = window.onmouseup = window.onmousemove = (e) => {
    if (!emuIsRunning) {
        return
    }
    if (e.type == 'mousedown') {
        tryInitSound()
    }

    var r = screenCanvas[1].getBoundingClientRect()

    e.preventDefault()
    e.stopPropagation()

    var isDown = (e.buttons != 0) && (isPointInRect(e.clientX, e.clientY, r))
    var x = (e.clientX - r.x) / r.width * 256
    var y = (e.clientY - r.y) / r.height * 192

    touched = isDown ? 1 : 0;
    touchX = x
    touchY = y
}

window.onresize = window.onorientationchange = () => {
    uiUpdateLayout()
}
function convertKeyCode(keyCode) {
    for (var i = 0; i < 14; i++) {
        if (keyCode == emuKeyboradMapping[i]) {
            return i
        }
    }
    return -1
}
window.onkeydown = window.onkeyup = (e) => {
    if (!emuIsRunning) {
        return
    }
    e.preventDefault()
    var isDown = (e.type === "keydown")
    var k = convertKeyCode(e.keyCode)
    if (k >= 0) {
        emuKeyState[k] = isDown
    }
    if (e.keyCode == 27) {
        uiSwitchTo('menu')
    }
}

var currentConnectedGamepad = -1
var gamePadKeyMap = {
    a: 1,
    b: 0,
    x: 3,
    y: 2,
    l: 4,
    r: 5,
    'select': 8,
    'start': 9,
    'up': 12,
    'down': 13,
    'left': 14,
    'right': 15
}

if (isSaveSupported) {
    window.addEventListener("gamepadconnected", function (e) {
        console.log("Gamepad connected at index %d: %s. %d buttons, %d axes.",
            e.gamepad.index, e.gamepad.id,
            e.gamepad.buttons.length, e.gamepad.axes.length);
        showMsg('Gamepad connected.')
        currentConnectedGamepad = e.gamepad.index
        $id('a-gamepad').innerText = 'Gamepad connected'
    });
}


function processGamepadInput() {
    if (currentConnectedGamepad < 0) {
        return
    }
    var gamepad = navigator.getGamepads()[currentConnectedGamepad]
    if (!gamepad) {
        showMsg('Gamepad disconnected.')
        currentConnectedGamepad = -1
        return
    }
    for (var i = 0; i < emuKeyState.length; i++) {
        emuKeyState[i] = false
    }
    for (var k in gamePadKeyMap) {
        if (gamepad.buttons[gamePadKeyMap[k]].pressed) {
            emuKeyState[keyNameToKeyId[k]] = true
        }
    }
    if (gamepad.axes[0] < -0.5) {
        emuKeyState[keyNameToKeyId['left']] = true
    }
    if (gamepad.axes[0] > 0.5) {
        emuKeyState[keyNameToKeyId['right']] = true
    }
    if (gamepad.axes[1] < -0.5) {
        emuKeyState[keyNameToKeyId['up']] = true
    }
    if (gamepad.axes[1] > 0.5) {
        emuKeyState[keyNameToKeyId['down']] = true
    }
}



var isMicrophoneEnabled = false
var micPtr
var micBuf
var micScriptNode
var micSource
function enableMicrophone() {
    if (!micPtr) {
        micPtr = Module._realloc(0, 0x1000)
        micBuf = Module.HEAPU8.subarray(micPtr, micPtr + 0x1000)
    }
    if (micScriptNode) {
        micScriptNode.disconnect()
    }
    if (micSource) {
        micSource.disconnect()
    }
    tryInitSound()
    isMicrophoneEnabled = true
    // console.log(micPtr, micBuf)
    // Request access to the Microphone, and get raw PCM samples at 8000Hz, use WebAudio API
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        .then(function (stream) {
            // Create a MediaStreamSource from the stream
            micSource = audioContext.createMediaStreamSource(stream);
            // Create a ScriptProcessorNode with a bufferSize of 2048
            micScriptNode = audioContext.createScriptProcessor(2048, 1, 1);
            // Connect the ScriptProcessorNode to the MediaStreamSource
            micSource.connect(micScriptNode);
            // Connect the ScriptProcessorNode to the destination
            micScriptNode.onaudioprocess = function (e) {
                var buf = e.inputBuffer.getChannelData(0) // 48000Hz mono float
                // Convert to 16000Hz 7bit mono PCM
                var dstPtr = 0;
                for (var i = 0; i <= 2045; i += 3) {
                    var val = (buf[i] + buf[i + 1] + buf[i + 2]) / 3
                    // Convert -1~1 to 0~127
                    val = Math.floor(val * 64 + 64)
                    if (val > 127) {
                        val = 127
                    } else if (val < 0) {
                        val = 0
                    }
                    micBuf[dstPtr] = val
                    dstPtr++
                }
                // Write to the buffer
                Module._micWriteSamples(micPtr, 682)
                for (var outputChan = 0; outputChan < 1; outputChan++) {
                    var buf = e.outputBuffer.getChannelData(outputChan)
                    for (var i = 0; i < 2048; i++) {
                        buf[i] = 0
                    }
                }
            }
            micScriptNode.connect(audioContext.destination);

        });
}

function isScreenLandscape() {
    return (window.innerWidth / window.innerHeight) > 1.2
}



if (location.origin == 'https://ds.44670.org') {
    if (isSaveSupported) {
        // Register Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').then(function (reg) {
                // registration worked
                console.log('Registration succeeded. Scope is ' + reg.scope);
            }).catch(function (error) {
                // registration failed
                console.log('Registration failed with ' + error);
            });
            navigator.serviceWorker.addEventListener('message', event => {
                console.log('sw msg', event);
                if (event.data.msg) {
                    $id('whats-new').innerText = event.data.msg
                }
            });
        }
    }
    (function () {

        var cnt = 0;
        // Prompt to install PWA
        window.onbeforeinstallprompt = function (e) {
            cnt += 1;
            if (cnt > 2) {
                return;
            }
            console.log('Before install prompt', e);
            e.preventDefault();
            var deferredPrompt = e;
            window.onclick = function (e) {
                deferredPrompt.prompt();
                window.onclick = null;
            }
        };
    })();
}

var vertShaderSource = `
    precision mediump float;
    attribute vec2 a_position; //(0,0)-(1,1)
    varying vec2 v_texCoord; //(0,0)-(1,1)
    
    void main() {
        // Convert a_position to gl_Position
        gl_Position = vec4(a_position.x * 2.0 - 1.0, 1.0 - a_position.y * 2.0, 0, 1);
        v_texCoord = a_position;
    }
`;
var fragShaderSource = `


    
#ifdef GL_ES
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
#define COMPAT_PRECISION mediump
#else
#define COMPAT_PRECISION
#endif

#if __VERSION__ >= 130
#define COMPAT_VARYING in
#define COMPAT_TEXTURE texture
out COMPAT_PRECISION vec4 FragColor;
#else
#define COMPAT_VARYING varying
#define FragColor gl_FragColor
#define COMPAT_TEXTURE texture2D
#endif

precision mediump float;
uniform sampler2D u_image; 
varying vec2 v_texCoord; 
uniform vec2 u_outResolution;
uniform vec2 u_inResolution;

#define Source u_image
#define vTexCoord v_texCoord

#define SourceSize vec4(u_inResolution, 1.0 / u_inResolution) 
#define OutSize vec4(u_outResolution, 1.0 / u_outResolution)

#define BLEND_NONE 0
#define BLEND_NORMAL 1
#define BLEND_DOMINANT 2
#define LUMINANCE_WEIGHT 1.0
#define EQUAL_COLOR_TOLERANCE 30.0/255.0
#define STEEP_DIRECTION_THRESHOLD 2.2
#define DOMINANT_DIRECTION_THRESHOLD 3.6

float DistYCbCr(vec3 pixA, vec3 pixB)
{
  const vec3 w = vec3(0.2627, 0.6780, 0.0593);
  const float scaleB = 0.5 / (1.0 - w.b);
  const float scaleR = 0.5 / (1.0 - w.r);
  vec3 diff = pixA - pixB;
  float Y = dot(diff.rgb, w);
  float Cb = scaleB * (diff.b - Y);
  float Cr = scaleR * (diff.r - Y);

  return sqrt(((LUMINANCE_WEIGHT * Y) * (LUMINANCE_WEIGHT * Y)) + (Cb * Cb) + (Cr * Cr));
}

bool IsPixEqual(const vec3 pixA, const vec3 pixB)
{
  return (DistYCbCr(pixA, pixB) < EQUAL_COLOR_TOLERANCE);
}

float get_left_ratio(vec2 center, vec2 origin, vec2 direction, vec2 scale)
{
  vec2 P0 = center - origin;
  vec2 proj = direction * (dot(P0, direction) / dot(direction, direction));
  vec2 distv = P0 - proj;
  vec2 orth = vec2(-direction.y, direction.x);
  float side = sign(dot(P0, orth));
  float v = side * length(distv * scale);

//  return step(0, v);
  return smoothstep(-sqrt(2.0)/2.0, sqrt(2.0)/2.0, v);
}

#define eq(a,b)  (a == b)
#define neq(a,b) (a != b)

#define P(x,y) COMPAT_TEXTURE(Source, coord + SourceSize.zw * vec2(x, y)).rgb

void main()
{
  //---------------------------------------
  // Input Pixel Mapping:  -|x|x|x|-
  //                       x|A|B|C|x
  //                       x|D|E|F|x
  //                       x|G|H|I|x
  //                       -|x|x|x|-

  vec2 scale = OutSize.xy * SourceSize.zw;
  vec2 pos = fract(vTexCoord * SourceSize.xy) - vec2(0.5, 0.5);
  vec2 coord = vTexCoord - pos * SourceSize.zw;

  vec3 A = P(-1.,-1.);
  vec3 B = P( 0.,-1.);
  vec3 C = P( 1.,-1.);
  vec3 D = P(-1., 0.);
  vec3 E = P( 0., 0.);
  vec3 F = P( 1., 0.);
  vec3 G = P(-1., 1.);
  vec3 H = P( 0., 1.);
  vec3 I = P( 1., 1.);

  // blendResult Mapping: x|y|
  //                      w|z|
  ivec4 blendResult = ivec4(BLEND_NONE,BLEND_NONE,BLEND_NONE,BLEND_NONE);

  // Preprocess corners
  // Pixel Tap Mapping: -|-|-|-|-
  //                    -|-|B|C|-
  //                    -|D|E|F|x
  //                    -|G|H|I|x
  //                    -|-|x|x|-
  if (!((eq(E,F) && eq(H,I)) || (eq(E,H) && eq(F,I))))
  {
    float dist_H_F = DistYCbCr(G, E) + DistYCbCr(E, C) + DistYCbCr(P(0,2), I) + DistYCbCr(I, P(2.,0.)) + (4.0 * DistYCbCr(H, F));
    float dist_E_I = DistYCbCr(D, H) + DistYCbCr(H, P(1,2)) + DistYCbCr(B, F) + DistYCbCr(F, P(2.,1.)) + (4.0 * DistYCbCr(E, I));
    bool dominantGradient = (DOMINANT_DIRECTION_THRESHOLD * dist_H_F) < dist_E_I;
    blendResult.z = ((dist_H_F < dist_E_I) && neq(E,F) && neq(E,H)) ? ((dominantGradient) ? BLEND_DOMINANT : BLEND_NORMAL) : BLEND_NONE;
  }


  // Pixel Tap Mapping: -|-|-|-|-
  //                    -|A|B|-|-
  //                    x|D|E|F|-
  //                    x|G|H|I|-
  //                    -|x|x|-|-
  if (!((eq(D,E) && eq(G,H)) || (eq(D,G) && eq(E,H))))
  {
    float dist_G_E = DistYCbCr(P(-2.,1.)  , D) + DistYCbCr(D, B) + DistYCbCr(P(-1.,2.), H) + DistYCbCr(H, F) + (4.0 * DistYCbCr(G, E));
    float dist_D_H = DistYCbCr(P(-2.,0.)  , G) + DistYCbCr(G, P(0.,2.)) + DistYCbCr(A, E) + DistYCbCr(E, I) + (4.0 * DistYCbCr(D, H));
    bool dominantGradient = (DOMINANT_DIRECTION_THRESHOLD * dist_D_H) < dist_G_E;
    blendResult.w = ((dist_G_E > dist_D_H) && neq(E,D) && neq(E,H)) ? ((dominantGradient) ? BLEND_DOMINANT : BLEND_NORMAL) : BLEND_NONE;
  }

  // Pixel Tap Mapping: -|-|x|x|-
  //                    -|A|B|C|x
  //                    -|D|E|F|x
  //                    -|-|H|I|-
  //                    -|-|-|-|-
  if (!((eq(B,C) && eq(E,F)) || (eq(B,E) && eq(C,F))))
  {
    float dist_E_C = DistYCbCr(D, B) + DistYCbCr(B, P(1.,-2.)) + DistYCbCr(H, F) + DistYCbCr(F, P(2.,-1.)) + (4.0 * DistYCbCr(E, C));
    float dist_B_F = DistYCbCr(A, E) + DistYCbCr(E, I) + DistYCbCr(P(0.,-2.), C) + DistYCbCr(C, P(2.,0.)) + (4.0 * DistYCbCr(B, F));
    bool dominantGradient = (DOMINANT_DIRECTION_THRESHOLD * dist_B_F) < dist_E_C;
    blendResult.y = ((dist_E_C > dist_B_F) && neq(E,B) && neq(E,F)) ? ((dominantGradient) ? BLEND_DOMINANT : BLEND_NORMAL) : BLEND_NONE;
  }

  // Pixel Tap Mapping: -|x|x|-|-
  //                    x|A|B|C|-
  //                    x|D|E|F|-
  //                    -|G|H|-|-
  //                    -|-|-|-|-
  if (!((eq(A,B) && eq(D,E)) || (eq(A,D) && eq(B,E))))
  {
    float dist_D_B = DistYCbCr(P(-2.,0.), A) + DistYCbCr(A, P(0.,-2.)) + DistYCbCr(G, E) + DistYCbCr(E, C) + (4.0 * DistYCbCr(D, B));
    float dist_A_E = DistYCbCr(P(-2.,-1.), D) + DistYCbCr(D, H) + DistYCbCr(P(-1.,-2.), B) + DistYCbCr(B, F) + (4.0 * DistYCbCr(A, E));
    bool dominantGradient = (DOMINANT_DIRECTION_THRESHOLD * dist_D_B) < dist_A_E;
    blendResult.x = ((dist_D_B < dist_A_E) && neq(E,D) && neq(E,B)) ? ((dominantGradient) ? BLEND_DOMINANT : BLEND_NORMAL) : BLEND_NONE;
  }

  vec3 res = E;

  // Pixel Tap Mapping: -|-|-|-|-
  //                    -|-|B|C|-
  //                    -|D|E|F|x
  //                    -|G|H|I|x
  //                    -|-|x|x|-
  if(blendResult.z != BLEND_NONE)
  {
    float dist_F_G = DistYCbCr(F, G);
    float dist_H_C = DistYCbCr(H, C);
    bool doLineBlend = (blendResult.z == BLEND_DOMINANT ||
                !((blendResult.y != BLEND_NONE && !IsPixEqual(E, G)) || (blendResult.w != BLEND_NONE && !IsPixEqual(E, C)) ||
                  (IsPixEqual(G, H) && IsPixEqual(H, I) && IsPixEqual(I, F) && IsPixEqual(F, C) && !IsPixEqual(E, I))));

    vec2 origin = vec2(0.0, 1.0 / sqrt(2.0));
    vec2 direction = vec2(1.0, -1.0);
    if(doLineBlend)
    {
      bool haveShallowLine = (STEEP_DIRECTION_THRESHOLD * dist_F_G <= dist_H_C) && neq(E,G) && neq(D,G);
      bool haveSteepLine = (STEEP_DIRECTION_THRESHOLD * dist_H_C <= dist_F_G) && neq(E,C) && neq(B,C);
      origin = haveShallowLine? vec2(0.0, 0.25) : vec2(0.0, 0.5);
      direction.x += haveShallowLine? 1.0: 0.0;
      direction.y -= haveSteepLine? 1.0: 0.0;
    }

    vec3 blendPix = mix(H,F, step(DistYCbCr(E, F), DistYCbCr(E, H)));
    res = mix(res, blendPix, get_left_ratio(pos, origin, direction, scale));
  }

  // Pixel Tap Mapping: -|-|-|-|-
  //                    -|A|B|-|-
  //                    x|D|E|F|-
  //                    x|G|H|I|-
  //                    -|x|x|-|-
  if(blendResult.w != BLEND_NONE)
  {
    float dist_H_A = DistYCbCr(H, A);
    float dist_D_I = DistYCbCr(D, I);
    bool doLineBlend = (blendResult.w == BLEND_DOMINANT ||
                !((blendResult.z != BLEND_NONE && !IsPixEqual(E, A)) || (blendResult.x != BLEND_NONE && !IsPixEqual(E, I)) ||
                  (IsPixEqual(A, D) && IsPixEqual(D, G) && IsPixEqual(G, H) && IsPixEqual(H, I) && !IsPixEqual(E, G))));

    vec2 origin = vec2(-1.0 / sqrt(2.0), 0.0);
    vec2 direction = vec2(1.0, 1.0);
    if(doLineBlend)
    {
      bool haveShallowLine = (STEEP_DIRECTION_THRESHOLD * dist_H_A <= dist_D_I) && neq(E,A) && neq(B,A);
      bool haveSteepLine  = (STEEP_DIRECTION_THRESHOLD * dist_D_I <= dist_H_A) && neq(E,I) && neq(F,I);
      origin = haveShallowLine? vec2(-0.25, 0.0) : vec2(-0.5, 0.0);
      direction.y += haveShallowLine? 1.0: 0.0;
      direction.x += haveSteepLine? 1.0: 0.0;
    }
    origin = origin;
    direction = direction;

    vec3 blendPix = mix(H,D, step(DistYCbCr(E, D), DistYCbCr(E, H)));
    res = mix(res, blendPix, get_left_ratio(pos, origin, direction, scale));
  }

  // Pixel Tap Mapping: -|-|x|x|-
  //                    -|A|B|C|x
  //                    -|D|E|F|x
  //                    -|-|H|I|-
  //                    -|-|-|-|-
  if(blendResult.y != BLEND_NONE)
  {
    float dist_B_I = DistYCbCr(B, I);
    float dist_F_A = DistYCbCr(F, A);
    bool doLineBlend = (blendResult.y == BLEND_DOMINANT ||
                !((blendResult.x != BLEND_NONE && !IsPixEqual(E, I)) || (blendResult.z != BLEND_NONE && !IsPixEqual(E, A)) ||
                  (IsPixEqual(I, F) && IsPixEqual(F, C) && IsPixEqual(C, B) && IsPixEqual(B, A) && !IsPixEqual(E, C))));

    vec2 origin = vec2(1.0 / sqrt(2.0), 0.0);
    vec2 direction = vec2(-1.0, -1.0);

    if(doLineBlend)
    {
      bool haveShallowLine = (STEEP_DIRECTION_THRESHOLD * dist_B_I <= dist_F_A) && neq(E,I) && neq(H,I);
      bool haveSteepLine  = (STEEP_DIRECTION_THRESHOLD * dist_F_A <= dist_B_I) && neq(E,A) && neq(D,A);
      origin = haveShallowLine? vec2(0.25, 0.0) : vec2(0.5, 0.0);
      direction.y -= haveShallowLine? 1.0: 0.0;
      direction.x -= haveSteepLine? 1.0: 0.0;
    }

    vec3 blendPix = mix(F,B, step(DistYCbCr(E, B), DistYCbCr(E, F)));
    res = mix(res, blendPix, get_left_ratio(pos, origin, direction, scale));
  }

  // Pixel Tap Mapping: -|x|x|-|-
  //                    x|A|B|C|-
  //                    x|D|E|F|-
  //                    -|G|H|-|-
  //                    -|-|-|-|-
  if(blendResult.x != BLEND_NONE)
  {
    float dist_D_C = DistYCbCr(D, C);
    float dist_B_G = DistYCbCr(B, G);
    bool doLineBlend = (blendResult.x == BLEND_DOMINANT ||
                !((blendResult.w != BLEND_NONE && !IsPixEqual(E, C)) || (blendResult.y != BLEND_NONE && !IsPixEqual(E, G)) ||
                  (IsPixEqual(C, B) && IsPixEqual(B, A) && IsPixEqual(A, D) && IsPixEqual(D, G) && !IsPixEqual(E, A))));

    vec2 origin = vec2(0.0, -1.0 / sqrt(2.0));
    vec2 direction = vec2(-1.0, 1.0);
    if(doLineBlend)
    {
      bool haveShallowLine = (STEEP_DIRECTION_THRESHOLD * dist_D_C <= dist_B_G) && neq(E,C) && neq(F,C);
      bool haveSteepLine  = (STEEP_DIRECTION_THRESHOLD * dist_B_G <= dist_D_C) && neq(E,G) && neq(H,G);
      origin = haveShallowLine? vec2(0.0, -0.25) : vec2(0.0, -0.5);
      direction.x -= haveShallowLine? 1.0: 0.0;
      direction.y += haveSteepLine? 1.0: 0.0;
    }

    vec3 blendPix = mix(D,B, step(DistYCbCr(E, B), DistYCbCr(E, D)));
    res = mix(res, blendPix, get_left_ratio(pos, origin, direction, scale));
  }

 	FragColor = vec4(res, 1.0);
} `


    
function gpuInitWithCanvas(canvas) {
    var gl = canvas.getContext("webgl");
    canvas.gl = gl;
    if (!gl) {
        alert("Unable to initialize WebGL. Your browser or machine may not support it.");
        return null;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    // Create shader.
    program = gl.createProgram();
    var vertShader = gl.createShader(gl.VERTEX_SHADER);
    var fragShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(vertShader, vertShaderSource);
    gl.shaderSource(fragShader, fragShaderSource);
    gl.compileShader(vertShader);
    gl.compileShader(fragShader);
    // Check if compilation succeeded.
    if (!gl.getShaderParameter(vertShader, gl.COMPILE_STATUS)) {
        alert("Error in vertex shader: " + gl.getShaderInfoLog(vertShader));
        return;
    }
    if (!gl.getShaderParameter(fragShader, gl.COMPILE_STATUS)) {
        alert("Error in fragment shader: " + gl.getShaderInfoLog(fragShader));
        return;
    }
    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        alert("Error in program: " + gl.getProgramInfoLog(program));
        return;
    }
    gl.useProgram(program);
    // Create texture.
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // Use nearest neighbor interpolation.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    // Create vertex buffer, a rectangle to (0,0)-(width,height).
    var vertices = new Float32Array([
        0, 0,
        1, 0,
        0, 1,
        0, 1,
        1, 0,
        1, 1
    ]);
    var vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    // Create attribute.
    var positionAttribLocation = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(positionAttribLocation);
    gl.vertexAttribPointer(positionAttribLocation, 2, gl.FLOAT, false, 0, 0);
    // Set uniform.
    canvas.outResolutionUniformLocation = gl.getUniformLocation(program, "u_outResolution");
    var inResolutionUniformLocation = gl.getUniformLocation(program, "u_inResolution");
    gl.uniform2f(inResolutionUniformLocation, 256, 192);
    return gl;
}

function gpuDraw(canvas, idata) {
    var gl = canvas.gl;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, idata);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(canvas.outResolutionUniformLocation, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
}


function gpuInit() {
    if (!gpuInitWithCanvas(screenCanvas[0])) {
        return
    }
    gpuInitWithCanvas(screenCanvas[1]);
}