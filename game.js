"use strict";

const canvas = document.querySelector("#game");
const outputContext = canvas.getContext("2d", { alpha: false });
const fadeOverlay = document.querySelector("#fade-overlay");
const frameCanvas = document.createElement("canvas");
frameCanvas.width = canvas.width;
frameCanvas.height = canvas.height;
const ctx = frameCanvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
outputContext.imageSmoothingEnabled = false;
const handCursor = new Image();
const cursorBitmap = document.createElement("canvas");
const cursorContext = cursorBitmap.getContext("2d");
const fadeQueue = [];
const fadeStepSeconds = 2 / 70;
const fadeStepCount = 32;
let activeFade = null;
let faded = true;
handCursor.addEventListener("load", updateHandCursor);
handCursor.src = "hand.png";
new ResizeObserver(updateHandCursor).observe(canvas);

function updateHandCursor() {
  if (!handCursor.complete || !handCursor.naturalWidth) return;
  const displayScale = canvas.getBoundingClientRect().width / canvas.width;
  const scale = Math.min(displayScale, 128 / Math.max(handCursor.naturalWidth, handCursor.naturalHeight));
  const width = Math.max(1, Math.round(handCursor.naturalWidth * scale));
  const height = Math.max(1, Math.round(handCursor.naturalHeight * scale));
  cursorBitmap.width = width;
  cursorBitmap.height = height;
  cursorContext.imageSmoothingEnabled = false;
  cursorContext.drawImage(handCursor, 0, 0, width, height);
  const hotX = Math.min(width - 1, Math.round(5 * displayScale));
  const hotY = Math.min(height - 1, Math.round(1 * displayScale));
  canvas.style.cursor = `url("${cursorBitmap.toDataURL()}") ${hotX} ${hotY}, crosshair`;
}

function enqueueFade(kind, callback) {
  fadeQueue.push({ kind, callback });
  game.fadeBusy = true;
  fadeOverlay.style.display = "block";
}

function setFadeOpacity(kind, index) {
  const brightness = kind === "out" ? 0xf8 - 8 * index : 4 + 8 * index;
  fadeOverlay.style.opacity = String(1 - brightness / 256);
}

function advanceFade(elapsed) {
  let remaining = elapsed;
  while (fadeQueue.length) {
    const step = fadeQueue[0];
    if (step.kind === "after") {
      fadeQueue.shift();
      step.callback();
      continue;
    }
    if (!activeFade) {
      if ((step.kind === "out" && faded) || (step.kind === "in" && !faded)) {
        fadeQueue.shift();
        continue;
      }
      activeFade = { kind: step.kind, index: 0, elapsed: 0 };
      setFadeOpacity(activeFade.kind, activeFade.index);
    }
    const needed = fadeStepSeconds - activeFade.elapsed;
    if (remaining < needed) {
      activeFade.elapsed += remaining;
      return;
    }
    remaining -= needed;
    activeFade.elapsed = 0;
    activeFade.index++;
    if (activeFade.index === fadeStepCount) {
      faded = activeFade.kind === "out";
      fadeOverlay.style.opacity = faded ? "1" : "0";
      activeFade = null;
      fadeQueue.shift();
      continue;
    }
    setFadeOpacity(activeFade.kind, activeFade.index);
  }
  game.fadeBusy = false;
  if (!faded) fadeOverlay.style.display = "none";
}

const seasons = ["spring", "summer", "fall", "winter"];
const assets = { images: new Map(), cubes: new Map(), sprites: new Map() };
const iconAtlas = document.createElement("canvas");
const iconAtlasContext = iconAtlas.getContext("2d", { willReadFrequently: true });
let iconAtlasReady = false;
const game = {
  mode: "intro",
  scene: "TITLE.GFX",
  introAnimations: [],
  screenCommands: [],
  statusIndicator: null,
  statusCurrent: 0,
  statusDirection: 1,
  season: 0,
  mobiles: [],
  map: new Uint8Array(0),
  program: null,
  viewX: 0,
  viewY: 0,
  intervalCount: 0,
  introFrame: 0,
  interruptFade: false,
  pendingTime: 0,
  animationCount: 0,
  frozen: false,
  ended: false,
  firstTime: true,
  fullScreenImage: true,
  aerialView: false,
  fadeBusy: false,
  speaking: -1,
  speech: "",
  speechCount: 0,
  lastMessage: -1,
  messageNumber: 0,
  messageObject: -1,
  lastRandom: 0,
  errorCount: 0,
  host: 0,
  cameraLock: -1,
  nextAlert: 0,
  mobileHit: -1,
  mapHit: -1,
  buttonNumber: -1,
  pendingInput: 0,
  cursorActive: false,
  cursorMode: 0,
  cubeSetCode: 0,
  interactionData: new Uint8Array(3200),
  stung: new Uint8Array(40),
  mobileSignals: new Uint16Array(40).fill(0xffff),
  signalStack: new Uint16Array(40).fill(0xffff),
  signalDue: new Uint16Array(10).fill(0xffff),
  signalTarget: new Uint16Array(10).fill(0xffff),
  signalValue: new Uint16Array(10).fill(0xffff),
  signalTime: 0,
  buttonStates: new Uint8Array(20),
  buttonRegen: new Uint8Array(20),
  cheatValues: new Uint8Array(3),
  cheatAlt: false,
  cheatPointer: 0,
  keyboard: [],
  keyAvailable: false,
  clickPending: false,
  clickState: 0,
  releasePending: false,
  clickX: 0,
  clickY: 0,
  lastKey: 0,
  selected: null,
  step: 0,
  paused: false,
  music: false,
  track: 0
};

const music = new Audio();
music.loop = true;
music.volume = 0.32;
music.preload = "auto";
const soundMetadata = [
  [true, 5, 3, false], [true, 5, 3, false], [true, 5, 3, false], [true, 5, 0, true],
  [true, 5, 3, true], [true, 5, 1, true], [true, 5, 3, false], [true, 2, 0, true],
  [true, 2, 0, true], [true, 1, 1, true], [true, 1, 0, true], [false, 4, 1, false],
  [false, 4, 1, false], [false, 4, 1, false], [false, 4, 1, false], [false, 4, 1, false],
  [false, 4, 1, false], [false, 4, 1, false], [false, 4, 1, false], [false, 4, 1, false],
  [true, 5, 2, false], [true, 3, 1, true], [false, 4, 2, false], [false, 4, 2, false],
  [true, 5, 2, true], [true, 2, 0, true], [true, 2, 0, true], [false, 2, 0, false],
  [false, 5, 0, false], [false, 1, 0, false], [false, 1, 0, false], [false, 3, 0, false],
  [false, 5, 0, false], [false, 5, 2, false], [false, 4, 0, false], [false, 3, 1, false],
  [true, 1, 3, false], null, [false, 4, 2, false], [false, 3, 0, false]
];
const soundSources = [];
let transientEffect = null;
let ambientEffect = null;
let currentAmbientSource = null;
let audioListenerX = 0;
let audioListenerY = 0;
let musicRequest = 0;
let musicSource = "";

let gameData = null;
let gameProgram = null;
let ruleMachine = null;
let lastScancode = 0;
let swallowNextKey = false;
Promise.all([
  fetch("game-data.json").then((response) => {
    if (!response.ok) throw new Error(`Could not load map data: ${response.status}`);
    return response.json();
  }),
  fetch("ERULES.PRG").then((response) => {
    if (!response.ok) throw new Error(`Could not load ERULES.PRG: ${response.status}`);
    return response.arrayBuffer();
  })
])
  .then(([mapData, ruleBytes]) => {
    gameProgram = window.RobinEngine.parseProgram(ruleBytes);
    if (mapData.map.length !== mapData.mapWidth * mapData.mapHeight * mapData.mapLevels) {
      throw new Error("Invalid extracted map dimensions");
    }
    gameData = { ...mapData, mobiles: gameProgram.mobiles };
    game.program = gameProgram;
    game.map = Uint8Array.from(mapData.map);
    game.mobiles = gameProgram.mobiles;
    game.buttonScancodes = gameProgram.buttons.map((button) => buttonScancode(button.key));
    game.mobileSignals = new Uint16Array(game.mobiles.length).fill(0xffff);
    game.signalStack = new Uint16Array(game.mobileSignals);
    game.signalDue.fill(0xffff);
    game.signalTarget.fill(0xffff);
    game.signalValue.fill(0xffff);
    game.signalTime = 0;
    game.stung = new Uint8Array(game.mobiles.length);
    game.keyAvailable = false;
    game.clearKeys = clearKeys;
    game.takeKey = takeKey;
    game.consumeClick = () => { game.clickPending = false; game.clickState = 0; };
    game.endTargeting = endTargeting;
    game.cube = (x, y, level) => game.map[(y * 64 + x) * 4 + level] ?? 255;
    game.interaction = (source, target) => game.interactionData[source * 80 + target * 2] | game.interactionData[source * 80 + target * 2 + 1] << 8;
    game.startSound = startSound;
    game.stopSound = stopSound;
    game.playMusic = playGameMusic;
    game.stopMusic = stopMusic;
    game.loadScene = (name) => {
      game.scene = name;
      game.introAnimations = [];
      game.screenCommands = [];
      game.statusIndicator = null;
      game.statusCurrent = 0;
    };
    game.fadeOut = () => enqueueFade("out");
    game.fadeIn = () => enqueueFade("in");
    game.afterFade = (callback) => enqueueFade("after", callback);
    game.returnToGameScreen = (unfreeze) => {
      game.aerialView = false;
      game.cursorMode = 0;
      game.cursorActive = false;
      game.loadScene("SCREEN.GFX");
      game.fullScreenImage = false;
      game.mode = "world";
      updateCarriedMobiles();
      updateCells();
      if (unfreeze) game.frozen = false;
    };
    game.saveStatus = saveStatus;
    game.deleteStatus = deleteStatus;
    game.clearInteractions = (number) => {
      for (let index = 0; index < 40; index++) game.interactionData[number * 80 + index * 2] = 0;
      for (let index = 0; index < 40; index++) game.interactionData[number * 2 + index * 40] = 0;
    };
    game.layFloor = layFloor;
    game.setView = (x, y) => { game.viewX = x; game.viewY = y; layFloor(); updateAudioListener(x, y); };
    game.panTo = (x, y) => { game.viewX = Math.max(0, Math.min(56, x)); game.viewY = Math.max(0, Math.min(56, y)); layFloor(); updateAudioListener(game.viewX, game.viewY); };
    game.setPose = (index, alias) => { if (game.mobiles[index]) game.mobiles[index].pose = game.mobiles[index].poseAliases[alias] ?? 0; };
    game.setSequence = (index, sequence) => setSequence(index, sequence);
    game.placeInView = (mobile, screenX, screenY) => {
      const free = (x, y) => game.map[((y + game.viewY) * 64 + x + game.viewX) * 4 + 1] === 0xff;
      let x = screenX;
      let y = screenY;
      if (!free(screenX, screenY)) {
        let best = 0xff;
        x = 0;
        y = 0;
        for (let column = 7; column >= 0; column--) {
          for (let row = 7; row >= 0; row--) {
            if (!free(column, row)) continue;
            const distance = (Math.abs(column - screenX) + Math.abs(row - screenY)) & 255;
            if (distance > best) continue;
            best = distance;
            x = column;
            y = row;
          }
        }
      }
      mobile.x = (x + game.viewX) << 3;
      mobile.y = (y + game.viewY) << 3;
    };
    game.issueSignal = issueSignal;
    game.showSpeech = (text) => { game.speech = text; };
    game.showAerialView = () => { game.aerialView = true; game.mode = "aerial"; };
    game.plotBar = (x, y, length, style) => game.screenCommands.push({ type: "bar", x, y, length, style });
    game.showObjectIcon = (mobile, x, y) => game.screenCommands.push({ type: "object", mobile, x, y });
    game.setStatusIndicator = (mobile, attribute, x, y) => {
      game.statusIndicator = { mobile, attribute, x, y };
      game.statusCurrent = 0;
    };
    game.printText = (text, x, y) => game.screenCommands.push({ type: "text", text, x, y });
    loadStatus();
    ruleMachine = new window.RobinEngine.RuleMachine(gameProgram, game, Math.floor(Math.random() * 65536));
    window.gameProgram = gameProgram;
  })
  .catch((error) => console.error(error));

function loadImage(path) {
  if (!assets.images.has(path)) {
    const image = new Image();
    image.src = path;
    assets.images.set(path, image);
  }
  return assets.images.get(path);
}

function loadSeason(name) {
  if (assets.cubes.has(name)) return assets.cubes.get(name);
  const tiles = Array.from({ length: 60 }, (_, index) => {
    const filename = String(index).padStart(2, "0");
    return loadImage(`cubes/${name}${filename}.png`);
  });
  assets.cubes.set(name, tiles);
  return tiles;
}

const titleImage = loadImage("title.png");
const gameImage = loadImage("screen.png");
const aerialImage = loadImage("aerial.png");

function loadSprite(index) {
  if (!assets.sprites.has(index)) {
    assets.sprites.set(index, loadImage(`sprites/spr${String(index).padStart(3, "0")}.png`));
  }
  return assets.sprites.get(index);
}

function drawImage(image, x, y, width, height, flip = false) {
  if (!image || (image instanceof HTMLImageElement && (!image.complete || image.naturalWidth === 0))) return;
  if (!flip) {
    ctx.drawImage(image, x, y, width, height);
    return;
  }
  ctx.save();
  ctx.translate(x + width, y);
  ctx.scale(-1, 1);
  ctx.drawImage(image, 0, 0, width, height);
  ctx.restore();
}

function updateCells() {
  for (const mobile of game.mobiles) {
    mobile.cellX = mobile.x < 0 ? 0xff : mobile.x >> 3 & 255;
    mobile.cellY = mobile.y < 0 ? 0xff : mobile.y >> 3 & 255;
    const cubeX = mobile.cellX - game.viewX;
    const cubeY = mobile.cellY - game.viewY;
    mobile.onScreen = mobile.x >= 0 && mobile.y >= 0 && cubeX >= 0 && cubeX <= 7 && cubeY >= 0 && cubeY <= 7;
    mobile.screenX = mobile.screenY = 0xff;
    if (!mobile.onScreen) continue;
    const normalX = mobile.x - game.viewX * 8;
    const normalY = mobile.y - game.viewY * 8;
    mobile.screenX = (60 + normalX - normalY) * 2 & 255;
    mobile.screenY = 20 + normalX + normalY - mobile.z & 255;
    mobile.drawnZ = mobile.z;
    mobile.drawnDirection = mobile.direction;
    mobile.drawnPose = mobile.pose;
    mobile.drawnBase = mobile.sprite;
    mobile.drawnAbout = mobile.aboutFace;
  }
}

function isIndoors(mobile) {
  const offset = (mobile.cellY * 64 + mobile.cellX) * 4 + 1;
  if (offset >= game.map.length || game.map[offset] === 0xff) return false;
  const cube = game.map[offset];
  return cube < game.program.cubeFlags.length && (game.program.cubeFlags[cube] & 0x10) === 0;
}

function updatePuffs() {
  for (const mobile of game.mobiles) {
    mobile.puffFrame = 0xff;
    if (!mobile.onScreen || mobile.drawnBase === 0xffff || isIndoors(mobile)) continue;
    mobile.puffFrame = mobile.puff;
    if (mobile.puff !== 0xff) mobile.puff--;
  }
}

function layFloor() {
  updateCarriedMobiles();
  updateCells();
  updatePuffs();
}

function setSequence(index, number) {
  const mobile = game.mobiles[index];
  if (!mobile) return;
  mobile.seqName = number & 255;
  const words = game.program.sequences;
  let position = 0;
  for (let skipped = 0; skipped < number; skipped++) {
    while (position + 1 < words.length) {
      const value = words[position] | words[position + 1] << 8;
      position += 2;
      if (value === 0xffff) break;
    }
  }
  mobile.seqCount = 0;
  for (let word = 0; word < 16; word++) {
    const offset = position + word * 2;
    mobile.seqBuffer[word] = offset + 1 < words.length ? words[offset] | words[offset + 1] << 8 : 0;
  }
}

const avoidEntry = [1, 2, 4, 8];
const avoidExit = [8, 4, 2, 1];
const displaceX = [1, 0, 0, -1];
const displaceY = [0, -1, 1, 0];
const turnLeft = [1, 3, 0, 2];
const turnRight = [2, 0, 3, 1];

function setPose(index, alias) {
  const mobile = game.mobiles[index];
  if (mobile) mobile.pose = mobile.poseAliases[alias] ?? 0;
}

function runSequencers() {
  let budget = 100000;
  for (let index = game.mobiles.length - 1; index >= 0; index--) {
    const mobile = game.mobiles[index];
    while (mobile.seqCount !== 0x10) {
      if (mobile.seqCount > 0x10 || --budget < 0) throw new Error(`Sequence ${mobile.seqName} of mobile ${index} left its buffer`);
      const result = sequenceOperation(index, mobile, mobile.seqBuffer[mobile.seqCount]);
      if ((result & 1) === 0 && ++mobile.seqCount === 0x10) mobile.alert = true;
      if ((result & 2) === 0) break;
    }
  }
}

function sequenceOperation(index, mobile, word) {
  let high = word >> 8;
  let low = word & 255;
  switch (high >> 4) {
    case 0:
      setPose(index, low);
      sequenceMotion(mobile, high);
      return 0;
    case 1:
      mobile.direction = high & 3;
      setPose(index, low);
      return 0;
    case 2: case 3: case 4: case 5: case 6: case 7: case 8: case 9:
      return 0;
    case 10: {
      const target = game.mobiles[mobile.follow];
      if (mobile.subTargetX !== 0xff && mobile.subTargetX === mobile.targetX && mobile.subTargetY === mobile.targetY) {
        mobile.subTargetX = target.cellX;
        mobile.subTargetY = target.cellY;
      }
      mobile.targetX = target.cellX;
      mobile.targetY = target.cellY;
      return sequenceHome(mobile, high);
    }
    case 11:
      game.startSound(low, 0xff00 | index, mobile.cellX, mobile.cellY);
      return 2;
    case 12:
      return sequenceHome(mobile, high);
    case 13:
      mobile.mobility = low;
      return 2;
    case 14:
      if (low !== 0) {
        if ((low & 0xf0) === 0) low |= low << 4;
        low -= 0x10;
        mobile.seqBuffer[mobile.seqCount] = high << 8 | low;
        if ((low & 0xf0) === 0) return 2;
      }
      mobile.seqCount -= high & 15;
      return 3;
    default:
      mobile.seqCount = 0x10;
      mobile.alert = true;
      return 1;
  }
}

function sequenceMotion(mobile, kind) {
  switch (kind) {
    case 0: return;
    case 1: forward(mobile, 2); return;
    case 2: forward(mobile, 4); return;
    case 3: forward(mobile, -2); return;
    case 4: mobile.direction = turnLeft[mobile.direction & 3]; return;
    case 5: mobile.direction = turnRight[mobile.direction & 3]; return;
    case 6: mobile.z = mobile.z + 1 & 255; return;
    case 7: mobile.z = mobile.z + 2 & 255; return;
    case 8: mobile.z = mobile.z - 1 & 255; return;
    case 9: mobile.z = mobile.z - 2 & 255; return;
    case 10: forward(mobile, 3); return;
    default: throw new Error(`Sequence motion ${kind} is outside the original table`);
  }
}

function forward(mobile, distance) {
  let x = mobile.x;
  let y = mobile.y;
  switch (mobile.direction & 3) {
    case 0: x += distance; break;
    case 1: y -= distance; break;
    case 2: y += distance; break;
    default: x -= distance; break;
  }
  avoidCollision(mobile, x, y);
}

function avoidCollision(mobile, x, y) {
  if ((x >> 3 & 255) === mobile.cellX && (y >> 3 & 255) === mobile.cellY) {
    mobile.x = x; mobile.y = y; return;
  }
  if (x >= 0x200 || y >= 0x200 || x < 0 || y < 0) return;
  const direction = mobile.direction & 3;
  const current = (mobile.cellY * 64 + mobile.cellX) * 4;
  if (current + 3 >= game.map.length || (avoidExit[direction] & game.map[current + 3]) === 0) return;
  const destination = ((y >> 3) * 64 + (x >> 3)) * 4;
  if ((avoidEntry[direction] & game.map[destination + 3]) === 0) return;
  const cube = game.map[destination];
  const flags = cube < game.program.cubeFlags.length ? game.program.cubeFlags[cube] : 0;
  if (((mobile.mobility & 7 ^ 7) & flags) !== 0) return;
  mobile.x = x; mobile.y = y;
}

function enclosure(x, y, reverse = false) {
  const locations = game.program.locations;
  for (let step = 0; step < locations.length; step++) {
    const index = reverse ? locations.length - 1 - step : step;
    const location = locations[index];
    const left = location.leftRight >> 8 << 24 >> 24;
    const right = (location.leftRight & 255) << 24 >> 24;
    const top = location.topBottom >> 8 << 24 >> 24;
    const bottom = (location.topBottom & 255) << 24 >> 24;
    if ((x << 24 >> 24) >= left && (x << 24 >> 24) <= right && (y << 24 >> 24) >= top && (y << 24 >> 24) <= bottom) return index;
  }
  return -1;
}

function inside(location, x, y) {
  return (x & 255) >= (location.leftRight >> 8) && (x & 255) <= (location.leftRight & 255) && (y & 255) >= (location.topBottom >> 8) && (y & 255) <= (location.topBottom & 255);
}

function calculateRoute(mobile) {
  const source = enclosure(mobile.cellX, mobile.cellY);
  const destination = enclosure(mobile.targetX, mobile.targetY);
  if (destination === source) { mobile.subTargetX = mobile.targetX; mobile.subTargetY = mobile.targetY; return; }
  if (source === -1) {
    const outer = enclosure(mobile.targetX, mobile.targetY, true);
    if (outer < 0) return;
    const portal = game.program.locations[outer].portal;
    mobile.subTargetX = portal >> 8; mobile.subTargetY = portal & 255; return;
  }
  if (destination !== -1 && inside(game.program.locations[source], mobile.targetX, mobile.targetY)) {
    const portal = game.program.locations[destination].portal;
    mobile.subTargetX = portal >> 8; mobile.subTargetY = portal & 255; return;
  }
  const area = game.program.locations[source];
  let x = area.portal >> 8;
  let y = area.portal & 255;
  const left = area.leftRight >> 8;
  const right = area.leftRight & 255;
  const top = area.topBottom >> 8;
  const bottom = area.topBottom & 255;
  if (left === right || (x !== left && x !== right && top === bottom)) {
    const gate = game.map[(y * 64 + x) * 4 + 3];
    if (gate & 8) x++;
    else if (gate & 4) y--;
    else if (gate & 2) y++;
    else x--;
  } else if (x === left) x--;
  else if (x === right) x++;
  else if (y === top) y--;
  else y++;
  mobile.subTargetX = x & 255;
  mobile.subTargetY = y & 255;
}

function avoidsCulDeSac(mobile, direction) {
  const neighbour = enclosure(mobile.cellX + displaceX[direction], mobile.cellY + displaceY[direction]);
  if (neighbour === -1) return true;
  const area = game.program.locations[neighbour];
  return !inside(area, mobile.cellX, mobile.cellY) && !inside(area, mobile.subTargetX, mobile.subTargetY);
}

function faceBestDirection(mobile) {
  const score = [0, 0, 0, 0];
  const distance = [];
  for (let direction = 0; direction < 4; direction++) {
    const dx = (mobile.cellX + displaceX[direction] - mobile.subTargetX) << 24 >> 24;
    const dy = (mobile.cellY + displaceY[direction] - mobile.subTargetY) << 24 >> 24;
    distance[direction] = dx * dx + dy * dy;
  }
  for (let rank = 6; rank > 0; rank -= 2) {
    let best = 0x7fff; let chosen = 0;
    for (let direction = 0; direction < 4; direction++) if (distance[direction] < best) { best = distance[direction]; chosen = direction; }
    distance[chosen] = 0x7fff; score[chosen] = rank;
  }
  score[(mobile.direction & 3) ^ 3] -= 8;
  let blocked = 0;
  const here = (mobile.cellY * 64 + mobile.cellX) * 4;
  for (let direction = 3; direction >= 0; direction--) {
    const ahead = here + (direction === 0 ? 4 : direction === 1 ? -256 : direction === 2 ? 256 : -4);
    let open = ahead >= 0 && ahead + 3 < game.map.length && (avoidEntry[direction] & game.map[ahead + 3]) !== 0 && (avoidExit[direction] & game.map[here + 3]) !== 0;
    if (open) {
      if ((game.map[ahead + 3] & 0x80) !== 0 && avoidsCulDeSac(mobile, direction)) score[direction] -= 20;
      const cube = game.map[ahead];
      const flags = cube < game.program.cubeFlags.length ? game.program.cubeFlags[cube] : 0;
      open = ((mobile.mobility & 7 ^ 7) & flags) === 0;
    }
    if (!open) { score[direction] = -98; blocked++; }
  }
  if (blocked) score[mobile.direction & 3] += 3;
  let bestScore = -99; let bestDirection = 0;
  for (let direction = 3; direction >= 0; direction--) if (bestScore < score[direction]) { bestScore = score[direction]; bestDirection = direction; }
  mobile.direction = bestDirection;
}

function sequenceHome(mobile, high) {
  let recalculate;
  if (mobile.subTargetX === 0xff) recalculate = true;
  else if (mobile.subTargetX !== mobile.cellX || mobile.subTargetY !== mobile.cellY) recalculate = false;
  else if (mobile.subTargetX !== mobile.targetX || mobile.subTargetY !== mobile.targetY) recalculate = true;
  else return 2;
  if (recalculate) {
    calculateRoute(mobile);
    mobile.direction = window.RobinEngine.RuleMachine.whichWay(mobile.subTargetX - mobile.cellX, mobile.subTargetY - mobile.cellY);
  }
  faceBestDirection(mobile);
  mobile.seqCount -= high & 15;
  return 3;
}

function updateCarriedMobiles() {
  for (let index = game.mobiles.length - 1; index >= 0; index--) {
    const mobile = game.mobiles[index];
    if (mobile.carriedBy === 255) continue;
    const carrier = game.mobiles[mobile.carriedBy];
    if (!carrier) throw new Error("Invalid carrier");
    mobile.z = carrier.z + mobile.above & 255;
    mobile.direction = carrier.direction;
    mobile.x = carrier.x; mobile.y = carrier.y;
    if (carrier.direction === 0) mobile.x -= mobile.behind;
    else if (carrier.direction === 1) mobile.y += mobile.behind;
    else if (carrier.direction === 2) mobile.y -= mobile.behind;
    else mobile.x += mobile.behind;
  }
}

function followCamera() {
  if (game.cameraLock < 0 || game.cameraLock >= game.mobiles.length) return;
  const mobile = game.mobiles[game.cameraLock];
  if (mobile.x < 0 || mobile.y < 0) return;
  const relativeX = (mobile.x >> 3) - game.viewX;
  const relativeY = (mobile.y >> 3) - game.viewY;
  const dx = relativeX < 1 ? -4 : relativeX > 6 ? 4 : 0;
  const dy = relativeY < 1 ? -4 : relativeY > 6 ? 4 : 0;
  if (dx || dy) game.panTo(game.viewX + dx, game.viewY + dy);
}

function interactionState(viewer, other) {
  const dx = (viewer.cellX - other.cellX) << 24 >> 24;
  const dy = (viewer.cellY - other.cellY) << 24 >> 24;
  if (dx >= 6 || dx <= -6 || dy >= 6 || dy <= -6) return 0;
  if (viewer.cellX === other.cellX && viewer.cellY === other.cellY) return 4;
  if (viewer.type & 4) return 0;
  let state;
  switch (viewer.direction) {
    case 0: if ((other.cellX << 24 >> 24) <= (viewer.cellX << 24 >> 24)) return 1; state = viewer.cellY !== other.cellY ? 2 : 3; break;
    case 1: if ((other.cellY << 24 >> 24) >= (viewer.cellY << 24 >> 24)) return 1; state = viewer.cellX !== other.cellX ? 2 : 3; break;
    case 2: if ((other.cellY << 24 >> 24) <= (viewer.cellY << 24 >> 24)) return 1; state = viewer.cellX !== other.cellX ? 2 : 3; break;
    default: if ((other.cellX << 24 >> 24) >= (viewer.cellX << 24 >> 24)) return 1; state = viewer.cellY !== other.cellY ? 2 : 3;
  }
  return obstructed(viewer.cellX, viewer.cellY, other.cellX, other.cellY) ? 1 : state;
}

function obstructed(fromX, fromY, toX, toY) {
  let major = (toX - fromX) << 24 >> 24;
  let minor = (toY - fromY) << 24 >> 24;
  let stepX, stepY;
  if (major < 0) { major = -major; stepX = -4; } else stepX = 4;
  if (minor < 0) { minor = -minor; stepY = -256; } else stepY = 256;
  let straight;
  if (major >= minor) straight = stepX;
  else { [major, minor] = [minor, major]; straight = stepY; }
  const diagonal = stepX + stepY;
  const doubled = minor * 2 << 24 >> 24;
  let error = doubled - major << 24 >> 24;
  const straightIncrement = doubled;
  const diagonalIncrement = doubled - major - major << 24 >> 24;
  let position = fromY * 256 + fromX * 4 + 1;
  for (let step = 0; step <= major; step++) {
    if (position < 0 || position >= game.map.length || game.map[position] !== 0xff) return true;
    if (error < 0) { position += straight; error = error + straightIncrement << 24 >> 24; }
    else { position += diagonal; error = error + diagonalIncrement << 24 >> 24; }
  }
  return false;
}

function checkInteractions() {
  for (let source = game.mobiles.length - 1; source >= 0; source--) {
    const viewer = game.mobiles[source];
    if (viewer.type & 1) continue;
    for (let target = game.mobiles.length - 1; target >= 0; target--) {
      const other = game.mobiles[target];
      let state = 0;
      if (source !== target && target !== viewer.carriedBy && source !== other.carriedBy && !(other.type & 2) && other.cellX !== 0xff) {
        state = interactionState(viewer, other);
      }
      const offset = source * 80 + target * 2;
      const current = game.interactionData[offset];
      if (current !== state) viewer.alert = true;
      game.interactionData[offset + 1] = current;
      game.interactionData[offset] = state;
    }
  }
}

function updateStung() {
  for (let index = game.mobiles.length - 1; index >= 0; index--) {
    const mobile = game.mobiles[index];
    const offset = (mobile.cellY * 64 + mobile.cellX) * 4 + 3;
    const flag = offset < game.map.length ? game.map[offset] & 0x40 : 0;
    if (flag === game.stung[index]) continue;
    game.stung[index] = flag;
    if (flag) mobile.alert = true;
  }
}

function issueSignal(target, value, delay) {
  const slot = game.signalTarget.indexOf(0xffff);
  if (slot < 0) return;
  game.signalTarget[slot] = target & 0xffff;
  game.signalValue[slot] = value & 0xffff;
  game.signalDue[slot] = game.signalTime + delay & 0xffff;
}

function sendSignal(target, value) {
  if (game.mobileSignals[target] === 0xffff) {
    game.mobiles[target].alert = true;
    game.mobileSignals[target] = value;
  } else game.signalStack[target] = value;
}

function receiveSignals() {
  for (let index = 0; index < game.mobiles.length; index++) {
    if (game.signalStack[index] === 0xffff) continue;
    game.mobileSignals[index] = game.signalStack[index];
    game.signalStack[index] = 0xffff;
    game.mobiles[index].alert = true;
  }
  game.signalTime = game.signalTime + 1 & 0xffff;
  for (let index = 0; index < 10; index++) {
    const target = game.signalTarget[index];
    const value = game.signalValue[index];
    if (target === 0xffff || game.signalDue[index] !== game.signalTime) continue;
    game.signalTarget[index] = 0xffff;
    if (target >> 8 === 0) sendSignal(target, value);
    else if (target >> 8 === 3) for (let mobile = game.mobiles.length - 1; mobile >= 0; mobile--) sendSignal(mobile, value);
    else {
      for (let mobile = 0; mobile < game.mobiles.length; mobile++) {
        if (game.interactionData[mobile * 80 + (value & 255) * 2] >= target >> 8) sendSignal(mobile, value);
      }
    }
  }
}

function buttonUpdate(button, state) {
  if (game.buttonStates[button] < 2) return;
  game.buttonNumber = button;
  if (state === 2) {
    if (game.cursorActive) return;
    game.buttonStates[button] = 2;
    game.pendingInput = 2;
    return;
  }
  if (game.cursorActive) { game.endTargeting(); return; }
  for (let index = 0; index < game.buttonStates.length; index++) if (game.buttonStates[index] === 3) game.buttonStates[index] = 2;
  game.buttonStates[button] = 3;
  if (game.program.buttons[button].type === 1) { game.cursorActive = true; game.cursorMode = 1; }
  else game.pendingInput = 1;
}

function processInput() {
  if (game.keyboard.length) {
    const key = game.keyboard[0];
    if (key === 0x38) { game.cheatAlt = true; game.cheatPointer = 0; }
    else if (game.cheatAlt && key === 0xb8) {
      game.cheatAlt = false;
      if (game.cheatPointer === 3) game.pendingInput = 6;
    } else if (game.cheatAlt && game.cheatPointer < 3 && key >= 2 && key <= 0x0b) {
      game.cheatValues[game.cheatPointer++] = key;
    }
  }
  if (game.keyboard.length) {
    const key = game.keyboard.shift();
    game.keyAvailable = game.keyboard.length > 0;
    const button = game.program.buttons.findIndex((entry, index) => game.buttonScancodes[index] === (key & 0x7f));
    if (button >= 0) { buttonUpdate(button, key & 0x80 ? 2 : 1); return; }
  }
  if (game.clickState === 0) {
    if (!game.releasePending) return;
    game.releasePending = false;
    game.clickState = 2;
  }
  const state = game.clickState;
  game.clickState = 0;
  game.clickPending = false;
  if (state === 2) { if (game.buttonNumber !== -1) buttonUpdate(game.buttonNumber, 2); return; }
  for (let index = game.program.buttons.length - 1; index >= 0; index--) {
    const button = game.program.buttons[index];
    if (game.clickX >= button.x && game.clickY >= button.y && game.clickX <= button.x + 16 && game.clickY <= button.y + 16) {
      buttonUpdate(index, 1); return;
    }
  }
  const x = game.clickX - 64;
  const y = game.clickY - 16;
  if (x < 0 || x > 255 || y < 0 || y > 176) return;
  for (let index = 0; index < game.mobiles.length; index++) {
    const mobile = game.mobiles[index];
    if (index === game.host || !mobile.onScreen || x < mobile.screenX || x > mobile.screenX + 17 || y < mobile.screenY || y > mobile.screenY + 17) continue;
    game.mobileHit = index;
    game.pendingInput = game.cursorActive ? 3 : 4;
    return;
  }
  const cubeX = (x - 8 >> 4) - 7;
  const cubeY = (y - 4 >> 3) - 4;
  const mapY = cubeY - cubeX >> 1;
  const mapX = cubeY - mapY;
  if (mapX >= 0 && mapX < 8 && mapY >= 0 && mapY < 8) {
    game.mapHit = (mapX + game.viewX) << 8 | mapY + game.viewY;
    game.pendingInput = 5;
  }
}

function decrementTimers() {
  for (const mobile of game.mobiles) {
    const index = 2 + game.animationCount;
    if (mobile.attributes[index] === 1) mobile.attributes[index] = 0;
    else if (mobile.attributes[index] > 1 && --mobile.attributes[index] === 1) mobile.alert = true;
  }
}

function updateStatusIndicator() {
  const indicator = game.statusIndicator;
  if (!indicator) return;
  const target = indicator.mobile.attributes[indicator.attribute] * 25 >> 8;
  if (target === game.statusCurrent) return;
  game.statusDirection = target > game.statusCurrent ? 1 : -1;
  game.statusCurrent += game.statusDirection;
}

function checkAerialExit() {
  if (game.keyAvailable) takeKey();
  else if (game.clickPending) {
    game.consumeClick();
    game.mobileHit = -1;
    game.mapHit = -1;
    const x = game.clickX >> 2;
    const y = Math.floor(game.clickY / 3);
    if (x < 64 && y < 0x40) {
      game.mapHit = x << 8 | y;
      game.pendingInput = 5;
    }
  } else return false;
  game.aerialView = false;
  game.interruptFade = true;
  game.pendingTime = 0;
  game.returnToGameScreen(false);
  return true;
}

function advanceWorldTick() {
  game.intervalCount++;
  game.introFrame = game.introFrame + 1 & 7;
  game.animationCount ^= 1;
  if (game.frozen) return;
  if (game.aerialView) {
    if (checkAerialExit()) return;
    runSequencers();
    decrementTimers();
    checkInteractions();
    updateStung();
    receiveSignals();
    updateCarriedMobiles();
    updateCells();
    return;
  }
  followCamera();
  layFloor();
  if (game.speechCount && --game.speechCount === 0) { game.speaking = -1; game.speech = ""; }
  runSequencers();
  decrementTimers();
  checkInteractions();
  updateStung();
  receiveSignals();
  processInput();
  if (game.animationCount === 1) {
    for (let index = 0; index < game.program.buttons.length; index++) {
      if (game.buttonRegen[index] && --game.buttonRegen[index] === 0) game.buttonStates[index] = 2;
    }
  }
  updateStatusIndicator();
}

function drawGameText(text, x, y) {
  for (const character of String(text)) {
    const code = character.charCodeAt(0);
    if (code < 127) drawImage(loadImage(`chars/char${String(code).padStart(3, "0")}.png`), x, y, 4, 8);
    x += 4;
  }
}

function drawIcon(index, x, y, flip = false) {
  const image = loadImage("ideogram.png");
  if (!image.complete || image.naturalWidth === 0 || index < 0 || index >= 100) return;
  if (!iconAtlasReady) {
    iconAtlas.width = 320;
    iconAtlas.height = 80;
    iconAtlasContext.drawImage(image, 0, 0, 320, 80, 0, 0, 320, 80);
    const pixels = iconAtlasContext.getImageData(0, 0, 320, 80);
    for (let offset = 0; offset < pixels.data.length; offset += 4) {
      if (pixels.data[offset] === 0 && pixels.data[offset + 1] === 24 && pixels.data[offset + 2] === 0) pixels.data[offset + 3] = 0;
    }
    iconAtlasContext.putImageData(pixels, 0, 0);
    iconAtlasReady = true;
  }
  const sourceX = index % 20 * 16;
  const sourceY = Math.floor(index / 20) * 16;
  if (!flip) {
    ctx.drawImage(iconAtlas, sourceX, sourceY, 16, 16, x, y, 16, 16);
    return;
  }
  ctx.save();
  ctx.translate(x + 16, y);
  ctx.scale(-1, 1);
  ctx.drawImage(iconAtlas, sourceX, sourceY, 16, 16, 0, 0, 16, 16);
  ctx.restore();
}

function drawScreenCommands() {
  for (const command of game.screenCommands) {
    if (command.type === "text") {
      ctx.fillStyle = "#fff";
      ctx.fillRect(command.x, command.y, String(command.text).length * 4, 8);
      drawGameText(command.text, command.x, command.y);
    } else if (command.type === "bar") {
      let x = command.x;
      let length = command.length;
      if (command.style === 45) {
        x += 35;
        length -= 35;
        if (length < 0) { x += length; length = -length; }
      }
      if (length === 0) length = 1;
      ctx.fillStyle = "#91a64a";
      ctx.fillRect(x, command.y, length, 4);
    } else if (command.type === "object") {
      ctx.fillStyle = "#002018";
      ctx.fillRect(command.x, command.y, 16, 16);
      drawImage(loadSprite(command.mobile.sprite), command.x, command.y, 16, 16);
    }
  }
}

function drawSpeech() {
  if (!game.speech) return;
  const widths = [244, 248, 250, 250, 252, 252, 252, 252, 252, 252, 252, 252, 250, 250, 248, 244];
  for (let row = 0; row < widths.length; row++) {
    const half = widths[row] >> 1;
    ctx.fillStyle = "#EFEFEF";
    ctx.fillRect(192 - half, row, half * 2, 1);
  }
  const lines = game.speech.split("|");
  for (let index = 0; index < Math.min(2, lines.length); index++) {
    drawGameText(lines[index], 70 + (61 - lines[index].length) * 2, lines.length > 1 ? index * 8 : 4);
  }
}

function drawStatusIndicator() {
  const indicator = game.statusIndicator;
  if (!indicator) return;
  const activeRows = game.statusCurrent * 4;
  const activeColor = game.statusDirection > 0 ? "#2024FF" : "#E70000";
  for (let row = 0; row < 100; row++) {
    ctx.fillStyle = row < activeRows ? activeColor : "#868686";
    ctx.fillRect(indicator.x, indicator.y - row, 3, 1);
  }
}

function drawTitle() {
  ctx.fillStyle = "#050803";
  ctx.fillRect(0, 0, 320, 200);
  const imagePath = game.scene.toLowerCase().replace(/\.gfx$/, ".png");
  drawImage(loadImage(imagePath), 0, 0, 320, 200);
  for (const animation of game.introAnimations) {
    if (!animation) continue;
    const frame = animation.frames[game.introFrame];
    drawImage(loadImage(`ideogram/ide${String(frame).padStart(3, "0")}.png`), animation.x, animation.y, 16, 16);
  }
  drawSpeech();
}

function drawWorld() {
  drawImage(gameImage, 0, 0, 320, 200);
  drawScreenCommands();
  drawSpeech();
  drawStatusIndicator();
  const cubeSet = game.cubeSetCode >= 0x30 ? game.cubeSetCode - 0x30 : 0;
  const tiles = loadSeason(seasons[cubeSet] ?? seasons[0]);

  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      drawCube(tiles, x, y, 0);
    }
  }

  const visibleMobiles = game.mobiles.filter((mobile) => mobile.onScreen).sort((first, second) => {
    const cubeY = first.cellY - second.cellY;
    if (cubeY) return cubeY;
    const cubeX = first.cellX - second.cellX;
    if (cubeX) return cubeX;
    const z = (first.drawnZ << 24 >> 24) - (second.drawnZ << 24 >> 24);
    if (z) return z;
    return (first.screenY << 24 >> 24) - (second.screenY << 24 >> 24);
  });
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const worldX = game.viewX + x;
      const worldY = game.viewY + y;
      drawCube(tiles, x, y, 1);
      const structure = game.map[(worldY * 64 + worldX) * 4 + 1];
      const indoors = structure !== 0xff && (game.program.cubeFlags[structure] & 0x10) === 0;
      for (const mobile of visibleMobiles) {
        if (mobile.cellX !== worldX || mobile.cellY !== worldY) continue;
        if (mobile.id === game.speaking) drawBubbleLine(mobile.screenX, mobile.screenY);
        if (!indoors) drawMobile(mobile);
      }
      drawCube(tiles, x, y, 2);
    }
  }

  for (let index = 0; index < game.program.buttons.length; index++) {
    const button = game.program.buttons[index];
    const sprite = index + game.buttonStates[index] * 20;
    if (sprite < 100) drawIcon(sprite, button.x, button.y);
  }
}

function drawBubbleLine(left, top) {
  const color = "#fff";
  let column = left + 8;
  let height = top;
  do {
    drawVerticalLine(64 + column--, height, color);
    height >>= 1;
  } while (height > 0);
  column = left + 9;
  height = top >> 1;
  for (; height > 0; height >>= 1) drawVerticalLine(64 + column++, height, color);
}

function drawVerticalLine(x, bottom, color) {
  if (x < 64 || x >= 320) return;
  ctx.fillStyle = color;
  ctx.fillRect(x, 16, 1, Math.min(bottom, 175) + 1);
}

function drawCube(tiles, x, y, level) {
  if (!gameData) return;
  const mapX = game.viewX + x;
  const mapY = game.viewY + y;
  const offset = (mapY * gameData.mapWidth + mapX) * gameData.mapLevels + level;
  let tileIndex = game.map[offset];
  if (tileIndex === 255 || tileIndex >= tiles.length) return;
  if (level > 0 && (game.program.cubeFlags[tileIndex] & 0x80) !== 0) tileIndex += game.animationCount;
  if (tileIndex >= tiles.length) return;
  const left = 64 + (7 + x - y) * 16;
  const top = 16 + (4 + x + y - level * 2) * 8;
  drawImage(tiles[tileIndex], left, top, 32, 32);
}

function drawMobile(mobile) {
  if (mobile.drawnBase === 0xffff) return;
  const left = 64 + mobile.screenX;
  const top = 16 + mobile.screenY;
  const flip = (mobile.drawnDirection & 2) !== 0;
  if (mobile.puffFrame !== 0xff) {
    drawIcon(0x52 + mobile.puffFrame, left, top, flip);
    return;
  }
  const sprite = mobile.drawnBase + mobile.drawnPose + ((mobile.drawnDirection & 1) !== 0 ? mobile.drawnAbout : 0);
  if (sprite < 480) drawImage(loadSprite(sprite), left, top, 16, 16, flip);
}

function drawAerial() {
  drawImage(aerialImage, 0, 0, 320, 200);
  for (const mobile of game.mobiles) {
    if ((mobile.type & 2) !== 0 || mobile.cellY === 0xff) continue;
    ctx.fillStyle = mobile.id === game.host ? "#fff16c" : "#d5d38a";
    ctx.fillRect(mobile.cellX * 4 + 1, mobile.cellY * 3 + 1, 1, 1);
  }
}

function render() {
  ctx.imageSmoothingEnabled = false;
  if (game.aerialView || game.mode === "aerial") drawAerial();
  else if (game.fullScreenImage) drawTitle();
  else drawWorld();
  outputContext.drawImage(frameCanvas, 0, 0);
  requestAnimationFrame(render);
}

function audibleVolume(sound, x, y) {
  const [ambient, priority, range] = soundMetadata[sound] ?? [];
  if (ambient === undefined) return 0;
  let distance = x >= audioListenerX && x < audioListenerX + 8 && y >= audioListenerY && y < audioListenerY + 8 ? 2
    : x >= audioListenerX - 6 && x < audioListenerX + 14 && y >= audioListenerY - 6 && y < audioListenerY + 14 ? 1 : 0;
  if (range === 0) distance &= 2;
  else if (range === 2) distance |= 1;
  else if (range === 3) distance = 3;
  return distance === 0 ? 0 : distance === 1 ? 90 : 128;
}

function makeEffectAudio(sound, volume) {
  const audio = new Audio(musicPath(sound));
  audio.loop = soundMetadata[sound][3];
  audio.volume = volume / 128;
  const playback = audio.play();
  if (playback) playback.catch(() => {});
  return audio;
}

function stopEffectAudio(audio) {
  if (!audio) return;
  audio.pause();
  audio.currentTime = 0;
}

function startSound(sound, emitter, x, y) {
  const metadata = soundMetadata[sound];
  const volume = audibleVolume(sound, x, y);
  if (!metadata || !volume) return;
  if (!metadata[0]) {
    if (transientEffect && !transientEffect.ended) return;
    transientEffect = makeEffectAudio(sound, volume);
    return;
  }
  for (let index = soundSources.length - 1; index >= 0; index--) {
    if (soundSources[index].emitter === emitter) soundSources.splice(index, 1);
  }
  if (currentAmbientSource?.emitter === emitter) {
    stopEffectAudio(ambientEffect);
    ambientEffect = null;
    currentAmbientSource = null;
  }
  if (soundSources.length < 20) soundSources.push({ sound, emitter, x, y });
  refreshAmbientSound();
}

function stopSound(emitter) {
  for (let index = soundSources.length - 1; index >= 0; index--) {
    if (soundSources[index].emitter === emitter) soundSources.splice(index, 1);
  }
  if (currentAmbientSource?.emitter === emitter) {
    stopEffectAudio(ambientEffect);
    ambientEffect = null;
    currentAmbientSource = null;
  }
  refreshAmbientSound();
}

function refreshAmbientSound() {
  if (game.music) return;
  if (ambientEffect?.ended && currentAmbientSource) {
    const finished = currentAmbientSource;
    const index = soundSources.indexOf(finished);
    if (index >= 0) soundSources.splice(index, 1);
    currentAmbientSource = null;
    ambientEffect = null;
  }
  let best = null;
  let bestVolume = 0;
  for (const source of soundSources) {
    const volume = audibleVolume(source.sound, source.x, source.y);
    if (!volume || (best && soundMetadata[source.sound][1] <= soundMetadata[best.sound][1])) continue;
    best = source;
    bestVolume = volume;
  }
  if (best === currentAmbientSource) {
    if (ambientEffect) ambientEffect.volume = bestVolume / 128;
    return;
  }
  stopEffectAudio(ambientEffect);
  ambientEffect = null;
  currentAmbientSource = best;
  if (best) ambientEffect = makeEffectAudio(best.sound, bestVolume);
}

function updateAudioListener(x, y) {
  audioListenerX = x;
  audioListenerY = y;
  refreshAmbientSound();
}

function musicPath(track) {
  if (!Number.isInteger(track) || track < 0 || track >= 53) return "";
  return track === 44 ? "music/044_a.mp3" : `music/${String(track).padStart(3, "0")}.mp3`;
}

function playMusicSource(source, request) {
  if (!game.music || request !== musicRequest || !source) return;
  music.pause();
  musicSource = source;
  music.src = source;
  music.load();
  const playback = music.play();
  if (playback) playback.catch(() => {});
}

function startMusic() {
  if (!game.music) return;
  const source = musicPath(game.track);
  const request = ++musicRequest;
  if (!source) return;
  playMusicSource(source, request);
}

function playGameMusic(track) {
  if (!musicPath(track) || (track < soundMetadata.length && !soundMetadata[track])) return;
  game.track = track;
  game.music = true;
  if (track < soundMetadata.length) music.loop = soundMetadata[track][3];
  else music.loop = true;
  stopEffectAudio(transientEffect);
  transientEffect = null;
  stopEffectAudio(ambientEffect);
  ambientEffect = null;
  currentAmbientSource = null;
  startMusic();
}

function resumeMusic() {
  if (!game.music || !music.paused || !musicSource) return;
  const playback = music.play();
  if (playback) playback.catch(() => {});
}

function stopMusic() {
  game.music = false;
  musicRequest++;
  music.pause();
  music.currentTime = 0;
  stopEffectAudio(transientEffect);
  transientEffect = null;
  stopEffectAudio(ambientEffect);
  ambientEffect = null;
  currentAmbientSource = null;
}

const statusMapBytes = 0x4000;
const statusDataBytes = 0x2117;
const statusStorageKey = "RobinHood.STATUS.DTA";

function saveStatus() {
  const file = new Uint8Array(statusMapBytes + statusDataBytes);
  file.set(game.map.subarray(0, statusMapBytes));
  const data = new DataView(file.buffer, statusMapBytes, statusDataBytes);
  const setByte = (offset, value) => data.setUint8(offset, value ?? 0);
  const setWord = (offset, value) => data.setUint16(offset, value ?? 0, true);
  setWord(0, game.program.timeFrame);
  setWord(2, game.cameraLock);
  setWord(4, game.host);
  setByte(6, game.cubeSetCode);
  setWord(7, game.mobiles.length);
  for (let slot = 0; slot < 40; slot++) {
    const mobile = game.mobiles[slot];
    setWord(0x09 + slot * 2, mobile?.x ?? 0xffff);
    setWord(0x59 + slot * 2, mobile?.y ?? 0xffff);
    setByte(0xa9 + slot, mobile?.z);
    setByte(0xd1 + slot, mobile?.direction);
    setByte(0xf9 + slot, mobile?.carriedBy ?? 0xff);
    setByte(0x121 + slot, mobile?.behind ?? 4);
    setByte(0x149 + slot, mobile?.above);
    setByte(0x171 + slot, mobile?.type);
    setByte(0x199 + slot, mobile?.targetX);
    setByte(0x1c1 + slot, mobile?.targetY);
    setByte(0x1e9 + slot, mobile?.subTargetX ?? 0xff);
    setByte(0x211 + slot, mobile?.subTargetY ?? 0xff);
    setByte(0x239 + slot, mobile?.follow);
    setWord(0x261 + slot * 2, mobile?.baseSprite ?? 0xffff);
    setByte(0x2b1 + slot, mobile?.pose);
    setByte(0x2d9 + slot, mobile?.aboutFace ?? 0x14);
    setByte(0x301 + slot, mobile?.mobility);
    setByte(0x329 + slot, !mobile || mobile.alert ? 1 : 0);
    if (mobile) {
      file.set(mobile.attributes, statusMapBytes + 0xfd1 + slot * 32);
      file.set(mobile.poseAliases, statusMapBytes + 0x1599 + slot * 32);
    }
    for (let word = 0; word < 16; word++) {
      setWord(0x1b11 + slot * 32 + word * 2, mobile?.seqBuffer[word] ?? 0xffff);
    }
    setByte(0x14d1 + slot, mobile?.behavior);
    setByte(0x14f9 + slot, mobile?.homeX);
    setByte(0x1521 + slot, mobile?.homeY);
    setWord(0x1549 + slot * 2, game.mobileSignals[slot] ?? 0xffff);
    setByte(0x1a99 + slot, mobile?.puff ?? 0xff);
    setByte(0x1ac1 + slot, mobile?.savedMode);
    setByte(0x2011 + slot, mobile?.seqCount ?? 0x10);
    setByte(0x2039 + slot, mobile?.seqName ?? 0xff);
    setWord(0x209f + slot * 2, game.signalStack[slot] ?? 0xffff);
    setByte(0x20ef + slot, mobile?.speed ?? 0x0f);
  }
  file.set(game.interactionData, statusMapBytes + 0x351);
  file.set(game.buttonStates, statusMapBytes + 0x1ae9);
  file.set(game.buttonRegen, statusMapBytes + 0x1afd);
  for (let entry = 0; entry < 10; entry++) {
    const offset = 0x2061 + entry * 6;
    setWord(offset, game.signalDue[entry]);
    setWord(offset + 2, game.signalTarget[entry]);
    setWord(offset + 4, game.signalValue[entry]);
  }
  setWord(0x209d, game.signalTime);
  let binary = "";
  for (let offset = 0; offset < file.length; offset += 0x4000) {
    binary += String.fromCharCode(...file.subarray(offset, offset + 0x4000));
  }
  try {
    localStorage.setItem(statusStorageKey, btoa(binary));
  } catch (error) {
    console.error("Could not save game status", error);
  }
}

function loadStatus() {
  let encoded;
  try {
    encoded = localStorage.getItem(statusStorageKey);
  } catch (error) {
    console.error("Could not read game status", error);
    return false;
  }
  if (!encoded) return false;
  try {
    const binary = atob(encoded);
    if (binary.length !== statusMapBytes + statusDataBytes) return false;
    const file = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const data = new DataView(file.buffer, statusMapBytes, statusDataBytes);
    if (data.getUint16(7, true) !== game.mobiles.length) return false;
    const getByte = (offset) => data.getUint8(offset);
    const getWord = (offset) => data.getUint16(offset, true);
    game.map.set(file.subarray(0, statusMapBytes));
    game.cameraLock = data.getInt16(2, true);
    game.host = getWord(4);
    game.cubeSetCode = getByte(6);
    for (let slot = 0; slot < game.mobiles.length; slot++) {
      const mobile = game.mobiles[slot];
      mobile.x = data.getInt16(0x09 + slot * 2, true);
      mobile.y = data.getInt16(0x59 + slot * 2, true);
      mobile.z = getByte(0xa9 + slot);
      mobile.direction = getByte(0xd1 + slot);
      mobile.carriedBy = getByte(0xf9 + slot);
      mobile.behind = data.getInt8(0x121 + slot);
      mobile.above = getByte(0x149 + slot);
      mobile.type = getByte(0x171 + slot);
      mobile.targetX = getByte(0x199 + slot);
      mobile.targetY = getByte(0x1c1 + slot);
      mobile.subTargetX = getByte(0x1e9 + slot);
      mobile.subTargetY = getByte(0x211 + slot);
      mobile.follow = getByte(0x239 + slot);
      mobile.baseSprite = getWord(0x261 + slot * 2);
      mobile.pose = getByte(0x2b1 + slot);
      mobile.aboutFace = getByte(0x2d9 + slot);
      mobile.mobility = getByte(0x301 + slot);
      mobile.alert = getByte(0x329 + slot) !== 0;
      mobile.attributes.set(file.subarray(statusMapBytes + 0xfd1 + slot * 32, statusMapBytes + 0xfd1 + (slot + 1) * 32));
      mobile.poseAliases.set(file.subarray(statusMapBytes + 0x1599 + slot * 32, statusMapBytes + 0x1599 + (slot + 1) * 32));
      for (let word = 0; word < 16; word++) mobile.seqBuffer[word] = getWord(0x1b11 + slot * 32 + word * 2);
      mobile.behavior = getByte(0x14d1 + slot);
      mobile.homeX = getByte(0x14f9 + slot);
      mobile.homeY = getByte(0x1521 + slot);
      game.mobileSignals[slot] = getWord(0x1549 + slot * 2);
      mobile.puff = getByte(0x1a99 + slot);
      mobile.savedMode = getByte(0x1ac1 + slot);
      mobile.seqCount = getByte(0x2011 + slot);
      mobile.seqName = getByte(0x2039 + slot);
      game.signalStack[slot] = getWord(0x209f + slot * 2);
      mobile.speed = getByte(0x20ef + slot);
    }
    game.interactionData.set(file.subarray(statusMapBytes + 0x351, statusMapBytes + 0xfd1));
    game.buttonStates.set(file.subarray(statusMapBytes + 0x1ae9, statusMapBytes + 0x1afd));
    game.buttonRegen.set(file.subarray(statusMapBytes + 0x1afd, statusMapBytes + 0x1b11));
    for (let entry = 0; entry < 10; entry++) {
      const offset = 0x2061 + entry * 6;
      game.signalDue[entry] = getWord(offset);
      game.signalTarget[entry] = getWord(offset + 2);
      game.signalValue[entry] = getWord(offset + 4);
    }
    game.signalTime = getWord(0x209d);
    game.firstTime = false;
    game.loadScene("SCREEN.GFX");
    game.fullScreenImage = false;
    game.aerialView = false;
    game.mode = "world";
    game.frozen = false;
    updateCarriedMobiles();
    updateCells();
    layFloor();
    updateAudioListener(game.viewX, game.viewY);
    return true;
  } catch (error) {
    console.error("Could not restore game status", error);
    return false;
  }
}

function deleteStatus() {
  try {
    localStorage.removeItem(statusStorageKey);
  } catch (error) {
    console.error("Could not delete game status", error);
  }
}

function keyScancode(key) {
  const letters = [0x1e, 0x30, 0x2e, 0x20, 0x12, 0x21, 0x22, 0x23, 0x17, 0x24, 0x25, 0x26, 0x32, 0x31, 0x18, 0x19, 0x10, 0x13, 0x1f, 0x14, 0x16, 0x2f, 0x11, 0x2d, 0x15, 0x2c];
  if (key.length === 1 && key >= "a" && key <= "z") return letters[key.charCodeAt(0) - 97];
  if (key >= "1" && key <= "9") return key.charCodeAt(0) - 48 + 1;
  if (key === "0") return 0x0b;
  if (/^f([1-9]|1[0-2])$/.test(key)) {
    const number = Number(key.slice(1));
    return number <= 10 ? 0x3a + number : 0x4c + number;
  }
  return ({
    escape: 0x01, "-": 0x0c, "=": 0x0d, backspace: 0x0e, tab: 0x0f, "[": 0x1a, "]": 0x1b, enter: 0x1c,
    ";": 0x27, "'": 0x28, "`": 0x29, "\\": 0x2b, ",": 0x33, ".": 0x34, "/": 0x35, " ": 0x39,
    control: 0x1d, shift: 0x2a, alt: 0x38, arrowup: 0x48, arrowleft: 0x4b, arrowright: 0x4d, arrowdown: 0x50
  })[key] ?? 0;
}

function buttonScancode(key) {
  if (key === 13) return keyScancode("enter");
  if (key === 32) return keyScancode(" ");
  if (key >= 65 && key <= 90) return keyScancode(String.fromCharCode(key).toLowerCase());
  return key === 255 ? 0 : key;
}

function moveRobinWithArrow(key) {
  if (game.mode !== "world" || game.frozen || game.fullScreenImage || game.aerialView) return false;
  const directions = { arrowup: [0, -1], arrowdown: [0, 1], arrowleft: [-1, 0], arrowright: [1, 0] };
  const direction = directions[key];
  const robin = game.mobiles[game.host];
  if (!direction || !robin || robin.cellX > 63 || robin.cellY > 63) return false;
  const targetX = robin.cellX + direction[0];
  const targetY = robin.cellY + direction[1];
  if (targetX < 0 || targetX > 63 || targetY < 0 || targetY > 63) return false;
  game.mapHit = targetX << 8 | targetY;
  game.pendingInput = 5;
  return true;
}

const handledArrowKeys = new Set();

function storeScancode(scancode) {
  if (swallowNextKey) { swallowNextKey = false; return; }
  if (scancode === lastScancode) return;
  lastScancode = scancode;
  if (game.keyboard.length >= 7) return;
  game.keyboard.push(scancode);
  game.keyAvailable = true;
}

function takeKey() {
  const key = game.keyboard.shift() ?? 0;
  if (game.keyboard.length) game.keyboard.shift();
  else swallowNextKey = true;
  game.keyAvailable = game.keyboard.length > 0;
  return key;
}

function clearKeys() {
  game.keyboard.length = 0;
  game.keyAvailable = false;
  swallowNextKey = false;
}

function endTargeting() {
  game.cursorActive = false;
  game.cursorMode = 0;
  for (let index = 0; index < game.buttonStates.length; index++) if (game.buttonStates[index] === 3) game.buttonStates[index] = 2;
}

function handleKey(event) {
  resumeMusic();
  const key = event.key.toLowerCase();
  if (key === "alt" || ["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
  if (handledArrowKeys.has(key)) return;
  if (moveRobinWithArrow(key)) {
    handledArrowKeys.add(key);
    return;
  }
  const scancode = keyScancode(key);
  if (scancode) storeScancode(scancode);
}

function handleKeyUp(event) {
  const key = event.key.toLowerCase();
  if (key === "alt") event.preventDefault();
  const scancode = keyScancode(key);
  if (handledArrowKeys.delete(key)) return;
  if (scancode) storeScancode(scancode | 0x80);
}

function handlePointer(event) {
  if (event.type === "pointerdown") resumeMusic();
  const point = pointerPosition(event);
  game.cursorX = Math.max(0, Math.min(0x130, Math.round(point.x)));
  game.cursorY = Math.max(0, Math.min(0xb8, Math.round(point.y)));
  if (event.type === "pointerdown") {
    if (event.button !== 0) return;
    game.clickState = 1;
    game.clickPending = true;
    game.clickX = game.cursorX;
    game.clickY = game.cursorY;
    canvas.setPointerCapture(event.pointerId);
  } else if (event.type === "pointerup") {
    if (event.button !== 0) return;
    if (game.clickState === 1) game.releasePending = true;
    else { game.clickState = 2; game.clickPending = false; }
  }
}

function pointerPosition(event) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) * 320 / bounds.width,
    y: (event.clientY - bounds.top) * 200 / bounds.height
  };
}

window.addEventListener("keydown", handleKey, true);
window.addEventListener("keyup", handleKeyUp, true);
canvas.addEventListener("pointerdown", handlePointer);
canvas.addEventListener("pointerup", handlePointer);
canvas.addEventListener("pointermove", handlePointer);
window.addEventListener("blur", () => { game.paused = true; });
window.addEventListener("focus", () => { game.paused = false; });
let lastFrame = 0;
function animate(timestamp) {
  const elapsed = lastFrame === 0 ? 0 : Math.min((timestamp - lastFrame) / 1000, 0.1);
  lastFrame = timestamp;
  const fading = game.fadeBusy;
  advanceFade(elapsed);
  // A fade run by the aerial-view exit happens inside the timer handler, which ignores nested ticks meanwhile.
  if (fading && game.interruptFade) game.interruptFade = game.fadeBusy;
  else {
    game.pendingTime += elapsed;
    const interval = 0x5d37 * 11 / 1193182;
    while (game.pendingTime >= interval) {
      game.pendingTime -= interval;
      advanceWorldTick();
    }
  }
  ruleMachine?.update();
  requestAnimationFrame(animate);
}
loadSeason(seasons[game.season]);
requestAnimationFrame(render);
requestAnimationFrame(animate);