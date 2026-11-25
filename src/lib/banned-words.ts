export interface BannedWordRule {
  word: string;
  category: string;
  suggestion: string;
}

export interface BannedWordMatch {
  word: string;
  index: number;
  length: number;
  category: string;
  suggestion: string;
}

export const BUILTIN_BANNED_WORD_RULES: BannedWordRule[] = [
  // 极限绝对化用语（广告法第九条）
  { word: '最便宜', category: '极限绝对化词', suggestion: '超高性价比' },
  { word: '全网最低', category: '极限绝对化词', suggestion: '直播间惊喜价' },
  { word: '全网第一', category: '极限绝对化词', suggestion: '店铺热销口碑款' },
  { word: '全网销量第一', category: '极限绝对化词', suggestion: '累计热销爆款' },
  { word: '国家级', category: '极限绝对化词', suggestion: '高标准严选' },
  { word: '世界级', category: '极限绝对化词', suggestion: '国际品质标准' },
  { word: '最高级', category: '极限绝对化词', suggestion: '高阶旗舰款' },
  { word: '最佳', category: '极限绝对化词', suggestion: '优选' },
  { word: '最好', category: '极限绝对化词', suggestion: '口碑推荐' },
  { word: '最大', category: '极限绝对化词', suggestion: '大容量/大规格' },
  { word: '唯一', category: '极限绝对化词', suggestion: '特色专研' },
  { word: '首个', category: '极限绝对化词', suggestion: '创新升级款' },
  { word: '首选', category: '极限绝对化词', suggestion: '人气之选' },
  { word: '顶级', category: '极限绝对化词', suggestion: '高配版' },
  { word: '极致', category: '极限绝对化词', suggestion: '出众体验' },
  { word: '永久', category: '虚假承诺词', suggestion: '长效耐用' },
  { word: '终身', category: '虚假承诺词', suggestion: '持久陪伴' },
  { word: '100%', category: '绝对承诺词', suggestion: '高比例' },
  { word: '百分百', category: '绝对承诺词', suggestion: '绝大多数体验' },
  { word: '绝对', category: '绝对承诺词', suggestion: '显著' },
  { word: '零风险', category: '绝对承诺词', suggestion: '提供售后保障' },
  { word: '无效退款', category: '违规承诺词', suggestion: '支持7天无理由退换' },

  // 医疗/功效夸张违禁词
  { word: '根治', category: '医疗功效词', suggestion: '改善护理' },
  { word: '治疗', category: '医疗功效词', suggestion: '日常舒缓护理' },
  { word: '药效', category: '医疗功效词', suggestion: '成分体验' },
  { word: '医疗级', category: '医疗功效词', suggestion: '严苛洁净标准' },
  { word: '医用级', category: '医疗功效词', suggestion: '安心亲肤标准' },
  { word: '抗衰老', category: '违规宣称词', suggestion: '抗初老紧致' },
  { word: '防癌', category: '医疗功效词', suggestion: '日常防护' },
  { word: '消炎', category: '医疗功效词', suggestion: '舒缓修护' },
  { word: '杀菌', category: '敏感功效词', suggestion: '洁净抑味' },
  { word: '特效', category: '虚假宣传词', suggestion: '专研配方' },
  { word: '神效', category: '虚假宣传词', suggestion: '真实反馈亮眼' },
  { word: '立竿见影', category: '夸张承诺词', suggestion: '肤感即时水润' },

  // 直播间诱导/违规促单词
  { word: '全网仅此一次', category: '诱导逼单词', suggestion: '本场专属机制' },
  { word: '错过再等一年', category: '诱导逼单词', suggestion: '本次活动库存有限' },
  { word: '假一赔万', category: '夸大承诺词', suggestion: '正品保障' },
  { word: '史无前例', category: '极限绝对化词', suggestion: '诚意加赠机制' },
  { word: '破价', category: '平台敏感词', suggestion: '惊喜宠粉价' },
  { word: '白送', category: '平台敏感词', suggestion: '加赠好礼' },
];

export function buildBannedRules(
  extraWords: string[] = [],
  customCategory = '自定义 / 产品专属词'
): BannedWordRule[] {
  const map = new Map<string, BannedWordRule>();
  for (const rule of BUILTIN_BANNED_WORD_RULES) {
    map.set(rule.word, rule);
  }
  for (const raw of extraWords) {
    const word = raw.trim();
    if (!word) continue;
    if (!map.has(word)) {
      map.set(word, {
        word,
        category: customCategory,
        suggestion: '建议替换为客观描述',
      });
    }
  }
  // Sort longest first so longer phrases match before shorter substrings
  return Array.from(map.values()).sort((a, b) => b.word.length - a.word.length);
}

export function detectBannedWords(
  text: string,
  extraWords: string[] = []
): BannedWordMatch[] {
  if (!text) return [];
  const rules = buildBannedRules(extraWords);
  const matches: BannedWordMatch[] = [];
  const occupied = new Array<boolean>(text.length).fill(false);

  for (const rule of rules) {
    let startIdx = 0;
    while (startIdx < text.length) {
      const idx = text.indexOf(rule.word, startIdx);
      if (idx === -1) break;
      const end = idx + rule.word.length;
      let overlaps = false;
      for (let i = idx; i < end; i++) {
        if (occupied[i]) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) {
        for (let i = idx; i < end; i++) occupied[i] = true;
        matches.push({
          word: rule.word,
          index: idx,
          length: rule.word.length,
          category: rule.category,
          suggestion: rule.suggestion,
        });
      }
      startIdx = idx + rule.word.length;
    }
  }

  return matches.sort((a, b) => a.index - b.index);
}

export function replaceBannedWordsInText(
  text: string,
  extraWords: string[] = []
): { nextText: string; replacedCount: number } {
  const matches = detectBannedWords(text, extraWords);
  if (matches.length === 0) {
    return { nextText: text, replacedCount: 0 };
  }

  let cursor = 0;
  let result = '';
  let replacedCount = 0;

  for (const m of matches) {
    result += text.slice(cursor, m.index);
    const replacement =
      m.suggestion === '建议替换为客观描述' ? '[合规改写]' : m.suggestion;
    result += replacement;
    cursor = m.index + m.length;
    replacedCount += 1;
  }
  result += text.slice(cursor);

  return { nextText: result, replacedCount };
}
