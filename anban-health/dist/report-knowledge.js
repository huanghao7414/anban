'use strict';

// 版本随公开来源和转译内容一起更新。
const reportKnowledgeVersion = '1.2.2';
const reportKnowledge = [
  {
    "name": "空腹血糖",
    "aliases": [
      "FPG",
      "FBS",
      "空腹葡萄糖"
    ],
    "meaning": "空着肚子抽血，看看血液里有多少糖。",
    "note": "复查前可向医生确认是否要空腹。",
    "source": "https://medlineplus.gov/lab-tests/blood-glucose-test/"
  },
  {
    "name": "糖化血红蛋白",
    "aliases": [
      "HbA1c",
      "A1c",
      "糖化血红蛋白(HbA1c)"
    ],
    "meaning": "看看过去两三个月里，血糖平均大概是什么样。",
    "source": "https://medlineplus.gov/lab-tests/hemoglobin-a1c-hba1c-test/"
  },
  {
    "name": "总胆固醇",
    "aliases": [
      "TC",
      "CHOL"
    ],
    "meaning": "看看血液里的各类胆固醇加在一起有多少。",
    "source": "https://medlineplus.gov/lab-tests/cholesterol-levels/"
  },
  {
    "name": "甘油三酯",
    "aliases": [
      "TG"
    ],
    "meaning": "看看血液里这种脂肪有多少。",
    "source": "https://medlineplus.gov/lab-tests/cholesterol-levels/"
  },
  {
    "name": "低密度脂蛋白胆固醇",
    "aliases": [
      "LDL-C",
      "LDL",
      "低密度脂蛋白"
    ],
    "meaning": "看看血液里常说的“坏胆固醇”有多少。它太多时，更容易在血管里堆积。",
    "source": "https://medlineplus.gov/lab-tests/cholesterol-levels/"
  },
  {
    "name": "高密度脂蛋白胆固醇",
    "aliases": [
      "HDL-C",
      "HDL",
      "高密度脂蛋白"
    ],
    "meaning": "看看血液里常说的“好胆固醇”有多少。它能帮忙把多余的胆固醇带走。",
    "source": "https://medlineplus.gov/lab-tests/cholesterol-levels/"
  },
  {
    "name": "丙氨酸氨基转移酶",
    "aliases": [
      "ALT",
      "GPT",
      "谷丙转氨酶"
    ],
    "meaning": "量一量血液里一种主要来自肝脏的蛋白。医生会和其他项目一起看肝脏情况。",
    "source": "https://medlineplus.gov/lab-tests/comprehensive-metabolic-panel-cmp/"
  },
  {
    "name": "天门冬氨酸氨基转移酶",
    "aliases": [
      "AST",
      "GOT",
      "谷草转氨酶"
    ],
    "meaning": "量一量血液里一种与肝脏等组织有关的蛋白。医生通常会连同其他检查一起看。",
    "source": "https://medlineplus.gov/lab-tests/comprehensive-metabolic-panel-cmp/"
  },
  {
    "name": "总胆红素",
    "aliases": [
      "TBIL"
    ],
    "meaning": "旧红细胞分解后会留下胆红素，主要由肝脏处理。这项看血里有多少。",
    "source": "https://medlineplus.gov/lab-tests/comprehensive-metabolic-panel-cmp/"
  },
  {
    "name": "血肌酐",
    "aliases": [
      "肌酐",
      "CREA",
      "SCr",
      "血清肌酐"
    ],
    "meaning": "身体会产生一种叫肌酐的废物，肾脏负责把它滤出去。这项看血里还剩多少。",
    "source": "https://medlineplus.gov/lab-tests/comprehensive-metabolic-panel-cmp/"
  },
  {
    "name": "估算肾小球滤过率",
    "aliases": [
      "eGFR",
      "估计肾小球滤过率"
    ],
    "meaning": "大致看看肾脏把血里的废物滤得怎么样。",
    "source": "https://medlineplus.gov/lab-tests/estimated-glomerular-filtration-rate-egfr-and-gfr-tests/"
  },
  {
    "name": "血尿酸",
    "aliases": [
      "尿酸",
      "血清尿酸"
    ],
    "meaning": "身体分解一些物质时会产生尿酸。这项看看血液里有多少。",
    "source": "https://medlineplus.gov/lab-tests/uric-acid-test/"
  },
  {
    "name": "血红蛋白",
    "aliases": [
      "Hb",
      "HGB"
    ],
    "meaning": "红细胞里的血红蛋白把氧气带到身体各处。",
    "source": "https://medlineplus.gov/lab-tests/complete-blood-count-cbc/"
  },
  {
    "name": "白细胞计数",
    "aliases": [
      "WBC",
      "白细胞",
      "白细胞总数"
    ],
    "meaning": "数血液里的白细胞。白细胞参与抵抗感染。",
    "source": "https://medlineplus.gov/lab-tests/complete-blood-count-cbc/"
  },
  {
    "name": "血小板计数",
    "aliases": [
      "PLT",
      "血小板"
    ],
    "meaning": "数血液里的血小板。血小板帮助伤口止血。",
    "source": "https://medlineplus.gov/lab-tests/complete-blood-count-cbc/"
  },
  {
    "name": "红细胞计数",
    "aliases": [
      "红细胞",
      "血红细胞计数"
    ],
    "meaning": "数血液里负责运送氧气的红细胞。",
    "source": "https://medlineplus.gov/lab-tests/complete-blood-count-cbc/"
  },
  {
    "name": "红细胞压积",
    "aliases": [
      "HCT",
      "红细胞比容",
      "血细胞比容"
    ],
    "meaning": "看看一份血里，红细胞占了多大一部分。",
    "source": "https://medlineplus.gov/lab-tests/complete-blood-count-cbc/"
  },
  {
    "name": "平均红细胞体积",
    "aliases": [
      "MCV",
      "红细胞平均体积"
    ],
    "meaning": "看红细胞平均有多大。",
    "source": "https://medlineplus.gov/lab-tests/complete-blood-count-cbc/"
  },
  {
    "name": "中性粒细胞计数",
    "aliases": [
      "NEUT#",
      "NEU#",
      "中性粒细胞绝对值"
    ],
    "meaning": "数血液里的中性粒细胞，这是参与抵抗感染的一种白细胞。",
    "source": "https://medlineplus.gov/lab-tests/blood-differential/"
  },
  {
    "name": "中性粒细胞百分比",
    "aliases": [
      "NEUT%",
      "NEU%",
      "中性粒细胞比例",
      "中性粒细胞百分数"
    ],
    "meaning": "看所有白细胞中有多大比例是中性粒细胞。",
    "source": "https://medlineplus.gov/lab-tests/blood-differential/"
  },
  {
    "name": "淋巴细胞计数",
    "aliases": [
      "LYMPH#",
      "LYM#",
      "淋巴细胞绝对值"
    ],
    "meaning": "数血液里的淋巴细胞，这是参与免疫反应的一种白细胞。",
    "source": "https://medlineplus.gov/lab-tests/blood-differential/"
  },
  {
    "name": "淋巴细胞百分比",
    "aliases": [
      "LYMPH%",
      "LYM%",
      "淋巴细胞比例",
      "淋巴细胞百分数"
    ],
    "meaning": "看所有白细胞中有多大比例是淋巴细胞。",
    "source": "https://medlineplus.gov/lab-tests/blood-differential/"
  },
  {
    "name": "单核细胞计数",
    "aliases": [
      "MONO#",
      "MON#",
      "单核细胞绝对值"
    ],
    "meaning": "数血液里的单核细胞，这是白细胞的一类。",
    "source": "https://medlineplus.gov/lab-tests/blood-differential/"
  },
  {
    "name": "单核细胞百分比",
    "aliases": [
      "MONO%",
      "MON%",
      "单核细胞比例",
      "单核细胞百分数"
    ],
    "meaning": "看所有白细胞中有多大比例是单核细胞。",
    "source": "https://medlineplus.gov/lab-tests/blood-differential/"
  },
  {
    "name": "嗜酸性粒细胞计数",
    "aliases": [
      "EOS#",
      "EO#",
      "嗜酸性粒细胞绝对值"
    ],
    "meaning": "数血液里的嗜酸性粒细胞，这是白细胞的一类。",
    "source": "https://medlineplus.gov/lab-tests/blood-differential/"
  },
  {
    "name": "嗜酸性粒细胞百分比",
    "aliases": [
      "EOS%",
      "EO%",
      "嗜酸性粒细胞比例",
      "嗜酸性粒细胞百分数"
    ],
    "meaning": "看所有白细胞中有多大比例是嗜酸性粒细胞。",
    "source": "https://medlineplus.gov/lab-tests/blood-differential/"
  },
  {
    "name": "嗜碱性粒细胞计数",
    "aliases": [
      "BASO#",
      "BAS#",
      "嗜碱性粒细胞绝对值"
    ],
    "meaning": "数血液里的嗜碱性粒细胞，这是白细胞的一类。",
    "source": "https://medlineplus.gov/lab-tests/blood-differential/"
  },
  {
    "name": "嗜碱性粒细胞百分比",
    "aliases": [
      "BASO%",
      "BAS%",
      "嗜碱性粒细胞比例",
      "嗜碱性粒细胞百分数"
    ],
    "meaning": "看所有白细胞中有多大比例是嗜碱性粒细胞。",
    "source": "https://medlineplus.gov/lab-tests/blood-differential/"
  },
  {
    "name": "碱性磷酸酶",
    "aliases": [
      "ALP",
      "血清碱性磷酸酶"
    ],
    "meaning": "看看血液里一种和肝脏、骨头有关的蛋白有多少。医生通常还会看其他项目。",
    "source": "https://medlineplus.gov/lab-tests/comprehensive-metabolic-panel-cmp/"
  },
  {
    "name": "总蛋白",
    "aliases": [
      "TP",
      "血清总蛋白"
    ],
    "meaning": "看看血液里各类蛋白质加起来有多少。",
    "source": "https://medlineplus.gov/lab-tests/comprehensive-metabolic-panel-cmp/"
  },
  {
    "name": "白蛋白",
    "aliases": [
      "ALB",
      "血清白蛋白"
    ],
    "meaning": "肝脏会制造一种叫白蛋白的蛋白质。这项看看血液里有多少。",
    "source": "https://medlineplus.gov/lab-tests/comprehensive-metabolic-panel-cmp/"
  },
  {
    "name": "尿素氮",
    "aliases": [
      "BUN",
      "血尿素氮",
      "血清尿素氮"
    ],
    "meaning": "身体处理蛋白质后会产生废物，多数由肾脏排出去。这项看看血里还剩多少。",
    "source": "https://medlineplus.gov/lab-tests/comprehensive-metabolic-panel-cmp/"
  },
  {
    "name": "血钾",
    "aliases": [
      "K+",
      "血清钾"
    ],
    "meaning": "看看血液里有多少钾。心脏、肌肉正常工作都需要钾。",
    "source": "https://medlineplus.gov/lab-tests/comprehensive-metabolic-panel-cmp/"
  },
  {
    "name": "血钠",
    "aliases": [
      "Na+",
      "血清钠"
    ],
    "meaning": "看看血液里有多少钠。钠有助于维持身体里的水分。",
    "source": "https://medlineplus.gov/lab-tests/comprehensive-metabolic-panel-cmp/"
  },
  {
    "name": "血氯",
    "aliases": [
      "Cl-",
      "血清氯"
    ],
    "meaning": "看看血里有多少氯。它和身体里的水分、酸碱平衡有关。",
    "source": "https://medlineplus.gov/lab-tests/comprehensive-metabolic-panel-cmp/"
  },
  {
    "name": "血钙",
    "aliases": [
      "血清钙",
      "血总钙",
      "血清总钙"
    ],
    "meaning": "测血液中的总钙。钙和骨骼、肌肉及神经的正常工作有关。",
    "source": "https://medlineplus.gov/lab-tests/comprehensive-metabolic-panel-cmp/"
  },
  {
    "name": "碳酸氢根",
    "aliases": [
      "HCO3-",
      "血碳酸氢根"
    ],
    "meaning": "它能帮身体维持合适的酸碱度。这项看看血里的量。",
    "source": "https://medlineplus.gov/lab-tests/comprehensive-metabolic-panel-cmp/"
  },
  {
    "name": "随机血糖",
    "aliases": [
      "随机血浆葡萄糖",
      "随机葡萄糖",
      "RPG",
      "RBS"
    ],
    "meaning": "测采血当时的血糖，随机血糖检查没有固定的空腹要求。",
    "source": "https://medlineplus.gov/lab-tests/blood-glucose-test/"
  },
  {
    "name": "血葡萄糖",
    "aliases": [
      "血糖",
      "葡萄糖(血)",
      "血清葡萄糖",
      "GLU(血)"
    ],
    "meaning": "看看抽血那一刻，血液里有多少糖。",
    "source": "https://medlineplus.gov/lab-tests/blood-glucose-test/"
  },
  {
    "name": "尿蛋白",
    "aliases": [
      "尿液蛋白",
      "尿蛋白定性",
      "PRO(尿)"
    ],
    "meaning": "看尿样里是否检出了蛋白质。",
    "source": "https://medlineplus.gov/ency/article/003579.htm"
  },
  {
    "name": "尿葡萄糖",
    "aliases": [
      "尿糖",
      "尿糖定性",
      "GLU(尿)"
    ],
    "meaning": "看看尿里有没有测到糖。",
    "source": "https://medlineplus.gov/ency/article/003579.htm"
  },
  {
    "name": "尿酮体",
    "aliases": [
      "尿酮",
      "酮体(尿)",
      "KET(尿)"
    ],
    "meaning": "看尿样里是否检出了酮体。",
    "source": "https://medlineplus.gov/ency/article/003579.htm"
  },
  {
    "name": "尿胆红素",
    "aliases": [
      "胆红素(尿)",
      "BIL(尿)"
    ],
    "meaning": "看尿样里是否检出了胆红素。",
    "source": "https://medlineplus.gov/ency/article/003579.htm"
  },
  {
    "name": "尿潜血",
    "aliases": [
      "尿隐血",
      "潜血(尿)",
      "BLD(尿)"
    ],
    "meaning": "用试纸看看尿里有没有和血有关的反应。",
    "source": "https://medlineplus.gov/ency/article/003579.htm"
  },
  {
    "name": "尿红细胞计数",
    "aliases": [
      "尿红细胞",
      "尿沉渣红细胞",
      "RBC(尿)"
    ],
    "meaning": "数一数尿液里的红细胞。",
    "source": "https://medlineplus.gov/ency/article/003579.htm"
  },
  {
    "name": "尿白细胞计数",
    "aliases": [
      "尿白细胞",
      "尿沉渣白细胞",
      "WBC(尿)"
    ],
    "meaning": "数一数尿液里的白细胞。",
    "source": "https://medlineplus.gov/ency/article/003579.htm"
  },
  {
    "name": "尿亚硝酸盐",
    "aliases": [
      "亚硝酸盐(尿)",
      "NIT(尿)"
    ],
    "meaning": "看尿样里是否检出了亚硝酸盐。",
    "source": "https://medlineplus.gov/ency/article/003579.htm"
  },
  {
    "name": "尿液酸碱度",
    "aliases": [
      "尿pH",
      "pH(尿)",
      "尿酸碱度"
    ],
    "meaning": "看这份尿液偏酸还是偏碱。",
    "source": "https://medlineplus.gov/ency/article/003579.htm"
  },
  {
    "name": "平均红细胞血红蛋白量",
    "aliases": [
      "MCH",
      "平均血红蛋白含量",
      "平均红细胞血红蛋白含量"
    ],
    "meaning": "看一个红细胞平均带有多少血红蛋白。",
    "source": "https://medlineplus.gov/lab-tests/red-blood-cell-rbc-indices/"
  },
  {
    "name": "平均红细胞血红蛋白浓度",
    "aliases": [
      "MCHC",
      "平均血红蛋白浓度"
    ],
    "meaning": "看红细胞内血红蛋白平均有多浓。",
    "source": "https://medlineplus.gov/lab-tests/red-blood-cell-rbc-indices/"
  },
  {
    "name": "红细胞分布宽度",
    "aliases": [
      "RDW"
    ],
    "meaning": "反映红细胞大小相差多少。",
    "source": "https://medlineplus.gov/lab-tests/red-blood-cell-rbc-indices/"
  },
  {
    "name": "红细胞分布宽度变异系数",
    "aliases": [
      "RDW-CV",
      "红细胞分布宽度-变异系数"
    ],
    "meaning": "用相对大小的波动来描述红细胞大小差异。",
    "source": "https://medlineplus.gov/lab-tests/red-blood-cell-rbc-indices/"
  },
  {
    "name": "红细胞分布宽度标准差",
    "aliases": [
      "RDW-SD",
      "红细胞分布宽度-标准差"
    ],
    "meaning": "用体积单位描述红细胞的大小差异。",
    "source": "https://medlineplus.gov/lab-tests/red-blood-cell-rbc-indices/"
  },
  {
    "name": "平均血小板体积",
    "aliases": [
      "MPV"
    ],
    "meaning": "看血小板平均有多大。",
    "source": "https://medlineplus.gov/lab-tests/mpv-blood-test/"
  },
  {
    "name": "γ-谷氨酰转移酶",
    "aliases": [
      "GGT",
      "γ-GT",
      "谷氨酰转肽酶"
    ],
    "meaning": "测血液里这种酶的水平，医生通常结合其他肝胆项目一起看。",
    "source": "https://medlineplus.gov/lab-tests/gamma-glutamyl-transferase-ggt-test/"
  },
  {
    "name": "直接胆红素",
    "aliases": [
      "DBIL",
      "结合胆红素"
    ],
    "meaning": "测血中经过肝脏处理的那部分胆红素。",
    "source": "https://medlineplus.gov/lab-tests/bilirubin-blood-test/"
  },
  {
    "name": "间接胆红素",
    "aliases": [
      "IBIL",
      "非结合胆红素"
    ],
    "meaning": "反映血中还未经过肝脏结合处理的那部分胆红素。",
    "source": "https://medlineplus.gov/lab-tests/bilirubin-blood-test/"
  },
  {
    "name": "球蛋白",
    "aliases": [
      "GLOB",
      "血清球蛋白"
    ],
    "meaning": "球蛋白是一组血液蛋白，有些参与免疫，有些帮助运输物质。",
    "source": "https://medlineplus.gov/lab-tests/total-protein-and-albumin-globulin-a-g-ratio/"
  },
  {
    "name": "白蛋白球蛋白比值",
    "aliases": [
      "A/G",
      "白球比"
    ],
    "meaning": "比较血液中白蛋白与球蛋白的量。",
    "source": "https://medlineplus.gov/lab-tests/total-protein-and-albumin-globulin-a-g-ratio/"
  },
  {
    "name": "尿肌酐",
    "aliases": [
      "尿液肌酐",
      "CREA(尿)"
    ],
    "meaning": "测尿液里的肌酐，可和尿白蛋白等项目一起使用。",
    "source": "https://medlineplus.gov/lab-tests/creatinine-test/"
  },
  {
    "name": "肌酐清除率",
    "aliases": [
      "CrCl",
      "Ccr"
    ],
    "meaning": "用肌酐相关测量估计肾脏清除它的能力。",
    "source": "https://medlineplus.gov/lab-tests/creatinine-test/"
  },
  {
    "name": "尿白蛋白肌酐比",
    "aliases": [
      "UACR",
      "尿白蛋白/肌酐比值",
      "尿微量白蛋白肌酐比"
    ],
    "meaning": "把尿白蛋白和尿肌酐相比，帮助减少尿液浓淡对结果的影响。",
    "source": "https://medlineplus.gov/lab-tests/microalbumin-creatinine-ratio/"
  },
  {
    "name": "C反应蛋白",
    "aliases": [
      "CRP"
    ],
    "meaning": "身体有炎症时，血里这种蛋白的量可能会变。这项看看它有多少。",
    "source": "https://medlineplus.gov/lab-tests/c-reactive-protein-crp-test/"
  },
  {
    "name": "超敏C反应蛋白",
    "aliases": [
      "hs-CRP",
      "高敏C反应蛋白"
    ],
    "meaning": "也是查一种和炎症有关的蛋白，用的办法更灵，量很少也能测到。",
    "source": "https://medlineplus.gov/lab-tests/c-reactive-protein-crp-test/"
  },
  {
    "name": "促甲状腺激素",
    "aliases": [
      "TSH",
      "促甲状腺素"
    ],
    "meaning": "身体会发信号告诉甲状腺该干多少活。这项抽血看看信号有多强。",
    "source": "https://medlineplus.gov/lab-tests/tsh-thyroid-stimulating-hormone-test/"
  },
  {
    "name": "游离甲状腺素",
    "aliases": [
      "FT4",
      "游离T4"
    ],
    "meaning": "测血中未与蛋白结合的T4。",
    "source": "https://medlineplus.gov/lab-tests/thyroxine-t4-test/"
  },
  {
    "name": "总甲状腺素",
    "aliases": [
      "TT4",
      "总T4"
    ],
    "meaning": "测血中结合和游离两部分T4的总量。",
    "source": "https://medlineplus.gov/lab-tests/thyroxine-t4-test/"
  },
  {
    "name": "游离三碘甲状腺原氨酸",
    "aliases": [
      "FT3",
      "游离T3"
    ],
    "meaning": "测血中未与蛋白结合的T3。",
    "source": "https://medlineplus.gov/lab-tests/triiodothyronine-t3-tests/"
  },
  {
    "name": "总三碘甲状腺原氨酸",
    "aliases": [
      "TT3",
      "总T3"
    ],
    "meaning": "测血中结合和游离两部分T3的总量。",
    "source": "https://medlineplus.gov/lab-tests/triiodothyronine-t3-tests/"
  },
  {
    "name": "乙肝表面抗原",
    "aliases": [
      "HBsAg",
      "乙型肝炎病毒表面抗原"
    ],
    "meaning": "查血液里是否检出乙肝病毒的一种表面成分。",
    "source": "https://medlineplus.gov/lab-tests/hepatitis-panel/"
  },
  {
    "name": "乙肝表面抗体",
    "aliases": [
      "Anti-HBs",
      "HBsAb",
      "乙型肝炎病毒表面抗体"
    ],
    "meaning": "查身体是否产生了针对乙肝表面抗原的抗体。",
    "source": "https://medlineplus.gov/lab-tests/hepatitis-panel/"
  },
  {
    "name": "乙肝核心抗体",
    "aliases": [
      "Anti-HBc",
      "HBcAb",
      "乙型肝炎病毒核心抗体"
    ],
    "meaning": "查有没有针对乙肝病毒核心成分的抗体，需结合其他乙肝项目看。",
    "source": "https://medlineplus.gov/lab-tests/hepatitis-panel/"
  },
  {
    "name": "丙肝抗体",
    "aliases": [
      "Anti-HCV",
      "HCVAb",
      "丙型肝炎病毒抗体"
    ],
    "meaning": "查有没有针对丙肝病毒的抗体，医生可结合进一步检查判断当前情况。",
    "source": "https://medlineplus.gov/lab-tests/hepatitis-panel/"
  },
  {
    "name": "便潜血",
    "aliases": [
      "FOBT",
      "粪便隐血",
      "大便潜血"
    ],
    "meaning": "查粪便里有没有肉眼看不到的血。",
    "source": "https://medlineplus.gov/lab-tests/fecal-occult-blood-test-fobt/"
  },
  {
    "name": "粪便免疫化学试验",
    "aliases": [
      "FIT",
      "免疫法便潜血"
    ],
    "meaning": "用抗体检测粪便里少量的人血血红蛋白。",
    "source": "https://medlineplus.gov/lab-tests/fecal-occult-blood-test-fobt/"
  },
  {
    "name": "前列腺特异性抗原",
    "aliases": [
      "PSA",
      "tPSA",
      "总前列腺特异性抗原"
    ],
    "meaning": "测血液中由前列腺产生的一种蛋白，医生会结合其他情况解读。",
    "source": "https://medlineplus.gov/lab-tests/psa-prostate-specific-antigen-test/"
  },
  {
    "name": "游离前列腺特异性抗原",
    "aliases": [
      "fPSA",
      "游离PSA"
    ],
    "meaning": "测血中未与蛋白结合的那部分PSA。",
    "source": "https://medlineplus.gov/lab-tests/psa-prostate-specific-antigen-test/"
  },
  {
    "name": "心电图",
    "aliases": [
      "ECG",
      "EKG",
      "静息心电图"
    ],
    "meaning": "把心脏跳动时的电信号画成线，医生可以看看心跳的节奏。",
    "source": "https://medlineplus.gov/lab-tests/electrocardiogram/"
  },
  {
    "name": "骨密度",
    "aliases": [
      "BMD",
      "骨矿物质密度"
    ],
    "meaning": "看看骨头里的矿物质有多密，帮助了解骨头的结实程度。",
    "source": "https://medlineplus.gov/lab-tests/bone-density-scan/"
  },
  {
    "name": "骨密度T值",
    "aliases": [
      "T-score",
      "骨密度T评分"
    ],
    "meaning": "把测得的骨密度与健康年轻成人的参考水平作比较。",
    "source": "https://medlineplus.gov/lab-tests/bone-density-scan/"
  },
  {
    "name": "骨密度Z值",
    "aliases": [
      "Z-score",
      "骨密度Z评分"
    ],
    "meaning": "把测得的骨密度与年龄相近人群的参考水平作比较。",
    "source": "https://medlineplus.gov/lab-tests/bone-density-scan/"
  },
  {
    "name": "用力肺活量",
    "aliases": [
      "FVC"
    ],
    "meaning": "吸足气后尽力呼气，测一共能呼出多少气。",
    "source": "https://medlineplus.gov/lab-tests/lung-function-tests/"
  },
  {
    "name": "第一秒用力呼气容积",
    "aliases": [
      "FEV1"
    ],
    "meaning": "尽力呼气时，测第一秒呼出了多少气。",
    "source": "https://medlineplus.gov/lab-tests/lung-function-tests/"
  },
  {
    "name": "第一秒用力呼气容积与用力肺活量比值",
    "aliases": [
      "FEV1/FVC",
      "一秒率"
    ],
    "meaning": "看尽力呼出的总气量中，第一秒呼出了多少比例。",
    "source": "https://medlineplus.gov/lab-tests/lung-function-tests/"
  },
  {
    "name": "体质指数",
    "aliases": [
      "BMI",
      "体重指数"
    ],
    "meaning": "用身高和体重算出的一个指标，用来初步了解体重与身高是否相称。",
    "source": "https://www.cdc.gov/bmi/about/index.html"
  },
  {
    "name": "腰围",
    "aliases": [
      "WC",
      "腹部腰围"
    ],
    "meaning": "测腰部一圈的长度，可作为了解腹部脂肪分布的一个线索。",
    "source": "https://www.cdc.gov/diabetes/living-with/healthy-weight.html"
  },
  {
    "name": "血压",
    "aliases": [
      "BP",
      "动脉血压"
    ],
    "meaning": "测血液对血管壁的压力，通常记成收缩压和舒张压两个数。",
    "source": "https://www.cdc.gov/high-blood-pressure/about/index.html"
  },
  {
    "name": "收缩压",
    "aliases": [
      "SBP",
      "高压(血压)"
    ],
    "meaning": "心脏收缩、把血推出去时测得的压力。",
    "source": "https://www.cdc.gov/high-blood-pressure/about/index.html"
  },
  {
    "name": "舒张压",
    "aliases": [
      "DBP",
      "低压(血压)"
    ],
    "meaning": "两次心跳之间心脏放松时测得的压力。",
    "source": "https://www.cdc.gov/high-blood-pressure/about/index.html"
  },
  {
    "name": "脂肪肝",
    "aliases": [
      "肝脂肪变",
      "肝脂肪浸润"
    ],
    "meaning": "报告用这个词描述肝脏内有脂肪堆积的表现。",
    "source": "https://www.radiologyinfo.org/en/info/article-abdo-ultrasound-report"
  },
  {
    "name": "胆囊结石",
    "aliases": [
      "胆囊内结石",
      "胆囊内见结石"
    ],
    "meaning": "报告描述胆囊里看到了结石。",
    "source": "https://www.radiologyinfo.org/en/info/article-abdo-ultrasound-report"
  },
  {
    "name": "肾囊肿",
    "aliases": [
      "肾脏囊肿",
      "肾单纯性囊肿"
    ],
    "meaning": "报告看到肾脏里有像小水袋一样的地方。",
    "source": "https://www.radiologyinfo.org/en/info/renal-cyst"
  },
  {
    "name": "甲状腺结节",
    "aliases": [
      "甲状腺内结节",
      "甲状腺超声结节"
    ],
    "meaning": "报告看到甲状腺里有一小块和周围不太一样。",
    "source": "https://www.radiologyinfo.org/en/info/us-thyroid"
  }
];
