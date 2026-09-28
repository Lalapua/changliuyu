/* ============================================================
 * 长留玉 · 零依赖二维码编码器
 * ------------------------------------------------------------
 * 为什么要自己写：项目是「零依赖、离线可用」的静态站，而二维码又要画进
 * 分享图里。走 CDN 会多一个可能挂掉的外部依赖；调在线生成接口则会把
 * 跨域图片画到 canvas 上 —— 画布一旦被污染，toBlob 就抛 SecurityError，
 * 图根本存不下来（这个坑之前踩过一次）。所以自己算点阵、自己画方块。
 *
 * 实现范围（够用即止，不追求全规格）：
 *   · 字节模式（UTF-8），支持版本 1~9 —— 版本 9 在最低纠错档能装 232 字节，
 *     装一个网址绰绰有余；限制到 9 还能让「长度指示符」固定 8 位，
 *     省掉版本 10 以后要切成 16 位的分支。
 *   · 纠错档 L / M / Q / H 全支持，默认 M（扫码容错和尺寸的平衡点）。
 *   · 自动选版本：从 1 往上找第一个装得下的。
 *
 * 对照标准：ISO/IEC 18004。表格数据（分块表、对齐图形位置表）都是标准表。
 *
 * 用法：
 *   var qr = CLJ_QR.encode('https://example.com/');   // 默认 M 档
 *   qr.size      // 边长（模块数）
 *   qr.modules   // modules[row][col] === true 表示黑块
 * ============================================================ */
(function () {
  'use strict';

  /* ============================================================
   * 一、伽罗华域 GF(256) 运算
   * ------------------------------------------------------------
   * Reed-Solomon 纠错要求的多项式运算。本原多项式取 0x11D（x^8+x^4+x^3+x^2+1），
   * 这是 QR 标准规定的。
   * ============================================================ */
  var EXP = new Array(512);
  var LOG = new Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x = x << 1;
      if (x >= 256) x = (x ^ 0x11D) & 0xFF;
    }
    /* EXP 补到 512 长度，乘法时就能直接用 LOG[a]+LOG[b] 当下标，不必取模 */
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();

  function gmul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  /** 生成多项式 g(x) = Π(x - α^i)，i 从 0 到 ecLen-1。系数按最高次在前排列 */
  function rsGenPoly(ecLen) {
    var g = [1];
    for (var i = 0; i < ecLen; i++) {
      var next = new Array(g.length + 1);
      for (var k = 0; k < next.length; k++) next[k] = 0;
      for (var j = 0; j < g.length; j++) {
        next[j] ^= g[j];                      // 乘 x
        next[j + 1] ^= gmul(g[j], EXP[i]);    // 乘 α^i
      }
      g = next;
    }
    return g;
  }

  /** 多项式综合除法取余，得到 ecLen 个纠错码字 */
  function rsEncode(data, ecLen) {
    var gen = rsGenPoly(ecLen);
    var res = new Array(data.length + ecLen);
    for (var i = 0; i < res.length; i++) res[i] = i < data.length ? data[i] : 0;
    for (var k = 0; k < data.length; k++) {
      var coef = res[k];
      if (coef === 0) continue;               // 系数为 0 时整项都是 0，跳过省算力
      for (var j = 0; j < gen.length; j++) res[k + j] ^= gmul(gen[j], coef);
    }
    return res.slice(data.length);
  }

  /* ============================================================
   * 二、标准表
   * ============================================================ */

  /* 每个版本的总码字数，用来校验分块表有没有写错 */
  var TOTAL_CW = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292];

  /* 分块表：RS_BLOCKS[版本][档位] = [ [块数, 每块总码字, 每块数据码字], 第二组可选 ]
   * 档位顺序对应 ECC_LEVELS 的下标 0=L 1=M 2=Q 3=H */
  var RS_BLOCKS = {
    1: [[[1, 26, 19]], [[1, 26, 16]], [[1, 26, 13]], [[1, 26, 9]]],
    2: [[[1, 44, 34]], [[1, 44, 28]], [[1, 44, 22]], [[1, 44, 16]]],
    3: [[[1, 70, 55]], [[1, 70, 44]], [[2, 35, 17]], [[2, 35, 13]]],
    4: [[[1, 100, 80]], [[2, 50, 32]], [[2, 50, 24]], [[4, 25, 9]]],
    5: [[[1, 134, 108]], [[2, 67, 43]], [[2, 33, 15], [2, 34, 16]], [[2, 33, 11], [2, 34, 12]]],
    6: [[[2, 86, 68]], [[4, 43, 27]], [[4, 43, 19]], [[4, 43, 15]]],
    7: [[[2, 98, 78]], [[4, 49, 31]], [[2, 32, 14], [4, 33, 15]], [[4, 39, 13], [1, 40, 14]]],
    8: [[[2, 121, 97]], [[2, 60, 38], [2, 61, 39]], [[4, 40, 18], [2, 41, 19]], [[4, 40, 14], [2, 41, 15]]],
    9: [[[2, 146, 116]], [[3, 58, 36], [2, 59, 37]], [[4, 36, 16], [4, 37, 17]], [[4, 36, 12], [4, 37, 13]]]
  };

  /* 对齐图形中心坐标（相邻两两组合成图案，标准表） */
  var ALIGN_POS = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
    6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46]
  };

  var ECC_LEVELS = ['L', 'M', 'Q', 'H'];
  /* 格式信息里用的 2 位编码：L=01 M=00 Q=11 H=10 */
  var ECC_BITS = { L: 1, M: 0, Q: 3, H: 2 };

  var MAX_VERSION = 9;

  /* ============================================================
   * 三、编码：文本 → 数据码字
   * ============================================================ */

  /** UTF-8 编码（不依赖 TextEncoder，老 WebView 也能用） */
  function utf8Bytes(text) {
    var out = [];
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      /* 代理对：把高低位合成一个码点再编码 */
      if (c >= 0xD800 && c <= 0xDBFF && i + 1 < text.length) {
        var c2 = text.charCodeAt(i + 1);
        if (c2 >= 0xDC00 && c2 <= 0xDFFF) {
          c = 0x10000 + ((c - 0xD800) << 10) + (c2 - 0xDC00);
          i++;
        }
      }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) { out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F)); }
      else if (c < 0x10000) { out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F)); }
      else { out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 0x3F), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F)); }
    }
    return out;
  }

  /** 某版本 + 档位下，数据区总共能放多少个码字 */
  function dataCodewords(version, levelIdx) {
    var groups = RS_BLOCKS[version][levelIdx];
    var n = 0;
    for (var i = 0; i < groups.length; i++) n += groups[i][0] * groups[i][2];
    return n;
  }

  /** 所有分块加起来的总码字，应当等于标准表里的 TOTAL_CW（表写错时立刻能发现） */
  function totalCodewords(version, levelIdx) {
    var groups = RS_BLOCKS[version][levelIdx];
    var n = 0;
    for (var i = 0; i < groups.length; i++) n += groups[i][0] * groups[i][1];
    return n;
  }

  /**
   * 把文本编成最终的数据码字序列（已按标准做块间交织）。
   * 位流结构：模式指示符(4) + 长度(8) + 数据 + 结束符(≤4) + 补位 + 填充字节
   */
  function buildCodewords(bytes, version, levelIdx) {
    var capacity = dataCodewords(version, levelIdx);          // 单位：码字
    var bits = [];

    function push(value, len) {
      for (var i = len - 1; i >= 0; i--) bits.push((value >> i) & 1);
    }

    push(0x4, 4);                                            // 0100 = 字节模式
    push(bytes.length, 8);                                   // 版本 1~9 固定 8 位
    for (var i = 0; i < bytes.length; i++) push(bytes[i], 8);

    var maxBits = capacity * 8;
    /* 结束符最多 4 个 0；剩余不足 4 位就有多少填多少 */
    var term = Math.min(4, maxBits - bits.length);
    for (var t = 0; t < term; t++) bits.push(0);
    /* 补齐到字节边界 */
    while (bits.length % 8 !== 0) bits.push(0);
    /* 剩余字节用 0xEC / 0x11 交替填充（标准规定的两个固定填充字节） */
    var data = [];
    for (var b = 0; b < bits.length; b += 8) {
      var byteVal = 0;
      for (var k = 0; k < 8; k++) byteVal = (byteVal << 1) | bits[b + k];
      data.push(byteVal);
    }
    var pads = [0xEC, 0x11];
    var p = 0;
    while (data.length < capacity) { data.push(pads[p % 2]); p++; }

    /* --- 分块 + 纠错 + 交织 --- */
    var groups = RS_BLOCKS[version][levelIdx];
    var blocks = [];
    var cursor = 0;
    for (var g = 0; g < groups.length; g++) {
      var count = groups[g][0], total = groups[g][1], dlen = groups[g][2];
      for (var n = 0; n < count; n++) {
        var d = data.slice(cursor, cursor + dlen);
        cursor += dlen;
        blocks.push({ data: d, ec: rsEncode(d, total - dlen) });
      }
    }

    /* 数据码字交织：按列取，短块先结束 */
    var out = [];
    var maxData = 0;
    blocks.forEach(function (bl) { maxData = Math.max(maxData, bl.data.length); });
    for (var i2 = 0; i2 < maxData; i2++) {
      blocks.forEach(function (bl) { if (i2 < bl.data.length) out.push(bl.data[i2]); });
    }
    /* 纠错码字交织：所有块等长，直接按列取 */
    var ecLen = blocks[0].ec.length;
    for (var i3 = 0; i3 < ecLen; i3++) {
      blocks.forEach(function (bl) { out.push(bl.ec[i3]); });
    }
    return out;
  }

  /* ============================================================
   * 四、矩阵构造
   * ============================================================ */

  function newGrid(size, fill) {
    var g = new Array(size);
    for (var i = 0; i < size; i++) {
      g[i] = new Array(size);
      for (var j = 0; j < size; j++) g[i][j] = fill;
    }
    return g;
  }

  /** 把固定图形（定位、校正、时序）画进矩阵，同时用 reserved 标出「数据不能碰」的格子 */
  function placeFixed(version) {
    var size = version * 4 + 17;
    var m = newGrid(size, false);
    var reserved = newGrid(size, false);

    function set(r, c, dark) {
      if (r < 0 || c < 0 || r >= size || c >= size) return;
      m[r][c] = dark;
      reserved[r][c] = true;
    }

    /* 三个定位图形（7×7）及其分隔带 */
    function finder(top, left) {
      for (var r = -1; r <= 7; r++) {
        for (var c = -1; c <= 7; c++) {
          var rr = top + r, cc = left + c;
          if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
          var inRing = (r === 0 || r === 6 || c === 0 || c === 6);
          var inCore = (r >= 2 && r <= 4 && c >= 2 && c <= 4);
          var inside = (r >= 0 && r <= 6 && c >= 0 && c <= 6);
          set(rr, cc, inside && (inRing || inCore));
        }
      }
    }
    finder(0, 0);
    finder(0, size - 7);
    finder(size - 7, 0);

    /* 时序图形：第 6 行 / 第 6 列，从坐标 8 开始黑白交替 */
    for (var i = 8; i < size - 8; i++) {
      var dark = (i % 2 === 0);
      set(6, i, dark);
      set(i, 6, dark);
    }

    /* 校正图形（5×5）：坐标两两组合，跳过会和定位图形重叠的三个角 */
    var pos = ALIGN_POS[version];
    for (var a = 0; a < pos.length; a++) {
      for (var b = 0; b < pos.length; b++) {
        var cr = pos[a], cc = pos[b];
        var nearFinder =
          (cr <= 8 && cc <= 8) ||                     // 左上
          (cr <= 8 && cc >= size - 9) ||              // 右上
          (cr >= size - 9 && cc <= 8);                // 左下
        if (nearFinder) continue;
        for (var dr = -2; dr <= 2; dr++) {
          for (var dc = -2; dc <= 2; dc++) {
            var ring = (Math.abs(dr) === 2 || Math.abs(dc) === 2);
            var core = (dr === 0 && dc === 0);
            set(cr + dr, cc + dc, ring || core);
          }
        }
      }
    }

    /* 固定黑点 */
    set(size - 8, 8, true);

    /* 预留格式信息区（先占位，稍后写真正的位） */
    for (var k = 0; k < 9; k++) { reserved[8][k] = true; reserved[k][8] = true; }
    for (var k2 = 0; k2 < 8; k2++) { reserved[8][size - 1 - k2] = true; reserved[size - 1 - k2][8] = true; }
    reserved[8][8] = true;

    /* 版本 7 以上还有一块版本信息区 */
    if (version >= 7) {
      for (var v = 0; v < 18; v++) {
        reserved[Math.floor(v / 3)][v % 3 + size - 8 - 3] = true;
        reserved[v % 3 + size - 8 - 3][Math.floor(v / 3)] = true;
      }
    }

    return { size: size, modules: m, reserved: reserved };
  }

  /* BCH 校验（格式信息用 15 位生成多项式 0x537，版本信息用 18 位 0x1F25） */
  function bchDigit(v) { var n = 0; while (v !== 0) { n++; v >>>= 1; } return n; }

  function bchTypeInfo(data) {
    var G15 = 0x537, G15_MASK = 0x5412;
    var d = data << 10;
    while (bchDigit(d) - bchDigit(G15) >= 0) d ^= (G15 << (bchDigit(d) - bchDigit(G15)));
    return ((data << 10) | d) ^ G15_MASK;
  }

  function bchTypeNumber(data) {
    var G18 = 0x1F25;
    var d = data << 12;
    while (bchDigit(d) - bchDigit(G18) >= 0) d ^= (G18 << (bchDigit(d) - bchDigit(G18)));
    return (data << 12) | d;
  }

  function maskFn(pattern, r, c) {
    switch (pattern) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return (r * c) % 2 + (r * c) % 3 === 0;
      case 6: return ((r * c) % 2 + (r * c) % 3) % 2 === 0;
      case 7: return ((r * c) % 3 + (r + c) % 2) % 2 === 0;
    }
    return false;
  }

  /** 把数据码字按标准蛇形顺序填进非保留格子，并按当前掩码取反 */
  function placeData(g, codewords, maskPattern) {
    var size = g.size, m = g.modules, reserved = g.reserved;
    var inc = -1;
    var row = size - 1;
    var bitIndex = 7;
    var byteIndex = 0;

    for (var col = size - 1; col > 0; col -= 2) {
      if (col === 6) col -= 1;                 // 跳过竖向时序图形那一列
      for (;;) {
        for (var c = 0; c < 2; c++) {
          var cc = col - c;
          if (reserved[row][cc]) continue;
          var dark = false;
          if (byteIndex < codewords.length) {
            dark = ((codewords[byteIndex] >>> bitIndex) & 1) === 1;
          }
          if (maskFn(maskPattern, row, cc)) dark = !dark;
          m[row][cc] = dark;
          bitIndex--;
          if (bitIndex === -1) { byteIndex++; bitIndex = 7; }
        }
        row += inc;
        if (row < 0 || row >= size) { row -= inc; inc = -inc; break; }
      }
    }
  }

  /** 把格式信息写进矩阵（左上角及右上/左下两个备份位置） */
  function placeFormat(g, levelIdx, maskPattern) {
    var size = g.size, m = g.modules;
    var data = (ECC_BITS[ECC_LEVELS[levelIdx]] << 3) | maskPattern;
    var bits = bchTypeInfo(data);

    for (var i = 0; i < 15; i++) {
      var bit = ((bits >> i) & 1) === 1;
      /* 竖向那一列 */
      if (i < 6) m[i][8] = bit;
      else if (i < 8) m[i + 1][8] = bit;
      else m[size - 15 + i][8] = bit;
      /* 横向那一行 */
      if (i < 8) m[8][size - i - 1] = bit;
      else if (i < 9) m[8][15 - i - 1 + 1] = bit;
      else m[8][15 - i - 1] = bit;
    }
    m[size - 8][8] = true;                     // 固定黑点，别被格式信息覆盖掉
  }

  function placeVersion(g, version) {
    if (version < 7) return;
    var size = g.size, m = g.modules;
    var bits = bchTypeNumber(version);
    for (var i = 0; i < 18; i++) {
      var bit = ((bits >> i) & 1) === 1;
      m[Math.floor(i / 3)][i % 3 + size - 8 - 3] = bit;
      m[i % 3 + size - 8 - 3][Math.floor(i / 3)] = bit;
    }
  }

  /* ------------------------------------------------------------
   * 掩码评分：标准里的四条惩罚规则，分数越低越好。
   * 目的是让点阵看起来「不规律」，扫码器才容易分辨。
   * ---------------------------------------------------------- */
  function penalty(m, size) {
    var score = 0, r, c, i;

    /* 规则 1：同行/同列出现连续 5 个及以上同色 */
    for (r = 0; r < size; r++) {
      var runRow = 1, runCol = 1;
      for (c = 1; c < size; c++) {
        if (m[r][c] === m[r][c - 1]) runRow++; else { if (runRow >= 5) score += 3 + (runRow - 5); runRow = 1; }
        if (m[c][r] === m[c - 1][r]) runCol++; else { if (runCol >= 5) score += 3 + (runCol - 5); runCol = 1; }
      }
      if (runRow >= 5) score += 3 + (runRow - 5);
      if (runCol >= 5) score += 3 + (runCol - 5);
    }

    /* 规则 2：2×2 同色方块 */
    for (r = 0; r < size - 1; r++) {
      for (c = 0; c < size - 1; c++) {
        var v = m[r][c];
        if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
      }
    }

    /* 规则 3：出现 1011101 紧跟 0000（或反过来）的「像定位图形」序列 */
    var PAT1 = [true, false, true, true, true, false, true, false, false, false, false];
    var PAT2 = [false, false, false, false, true, false, true, true, true, false, true];
    function matchRow(arr, start, pat) {
      for (var k = 0; k < pat.length; k++) if (arr[start + k] !== pat[k]) return false;
      return true;
    }
    for (r = 0; r < size; r++) {
      var rowArr = m[r];
      var colArr = [];
      for (i = 0; i < size; i++) colArr.push(m[i][r]);
      for (c = 0; c + 11 <= size; c++) {
        if (matchRow(rowArr, c, PAT1) || matchRow(rowArr, c, PAT2)) score += 40;
        if (matchRow(colArr, c, PAT1) || matchRow(colArr, c, PAT2)) score += 40;
      }
    }

    /* 规则 4：黑块占比偏离 50% 越多扣越多，每 5% 加 10 分 */
    var dark = 0;
    for (r = 0; r < size; r++) for (c = 0; c < size; c++) if (m[r][c]) dark++;
    var ratio = dark * 100 / (size * size);
    score += Math.floor(Math.abs(ratio - 50) / 5) * 10;

    return score;
  }

  /* ============================================================
   * 五、对外入口
   * ============================================================ */
  function encode(text, eccLevel) {
    var levelIdx = ECC_LEVELS.indexOf(eccLevel || 'M');
    if (levelIdx < 0) levelIdx = 1;

    var bytes = utf8Bytes(String(text));

    /* 选版本：从 1 往上找第一个装得下的 */
    var version = 0;
    for (var v = 1; v <= MAX_VERSION; v++) {
      var needBits = 4 + 8 + bytes.length * 8;
      if (needBits <= dataCodewords(v, levelIdx) * 8) { version = v; break; }
    }
    if (!version) {
      throw new Error('内容太长，版本 1~9 的 ' + ECC_LEVELS[levelIdx] +
        ' 档装不下（当前 ' + bytes.length + ' 字节，最多 ' +
        dataCodewords(MAX_VERSION, levelIdx) + ' 字节）');
    }

    var codewords = buildCodewords(bytes, version, levelIdx);

    /* 8 种掩码各试一遍，选惩罚分最低的 */
    var best = null;
    for (var mask = 0; mask < 8; mask++) {
      var g = placeFixed(version);
      placeData(g, codewords, mask);
      placeFormat(g, levelIdx, mask);
      placeVersion(g, version);
      var s = penalty(g.modules, g.size);
      if (!best || s < best.score) best = { score: s, grid: g, mask: mask };
    }

    return {
      text: String(text),
      version: version,
      level: ECC_LEVELS[levelIdx],
      mask: best.mask,
      size: best.grid.size,
      modules: best.grid.modules
    };
  }

  window.CLJ_QR = {
    encode: encode,
    MAX_VERSION: MAX_VERSION,
    /* 把内部表暴露出来，自检脚本要拿它校验分块表和标准总码字数是否一致 */
    _internals: {
      TOTAL_CW: TOTAL_CW,
      RS_BLOCKS: RS_BLOCKS,
      totalCodewords: totalCodewords,
      dataCodewords: dataCodewords,
      utf8Bytes: utf8Bytes,
      rsEncode: rsEncode,
      version: MAX_VERSION
    }
  };
})();
