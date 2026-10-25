/** FICTIONAL demo law firms, people and contracts. */

export interface DemoLawyer {
  name: string;
  title: string;
  bar: string;
  profile: string;
}

export interface DemoTenant {
  slug: string;
  name: string;
  shortName: string;
  logoMark: string;
  brandPrimary: string;
  brandAccent: string;
  tagline: string;
  lawyers: DemoLawyer[];
  formUrl: string;
  feeNotice: string;
  address: string;
  phone: string;
  officeHours: string;
  plan: "starter" | "standard" | "professional";
  monthlyFee: number;
  aiLimit: number;
  /** contract end, days from seed time */
  endsInDays: number;
}

export const DEMO_TENANTS: DemoTenant[] = [
  {
    slug: "seiran-law",
    name: "青藍法律事務所（架空）",
    shortName: "青藍法律事務所",
    logoMark: "青",
    brandPrimary: "#1E3A5F",
    brandAccent: "#B08D57",
    tagline: "企業不祥事・情報漏えいの被害に、確かな情報と丁寧な説明を。",
    lawyers: [
      { name: "高瀬 遼", title: "代表弁護士", bar: "架空弁護士会 所属（デモ用）", profile: "個人情報・消費者問題を重点的に取り扱う。企業の情報開示実務に関する講演多数（架空）。" },
      { name: "宮原 透", title: "弁護士", bar: "架空弁護士会 所属（デモ用）", profile: "サイバーインシデント対応、IT関連契約を重点的に取り扱う（架空）。" },
    ],
    formUrl: "https://forms.example.com/seiran-law/consultation",
    feeNotice: "初回相談30分 5,500円（税込）。受任時の弁護士費用は事案に応じて事前にお見積りし、書面でご説明します。",
    address: "東京都千代田区（架空）青藍ビル 7階",
    phone: "03-0000-1234（架空）",
    officeHours: "平日 9:30〜18:00",
    plan: "professional",
    monthlyFee: 98000,
    aiLimit: 400,
    endsInDays: 210,
  },
  {
    slug: "hiiragi-law",
    name: "柊総合法律事務所（架空）",
    shortName: "柊総合法律事務所",
    logoMark: "柊",
    brandPrimary: "#23453B",
    brandAccent: "#B79A63",
    tagline: "身近な消費者トラブルから、企業の情報管理まで。",
    lawyers: [
      { name: "柊 誠一", title: "所長弁護士", bar: "架空弁護士会 所属（デモ用）", profile: "消費者被害、集団的な被害回復の手続を重点的に取り扱う（架空）。" },
    ],
    formUrl: "https://forms.example.com/hiiragi-law/contact",
    feeNotice: "法律相談 30分ごと 5,500円（税込）。着手金・報酬金は日本弁護士連合会の旧報酬基準を参考に、事前にご説明します。",
    address: "大阪府大阪市（架空）柊ビル 3階",
    phone: "06-0000-5678（架空）",
    officeHours: "平日 10:00〜19:00（土曜は予約制）",
    plan: "standard",
    monthlyFee: 58000,
    aiLimit: 120,
    endsInDays: 12,
  },
];

export interface DemoUser {
  key: string;
  email: string;
  name: string;
  password: string;
  platformRole: "none" | "operator";
  memberships: { tenant: string; role: "owner" | "lawyer" | "editor" | "viewer"; title: string }[];
  persona: string;
}

export const DEMO_USERS: DemoUser[] = [
  {
    key: "seiran-lawyer",
    email: "takase@seiran.example",
    name: "高瀬 遼",
    password: "Demo-Seiran-Lawyer-2026",
    platformRole: "none",
    memberships: [{ tenant: "seiran-law", role: "owner", title: "代表弁護士" }],
    persona: "青藍法律事務所・代表弁護士（承認権限あり）",
  },
  {
    key: "seiran-editor",
    email: "mori@seiran.example",
    name: "森 葵",
    password: "Demo-Seiran-Editor-2026",
    platformRole: "none",
    memberships: [{ tenant: "seiran-law", role: "editor", title: "広報・編集担当" }],
    persona: "青藍法律事務所・編集担当（承認権限なし）",
  },
  {
    key: "hiiragi-lawyer",
    email: "hiiragi@hiiragi.example",
    name: "柊 誠一",
    password: "Demo-Hiiragi-Lawyer-2026",
    platformRole: "none",
    memberships: [{ tenant: "hiiragi-law", role: "owner", title: "所長弁護士" }],
    persona: "柊総合法律事務所・所長弁護士（承認権限あり）",
  },
  {
    key: "operator",
    email: "ops@aiip.example",
    name: "運営管理者",
    password: "Demo-Operator-2026",
    platformRole: "operator",
    memberships: [],
    persona: "プラットフォーム運営者（全事務所の運用状況を閲覧）",
  },
];
