/*
 * Minimal Lua table-literal reader for WARFRAME Wiki data modules (Module:Stances/data, Module:Weapons/data/melee).
 * Reads `{ key = value, ["key"] = value, value, ... }` with strings, numbers, booleans and nil. Not a Lua interpreter:
 * code outside the table literal is ignored.
 */
'use strict';
function tokenize(src) {
  const out = []; let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (src.startsWith('--[[', i) || src.startsWith('--[=[', i)) { const close = src.indexOf(src[i + 3] === '=' ? ']=]' : ']]', i); i = close < 0 ? src.length : close + (src[i + 3] === '=' ? 3 : 2); continue; }
    if (src.startsWith('--', i)) { const nl = src.indexOf('\n', i); i = nl < 0 ? src.length : nl + 1; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1, s = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\') { const n = src[j + 1]; s += n === 'n' ? '\n' : n === 't' ? '\t' : n; j += 2; } else s += src[j++];
      }
      out.push({ t: 'str', v: s }); i = j + 1; continue;
    }
    if (src.startsWith('[[', i)) { const close = src.indexOf(']]', i); out.push({ t: 'str', v: src.slice(i + 2, close) }); i = close + 2; continue; }
    if ('{}[]=,;'.includes(c)) { out.push({ t: c }); i++; continue; }
    const num = src.slice(i).match(/^-?(?:0x[0-9a-f]+|\d+\.?\d*(?:e[+-]?\d+)?|\.\d+)/i);
    if (num) { out.push({ t: 'num', v: Number(num[0]) }); i += num[0].length; continue; }
    const id = src.slice(i).match(/^[A-Za-z_][A-Za-z0-9_.]*/);
    if (id) { out.push({ t: 'id', v: id[0] }); i += id[0].length; continue; }
    throw new Error(`lua-table: unexpected "${c}" at ${i}`);
  }
  return out;
}
function parseTable(tokens, pos) {
  // tokens[pos] is '{'
  let p = pos + 1; const obj = {}; const arr = []; let isArr = true;
  const value = () => {
    const tk = tokens[p];
    if (tk.t === '{') { const r = parseTable(tokens, p); p = r.end; return r.value; }
    p++;
    if (tk.t === 'str' || tk.t === 'num') return tk.v;
    if (tk.t === 'id') return tk.v === 'true' ? true : tk.v === 'false' ? false : tk.v === 'nil' ? null : { ref: tk.v };
    throw new Error('lua-table: bad value ' + JSON.stringify(tk));
  };
  while (tokens[p].t !== '}') {
    let key = null;
    if (tokens[p].t === '[') { p++; key = value(); p++; /* ] */ p++; /* = */ }
    else if (tokens[p].t === 'id' && tokens[p + 1] && tokens[p + 1].t === '=') { key = tokens[p].v; p += 2; }
    const v = value();
    if (key === null) arr.push(v); else { obj[key] = v; isArr = false; }
    if (tokens[p].t === ',' || tokens[p].t === ';') p++;
  }
  return { value: isArr ? arr : (arr.length ? Object.assign(obj, { _list: arr }) : obj), end: p + 1 };
}
// Reads the table literal that follows `marker` (e.g. "local StanceData =") in a module's source.
function readTableAfter(src, marker) {
  const at = src.indexOf(marker);
  if (at < 0) throw new Error('lua-table: marker not found: ' + marker);
  const start = src.indexOf('{', at);
  // find the matching brace while skipping strings and comments
  const tokens = tokenize(src.slice(start, matchBrace(src, start) + 1));
  return parseTable(tokens, 0).value;
}
function matchBrace(src, start) {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (src.startsWith('--', i)) { const nl = src.indexOf('\n', i); i = nl < 0 ? src.length : nl; continue; }
    if (c === '"' || c === "'") { let j = i + 1; while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1; i = j; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (!depth) return i; }
  }
  throw new Error('lua-table: unbalanced braces');
}
module.exports = { tokenize, parseTable, readTableAfter };
