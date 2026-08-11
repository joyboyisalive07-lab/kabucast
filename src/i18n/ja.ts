import type { Strings } from "./strings.ts";

export const JA: Strings = {
  locale: "ja-JP",
  languageName: "日本語",
  languageLabel: "言語",
  copyLink: "リンクをコピー",
  copied: "コピーしました",

  tagline: "カブ価を、当てずっぽうではなく確率で。",

  sundayPrice: "日曜の買値",
  sundayPriceHint: "90から110。記録していなければ空のままで。",
  firstTimeBuyer: "カブを買うのが初めての週",
  firstTimeBuyerHint: "初回はゲームが必ず小波型にします。",
  previousPattern: "先週の型",
  patternUnknown: "わからない",
  patternNames: ["波型", "跳ね上がり型", "下降型", "小波型"],
  prices: "売値",
  pricesHint: "わかっている分だけで大丈夫です。まとめて貼り付けもできます。",
  clear: "消去",

  dayNames: ["月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"],
  dayShort: ["月", "火", "水", "木", "金", "土"],
  morning: "午前",
  afternoon: "午後",

  chartHeading: "価格の予測",
  legendBand90: "90%の範囲",
  legendBand50: "50%の範囲",
  legendMedian: "中央値",
  legendMinimum: "最低値",
  legendMaximum: "最高値",
  legendObserved: "記録済み",
  legendPeak: "ピークの可能性が最も高い時間",
  axisNote: "価格は対数目盛です",
  readoutEmpty: "グラフに触れるか矢印キーを押すと正確な数値が出ます",
  chartSummary:
    "{total}件中{recorded}件の価格を記録済み。残りの半日は{low}ベルから{high}ベルの範囲に収まります。",
  chartPeak: "ピークの可能性が最も高い時間：{slot}。",
  chartKeyboardHint: "左右の矢印キーで半日ごとに読み取れます。",

  recommendationHeading: "判断",
  sellNow: "今すぐ売る",
  hold: "待つ",
  sellNowDetail: "待つ価値は、目の前の{price}ベルより低いです。",
  holdDetail: "待つ価値は、目の前の{price}ベルより高いです。",
  expectedIfWaiting: "待った場合の期待値",
  probabilityBetter: "待つほうが得になる確率",
  downside: "悪い場合、下位10%",
  plusMinus: "±",
  nothingLeft: "今週は終わりです。決めることはもうありません。",
  nothingEntered: "価格を入力すると判断が出ます。",

  patternsHeading: "型の確率",
  patternColumn: "型",
  probabilityColumn: "確率",
  scenariosColumn: "シナリオ",

  scenariosHeading: "残っているシナリオ",
  scenariosHint: "入力とまだ矛盾しない形と、その確率です。",
  scenarioPeakAt: "{slot}にピーク",
  scenarioFalls: "{ranges}に下降",
  scenarioAllWeek: "一週間ずっと下降",
  scenarioCount: "{total}件中{count}件",

  inconsistentHeading: "この価格は起こりえません",
  inconsistentBody:
    "ゲームのどの型もこの並びを生みません。計算するものがないので、入力した数字を確認してください。",
  invalidPrice: "1から999までの整数",
  invalidBasePrice: "90から110までの整数",
};
