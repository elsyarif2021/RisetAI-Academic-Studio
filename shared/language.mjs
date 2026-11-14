export const defaultLanguage = 'id';

export const languageOptions = [
  ['id', 'Bahasa Indonesia'], ['en', 'English'], ['ar', 'العربية'],
  ['zh-Hans', '简体中文'], ['zh-Hant', '繁體中文'], ['ja', '日本語'],
  ['ko', '한국어'], ['fr', 'Français'], ['es', 'Español'], ['de', 'Deutsch'],
  ['pt', 'Português'], ['ru', 'Русский'], ['hi', 'हिन्दी'], ['tr', 'Türkçe'],
  ['nl', 'Nederlands'], ['it', 'Italiano'], ['ms', 'Bahasa Melayu'],
  ['th', 'ไทย'], ['vi', 'Tiếng Việt'], ['bn', 'বাংলা'], ['fa', 'فارسی'],
  ['he', 'עברית'], ['ur', 'اردو'], ['sw', 'Kiswahili'],
];

export function normalizeLanguage(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 80) || defaultLanguage : defaultLanguage;
}

export function languageInfo(value) {
  const selection = normalizeLanguage(value);
  let locale;
  let name;
  try {
    const parsed = new Intl.Locale(selection);
    const display = typeof Intl.DisplayNames === 'function'
      ? new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' }) : null;
    name = display?.of(parsed.baseName);
    if (name || selection.includes('-') || /^[a-z]{2,3}$/.test(selection)) locale = parsed;
    if (locale) name ||= display?.of(parsed.language);
  } catch {
    // A language can also be entered by name.
  }
  const code = locale?.baseName;
  const known = languageOptions.find(([tag, label]) =>
    tag === code || label.toLowerCase() === selection.toLowerCase());
  if (!locale && known) return languageInfo(known[0]);
  const script = locale?.maximize().script;
  const rtl = /^(Adlm|Arab|Hebr|Nkoo|Rohg|Samr|Syrc|Thaa|Mand|Mend)$/.test(script || '') ||
    (!code && (/\p{Script=Arabic}|\p{Script=Hebrew}/u.test(selection) ||
      /^(Arabic|Hebrew|Persian|Farsi|Urdu|Pashto|Yiddish|Sindhi|Bahasa Arab)$/i.test(selection)));
  return {
    name: known?.[1] || name || selection,
    instruction: code && (name || known) ? (name || known[1]) + ' (' + code + ')' : selection,
    code,
    base: locale?.language === 'zh' && /^(Hans|Hant)$/.test(script || '') ? 'zh-' + script : locale?.language,
    rtl,
    cjk: /^(Hans|Hant|Jpan|Kore)$/.test(script || ''),
  };
}

export function countResearchWords(text, language) {
  const { code } = languageInfo(language);
  const value = text.replaceAll('[MASUKKAN DATA PENELITIAN]', ' ');
  if (typeof Intl.Segmenter === 'function') {
    const segments = new Intl.Segmenter(code, { granularity: 'word' }).segment(value);
    let count = 0;
    for (const part of segments) if (part.isWordLike) count++;
    return count;
  }
  return (value.match(/[\p{L}\p{M}\p{N}]+/gu) || []).length;
}

// Five chapter headings followed by questions, instruments, bibliography and the instrument item label.
const labels = {
  id: ['BAB I – PENDAHULUAN', 'BAB II – TINJAUAN PUSTAKA', 'BAB III – METODE PENELITIAN', 'BAB IV – HASIL PENELITIAN DAN PEMBAHASAN', 'BAB V – PENUTUP', 'Pertanyaan Penelitian', 'INSTRUMEN PENELITIAN', 'DAFTAR PUSTAKA', 'Butir / uraian instrumen'],
  en: ['Chapter I – Introduction', 'Chapter II – Literature Review', 'Chapter III – Research Methodology', 'Chapter IV – Results and Discussion', 'Chapter V – Conclusion', 'Research Questions', 'Research Instrument', 'References', 'Instrument item'],
  ar: ['الفصل الأول – المقدمة', 'الفصل الثاني – مراجعة الأدبيات', 'الفصل الثالث – منهجية البحث', 'الفصل الرابع – النتائج والمناقشة', 'الفصل الخامس – الخاتمة', 'أسئلة البحث', 'أداة البحث', 'المراجع', 'بند الأداة'],
  'zh-Hans': ['第一章 绪论', '第二章 文献综述', '第三章 研究方法', '第四章 研究结果与讨论', '第五章 结论', '研究问题', '研究工具', '参考文献', '条目'],
  'zh-Hant': ['第一章 緒論', '第二章 文獻綜述', '第三章 研究方法', '第四章 研究結果與討論', '第五章 結論', '研究問題', '研究工具', '參考文獻', '條目'],
  ja: ['第1章 序論', '第2章 先行研究', '第3章 研究方法', '第4章 結果と考察', '第5章 結論', '研究課題', '調査票', '参考文献', '調査項目'],
  ko: ['제1장 서론', '제2장 문헌 검토', '제3장 연구 방법', '제4장 결과 및 논의', '제5장 결론', '연구 질문', '연구 도구', '참고 문헌', '문항'],
  fr: ['Chapitre I – Introduction', 'Chapitre II – Revue de la littérature', 'Chapitre III – Méthodologie', 'Chapitre IV – Résultats et discussion', 'Chapitre V – Conclusion', 'Questions de recherche', 'Instrument de recherche', 'Références', 'Énoncé'],
  es: ['Capítulo I – Introducción', 'Capítulo II – Revisión de la literatura', 'Capítulo III – Metodología', 'Capítulo IV – Resultados y discusión', 'Capítulo V – Conclusión', 'Preguntas de investigación', 'Instrumento de investigación', 'Referencias', 'Ítem'],
  de: ['Kapitel I – Einleitung', 'Kapitel II – Literaturübersicht', 'Kapitel III – Forschungsmethodik', 'Kapitel IV – Ergebnisse und Diskussion', 'Kapitel V – Fazit', 'Forschungsfragen', 'Erhebungsinstrument', 'Literaturverzeichnis', 'Eintrag'],
  pt: ['Capítulo I – Introdução', 'Capítulo II – Revisão da literatura', 'Capítulo III – Metodologia', 'Capítulo IV – Resultados e discussão', 'Capítulo V – Conclusão', 'Questões de pesquisa', 'Instrumento de pesquisa', 'Referências', 'Item'],
  ru: ['Глава I – Введение', 'Глава II – Обзор литературы', 'Глава III – Методология исследования', 'Глава IV – Результаты и обсуждение', 'Глава V – Заключение', 'Исследовательские вопросы', 'Инструмент исследования', 'Список литературы', 'Пункт'],
  hi: ['अध्याय १ – परिचय', 'अध्याय २ – साहित्य समीक्षा', 'अध्याय ३ – शोध पद्धति', 'अध्याय ४ – परिणाम और चर्चा', 'अध्याय ५ – निष्कर्ष', 'शोध प्रश्न', 'शोध उपकरण', 'संदर्भ', 'मद'],
  tr: ['Bölüm I – Giriş', 'Bölüm II – Literatür Taraması', 'Bölüm III – Araştırma Yöntemi', 'Bölüm IV – Bulgular ve Tartışma', 'Bölüm V – Sonuç', 'Araştırma Soruları', 'Araştırma Aracı', 'Kaynakça', 'Madde'],
  nl: ['Hoofdstuk I – Inleiding', 'Hoofdstuk II – Literatuuronderzoek', 'Hoofdstuk III – Onderzoeksmethode', 'Hoofdstuk IV – Resultaten en discussie', 'Hoofdstuk V – Conclusie', 'Onderzoeksvragen', 'Onderzoeksinstrument', 'Literatuurlijst', 'Item'],
  it: ['Capitolo I – Introduzione', 'Capitolo II – Rassegna della letteratura', 'Capitolo III – Metodologia', 'Capitolo IV – Risultati e discussione', 'Capitolo V – Conclusioni', 'Domande di ricerca', 'Strumento di ricerca', 'Bibliografia', 'Voce'],
  ms: ['Bab I – Pengenalan', 'Bab II – Sorotan Literatur', 'Bab III – Metodologi Penyelidikan', 'Bab IV – Dapatan dan Perbincangan', 'Bab V – Kesimpulan', 'Soalan Penyelidikan', 'Instrumen Penyelidikan', 'Rujukan', 'Item'],
  th: ['บทที่ 1 บทนำ', 'บทที่ 2 การทบทวนวรรณกรรม', 'บทที่ 3 วิธีดำเนินการวิจัย', 'บทที่ 4 ผลการวิจัยและอภิปรายผล', 'บทที่ 5 บทสรุป', 'คำถามการวิจัย', 'เครื่องมือวิจัย', 'เอกสารอ้างอิง', 'ข้อคำถาม'],
  vi: ['Chương I – Mở đầu', 'Chương II – Tổng quan tài liệu', 'Chương III – Phương pháp nghiên cứu', 'Chương IV – Kết quả và thảo luận', 'Chương V – Kết luận', 'Câu hỏi nghiên cứu', 'Công cụ nghiên cứu', 'Tài liệu tham khảo', 'Mục'],
  bn: ['অধ্যায় ১ – ভূমিকা', 'অধ্যায় ২ – সাহিত্য পর্যালোচনা', 'অধ্যায় ৩ – গবেষণা পদ্ধতি', 'অধ্যায় ৪ – ফলাফল ও আলোচনা', 'অধ্যায় ৫ – উপসংহার', 'গবেষণা প্রশ্ন', 'গবেষণা উপকরণ', 'তথ্যসূত্র', 'আইটেম'],
  fa: ['فصل اول – مقدمه', 'فصل دوم – مرور ادبیات', 'فصل سوم – روش‌شناسی پژوهش', 'فصل چهارم – یافته‌ها و بحث', 'فصل پنجم – نتیجه‌گیری', 'پرسش‌های پژوهش', 'ابزار پژوهش', 'منابع', 'گویه'],
  he: ['פרק א׳ – מבוא', 'פרק ב׳ – סקירת ספרות', 'פרק ג׳ – שיטת המחקר', 'פרק ד׳ – תוצאות ודיון', 'פרק ה׳ – מסקנות', 'שאלות המחקר', 'כלי המחקר', 'מקורות', 'פריט'],
  ur: ['باب اول – تعارف', 'باب دوم – جائزۂ ادب', 'باب سوم – طریقۂ تحقیق', 'باب چہارم – نتائج اور بحث', 'باب پنجم – اختتامیہ', 'تحقیقی سوالات', 'تحقیقی آلہ', 'حوالہ جات', 'سوال'],
  sw: ['Sura ya I – Utangulizi', 'Sura ya II – Mapitio ya Fasihi', 'Sura ya III – Mbinu za Utafiti', 'Sura ya IV – Matokeo na Majadiliano', 'Sura ya V – Hitimisho', 'Maswali ya Utafiti', 'Zana ya Utafiti', 'Marejeleo', 'Kipengele'],
};

export function wordLabels(language) {
  const { base } = languageInfo(language);
  return Object.hasOwn(labels, base) ? labels[base] : null;
}
