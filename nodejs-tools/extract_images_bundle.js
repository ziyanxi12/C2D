#!/usr/bin/env node
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// node_modules/kiwi-schema/kiwi.js
var require_kiwi = __commonJS({
  "node_modules/kiwi-schema/kiwi.js"(exports2, module2) {
    "use strict";
    var __defProp = Object.defineProperty;
    var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __hasOwnProp = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames2(from))
          if (!__hasOwnProp.call(to, key) && key !== except)
            __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
    var kiwi_exports = {};
    __export(kiwi_exports, {
      ByteBuffer: () => ByteBuffer,
      compileSchema: () => compileSchema,
      compileSchemaCPP: () => compileSchemaCPP,
      compileSchemaCallbackCPP: () => compileSchemaCallbackCPP,
      compileSchemaJS: () => compileSchemaJS,
      compileSchemaSkew: () => compileSchemaSkew,
      compileSchemaSkewTypes: () => compileSchemaSkewTypes,
      compileSchemaTypeScript: () => compileSchemaTypeScript,
      decodeBinarySchema: () => decodeBinarySchema,
      encodeBinarySchema: () => encodeBinarySchema,
      parseSchema: () => parseSchema,
      prettyPrintSchema: () => prettyPrintSchema
    });
    module2.exports = __toCommonJS(kiwi_exports);
    var int32 = new Int32Array(1);
    var float32 = new Float32Array(int32.buffer);
    var ByteBuffer = class {
      constructor(data) {
        if (data && !(data instanceof Uint8Array)) {
          throw new Error("Must initialize a ByteBuffer with a Uint8Array");
        }
        this._data = data || new Uint8Array(256);
        this._index = 0;
        this.length = data ? data.length : 0;
      }
      toUint8Array() {
        return this._data.subarray(0, this.length);
      }
      readByte() {
        if (this._index + 1 > this._data.length) {
          throw new Error("Index out of bounds");
        }
        return this._data[this._index++];
      }
      readByteArray() {
        let length = this.readVarUint();
        let start = this._index;
        let end = start + length;
        if (end > this._data.length) {
          throw new Error("Read array out of bounds");
        }
        this._index = end;
        let result2 = new Uint8Array(length);
        result2.set(this._data.subarray(start, end));
        return result2;
      }
      readVarFloat() {
        let index = this._index;
        let data = this._data;
        let length = data.length;
        if (index + 1 > length) {
          throw new Error("Index out of bounds");
        }
        let first = data[index];
        if (first === 0) {
          this._index = index + 1;
          return 0;
        }
        if (index + 4 > length) {
          throw new Error("Index out of bounds");
        }
        let bits = first | data[index + 1] << 8 | data[index + 2] << 16 | data[index + 3] << 24;
        this._index = index + 4;
        bits = bits << 23 | bits >>> 9;
        int32[0] = bits;
        return float32[0];
      }
      readVarUint() {
        let value = 0;
        let shift = 0;
        do {
          var byte = this.readByte();
          value |= (byte & 127) << shift;
          shift += 7;
        } while (byte & 128 && shift < 35);
        return value >>> 0;
      }
      readVarInt() {
        let value = this.readVarUint() | 0;
        return value & 1 ? ~(value >>> 1) : value >>> 1;
      }
      readVarUint64() {
        let value = BigInt(0);
        let shift = BigInt(0);
        let seven = BigInt(7);
        let byte;
        while ((byte = this.readByte()) & 128 && shift < 56) {
          value |= BigInt(byte & 127) << shift;
          shift += seven;
        }
        value |= BigInt(byte) << shift;
        return value;
      }
      readVarInt64() {
        let value = this.readVarUint64();
        let one = BigInt(1);
        let sign = value & one;
        value >>= one;
        return sign ? ~value : value;
      }
      readString() {
        let result2 = "";
        while (true) {
          let codePoint;
          let a = this.readByte();
          if (a < 192) {
            codePoint = a;
          } else {
            let b = this.readByte();
            if (a < 224) {
              codePoint = (a & 31) << 6 | b & 63;
            } else {
              let c = this.readByte();
              if (a < 240) {
                codePoint = (a & 15) << 12 | (b & 63) << 6 | c & 63;
              } else {
                let d = this.readByte();
                codePoint = (a & 7) << 18 | (b & 63) << 12 | (c & 63) << 6 | d & 63;
              }
            }
          }
          if (codePoint === 0) {
            break;
          }
          if (codePoint < 65536) {
            result2 += String.fromCharCode(codePoint);
          } else {
            codePoint -= 65536;
            result2 += String.fromCharCode((codePoint >> 10) + 55296, (codePoint & (1 << 10) - 1) + 56320);
          }
        }
        return result2;
      }
      _growBy(amount) {
        if (this.length + amount > this._data.length) {
          let data = new Uint8Array(this.length + amount << 1);
          data.set(this._data);
          this._data = data;
        }
        this.length += amount;
      }
      writeByte(value) {
        let index = this.length;
        this._growBy(1);
        this._data[index] = value;
      }
      writeByteArray(value) {
        this.writeVarUint(value.length);
        let index = this.length;
        this._growBy(value.length);
        this._data.set(value, index);
      }
      writeVarFloat(value) {
        let index = this.length;
        float32[0] = value;
        let bits = int32[0];
        bits = bits >>> 23 | bits << 9;
        if ((bits & 255) === 0) {
          this.writeByte(0);
          return;
        }
        this._growBy(4);
        let data = this._data;
        data[index] = bits;
        data[index + 1] = bits >> 8;
        data[index + 2] = bits >> 16;
        data[index + 3] = bits >> 24;
      }
      writeVarUint(value) {
        if (value < 0 || value > 4294967295)
          throw new Error("Outside uint range: " + value);
        do {
          let byte = value & 127;
          value >>>= 7;
          this.writeByte(value ? byte | 128 : byte);
        } while (value);
      }
      writeVarInt(value) {
        if (value < -2147483648 || value > 2147483647)
          throw new Error("Outside int range: " + value);
        this.writeVarUint((value << 1 ^ value >> 31) >>> 0);
      }
      writeVarUint64(value) {
        if (typeof value === "string")
          value = BigInt(value);
        else if (typeof value !== "bigint")
          throw new Error("Expected bigint but got " + typeof value + ": " + value);
        if (value < 0 || value > BigInt("0xFFFFFFFFFFFFFFFF"))
          throw new Error("Outside uint64 range: " + value);
        let mask = BigInt(127);
        let seven = BigInt(7);
        for (let i = 0; value > mask && i < 8; i++) {
          this.writeByte(Number(value & mask) | 128);
          value >>= seven;
        }
        this.writeByte(Number(value));
      }
      writeVarInt64(value) {
        if (typeof value === "string")
          value = BigInt(value);
        else if (typeof value !== "bigint")
          throw new Error("Expected bigint but got " + typeof value + ": " + value);
        if (value < -BigInt("0x8000000000000000") || value > BigInt("0x7FFFFFFFFFFFFFFF"))
          throw new Error("Outside int64 range: " + value);
        let one = BigInt(1);
        this.writeVarUint64(value < 0 ? ~(value << one) : value << one);
      }
      writeString(value) {
        let codePoint;
        for (let i = 0; i < value.length; i++) {
          let a = value.charCodeAt(i);
          if (i + 1 === value.length || a < 55296 || a >= 56320) {
            codePoint = a;
          } else {
            let b = value.charCodeAt(++i);
            codePoint = (a << 10) + b + (65536 - (55296 << 10) - 56320);
          }
          if (codePoint === 0) {
            throw new Error("Cannot encode a string containing the null character");
          }
          if (codePoint < 128) {
            this.writeByte(codePoint);
          } else {
            if (codePoint < 2048) {
              this.writeByte(codePoint >> 6 & 31 | 192);
            } else {
              if (codePoint < 65536) {
                this.writeByte(codePoint >> 12 & 15 | 224);
              } else {
                this.writeByte(codePoint >> 18 & 7 | 240);
                this.writeByte(codePoint >> 12 & 63 | 128);
              }
              this.writeByte(codePoint >> 6 & 63 | 128);
            }
            this.writeByte(codePoint & 63 | 128);
          }
        }
        this.writeByte(0);
      }
    };
    function quote(text) {
      return JSON.stringify(text);
    }
    function error(text, line, column) {
      var error2 = new Error(text);
      error2.line = line;
      error2.column = column;
      throw error2;
    }
    function compileDecode(definition, definitions) {
      let lines = [];
      let indent = "  ";
      lines.push("function (bb) {");
      lines.push("  var result = {};");
      lines.push("  if (!(bb instanceof this.ByteBuffer)) {");
      lines.push("    bb = new this.ByteBuffer(bb);");
      lines.push("  }");
      lines.push("");
      if (definition.kind === "MESSAGE") {
        lines.push("  while (true) {");
        lines.push("    switch (bb.readVarUint()) {");
        lines.push("      case 0:");
        lines.push("        return result;");
        lines.push("");
        indent = "        ";
      }
      for (let i = 0; i < definition.fields.length; i++) {
        let field = definition.fields[i];
        let code;
        switch (field.type) {
          case "bool": {
            code = "!!bb.readByte()";
            break;
          }
          case "byte": {
            code = "bb.readByte()";
            break;
          }
          case "int": {
            code = "bb.readVarInt()";
            break;
          }
          case "uint": {
            code = "bb.readVarUint()";
            break;
          }
          case "float": {
            code = "bb.readVarFloat()";
            break;
          }
          case "string": {
            code = "bb.readString()";
            break;
          }
          case "int64": {
            code = "bb.readVarInt64()";
            break;
          }
          case "uint64": {
            code = "bb.readVarUint64()";
            break;
          }
          default: {
            let type = definitions[field.type];
            if (!type) {
              error("Invalid type " + quote(field.type) + " for field " + quote(field.name), field.line, field.column);
            } else if (type.kind === "ENUM") {
              code = "this[" + quote(type.name) + "][bb.readVarUint()]";
            } else {
              code = "this[" + quote("decode" + type.name) + "](bb)";
            }
          }
        }
        if (definition.kind === "MESSAGE") {
          lines.push("      case " + field.value + ":");
        }
        if (field.isArray) {
          if (field.isDeprecated) {
            if (field.type === "byte") {
              lines.push(indent + "bb.readByteArray();");
            } else {
              lines.push(indent + "var length = bb.readVarUint();");
              lines.push(indent + "while (length-- > 0) " + code + ";");
            }
          } else {
            if (field.type === "byte") {
              lines.push(indent + "result[" + quote(field.name) + "] = bb.readByteArray();");
            } else {
              lines.push(indent + "var length = bb.readVarUint();");
              lines.push(indent + "var values = result[" + quote(field.name) + "] = Array(length);");
              lines.push(indent + "for (var i = 0; i < length; i++) values[i] = " + code + ";");
            }
          }
        } else {
          if (field.isDeprecated) {
            lines.push(indent + code + ";");
          } else {
            lines.push(indent + "result[" + quote(field.name) + "] = " + code + ";");
          }
        }
        if (definition.kind === "MESSAGE") {
          lines.push("        break;");
          lines.push("");
        }
      }
      if (definition.kind === "MESSAGE") {
        lines.push("      default:");
        lines.push('        throw new Error("Attempted to parse invalid message");');
        lines.push("    }");
        lines.push("  }");
      } else {
        lines.push("  return result;");
      }
      lines.push("}");
      return lines.join("\n");
    }
    function compileEncode(definition, definitions) {
      let lines = [];
      lines.push("function (message, bb) {");
      lines.push("  var isTopLevel = !bb;");
      lines.push("  if (isTopLevel) bb = new this.ByteBuffer();");
      for (let j = 0; j < definition.fields.length; j++) {
        let field = definition.fields[j];
        let code;
        if (field.isDeprecated) {
          continue;
        }
        switch (field.type) {
          case "bool": {
            code = "bb.writeByte(value);";
            break;
          }
          case "byte": {
            code = "bb.writeByte(value);";
            break;
          }
          case "int": {
            code = "bb.writeVarInt(value);";
            break;
          }
          case "uint": {
            code = "bb.writeVarUint(value);";
            break;
          }
          case "float": {
            code = "bb.writeVarFloat(value);";
            break;
          }
          case "string": {
            code = "bb.writeString(value);";
            break;
          }
          case "int64": {
            code = "bb.writeVarInt64(value);";
            break;
          }
          case "uint64": {
            code = "bb.writeVarUint64(value);";
            break;
          }
          default: {
            let type = definitions[field.type];
            if (!type) {
              throw new Error("Invalid type " + quote(field.type) + " for field " + quote(field.name));
            } else if (type.kind === "ENUM") {
              code = "var encoded = this[" + quote(type.name) + '][value]; if (encoded === void 0) throw new Error("Invalid value " + JSON.stringify(value) + ' + quote(" for enum " + quote(type.name)) + "); bb.writeVarUint(encoded);";
            } else {
              code = "this[" + quote("encode" + type.name) + "](value, bb);";
            }
          }
        }
        lines.push("");
        lines.push("  var value = message[" + quote(field.name) + "];");
        lines.push("  if (value != null) {");
        if (definition.kind === "MESSAGE") {
          lines.push("    bb.writeVarUint(" + field.value + ");");
        }
        if (field.isArray) {
          if (field.type === "byte") {
            lines.push("    bb.writeByteArray(value);");
          } else {
            lines.push("    var values = value, n = values.length;");
            lines.push("    bb.writeVarUint(n);");
            lines.push("    for (var i = 0; i < n; i++) {");
            lines.push("      value = values[i];");
            lines.push("      " + code);
            lines.push("    }");
          }
        } else {
          lines.push("    " + code);
        }
        if (definition.kind === "STRUCT") {
          lines.push("  } else {");
          lines.push("    throw new Error(" + quote("Missing required field " + quote(field.name)) + ");");
        }
        lines.push("  }");
      }
      if (definition.kind === "MESSAGE") {
        lines.push("  bb.writeVarUint(0);");
      }
      lines.push("");
      lines.push("  if (isTopLevel) return bb.toUint8Array();");
      lines.push("}");
      return lines.join("\n");
    }
    function compileSchemaJS(schema) {
      let definitions = {};
      let name = schema.package;
      let js = [];
      if (name !== null) {
        js.push("var " + name + " = exports || " + name + " || {}, exports;");
      } else {
        js.push("var exports = exports || {};");
        name = "exports";
      }
      js.push(name + ".ByteBuffer = " + name + '.ByteBuffer || require("kiwi-schema").ByteBuffer;');
      for (let i = 0; i < schema.definitions.length; i++) {
        let definition = schema.definitions[i];
        definitions[definition.name] = definition;
      }
      for (let i = 0; i < schema.definitions.length; i++) {
        let definition = schema.definitions[i];
        switch (definition.kind) {
          case "ENUM": {
            let value = {};
            for (let j = 0; j < definition.fields.length; j++) {
              let field = definition.fields[j];
              value[field.name] = field.value;
              value[field.value] = field.name;
            }
            js.push(name + "[" + quote(definition.name) + "] = " + JSON.stringify(value, null, 2) + ";");
            break;
          }
          case "STRUCT":
          case "MESSAGE": {
            js.push("");
            js.push(name + "[" + quote("decode" + definition.name) + "] = " + compileDecode(definition, definitions) + ";");
            js.push("");
            js.push(name + "[" + quote("encode" + definition.name) + "] = " + compileEncode(definition, definitions) + ";");
            break;
          }
          default: {
            error("Invalid definition kind " + quote(definition.kind), definition.line, definition.column);
            break;
          }
        }
      }
      js.push("");
      return js.join("\n");
    }
    function compileSchema(schema) {
      let result2 = {
        ByteBuffer
      };
      new Function("exports", compileSchemaJS(schema))(result2);
      return result2;
    }
    function argumentForField(definitions, type, name) {
      switch (type) {
        case "bool":
          return { type: "bool ", name };
        case "byte":
          return { type: "uint8_t ", name };
        case "int":
          return { type: "int32_t ", name };
        case "uint":
          return { type: "uint32_t ", name };
        case "float":
          return { type: "float ", name };
        case "string":
          return { type: "const char *", name };
        case "int64":
          return { type: "int64_t ", name };
        case "uint64":
          return { type: "uint64_t ", name };
        default: {
          let definition = definitions[type];
          if (definition.kind === "ENUM")
            return { type: definition.name + " ", name };
          return null;
        }
      }
    }
    function extractStructArguments(definitions, prefix, fields, allowArrays) {
      let args2 = [];
      for (let i = 0; i < fields.length; i++) {
        let field = fields[i];
        let name = prefix + field.name;
        if (field.isArray && !allowArrays) {
          return null;
        }
        let arg = argumentForField(definitions, field.type, name);
        if (arg !== null) {
          args2.push(arg);
          continue;
        }
        let type = definitions[field.type];
        if (type.kind !== "STRUCT") {
          return null;
        }
        let typeArgs = extractStructArguments(definitions, name + "_", type.fields, false);
        if (typeArgs === null) {
          return null;
        }
        args2.push.apply(args2, typeArgs);
      }
      return args2;
    }
    function argToDeclaration(arg) {
      return arg.type + arg.name;
    }
    function argToName(arg) {
      return arg.name;
    }
    function argToNotRead(arg) {
      switch (arg.type) {
        case "bool ":
        case "uint8_t ":
          return "!bb.readByte(" + arg.name + ")";
        case "int32_t ":
          return "!bb.readVarInt(" + arg.name + ")";
        case "uint32_t ":
          return "!bb.readVarUint(" + arg.name + ")";
        case "float ":
          return "!bb.readVarFloat(" + arg.name + ")";
        case "const char *":
          return "!bb.readString(" + arg.name + ")";
        case "int64_t ":
          return "!bb.readVarInt64(" + arg.name + ")";
        case "uint64_t ":
          return "!bb.readVarUint64(" + arg.name + ")";
        default:
          return "!bb.readVarUint(reinterpret_cast<uint32_t &>(" + arg.name + "))";
      }
    }
    function argToWrite(arg) {
      switch (arg.type) {
        case "bool ":
        case "uint8_t ":
          return "_bb.writeByte(" + arg.name + ")";
        case "int32_t ":
          return "_bb.writeVarInt(" + arg.name + ")";
        case "uint32_t ":
          return "_bb.writeVarUint(" + arg.name + ")";
        case "float ":
          return "_bb.writeVarFloat(" + arg.name + ")";
        case "const char *":
          return "_bb.writeString(" + arg.name + ")";
        case "int64_t ":
          return "_bb.writeVarInt64(" + arg.name + ")";
        case "uint64_t ":
          return "_bb.writeVarUint64(" + arg.name + ")";
        default:
          return "_bb.writeVarUint(static_cast<uint32_t>(" + arg.name + "))";
      }
    }
    function emitReadField(cpp, definitions, definition, field, indent) {
      let name = field.name;
      if (field.isArray) {
        let count = "_" + name + "_count";
        cpp.push(indent + "uint32_t " + count + ";");
        cpp.push(indent + "if (!bb.readVarUint(" + count + ")) return false;");
        if (!field.isDeprecated) {
          cpp.push(indent + "visitor.visit" + definition.name + "_" + field.name + "_count(" + count + ");");
        }
        cpp.push(indent + "while (" + count + "-- > 0) {");
        indent += "  ";
        name += "_element";
      }
      let args2 = extractStructArguments(definitions, "", [field], true);
      if (args2 !== null) {
        for (let i = 0; i < args2.length; i++) {
          cpp.push(indent + argToDeclaration(args2[i]) + ";");
        }
        cpp.push(indent + "if (" + args2.map(argToNotRead).join(" || ") + ") return false;");
        if (!field.isDeprecated) {
          cpp.push(indent + "visitor.visit" + definition.name + "_" + name + "(" + args2.map(argToName).join(", ") + ");");
        }
      } else {
        if (!field.isDeprecated) {
          cpp.push(indent + "visitor.visit" + definition.name + "_" + name + "();");
        }
        let type = definitions[field.type];
        cpp.push(indent + "if (!parse" + type.name + "(bb, visitor)) return false;");
      }
      if (field.isArray) {
        cpp.push(indent.slice(2) + "}");
      }
    }
    function compileSchemaCallbackCPP(schema) {
      let definitions = {};
      let cpp = [];
      for (let i = 0; i < schema.definitions.length; i++) {
        let definition = schema.definitions[i];
        definitions[definition.name] = definition;
      }
      if (schema.package !== null) {
        cpp.push("#ifndef INCLUDE_" + schema.package.toUpperCase() + "_H");
        cpp.push("#define INCLUDE_" + schema.package.toUpperCase() + "_H");
        cpp.push("");
      }
      cpp.push('#include "kiwi.h"');
      cpp.push("");
      if (schema.package !== null) {
        cpp.push("namespace " + schema.package + " {");
        cpp.push("");
      }
      for (let i = 0; i < schema.definitions.length; i++) {
        let definition = schema.definitions[i];
        if (definition.kind === "ENUM") {
          cpp.push("enum class " + definition.name + " : uint32_t {");
          for (let j = 0; j < definition.fields.length; j++) {
            let field = definition.fields[j];
            if (!field.isDeprecated) {
              cpp.push("  " + field.name + " = " + field.value + ",");
            }
          }
          cpp.push("};");
          cpp.push("");
        }
      }
      for (let pass = 0; pass < 2; pass++) {
        let suffix = ") = 0;";
        if (pass === 0) {
          cpp.push("class Visitor {");
          cpp.push("public:");
        } else {
          cpp.push("class Writer : public Visitor {");
          cpp.push("private:");
          cpp.push("  kiwi::ByteBuffer &_bb;");
          cpp.push("public:");
          cpp.push("  Writer(kiwi::ByteBuffer &bb) : _bb(bb) {}");
          suffix = ") override;";
        }
        for (let i = 0; i < schema.definitions.length; i++) {
          let definition = schema.definitions[i];
          if (definition.kind === "STRUCT") {
            let args2 = extractStructArguments(definitions, "", definition.fields, false);
            if (args2 !== null) {
              cpp.push("  virtual void visit" + definition.name + "(" + args2.map(argToDeclaration).join(", ") + suffix);
              continue;
            }
          }
          if (definition.kind === "STRUCT" || definition.kind === "MESSAGE") {
            cpp.push("  virtual void begin" + definition.name + "(" + suffix);
            for (let j = 0; j < definition.fields.length; j++) {
              let field = definition.fields[j];
              if (field.isDeprecated) {
                continue;
              }
              let name = field.name;
              if (field.isArray) {
                cpp.push("  virtual void visit" + definition.name + "_" + field.name + "_count(uint32_t size" + suffix);
                name += "_element";
              }
              let args2 = extractStructArguments(definitions, "", [field], true);
              if (args2 !== null) {
                cpp.push("  virtual void visit" + definition.name + "_" + name + "(" + args2.map(argToDeclaration).join(", ") + suffix);
              } else {
                cpp.push("  virtual void visit" + definition.name + "_" + name + "(" + suffix);
              }
            }
            cpp.push("  virtual void end" + definition.name + "(" + suffix);
          }
        }
        cpp.push("};");
        cpp.push("");
      }
      for (let i = 0; i < schema.definitions.length; i++) {
        let definition = schema.definitions[i];
        if (definition.kind === "STRUCT" || definition.kind === "MESSAGE") {
          cpp.push("bool parse" + definition.name + "(kiwi::ByteBuffer &bb, Visitor &visitor);");
        }
      }
      cpp.push("");
      cpp.push("#ifdef IMPLEMENT_SCHEMA_H");
      cpp.push("");
      for (let i = 0; i < schema.definitions.length; i++) {
        let definition = schema.definitions[i];
        if (definition.kind === "STRUCT") {
          let args2 = extractStructArguments(definitions, "", definition.fields, false);
          if (args2 !== null) {
            cpp.push("bool parse" + definition.name + "(kiwi::ByteBuffer &bb, Visitor &visitor) {");
            for (let j = 0; j < args2.length; j++) {
              cpp.push("  " + argToDeclaration(args2[j]) + ";");
            }
            cpp.push("  if (" + args2.map(argToNotRead).join(" || ") + ") return false;");
            cpp.push("  visitor.visit" + definition.name + "(" + args2.map(argToName).join(", ") + ");");
            cpp.push("  return true;");
            cpp.push("}");
            cpp.push("");
          } else {
            cpp.push("bool parse" + definition.name + "(kiwi::ByteBuffer &bb, Visitor &visitor) {");
            cpp.push("  visitor.begin" + definition.name + "();");
            for (let j = 0; j < definition.fields.length; j++) {
              let field = definition.fields[j];
              emitReadField(cpp, definitions, definition, field, "  ");
            }
            cpp.push("  visitor.end" + definition.name + "();");
            cpp.push("  return true;");
            cpp.push("}");
            cpp.push("");
          }
        } else if (definition.kind === "MESSAGE") {
          cpp.push("bool parse" + definition.name + "(kiwi::ByteBuffer &bb, Visitor &visitor) {");
          cpp.push("  visitor.begin" + definition.name + "();");
          cpp.push("  while (true) {");
          cpp.push("    uint32_t _type;");
          cpp.push("    if (!bb.readVarUint(_type)) return false;");
          cpp.push("    switch (_type) {");
          cpp.push("      case 0: {");
          cpp.push("        visitor.end" + definition.name + "();");
          cpp.push("        return true;");
          cpp.push("      }");
          for (let j = 0; j < definition.fields.length; j++) {
            let field = definition.fields[j];
            cpp.push("      case " + field.value + ": {");
            emitReadField(cpp, definitions, definition, field, "        ");
            cpp.push("        break;");
            cpp.push("      }");
          }
          cpp.push("      default: return false;");
          cpp.push("    }");
          cpp.push("  }");
          cpp.push("}");
          cpp.push("");
        }
      }
      for (let i = 0; i < schema.definitions.length; i++) {
        let definition = schema.definitions[i];
        if (definition.kind === "STRUCT") {
          let args2 = extractStructArguments(definitions, "", definition.fields, false);
          if (args2 !== null) {
            cpp.push("void Writer::visit" + definition.name + "(" + args2.map(argToDeclaration).join(", ") + ") {");
            for (let j = 0; j < args2.length; j++) {
              cpp.push("  " + argToWrite(args2[j]) + ";");
            }
            cpp.push("}");
            cpp.push("");
            continue;
          }
        }
        if (definition.kind === "STRUCT" || definition.kind === "MESSAGE") {
          cpp.push("void Writer::begin" + definition.name + "() {");
          cpp.push("}");
          cpp.push("");
          for (let j = 0; j < definition.fields.length; j++) {
            let field = definition.fields[j];
            if (field.isDeprecated) {
              continue;
            }
            let name = field.name;
            if (field.isArray) {
              cpp.push("void Writer::visit" + definition.name + "_" + field.name + "_count(uint32_t size) {");
              if (definition.kind === "MESSAGE") {
                cpp.push("  _bb.writeVarUint(" + field.value + ");");
              }
              cpp.push("  _bb.writeVarUint(size);");
              cpp.push("}");
              cpp.push("");
              name += "_element";
            }
            let args2 = extractStructArguments(definitions, "", [field], true);
            if (args2 !== null) {
              cpp.push("void Writer::visit" + definition.name + "_" + name + "(" + args2.map(argToDeclaration).join(", ") + ") {");
              if (definition.kind === "MESSAGE" && !field.isArray) {
                cpp.push("  _bb.writeVarUint(" + field.value + ");");
              }
              for (let k = 0; k < args2.length; k++) {
                cpp.push("  " + argToWrite(args2[k]) + ";");
              }
              cpp.push("}");
              cpp.push("");
            } else {
              cpp.push("void Writer::visit" + definition.name + "_" + name + "() {");
              if (definition.kind === "MESSAGE" && !field.isArray) {
                cpp.push("  _bb.writeVarUint(" + field.value + ");");
              }
              cpp.push("}");
              cpp.push("");
            }
          }
          cpp.push("void Writer::end" + definition.name + "() {");
          if (definition.kind === "MESSAGE") {
            cpp.push("  _bb.writeVarUint(0);");
          }
          cpp.push("}");
          cpp.push("");
        }
      }
      cpp.push("#endif");
      cpp.push("");
      if (schema.package !== null) {
        cpp.push("}");
        cpp.push("");
        cpp.push("#endif");
        cpp.push("");
      }
      return cpp.join("\n");
    }
    function cppType(definitions, field, isArray) {
      let type;
      switch (field.type) {
        case "bool":
          type = "bool";
          break;
        case "byte":
          type = "uint8_t";
          break;
        case "int":
          type = "int32_t";
          break;
        case "uint":
          type = "uint32_t";
          break;
        case "float":
          type = "float";
          break;
        case "string":
          type = "kiwi::String";
          break;
        case "int64":
          type = "int64_t";
          break;
        case "uint64":
          type = "uint64_t";
          break;
        default: {
          let definition = definitions[field.type];
          if (!definition) {
            error("Invalid type " + quote(field.type) + " for field " + quote(field.name), field.line, field.column);
          }
          type = definition.name;
          break;
        }
      }
      if (isArray) {
        type = "kiwi::Array<" + type + ">";
      }
      return type;
    }
    function cppFieldName(field) {
      return "_data_" + field.name;
    }
    function cppFlagIndex(i) {
      return i >> 5;
    }
    function cppFlagMask(i) {
      return 1 << i % 32 >>> 0;
    }
    function cppIsFieldPointer(definitions, field) {
      return !field.isArray && field.type in definitions && definitions[field.type].kind !== "ENUM";
    }
    function compileSchemaCPP(schema) {
      let definitions = {};
      let cpp = [];
      cpp.push('#include "kiwi.h"');
      cpp.push("");
      if (schema.package !== null) {
        cpp.push("namespace " + schema.package + " {");
        cpp.push("");
        cpp.push("#ifndef INCLUDE_" + schema.package.toUpperCase() + "_H");
        cpp.push("#define INCLUDE_" + schema.package.toUpperCase() + "_H");
        cpp.push("");
      }
      for (let i = 0; i < schema.definitions.length; i++) {
        let definition = schema.definitions[i];
        definitions[definition.name] = definition;
      }
      cpp.push("class BinarySchema {");
      cpp.push("public:");
      cpp.push("  bool parse(kiwi::ByteBuffer &bb);");
      cpp.push("  const kiwi::BinarySchema &underlyingSchema() const { return _schema; }");
      for (let i = 0; i < schema.definitions.length; i++) {
        let definition = schema.definitions[i];
        if (definition.kind === "MESSAGE") {
          cpp.push("  bool skip" + definition.name + "Field(kiwi::ByteBuffer &bb, uint32_t id) const;");
        }
      }
      cpp.push("");
      cpp.push("private:");
      cpp.push("  kiwi::BinarySchema _schema;");
      for (let i = 0; i < schema.definitions.length; i++) {
        let definition = schema.definitions[i];
        if (definition.kind === "MESSAGE") {
          cpp.push("  uint32_t _index" + definition.name + " = 0;");
        }
      }
      cpp.push("};");
      cpp.push("");
      for (let i = 0; i < schema.definitions.length; i++) {
        let definition = schema.definitions[i];
        if (definition.kind === "ENUM") {
          cpp.push("enum class " + definition.name + " : uint32_t {");
          for (let j = 0; j < definition.fields.length; j++) {
            let field = definition.fields[j];
            cpp.push("  " + field.name + " = " + field.value + ",");
          }
          cpp.push("};");
          cpp.push("");
        } else if (definition.kind !== "STRUCT" && definition.kind !== "MESSAGE") {
          error("Invalid definition kind " + quote(definition.kind), definition.line, definition.column);
        }
      }
      for (let pass = 0; pass < 3; pass++) {
        let newline = false;
        if (pass === 2) {
          if (schema.package !== null) {
            cpp.push("#endif");
          }
          cpp.push("#ifdef IMPLEMENT_SCHEMA_H");
          cpp.push("");
          cpp.push("bool BinarySchema::parse(kiwi::ByteBuffer &bb) {");
          cpp.push("  if (!_schema.parse(bb)) return false;");
          for (let i = 0; i < schema.definitions.length; i++) {
            let definition = schema.definitions[i];
            if (definition.kind === "MESSAGE") {
              cpp.push('  _schema.findDefinition("' + definition.name + '", _index' + definition.name + ");");
            }
          }
          cpp.push("  return true;");
          cpp.push("}");
          cpp.push("");
          for (let i = 0; i < schema.definitions.length; i++) {
            let definition = schema.definitions[i];
            if (definition.kind === "MESSAGE") {
              cpp.push("bool BinarySchema::skip" + definition.name + "Field(kiwi::ByteBuffer &bb, uint32_t id) const {");
              cpp.push("  return _schema.skipField(bb, _index" + definition.name + ", id);");
              cpp.push("}");
              cpp.push("");
            }
          }
        }
        for (let i = 0; i < schema.definitions.length; i++) {
          let definition = schema.definitions[i];
          if (definition.kind === "ENUM") {
            continue;
          }
          let fields = definition.fields;
          if (pass === 0) {
            cpp.push("class " + definition.name + ";");
            newline = true;
          } else if (pass === 1) {
            cpp.push("class " + definition.name + " {");
            cpp.push("public:");
            cpp.push("  " + definition.name + "() { (void)_flags; }");
            cpp.push("");
            for (let j = 0; j < fields.length; j++) {
              let field = fields[j];
              if (field.isDeprecated) {
                continue;
              }
              let type = cppType(definitions, field, field.isArray);
              if (cppIsFieldPointer(definitions, field)) {
                cpp.push("  " + type + " *" + field.name + "();");
                cpp.push("  const " + type + " *" + field.name + "() const;");
                cpp.push("  void set_" + field.name + "(" + type + " *value);");
              } else if (field.isArray) {
                cpp.push("  " + type + " *" + field.name + "();");
                cpp.push("  const " + type + " *" + field.name + "() const;");
                cpp.push("  " + type + " &set_" + field.name + "(kiwi::MemoryPool &pool, uint32_t count);");
              } else {
                cpp.push("  " + type + " *" + field.name + "();");
                cpp.push("  const " + type + " *" + field.name + "() const;");
                cpp.push("  void set_" + field.name + "(const " + type + " &value);");
              }
              cpp.push("");
            }
            cpp.push("  bool encode(kiwi::ByteBuffer &bb);");
            cpp.push("  bool decode(kiwi::ByteBuffer &bb, kiwi::MemoryPool &pool, const BinarySchema *schema = nullptr);");
            cpp.push("");
            cpp.push("private:");
            cpp.push("  uint32_t _flags[" + (fields.length + 31 >> 5) + "] = {};");
            let sizes = { "bool": 1, "byte": 1, "int": 4, "uint": 4, "float": 4 };
            let sortedFields = fields.slice().sort(function(a, b) {
              let sizeA = !a.isArray && sizes[a.type] || 8;
              let sizeB = !b.isArray && sizes[b.type] || 8;
              if (sizeA !== sizeB)
                return sizeB - sizeA;
              return fields.indexOf(a) - fields.indexOf(b);
            });
            for (let j = 0; j < sortedFields.length; j++) {
              let field = sortedFields[j];
              if (field.isDeprecated) {
                continue;
              }
              let name = cppFieldName(field);
              let type = cppType(definitions, field, field.isArray);
              if (cppIsFieldPointer(definitions, field)) {
                cpp.push("  " + type + " *" + name + " = {};");
              } else {
                cpp.push("  " + type + " " + name + " = {};");
              }
            }
            cpp.push("};");
            cpp.push("");
          } else {
            for (let j = 0; j < fields.length; j++) {
              let field = fields[j];
              let name = cppFieldName(field);
              let type = cppType(definitions, field, field.isArray);
              let flagIndex = cppFlagIndex(j);
              let flagMask = cppFlagMask(j);
              if (field.isDeprecated) {
                continue;
              }
              if (cppIsFieldPointer(definitions, field)) {
                cpp.push(type + " *" + definition.name + "::" + field.name + "() {");
                cpp.push("  return " + name + ";");
                cpp.push("}");
                cpp.push("");
                cpp.push("const " + type + " *" + definition.name + "::" + field.name + "() const {");
                cpp.push("  return " + name + ";");
                cpp.push("}");
                cpp.push("");
                cpp.push("void " + definition.name + "::set_" + field.name + "(" + type + " *value) {");
                cpp.push("  " + name + " = value;");
                cpp.push("}");
                cpp.push("");
              } else if (field.isArray) {
                cpp.push(type + " *" + definition.name + "::" + field.name + "() {");
                cpp.push("  return _flags[" + flagIndex + "] & " + flagMask + " ? &" + name + " : nullptr;");
                cpp.push("}");
                cpp.push("");
                cpp.push("const " + type + " *" + definition.name + "::" + field.name + "() const {");
                cpp.push("  return _flags[" + flagIndex + "] & " + flagMask + " ? &" + name + " : nullptr;");
                cpp.push("}");
                cpp.push("");
                cpp.push(type + " &" + definition.name + "::set_" + field.name + "(kiwi::MemoryPool &pool, uint32_t count) {");
                cpp.push("  _flags[" + flagIndex + "] |= " + flagMask + "; return " + name + " = pool.array<" + cppType(definitions, field, false) + ">(count);");
                cpp.push("}");
                cpp.push("");
              } else {
                cpp.push(type + " *" + definition.name + "::" + field.name + "() {");
                cpp.push("  return _flags[" + flagIndex + "] & " + flagMask + " ? &" + name + " : nullptr;");
                cpp.push("}");
                cpp.push("");
                cpp.push("const " + type + " *" + definition.name + "::" + field.name + "() const {");
                cpp.push("  return _flags[" + flagIndex + "] & " + flagMask + " ? &" + name + " : nullptr;");
                cpp.push("}");
                cpp.push("");
                cpp.push("void " + definition.name + "::set_" + field.name + "(const " + type + " &value) {");
                cpp.push("  _flags[" + flagIndex + "] |= " + flagMask + "; " + name + " = value;");
                cpp.push("}");
                cpp.push("");
              }
            }
            cpp.push("bool " + definition.name + "::encode(kiwi::ByteBuffer &_bb) {");
            for (let j = 0; j < fields.length; j++) {
              let field = fields[j];
              if (field.isDeprecated) {
                continue;
              }
              let name = cppFieldName(field);
              let value = field.isArray ? "_it" : name;
              let flagIndex = cppFlagIndex(j);
              let flagMask = cppFlagMask(j);
              let code;
              switch (field.type) {
                case "bool": {
                  code = "_bb.writeByte(" + value + ");";
                  break;
                }
                case "byte": {
                  code = "_bb.writeByte(" + value + ");";
                  break;
                }
                case "int": {
                  code = "_bb.writeVarInt(" + value + ");";
                  break;
                }
                case "uint": {
                  code = "_bb.writeVarUint(" + value + ");";
                  break;
                }
                case "float": {
                  code = "_bb.writeVarFloat(" + value + ");";
                  break;
                }
                case "string": {
                  code = "_bb.writeString(" + value + ".c_str());";
                  break;
                }
                case "int64": {
                  code = "_bb.writeVarInt64(" + value + ");";
                  break;
                }
                case "uint64": {
                  code = "_bb.writeVarUint64(" + value + ");";
                  break;
                }
                default: {
                  let type = definitions[field.type];
                  if (!type) {
                    error("Invalid type " + quote(field.type) + " for field " + quote(field.name), field.line, field.column);
                  } else if (type.kind === "ENUM") {
                    code = "_bb.writeVarUint(static_cast<uint32_t>(" + value + "));";
                  } else {
                    code = "if (!" + value + (cppIsFieldPointer(definitions, field) ? "->" : ".") + "encode(_bb)) return false;";
                  }
                }
              }
              let indent = "  ";
              if (definition.kind === "STRUCT") {
                cpp.push("  if (" + field.name + "() == nullptr) return false;");
              } else {
                cpp.push("  if (" + field.name + "() != nullptr) {");
                indent = "    ";
              }
              if (definition.kind === "MESSAGE") {
                cpp.push(indent + "_bb.writeVarUint(" + field.value + ");");
              }
              if (field.isArray) {
                cpp.push(indent + "_bb.writeVarUint(" + name + ".size());");
                cpp.push(indent + "for (" + cppType(definitions, field, false) + " &_it : " + name + ") " + code);
              } else {
                cpp.push(indent + code);
              }
              if (definition.kind !== "STRUCT") {
                cpp.push("  }");
              }
            }
            if (definition.kind === "MESSAGE") {
              cpp.push("  _bb.writeVarUint(0);");
            }
            cpp.push("  return true;");
            cpp.push("}");
            cpp.push("");
            cpp.push("bool " + definition.name + "::decode(kiwi::ByteBuffer &_bb, kiwi::MemoryPool &_pool, const BinarySchema *_schema) {");
            for (let j = 0; j < fields.length; j++) {
              if (fields[j].isArray) {
                cpp.push("  uint32_t _count;");
                break;
              }
            }
            if (definition.kind === "MESSAGE") {
              cpp.push("  while (true) {");
              cpp.push("    uint32_t _type;");
              cpp.push("    if (!_bb.readVarUint(_type)) return false;");
              cpp.push("    switch (_type) {");
              cpp.push("      case 0:");
              cpp.push("        return true;");
            }
            for (let j = 0; j < fields.length; j++) {
              let field = fields[j];
              let name = cppFieldName(field);
              let value = field.isArray ? "_it" : name;
              let isPointer = cppIsFieldPointer(definitions, field);
              let code;
              switch (field.type) {
                case "bool": {
                  code = "_bb.readByte(" + value + ")";
                  break;
                }
                case "byte": {
                  code = "_bb.readByte(" + value + ")";
                  break;
                }
                case "int": {
                  code = "_bb.readVarInt(" + value + ")";
                  break;
                }
                case "uint": {
                  code = "_bb.readVarUint(" + value + ")";
                  break;
                }
                case "float": {
                  code = "_bb.readVarFloat(" + value + ")";
                  break;
                }
                case "string": {
                  code = "_bb.readString(" + value + ", _pool)";
                  break;
                }
                case "int64": {
                  code = "_bb.readVarInt64(" + value + ")";
                  break;
                }
                case "uint64": {
                  code = "_bb.readVarUint64(" + value + ")";
                  break;
                }
                default: {
                  let type2 = definitions[field.type];
                  if (!type2) {
                    error("Invalid type " + quote(field.type) + " for field " + quote(field.name), field.line, field.column);
                  } else if (type2.kind === "ENUM") {
                    code = "_bb.readVarUint(reinterpret_cast<uint32_t &>(" + value + "))";
                  } else {
                    code = value + (isPointer ? "->" : ".") + "decode(_bb, _pool, _schema)";
                  }
                }
              }
              let type = cppType(definitions, field, false);
              let indent = "  ";
              if (definition.kind === "MESSAGE") {
                cpp.push("      case " + field.value + ": {");
                indent = "        ";
              }
              if (field.isArray) {
                cpp.push(indent + "if (!_bb.readVarUint(_count)) return false;");
                if (field.isDeprecated) {
                  cpp.push(indent + "for (" + type + " &_it : _pool.array<" + cppType(definitions, field, false) + ">(_count)) if (!" + code + ") return false;");
                } else {
                  cpp.push(indent + "for (" + type + " &_it : set_" + field.name + "(_pool, _count)) if (!" + code + ") return false;");
                }
              } else {
                if (field.isDeprecated) {
                  if (isPointer) {
                    cpp.push(indent + type + " *" + name + " = _pool.allocate<" + type + ">();");
                  } else {
                    cpp.push(indent + type + " " + name + " = {};");
                  }
                  cpp.push(indent + "if (!" + code + ") return false;");
                } else {
                  if (isPointer) {
                    cpp.push(indent + name + " = _pool.allocate<" + type + ">();");
                  }
                  cpp.push(indent + "if (!" + code + ") return false;");
                  if (!isPointer) {
                    cpp.push(indent + "set_" + field.name + "(" + name + ");");
                  }
                }
              }
              if (definition.kind === "MESSAGE") {
                cpp.push("        break;");
                cpp.push("      }");
              }
            }
            if (definition.kind === "MESSAGE") {
              cpp.push("      default: {");
              cpp.push("        if (!_schema || !_schema->skip" + definition.name + "Field(_bb, _type)) return false;");
              cpp.push("        break;");
              cpp.push("      }");
              cpp.push("    }");
              cpp.push("  }");
            } else {
              cpp.push("  return true;");
            }
            cpp.push("}");
            cpp.push("");
          }
        }
        if (pass === 2) {
          cpp.push("#endif");
          cpp.push("");
        } else if (newline)
          cpp.push("");
      }
      if (schema.package !== null) {
        cpp.push("}");
        cpp.push("");
      }
      return cpp.join("\n");
    }
    function popTrailingNewline(lines) {
      if (lines[lines.length - 1] === "") {
        lines.pop();
      }
    }
    function skewDefaultValueForField(definitions, field) {
      if (field.isArray) {
        return "null";
      }
      switch (field.type) {
        case "bool":
          return "false";
        case "byte":
        case "int":
        case "uint":
          return "0";
        case "float":
          return "0.0";
        case "string":
          return "null";
        case "int64":
        case "uint64":
          return "BigInt.new(0)";
      }
      let def = definitions[field.type];
      if (def.kind === "ENUM") {
        if (def.fields.length > 0) {
          return "." + def.fields[0].name;
        }
        return "0 as " + field.type;
      }
      return "null";
    }
    function skewTypeForField(field) {
      let type;
      switch (field.type) {
        case "bool":
          type = "bool";
          break;
        case "byte":
        case "int":
        case "uint":
          type = "int";
          break;
        case "float":
          type = "double";
          break;
        case "string":
          type = "string";
          break;
        case "int64":
        case "uint64":
          type = "BigInt";
          break;
        default:
          type = field.type;
          break;
      }
      if (field.isArray) {
        type = "List<" + type + ">";
      }
      return type;
    }
    function compileSchemaSkew(schema) {
      let definitions = {};
      let indent = "";
      let lines = [];
      if (schema.package !== null) {
        lines.push("namespace " + schema.package + " {");
        indent += "  ";
      }
      for (let i = 0; i < schema.definitions.length; i++) {
        let definition = schema.definitions[i];
        definitions[definition.name] = definition;
      }
      lines.push(indent + "class BinarySchema {");
      lines.push(indent + "  var _schema = Kiwi.BinarySchema.new");
      for (let i = 0; i < schema.definitions.length; i++) {
        let definition = schema.definitions[i];
        if (definition.kind === "MESSAGE") {
          lines.push(indent + "  var _index" + definition.name + " = 0");
        }
      }
      lines.push("");
      lines.push(indent + "  def parse(bytes Uint8Array) {");
      lines.push(indent + "    _schema.parse(Kiwi.ByteBuffer.new(bytes))");
      for (let i = 0; i < schema.definitions.length; i++) {
        let definition = schema.definitions[i];
        if (definition.kind === "MESSAGE") {
          lines.push(indent + "    _index" + definition.name + ' = _schema.findDefinition("' + definition.name + '")');
        }
      }
      lines.push(indent + "  }");
      for (let i = 0; i < schema.definitions.length; i++) {
        let definition = schema.definitions[i];
        if (definition.kind === "MESSAGE") {
          lines.push("");
          lines.push(indent + "  def skip" + definition.name + "Field(bb Kiwi.ByteBuffer, id int) {");
          lines.push(indent + "    _schema.skipField(bb, _index" + definition.name + ", id)");
          lines.push(indent + "  }");
        }
      }
      lines.push(indent + "}");
      lines.push("");
      for (let i = 0; i < schema.definitions.length; i++) {
        let definition = schema.definitions[i];
        switch (definition.kind) {
          case "ENUM": {
            let encode = {};
            let decode = {};
            lines.push(indent + "enum " + definition.name + " {");
            for (let j = 0; j < definition.fields.length; j++) {
              let field = definition.fields[j];
              encode[field.name] = field.value;
              decode[field.value] = field.name;
              lines.push(indent + "  " + field.name);
            }
            lines.push(indent + "}");
            lines.push("");
            lines.push(indent + "namespace " + definition.name + " {");
            lines.push(indent + "  const _encode = " + JSON.stringify(encode, null, 2).replace(/"/g, "").replace(/\n/g, "\n  " + indent));
            lines.push("");
            lines.push(indent + "  const _decode = " + JSON.stringify(decode, null, 2).replace(/"/g, "").replace(/\n/g, "\n  " + indent));
            lines.push("");
            lines.push(indent + "  def encode(value " + definition.name + ") int {");
            lines.push(indent + "    return _encode[value]");
            lines.push(indent + "  }");
            lines.push("");
            lines.push(indent + "  def decode(value int) " + definition.name + " {");
            lines.push(indent + "    if !(value in _decode) {");
            lines.push(indent + "      Kiwi.DecodeError.throwInvalidEnumValue(" + quote(definition.name) + ")");
            lines.push(indent + "    }");
            lines.push(indent + "    return _decode[value]");
            lines.push(indent + "  }");
            lines.push(indent + "}");
            lines.push("");
            break;
          }
          case "STRUCT":
          case "MESSAGE": {
            lines.push(indent + "class " + definition.name + " {");
            for (let j = 0; j < definition.fields.length; j += 32) {
              lines.push(indent + "  var _flags" + (j >> 5) + " = 0");
            }
            for (let j = 0; j < definition.fields.length; j++) {
              let field = definition.fields[j];
              if (field.isDeprecated) {
                continue;
              }
              lines.push(indent + "  var _" + field.name + " " + skewTypeForField(field) + " = " + skewDefaultValueForField(definitions, field));
            }
            lines.push("");
            for (let j = 0; j < definition.fields.length; j++) {
              let field = definition.fields[j];
              if (field.isDeprecated) {
                continue;
              }
              let type = skewTypeForField(field);
              let flags = "_flags" + (j >> 5);
              let mask = "" + (1 << j % 32 >>> 0);
              lines.push(indent + "  def has_" + field.name + " bool {");
              lines.push(indent + "    return (" + flags + " & " + mask + ") != 0");
              lines.push(indent + "  }");
              lines.push("");
              lines.push(indent + "  def " + field.name + " " + type + " {");
              lines.push(indent + "    assert(has_" + field.name + ")");
              lines.push(indent + "    return _" + field.name);
              lines.push(indent + "  }");
              lines.push("");
              lines.push(indent + "  def " + field.name + "=(value " + type + ") {");
              lines.push(indent + "    _" + field.name + " = value");
              lines.push(indent + "    " + flags + " |= " + mask);
              lines.push(indent + "  }");
              lines.push("");
            }
            lines.push(indent + "  def encode(bb Kiwi.ByteBuffer) {");
            for (let j = 0; j < definition.fields.length; j++) {
              let field = definition.fields[j];
              if (field.isDeprecated) {
                continue;
              }
              let value = "_" + field.name;
              let code;
              if (field.isArray) {
                value = "value";
              }
              switch (field.type) {
                case "bool": {
                  code = "bb.writeByte(" + value + " as int)";
                  break;
                }
                case "byte": {
                  code = "bb.writeByte(" + value + ")";
                  break;
                }
                case "int": {
                  code = "bb.writeVarInt(" + value + ")";
                  break;
                }
                case "uint": {
                  code = "bb.writeVarUint(" + value + ")";
                  break;
                }
                case "float": {
                  code = "bb.writeVarFloat(" + value + ")";
                  break;
                }
                case "string": {
                  code = "bb.writeString(" + value + ")";
                  break;
                }
                case "int64": {
                  code = "bb.writeVarInt64(" + value + ")";
                  break;
                }
                case "uint64": {
                  code = "bb.writeVarUint64(" + value + ")";
                  break;
                }
                default: {
                  let type = definitions[field.type];
                  if (!type) {
                    error("Invalid type " + quote(field.type) + " for field " + quote(field.name), field.line, field.column);
                  } else if (type.kind === "ENUM") {
                    code = "bb.writeVarUint(" + type.name + ".encode(" + value + "))";
                  } else {
                    code = value + ".encode(bb)";
                  }
                }
              }
              let nestedIndent2 = indent + "    ";
              if (definition.kind === "STRUCT") {
                lines.push(nestedIndent2 + "assert(has_" + field.name + ")");
              } else {
                lines.push(nestedIndent2 + "if has_" + field.name + " {");
                nestedIndent2 += "  ";
              }
              if (definition.kind === "MESSAGE") {
                lines.push(nestedIndent2 + "bb.writeVarUint(" + field.value + ")");
              }
              if (field.isArray) {
                lines.push(nestedIndent2 + "bb.writeVarUint(_" + field.name + ".count)");
                lines.push(nestedIndent2 + "for value in _" + field.name + " {");
                lines.push(nestedIndent2 + "  " + code);
                lines.push(nestedIndent2 + "}");
              } else {
                lines.push(nestedIndent2 + code);
              }
              if (definition.kind !== "STRUCT") {
                lines.push(indent + "    }");
              }
              lines.push("");
            }
            if (definition.kind === "MESSAGE") {
              lines.push(indent + "    bb.writeVarUint(0)");
            } else {
              popTrailingNewline(lines);
            }
            lines.push(indent + "  }");
            lines.push("");
            lines.push(indent + "  def encode Uint8Array {");
            lines.push(indent + "    var bb = Kiwi.ByteBuffer.new");
            lines.push(indent + "    encode(bb)");
            lines.push(indent + "    return bb.toUint8Array");
            lines.push(indent + "  }");
            lines.push(indent + "}");
            lines.push("");
            lines.push(indent + "namespace " + definition.name + " {");
            lines.push(indent + "  def decode(bytes Uint8Array) " + definition.name + " {");
            lines.push(indent + "    return decode(Kiwi.ByteBuffer.new(bytes), null)");
            lines.push(indent + "  }");
            lines.push("");
            lines.push(indent + "  def decode(bytes Uint8Array, schema BinarySchema) " + definition.name + " {");
            lines.push(indent + "    return decode(Kiwi.ByteBuffer.new(bytes), schema)");
            lines.push(indent + "  }");
            lines.push("");
            lines.push(indent + "  def decode(bb Kiwi.ByteBuffer, schema BinarySchema) " + definition.name + " {");
            lines.push(indent + "    var self = new");
            for (let j = 0; j < definition.fields.length; j++) {
              if (definition.fields[j].isArray) {
                lines.push(indent + "    var count = 0");
                break;
              }
            }
            let nestedIndent = indent + "  ";
            if (definition.kind === "MESSAGE") {
              lines.push(indent + "    while true {");
              lines.push(indent + "      var type = bb.readVarUint");
              lines.push(indent + "      switch type {");
              lines.push(indent + "        case 0 {");
              lines.push(indent + "          break");
              lines.push(indent + "        }");
              lines.push("");
              nestedIndent += "      ";
            }
            for (let j = 0; j < definition.fields.length; j++) {
              let field = definition.fields[j];
              let code;
              switch (field.type) {
                case "bool": {
                  code = field.isDeprecated ? "bb.readByte" : "bb.readByte as bool";
                  break;
                }
                case "byte": {
                  code = "bb.readByte";
                  break;
                }
                case "int": {
                  code = "bb.readVarInt";
                  break;
                }
                case "uint": {
                  code = "bb.readVarUint";
                  break;
                }
                case "float": {
                  code = "bb.readVarFloat";
                  break;
                }
                case "string": {
                  code = "bb.readString";
                  break;
                }
                case "int64": {
                  code = "bb.readVarInt64";
                  break;
                }
                case "uint64": {
                  code = "bb.readVarUint64";
                  break;
                }
                default: {
                  let type = definitions[field.type];
                  if (!type) {
                    error("Invalid type " + quote(field.type) + " for field " + quote(field.name), field.line, field.column);
                  } else if (type.kind === "ENUM") {
                    code = type.name + ".decode(bb.readVarUint)";
                  } else {
                    code = type.name + ".decode(bb, schema)";
                  }
                }
              }
              if (definition.kind === "MESSAGE") {
                lines.push(nestedIndent + "case " + field.value + " {");
              }
              if (field.isArray) {
                if (field.isDeprecated) {
                  lines.push(nestedIndent + "  for i in 0..bb.readVarUint {");
                  lines.push(nestedIndent + "    " + code);
                  lines.push(nestedIndent + "  }");
                } else {
                  lines.push(nestedIndent + "  count = bb.readVarUint");
                  lines.push(nestedIndent + "  self." + field.name + " = []");
                  lines.push(nestedIndent + "  for array = self._" + field.name + "; count != 0; count-- {");
                  lines.push(nestedIndent + "    array.append(" + code + ")");
                  lines.push(nestedIndent + "  }");
                }
              } else {
                if (field.isDeprecated) {
                  lines.push(nestedIndent + "  " + code);
                } else {
                  lines.push(nestedIndent + "  self." + field.name + " = " + code);
                }
              }
              if (definition.kind === "MESSAGE") {
                lines.push(nestedIndent + "}");
                lines.push("");
              }
            }
            if (definition.kind === "MESSAGE") {
              lines.push(indent + "        default {");
              lines.push(indent + "          if schema == null { Kiwi.DecodeError.throwInvalidMessage }");
              lines.push(indent + "          else { schema.skip" + definition.name + "Field(bb, type) }");
              lines.push(indent + "        }");
              lines.push(indent + "      }");
              lines.push(indent + "    }");
            }
            lines.push(indent + "    return self");
            lines.push(indent + "  }");
            lines.push(indent + "}");
            lines.push("");
            break;
          }
          default: {
            error("Invalid definition kind " + quote(definition.kind), definition.line, definition.column);
            break;
          }
        }
      }
      if (schema.package !== null) {
        popTrailingNewline(lines);
        lines.push("}");
      }
      lines.push("");
      return lines.join("\n");
    }
    function compileSchemaSkewTypes(schema) {
      var indent = "";
      var lines = [];
      if (schema.package !== null) {
        lines.push("namespace " + schema.package + " {");
        indent += "  ";
      }
      for (var i = 0; i < schema.definitions.length; i++) {
        var definition = schema.definitions[i];
        if (definition.kind === "ENUM") {
          lines.push(indent + "type " + definition.name + " : string {");
          lines.push(indent + "  @alwaysinline");
          lines.push(indent + "  def toString string { return self as string }");
          lines.push(indent + "}");
          if (definition.fields.length > 0) {
            lines.push(indent + "namespace " + definition.name + " {");
            for (var j = 0; j < definition.fields.length; j++) {
              lines.push(indent + "  @alwaysinline");
              lines.push(indent + "  def " + definition.fields[j].name + " " + definition.name + " { return " + JSON.stringify(definition.fields[j].name) + " as " + definition.name + " }");
            }
            lines.push(indent + "}");
          }
          lines.push("");
        }
      }
      for (var i = 0; i < schema.definitions.length; i++) {
        var definition = schema.definitions[i];
        if (definition.kind === "STRUCT" || definition.kind === "MESSAGE") {
          lines.push(indent + "@import");
          lines.push(indent + "class " + definition.name + " {");
          for (var j = 0; j < definition.fields.length; j++) {
            var field = definition.fields[j];
            var type;
            if (field.isDeprecated) {
              continue;
            }
            switch (field.type) {
              case "byte":
              case "uint":
                type = "int";
                break;
              case "float":
                type = "double";
                break;
              case "int64":
              case "uint64":
                type = "BigInt";
                break;
              default:
                type = field.type;
                break;
            }
            if (field.type === "byte" && field.isArray)
              type = "Uint8Array";
            else if (field.isArray)
              type = "List<" + type + ">";
            lines.push(indent + "  var " + field.name + " " + type);
            lines.push(indent + "  @alwaysinline");
            lines.push(indent + "  def has_" + field.name + " bool { return self." + field.name + " != dynamic.void(0) }");
          }
          lines.push(indent + "}");
          lines.push("");
          lines.push(indent + "namespace " + definition.name + " {");
          lines.push(indent + "  @alwaysinline");
          lines.push(indent + "  def new " + definition.name + " { return {} as dynamic }");
          lines.push(indent + "}");
          lines.push("");
        } else if (definition.kind !== "ENUM") {
          error("Invalid definition kind " + quote(definition.kind), definition.line, definition.column);
        }
      }
      lines.push(indent + "@import");
      lines.push(indent + "class Schema {");
      for (var i = 0; i < schema.definitions.length; i++) {
        var definition = schema.definitions[i];
        if (definition.kind === "ENUM") {
          lines.push(indent + "  const " + definition.name + " dynamic");
        } else if (definition.kind === "STRUCT" || definition.kind === "MESSAGE") {
          lines.push(indent + "  def encode" + definition.name + "(message " + definition.name + ") Uint8Array");
          lines.push(indent + "  def decode" + definition.name + "(buffer Uint8Array) " + definition.name);
        }
      }
      lines.push(indent + "}");
      if (schema.package !== null) {
        lines.push("}");
      }
      lines.push("");
      return lines.join("\n");
    }
    function compileSchemaTypeScript(schema) {
      var indent = "";
      var lines = [];
      if (schema.package !== null) {
        lines.push("export namespace " + schema.package + " {");
        indent += "  ";
      }
      for (var i = 0; i < schema.definitions.length; i++) {
        var definition = schema.definitions[i];
        if (definition.kind === "ENUM") {
          lines.push(indent + "export type " + definition.name + " =");
          for (var j = 0; j < definition.fields.length; j++) {
            lines.push(indent + "  " + JSON.stringify(definition.fields[j].name) + (j + 1 < definition.fields.length ? " |" : ";"));
          }
          if (!definition.fields.length) {
            lines.push(indent + "  any;");
          }
          lines.push("");
        }
      }
      for (var i = 0; i < schema.definitions.length; i++) {
        var definition = schema.definitions[i];
        if (definition.kind === "STRUCT" || definition.kind === "MESSAGE") {
          lines.push(indent + "export interface " + definition.name + " {");
          for (var j = 0; j < definition.fields.length; j++) {
            var field = definition.fields[j];
            var type;
            if (field.isDeprecated) {
              continue;
            }
            switch (field.type) {
              case "bool":
                type = "boolean";
                break;
              case "byte":
              case "int":
              case "uint":
              case "float":
                type = "number";
                break;
              case "int64":
              case "uint64":
                type = "bigint";
                break;
              default:
                type = field.type;
                break;
            }
            if (field.type === "byte" && field.isArray)
              type = "Uint8Array";
            else if (field.isArray)
              type += "[]";
            lines.push(indent + "  " + field.name + (definition.kind === "MESSAGE" ? "?" : "") + ": " + type + ";");
          }
          lines.push(indent + "}");
          lines.push("");
        } else if (definition.kind !== "ENUM") {
          error("Invalid definition kind " + quote(definition.kind), definition.line, definition.column);
        }
      }
      lines.push(indent + "export interface Schema {");
      for (var i = 0; i < schema.definitions.length; i++) {
        var definition = schema.definitions[i];
        if (definition.kind === "ENUM") {
          lines.push(indent + "  " + definition.name + ": any;");
        } else if (definition.kind === "STRUCT" || definition.kind === "MESSAGE") {
          lines.push(indent + "  encode" + definition.name + "(message: " + definition.name + "): Uint8Array;");
          lines.push(indent + "  decode" + definition.name + "(buffer: Uint8Array): " + definition.name + ";");
        }
      }
      lines.push(indent + "}");
      if (schema.package !== null) {
        lines.push("}");
      }
      lines.push("");
      return lines.join("\n");
    }
    var types = ["bool", "byte", "int", "uint", "float", "string", "int64", "uint64"];
    var kinds = ["ENUM", "STRUCT", "MESSAGE"];
    function decodeBinarySchema(buffer) {
      let bb = buffer instanceof ByteBuffer ? buffer : new ByteBuffer(buffer);
      let definitionCount = bb.readVarUint();
      let definitions = [];
      for (let i = 0; i < definitionCount; i++) {
        let definitionName = bb.readString();
        let kind = bb.readByte();
        let fieldCount = bb.readVarUint();
        let fields = [];
        for (let j = 0; j < fieldCount; j++) {
          let fieldName = bb.readString();
          let type = bb.readVarInt();
          let isArray = !!(bb.readByte() & 1);
          let value = bb.readVarUint();
          fields.push({
            name: fieldName,
            line: 0,
            column: 0,
            type: kinds[kind] === "ENUM" ? null : type,
            isArray,
            isDeprecated: false,
            value
          });
        }
        definitions.push({
          name: definitionName,
          line: 0,
          column: 0,
          kind: kinds[kind],
          fields
        });
      }
      for (let i = 0; i < definitionCount; i++) {
        let fields = definitions[i].fields;
        for (let j = 0; j < fields.length; j++) {
          let field = fields[j];
          let type = field.type;
          if (type !== null && type < 0) {
            if (~type >= types.length) {
              throw new Error("Invalid type " + type);
            }
            field.type = types[~type];
          } else {
            if (type !== null && type >= definitions.length) {
              throw new Error("Invalid type " + type);
            }
            field.type = type === null ? null : definitions[type].name;
          }
        }
      }
      return {
        package: null,
        definitions
      };
    }
    function encodeBinarySchema(schema) {
      let bb = new ByteBuffer();
      let definitions = schema.definitions;
      let definitionIndex = {};
      bb.writeVarUint(definitions.length);
      for (let i = 0; i < definitions.length; i++) {
        definitionIndex[definitions[i].name] = i;
      }
      for (let i = 0; i < definitions.length; i++) {
        let definition = definitions[i];
        bb.writeString(definition.name);
        bb.writeByte(kinds.indexOf(definition.kind));
        bb.writeVarUint(definition.fields.length);
        for (let j = 0; j < definition.fields.length; j++) {
          let field = definition.fields[j];
          let type = types.indexOf(field.type);
          bb.writeString(field.name);
          bb.writeVarInt(type === -1 ? definitionIndex[field.type] : ~type);
          bb.writeByte(field.isArray ? 1 : 0);
          bb.writeVarUint(field.value);
        }
      }
      return bb.toUint8Array();
    }
    var nativeTypes = [
      "bool",
      "byte",
      "float",
      "int",
      "int64",
      "string",
      "uint",
      "uint64"
    ];
    var reservedNames = [
      "ByteBuffer",
      "package"
    ];
    var regex = /((?:-|\b)\d+\b|[=;{}]|\[\]|\[deprecated\]|\b[A-Za-z_][A-Za-z0-9_]*\b|\/\/.*|\s+)/g;
    var identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
    var whitespace = /^\/\/.*|\s+$/;
    var equals = /^=$/;
    var endOfFile = /^$/;
    var semicolon = /^;$/;
    var integer = /^-?\d+$/;
    var leftBrace = /^\{$/;
    var rightBrace = /^\}$/;
    var arrayToken = /^\[\]$/;
    var enumKeyword = /^enum$/;
    var structKeyword = /^struct$/;
    var messageKeyword = /^message$/;
    var packageKeyword = /^package$/;
    var deprecatedToken = /^\[deprecated\]$/;
    function tokenize(text) {
      let parts = text.split(regex);
      let tokens = [];
      let column = 0;
      let line = 0;
      for (let i = 0; i < parts.length; i++) {
        let part = parts[i];
        if (i & 1) {
          if (!whitespace.test(part)) {
            tokens.push({
              text: part,
              line: line + 1,
              column: column + 1
            });
          }
        } else if (part !== "") {
          error("Syntax error " + quote(part), line + 1, column + 1);
        }
        let lines = part.split("\n");
        if (lines.length > 1)
          column = 0;
        line += lines.length - 1;
        column += lines[lines.length - 1].length;
      }
      tokens.push({
        text: "",
        line,
        column
      });
      return tokens;
    }
    function parse(tokens) {
      function current() {
        return tokens[index];
      }
      function eat(test) {
        if (test.test(current().text)) {
          index++;
          return true;
        }
        return false;
      }
      function expect(test, expected) {
        if (!eat(test)) {
          let token = current();
          error("Expected " + expected + " but found " + quote(token.text), token.line, token.column);
        }
      }
      function unexpectedToken() {
        let token = current();
        error("Unexpected token " + quote(token.text), token.line, token.column);
      }
      let definitions = [];
      let packageText = null;
      let index = 0;
      if (eat(packageKeyword)) {
        packageText = current().text;
        expect(identifier, "identifier");
        expect(semicolon, '";"');
      }
      while (index < tokens.length && !eat(endOfFile)) {
        let fields = [];
        let kind;
        if (eat(enumKeyword))
          kind = "ENUM";
        else if (eat(structKeyword))
          kind = "STRUCT";
        else if (eat(messageKeyword))
          kind = "MESSAGE";
        else
          unexpectedToken();
        let name = current();
        expect(identifier, "identifier");
        expect(leftBrace, '"{"');
        while (!eat(rightBrace)) {
          let type = null;
          let isArray = false;
          let isDeprecated = false;
          if (kind !== "ENUM") {
            type = current().text;
            expect(identifier, "identifier");
            isArray = eat(arrayToken);
          }
          let field = current();
          expect(identifier, "identifier");
          let value = null;
          if (kind !== "STRUCT") {
            expect(equals, '"="');
            value = current();
            expect(integer, "integer");
            if ((+value.text | 0) + "" !== value.text) {
              error("Invalid integer " + quote(value.text), value.line, value.column);
            }
          }
          let deprecated = current();
          if (eat(deprecatedToken)) {
            if (kind !== "MESSAGE") {
              error("Cannot deprecate this field", deprecated.line, deprecated.column);
            }
            isDeprecated = true;
          }
          expect(semicolon, '";"');
          fields.push({
            name: field.text,
            line: field.line,
            column: field.column,
            type,
            isArray,
            isDeprecated,
            value: value !== null ? +value.text | 0 : fields.length + 1
          });
        }
        definitions.push({
          name: name.text,
          line: name.line,
          column: name.column,
          kind,
          fields
        });
      }
      return {
        package: packageText,
        definitions
      };
    }
    function verify(root) {
      let definedTypes = nativeTypes.slice();
      let definitions = {};
      for (let i = 0; i < root.definitions.length; i++) {
        let definition = root.definitions[i];
        if (definedTypes.indexOf(definition.name) !== -1) {
          error("The type " + quote(definition.name) + " is defined twice", definition.line, definition.column);
        }
        if (reservedNames.indexOf(definition.name) !== -1) {
          error("The type name " + quote(definition.name) + " is reserved", definition.line, definition.column);
        }
        definedTypes.push(definition.name);
        definitions[definition.name] = definition;
      }
      for (let i = 0; i < root.definitions.length; i++) {
        let definition = root.definitions[i];
        let fields = definition.fields;
        if (definition.kind === "ENUM" || fields.length === 0) {
          continue;
        }
        for (let j = 0; j < fields.length; j++) {
          let field = fields[j];
          if (definedTypes.indexOf(field.type) === -1) {
            error("The type " + quote(field.type) + " is not defined for field " + quote(field.name), field.line, field.column);
          }
        }
        let values = [];
        for (let j = 0; j < fields.length; j++) {
          let field = fields[j];
          if (values.indexOf(field.value) !== -1) {
            error("The id for field " + quote(field.name) + " is used twice", field.line, field.column);
          }
          if (field.value <= 0) {
            error("The id for field " + quote(field.name) + " must be positive", field.line, field.column);
          }
          if (field.value > fields.length) {
            error("The id for field " + quote(field.name) + " cannot be larger than " + fields.length, field.line, field.column);
          }
          values.push(field.value);
        }
      }
      let state = {};
      let check = (name) => {
        let definition = definitions[name];
        if (definition && definition.kind === "STRUCT") {
          if (state[name] === 1) {
            error("Recursive nesting of " + quote(name) + " is not allowed", definition.line, definition.column);
          }
          if (state[name] !== 2 && definition) {
            state[name] = 1;
            let fields = definition.fields;
            for (let i = 0; i < fields.length; i++) {
              let field = fields[i];
              if (!field.isArray) {
                check(field.type);
              }
            }
            state[name] = 2;
          }
        }
        return true;
      };
      for (let i = 0; i < root.definitions.length; i++) {
        check(root.definitions[i].name);
      }
    }
    function parseSchema(text) {
      let schema = parse(tokenize(text));
      verify(schema);
      return schema;
    }
    function prettyPrintSchema(schema) {
      let definitions = schema.definitions;
      let text = "";
      if (schema.package !== null) {
        text += "package " + schema.package + ";\n";
      }
      for (let i = 0; i < definitions.length; i++) {
        let definition = definitions[i];
        if (i > 0 || schema.package !== null)
          text += "\n";
        text += definition.kind.toLowerCase() + " " + definition.name + " {\n";
        for (let j = 0; j < definition.fields.length; j++) {
          let field = definition.fields[j];
          text += "  ";
          if (definition.kind !== "ENUM") {
            text += field.type;
            if (field.isArray) {
              text += "[]";
            }
            text += " ";
          }
          text += field.name;
          if (definition.kind !== "STRUCT") {
            text += " = " + field.value;
          }
          if (field.isDeprecated) {
            text += " [deprecated]";
          }
          text += ";\n";
        }
        text += "}\n";
      }
      return text;
    }
  }
});

// node_modules/fzstd/lib/index.js
var require_lib = __commonJS({
  "node_modules/fzstd/lib/index.js"(exports2) {
    "use strict";
    var ab = ArrayBuffer;
    var u8 = Uint8Array;
    var u16 = Uint16Array;
    var i16 = Int16Array;
    var i32 = Int32Array;
    var slc = function(v, s, e) {
      if (u8.prototype.slice)
        return u8.prototype.slice.call(v, s, e);
      if (s == null || s < 0)
        s = 0;
      if (e == null || e > v.length)
        e = v.length;
      var n = new u8(e - s);
      n.set(v.subarray(s, e));
      return n;
    };
    var fill = function(v, n, s, e) {
      if (u8.prototype.fill)
        return u8.prototype.fill.call(v, n, s, e);
      if (s == null || s < 0)
        s = 0;
      if (e == null || e > v.length)
        e = v.length;
      for (; s < e; ++s)
        v[s] = n;
      return v;
    };
    var cpw = function(v, t, s, e) {
      if (u8.prototype.copyWithin)
        return u8.prototype.copyWithin.call(v, t, s, e);
      if (s == null || s < 0)
        s = 0;
      if (e == null || e > v.length)
        e = v.length;
      while (s < e) {
        v[t++] = v[s++];
      }
    };
    exports2.ZstdErrorCode = {
      InvalidData: 0,
      WindowSizeTooLarge: 1,
      InvalidBlockType: 2,
      FSEAccuracyTooHigh: 3,
      DistanceTooFarBack: 4,
      UnexpectedEOF: 5
    };
    var ec = [
      "invalid zstd data",
      "window size too large (>2046MB)",
      "invalid block type",
      "FSE accuracy too high",
      "match distance too far back",
      "unexpected EOF"
    ];
    var err = function(ind, msg, nt) {
      var e = new Error(msg || ec[ind]);
      e.code = ind;
      if (Error.captureStackTrace)
        Error.captureStackTrace(e, err);
      if (!nt)
        throw e;
      return e;
    };
    var rb = function(d, b, n) {
      var i = 0, o = 0;
      for (; i < n; ++i)
        o |= d[b++] << (i << 3);
      return o;
    };
    var b4 = function(d, b) {
      return (d[b] | d[b + 1] << 8 | d[b + 2] << 16 | d[b + 3] << 24) >>> 0;
    };
    var rzfh = function(dat, w) {
      var n3 = dat[0] | dat[1] << 8 | dat[2] << 16;
      if (n3 == 3126568 && dat[3] == 253) {
        var flg = dat[4];
        var ss = flg >> 5 & 1, cc = flg >> 2 & 1, df = flg & 3, fcf = flg >> 6;
        if (flg & 8)
          err(0);
        var bt = 6 - ss;
        var db = df == 3 ? 4 : df;
        var di = rb(dat, bt, db);
        bt += db;
        var fsb = fcf ? 1 << fcf : ss;
        var fss = rb(dat, bt, fsb) + (fcf == 1 && 256);
        var ws = fss;
        if (!ss) {
          var wb = 1 << 10 + (dat[5] >> 3);
          ws = wb + (wb >> 3) * (dat[5] & 7);
        }
        if (ws > 2145386496)
          err(1);
        var buf = new u8((w == 1 ? fss || ws : w ? 0 : ws) + 12);
        buf[0] = 1, buf[4] = 4, buf[8] = 8;
        return {
          b: bt + fsb,
          y: 0,
          l: 0,
          d: di,
          w: w && w != 1 ? w : buf.subarray(12),
          e: ws,
          o: new i32(buf.buffer, 0, 3),
          u: fss,
          c: cc,
          m: Math.min(131072, ws)
        };
      } else if ((n3 >> 4 | dat[3] << 20) == 25481893) {
        return b4(dat, 4) + 8;
      }
      err(0);
    };
    var msb = function(val) {
      var bits = 0;
      for (; 1 << bits <= val; ++bits)
        ;
      return bits - 1;
    };
    var rfse = function(dat, bt, mal) {
      var tpos = (bt << 3) + 4;
      var al = (dat[bt] & 15) + 5;
      if (al > mal)
        err(3);
      var sz = 1 << al;
      var probs = sz, sym = -1, re = -1, i = -1, ht = sz;
      var buf = new ab(512 + (sz << 2));
      var freq = new i16(buf, 0, 256);
      var dstate = new u16(buf, 0, 256);
      var nstate = new u16(buf, 512, sz);
      var bb1 = 512 + (sz << 1);
      var syms = new u8(buf, bb1, sz);
      var nbits = new u8(buf, bb1 + sz);
      while (sym < 255 && probs > 0) {
        var bits = msb(probs + 1);
        var cbt = tpos >> 3;
        var msk = (1 << bits + 1) - 1;
        var val = (dat[cbt] | dat[cbt + 1] << 8 | dat[cbt + 2] << 16) >> (tpos & 7) & msk;
        var msk1fb = (1 << bits) - 1;
        var msv = msk - probs - 1;
        var sval = val & msk1fb;
        if (sval < msv)
          tpos += bits, val = sval;
        else {
          tpos += bits + 1;
          if (val > msk1fb)
            val -= msv;
        }
        freq[++sym] = --val;
        if (val == -1) {
          probs += val;
          syms[--ht] = sym;
        } else
          probs -= val;
        if (!val) {
          do {
            var rbt = tpos >> 3;
            re = (dat[rbt] | dat[rbt + 1] << 8) >> (tpos & 7) & 3;
            tpos += 2;
            sym += re;
          } while (re == 3);
        }
      }
      if (sym > 255 || probs)
        err(0);
      var sympos = 0;
      var sstep = (sz >> 1) + (sz >> 3) + 3;
      var smask = sz - 1;
      for (var s = 0; s <= sym; ++s) {
        var sf = freq[s];
        if (sf < 1) {
          dstate[s] = -sf;
          continue;
        }
        for (i = 0; i < sf; ++i) {
          syms[sympos] = s;
          do {
            sympos = sympos + sstep & smask;
          } while (sympos >= ht);
        }
      }
      if (sympos)
        err(0);
      for (i = 0; i < sz; ++i) {
        var ns = dstate[syms[i]]++;
        var nb = nbits[i] = al - msb(ns);
        nstate[i] = (ns << nb) - sz;
      }
      return [tpos + 7 >> 3, {
        b: al,
        s: syms,
        n: nbits,
        t: nstate
      }];
    };
    var rhu = function(dat, bt) {
      var i = 0, wc = -1;
      var buf = new u8(292), hb = dat[bt];
      var hw = buf.subarray(0, 256);
      var rc = buf.subarray(256, 268);
      var ri = new u16(buf.buffer, 268);
      if (hb < 128) {
        var _a = rfse(dat, bt + 1, 6), ebt = _a[0], fdt = _a[1];
        bt += hb;
        var epos = ebt << 3;
        var lb = dat[bt];
        if (!lb)
          err(0);
        var st1 = 0, st2 = 0, btr1 = fdt.b, btr2 = btr1;
        var fpos = (++bt << 3) - 8 + msb(lb);
        for (; ; ) {
          fpos -= btr1;
          if (fpos < epos)
            break;
          var cbt = fpos >> 3;
          st1 += (dat[cbt] | dat[cbt + 1] << 8) >> (fpos & 7) & (1 << btr1) - 1;
          hw[++wc] = fdt.s[st1];
          fpos -= btr2;
          if (fpos < epos)
            break;
          cbt = fpos >> 3;
          st2 += (dat[cbt] | dat[cbt + 1] << 8) >> (fpos & 7) & (1 << btr2) - 1;
          hw[++wc] = fdt.s[st2];
          btr1 = fdt.n[st1];
          st1 = fdt.t[st1];
          btr2 = fdt.n[st2];
          st2 = fdt.t[st2];
        }
        if (++wc > 255)
          err(0);
      } else {
        wc = hb - 127;
        for (; i < wc; i += 2) {
          var byte = dat[++bt];
          hw[i] = byte >> 4;
          hw[i + 1] = byte & 15;
        }
        ++bt;
      }
      var wes = 0;
      for (i = 0; i < wc; ++i) {
        var wt = hw[i];
        if (wt > 11)
          err(0);
        wes += wt && 1 << wt - 1;
      }
      var mb = msb(wes) + 1;
      var ts = 1 << mb;
      var rem = ts - wes;
      if (rem & rem - 1)
        err(0);
      hw[wc++] = msb(rem) + 1;
      for (i = 0; i < wc; ++i) {
        var wt = hw[i];
        ++rc[hw[i] = wt && mb + 1 - wt];
      }
      var hbuf = new u8(ts << 1);
      var syms = hbuf.subarray(0, ts), nb = hbuf.subarray(ts);
      ri[mb] = 0;
      for (i = mb; i > 0; --i) {
        var pv = ri[i];
        fill(nb, i, pv, ri[i - 1] = pv + rc[i] * (1 << mb - i));
      }
      if (ri[0] != ts)
        err(0);
      for (i = 0; i < wc; ++i) {
        var bits = hw[i];
        if (bits) {
          var code = ri[bits];
          fill(syms, i, code, ri[bits] = code + (1 << mb - bits));
        }
      }
      return [bt, {
        n: nb,
        b: mb,
        s: syms
      }];
    };
    var dllt = rfse(/* @__PURE__ */ new u8([
      81,
      16,
      99,
      140,
      49,
      198,
      24,
      99,
      12,
      33,
      196,
      24,
      99,
      102,
      102,
      134,
      70,
      146,
      4
    ]), 0, 6)[1];
    var dmlt = rfse(/* @__PURE__ */ new u8([
      33,
      20,
      196,
      24,
      99,
      140,
      33,
      132,
      16,
      66,
      8,
      33,
      132,
      16,
      66,
      8,
      33,
      68,
      68,
      68,
      68,
      68,
      68,
      68,
      68,
      36,
      9
    ]), 0, 6)[1];
    var doct = rfse(/* @__PURE__ */ new u8([
      32,
      132,
      16,
      66,
      102,
      70,
      68,
      68,
      68,
      68,
      36,
      73,
      2
    ]), 0, 5)[1];
    var b2bl = function(b, s) {
      var len = b.length, bl = new i32(len);
      for (var i = 0; i < len; ++i) {
        bl[i] = s;
        s += 1 << b[i];
      }
      return bl;
    };
    var llb = /* @__PURE__ */ new u8((/* @__PURE__ */ new i32([
      0,
      0,
      0,
      0,
      16843009,
      50528770,
      134678020,
      202050057,
      269422093
    ])).buffer, 0, 36);
    var llbl = /* @__PURE__ */ b2bl(llb, 0);
    var mlb = /* @__PURE__ */ new u8((/* @__PURE__ */ new i32([
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      16843009,
      50528770,
      117769220,
      185207048,
      252579084,
      16
    ])).buffer, 0, 53);
    var mlbl = /* @__PURE__ */ b2bl(mlb, 3);
    var dhu = function(dat, out, hu) {
      var len = dat.length, ss = out.length, lb = dat[len - 1], msk = (1 << hu.b) - 1, eb = -hu.b;
      if (!lb)
        err(0);
      var st = 0, btr = hu.b, pos = (len << 3) - 8 + msb(lb) - btr, i = -1;
      for (; pos > eb && i < ss; ) {
        var cbt = pos >> 3;
        var val = (dat[cbt] | dat[cbt + 1] << 8 | dat[cbt + 2] << 16) >> (pos & 7);
        st = (st << btr | val) & msk;
        out[++i] = hu.s[st];
        pos -= btr = hu.n[st];
      }
      if (pos != eb || i + 1 != ss)
        err(0);
    };
    var dhu4 = function(dat, out, hu) {
      var bt = 6;
      var ss = out.length, sz1 = ss + 3 >> 2, sz2 = sz1 << 1, sz3 = sz1 + sz2;
      dhu(dat.subarray(bt, bt += dat[0] | dat[1] << 8), out.subarray(0, sz1), hu);
      dhu(dat.subarray(bt, bt += dat[2] | dat[3] << 8), out.subarray(sz1, sz2), hu);
      dhu(dat.subarray(bt, bt += dat[4] | dat[5] << 8), out.subarray(sz2, sz3), hu);
      dhu(dat.subarray(bt), out.subarray(sz3), hu);
    };
    var rzb = function(dat, st, out) {
      var _a;
      var bt = st.b;
      var b0 = dat[bt], btype = b0 >> 1 & 3;
      st.l = b0 & 1;
      var sz = b0 >> 3 | dat[bt + 1] << 5 | dat[bt + 2] << 13;
      var ebt = (bt += 3) + sz;
      if (btype == 1) {
        if (bt >= dat.length)
          return;
        st.b = bt + 1;
        if (out) {
          fill(out, dat[bt], st.y, st.y += sz);
          return out;
        }
        return fill(new u8(sz), dat[bt]);
      }
      if (ebt > dat.length)
        return;
      if (btype == 0) {
        st.b = ebt;
        if (out) {
          out.set(dat.subarray(bt, ebt), st.y);
          st.y += sz;
          return out;
        }
        return slc(dat, bt, ebt);
      }
      if (btype == 2) {
        var b3 = dat[bt], lbt = b3 & 3, sf = b3 >> 2 & 3;
        var lss = b3 >> 4, lcs = 0, s4 = 0;
        if (lbt < 2) {
          if (sf & 1)
            lss |= dat[++bt] << 4 | (sf & 2 && dat[++bt] << 12);
          else
            lss = b3 >> 3;
        } else {
          s4 = sf;
          if (sf < 2)
            lss |= (dat[++bt] & 63) << 4, lcs = dat[bt] >> 6 | dat[++bt] << 2;
          else if (sf == 2)
            lss |= dat[++bt] << 4 | (dat[++bt] & 3) << 12, lcs = dat[bt] >> 2 | dat[++bt] << 6;
          else
            lss |= dat[++bt] << 4 | (dat[++bt] & 63) << 12, lcs = dat[bt] >> 6 | dat[++bt] << 2 | dat[++bt] << 10;
        }
        ++bt;
        var buf = out ? out.subarray(st.y, st.y + st.m) : new u8(st.m);
        var spl = buf.length - lss;
        if (lbt == 0)
          buf.set(dat.subarray(bt, bt += lss), spl);
        else if (lbt == 1)
          fill(buf, dat[bt++], spl);
        else {
          var hu = st.h;
          if (lbt == 2) {
            var hud = rhu(dat, bt);
            lcs += bt - (bt = hud[0]);
            st.h = hu = hud[1];
          } else if (!hu)
            err(0);
          (s4 ? dhu4 : dhu)(dat.subarray(bt, bt += lcs), buf.subarray(spl), hu);
        }
        var ns = dat[bt++];
        if (ns) {
          if (ns == 255)
            ns = (dat[bt++] | dat[bt++] << 8) + 32512;
          else if (ns > 127)
            ns = ns - 128 << 8 | dat[bt++];
          var scm = dat[bt++];
          if (scm & 3)
            err(0);
          var dts = [dmlt, doct, dllt];
          for (var i = 2; i > -1; --i) {
            var md = scm >> (i << 1) + 2 & 3;
            if (md == 1) {
              var rbuf = new u8([0, 0, dat[bt++]]);
              dts[i] = {
                s: rbuf.subarray(2, 3),
                n: rbuf.subarray(0, 1),
                t: new u16(rbuf.buffer, 0, 1),
                b: 0
              };
            } else if (md == 2) {
              _a = rfse(dat, bt, 9 - (i & 1)), bt = _a[0], dts[i] = _a[1];
            } else if (md == 3) {
              if (!st.t)
                err(0);
              dts[i] = st.t[i];
            }
          }
          var _b = st.t = dts, mlt = _b[0], oct = _b[1], llt = _b[2];
          var lb = dat[ebt - 1];
          if (!lb)
            err(0);
          var spos = (ebt << 3) - 8 + msb(lb) - llt.b, cbt = spos >> 3, oubt = 0;
          var lst = (dat[cbt] | dat[cbt + 1] << 8) >> (spos & 7) & (1 << llt.b) - 1;
          cbt = (spos -= oct.b) >> 3;
          var ost = (dat[cbt] | dat[cbt + 1] << 8) >> (spos & 7) & (1 << oct.b) - 1;
          cbt = (spos -= mlt.b) >> 3;
          var mst = (dat[cbt] | dat[cbt + 1] << 8) >> (spos & 7) & (1 << mlt.b) - 1;
          for (++ns; --ns; ) {
            var llc = llt.s[lst];
            var lbtr = llt.n[lst];
            var mlc = mlt.s[mst];
            var mbtr = mlt.n[mst];
            var ofc = oct.s[ost];
            var obtr = oct.n[ost];
            cbt = (spos -= ofc) >> 3;
            var ofp = 1 << ofc;
            var off = ofp + ((dat[cbt] | dat[cbt + 1] << 8 | dat[cbt + 2] << 16 | dat[cbt + 3] << 24) >>> (spos & 7) & ofp - 1);
            cbt = (spos -= mlb[mlc]) >> 3;
            var ml = mlbl[mlc] + ((dat[cbt] | dat[cbt + 1] << 8 | dat[cbt + 2] << 16) >> (spos & 7) & (1 << mlb[mlc]) - 1);
            cbt = (spos -= llb[llc]) >> 3;
            var ll = llbl[llc] + ((dat[cbt] | dat[cbt + 1] << 8 | dat[cbt + 2] << 16) >> (spos & 7) & (1 << llb[llc]) - 1);
            cbt = (spos -= lbtr) >> 3;
            lst = llt.t[lst] + ((dat[cbt] | dat[cbt + 1] << 8) >> (spos & 7) & (1 << lbtr) - 1);
            cbt = (spos -= mbtr) >> 3;
            mst = mlt.t[mst] + ((dat[cbt] | dat[cbt + 1] << 8) >> (spos & 7) & (1 << mbtr) - 1);
            cbt = (spos -= obtr) >> 3;
            ost = oct.t[ost] + ((dat[cbt] | dat[cbt + 1] << 8) >> (spos & 7) & (1 << obtr) - 1);
            if (off > 3) {
              st.o[2] = st.o[1];
              st.o[1] = st.o[0];
              st.o[0] = off -= 3;
            } else {
              var idx = off - (ll != 0);
              if (idx) {
                off = idx == 3 ? st.o[0] - 1 : st.o[idx];
                if (idx > 1)
                  st.o[2] = st.o[1];
                st.o[1] = st.o[0];
                st.o[0] = off;
              } else
                off = st.o[0];
            }
            for (var i = 0; i < ll; ++i) {
              buf[oubt + i] = buf[spl + i];
            }
            oubt += ll, spl += ll;
            var stin = oubt - off;
            if (stin < 0) {
              var len = -stin;
              var bs = st.e + stin;
              if (len > ml)
                len = ml;
              for (var i = 0; i < len; ++i) {
                buf[oubt + i] = st.w[bs + i];
              }
              oubt += len, ml -= len, stin = 0;
            }
            for (var i = 0; i < ml; ++i) {
              buf[oubt + i] = buf[stin + i];
            }
            oubt += ml;
          }
          if (oubt != spl) {
            while (spl < buf.length) {
              buf[oubt++] = buf[spl++];
            }
          } else
            oubt = buf.length;
          if (out)
            st.y += oubt;
          else
            buf = slc(buf, 0, oubt);
        } else if (out) {
          st.y += lss;
          if (spl) {
            for (var i = 0; i < lss; ++i) {
              buf[i] = buf[spl + i];
            }
          }
        } else if (spl)
          buf = slc(buf, spl);
        st.b = ebt;
        return buf;
      }
      err(2);
    };
    var cct = function(bufs, ol) {
      if (bufs.length == 1)
        return bufs[0];
      var buf = new u8(ol);
      for (var i = 0, b = 0; i < bufs.length; ++i) {
        var chk = bufs[i];
        buf.set(chk, b);
        b += chk.length;
      }
      return buf;
    };
    function decompress(dat, buf) {
      var bufs = [], nb = +!buf;
      var bt = 0, ol = 0;
      for (; dat.length; ) {
        var st = rzfh(dat, nb || buf);
        if (typeof st == "object") {
          if (nb) {
            buf = null;
            if (st.w.length == st.u) {
              bufs.push(buf = st.w);
              ol += st.u;
            }
          } else {
            bufs.push(buf);
            st.e = 0;
          }
          for (; !st.l; ) {
            var blk = rzb(dat, st, buf);
            if (!blk)
              err(5);
            if (buf)
              st.e = st.y;
            else {
              bufs.push(blk);
              ol += blk.length;
              cpw(st.w, 0, blk.length);
              st.w.set(blk, st.w.length - blk.length);
            }
          }
          bt = st.b + st.c * 4;
        } else
          bt = st;
        dat = dat.subarray(bt);
      }
      return cct(bufs, ol);
    }
    exports2.decompress = decompress;
    var Decompress = /* @__PURE__ */ (function() {
      function Decompress2(ondata) {
        this.ondata = ondata;
        this.c = [];
        this.l = 0;
        this.z = 0;
      }
      Decompress2.prototype.push = function(chunk, final) {
        if (typeof this.s == "number") {
          var sub = Math.min(chunk.length, this.s);
          chunk = chunk.subarray(sub);
          this.s -= sub;
        }
        var sl = chunk.length;
        var ncs = sl + this.l;
        if (!this.s) {
          if (final) {
            if (!ncs) {
              this.ondata(new u8(0), true);
              return;
            }
            if (ncs < 5)
              err(5);
          } else if (ncs < 18) {
            this.c.push(chunk);
            this.l = ncs;
            return;
          }
          if (this.l) {
            this.c.push(chunk);
            chunk = cct(this.c, ncs);
            this.c = [];
            this.l = 0;
          }
          if (typeof (this.s = rzfh(chunk)) == "number")
            return this.push(chunk, final);
        }
        if (typeof this.s != "number") {
          if (ncs < (this.z || 3)) {
            if (final)
              err(5);
            this.c.push(chunk);
            this.l = ncs;
            return;
          }
          if (this.l) {
            this.c.push(chunk);
            chunk = cct(this.c, ncs);
            this.c = [];
            this.l = 0;
          }
          if (!this.z && ncs < (this.z = chunk[this.s.b] & 2 ? 4 : 3 + (chunk[this.s.b] >> 3 | chunk[this.s.b + 1] << 5 | chunk[this.s.b + 2] << 13))) {
            if (final)
              err(5);
            this.c.push(chunk);
            this.l = ncs;
            return;
          } else
            this.z = 0;
          for (; ; ) {
            var blk = rzb(chunk, this.s);
            if (!blk) {
              if (final)
                err(5);
              var adc = chunk.subarray(this.s.b);
              this.s.b = 0;
              this.c.push(adc), this.l += adc.length;
              return;
            } else {
              this.ondata(blk, false);
              cpw(this.s.w, 0, blk.length);
              this.s.w.set(blk, this.s.w.length - blk.length);
            }
            if (this.s.l) {
              var rest = chunk.subarray(this.s.b);
              this.s = this.s.c * 4;
              this.push(rest, final);
              return;
            }
          }
        } else if (final)
          err(5);
      };
      return Decompress2;
    })();
    exports2.Decompress = Decompress;
  }
});

// _extract_images_tmp.js
var fs = require("fs");
var path = require("path");
var kiwi = require_kiwi();
var fzstd = require_lib();
function isHexString(buf) {
  const s = buf.toString().trim();
  return s.length >= 16 && /^[0-9a-fA-F]+$/.test(s.slice(0, 32));
}
function parseFile(inputPath) {
  let raw = fs.readFileSync(inputPath);
  if (isHexString(raw)) {
    const hex = raw.toString().trim();
    raw = Buffer.from(hex, "hex");
  }
  if (raw.slice(0, 8).toString() !== "pixso-kw") {
    throw new Error("\u4E0D\u662F\u6709\u6548\u7684 pixso-kw \u6587\u4EF6");
  }
  const zstdMagic = Buffer.from([40, 181, 47, 253]);
  const zstdPos = raw.indexOf(zstdMagic);
  if (zstdPos === -1) throw new Error("\u627E\u4E0D\u5230 zstd \u538B\u7F29\u6570\u636E");
  const decompressed = fzstd.decompress(raw.slice(zstdPos));
  const schemaBin = Buffer.from("7gFQYWludAACG3R5cGUA9gIAAWNvbG9yANYDAAJvcGFjaXR5AAkAA3Zpc2libGUAAQAEYmxlbmRNb2RlAI4CAAVzdG9wcwAEAQZ0cmFuc2Zvcm0A0gMAB2ltYWdlAAYACGltYWdlVGh1bWJuYWlsAAYACWFuaW1hdGVkSW1hZ2UABgAKYW5pbWF0aW9uRnJhbWUABQALaW1hZ2VTY2FsZU1vZGUA+AIADHJvdGF0aW9uAAkADXNjYWxlAAkADnBhaW50RmlsdGVyAAIAD2Vtb2ppQ29kZVBvaW50cwAFARBvcmlnaW5hbEltYWdlV2lkdGgABQARb3JpZ2luYWxJbWFnZUhlaWdodAAFABJ2aWRlbwAGABNjb2xvclZhcgDCAQAUc3RvcHNWYXIAzgEBFXBhdHRlcm5TcGFjaW5nANADABZwYXR0ZXJuVGlsZVR5cGUA9AIAF3ZlcnRpY2FsQWxpZ25tZW50APICABhob3Jpem9udGFsQWxpZ25tZW50APICABlzb3VyY2VOb2RlSWQAzgMAGnNwYWNpbmcACQAbUGFpbnRGaWx0ZXJNZXNzYWdlAAIIdGludAAJAAFzaGFkb3dzAAkAAmhpZ2hsaWdodHMACQADZXhwb3N1cmUACQAEdGVtcGVyYXR1cmUACQAFdmlicmFuY2UACQAGY29udHJhc3QACQAHaHVlAAkACENvbG9yU3RvcAACAmNvbG9yANYDAAFwb3NpdGlvbgAJAAJJbWFnZU1lc3NhZ2UAAgNoYXNoAAMBAW5hbWUACwACZGF0YUJsb2IABQADUGF0aAACA2Jsb2JJbmRleAAFAAF3aW5kaW5nUnVsZQCGAwACcHhUYWcABQADR1VJRFBhdGgAAgFndWlkcwDOAwEBVmVjdG9yRGF0YQACA3ZlY3Rvck5ldHdvcmtCbG9iAAUAAW5vcm1hbGl6ZWRTaXplANADAAJzdHlsZU92ZXJyaWRlVGFibGUAiAEBA0FyY0RhdGEAAgNzdGFydGluZ0FuZ2xlAAkAAWVuZGluZ0FuZ2xlAAkAAmlubmVyUmFkaXVzAAkAA0VmZmVjdAACJnR5cGUAkgIAAWNvbG9yANYDAAJvZmZzZXQA0AMAA3JhZGl1cwAJAAR2aXNpYmxlAAEABWJsZW5kTW9kZQCOAgAGc3ByZWFkAAkAB3Nob3dTaGFkb3dCZWhpbmROb2RlAAEACHNhdHVyYXRpb24ACQAJcmFkaXVzVmFyAMIBAApjb2xvclZhcgDCAQALc3ByZWFkVmFyAMIBAAx4VmFyAMIBAA15VmFyAMIBAA5yZWZyYWN0aW9uUmFkaXVzAAkAD3NwZWN1bGFyQW5nbGUACQAQc3BlY3VsYXJJbnRlbnNpdHkACQARY2hyb21hdGljQWJlcnJhdGlvbgAJABJyZWZyYWN0aW9uSW50ZW5zaXR5AAkAE2JyaWdodG5lc3MACQAUdW5pZm9ybUxpZ2h0AAEAFWJsdXJPcFR5cGUAzAMAFnN0YXJ0UmFkaXVzAAkAF3RyYW5zZm9ybQDSAwAYYmV2ZWxTaXplAAkAGW5vaXNlU2l6ZQDQAwAaZGVuc2l0eQAJABtub2lzZVR5cGUAkAIAHG9wYWNpdHkACQAdc2Vjb25kYXJ5Q29sb3IA1gMAHmNsaXBUb1NoYXBlAAEAH3NlZWQABQAgaXNJbXBhY3QAAQAhc2FtcGxpbmdSYW5nZQAJACJzcGxheQAJACNpc0NvbnZleAABACRjZW50ZXIA0AMAJW1vdGlvbkFuZ2xlAAkAJlN5bWJvbERhdGEAAgNzeW1ib2xJRADOAwABc3ltYm9sT3ZlcnJpZGVzAE4BAnVuaWZvcm1TY2FsZUZhY3RvcgAJAANMYXlvdXRHcmlkAAINdHlwZQCmAgABYXhpcwCoAgACdmlzaWJsZQABAANudW1TZWN0aW9ucwAFAARvZmZzZXQACQAFc2VjdGlvblNpemUACQAGZ3V0dGVyU2l6ZQAJAAdjb2xvcgDWAwAIcGF0dGVybgCqAgAJbnVtU2VjdGlvbnNWYXIAwgEACm9mZnNldFZhcgDCAQALc2VjdGlvblNpemVWYXIAwgEADGd1dHRlclNpemVWYXIAwgEADUdyaWRUcmFja1NpemluZwACA2lkAM4DAAF0eXBlAK4CAAJ2YWx1ZQAJAANFeHBvcnRDb25zdHJhaW50AAICdHlwZQCyAgABdmFsdWUACQACRXhwb3J0U2V0dGluZ3MAAghzdWZmaXgACwABaW1hZ2VUeXBlALACAAJjb25zdHJhaW50ABgAA3N2Z0RhdGFOYW1lAAEABHN2Z0lETW9kZQC0AgAFc3ZnT3V0bGluZVRleHQAAQAGY29udGVudHNPbmx5AAEAB3N2Z0ZvcmNlU3Ryb2tlTWFza3MAAQAIRm9udE5hbWUAAgNmYW1pbHkACwABc3R5bGUACwACcG9zdHNjcmlwdAALAANUZXh0RGF0YQACEWNoYXJhY3RlcnMACwABY2hhcmFjdGVyU3R5bGVJRHMABQECc3R5bGVPdmVycmlkZVRhYmxlAIoBAQNsYXlvdXRTaXplANADAARiYXNlbGluZXMAKgEFZ2x5cGhzACYBBmRlY29yYXRpb25zACQBB2xheW91dFZlcnNpb24ABQAIZm9udE1ldGFEYXRhACIBCWZhbGxiYWNrRm9udHMAHAEKaHlwZXJsaW5rQm94ZXMAIAELcGFyYWdyYXBoU3R5bGUAKAEMcGxhY2VIb2xkZXJzAKABAQ10cnVuY2F0aW9uU3RhcnRJbmRleAAFAA50cnVuY2F0ZWRIZWlnaHQACQAPZ2x5cGhQb3NlcwCwAQEQaXNEaXJ0eQABABFIeXBlcmxpbmtCb3gAAgRib3VuZHMA2AMAAXVybAALAAJndWlkAM4DAANoeXBlcmxpbmtJRAAFAARGb250TWV0YURhdGEAAgVrZXkAHAABZm9udExpbmVIZWlnaHQACQACZm9udERpZ2VzdAADAQNmb250U3R5bGUAyAIABGZvbnRXZWlnaHQABQAFRGVjb3JhdGlvbgACAnJlY3RzANgDAQFzdHlsZUlEAAUAAkdseXBoAAIGYmxvYkluZGV4AAUAAXBvc2l0aW9uANADAAJzdHlsZUlEAAUAA2ZvbnRTaXplAAkABGZpcnN0Q2hhcmFjdGVyAAUABWFkdmFuY2UACQAGUGFyYWdyYXBoU3R5bGUAAgZsaXN0VHlwZQCWAwABaW5kZW50YXRpb25MZXZlbAAHAAJsaXN0U3RhcnRPZmZzZXQABwADaXNGaXJzdExpbmVPZkxpc3QAAQAEc291cmNlRGlyZWN0aW9uYWxpdHkAsAMABWRpcmVjdGlvbmFsaXR5ALADAAZCYXNlbGluZQACB3Bvc2l0aW9uANADAAF3aWR0aAAJAAJsaW5lWQAJAANsaW5lSGVpZ2h0AAkABGxpbmVBc2NlbnQACQAFZmlyc3RDaGFyYWN0ZXIABQAGZW5kQ2hhcmFjdGVyAAUAB0tleVRyaWdnZXIAAgJrZXlDb2RlcwAFAQF0cmlnZ2VyRGV2aWNlAM4CAAJQcm90b3R5cGVEZXZpY2UAAgR0eXBlANoCAAFzaXplANADAAJwcmVzZXRJZGVudGlmaWVyAAsAA3JvdGF0aW9uAN4CAARQcm90b3R5cGVJbnRlcmFjdGlvbgACBGlkAM4DAAFldmVudAA+AAJhY3Rpb25zADwBA2lzRGVsZXRlZAABAARDb25kaXRpb25hbEFjdGlvbnMAAgJhY3Rpb25zADwBAWNvbmRpdGlvbgDCAQACVmlkZW9QbGF5YmFjawACBmF1dG9wbGF5AAEAAW1lZGlhTG9vcAABAAJtdXRlZAABAANzaG93Q29udHJvbHMAAQAEc3RhcnRUaW1lTXMABQAFZW5kVGltZU1zAAUABlZhcmlhYmxlV2lkdGhQb2ludAACBHBvc2l0aW9uAAkAAWFzY2VudAAJAAJkZXNjZW50AAkAA3NlZ21lbnRJZAAFAARQcm90b3R5cGVTZWxlY3RlZFN0YXRlAAIEbm9kZUlEAM4DAAFzdGF0ZVR5cGUA1gIAAnNlbGVjdEdVSUQAzgMAA3N0YXRlQWN0aW9uANQCAARQcm90b3R5cGVTdGF0ZUNoYW5nZQACAnRhcmdldFN0YXRlQWN0aW9uANQCAAFzZWxlY3RlZFN0YXRlcwA4AQJQcm90b3R5cGVBY3Rpb24AAiJ0cmFuc2l0aW9uTm9kZUlEAM4DAAF0cmFuc2l0aW9uVHlwZQDgAgACdHJhbnNpdGlvbkR1cmF0aW9uAAkAA2Vhc2luZ1R5cGUA2AIABHRyYW5zaXRpb25TaG91bGRTbWFydEFuaW1hdGUAAQAFY29ubmVjdGlvblR5cGUA0gIABmNvbm5lY3Rpb25VUkwACwAHb3ZlcmxheVJlbGF0aXZlUG9zaXRpb24A0AMACG5hdmlnYXRpb25UeXBlAOoCAAl0cmFuc2l0aW9uUHJlc2VydmVTY3JvbGwAAQAKZWFzaW5nRnVuY3Rpb24ACQELb3ZlcmZsb3dUeXBlAIoDAAxleHRyYVNjcm9sbE9mZnNldADQAwANc2hvd0hpZGUA3AIADmFkanVzdFNpemUAWAAPbW92aW5nAFoAEGR5bmFtaWNQYW5lbFN0YXRlU3RyAAsAEXJvdGF0aW9uAFwAEndhaXRpbmdUaW1lAAkAE2lzTG9vcGluZwABABRsb29waW5nRHVyYXRpb24ACQAVdGFyZ2V0VmFyaWFibGUA2gEAFnRhcmdldFZhcmlhYmxlRGF0YQDCAQAXdGFyZ2V0VmFyaWFibGVTZXRJRAC2AQAYdGFyZ2V0VmFyaWFibGVNb2RlSUQAzgMAGWNvbmRpdGlvbmFsQWN0aW9ucwAyARp0cmFuc2l0aW9uUmVzZXRWaWRlb1Bvc2l0aW9uAAEAG3RyYW5zaXRpb25SZXNldFNjcm9sbFBvc2l0aW9uAAEAHHRyYW5zaXRpb25SZXNldEludGVyYWN0aXZlQ29tcG9uZW50cwABAB1EaXNwbGF5VG9wTGV2ZWwAAQAebWVkaWFTa2lwVG9UaW1lAAkAH21lZGlhU2tpcEJ5QW1vdW50AAkAIG1lZGlhQWN0aW9uAOwCACFzdGF0ZUNoYW5nZQA6ACJQcm90b3R5cGVFdmVudAACBmludGVyYWN0aW9uVHlwZQDQAgABaW50ZXJhY3Rpb25NYWludGFpbmVkAAEAAmludGVyYWN0aW9uRHVyYXRpb24ACQADa2V5VHJpZ2dlcgAsAAR2b2ljZUV2ZW50UGhyYXNlAAsABXRyYW5zaXRpb25UaW1lb3V0AAkABkNvbXBvbmVudFByb3BEZWYAAgppZADOAwABbmFtZQALAAJpbml0aWFsVmFsdWUARAADc29ydFBvc2l0aW9uAAsABHBhcmVudFByb3BEZWZJZADOAwAFdHlwZQCiAwAGcHJlZmVycmVkVmFsdWVzAEgAB2lzRGVsZXRlZAABAAh2YXJWYWx1ZQDCAQAJYWxpYXNOYW1lAAsACkNvbXBvbmVudFByb3BSZWYAAgVkZWZJRADOAwABem9tYmllRmFsbGJhY2tOYW1lAAsAAmNvbXBvbmVudFByb3BOb2RlRmllbGQApAMAA25vZGVGaWVsZAAHAARpc0RlbGV0ZWQAAQAFQ29tcG9uZW50UHJvcFZhbHVlAAIDdGV4dFZhbHVlAB4AAWd1aWRWYWx1ZQDOAwACYm9vbFZhbHVlAAEAA0luc3RhbmNlU3dhcFByZWZlcnJlZFZhbHVlAAICdHlwZQCgAwABa2V5AAsAAkNvbXBvbmVudFByb3BQcmVmZXJyZWRWYWx1ZXMAAgJzdHJpbmdWYWx1ZXMACwEBaW5zdGFuY2VTd2FwVmFsdWVzAEYBAkNvbXBvbmVudFByb3BBc3NpZ25tZW50AAIDZGVmSUQAzgMAAXZhbHVlAEQAAnZhclZhbHVlAMIBAANCbG9iAAIBYnl0ZXMAAwEBUGl4c29Ob2RlAAL1AWd1aWQAzgMAAWd1aWRQYXRoAAoAAnBhcmVudEluZGV4AHIAA3BoYXNlAPQBAAR0cmFuc2Zvcm0A0gMABXR5cGUA9gEABm5hbWUACwAHdmVjdG9yRGF0YQAMAAh2ZXJzaW9uAAsACXZpc2libGUAAQAKY291bnQABQALc2l6ZQDQAwAMYm9vbGVhbk9wZXJhdGlvbgCMAgANYXJjRGF0YQAOAA5ibGVuZE1vZGUAjgIAD2Nvcm5lclJhZGl1cwAJABBjb3JuZXJTbW9vdGhpbmcACQARb3BhY2l0eQAJABJsb2NrZWQAAQATZWZmZWN0cwAQARRmaWxsR2VvbWV0cnkACAEVZmlsbFBhaW50cwAAARZkYXNoUGF0dGVybgAJARdzdGFja0NvdW50ZXJBbGlnbgCUAgAYc3RhY2tDb3VudGVyU2l6aW5nAJgCABlzdGFja0hlaWdodACYAgAac3RhY2tIb3Jpem9udGFsUGFkZGluZwAJABtzdGFja0p1c3RpZnkAmgIAHHN0YWNrTW9kZQCcAgAdc3RhY2tQYWRkaW5nAAkAHnN0YWNrU3BhY2luZwAJAB9zdGFja1ZlcnRpY2FsUGFkZGluZwAJACBzdGFja1dpZHRoAJgCACFzdHJva2VBbGlnbgCeAgAic3Ryb2tlQ2FwAKACACNzdHJva2VHZW9tZXRyeQAIASRzdHJva2VKb2luAKICACVzdHJva2VQYWludHMAAAEmc3Ryb2tlV2VpZ2h0AAkAJ3N0eWxlRGVzY3JpcHRpb24ACwAoc3R5bGVJRAAFAClzdHlsZVR5cGUApAIAKnN5bWJvbERhdGEAEgArc3ltYm9sRGVzY3JpcHRpb24ACwAsbGF5b3V0R3JpZHMAFAEtbWFzawABAC5tYXNrSXNPdXRsaW5lAAEAL3N0YXJJbm5lclNjYWxlAAkAMG1pdGVyTGltaXQACQAxYmFja2dyb3VuZENvbG9yANYDADJiYWNrZ3JvdW5kRW5hYmxlZAABADNiYWNrZ3JvdW5kT3BhY2l0eQAJADRiYWNrZ3JvdW5kUGFpbnRzAAABNWV4cG9ydEJhY2tncm91bmREaXNhYmxlZAABADZleHBvcnRDb250ZW50c09ubHkAAQA3ZXhwb3J0U2V0dGluZ3MAGgE4ZXhwb3J0VGV4dEFzU1ZHVGV4dAABADlmb250TmFtZQAcADpmb250U2l6ZQAJADtmb250VmVyc2lvbgALADxwYXJhZ3JhcGhJbmRlbnQACQA9cGFyYWdyYXBoU3BhY2luZwAJAD50ZXh0QWxpZ25Ib3Jpem9udGFsAMACAD90ZXh0QWxpZ25WZXJ0aWNhbADCAgBAdGV4dEF1dG9SZXNpemUAxAIAQXRleHRDYXNlAMYCAEJ0ZXh0RGF0YQAeAEN0ZXh0RGVjb3JhdGlvbgDKAgBEdGV4dFRyYWNraW5nAAkARXRleHRVc2VyTGF5b3V0VmVyc2lvbgAFAEZsZXR0ZXJTcGFjaW5nAHAAR2xpbmVIZWlnaHQAcABIaG9yaXpvbnRhbENvbnN0cmFpbnQAzAIASXZlcnRpY2FsQ29uc3RyYWludADMAgBKZGVyaXZlZFN5bWJvbERhdGEATgFLZGVyaXZlZFN5bWJvbERhdGFMYXlvdXRWZXJzaW9uAAUATGNvbXBvbmVudEtleQALAE1pbmhlcml0RWZmZWN0U3R5bGVJRADOAwBOaW5oZXJpdEV4cG9ydFN0eWxlSUQAzgMAT2luaGVyaXRGaWxsU3R5bGVJRADOAwBQaW5oZXJpdEZpbGxTdHlsZUlERm9yQmFja2dyb3VuZADOAwBRaW5oZXJpdEZpbGxTdHlsZUlERm9yU3Ryb2tlAM4DAFJpbmhlcml0R3JpZFN0eWxlSUQAzgMAU2luaGVyaXRTdHJva2VTdHlsZUlEAM4DAFRpbmhlcml0VGV4dFN0eWxlSUQAzgMAVWludGVyYWN0aW9uRHVyYXRpb24ACQBWaW50ZXJhY3Rpb25NYWludGFpbmVkAAEAV292ZXJyaWRkZW5TeW1ib2xJRADOAwBYb3ZlcnJpZGVLZXkAzgMAWWtleVRyaWdnZXIALABabmF2aWdhdGlvblR5cGUA6gIAW2ludGVyYWN0aW9uVHlwZQDQAgBcY29ubmVjdGlvblR5cGUA0gIAXWNvbm5lY3Rpb25VUkwACwBeZWFzaW5nVHlwZQDYAgBfcHJvcG9ydGlvbnNDb25zdHJhaW5lZAABAGBwcm90b3R5cGVCYWNrZ3JvdW5kQ29sb3IA1gMAYXByb3RvdHlwZURldmljZQAuAGJwcm90b3R5cGVJbnRlcmFjdGlvbnMAMAFjcHJvdG90eXBlU3RhcnROb2RlSUQAzgMAZG92ZXJsYXlCYWNrZ3JvdW5kQXBwZWFyYW5jZQBuAGVvdmVybGF5QmFja2dyb3VuZEludGVyYWN0aW9uAOICAGZvdmVybGF5UG9zaXRpb25UeXBlAOYCAGdvdmVybGF5UmVsYXRpdmVQb3NpdGlvbgDQAwBodHJhbnNpdGlvbkR1cmF0aW9uAAkAaXRyYW5zaXRpb25Ob2RlSUQAzgMAanRyYW5zaXRpb25QcmVzZXJ2ZVNjcm9sbAABAGt0cmFuc2l0aW9uU2hvdWxkU21hcnRBbmltYXRlAAEAbHRyYW5zaXRpb25UaW1lb3V0AAkAbXRyYW5zaXRpb25UeXBlAOACAG5zY3JvbGxCZWhhdmlvcgDwAgBvc2Nyb2xsRGlyZWN0aW9uAOgCAHByZWN0YW5nbGVCb3R0b21MZWZ0Q29ybmVyUmFkaXVzAAkAcXJlY3RhbmdsZUJvdHRvbVJpZ2h0Q29ybmVyUmFkaXVzAAkAcnJlY3RhbmdsZUNvcm5lclJhZGlpSW5kZXBlbmRlbnQAAQBzcmVjdGFuZ2xlQ29ybmVyVG9vbEluZGVwZW5kZW50AAEAdHJlY3RhbmdsZVRvcExlZnRDb3JuZXJSYWRpdXMACQB1cmVjdGFuZ2xlVG9wUmlnaHRDb3JuZXJSYWRpdXMACQB2ZnJhbWVNYXNrRGlzYWJsZWQAAQB3aHlwZXJsaW5rAIABAHhzaGFyZWRTdHlsZU1hc3RlckRhdGEAggEAeXNoYXJlZFN0eWxlUmVmZXJlbmNlAIQBAHphdXRvUmVuYW1lAAEAe2hhbmRsZU1pcnJvcmluZwCIAwB8aW50ZXJuYWxPbmx5AAEAfWlzU29mdERlbGV0ZWRTdHlsZQABAH5pc05vblVwZGF0ZWFibGUAAQB/aXNQdWJsaXNoYWJsZQABAIABcHVibGlzaEZpbGUACwCBAXB1Ymxpc2hJRADOAwCCAXB1Ymxpc2hlZFZlcnNpb24ACwCDAWlzU3ltYm9sUHVibGlzaGFibGUAAQCEAXNoYXJlZFN5bWJvbFZlcnNpb24ACwCFAWFuY2VzdG9yUGF0aEJlZm9yZURlbGV0aW9uAM4DAYYBZ3VpZGVzAGwBhwFzdGF0ZUdyb3VwUHJvcGVydHlWYWx1ZU9yZGVycwCMAQGIAWlzU3RhdGVHcm91cAABAIkBc3RhY2tQYWRkaW5nUmlnaHQACQCKAXN0YWNrUGFkZGluZ0xlZnQACQCLAXN0YWNrUGFkZGluZ1RvcAAJAIwBc3RhY2tQYWRkaW5nQm90dG9tAAkAjQFzdGFja1ByaW1hcnlTaXppbmcAmAIAjgFzdGFja0NoaWxkUHJpbWFyeVNpemluZwCYAgCPAXN0YWNrQ2hpbGRDb3VudGVyU2l6aW5nAJgCAJABc3RhY2tQcmltYXJ5QWxpZ25JdGVtcwCWAgCRAXN0YWNrQ291bnRlckFsaWduSXRlbXMAlgIAkgFwcm90b3R5cGVTdGFydFB0AJABAJMBZGFzaENhcACgAgCUAWNvbm5lY3RsaW5lSW5mbwCSAQCVAW9ialNuYXBDb25ubGluZQCUAQGWAWNvbm5saW5lVGV4dEluZm9zAJYBAZcBdmVjdG9yUGFpbnRzAJgBAZgBdmVjdG9yU3R5bGVzAJoBAZkBYm9yZGVyVG9wV2VpZ2h0AAkAmgFib3JkZXJCb3R0b21XZWlnaHQACQCbAWJvcmRlckxlZnRXZWlnaHQACQCcAWJvcmRlclJpZ2h0V2VpZ2h0AAkAnQFib3JkZXJTdHJva2VXZWlnaHRzSW5kZXBlbmRlbnQAAQCeAXBsdWdpbkRhdGEAnAEBnwFzaG93SW5TbGljZQABAKABZXhwb3J0SW1hZ2VRdWFsaXR5AJQDAKEBc3Ryb2tlUGFkZGluZ1BhdGgACAGiAWF1dG9MYXlvdXRBYnNvbHV0ZVBvcwABAKMBYXV0b0xheW91dEl0ZW1SZXZlcnNlRHJhdwABAKQBcGx1Z2luUmVsYXVuY2hEYXRhAJ4BAaUBYXV0b0xheW91dEluY2x1ZGVCb3JkZXJzAAEApgFwcm9kTW9kZQBQAKcBZXhwb3J0Q3V0UGl4AAEAqAFleHBvcnRLZWVwTmFtZUdyb3VwAAEAqQF0ZXh0VHJ1bmNhdGlvbgCYAwCqAW1hc2tUeXBlAJoDAKsBbGVhZGluZ1RyaW0AnAMArAFoYW5naW5nUHVuY3R1YXRpb24AAQCtAWhhbmdpbmdMaXN0AAEArgFmb250VmFyaWFudE51bWVyaWNGaWd1cmUAuAIArwFmb250VmFyaWFudE51bWVyaWNTcGFjaW5nALwCALABZm9udFZhcmlhbnROdW1lcmljRnJhY3Rpb24AugIAsQFmb250VmFyaWFudFBvc2l0aW9uAL4CALIBdG9nZ2xlZE9uT1RGZWF0dXJlcwCeAwGzAXRvZ2dsZWRPZmZPVEZlYXR1cmVzAJ4DAbQBbWF4TGluZXMABQC1AXNlY3Rpb25TdGF0ZQCqAwC2AWVkaXRJbmZvAKYBALcBc3RhY2tDb3VudGVyU3BhY2luZwAJALgBc3RhY2tDb3VudGVyQWxpZ25Db250ZW50AK4DALkBc3RhY2tXcmFwAKwDALoBbWluU2l6ZQDQAwC7AW1heFNpemUA0AMAvAFjb21wb25lbnRQcm9wRGVmAEABvQFjb21wb25lbnRQcm9wUmVmAEIBvgFjb21wb25lbnRQcm9wQXNzaWdubWVudABKAb8Bc3ltYm9sTGlua3MAqAEBwAFkZXNjcmlwdGlvbgALAMEBZXhwb3J0TmFtZUJ5VmFyaWFudFByb3AAAQDCAXByb3BzQXJlQnViYmxlZAABAMMBc2hvd01hc2sAAQDEAWNvbXBvbmVudE92ZXJyaWRlSGllcmFyY2h5AAEAxQFkZXZlbG9wZXJSZWxhdGVkTGlua3MAqgEBxgFmb250VmFyaWF0aW9ucwCsAQHHAXBhdGhUZXh0SW5mbwCuAQDIAWRldGFjaE9wdGljYWxTaXplRnJvbUZvbnRTaXplAAEAyQFyYWRpYWxSZXBlYXREYXRhALIBAMoBb3ZlcnJpZGVMZXZlbAAFAMsBdmFyaWFibGVEYXRhAMIBAMwBdmFyaWFibGVDb25zdW1wdGlvbk1hcAC+AQDNAXZhcmlhYmxlTW9kZUJ5U2V0TWFwANABAM4BdmFyaWFibGVTZXRNb2RlcwC4AQHPAXZhcmlhYmxlU2V0SUQAtgEA0AF2YXJpYWJsZVJlc29sdmVkVHlwZQC0AwDRAXZhcmlhYmxlRGF0YVZhbHVlcwC6AQDSAXZhcmlhYmxlVG9rZW5OYW1lAAsA0wF2YXJpYWJsZVNjb3BlcwC4AwHUAWNvZGVTeW50YXgA4gEA1QFiYWNraW5nVmFyaWFibGVTZXRJZAC2AQDWAWJhY2tpbmdWYXJpYWJsZUlkANYBANcBcm9vdFZhcmlhYmxlS2V5AAsA2AF1c2VyRmFjaW5nVmVyc2lvbgALANkBa2V5AAsA2gFpc1NvZnREZWxldGVkAAEA2wFzb3J0UG9zaXRpb24ACwDcAXNvdXJjZUxpYnJhcnlLZXkACwDdAWRlbGl2ZXJJbmZvAOYBAN4BZGVmb3JtYXRpb25UcmFuc2Zvcm0A1AMA3wF0cmFuc2Zvcm1Nb2RpZmllcnMAtAEB4AFncm91cEluY2x1ZGVJbnZpc2libGUAAQDhAXZhcmlhYmxlU3ltYm9sSUQAzgMA4gFhbm5vdGF0aW9ucwDwAQHjAWFubm90YXRpb25DYXRlZ29yaWVzAO4BAOQBZ3JpZFJvd0FuY2hvcgDOAwDlAWdyaWRDb2x1bW5BbmNob3IAzgMA5gFncmlkUm93U3BhbgAHAOcBZ3JpZENvbHVtblNwYW4ABwDoAWdyaWRDaGlsZFZlcnRpY2FsQWxpZ24ArAIA6QFncmlkQ2hpbGRIb3Jpem9udGFsQWxpZ24ArAIA6gFncmlkUm93cwDOAwHrAWdyaWRDb2x1bW5zAM4DAewBZ3JpZFJvd3NTaXppbmcAFgHtAWdyaWRDb2x1bW5zU2l6aW5nABYB7gFhdXRvQ29ybmVyUmFkaXVzAAEA7wF0YXJnZXRBc3BlY3RSYXRpbwDQAwDwAWFsaWFzTmFtZQALAPEBc2ltcGxpZnlJbnN0YW5jZVBhbmVscwABAPIBcm90YXRpb25PcmlnaW4A0AMA8wF2aWRlb1BsYXliYWNrADQA9AF2YXJpYWJsZVdpZHRocwA2AfUBUHJvZE1vZGUAAjN0ZXh0U3R5bGUAYAABbmF2aWdhdGlvbkl0ZW1JbnRlcnZhbAAJAAJwcm9kQ29udGVudAALAANob3N0SW5kZXgAcgAEdGFibGVSb3dDb3VudAAFAAV0YWJsZUNvbENvdW50AAUABmRyb3BMaXN0T3B0aW9uU2VsZWN0SUQAzgMAB2Ryb3BMaXN0RXhwYW5kAAEACGFjdGl2ZVRleHRTdHlsZQBgAAl0YWJsZVNpemUA0AMACnRhYmxlQ2VsbEZpbGxQYWludAAAAAtuYXZpZ2F0aW9uSXRlbVNpemUA0AMADG5hdmlnYXRpb25PcHRpb25FeHBhbmQAAQANY29tcG9uZW50TGlicmFyeVN3aXRjaAABAA5zY29yZUJhcgBiAA9uYXZpZ2F0aW9uSXRlbVJhdGlvAAkAEGRyYWdCYXIAZAARdGFibGVDZWxsAF4AEnRhYmxlQm9yZGVyU3R5bGUABQATZW1iZWRkZWRJY29uUG9zaXRpb25GbGFnAAUAFHJlY29yZEhlaWdodAAJABVzZWxlY3RGb3JtAAUAFmxheW91dE1ldGhvZAAFABdsYXllclBvc2l0aW9uAAUAGHZpZXdwb3J0T3JpZW50YXRpb24AiAIAGXZOb2RlVHlwZQD2AQEac3RyaW5nSWNvblNWRwALABt0YWJsZUhlYWRlclZpc2libGUAAQAccmVjb3JkV2lkdGgACQAdcmVjb2RlQ291bnQABQAec2VsZWN0SW5kZXgABQAfbGF5b3V0UGFyYW0AVAAgYmxvY2tTdHlsZVR5cGUAigIAIWRpc3RhbmNlAAkAImhvdmVyVHJpZ2dlcgABACNmaXRDb250ZW50AAEAJHN0cmluZ0ljb25OYW1lAAsAJXR3b0RpbUNoYXJ0AGoAJmV4dHJhR3VpZHMAzgMBJ3RhYmxlU2VsZWN0Q29sVmlzaWJsZQABAChmcmFtZVNjcm9sbEJhclZpc2libGUA+gIAKWNoZWNrQm94U3RhdGUABQAqY29tcG9uZW50U3RhdGUA/AIAK2ljb25Td2l0Y2gAAQAsY2hlY2tCb3hTd2l0Y2gAAQAtZmxvZGluZ1N5bWJvbFN3aXRjaAABAC5jaGVja0JveEhpdGVkAAEAL2xheWVybG5kZW50AAkAMGZvbGRpbmdTeW1ib2xUeXBlAAUAMWJsb2NrTWFya2VySWRzAM4DATJibG9ja01hcmtlclBhcmFtcwBSADNCbG9ja01hcmtlclBhcmFtcwACBHJlbGF0ZWRNYXJrZXJJZADOAwABbWFya2VyU2lkZQD4AQACYm91bmROb2RlSWQAzgMAA21hcmtlckluZGV4AAUABFByb2RMYXlvdXRQYXJhbQACBWxheW91dE1vZGUA+gEAAXdpdGRoTW9kZQD8AQACaGVpZ2h0TW9kZQD8AQADbWFyZ2luAFYABHBhZGRpbmcAVgAFUHJvZExheW91dEludGVydmFsAAIEbGVmdAAJAAF0b3AACQACcmlnaHQACQADYm90dG9tAAkABFByb2RBZGp1c3RTaXplAAIGYWRqdXN0U2l6ZVR5cGUAggIAAWJhc2VEaXJlY3Rpb24AhAIAAndpZHRoAAkAA2hlaWdodAAJAAR3aWR0aFVuaXQAhgIABWhlaWdodFVuaXQAhgIABlByb2RNb3ZpbmcAAgNhZGp1c3RTaXplVHlwZQD+AQABeAAJAAJ5AAkAA1Byb2RSb3RhdGUAAgJyb3RhdGlvblR5cGUAgAIAAWFubGdlAAkAAlByb2RUYWJsZUNlbGwAAgVjZWxsU2l6ZVJvdwAFAAFjZWxsU2l6ZUNvbAAFAAJtZXJnZVRvR3VpZADOAwADY2VsbEhBbGlnbgAHAARjZWxsVkFsaWduAAcABVByb2RUZXh0U3R5bGUAAgNmb250TmFtZQAcAAFmaWxsUGFpbnQAAAACZm9udFNpemUACQADUHJvZFNjb3JlQmFyAAIDbnVtUGF0aAAFAAFzY29yZQAJAAJzY2FsaW5nRmFjdG9yAGYAA1Byb2REcmFnQmFyAAICcmFkaXVzAAkAAXNjYWxpbmdGYWN0b3IAZgACUHJvZFNjYWxpbmdGYWN0b3IAAgJ3U2NhbGluZ0ZhY3RvcgAJAAFoU2NhbGluZ0ZhY3RvcgAJAAJQcm9kVERDRWxlbWVudGluZm8AAgNmaXJzdFZhcgALAAFzZWNvbmRWYXIACwACdmFsdWUACQADUHJvZFR3b0RpbUNoYXJ0AAIOVERDRWxlbWVudEluZm8AaAEBYXhpc1N3aXRjaAABAAJncmlkU3dpdGNoAAEAA3RpdGxlU3dpdGNoAAEABGxlZ2VuZFN3aXRjaAABAAVkYXRhTGFibGVTd2l0Y2gAAQAGZGF0YVdpblN3aXRjaAABAAdsZWdlbmREaXIABQAIY29sTnVtAAUACXJvd051bQAFAApjaGFydE1vZGUABQALZHJhd0FyZWEACQEMbGVnZW5kU3ltUG9zAAkBDWF4aXNTY2FsZQAJAQ5HdWlkZQACBGF4aXMAqAIAAW9mZnNldAAJAAJndWlkAM4DAANkaXN0YW5jZQAJAARPdmVybGF5QmFja2dyb3VuZEFwcGVhcmFuY2UAAgJiYWNrZ3JvdW5kVHlwZQDkAgABYmFja2dyb3VuZENvbG9yANYDAAJOdW1iZXIAAgJ2YWx1ZQAJAAF1bml0cwDuAgACUGFyZW50SW5kZXgAAgJndWlkAM4DAAFwb3NpdGlvbgALAAJVc2VySW5mbwACEnNlc3Npb25JRAAHAAFjb25uZWN0ZWQAAQACbmFtZQALAANjb2xvcgDWAwAEaW1hZ2VVUkwACwAFdmlld3BvcnQAdgAGbW91c2UAeAAHc2VsZWN0aW9uAM4DAQhvYnNlcnZpbmcABwEJZGV2aWNlTmFtZQALAApyZWNlbnRDbGlja3MAegELc2Nyb2xsUG9zaXRpb25zAHwBDHVzZXJJRAALAA1sYXN0VHJpZ2dlcmVkSG90c3BvdADOAwAObGFzdFRyaWdnZXJlZFByb3RvdHlwZUludGVyYWN0aW9uSUQAzgMAD3RyaWdnZXJlZE92ZXJsYXlzRGF0YQB+ARBzcG90bGlnaHQAogEAEWxhc3RUcmlnZ2VyZWRGbG93U3RhcnRQb2ludElkAM4DABJWaWV3cG9ydAACBGNhbnZhc1NwYWNlQm91bmRzANgDAAFwaXhlbFByZXZpZXcAAQACcGl4ZWxEZW5zaXR5AAkAA2NhbnZhc0d1aWQAzgMABE1vdXNlAAIEY3Vyc29yAP4CAAFjYW52YXNTcGFjZUxvY2F0aW9uANADAAJjYW52YXNTcGFjZVNlbGVjdGlvbkJveADYAwADY2FudmFzR3VpZADOAwAEQ2xpY2sAAgJpZAAHAAFwb2ludADQAwACU2Nyb2xsUG9zaXRpb24AAgJub2RlAM4DAAFzY3JvbGxPZmZzZXQA0AMAAlRyaWdnZXJlZE92ZXJsYXlEYXRhAAIEb3ZlcmxheUd1aWQAzgMAAWhvdHNwb3RHdWlkAM4DAAJzd2FwR3VpZADOAwADcHJvdG90eXBlSW50ZXJhY3Rpb25HdWlkAM4DAARIeXBlcmxpbmsAAgJ1cmwACwABZ3VpZADOAwACU2hhcmVkU3R5bGVNYXN0ZXJEYXRhAAIDc3R5bGVLZXkACwABc29ydFBvc2l0aW9uAAsAAmZpbGVLZXkACwADU2hhcmVkU3R5bGVSZWZlcmVuY2UAAgJzdHlsZUtleQALAAF2ZXJzaW9uSGFzaAALAAJQaXhzb01zZwACFHR5cGUA8gEAAXNlc3Npb25JRAAFAAJwaXhzb05vZGVzAE4BA2Jsb2JzAEwBBGFja0lEAAUABXVzZXJJbmZvcwB0AQZhY2Nlc3MAgAMAB2ZpbGVWZXJzaW9uAAcACHN0eWxlU2V0TmFtZQALAAlzdHlsZVNldFR5cGUAggMACnN0eWxlU2V0Q29udGVudFR5cGUAhAMAC3Bhc3RlUGFnZUlkAM4DAAxzY2VuZUdyYXBoUXVlcmllcwCOAQENc2lnbmFsTmFtZQALAA5zaWduYWxQYXlsb2FkAAsAD2NyZWF0ZVZlcnNpb24ACwAQbGFzdE9wZW5WZXJzaW9uAAsAEWNtZE51bQDaAwASZmlsZU1ldGEApAEAE3Bhc3RlRmlsZUtleQALABRWZWN0b3JTdHlsZURhdGEAAgVzdHlsZUlEAAUAAWNvcm5lclJhZGl1cwAJAAJzdHJva2VDYXAAoAIAA3N0cm9rZUpvaW4AogIABGhhbmRsZU1pcnJvcmluZwCIAwAFVGV4dFN0eWxlRGF0YQACGXN0eWxlSUQABQABZm9udFNpemUACQACcGFyYWdyYXBoSW5kZW50AAkAA3BhcmFncmFwaFNwYWNpbmcACQAEbGV0dGVyU3BhY2luZwBwAAVsaW5lSGVpZ2h0AHAABnRleHRDYXNlAMYCAAd0ZXh0RGVjb3JhdGlvbgDKAgAIdGV4dEFsaWduSG9yaXpvbnRhbADAAgAJdGV4dEFsaWduVmVydGljYWwAwgIACnRleHRBdXRvUmVzaXplAMQCAAtmb250TmFtZQAcAAxoeXBlcmxpbmsAgAEADWZpbGxQYWludHMAAAEOaW5oZXJpdEZpbGxTdHlsZUlEAM4DAA9pbmhlcml0VGV4dFN0eWxlSUQAzgMAEGZvbnRWYXJpYW50TnVtZXJpY0ZpZ3VyZQC4AgARZm9udFZhcmlhbnROdW1lcmljU3BhY2luZwC8AgASZm9udFZhcmlhbnROdW1lcmljRnJhY3Rpb24AugIAE2ZvbnRWYXJpYW50UG9zaXRpb24AvgIAFHRvZ2dsZWRPbk9URmVhdHVyZXMAngMBFXRvZ2dsZWRPZmZPVEZlYXR1cmVzAJ4DARZmb250VmFyaWF0aW9ucwCsAQEXZGV0YWNoT3B0aWNhbFNpemVGcm9tRm9udFNpemUAAQAYdmFyaWFibGVDb25zdW1wdGlvbk1hcAC+AQAZUHJvcFZhbHVlRGF0YQACBHByb3BlcnR5AAsAAXZhbHVlcwALAQJhbGlhc1Byb3BlcnR5AAsAA2FsaWFzVmFsdWVzAAsBBFNjZW5lR3JhcGhRdWVyeQACAmRlcHRoAAUAAXN0YXJ0aW5nTm9kZQDOAwACUHJvdG90eXBlU3RhcnRQb2ludAACA2Rlc2NyaXB0aW9uAAsAAW5hbWUACwACcG9zaXRpb24ACwADQ29ubmVjdExpbmVJbmZvAAIEY29ubmxpbmVUeXBlAIwDAAFpc0ZyZWUAAQACY29ubmxpbmVTbmFwT2JqAM4DAQN0ZXh0QW5nbGVUeXBlAI4DAARPYmpTbmFwQ29ubmxpbmUAAgRndWlkAM4DAAFjb25uZWN0UG9pbnRUeXBlAJADAAJzbmFwVG9PYmpUeXBlAJIDAANyYXRlANADAARDb25ubGluZVRleHRJbmZvAAICdGV4dEd1aWQAzgMAAXJhdGUACQACVmVjdG9yUGFpbnQAAgJyZWdpb25JZAAFAAFwYWludHMAAAECVmVjdG9yU3R5bGUAAgJyZWdpb25JZAAFAAFpZADOAwACUGx1Z2luRGF0YQACA3BsdWdpbklEAAsAAXZhbHVlAAsAAmtleQALAANQbHVnaW5SZWxhdW5jaERhdGEAAgRwbHVnaW5JRAALAAFtZXNzYWdlAAsAAmNvbW1hbmQACwADaXNEZWxldGVkAAEABFBsYWNlSG9sZGVyAAIEZW1vamlDb2RlUG9pbnRzAAUBAWJvdW5kANgDAAJmaXJzdENoYXJhY3RlcgAFAANwb3NlALABAARTcG90bGlnaHQAAgJzZXNzaW9uSUQABwABdXNlcklEAAsAAkZpbGVNZXRhAAICZmlsZVNvdXJjZQCmAwABZm9udEluY29ycmVjdACoAwACRWRpdEluZm8AAgN1c2VySUQACwABbGFzdEVkaXRlZEF0AAcAAmNyZWF0ZUF0AAcAA1N5bWJvbExpbmsAAgN1cmkACwABZGlzcGxheU5hbWUACwACZGlzcGxheVRleHQACwADRGV2ZWxvcGVyUmVsYXRlZExpbmsAAgJsaW5rTmFtZQALAAFsaW5rVXJsAAsAAkZvbnRWYXJpYXRpb24AAgNheGlzVGFnAAcAAWF4aXNOYW1lAAsAAnZhbHVlAAkAA1BhdGhUZXh0SW5mbwACBWZsaXBHbHlwaHMAAQABcmV2ZXJzZQABAAJoT2Zmc2V0AAkAA3ZPZmZzZXQACQAEdFZhbHVlAAkABUdseXBoUG9zZQACA3gACQABeQAJAAJhbmdsZQAJAANSYWRpYWxSZXBlYXREYXRhAAICY29waWVzAAUAAXJhZGl1cwAJAAJUcmFuc2Zvcm1Nb2RpZmllcgACCHR5cGUAwAMAAW9mZnNldADQAwACdmlzaWJsZQABAANjb3VudAAHAARyZXBlYXRUeXBlAMIDAAVheGlzAKgCAAZ1bml0VHlwZQDEAwAHb3JkZXIAxgMACEFzc2V0SUQAAgJndWlkAM4DAAFhc3NldFJlZgDIAQACVmFyaWFibGVTZXRNb2RlAAIDaWQAzgMAAW5hbWUACwACc29ydFBvc2l0aW9uAAsAA1ZhcmlhYmxlRGF0YVZhbHVlcwACAWVudHJpZXMAvAEBAVZhcmlhYmxlRGF0YVZhbHVlc0VudHJ5AAICbW9kZUlEAM4DAAF2YXJpYWJsZURhdGEAwgEAAlZhcmlhYmxlRGF0YU1hcAACAWVudHJpZXMAwAEBAVZhcmlhYmxlRGF0YU1hcEVudHJ5AAIDbm9kZUZpZWxkAAcAAXZhcmlhYmxlRGF0YQDCAQACdmFyaWFibGVGaWVsZAC2AwADVmFyaWFibGVEYXRhAAIDdmFsdWUAxAEAAWRhdGFUeXBlALIDAAJyZXNvbHZlZERhdGFUeXBlALQDAANWYXJpYWJsZUFueVZhbHVlAAILYm9vbFZhbHVlAAEAAXRleHRWYWx1ZQALAAJmbG9hdFZhbHVlAAkAA2FsaWFzALYBAARjb2xvclZhbHVlANYDAAVleHByZXNzaW9uVmFsdWUAxgEABm1hcFZhbHVlAMwBAAdzeW1ib2xJZFZhbHVlALYBAAhmb250U3R5bGVWYWx1ZQDKAQAJdGV4dERhdGFWYWx1ZQAeAApub2RlRmllbGRBbGlhc1ZhbHVlAOABAAtFeHByZXNzaW9uAAICZXhwcmVzc2lvbkZ1bmN0aW9uALoDAAFleHByZXNzaW9uQXJndW1lbnRzAMIBAQJBc3NldFJlZgACAmtleQALAAF2ZXJzaW9uAAsAAlZhcmlhYmxlRm9udFN0eWxlAAICYXNTdHJpbmcAwgEAAWFzRmxvYXQAwgEAAlZhcmlhYmxlTWFwAAIBdmFsdWVzANQBAQFDb2xvclN0b3BWYXIAAgNjb2xvcgDWAwABY29sb3JWYXIAwgEAAnBvc2l0aW9uAAkAA1ZhcmlhYmxlTW9kZUJ5U2V0TWFwAAIBZW50cmllcwDSAQEBVmFyaWFibGVNb2RlQnlTZXRNYXBFbnRyeQACAnZhcmlhYmxlU2V0SUQAtgEAAXZhcmlhYmxlTW9kZUlEAM4DAAJWYXJpYWJsZU1hcFZhbHVlAAICa2V5AAsAAXZhbHVlAMIBAAJWYXJpYWJsZUlkT3JWYXJpYWJsZU92ZXJyaWRlSWQAAgJ2YXJpYWJsZUlkALYBAAF2YXJpYWJsZU92ZXJyaWRlSWQA2AEAAlZhcmlhYmxlT3ZlcnJpZGVJZAACAmd1aWQAzgMAAWFzc2V0UmVmAMgBAAJQcm90b3R5cGVWYXJpYWJsZVRhcmdldAACAmlkALYBAAFub2RlRmllbGRBbGlhcwDgAQACVHJpZ2dlcmVkU2V0VmFyaWFibGVBY3Rpb25EYXRhAAIEbm9kZUZvckZpbmRpbmdUb3Btb3N0U2NyZWVuSWQAzgMAAXRhcmdldFZhcmlhYmxlSWQACwACdGFyZ2V0VmFyaWFibGVEYXRhAAsAA3Jlc29sdmVkVmFyaWFibGVNb2RlcwALAARUcmlnZ2VyZWRTZXRWYXJpYWJsZU1vZGVBY3Rpb25EYXRhAAIEbm9kZUZvckZpbmRpbmdUb3Btb3N0U2NyZWVuSWQAzgMAAXRhcmdldFZhcmlhYmxlU2V0S2V5AAsAAnRhcmdldFZhcmlhYmxlTW9kZUlkAAsAA3RhcmdldFZhcmlhYmxlU2V0SWQAtgEABE5vZGVGaWVsZEFsaWFzAAIDc3RhYmxlUGF0aFRvTm9kZQAKAAFub2RlRmllbGQAvAMAAmluZGV4T3JLZXkACwADQ29kZVN5bnRheE1hcAACAWVudHJpZXMA5AEBAUNvZGVTeW50YXhNYXBFbnRyeQACAnBsYXRmb3JtAL4DAAF2YWx1ZQALAAJEZWxpdmVySW5mbwACAnB1Ymxpc2hlZFZlcnNpb24ACwABY3VycmVudFZlcnNpb24ACwACQW5ub3RhdGlvblByb3BlcnR5AAIBdHlwZQDIAwABQW5ub3RhdGlvbkNhdGVnb3J5Q3VzdG9tAAICY29sb3IA1gMAAWxhYmVsAAsAAkFubm90YXRpb25DYXRlZ29yeQACA2lkAM4DAAFwcmVzZXQAygMAAmN1c3RvbQDqAQADQW5ub3RhdGlvbkNhdGVnb3JpZXMAAgFpdGVtcwDsAQEBQW5ub3RhdGlvbgACA2xhYmVsAAsAAXByb3BlcnRpZXMA6AEBAmNhdGVnb3J5SWQAzgMAA1BpeHNvTXNnVHlwZQAAFEpPSU5fU1RBUlQAAAABTk9ERV9DSEFOR0VTAAAAAlVTRVJfQ0hBTkdFUwAAAANKT0lOX0VORAAAAARTSUdOQUwAAAAFU1RZTEUAAAAGU1RZTEVfU0VUAAAAB0pPSU5fU1RBUlRfU0tJUF9SRUxPQUQAAAAITk9USUZZX1NIT1VMRF9VUEdSQURFAAAACVVQR1JBREVfRE9ORQAAAApVUEdSQURFX1JFRlJFU0gAAAALU0NFTkVfR1JBUEhfUVVFUlkAAAAMU0NFTkVfR1JBUEhfUkVQTFkAAAANRklDX0RPQ1VNRU5UAAAADlVQREFURV9WRVJTSU9OAAAAD1BJWF9ET0NVTUVOVAAAABBTUE9UTElHSFRfT1BFTgAAABFTUE9UTElHSFRfQ0xPU0UAAAASQ09NUE9ORU5UX1FVRVJZAAAAE0NPTVBPTkVOVF9SRVBMWQAAABROb2RlUGhhc2UAAANNT0RJRlkAAAAAQ1JFQVRFRAAAAAFSRU1PVkVEAAAAAk5vZGVUeXBlAACeAU5PTkUAAAABRE9DVU1FTlQAAAACQ0FOVkFTAAAAA0dST1VQAAAABEZSQU1FAAAABUJPT0xFQU5fT1BFUkFUSU9OAAAABlZFQ1RPUgAAAAdTVEFSAAAACExJTkUAAAAJRUxMSVBTRQAAAApSRUNUQU5HTEUAAAALUkVHVUxBUl9QT0xZR09OAAAADFJPVU5ERURfUkVDVEFOR0xFAAAADVRFWFQAAAAOU0xJQ0UAAAAPU1lNQk9MAAAAEElOU1RBTkNFAAAAEUNPTk5FQ1RMSU5FAAAAEkRJUkVDVE9SWQAAABNQUk9EX1JFQ1RBTkdMRQAAABRQUk9EX0VMTElQU0UAAAAVUFJPRF9TVEFUAAAAFlBST0RfUE9MWUdPTgAAABdQUk9EX0RST1BET1dOQk9YAAAAGFBST0RfRU1CRURERURTVkdJQ09OAAAAGVBST0RfU0lERU1FTlUAAAAaUFJPRF9MSVNUTUVOVQAAABtQUk9EX0ZJUlNUTkFWSUdBVElPTkJBUgAAABxQUk9EX1NFQ09ORE5BVklHQVRJT05CQVIAAAAdUFJPRF9MRUZUTkFWSUdBVElPTkJBUgAAAB5QUk9EX0RPV05OQVZJR0FUSU9OQkFSAAAAH1BST0RfVEFCTEUAAAAgUFJPRF9UQUJMRUNFTEwAAAAhUFJPRF9OQVZJR0FUSU9OQkFSSVRFTQAAACJQUk9EX0xJU1RPUFRJT04AAAAjUFJPRF9MSU5FAAAAJFBST0RfVEVYVAAAACVQUk9EX05BVklHQVRJT05CQVJPUFRJT04AAAAmUFJPRF9NRU5VT1BUSU9OAAAAJ1BST0RfUkFESU9JQ09OTk9ERQAAAChQUk9EX1BMQUNFSE9MREVSAAAAKVBST0RfSU1BR0VQTEFDRUhPTERFUgAAACpQUk9EX1BSSU1BUllCVVRUT04AAAArUFJPRF9CVVRUT04AAAAsUFJPRF9DSEVDS0JPWAAAAC1QUk9EX1JBRElPAAAALlBST0RfU1dJVENIAAAAL1BST0RfVEVYVEFMRVJUAAAAMFBST0RfU0VBUkNIQk9YAAAAMVBST0RfSU5QVVRCT1gAAAAyUFJPRF9QQVNTV09SRElOUFVUQk9YAAAAM1BST0RfSUNPTkxJU1QAAAA0UFJPRF9TV0lUQ0hMSVNUAAAANVBST0RfVE9BU1QAAAA2UFJPRF9BTEVSVAAAADdQUk9EX0lOUFVUQUxFUlQAAAA4UFJPRF9CT1RUT05BTEVSVAAAADlQUk9EX0NBUkQAAAA6UFJPRF9MQVJHRUNBUkQAAAA7UFJPRF9NQVNLAAAAPFBST0RfU1RBVEVTQkFSAAAAPVBST0RfVElUTEVTQkFSAAAAPlBST0RfSU1BR0UAAAA/UFJPRF9USVRMRVNCQVIyAAAAQFBST0RfVEhSRUVCVVRUT05TQUxFUlQAAABBUFJPRF9USUNLQUxFUlQAAABCUFJPRF9JTlBVVFJBTkdFU0VBUkNIAAAAQ1BST0RfSU5QVVREUk9QAAAARFBST0RfSU5QVVREQVRBAAAARVBST0RfSU5QVVRNVUxST1cAAABGUFJPRF9JTlBVVFZFUklGSUNBVElPTgAAAEdQUk9EX01FTlVPUFRJT05FQ09NUE9ORU5UAAAASFBST0RfU0lERU5BVklHQVRCQVIAAABJUFJPRF9EQVRBU0VMRUNUT1IAAABKUFJPRF9QQUdFUkNPTVBPTkVOVAAAAEtQUk9EX1NURVBQRVIAAABMUFJPRF9NQVBDT01QT05FTlQAAABNUFJPRF9ISVNUT0dSQU0AAABOUFJPRF9QSUVDSEFSVAAAAE9QUk9EX0xJTkVDSEFSVAAAAFBQUk9EX0lDT05CVVRUT04AAABRUFJPRF9NT1JFQlVUVE9OAAAAUlBST0RfU0NPUkVCQVIAAABTUFJPRF9QUk9DRVNTQkFSAAAAVFBST0RfRFJBR0JBUgAAAFVQUk9EX1NWR0ZSQU1FAAAAVlBST0RfTEFSR0VDQVJEMwAAAFdQUk9EX0xBUkdFQ0FSRDQAAABYUFJPRF9UT0FTVExPQURJTkcAAABZUFJPRF9TSURFTkFWSUdBVEJBUjIAAABaUFJPRF9QQUdFUkNPTVBPTkVOVDIAAABbUFJPRF9JVEVNVEFCTEUAAABcUFJPRF9MQUJFTAAAAF1QUk9EX1RPQVNUU1VDQ0VTU1BDAAAAXlBST0RfVE9BU1RERUZFQVRFUlBDAAAAX1BST0RfVE9BU1RXQVJOUEMAAABgUFJPRF9UT0FTVE5PVElDRVBDAAAAYVBST0RfVE9BU1RMT0FESU5HUEMAAABiUFJPRF9UT0FTVFNJTkdMRUJVVFRPTlBDAAAAY1BST0RfVE9BU1RET1VCTEVCVVRUT05QQwAAAGRQUk9EX1RPQVNUVElQU1BDAAAAZVBST0RfUExVU05BVklHQVRCQVIAAABmUFJPRF9TVEVQUEVSMgAAAGdTRUNUSU9OAAAAaFBST0RfQlJFQURDUlVNQgAAAGlQUk9EX0JSRUFEQ1JVTUJJVEVNAAAAalBST0RfSUJVVFRPTgAAAGtQUk9EX0lQTEFDRUhPTERFUgAAAGxQUk9EX0lNQVNLAAAAbVBST0RfSVNUQVRVU0JBUgAAAG5QUk9EX0lJTlBVVEJPWAAAAG9QUk9EX0lSQURJT0FORENIRUNLQlVUVE9OAAAAcFBST0RfSVJBRElPQlVUVE9OAAAAcVBST0RfSVNURVBQRVIAAAByUFJPRF9WSUVXUE9SVFRFWFQAAABzUFJPRF9SRUNUQk9YAAAAdFBST0RfU0VMRUNUQk9YAAAAdVBST0RfU0VMRUNUT1BUSU9OAAAAdlBST0RfU01BUlRUQUJMRQAAAHdQUk9EX1NNQVJUVEFCTEVDRUxMAAAAeFBST0RfQkxPQ0sAAAB5UFJPRF9CTE9DS0RPQ1VNRU5UAAAAelBST0RfVE9QQkFSUEMAAAB7UFJPRF9UT1BCQVJJVEVNUEMAAAB8UFJPRF9UT1BCQVJPUFRJT05QQwAAAH1QUk9EX1RPUEJBUk1EAAAAflBST0RfRFJPUERPV05CT1hTSU1QTEUAAAB/UFJPRF9TRUxFQ1RCT1hTVFlMRTEAAACAAVBST0RfTElTVE9QVElPTk1FTlUAAACBAVBST0RfU0lERUJBUlBDAAAAggFQUk9EX1NJREVCQVJJVEVNUEMAAACDAVBST0RfU0lERUJBUk9QVElPTlBDAAAAhAFQUk9EX0lQQUdFUkNPTVBPTkVOVAAAAIUBUFJPRF9TSURFTkJNRAAAAIYBUFJPRF9TSURFTkJJVEVNTUQAAACHAVBST0RfRE9XTk5CTUQAAACIAVBST0RfRE9XTk5CSVRFTU1EAAAAiQFQUk9EX0xBQkVMTUQAAACKAVBST0RfTEFCRUxQQwAAAIsBUFJPRF9MQUJFTElURU0AAACMAVBST0RfRFlOQU1JQ1BBTkVMAAAAjQFQUk9EX0RZTkFNSUNQQU5FTFNUQVRFAAAAjgFQUk9EX0hPVFpPTkUAAACPAVBST0RfVEFHAAAAkAFQUk9EX1RBR0lURU0AAACRAVBST0RfQVZBVEFSAAAAkgFQUk9EX0hPVFpPTkVfRklYAAAAkwFQUk9EX0xFRlRQQU5FTFNWR0lDT04AAACUAVBST0RfQlVCQkxFUEFORUwAAACVAVBST0RfVFdPRElNQ0hBUlQAAACWAVBBVEhfVEVYVAAAAJcBUkFESUFMX1BBVFRFUk4AAACYAVZBUklBQkxFAAAAmQFWQVJJQUJMRV9TRVQAAACaAVRSQU5TRk9STQAAAJsBUFJPRF9UUkVFAAAAnAFQUk9EX1RSRUVPUFRJT04AAACdAVBST0RfQkxPQ0tNQVJLRVIAAACeAU1hcmtlclNpZGUAAAJCTE9DS1NJREUAAAAAVEFSR0VUU0lERQAAAAFQcm9kTGF5b3V0TW9kZQAAAk5PTkUAAAABTElORUFSAAAAAlByb2RMYXlvdXRTaXplTW9kZQAAA0ZJWEVETlVNAAAAAVdSQVBDT05URU5UAAAAAk1BVENIUEFSRU5UAAAAA1Byb2RDaGFuZ2VMb2NhdGlvblR5cGUAAAJNT1ZFAAAAAU1PVkVUTwAAAAJQcm9kUm90YXRpb25UeXBlAAACUk9UQVRFAAAAAVJPVEFURVRPAAAAAlByb2RBZGp1c3RTaXplVHlwZQAAAkFESlVTVAAAAAFBREpVU1RUTwAAAAJQcm9kQWRqdXN0QmFzZVR5cGUAAAlMRUZUVE9QAAAAAVRPUAAAAAJSSUdIVFRPUAAAAANMRUZUAAAABENFTlRFUgAAAAVSSUdIVAAAAAZMRUZUQk9UVE9NAAAAB0JPVFRPTQAAAAhSSUdIVEJPVFRPTQAAAAlQcm9kQWRqdXN0VW5pdFR5cGUAAAJQRVJDRU5UQUdFAAAAAVBJWEVMAAAAAlByb2RWaWV3cG9ydE9yaWVudGF0aW9uAAACSG9yaXpvbnRhbAAAAAFWZXJ0aWNhbAAAAAJQcm9kQmxvY2tTdHlsZVR5cGUAAARERUZBVUxUAAAAAEgxAAAAAUgyAAAAAkgzAAAAA0Jvb2xlYW5PcGVyYXRpb24AAARVTklPTgAAAAFJTlRFUlNFQ1QAAAACU1VCVFJBQ1QAAAADWE9SAAAABEJsZW5kTW9kZQAAE1BBU1NfVEhST1VHSAAAAAFOT1JNQUwAAAACREFSS0VOAAAAA01VTFRJUExZAAAABExJTkVBUl9CVVJOAAAABUNPTE9SX0JVUk4AAAAGTElHSFRFTgAAAAdTQ1JFRU4AAAAITElORUFSX0RPREdFAAAACUNPTE9SX0RPREdFAAAACk9WRVJMQVkAAAALU09GVF9MSUdIVAAAAAxIQVJEX0xJR0hUAAAADURJRkZFUkVOQ0UAAAAORVhDTFVTSU9OAAAAD0hVRQAAABBTQVRVUkFUSU9OAAAAEUNPTE9SAAAAEkxVTUlOT1NJVFkAAAATTm9pc2VUeXBlAAADTVVMVElUT05FAAAAAE1PTk9UT05FAAAAAURVT1RPTkUAAAACRWZmZWN0VHlwZQAACUlOTkVSX1NIQURPVwAAAAFEUk9QX1NIQURPVwAAAAJGT1JFR1JPVU5EX0JMVVIAAAADQkFDS0dST1VORF9CTFVSAAAABE1PVElPTl9CTFVSAAAABUdMQVNTAAAABkdSQUlOAAAAB05PSVNFAAAACFpPT01fQkxVUgAAAAlTdGFja0NvdW50ZXJBbGlnbgAABE1JTgAAAAFDRU5URVIAAAACTUFYAAAAA1NUUkVUQ0gAAAAEU3RhY2tBbGlnbkl0ZW1Nb2RlAAAETUlOAAAAAUNFTlRFUgAAAAJNQVgAAAADU1BBQ0VfRVZFTkxZAAAABFN0YWNrU2l6ZQAAAkZJWEVEAAAAAVJFU0laRV9UT19GSVQAAAACU3RhY2tKdXN0aWZ5AAAETUlOAAAAAUNFTlRFUgAAAAJNQVgAAAADU1BBQ0VfRVZFTkxZAAAABFN0YWNrTW9kZQAABE5PTkUAAAABSE9SSVpPTlRBTAAAAAJWRVJUSUNBTAAAAANHUklEAAAABFN0cm9rZUFsaWduAAADQ0VOVEVSAAAAAUlOU0lERQAAAAJPVVRTSURFAAAAA1N0cm9rZUNhcAAACk5PTkUAAAABUk9VTkQAAAACU1FVQVJFAAAAA0FSUk9XX0xJTkVTAAAABEFSUk9XX0VRVUlMQVRFUkFMAAAABVRSSUFOR0xFX0ZJTExFRAAAAAZESUFNT05EX0ZJTExFRAAAAAdIT0xMT1dfUk9VTkQAAAAIU09MSURfUk9VTkQAAAAJVkVSVElDQUxfTElORQAAAApTdHJva2VKb2luAAADTUlURVIAAAABQkVWRUwAAAACUk9VTkQAAAADU3R5bGVUeXBlAAAHTk9ORQAAAAFGSUxMAAAAAlNUUk9LRQAAAANURVhUAAAABEVGRkVDVAAAAAVFWFBPUlQAAAAGR1JJRAAAAAdMYXlvdXRHcmlkVHlwZQAABE1JTgAAAAFDRU5URVIAAAACU1RSRVRDSAAAAANNQVgAAAAEQXhpcwAAAlgAAAABWQAAAAJMYXlvdXRHcmlkUGF0dGVybgAAAlNUUklQRVMAAAABR1JJRAAAAAJHcmlkQ2hpbGRBbGlnbgAAA01JTgAAAAFDRU5URVIAAAACTUFYAAAAA0dyaWRUcmFja1NpemluZ1R5cGUAAAJGTEVYAAAAAUZJWEVEAAAAAkltYWdlVHlwZQAACFBORwAAAAFKUEVHAAAAAlNWRwAAAANQREYAAAAEU0tFVENIAAAABUVQUwAAAAZUSUZGAAAAB1dFQlAAAAAIRXhwb3J0Q29uc3RyYWludFR5cGUAAANDT05URU5UX1NDQUxFAAAAAUNPTlRFTlRfV0lEVEgAAAACQ09OVEVOVF9IRUlHSFQAAAADRXhwb3J0U1ZHSURNb2RlAAACSUZfTkVFREVEAAAAAUFMV0FZUwAAAAJGb250VmFyaWFudENhcHMAAAdOT1JNQUwAAAABU01BTEwAAAACQUxMX1NNQUxMAAAAA1BFVElURQAAAARBTExfUEVUSVRFAAAABVVOSUNBU0UAAAAGVElUTElORwAAAAdGb250VmFyaWFudE51bWVyaWNGaWd1cmUAAANOT1JNQUwAAAABTElOSU5HAAAAAk9MRFNUWUxFAAAAA0ZvbnRWYXJpYW50TnVtZXJpY0ZyYWN0aW9uAAADTk9STUFMAAAAAURJQUdPTkFMAAAAAlNUQUNLRUQAAAADRm9udFZhcmlhbnROdW1lcmljU3BhY2luZwAAA05PUk1BTAAAAAFQUk9QT1JUSU9OQUwAAAACVEFCVUxBUgAAAANGb250VmFyaWFudFBvc2l0aW9uAAADTk9STUFMAAAAAVNVQgAAAAJTVVBFUgAAAANUZXh0QWxpZ25Ib3Jpem9udGFsAAAETEVGVAAAAAFDRU5URVIAAAACUklHSFQAAAADSlVTVElGSUVEAAAABFRleHRBbGlnblZlcnRpY2FsAAADVE9QAAAAAUNFTlRFUgAAAAJCT1RUT00AAAADVGV4dEF1dG9SZXNpemUAAANOT05FAAAAAVdJRFRIX0FORF9IRUlHSFQAAAACSEVJR0hUAAAAA1RleHRDYXNlAAAGT1JJR0lOQUwAAAABVVBQRVIAAAACTE9XRVIAAAADVElUTEUAAAAEU01BTExfQ0FQUwAAAAVTTUFMTF9DQVBTX0ZPUkNFRAAAAAZGb250U3R5bGUAAAJOT1JNQUwAAAABSVRBTElDAAAAAlRleHREZWNvcmF0aW9uAAADTk9ORQAAAAFVTkRFUkxJTkUAAAACU1RSSUtFVEhST1VHSAAAAANDb25zdHJhaW50VHlwZQAAB01JTgAAAAFDRU5URVIAAAACTUFYAAAAA1NUUkVUQ0gAAAAEU0NBTEUAAAAFRklYRURfTUlOAAAABkZJWEVEX01BWAAAAAdUcmlnZ2VyRGV2aWNlAAAFS0VZQk9BUkQAAAABVU5LTk9XTl9DT05UUk9MTEVSAAAAAlhCT1hfT05FAAAAA1BTNAAAAARTV0lUQ0hfUFJPAAAABUludGVyYWN0aW9uVHlwZQAAEU9OX0NMSUNLAAAAAUFGVEVSX1RJTUVPVVQAAAACTU9VU0VfSU4AAAADTU9VU0VfT1VUAAAABE9OX0hPVkVSAAAABU1PVVNFX0RPV04AAAAGTU9VU0VfVVAAAAAHT05fUFJFU1MAAAAITk9ORQAAAAlEUkFHAAAACk9OX0tFWV9ET1dOAAAAC09OX1ZPSUNFAAAADE9OX0RPVUJMRUNMSUNLAAAADVNJREVfTEVGVAAAAA5TSURFX1JJR0hUAAAAD1NJREVfVVAAAAAQU0lERV9ET1dOAAAAEUNvbm5lY3Rpb25UeXBlAAATTk9ORQAAAAFJTlRFUk5BTF9OT0RFAAAAAlVSTAAAAANCQUNLAAAABENMT1NFAAAABVNDUk9MTFRPAAAABlNFVFNIT1dISURFAAAAB0NIQU5HRVNJWkUAAAAIQ0hBTkdFTE9DQVRJT04AAAAJQ0hBTkdFRFlOQU1JQ1BBTkVMU1RBVEUAAAAKUk9UQVRJT04AAAALV0FJVAAAAAxVUERBVEVfTUVESUFfUlVOVElNRQAAAA1DT05ESVRJT05BTAAAAA5TRVRfVkFSSUFCTEUAAAAPU0VUX1ZBUklBQkxFX01PREUAAAAQU0VUX0VOQUJMRV9TVEFURQAAABFTRVRfU0VMRUNURURfU1RBVEUAAAASU0VUX1NXSVRDSF9TVEFURQAAABNQcm90b3R5cGVTdGF0ZUFjdGlvbgAAA1RSVUVfU1RBVEUAAAABRkFMU0VfU1RBVEUAAAACVE9HR0xFAAAAA1Byb3RvdHlwZVNlbGVjdGVkU3RhdGVUeXBlAAADU0VMRUNUX0dVSUQAAAABU1dJVENIX1NUQVRVUwAAAAJDSEVDS0JPWF9TVEFURQAAAANFYXNpbmdUeXBlAAAPTElORUFSAAAAAUlOX0NVQklDAAAAAk9VVF9DVUJJQwAAAANJTk9VVF9DVUJJQwAAAARJTkJBQ0tfQ1VCSUMAAAAFT1VUQkFDS19DVUJJQwAAAAZJTk9VVEJBQ0tfQ1VCSUMAAAAHQ1VTVE9NX0NVQklDAAAACE5PTkUAAAAJU1BSSU5HAAAACkdFTlRMRV9TUFJJTkcAAAALQ1VTVE9NX1NQUklORwAAAAxTUFJJTkdfUFJFU0VUX09ORQAAAA1TUFJJTkdfUFJFU0VUX1RXTwAAAA5TUFJJTkdfUFJFU0VUX1RIUkVFAAAAD1Byb3RvdHlwZURldmljZVR5cGUAAAROT05FAAAAAVBSRVNFVAAAAAJDVVNUT00AAAADUFJFU0VOVEFUSU9OAAAABFByb3RvdHlwZVNob3dIaWRlAAADU0hPVwAAAAFISURFAAAAAlNXSVRDSAAAAANEZXZpY2VSb3RhdGlvbgAAAk5PTkUAAAABQ0NXXzkwAAAAAlRyYW5zaXRpb25UeXBlAAAaSU5TVEFOVF9UUkFOU0lUSU9OAAAAAURJU1NPTFZFAAAAAlNNQVJUX0FOSU1BVEUAAAADU0xJREVfRlJPTV9MRUZUAAAABFNMSURFX0ZST01fUklHSFQAAAAFU0xJREVfRlJPTV9UT1AAAAAGU0xJREVfRlJPTV9CT1RUT00AAAAHUFVTSF9GUk9NX0xFRlQAAAAIUFVTSF9GUk9NX1JJR0hUAAAACVBVU0hfRlJPTV9UT1AAAAAKUFVTSF9GUk9NX0JPVFRPTQAAAAtNT1ZFX0ZST01fTEVGVAAAAAxNT1ZFX0ZST01fUklHSFQAAAANTU9WRV9GUk9NX1RPUAAAAA5NT1ZFX0ZST01fQk9UVE9NAAAAD1NMSURFX09VVF9UT19MRUZUAAAAEFNMSURFX09VVF9UT19SSUdIVAAAABFTTElERV9PVVRfVE9fVE9QAAAAElNMSURFX09VVF9UT19CT1RUT00AAAATTU9WRV9PVVRfVE9fTEVGVAAAABRNT1ZFX09VVF9UT19SSUdIVAAAABVNT1ZFX09VVF9UT19UT1AAAAAWTU9WRV9PVVRfVE9fQk9UVE9NAAAAF01BR0lDX01PVkUAAAAYU0NST0xMX0FOSU1BVEUAAAAZTEFZRVJfRElTU09MVkUAAAAaT3ZlcmxheUJhY2tncm91bmRJbnRlcmFjdGlvbgAAAk5PTkUAAAABQ0xPU0VfT05fQ0xJQ0tfT1VUU0lERQAAAAJPdmVybGF5QmFja2dyb3VuZFR5cGUAAAJOT05FAAAAAVNPTElEX0NPTE9SAAAAAk92ZXJsYXlQb3NpdGlvblR5cGUAAAhDRU5URVIAAAABVE9QX0xFRlQAAAACVE9QX0NFTlRFUgAAAANUT1BfUklHSFQAAAAEQk9UVE9NX0xFRlQAAAAFQk9UVE9NX0NFTlRFUgAAAAZCT1RUT01fUklHSFQAAAAHTUFOVUFMAAAACFNjcm9sbERpcmVjdGlvbgAABE5PTkUAAAABSE9SSVpPTlRBTAAAAAJWRVJUSUNBTAAAAANCT1RIAAAABE5hdmlnYXRpb25UeXBlAAAGTkFWSUdBVEUAAAABT1ZFUkxBWQAAAAJTV0FQAAAAA1NXQVBfU1RBVEUAAAAEU0NST0xMX1RPAAAABVNIT1dfSElERQAAAAZNZWRpYUFjdGlvbgAACVBMQVkAAAABUEFVU0UAAAACVE9HR0xFX1BMQVlfUEFVU0UAAAADTVVURQAAAARVTk1VVEUAAAAFVE9HR0xFX01VVEVfVU5NVVRFAAAABlNLSVBfRk9SV0FSRAAAAAdTS0lQX0JBQ0tXQVJEAAAACFNLSVBfVE8AAAAJTnVtYmVyVW5pdHMAAANSQVcAAAABUElYRUxTAAAAAlBFUkNFTlQAAAADU2Nyb2xsQmVoYXZpb3IAAAJTQ1JPTExTAAAAAUZJWEVEX1dIRU5fQ0hJTERfT0ZfU0NST0xMSU5HX0ZSQU1FAAAAAlBhdHRlcm5BbGlnbm1lbnQAAANTVEFSVAAAAABDRU5URVIAAAABRU5EAAAAAlBhdHRlcm5UaWxlVHlwZQAAA1JFQ1RBTkdVTEFSAAAAAEhPUklaT05UQUxfSEVYQUdPTkFMAAAAAVZFUlRJQ0FMX0hFWEFHT05BTAAAAAJQYWludFR5cGUAAApTT0xJRAAAAAFHUkFESUVOVF9MSU5FQVIAAAACR1JBRElFTlRfUkFESUFMAAAAA0dSQURJRU5UX0FOR1VMQVIAAAAER1JBRElFTlRfRElBTU9ORAAAAAVJTUFHRQAAAAZFTU9KSQAAAAdHSUYAAAAIVklERU8AAAAJUEFUVEVSTgAAAApJbWFnZVNjYWxlTW9kZQAABFNUUkVUQ0gAAAABRklUAAAAAkZJTEwAAAADVElMRQAAAARTY3JvbGxCYXIAAANBVVRPU0hPVwAAAAFTSE9XAAAAAkhJREUAAAADQ29tcG9uZW50U3RhdGVUeXBlAAAEREVGQVVMVF9TVEFURQAAAABIT1ZFUl9TVEFURQAAAAFBQ1RJVkVfU1RBVEUAAAACRElTQUJMRURfU1RBVEUAAAADTW91c2VDdXJzb3IAAAdERUZBVUxUAAAAAUNST1NTSEFJUgAAAAJFWUVEUk9QUEVSAAAAA0hBTkQAAAAEUEFJTlRfQlVDS0VUAAAABVBFTgAAAAZQRU5DSUwAAAAHQWNjZXNzAAACUkVBRF9PTkxZAAAAAVJFQURfV1JJVEUAAAACU3R5bGVTZXRUeXBlAAAFUEVSU09OQUwAAAABVEVBTQAAAAJDVVNUT00AAAADRlJFUVVFTkNZAAAABFRFTVBPUkFSWQAAAAVTdHlsZVNldENvbnRlbnRUeXBlAAADU09MSUQAAAABR1JBRElFTlQAAAACSU1BR0UAAAADV2luZGluZ1J1bGUAAAROT05aRVJPAAAAAU9ERAAAAAJJTlZFUlNFX05PTlpFUk8AAAADSU5WRVJTRV9PREQAAAAEVmVjdG9yTWlycm9yAAAETk9ORQAAAAFBTkdMRQAAAAJBTkdMRV9BTkRfTEVOR1RIAAAAA1JJR0hUX0FOR0xFAAAABE92ZXJmbG93VHlwZQAABE5PTkUAAAABSE9SSVpPTlRBTAAAAAJWRVJUSUNBTAAAAANIT1JJWk9OVEFMX0FORF9WRVJUSUNBTAAAAARDb25uZWN0TGluZVR5cGUAAARTdHJhaWdodExpbmUAAAABQ3VydmUAAAACUmlnaHRBbmdsZQAAAANGaWxsZXRQbG90TGluZQAAAARDb25uTGluZVRleHRBbmdsZVR5cGUAAAJIb3Jpem9udGFsAAAAAVRhbmdlbnRBbmdsZQAAAAJDb25uZWN0UG9pbnRUeXBlAAADTm9uZQAAAAFCZWdpblB0AAAAAkVuZFB0AAAAA1NuYXBUb09ialR5cGUAAAZOb25lAAAAAUNlbnRlclB0AAAAAk91dGxpbmUAAAADVmVydGV4AAAABEluc2lkZQAAAAVXaG9sZVNoYXBlAAAABkV4cG9ydEltYWdlUXVhbGl0eU9wAAAERXhwb3J0UXVhbGl0eV9PcmlnaW4AAAABRXhwb3J0UXVhbGl0eV9IaWdoAAAAAkV4cG9ydFF1YWxpdHlfTWlkAAAAA0V4cG9ydFF1YWxpdHlfTG93AAAABFRleHRMaXN0U3R5bGUAAANQTEFJTgAAAABPUkRFUkVEX0xJU1QAAAABVU5PUkRFUkVEX0xJU1QAAAACVGV4dFRydW5jYXRpb24AAAJESVNBQkxFRAAAAABFTkRJTkcAAAABTWFza1R5cGUAAANBTFBIQQAAAABPVVRMSU5FAAAAAUxVTUlOQU5DRQAAAAJMZWFkaW5nVHJpbQAAAk5PTkUAAAAAQ0FQX0hFSUdIVAAAAAFPcGVuVHlwZUZlYXR1cmUAAOUBUENBUAAAAABDMlBDAAAAAUNBU0UAAAACQ1BTUAAAAANUSVRMAAAABFVOSUMAAAAFWkVSTwAAAAZTSU5GAAAAB09SRE4AAAAIQUZSQwAAAAlETk9NAAAACk5VTVIAAAALTElHQQAAAAxDTElHAAAADURMSUcAAAAOSExJRwAAAA9STElHAAAAEEFBTFQAAAARQ0FMVAAAABJSQ0xUAAAAE1NBTFQAAAAUUlZSTgAAABVWRVJUAAAAFlNXU0gAAAAXQ1NXSAAAABhOQUxUAAAAGUNDTVAAAAAaU1RDSAAAABtISVNUAAAAHFNJWkUAAAAdT1JOTQAAAB5JVEFMAAAAH1JBTkQAAAAgRFRMUwAAACFGTEFDAAAAIk1HUksAAAAjU1NUWQAAACRLRVJOAAAAJUZXSUQAAAAmSFdJRAAAACdIQUxUAAAAKFRXSUQAAAApUVdJRAAAACpQV0lEAAAAK0pVU1QAAAAsTEZCRAAAAC1PUEJEAAAALlJUQkQAAAAvUEFMVAAAADBQS05BAAAAMUxUUkEAAAAyTFRSTQAAADNSVExBAAAANFJUTE0AAAA1QUJSVgAAADZBQlZNAAAAN0FCVlMAAAA4VkFMVAAAADlWSEFMAAAAOkJMV0YAAAA7QkxXTQAAADxCTFdTAAAAPUFLSE4AAAA+Q0pDVAAAAD9DRkFSAAAAQENQQ1QAAABBQ1VSUwAAAEJESVNUAAAAQ0VYUFQAAABERkFMVAAAAEVGSU5BAAAARkZJTjIAAABHRklOMwAAAEhIQUxGAAAASUhBTE4AAABKSEtOQQAAAEtITkdMAAAATEhPSk8AAABNSU5JVAAAAE5JU09MAAAAT0pQNzgAAABQSlA4MwAAAFFKUDkwAAAAUkpQMDQAAABTTEpNTwAAAFRMT0NMAAAAVU1BUksAAABWTUVESQAAAFdNRUQyAAAAWE1LTUsAAABZTkxDSwAAAFpOVUtUAAAAW1BSRUYAAABcUFJFUwAAAF1WUEFMAAAAXlBTVEYAAABfUFNUUwAAAGBSS1JGAAAAYVJQSEYAAABiUlVCWQAAAGNTTVBMAAAAZFRKTU8AAABlVE5BTQAAAGZUUkFEAAAAZ1ZBVFUAAABoVkpNTwAAAGlWS05BAAAAalZLUk4AAABrVlJUUgAAAGxWUlQyAAAAbVNTMDEAAABuU1MwMgAAAG9TUzAzAAAAcFNTMDQAAABxU1MwNQAAAHJTUzA2AAAAc1NTMDcAAAB0U1MwOAAAAHVTUzA5AAAAdlNTMTAAAAB3U1MxMQAAAHhTUzEyAAAAeVNTMTMAAAB6U1MxNAAAAHtTUzE1AAAAfFNTMTYAAAB9U1MxNwAAAH5TUzE4AAAAf1NTMTkAAACAAVNTMjAAAACBAUNWMDEAAACCAUNWMDIAAACDAUNWMDMAAACEAUNWMDQAAACFAUNWMDUAAACGAUNWMDYAAACHAUNWMDcAAACIAUNWMDgAAACJAUNWMDkAAACKAUNWMTAAAACLAUNWMTEAAACMAUNWMTIAAACNAUNWMTMAAACOAUNWMTQAAACPAUNWMTUAAACQAUNWMTYAAACRAUNWMTcAAACSAUNWMTgAAACTAUNWMTkAAACUAUNWMjAAAACVAUNWMjEAAACWAUNWMjIAAACXAUNWMjMAAACYAUNWMjQAAACZAUNWMjUAAACaAUNWMjYAAACbAUNWMjcAAACcAUNWMjgAAACdAUNWMjkAAACeAUNWMzAAAACfAUNWMzEAAACgAUNWMzIAAAChAUNWMzMAAACiAUNWMzQAAACjAUNWMzUAAACkAUNWMzYAAAClAUNWMzcAAACmAUNWMzgAAACnAUNWMzkAAACoAUNWNDAAAACpAUNWNDEAAACqAUNWNDIAAACrAUNWNDMAAACsAUNWNDQAAACtAUNWNDUAAACuAUNWNDYAAACvAUNWNDcAAACwAUNWNDgAAACxAUNWNDkAAACyAUNWNTAAAACzAUNWNTEAAAC0AUNWNTIAAAC1AUNWNTMAAAC2AUNWNTQAAAC3AUNWNTUAAAC4AUNWNTYAAAC5AUNWNTcAAAC6AUNWNTgAAAC7AUNWNTkAAAC8AUNWNjAAAAC9AUNWNjEAAAC+AUNWNjIAAAC/AUNWNjMAAADAAUNWNjQAAADBAUNWNjUAAADCAUNWNjYAAADDAUNWNjcAAADEAUNWNjgAAADFAUNWNjkAAADGAUNWNzAAAADHAUNWNzEAAADIAUNWNzIAAADJAUNWNzMAAADKAUNWNzQAAADLAUNWNzUAAADMAUNWNzYAAADNAUNWNzcAAADOAUNWNzgAAADPAUNWNzkAAADQAUNWODAAAADRAUNWODEAAADSAUNWODIAAADTAUNWODMAAADUAUNWODQAAADVAUNWODUAAADWAUNWODYAAADXAUNWODcAAADYAUNWODgAAADZAUNWODkAAADaAUNWOTAAAADbAUNWOTEAAADcAUNWOTIAAADdAUNWOTMAAADeAUNWOTQAAADfAUNWOTUAAADgAUNWOTYAAADhAUNWOTcAAADiAUNWOTgAAADjAUNWOTkAAADkAUluc3RhbmNlU3dhcFByZWZlcnJlZFZhbHVlVHlwZQAAAkNPTVBPTkVOVAAAAABTVEFURV9HUk9VUAAAAAFDb21wb25lbnRQcm9wVHlwZQAABEJPT0wAAAAAVEVYVAAAAAFDT0xPUgAAAAJJTlNUQU5DRV9TV0FQAAAAA0NvbXBvbmVudFByb3BOb2RlRmllbGQAAARWSVNJQkxFAAAAAFRFWFRfREFUQQAAAAFPVkVSUklEREVOX1NZTUJPTF9JRAAAAAJJTkhFUklUX0ZJTExfU1RZTEVfSUQAAAADRmlsZVNvdXJjZQAABlBpeERvYwAAAABGaWdtYQAAAAFTa2V0Y2gAAAACQXh1cmUAAAADWEQAAAAETUcAAAAFRm9udEluY29ycmVjdAAAAk5vbmUAAAAASW1wb3J0RG9jAAAAAVdvcmtTdGF0ZQAAA09SSUdJTgAAAABERVNJR04AAAABREVWAAAAAldyYXBNb2RlAAACTk9fV1JBUAAAAABXUkFQAAAAAVN0YWNrQWxpZ24AAAJBVVRPAAAAAFNQQUNFX0JFVFdFRU4AAAABRGlyZWN0aW9uYWxpdHkAAANBVVRPAAAAAExUUgAAAAFSVEwAAAACVmFyaWFibGVEYXRhVHlwZQAADEJPT0xFQU4AAAAARkxPQVQAAAABU1RSSU5HAAAAAkFMSUFTAAAAA0NPTE9SAAAABEVYUFJFU1NJT04AAAAFTUFQAAAABlNZTUJPTF9JRAAAAAdGT05UX1NUWUxFAAAACFRFWFRfREFUQQAAAAlJTlZBTElEAAAACk5PREVfRklFTERfQUxJQVMAAAALVmFyaWFibGVSZXNvbHZlZERhdGFUeXBlAAAIQk9PTEVBTgAAAABGTE9BVAAAAAFTVFJJTkcAAAACQ09MT1IAAAAETUFQAAAABVNZTUJPTF9JRAAAAAZGT05UX1NUWUxFAAAAB1RFWFRfREFUQQAAAAhWYXJpYWJsZUZpZWxkAAAjTUlTU0lORwAAAABDT1JORVJfUkFESVVTAAAAAVBBUkFHUkFQSF9TUEFDSU5HAAAAAlBBUkFHUkFQSF9JTkRFTlQAAAADU1RST0tFX1dFSUdIVAAAAARTVEFDS19TUEFDSU5HAAAABVNUQUNLX1BBRERJTkdfTEVGVAAAAAZTVEFDS19QQURESU5HX1RPUAAAAAdTVEFDS19QQURESU5HX1JJR0hUAAAACFNUQUNLX1BBRERJTkdfQk9UVE9NAAAACVZJU0lCTEUAAAAKVEVYVF9EQVRBAAAAC1dJRFRIAAAADEhFSUdIVAAAAA1SRUNUQU5HTEVfVE9QX0xFRlRfQ09STkVSX1JBRElVUwAAAA5SRUNUQU5HTEVfVE9QX1JJR0hUX0NPUk5FUl9SQURJVVMAAAAPUkVDVEFOR0xFX0JPVFRPTV9MRUZUX0NPUk5FUl9SQURJVVMAAAAQUkVDVEFOR0xFX0JPVFRPTV9SSUdIVF9DT1JORVJfUkFESVVTAAAAEUJPUkRFUl9UT1BfV0VJR0hUAAAAEkJPUkRFUl9CT1RUT01fV0VJR0hUAAAAE0JPUkRFUl9MRUZUX1dFSUdIVAAAABRCT1JERVJfUklHSFRfV0VJR0hUAAAAFVZBUklBTlRfUFJPUEVSVElFUwAAABZTVEFDS19DT1VOVEVSX1NQQUNJTkcAAAAXTUlOX1dJRFRIAAAAGE1BWF9XSURUSAAAABlNSU5fSEVJR0hUAAAAGk1BWF9IRUlHSFQAAAAbRk9OVF9GQU1JTFkAAAAcRk9OVF9TVFlMRQAAAB1GT05UX1ZBUklBVElPTlMAAAAeT1BBQ0lUWQAAAB9GT05UX1NJWkUAAAAgTEVUVEVSX1NQQUNJTkcAAAAiTElORV9IRUlHSFQAAAAkVmFyaWFibGVTY29wZQAAFkFMTF9TQ09QRVMAAAAAVEVYVF9DT05URU5UAAAAAUNPUk5FUl9SQURJVVMAAAACV0lEVEhfSEVJR0hUAAAAA0dBUAAAAARBTExfRklMTFMAAAAFRlJBTUVfRklMTAAAAAZTSEFQRV9GSUxMAAAAB1RFWFRfRklMTAAAAAhTVFJPS0UAAAAJU1RST0tFX0ZMT0FUAAAACkVGRkVDVF9GTE9BVAAAAAtFRkZFQ1RfQ09MT1IAAAAMT1BBQ0lUWQAAAA1GT05UX1NUWUxFAAAADkZPTlRfRkFNSUxZAAAAD0ZPTlRfU0laRQAAABBMSU5FX0hFSUdIVAAAABFMRVRURVJfU1BBQ0lORwAAABJQQVJBR1JBUEhfU1BBQ0lORwAAABNQQVJBR1JBUEhfSU5ERU5UAAAAFEZPTlRfVkFSSUFUSU9OUwAAABVFeHByZXNzaW9uRnVuY3Rpb24AABNBRERJVElPTgAAAABTVUJUUkFDVElPTgAAAAFSRVNPTFZFX1ZBUklBTlQAAAACTVVMVElQTFkAAAADRElWSURFAAAABEVRVUFMUwAAAAVOT1RfRVFVQUwAAAAGTEVTU19USEFOAAAAB0xFU1NfVEhBTl9PUl9FUVVBTAAAAAhHUkVBVEVSX1RIQU4AAAAJR1JFQVRFUl9USEFOX09SX0VRVUFMAAAACkFORAAAAAtPUgAAAAxOT1QAAAANU1RSSU5HSUZZAAAADlRFUk5BUlkAAAAPVkFSX01PREVfTE9PS1VQAAAAEE5FR0FURQAAABFJU19UUlVUSFkAAAASTm9kZUZpZWxkQWxpYXNUeXBlAAACTUlTU0lORwAAAABDT01QT05FTlRfUFJPUF9BU1NJR05NRU5UUwAAAAFDb2RlU3ludGF4UGxhdGZvcm0AAANXRUIAAAAAQU5EUk9JRAAAAAFpT1MAAAACVHJhbnNmb3JtTW9kaWZpZXJUeXBlAAADUkVQRUFUAAAAAFNZTU1FVFJZAAAAAVNLRVcAAAACUmVwZWF0VHlwZQAAAlJBRElBTAAAAABMSU5FQVIAAAABVW5pdFR5cGUAAAJQSVhFTFMAAAAAUkVMQVRJVkUAAAABUmVwZWF0T3JkZXIAAAJGT1JXQVJEAAAAAFJFVkVSU0UAAAABQW5ub3RhdGlvblByb3BlcnR5VHlwZQAAIUZJTEwAAAAAU1RST0tFAAAAAVdJRFRIAAAAAkhFSUdIVAAAAANNSU5fV0lEVEgAAAAETUlOX0hFSUdIVAAAAAVNQVhfV0lEVEgAAAAGTUFYX0hFSUdIVAAAAAdTVFJPS0VfV0lEVEgAAAAIQ09STkVSX1JBRElVUwAAAAlFRkZFQ1QAAAAKVEVYVF9TVFlMRQAAAAtURVhUX0FMSUdOX0hPUklaT05UQUwAAAAMRk9OVF9GQU1JTFkAAAANRk9OVF9TSVpFAAAADkZPTlRfV0VJR0hUAAAAD0xJTkVfSEVJR0hUAAAAEExFVFRFUl9TUEFDSU5HAAAAEVNUQUNLX1NQQUNJTkcAAAASU1RBQ0tfUEFERElORwAAABNTVEFDS19NT0RFAAAAFFNUQUNLX0FMSUdOTUVOVAAAABVPUEFDSVRZAAAAFkNPTVBPTkVOVAAAABdGT05UX1NUWUxFAAAAGEdSSURfUk9XX0dBUAAAABlHUklEX0NPTFVNTl9HQVAAAAAaR1JJRF9ST1dfQ09VTlQAAAAbR1JJRF9DT0xVTU5fQ09VTlQAAAAcR1JJRF9ST1dfQU5DSE9SX0lOREVYAAAAHUdSSURfQ09MVU1OX0FOQ0hPUl9JTkRFWAAAAB5HUklEX1JPV19TUEFOAAAAH0dSSURfQ09MVU1OX1NQQU4AAAAgQW5ub3RhdGlvbkNhdGVnb3J5UHJlc2V0AAAGTk9ORQAAAABBQ0NFU1NJQklMSVRZAAAAAUJFSEFWSU9SAAAAAkNPTlRFTlQAAAADREVWRUxPUE1FTlQAAAAESU5URVJBQ1RJT04AAAAFQmx1ck9wVHlwZQAAAk5PUk1BTAAAAABQUk9HUkVTU0lWRQAAAAFHVUlEAAECc2Vzc2lvbklEAAcAAWxvY2FsSUQABwACVmVjdG9yAAECeAAJAAF5AAkAAk1hdHJpeAABBm0wMAAJAAFtMDEACQACbTAyAAkAA20xMAAJAARtMTEACQAFbTEyAAkABk1hdHJpeDNmAAEJbTAwAAkAAW0wMQAJAAJtMDIACQADbTEwAAkABG0xMQAJAAVtMTIACQAGbTIwAAkAB20yMQAJAAhtMjIACQAJQ29sb3IAAQRyAAkAAWcACQACYgAJAANhAAkABFJlY3QAAQR4AAkAAXkACQACdwAJAANoAAkABENvbW1hbmROdW0AAQJyb3VuZAAHAAFjb3VudAAHAAI=", "base64");
  const compiled = kiwi.compileSchema(kiwi.decodeBinarySchema(schemaBin));
  return compiled.decodePixsoMsg(decompressed);
}
function extractImageUrls(result2) {
  const nodes = result2.pixsoNodes || [];
  const images2 = [];
  for (const node of nodes) {
    for (const paint of node.fillPaints || []) {
      if (paint.type !== "IMAGE") continue;
      const hash = paint.image && paint.image.hash;
      if (!hash) continue;
      const hex = Buffer.from(hash).toString("hex");
      const url = `/api/pix/image-url/${hex}`;
      images2.push({
        url,
        nodeId: `${node.guid.sessionID}:${node.guid.localID}`,
        nodeName: node.name || "",
        nodeType: node.type || "",
        width: paint.originalImageWidth,
        height: paint.originalImageHeight,
        scaleMode: paint.imageScaleMode || ""
      });
    }
  }
  return images2;
}
var args = process.argv.slice(2);
if (!args[0]) {
  console.log("Usage: node extract_images.js <input.pix>");
  process.exit(1);
}
var result = parseFile(args[0]);
var images = extractImageUrls(result);
console.log(JSON.stringify(images, null, 2));
console.error(`\u5171\u63D0\u53D6 ${images.length} \u5F20\u56FE\u7247`);
