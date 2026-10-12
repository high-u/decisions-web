// Sample scenarios for each UI language, as System One request bodies (the scenario file format).
// name is shown in the sample list and becomes the file name.
export const SAMPLES = {
  ja: [
    {
      name: '問い合わせの振り分け',
      request: {
        state: 'お客様からのメッセージ: 先週の注文で二重に請求されたのに、誰からも返信がありません。',
        questions: {
          振り分け: {
            type: 'choice',
            instructions: 'どのチームが対応すべきですか？',
            criteria: {
              請求: '支払い、請求、返金、請求書',
              配送: '配送、追跡、紛失や遅延した荷物',
              技術: '不具合、エラー、ログインの問題',
            },
          },
          怒り: { type: 'noul', instructions: 'お客様は怒っていますか？', criteria: { true: '怒っている', false: '怒っていない' } },
          緊急度: {
            type: 'score',
            instructions: 'どのくらい急ぎですか？',
            criteria: ['待てる', '今週中', '今日中', '今すぐ'],
          },
        },
      },
    },
    {
      name: '商品レビューの分析',
      request: {
        state: {
          product: 'ワイヤレスイヤホン',
          rating: '3',
          review: '届いたイヤホン、音質はとても良いのですが、片方が3日で聞こえなくなりました。交換をお願いしたいです。',
        },
        questions: {
          話題: {
            type: 'choice',
            instructions: 'このレビューの主な話題は何ですか？',
            criteria: {
              音質: '音質の良し悪し',
              不具合: '故障、不具合、動かない',
              配送: '配送、梱包、届くまでの日数',
              価格: '価格、値段、割引',
            },
          },
          交換希望: { type: 'noul', instructions: '交換または返品を求めていますか？', criteria: { true: '求めている', false: '求めていない' } },
          満足度: {
            type: 'score',
            instructions: '購入者の満足度はどのくらいですか？',
            criteria: ['とても不満', 'やや不満', 'どちらでもない', 'やや満足', 'とても満足'],
          },
        },
      },
    },
    {
      name: 'メールの優先度',
      request: {
        state: {
          from: '経理部',
          subject: '【本日17時締切】経費精算の提出について',
          body: '今月分の経費精算が未提出です。本日17時までに提出してください。',
        },
        questions: {
          優先度: {
            type: 'score',
            instructions: 'このメールにどのくらい急いで対応すべきですか？',
            criteria: ['後で読めばよい', '今週中に対応', '今日中に対応', 'すぐに対応'],
          },
          要対応: { type: 'noul', instructions: '返信や提出などの対応が必要ですか？', criteria: { true: '対応が必要', false: '対応は不要' } },
          分類: {
            type: 'choice',
            instructions: 'メールの分類はどれですか？',
            criteria: { 経費: '経費・精算', 会議: '会議・予定', 顧客対応: '顧客対応', その他: 'その他' },
          },
        },
      },
    },
  ],
  en: [
    {
      name: 'support-routing',
      request: {
        state: 'Customer message: I was charged twice for my order last week and nobody has replied.',
        questions: {
          route: {
            type: 'choice',
            instructions: 'Which team should handle this?',
            criteria: {
              billing: 'payments, charges, refunds, invoices',
              shipping: 'delivery, tracking, lost or late parcels',
              technical: 'bugs, errors, login problems',
            },
          },
          angry: { type: 'noul', instructions: 'Is the customer angry?', criteria: { true: 'angry', false: 'not angry' } },
          urgency: {
            type: 'score',
            instructions: 'How urgent is this?',
            criteria: ['can wait', 'this week', 'today', 'right now'],
          },
        },
      },
    },
    {
      name: 'product-review-analysis',
      request: {
        state: {
          product: 'Wireless earbuds',
          rating: '3',
          review: 'The sound quality of these earbuds is great, but one side stopped working after 3 days. I would like an exchange.',
        },
        questions: {
          topic: {
            type: 'choice',
            instructions: 'What is the main topic of this review?',
            criteria: {
              sound: 'sound quality, good or bad',
              defect: 'broken, defective, not working',
              delivery: 'shipping, packaging, delivery time',
              price: 'price, cost, discounts',
            },
          },
          wants_exchange: { type: 'noul', instructions: 'Does the customer ask for an exchange or a return?', criteria: { true: 'asks for one', false: 'does not' } },
          satisfaction: {
            type: 'score',
            instructions: 'How satisfied is the buyer?',
            criteria: ['very dissatisfied', 'somewhat dissatisfied', 'neutral', 'somewhat satisfied', 'very satisfied'],
          },
        },
      },
    },
    {
      name: 'email-priority',
      request: {
        state: {
          from: 'Accounting',
          subject: '[Due today 5 PM] Expense report submission',
          body: 'Your expense report for this month has not been submitted. Please submit it by 5 PM today.',
        },
        questions: {
          priority: {
            type: 'score',
            instructions: 'How quickly should this email be handled?',
            criteria: ['read later', 'handle this week', 'handle today', 'handle right now'],
          },
          needs_reply: { type: 'noul', instructions: 'Does it need a reply or an action such as a submission?', criteria: { true: 'needed', false: 'not needed' } },
          category: {
            type: 'choice',
            instructions: 'Which category is this email?',
            criteria: { expense: 'expenses, reimbursement', meeting: 'meetings, schedule', customer: 'customer support', other: 'other' },
          },
        },
      },
    },
  ],
};
