/* ============================================================
 * 长留玉 · 天赋测试 · 「和你最像的名人」库
 * ------------------------------------------------------------
 * 每个名人给一组八维权重（0~5，和职业库的 w 同一套写法），
 * 匹配时只比**形状** —— 也就是「哪几项相对突出」，不比绝对高低。
 * 所以结果是算出来的、因人而异，不是按最高维度查表发一个。
 *
 * 选人原则：
 *   · 一律**避开政治人物**，也避开在世且有争议的公众人物；
 *     只用作家 / 科学家 / 艺术家 / 运动员 / 哲学家这类
 *     「公众形象里能看到思维特点」的人。
 *   · why 只说「他的哪一点和这个组合对得上」，不做人生总结，
 *     更不能说成「你就是他」。这是一句类比，娱乐性质。
 *
 * 权重怎么给：以这个人在公众印象里最突出的能力为准，
 * 同时给他确实也强的地方加分 —— 比如费曼逻辑 5、语言 4，
 * 因为他出名的一部分正是「把物理讲成人话」。
 * ============================================================ */
window.CLJ_TALENT_FIGURES = (window.CLJ_TALENT_FIGURES || []).concat([

  /* ===== 表达见长 ===== */
  { id: 'zhangailing', name: '张爱玲', why: '用词的份量和画面感，是她最被记住的部分。',
    w: { LIN: 5, INT: 4, SPA: 3, MUS: 2, LOG: 2, PER: 3, BOD: 1, NAT: 2 } },
  { id: 'murakami', name: '村上春树', why: '长跑、爵士乐、写作，他把自律和自省都写进了作品里。',
    w: { LIN: 5, INT: 4, MUS: 3, BOD: 3, LOG: 2, PER: 2, SPA: 3, NAT: 2 } },
  { id: 'qianzhongshu', name: '钱钟书', why: '语言上的机锋和博闻，是旁人很难模仿的那一层。',
    w: { LIN: 5, LOG: 4, INT: 3, NAT: 2, SPA: 2, MUS: 2, PER: 2, BOD: 1 } },
  { id: 'sanmao', name: '三毛', why: '把远方的日子讲得让人想去，靠的是讲述和共情。',
    w: { LIN: 5, PER: 4, BOD: 3, NAT: 3, INT: 3, SPA: 3, LOG: 1, MUS: 2 } },

  /* ===== 推理见长 ===== */
  { id: 'einstein', name: '爱因斯坦', why: '他最有名的那些想法，都是先「看见」再算出来的。',
    w: { LOG: 5, SPA: 4, INT: 3, NAT: 2, LIN: 2, MUS: 3, PER: 2, BOD: 1 } },
  { id: 'turing', name: '阿兰·图灵', why: '把「思考」本身拆成可执行的步骤，还长期独自琢磨难题。',
    w: { LOG: 5, INT: 4, SPA: 3, BOD: 3, LIN: 2, MUS: 2, PER: 2, NAT: 2 } },
  { id: 'feynman', name: '理查德·费曼', why: '逻辑强的人不少，能顺手把物理讲成人话的不多。',
    w: { LOG: 5, LIN: 4, BOD: 3, MUS: 3, PER: 3, SPA: 3, INT: 3, NAT: 2 } },
  { id: 'curie', name: '居里夫人', why: '推理、动手、长期独处，她三样都吃得下。',
    w: { LOG: 5, BOD: 4, INT: 4, NAT: 3, LIN: 2, SPA: 2, MUS: 2, PER: 2 } },

  /* ===== 画面见长 ===== */
  { id: 'peiming', name: '贝聿铭', why: '几何感和空间秩序，是他作品里最稳定的东西。',
    w: { SPA: 5, LOG: 4, NAT: 3, INT: 3, LIN: 2, MUS: 2, PER: 2, BOD: 2 } },
  { id: 'davinci', name: '达·芬奇', why: '画画、解剖、飞行器 —— 他靠的是眼睛加追问。',
    w: { SPA: 5, LOG: 4, NAT: 4, BOD: 3, INT: 3, LIN: 2, MUS: 3, PER: 2 } },
  { id: 'miyazaki', name: '宫崎骏', why: '他先看见画面，再让画面自己把故事讲出来。',
    w: { SPA: 5, NAT: 4, LIN: 3, MUS: 3, BOD: 3, INT: 3, LOG: 2, PER: 2 } },
  { id: 'kusama', name: '草间弥生', why: '把同一种图形重复到极致，靠的是视觉上的执拗。',
    w: { SPA: 5, INT: 4, MUS: 3, BOD: 3, LIN: 2, LOG: 2, PER: 2, NAT: 2 } },

  /* ===== 声音见长 ===== */
  { id: 'sakamoto', name: '坂本龙一', why: '听觉敏锐，又愿意一个人往深处走。',
    w: { MUS: 5, INT: 4, SPA: 3, NAT: 3, LIN: 3, LOG: 3, PER: 2, BOD: 2 } },
  { id: 'mozart', name: '莫扎特', why: '旋律几乎是直接流出来的，结构却一点不乱。',
    w: { MUS: 5, SPA: 3, LOG: 3, PER: 2, LIN: 2, INT: 2, BOD: 3, NAT: 1 } },
  { id: 'jaychou', name: '周杰伦', why: '旋律和语言一起用，是他最难被复制的部分。',
    w: { MUS: 5, LIN: 4, SPA: 3, BOD: 3, INT: 2, LOG: 2, PER: 3, NAT: 1 } },
  { id: 'bach', name: '巴赫', why: '音乐里的数学结构，是他作品最硬的那部分。',
    w: { MUS: 5, LOG: 4, INT: 3, SPA: 3, LIN: 2, PER: 1, BOD: 2, NAT: 1 } },

  /* ===== 身体见长 ===== */
  { id: 'brucelee', name: '李小龙', why: '身体表达和「想明白再出手」，他两样是一体的。',
    w: { BOD: 5, INT: 4, LOG: 4, LIN: 3, PER: 2, SPA: 3, MUS: 2, NAT: 2 } },
  { id: 'jordan', name: '迈克尔·乔丹', why: '到了关键时刻，他的身体比脑子先做对决定。',
    w: { BOD: 5, PER: 3, LOG: 3, SPA: 3, INT: 3, MUS: 1, LIN: 2, NAT: 1 } },
  { id: 'eguailing', name: '谷爱凌', why: '身体控制和空间感是同一套东西，她两样都很清楚。',
    w: { BOD: 5, SPA: 4, INT: 4, PER: 3, LIN: 3, LOG: 2, MUS: 2, NAT: 2 } },
  { id: 'dengyaping', name: '邓亚萍', why: '身体之外，她赢在临场的判断和不服气。',
    w: { BOD: 5, LOG: 4, INT: 4, PER: 3, SPA: 3, LIN: 2, MUS: 1, NAT: 1 } },

  /* ===== 读人见长 ===== */
  { id: 'caikangyong', name: '蔡康永', why: '共情和表达，他几乎是把两样一起用出来的。',
    w: { PER: 5, LIN: 5, INT: 4, SPA: 2, LOG: 3, MUS: 2, BOD: 2, NAT: 1 } },
  { id: 'rogers', name: '卡尔·罗杰斯', why: '把人听明白，本身就是他专业的一部分。',
    w: { PER: 5, INT: 5, LIN: 3, LOG: 3, NAT: 2, SPA: 1, MUS: 2, BOD: 1 } },
  { id: 'hejiong', name: '何炅', why: '场上每个人的状态，他几乎都能照顾到。',
    w: { PER: 5, LIN: 4, BOD: 3, INT: 3, MUS: 2, LOG: 2, SPA: 2, NAT: 1 } },
  { id: 'carnegie', name: '戴尔·卡耐基', why: '把「怎么和人打交道」整理成可学的东西，是他的贡献。',
    w: { PER: 5, LIN: 4, LOG: 3, INT: 3, SPA: 1, MUS: 1, BOD: 2, NAT: 1 } },

  /* ===== 自省见长 ===== */
  { id: 'socrates', name: '苏格拉底', why: '靠一直追问，把别人和自己都逼到更清楚的地方。',
    w: { INT: 5, LOG: 5, LIN: 4, PER: 3, SPA: 2, MUS: 1, BOD: 2, NAT: 2 } },
  { id: 'wangyangming', name: '王阳明', why: '想明白之后一定要去做，这两件事在他那里没分开过。',
    w: { INT: 5, BOD: 4, LOG: 3, LIN: 3, PER: 3, SPA: 2, MUS: 1, NAT: 2 } },
  { id: 'jung', name: '荣格', why: '往自己内心走得深，同时一直在看别人在想什么。',
    w: { INT: 5, PER: 4, NAT: 3, LIN: 3, SPA: 3, LOG: 2, MUS: 2, BOD: 1 } },
  { id: 'thoreau', name: '梭罗', why: '一个人在湖边住了两年，然后把观察写了下来。',
    w: { INT: 5, NAT: 5, LIN: 3, BOD: 3, SPA: 3, LOG: 2, PER: 1, MUS: 2 } },

  /* ===== 观察见长 ===== */
  { id: 'darwin', name: '达尔文', why: '先看二十年，再动笔 —— 观察和推理一起用了一辈子。',
    w: { NAT: 5, LOG: 4, INT: 3, BOD: 3, LIN: 2, SPA: 2, PER: 2, MUS: 1 } },
  { id: 'fabre', name: '法布尔', why: '趴在地上看虫子，能看一整天。',
    w: { NAT: 5, INT: 4, BOD: 3, LIN: 3, SPA: 2, LOG: 2, PER: 2, MUS: 1 } },
  { id: 'goodall', name: '珍·古道尔', why: '观察动物的同时，也把理解给了它们。',
    w: { NAT: 5, PER: 4, BOD: 3, INT: 3, LIN: 3, SPA: 2, LOG: 2, MUS: 1 } },
  { id: 'carson', name: '蕾切尔·卡森', why: '把自然的细节写得让人读得下去，是她的本事。',
    w: { NAT: 5, LIN: 4, INT: 3, SPA: 3, LOG: 2, PER: 2, BOD: 1, MUS: 2 } }

]);
