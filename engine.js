"use strict";

class ProgramReader {
  constructor(buffer) {
    this.view = new DataView(buffer);
    this.offset = 0;
  }

  require(length) {
    if (this.offset + length > this.view.byteLength) {
      throw new Error(`Truncated ERULES.PRG at byte ${this.offset}`);
    }
  }

  byte() {
    this.require(1);
    return this.view.getUint8(this.offset++);
  }

  signedByte() {
    this.require(1);
    return this.view.getInt8(this.offset++);
  }

  word() {
    this.require(2);
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  bytes(length) {
    this.require(length);
    const value = new Uint8Array(this.view.buffer, this.offset, length).slice();
    this.offset += length;
    return value;
  }

  words(length) {
    return Array.from({ length }, () => this.word());
  }
}

function parseProgram(buffer) {
  const reader = new ProgramReader(buffer);
  const timeFrame = reader.word();
  const sequences = reader.bytes(reader.word());
  const mobileCount = reader.word();
  if (mobileCount > 40) throw new Error(`Invalid mobile count: ${mobileCount}`);
  const mobiles = Array.from({ length: mobileCount }, (_, id) => {
    const cubeX = reader.word();
    const cubeY = reader.word();
    const z = reader.word() & 255;
    const sprite = reader.word();
    const carriedBy = reader.byte();
    const behind = reader.signedByte();
    const above = reader.byte();
    const aboutFace = reader.byte();
    const direction = reader.byte();
    const mobility = reader.byte();
    const type = reader.byte();
    const behavior = reader.byte();
    const homeX = reader.byte();
    const homeY = reader.byte();
    const attributes = reader.bytes(32);
    const poseAliases = reader.bytes(32);
    const mobile = {
      id,
      x: cubeX === 0xffff ? -1 : cubeX * 8 + 4,
      y: cubeY === 0xffff ? -1 : cubeY * 8 + 4,
      z,
      sprite,
      carriedBy,
      behind,
      above,
      aboutFace,
      direction,
      mobility,
      type,
      behavior,
      homeX,
      homeY,
      attributes,
      poseAliases,
      pose: 0,
      alert: true,
      seqCount: 0x10,
      seqName: 0xff,
      seqBuffer: new Uint16Array(16).fill(0xffff),
      targetX: 0,
      targetY: 0,
      subTargetX: 0xff,
      subTargetY: 0xff,
      follow: 0,
      savedMode: 0,
      puff: 0xff,
      puffFrame: 0xff,
      cellX: 0xff,
      cellY: 0xff,
      onScreen: false,
      screenX: 0xff,
      screenY: 0xff,
      drawnZ: 0,
      drawnDirection: direction,
      drawnPose: 0,
      drawnBase: sprite,
      drawnAbout: aboutFace,
      speed: 0x0f,
      setMode(mode) {
        this.attributes[0] = mode & 255;
        this.attributes.fill(0, 1, 4);
        this.alert = true;
      }
    };
    return mobile;
  });

  const messageCount = reader.word();
  if (messageCount > 8192) throw new Error(`Invalid message count: ${messageCount}`);
  const messageLength = reader.word();
  const messageOffsets = reader.words(messageCount);
  const messageData = reader.bytes(messageLength);
  const messages = messageOffsets.map((offset) => {
    if (offset >= messageData.length) throw new Error("Message offset outside text data");
    let end = offset;
    while (end < messageData.length && messageData[end] !== 0) end++;
    if (end === messageData.length) throw new Error("Unterminated game message");
    let text = "";
    for (let index = offset; index < end; index++) text += String.fromCharCode(messageData[index]);
    return text;
  });

  const startRules = reader.words(reader.word());
  const inputRules = reader.words(reader.word());
  const ruleOffsets = reader.words(reader.word());
  const ruleCode = reader.bytes(reader.word());
  if (ruleOffsets.some((offset) => offset >= ruleCode.length)) throw new Error("Rule offset outside bytecode");
  const cubeFlags = reader.bytes(60);
  const listSizes = reader.bytes(reader.byte());
  const lists = Array.from(listSizes, (size) => reader.bytes(size));
  const locationCount = reader.word();
  if (locationCount > 40) throw new Error(`Invalid location count: ${locationCount}`);
  const locations = Array.from({ length: locationCount }, () => ({
    leftRight: reader.word(),
    topBottom: reader.word(),
    key: reader.word(),
    portal: reader.word()
  }));
  const buttonCount = reader.word();
  if (buttonCount > 20) throw new Error(`Invalid button count: ${buttonCount}`);
  const buttonTypes = reader.bytes(20);
  const buttonX = reader.words(20);
  const buttonY = reader.words(20);
  const buttonKeys = reader.bytes(20);
  const buttons = Array.from({ length: buttonCount }, (_, index) => ({
    type: buttonTypes[index],
    x: buttonX[index],
    y: buttonY[index],
    key: buttonKeys[index]
  }));
  if (reader.offset !== reader.view.byteLength) {
    throw new Error(`ERULES.PRG has ${reader.view.byteLength - reader.offset} unparsed bytes`);
  }
  return {
    timeFrame,
    sequences,
    mobiles,
    messages,
    startRules,
    inputRules,
    ruleOffsets,
    ruleCode,
    cubeFlags,
    lists,
    locations,
    buttons
  };
}

class IntroRuleRunner {
  constructor(program, handlers) {
    this.words = program.startRules;
    this.messages = program.messages;
    this.handlers = handlers;
    this.position = 0;
    this.waiting = false;
    this.remaining = 0;
    this.finished = false;
  }

  start() {
    if (this.read() !== 0xfff8) throw new Error("START does not begin with a rule body");
    this.runActions();
  }

  update(elapsed, input) {
    if (!this.waiting || this.finished) return;
    if (!input && this.remaining !== null) {
      this.remaining -= elapsed;
      if (this.remaining > 0) return;
    } else if (!input) {
      return;
    }
    this.waiting = false;
    this.runActions();
  }

  runActions() {
    while (!this.finished) {
      const opcode = this.read();
      if (opcode === 0xfff7) {
        this.finished = true;
        this.handlers.complete();
        return;
      }
      switch (opcode) {
        case 83: {
          const message = this.messages[this.read()];
          if (!message || !/\.GFX$/i.test(message)) throw new Error(`Invalid START scene: ${message}`);
          this.handlers.scene(message);
          break;
        }
        case 88: {
          const slot = this.read();
          const x = this.read();
          const y = this.read();
          const frames = Array.from({ length: 8 }, () => this.read());
          this.handlers.animation(slot, x, y, frames);
          break;
        }
        case 98:
          this.handlers.music(this.read());
          break;
        case 85: {
          const intervals = this.read() & 255;
          this.remaining = intervals === 0 ? null : intervals * (0x5d37 * 11 / 1193182);
          this.waiting = true;
          return;
        }
        default:
          throw new Error(`Unsupported START intro action ${opcode} at word ${this.position - 1}`);
      }
    }
  }

  read() {
    if (this.position >= this.words.length) throw new Error("START intro ended before its rule terminator");
    return this.words[this.position++];
  }
}

class ScriptCursor {
  constructor(source, position = 0, name = "SCRIPT") {
    if (source instanceof Uint8Array) {
      this.bytes = source;
    } else {
      this.bytes = new Uint8Array(source.length * 2);
      const view = new DataView(this.bytes.buffer);
      source.forEach((word, index) => view.setUint16(index * 2, word, true));
    }
    this.position = position;
    this.name = name;
  }

  peek() {
    if (this.position < 0 || this.position + 2 > this.bytes.length) {
      throw new Error(`Script ${this.name} read outside bytecode at ${this.position}`);
    }
    return this.bytes[this.position] | this.bytes[this.position + 1] << 8;
  }

  read() {
    const value = this.peek();
    this.position += 2;
    return value;
  }

  poke(value) {
    this.peek();
    this.bytes[this.position] = value & 255;
    this.bytes[this.position + 1] = value >> 8 & 255;
  }
}

class RuleMachine {
  constructor(program, world, seed = 1) {
    this.program = program;
    this.world = world;
    this.randomState = seed & 0xffff;
    this.random(0x32);
    this.current = this.execute(new ScriptCursor(program.startRules, 0, "START"), true, 0);
    this.waiting = null;
    this.waitStart = world.intervalCount;
    this.owner = 0;
    this.it = -1;
    this.operations = 0;
    this.inputRules = null;
    this.startupComplete = false;
    this.ownerSignal = 0xffff;
    this.proposals = [];
  }

  random(maximum) {
    if (!maximum) return 0;
    const product = this.randomState * 0x4e35;
    this.randomState = product & 0xffff;
    return (product >>> 16) % maximum;
  }

  update() {
    this.operations = 0;
    for (let budget = this.startupComplete ? this.world.mobiles.length + 1 : 1; budget > 0; budget--) {
      if (this.world.fadeBusy && this.waiting?.fade !== true) return;
      if (this.waiting?.fade) {
        if (this.world.fadeBusy) return;
        this.waiting = null;
      } else if (this.waiting) {
        const pressed = this.world.keyAvailable;
        const clicked = this.world.clickPending;
        if (!pressed && !clicked && (this.waiting.intervals === 0 || this.world.intervalCount - this.waitStart < this.waiting.intervals)) return;
        if (pressed) this.world.lastKey = this.world.takeKey();
        else if (clicked) this.world.consumeClick();
        this.waiting = null;
      }
      if (!this.current) {
        this.current = this.startupComplete ? this.next() : null;
        if (!this.current) return;
      }
      const result = this.current.next();
      if (!result.done) {
        this.waiting = result.value;
        this.waitStart = this.world.intervalCount;
        return;
      }
      this.current = null;
      if (!this.startupComplete) {
        this.startupComplete = true;
        return;
      }
    }
  }

  next() {
    if (this.world.pendingInput && (!this.world.cursorActive || this.world.pendingInput === 3)) return this.runInput();
    return this.findBehaviour(this.world.nextAlert, this.world.mobiles.length);
  }

  findBehaviour(start, length) {
    const count = this.world.mobiles.length;
    for (let step = 0; step < length; step++) {
      const index = (start + step) % count;
      const mobile = this.world.mobiles[index];
      if (!mobile.alert) continue;
      mobile.alert = false;
      this.world.nextAlert = (index + 1) % count;
      this.proposals = [];
      this.ownerSignal = this.world.mobileSignals[index];
      this.world.mobileSignals[index] = 0xffff;
      return mobile.behavior === 0xff ? (function* () {})() : this.execute(this.rule(mobile.behavior), true, index);
    }
    return null;
  }

  *runInput() {
    this.inputRules ??= new ScriptCursor(this.program.inputRules, 0, "INPUT");
    this.inputRules.position = 0;
    yield* this.execute(this.inputRules, false, this.world.host);
    this.world.mobileHit = -1;
    this.world.mapHit = -1;
    if (this.world.pendingInput === 3) this.world.endTargeting();
    this.world.pendingInput = 0;
  }

  *execute(cursor, all, initialOwner) {
    const previousOwner = this.owner;
    this.owner = initialOwner;
    try {
      while (cursor.peek() !== 0xfff6 && !this.world.ended) {
        let passed = true;
        while (cursor.peek() !== 0xfff8) {
          this.guard(cursor);
          let condition = cursor.read();
          const inverted = condition >= 1000;
          if (inverted) condition -= 1000;
          if (this.condition(condition, cursor) === inverted) {
            passed = false;
            while (cursor.read() !== 0xfff7) this.guard(cursor);
            break;
          }
        }
        if (!passed) continue;
        cursor.read();
        let continueRules = false;
        while (cursor.peek() !== 0xfff7) {
          this.guard(cursor);
          const opcode = cursor.read();
          if (opcode === 15) { continueRules = true; continue; }
          if (opcode === 20 || opcode === 21) {
            const rule = cursor.read();
            const nextOwner = this.objectNumber(cursor);
            yield* this.execute(this.rule(rule), all, nextOwner);
            if (opcode === 21) { this.skip(cursor, 0); break; }
            continue;
          }
          if (opcode === 77) {
            this.world.frozen = true;
            this.world.clearKeys();
            yield { intervals: 0, untilKey: true };
            this.world.consumeClick();
            this.world.frozen = false;
            continue;
          }
          if (opcode === 85) {
            this.world.clearKeys();
            this.world.consumeClick();
            this.world.lastKey = 0;
            yield { intervals: cursor.read() & 255, animate: true };
            continue;
          }
          this.action(opcode, cursor);
          while (this.world.fadeBusy) yield { intervals: 0, fade: true };
        }
        cursor.read();
        if (!all && !continueRules) return;
      }
    } finally {
      this.owner = previousOwner;
    }
  }

  condition(opcode, cursor) {
    const mobile = (number) => this.mobile(number);
    switch (opcode) {
      case 0: return this.mobileLocation(this.owner) === this.location(cursor);
      case 1: return this.mobileLocation(this.objectNumber(cursor)) === this.location(cursor);
      case 2: {
        const location = this.mobileLocation(this.owner);
        if (location === 0xffff) { cursor.read(); return false; }
        return (8 >> cursor.read() & this.world.cube(location >> 8, location & 255, 3)) !== 0;
      }
      case 3: { const first = this.attribute(cursor); return this.compare(first.mobile.attributes[first.index], cursor.read(), cursor.read()); }
      case 4: return this.byteCompare(this.world.lastRandom, cursor.read(), cursor.read());
      case 5: this.world.lastRandom = this.random(cursor.read()); return this.world.lastRandom === 0;
      case 6: {
        const period = cursor.read() << 16 >> 16;
        const counter = (cursor.peek() << 16 >> 16) + 1;
        const elapsed = counter >= period;
        cursor.poke(elapsed ? 0 : counter);
        cursor.read();
        return elapsed;
      }
      case 7: return this.world.lastMessage === cursor.read();
      case 8: return this.world.firstTime;
      case 9: return this.byteCompare(this.world.errorCount, cursor.read(), cursor.read());
      case 10: {
        const carrier = this.objectNumber(cursor) & 255;
        if (cursor.peek() !== 3000) {
          const carried = this.objectNumber(cursor);
          if (mobile(carried).carriedBy !== carrier) return false;
          this.it = carried;
          return true;
        }
        cursor.read();
        const found = this.world.mobiles.findIndex((entry) => entry.carriedBy === carrier);
        if (found < 0) return false;
        this.it = found;
        return true;
      }
      case 11: { const first = this.attribute(cursor); const op = cursor.read(); const second = this.attribute(cursor); return this.compare(first.mobile.attributes[first.index], op, second.mobile.attributes[second.index]); }
      case 12: return this.inLocation(this.program.locations[cursor.read()], this.mobileLocation(this.owner));
      case 13: { const loc = this.mobileLocation(this.objectNumber(cursor)); return this.inLocation(this.program.locations[cursor.read()], loc); }
      case 14: { const target = this.location(cursor); const current = this.mobileLocation(this.owner); return this.byteCompare(this.absDifference(target >> 8, current >> 8) + this.absDifference(target & 255, current & 255), cursor.read(), cursor.read()); }
      case 15: { const attr = this.attribute(cursor); this.world.lastRandom = this.random(attr.mobile.attributes[attr.index] + 1); return this.byteCompare(this.world.lastRandom, cursor.read(), cursor.read()); }
      case 16: return this.owner === this.objectNumber(cursor);
      case 17: return this.visibility(cursor, (current, _, level) => (current << 24 >> 24) >= (level << 24 >> 24));
      case 18: return this.visibility(cursor, (current, previous, level) => current >= level && previous < level);
      case 19: return this.visibility(cursor, (current, previous, level) => current < level && previous >= level);
      case 20: return this.objectNumber(cursor) === this.world.host;
      case 21: { const sequence = cursor.read() & 255; return mobile(this.owner).seqName === sequence && mobile(this.owner).seqCount !== 0x10; }
      case 22: { const sequence = cursor.read() & 255; return mobile(this.owner).seqName === sequence && mobile(this.owner).seqCount === 0x10; }
      case 23: { const loc = this.location(cursor); if (loc === 0xffff) { cursor.read(); cursor.read(); cursor.read(); return false; } const level = cursor.read(); return this.byteCompare(this.world.cube(loc >> 8, loc & 255, level), cursor.read(), cursor.read()); }
      case 24: return this.mobileLocation(this.objectNumber(cursor)) !== 0xffff;
      case 25: { const type = cursor.read() & 255; if ((this.ownerSignal >> 8) !== type) return false; this.it = this.ownerSignal & 255; return true; }
      case 26: { const mode = cursor.read() & 255; const submode = cursor.read() & 255; return mobile(this.owner).attributes[0] === mode & mobile(this.owner).attributes[1] === submode; }
      case 27: return mobile(this.owner).attributes[0] === (cursor.read() & 255);
      case 28:
      case 29: { const button = cursor.read(); return (opcode === 28 ? [1, 3].includes(this.world.pendingInput) : this.world.pendingInput === 2) && this.world.buttonNumber === button; }
      case 30: { const mode = cursor.read() & 255; return this.byteCompare(this.world.mobiles.filter((entry) => entry.attributes[0] === mode).length, cursor.read(), cursor.read()); }
      case 31: { const loc = this.location(cursor); return ((loc >> 8) - this.world.viewX & 255) <= 7 && ((loc & 255) - this.world.viewY & 255) <= 7; }
      case 32: return this.objectNumber(cursor) === this.objectNumber(cursor);
      case 33: cursor.read(); return true;
      case 34: return mobile(this.owner).attributes[2] === 1;
      case 35: return mobile(this.objectNumber(cursor)).behavior === (cursor.read() & 255);
      case 36: { const attr = this.attribute(cursor); return (attr.mobile.attributes[attr.index] & cursor.read() & 255) !== 0; }
      case 37: return (cursor.read() & 255) <= mobile(this.owner).attributes[0];
      case 38: { const carrier = mobile(this.objectNumber(cursor)).carriedBy; if (carrier === 0xff) return false; this.it = carrier; return true; }
      case 39: return mobile(this.owner).attributes[1] === (cursor.read() & 255);
      case 40: return this.mobileLocation(this.owner) !== 0xffff && this.world.stung[this.owner] !== 0;
      case 41: return mobile(this.owner).attributes[3] === 1;
      case 42: return mobile(this.objectNumber(cursor)).direction === (cursor.read() & 255);
      case 43: return this.world.buttonStates[cursor.read()] === (cursor.read() & 255);
      case 44: return this.world.mobileHit === -1 && this.world.mapHit !== -1;
      case 45: return !this.world.cursorActive && this.world.mobileHit !== -1;
      case 46: { const loc = this.location(cursor); return (mobile(this.owner).targetX << 8 | mobile(this.owner).targetY) === loc; }
      case 47: { const index = (cursor.read() - 0x30 & 255) % RuleMachine.functionKeys.length; return this.world.lastKey === RuleMachine.functionKeys[index]; }
      case 48: { const words = [cursor.read(), cursor.read(), cursor.read()]; return this.world.pendingInput === 6 && words.every((word, index) => RuleMachine.digitKeys[word % RuleMachine.digitKeys.length] === this.world.cheatValues[index]); }
      case 49: return this.objectNumber(cursor) === this.world.cameraLock;
      default: throw new Error(`Untranslated condition ${opcode} in ${cursor.name} at ${cursor.position - 2}`);
    }
  }

  action(opcode, cursor) {
    const world = this.world;
    const mobile = (number) => this.mobile(number);
    switch (opcode) {
      case 0: world.messageObject = this.objectNumber(cursor); return;
      case 1: {
        const location = this.location(cursor);
        const bit = cursor.read();
        const mask = 8 >> bit;
        const offset = ((location & 255) * 64 + (location >> 8)) * 4 + 3;
        world.map[offset] = cursor.read() ? world.map[offset] | mask : world.map[offset] & ~mask;
        return;
      }
      case 2: { const message = cursor.read(); if (this.okToSpeak()) this.showMessage(message); return; }
      case 3: {
        const attr = this.attribute(cursor);
        const divisor = cursor.read() & 255;
        const submessage = divisor ? Math.floor(attr.mobile.attributes[attr.index] / divisor) : 0;
        const message = cursor.read();
        if (this.okToSpeak()) this.showMessage(message, submessage);
        return;
      }
      case 4: {
        const message = cursor.read();
        const submessage = cursor.peek();
        cursor.poke(submessage + 1 >= this.submessageCount(message) ? 0 : submessage + 1);
        cursor.read();
        if (this.okToSpeak()) this.showMessage(message, submessage);
        return;
      }
      case 5: if (world.speaking === -1) this.action(2, cursor); else cursor.read(); return;
      case 6: if (world.speaking === -1) this.action(3, cursor); else for (let i = 0; i < 4; i++) cursor.read(); return;
      case 7: if (world.speaking === -1) this.action(4, cursor); else { cursor.read(); cursor.read(); } return;
      case 8: {
        const attr = this.attribute(cursor);
        const operation = cursor.read();
        attr.mobile.attributes[attr.index] = this.assign(attr.mobile.attributes[attr.index], operation, cursor.read());
        return;
      }
      case 9: {
        const attr = this.attribute(cursor);
        const maximum = cursor.read();
        attr.mobile.attributes[attr.index] = maximum ? this.random(maximum) : 0;
        return;
      }
      case 10: {
        const target = mobile(this.objectNumber(cursor));
        const location = this.location(cursor);
        target.x = (location >> 8) * 8 + 4;
        target.y = (location & 255) * 8 + 4;
        return;
      }
      case 11: {
        const number = this.objectNumber(cursor);
        if (number === world.host) world.cameraLock = -1;
        mobile(number).x = mobile(number).y = -1;
        return;
      }
      case 12: world.saveStatus?.(); world.ended = true; this.skip(cursor, 0); return;
      case 13: this.skip(cursor, cursor.read()); return;
      case 14: if (this.okToSpeak()) this.showMessage(5); return;
      case 15: return;
      case 16: world.deleteStatus?.(); world.ended = true; this.skip(cursor, 0); return;
      case 17: world.errorCount = world.errorCount + 1 & 255; return;
      case 18: {
        const destination = this.attribute(cursor);
        const operation = cursor.read();
        const source = this.attribute(cursor);
        destination.mobile.attributes[destination.index] = this.assign(destination.mobile.attributes[destination.index], operation, source.mobile.attributes[source.index]);
        return;
      }
      case 19: { const attr = this.attribute(cursor); world.messageNumber = attr.mobile.attributes[attr.index]; return; }
      case 22: {
        const location = this.location(cursor);
        const target = mobile(this.owner);
        target.targetX = location >> 8 & 255;
        target.targetY = location & 255;
        target.subTargetX = 255;
        return;
      }
      case 23: world.errorCount = 0; return;
      case 24: world.setSequence?.(this.owner, cursor.read()); return;
      case 25: world.setSequence?.(this.owner + 1, cursor.read()); return;
      case 26: world.host = this.objectNumber(cursor); return;
      case 27: {
        const attributes = mobile(this.owner).attributes;
        const offset = (attributes[5] * 64 + attributes[4]) * 4;
        world.map[offset + attributes[6]] = attributes[7];
        world.map[offset + 3] = attributes[8];
        return;
      }
      case 28: {
        const carrier = this.objectNumber(cursor);
        const carried = mobile(this.objectNumber(cursor));
        carried.carriedBy = carrier & 255;
        carried.behind = cursor.read() << 24 >> 24;
        carried.above = cursor.read() & 255;
        return;
      }
      case 29: { const target = mobile(this.objectNumber(cursor)); target.carriedBy = 255; target.z = 0; target.alert = true; return; }
      case 30: this.owner = this.objectNumber(cursor); return;
      case 31: { const delay = cursor.read(); world.issueSignal?.(0x021f, (cursor.read() & 255) << 8 | this.owner, delay); return; }
      case 32: { const delay = cursor.read(); world.issueSignal?.(0x0120, (cursor.read() & 255) << 8 | this.owner, delay); return; }
      case 33: { const delay = cursor.read(); const target = this.objectNumber(cursor); world.issueSignal?.(target, (cursor.read() & 255) << 8 | this.owner, delay); return; }
      case 34: { const delay = cursor.read(); world.issueSignal?.(0x0322, (cursor.read() & 255) << 8 | this.owner, delay); return; }
      case 35: this.ownerSignal = 0xffff; return;
      case 36: mobile(this.owner).setMode(cursor.read()); this.skip(cursor, 0); return;
      case 37: mobile(this.owner).attributes[1] = mobile(this.owner).attributes[1] + 1 & 255; return;
      case 38: {
        const operation = cursor.read(); const location = this.location(cursor); const attr = mobile(this.owner).attributes;
        attr[4] = this.assign(attr[4], operation, location >> 8);
        attr[5] = this.assign(attr[5], operation, location & 255);
        return;
      }
      case 39: mobile(this.owner).behavior = cursor.read() - 2000 & 255; return;
      case 40: mobile(this.owner).sprite = cursor.read(); mobile(this.owner).aboutFace = cursor.read() & 255; return;
      case 41: {
        const attr = cursor.read(); const operation = cursor.read(); const list = cursor.read(); const index = mobile(this.owner).attributes[cursor.read()];
        mobile(this.owner).attributes[attr] = this.assign(mobile(this.owner).attributes[attr], operation, this.program.lists[list][index]);
        return;
      }
      case 42: {
        const list = this.program.lists[cursor.read()]; const index = mobile(this.owner).attributes[cursor.read()]; const operation = cursor.read();
        list[index] = this.assign(list[index], operation, mobile(this.owner).attributes[cursor.read()]);
        return;
      }
      case 43: {
        const target = this.location(cursor); const current = this.mobileLocation(this.owner);
        mobile(this.owner).direction = RuleMachine.whichWay((target >> 8) - (current >> 8) & 255, (target - current) & 255);
        return;
      }
      case 44: {
        const target = mobile(this.objectNumber(cursor)); const source = mobile(this.owner);
        mobile(this.owner).direction = RuleMachine.whichWay((target.x - source.x) & 0xffff, (target.y - source.y) & 0xffff, true);
        return;
      }
      case 45: mobile(this.owner).follow = this.objectNumber(cursor) & 255; mobile(this.owner).subTargetX = 255; return;
      case 46: {
        if (world.cameraLock !== this.owner) return;
        const camera = mobile(this.owner); const direction = camera.direction & 3;
        world.frozen = true;
        world.panTo?.(Math.max(0, Math.min(56, (camera.x >> 3) + RuleMachine.seeViewX[direction])), Math.max(0, Math.min(56, (camera.y >> 3) + RuleMachine.seeViewY[direction])));
        world.frozen = false;
        return;
      }
      case 47: cursor.read(); return;
      case 48: mobile(this.owner).attributes[6] = this.objectNumber(cursor) & 255; return;
      case 49: world.setPose?.(this.owner, cursor.read()); mobile(this.owner).seqCount = 0x10; return;
      case 50: mobile(this.objectNumber(cursor)).alert = true; return;
      case 51: mobile(this.owner).attributes[2] = cursor.read() & 255; return;
      case 52: mobile(this.owner).attributes[2] = 0; return;
      case 53: {
        const target = mobile(this.objectNumber(cursor));
        target.x = (target.x & 0xfff8) + cursor.read(); target.y = (target.y & 0xfff8) + cursor.read();
        target.z = cursor.read() & 255; target.direction = cursor.read() & 255;
        return;
      }
      case 54: world.highlightObject = this.objectNumber(cursor); world.highlightBytes = Array.from({ length: 4 }, () => cursor.read() & 255); return;
      case 55: mobile(this.owner).poseAliases[cursor.read()] = cursor.read() & 255; return;
      case 56: mobile(this.owner).direction = cursor.read() & 255; return;
      case 57: { const button = cursor.read(); const word = cursor.read(); world.buttonStates[button] = word & 255; world.buttonRegen[button] = word >> 8; return; }
      case 58: {
        const direction = cursor.read(); world.cameraLock = -1;
        world.panTo?.(world.viewX + RuleMachine.panX[direction], world.viewY + RuleMachine.panY[direction]);
        return;
      }
      case 59: { const location = this.location(cursor); world.cameraLock = -1; world.setView?.(location >> 8, location & 255); return; }
      case 60: mobile(this.owner).z = cursor.read() & 255; return;
      case 61: this.propose(cursor.read(), cursor.read()); return;
      case 62: {
        const mode = cursor.read() & 255; const operation = cursor.read(); const weight = mobile(this.owner).attributes[cursor.read()];
        let scaled = weight;
        if (operation === 45) scaled = 255 - weight;
        else if (operation === 62) scaled = Math.max(0, weight - 0x80) << 1 & 255;
        else if (operation === 60) scaled = Math.max(0, 255 - weight - 0x80) << 1 & 255;
        const factor = cursor.read() & 255;
        this.propose(mode, factor * scaled + scaled >> 8);
        return;
      }
      case 63: {
        const fallback = cursor.read() & 255; let best = 0; let chosen = fallback;
        for (const proposal of this.proposals) if ((proposal & 255) > best) { best = proposal & 255; chosen = proposal >> 8; }
        mobile(this.owner).setMode(chosen); return;
      }
      case 64: mobile(this.objectNumber(cursor)).puff = 4; return;
      case 65: { const target = mobile(this.objectNumber(cursor)); const screen = this.location(cursor); world.placeInView?.(target, screen >> 8, screen & 255); return; }
      case 66: { const attr = this.attribute(cursor); const mask = cursor.read() & 255; if (cursor.read()) attr.mobile.attributes[attr.index] |= mask; else attr.mobile.attributes[attr.index] &= ~mask; return; }
      case 67: world.frozen = true; world.fadeOut?.(); world.afterFade?.(() => { world.frozen = false; }); return;
      case 68: world.frozen = true; world.fadeIn?.(); world.afterFade?.(() => { world.frozen = false; }); return;
      case 69: world.cubeSetCode = 0x30 + cursor.read(); world.layFloor?.(); return;
      case 70: mobile(this.owner).attributes[3] = cursor.read() & 255; return;
      case 71: mobile(this.owner).savedMode = cursor.read() & 255; return;
      case 72: { const actor = mobile(this.owner); actor.alert = true; actor.setMode(actor.savedMode); return; }
      case 73: mobile(this.objectNumber(cursor)).setMode(cursor.read()); return;
      case 74: mobile(this.objectNumber(cursor)).mobility = cursor.read() & 255; return;
      case 75:
      case 76: return;
      case 77: throw new Error("Opcode 77 must be handled by the script scheduler");
      case 78: { const button = cursor.read(); world.buttonRegen[button] = cursor.read() & 255; world.buttonStates[button] = 1; return; }
      case 79: world.showAerialView?.(); return;
      case 80: { const message = cursor.read(); if (this.okToSpeak()) this.showMessage(message); return; }
      case 81: { const number = this.objectNumber(cursor); mobile(number).type = cursor.read() & 255; world.clearInteractions?.(number); return; }
      case 82: {
        const number = this.objectNumber(cursor); const attribute = cursor.read(); const divisor = cursor.read() & 255; const x = cursor.read(); const y = cursor.read();
        if (!world.aerialView) world.printText?.(`${divisor ? Math.floor(mobile(number).attributes[attribute] / divisor) : 0}`.padEnd(3), x, y);
        return;
      }
      case 83: {
        const image = this.program.messages[cursor.read()];
        world.frozen = true; world.speaking = -1; world.fadeOut?.();
        world.afterFade?.(() => { world.loadScene?.(image); world.fullScreenImage = true; world.speech = ""; world.speechCount = 0; });
        world.fadeIn?.();
        return;
      }
      case 84: this.showMessage(cursor.read(), null, false); return;
      case 86:
      case 101: world.returnToGameScreen?.(true); return;
      case 87: {
        const attr = this.attribute(cursor); const colour = cursor.read(); const divisor = cursor.read() & 255;
        const length = divisor ? Math.floor(attr.mobile.attributes[attr.index] * 0x46 / divisor) & 255 : 0;
        const x = cursor.read(); world.plotBar?.(x, cursor.read(), length, colour & 255); return;
      }
      case 88: { const slot = cursor.read(); const x = cursor.read(); const y = cursor.read(); world.introAnimations[slot] = { x, y, frames: Array.from({ length: 8 }, () => cursor.read()) }; return; }
      case 89: { const target = mobile(this.objectNumber(cursor)); const attribute = cursor.read(); const x = cursor.read(); world.setStatusIndicator?.(target, attribute, x, cursor.read()); return; }
      case 90: { const target = mobile(this.objectNumber(cursor)); const location = this.location(cursor); target.homeX = location >> 8 & 255; target.homeY = location & 255; return; }
      case 91: world.cameraLock = this.objectNumber(cursor); return;
      case 92: { const target = mobile(this.objectNumber(cursor)); const x = cursor.read(); world.showObjectIcon?.(target, x, cursor.read()); return; }
      case 93: { const number = this.objectNumber(cursor); world.startSound?.(cursor.read(), 0xff00 | number, mobile(number).x >> 3, mobile(number).y >> 3); return; }
      case 94: { const location = this.location(cursor); world.startSound?.(cursor.read(), location, location >> 8, location & 255); return; }
      case 95: world.stopSound?.(0xff00 | this.objectNumber(cursor)); return;
      case 96: world.stopSound?.(this.location(cursor)); return;
      case 97: return;
      case 98: world.playMusic?.(cursor.read()); return;
      case 99: world.stopMusic?.(); return;
      case 100: mobile(this.objectNumber(cursor)).speed = cursor.read() & 255; return;
      default: throw new Error(`Untranslated action ${opcode} in script`);
    }
  }

  assign(previous, operation, value) {
    const operand = value & 255;
    if (operation === 61) return operand;
    if (operation === 43) return Math.min(255, previous + operand);
    if (operation === 45) return Math.max(0, previous - operand);
    if (operation === 42) return previous * operand & 255;
    if (operation === 47) return operand === 0 ? previous : Math.floor(previous / operand);
    if (operation === 37) return operand === 0 ? previous : previous % operand;
    throw new Error(`Unsupported assignment ${operation}`);
  }

  propose(mode, score) {
    const index = this.proposals.findIndex((entry) => entry.mode === (mode & 255));
    if (index < 0) this.proposals.push({ mode: mode & 255, score: score & 255 });
    else this.proposals[index].score = Math.min(255, this.proposals[index].score + (score & 255));
  }

  okToSpeak() {
    const speaker = this.mobile(this.owner);
    const cellX = speaker.x >> 3;
    const cellY = speaker.y >> 3;
    return !this.world.aerialView && cellX - this.world.viewX >= 0 && cellX - this.world.viewX <= 7 && cellY - this.world.viewY >= 0 && cellY - this.world.viewY <= 7;
  }

  submessageCount(number) {
    const text = this.program.messages[number] ?? "";
    let count = 0;
    while (text[count] === "[") count++;
    return count + 1;
  }

  showMessage(number, submessage = null, speaker = true) {
    this.world.lastMessage = number;
    if (speaker) this.world.speaking = this.owner;
    const text = this.program.messages[number] ?? "";
    let position = 0;
    while (text[position] === "[") position++;
    const skip = submessage ?? (position === 0 ? 0 : this.random(position + 1));
    for (let index = 0; index < skip; index++) {
      while (position < text.length && text[position++] !== "]") {}
    }
    const end = text.indexOf("]", position);
    const raw = end < 0 ? text.slice(position) : text.slice(position, end);
    const expanded = RuleMachine.decodeMessage(raw, this.world.messageNumber);
    this.world.speech = RuleMachine.wrapMessage(expanded);
    this.world.speechCount = this.world.speech.length / 3 + 4 & 255;
    this.world.showSpeech?.(this.world.speech);
  }

  rule(number) {
    if (number >= this.program.ruleOffsets.length) throw new Error("Rule number outside rule table");
    return new ScriptCursor(this.program.ruleCode, this.program.ruleOffsets[number], `RULE ${number}`);
  }

  guard(cursor) {
    if (++this.operations > 100000) throw new Error(`Script operation budget exceeded in ${cursor.name}`);
  }

  skip(cursor, count) {
    if (!count) {
      while (cursor.peek() !== 0xfff6) { cursor.read(); this.guard(cursor); }
      cursor.position -= 2;
      return;
    }
    for (let index = 0; index <= count; index++) while (cursor.read() !== 0xfff7) this.guard(cursor);
    cursor.position -= 2;
  }

  objectNumber(cursor) {
    const value = cursor.read();
    if (value === 1000) return this.world.mobileHit;
    if (value === 1001) return this.owner;
    if (value === 1002) return this.it;
    if (value === 1003) return this.mobile(this.owner).attributes[6];
    if (value === 1004) return this.world.host;
    return value;
  }

  location(cursor) {
    const value = cursor.read();
    const mobile = this.mobile.bind(this);
    switch (value >> 8) {
      case 255: return mobile(this.owner).homeX << 8 | mobile(this.owner).homeY;
      case 254: return mobile(value & 255).homeX << 8 | mobile(value & 255).homeY;
      case 253: return this.mobileLocation(this.owner);
      case 252: return this.mobileLocation(value & 255);
      case 251: return this.mobileLocation(this.it);
      case 250: return mobile(this.owner).targetX << 8 | mobile(this.owner).targetY;
      case 249: return mobile(this.owner).attributes[4] << 8 | mobile(this.owner).attributes[5];
      case 248: return this.program.locations[value & 255].key;
      case 247: return this.mobileLocation(mobile(this.owner).attributes[6]);
      case 246: return this.world.mapHit;
      default: return value;
    }
  }

  mobileLocation(number) {
    const entry = this.mobile(number);
    return entry.x < 0 || entry.y < 0 ? 0xffff : (entry.x >> 3) << 8 | entry.y >> 3;
  }

  mobile(number) {
    if (number === -1) return RuleMachine.noObject;
    if (number >= 0 && number < this.world.mobiles.length) return this.world.mobiles[number];
    throw new Error(`Invalid object reference ${number}`);
  }

  attribute(cursor) {
    const entry = this.mobile(this.objectNumber(cursor));
    const index = cursor.read();
    if (index >= 32) throw new Error("Attribute index outside 32-byte block");
    return { mobile: entry, index };
  }

  visibility(cursor, test) {
    const level = cursor.read() & 255;
    if (cursor.peek() < 2000) {
      const single = this.objectNumber(cursor);
      const state = this.world.interaction(this.owner, single);
      if (!test(state & 255, state >> 8, level)) return false;
      this.it = single;
      return true;
    }
    const selector = cursor.read();
    for (let index = 0; index < this.world.mobiles.length; index++) {
      const state = this.world.interaction(this.owner, index);
      if (!test(state & 255, state >> 8, level)) continue;
      if (selector !== 3000 && this.world.mobiles[index].behavior !== (selector - 2000 & 255)) continue;
      this.it = index;
      return true;
    }
    return false;
  }

  compare(left, operation, right) {
    if (operation === 61) return left === right;
    if (operation === 62) return left > right;
    if (operation === 60) return left < right;
    throw new Error(`Unsupported comparison ${operation}`);
  }

  byteCompare(left, operation, right) {
    left &= 255; right &= 255;
    return operation === 60 ? left < right : operation === 62 ? left > right : left === right;
  }

  inLocation(area, cell) {
    return (cell >> 8 & 255) >= (area.leftRight >> 8) && (cell >> 8 & 255) <= (area.leftRight & 255) && (cell & 255) >= (area.topBottom >> 8) && (cell & 255) <= (area.topBottom & 255);
  }

  absDifference(left, right) {
    const difference = (left - right) & 255;
    return difference & 128 ? (-difference) & 255 : difference;
  }

  static whichWay(dx, dy, wide = false) {
    let way = 0;
    let a = wide ? dx << 16 >> 16 : dx << 24 >> 24;
    let b = wide ? dy << 16 >> 16 : dy << 24 >> 24;
    if (a < 0) { way |= 4; a = -a; }
    if (b < 0) { way |= 2; b = -b; }
    if (!wide) { a = a << 24 >> 24; b = b << 24 >> 24; }
    if (a < b) way |= 1;
    return [0, 2, 0, 1, 3, 2, 3, 1][way];
  }

  static decodeMessage(raw, number) {
    const phrases = "I am |You are |you are |hou art |in the |is the |is a |in a |To the |to the |by |going |here |The|the|and |some |build|not |way|I |a |an |from |of |him|her|by |his |ing |tion|have |you|I've |can't |up |to |he |she |down |what|What|with|are |and|ent|ian|ome|ed |me|my|ai|it|is|of|oo|ea|er|es|th|we|ou|ow|or|gh|go|er|st|ee|th|sh|ch|ct|on|ly|ng|nd|nt|ty|ll|le|de|as|ie|in|ss|'s |'t |re|gg|tt|pp|nn|ay|ar|wh|".split("|");
    let result = "";
    for (let index = 0; index < raw.length; index++) {
      const code = raw.charCodeAt(index);
      if (code === 93) break;
      if (code >= 128) {
        const phrase = 255 - code;
        if (phrase < phrases.length - 1) result += phrases[phrase];
      } else if (code === 64) {
        if (raw[++index] === "#") result += number;
      } else result += raw[index];
    }
    return result;
  }

  static wrapMessage(text) {
    let result = "";
    let line = 0;
    let column = 0;
    for (let index = 0; index < text.length; index++) {
      const character = text[index];
      if (character === "|") { result += character; line++; column = 0; continue; }
      result += character;
      if (++column < 0x3d) continue;
      if (line === 1) return result.slice(0, -1);
      const space = result.lastIndexOf(" ");
      if (space < 0) return result.slice(0, -1);
      result = `${result.slice(0, space)}|${result.slice(space + 1)}`;
      line++;
      column = 0;
      index = space;
    }
    return result;
  }
}

RuleMachine.functionKeys = [0x44, 0x3b, 0x3c, 0x3d, 0x3e, 0x3f, 0x40, 0x41, 0x42, 0x43];
RuleMachine.digitKeys = [0x0b, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a];
RuleMachine.seeViewX = [-1, -3, -3, -6];
RuleMachine.seeViewY = [-3, -6, -1, -3];
RuleMachine.panX = [6, 0, 0, -6];
RuleMachine.panY = [0, -6, 6, 0];
RuleMachine.noObject = { x: -1, y: -1, attributes: new Uint8Array(32), poseAliases: new Uint8Array(32) };

window.RobinEngine = Object.freeze({ parseProgram, IntroRuleRunner, RuleMachine });