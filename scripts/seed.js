// Inserts two clearly FICTIONAL sample case studies (status: draft) for local development.
// Usage: npm run seed              -> upsert as drafts
//        npm run seed -- --publish -> also publish them (handy for testing the public site)
// Safe to re-run: samples are matched by slug and overwritten; nothing else is touched.
import { config } from '../src/config/env.js';
import { connectDb, disconnectDb } from '../src/config/db.js';
import { CaseStudy } from '../src/models/CaseStudy.js';

const DISCLAIMER = '> **Fictional sample.** This company does not exist. It is placeholder content for development only.';

const samples = [
  {
    slug: 'sample-startup-one',
    name: 'Sample Startup One',
    tagline: 'A fictional app that delivered groceries from neighbourhood shops within 30 minutes.',
    atAGlance: {
      sector: 'eCommerce',
      city: 'Dhaka',
      foundedYear: 2017,
      shutDownYear: 2021,
      founders: [
        { name: 'Sample Founder A', role: 'CEO' },
        { name: 'Sample Founder B', role: 'CTO' },
      ],
      fundingAmountUSD: 1_500_000,
      fundingRounds: 2,
      investors: ['Placeholder Ventures', 'Example Angels Network'],
      outcome: 'Shut down',
      peakTeamSize: 85,
    },
    failureReasons: [
      { category: 'Unit economics / cash burn', summary: 'Every order lost money once delivery and discounts were counted.' },
      { category: 'Competition', summary: 'Larger, better-funded rivals matched every promotion.' },
      { category: 'Ran out of funding', summary: 'A planned bridge round fell through.' },
    ],
    sections: {
      executiveSummary: `${DISCLAIMER}\n\nSample Startup One promised 30-minute grocery delivery from local shops. It grew orders quickly on the back of discounts, but never found a path to positive contribution margin and shut down after four years.`,
      companyBackground: `${DISCLAIMER}\n\nTwo fictional founders started the company after noticing long queues at neighbourhood stores. The first version was a simple order form backed by a team of riders.`,
      marketContext: 'Online grocery adoption was rising, but average basket sizes stayed small and customers were highly price-sensitive.',
      whatWentWrong: `${DISCLAIMER}\n\n- **Discount-driven growth:** most customers ordered only when a promo code was active.\n- **Small baskets:** the average order barely covered rider costs.\n- **Funding gap:** when growth slowed, the next round did not close.`,
      whatCouldHaveBeenDone: 'Set a minimum order value early, charge for delivery, and focus on a few dense neighbourhoods before expanding.',
      conclusion: 'Speed was a real customer benefit, but it was never priced in. Growth bought with discounts disappeared when the discounts stopped.',
      researchNotes: 'All figures are invented for development purposes.',
    },
    timeline: [
      { year: 2017, month: 2, event: 'Fictional company founded' },
      { year: 2018, month: 6, event: 'Seed round (fictional)' },
      { year: 2019, month: 11, event: 'Expanded to a second city' },
      { year: 2021, month: 4, event: 'Operations wound down' },
    ],
    lessons: [
      'Know your contribution margin per order before scaling.',
      'Discounts can hide whether customers really value the product.',
      'Density beats geographic expansion in delivery businesses.',
    ],
    competitors: [{ name: 'Example Rival Grocer', url: 'https://example.com/rival' }],
    sources: [
      { title: 'Placeholder source for development', url: 'https://example.com/sample-one', publisher: 'Example Publisher', date: '2021-05' },
    ],
  },
  {
    slug: 'sample-startup-two',
    name: 'Sample Startup Two',
    tagline: 'A fictional digital wallet for small merchants that could not secure the licence it needed.',
    atAGlance: {
      sector: 'Fintech',
      city: 'Chattogram',
      foundedYear: 2019,
      shutDownYear: 2022,
      founders: [{ name: 'Sample Founder C', role: 'Founder & CEO' }],
      fundingAmountUSD: 400_000,
      fundingRounds: 1,
      investors: ['Placeholder Seed Fund'],
      outcome: 'Dormant',
      peakTeamSize: 18,
    },
    failureReasons: [
      { category: 'Regulatory / licensing', summary: 'Operated in a grey area while the licence application stalled.' },
      { category: 'Market timing', summary: 'Launched just before rules for its category tightened.' },
    ],
    sections: {
      executiveSummary: `${DISCLAIMER}\n\nSample Startup Two built a QR-based wallet for small merchants. Adoption was promising, but the company never obtained the licence its model required and went dormant.`,
      companyBackground: `${DISCLAIMER}\n\nA solo fictional founder with a payments background built the first prototype in six months.`,
      marketContext: 'Mobile financial services were growing fast, and regulators were actively revising the rules for new entrants.',
      whatWentWrong: `${DISCLAIMER}\n\n1. Launched before securing the necessary licence.\n2. Relied on a partner arrangement that was later disallowed.\n3. Had too little runway to wait out a long approval process.`,
      whatCouldHaveBeenDone: 'Engage regulators before launch, budget for a long approval timeline, and design the product to fit inside an existing licensed partner.',
      conclusion: 'In regulated industries the licence is the product. Treat compliance as a first milestone, not a later task.',
      researchNotes: 'All figures are invented for development purposes.',
    },
    timeline: [
      { year: 2019, month: 8, event: 'Fictional company founded' },
      { year: 2020, month: 3, event: 'Pilot with 200 merchants' },
      { year: 2022, month: 1, event: 'Paused operations' },
    ],
    lessons: [
      'Secure regulatory approval before scaling a regulated product.',
      'Model a long approval timeline into your runway.',
      'Partner arrangements can change overnight; have a plan B.',
    ],
    competitors: [{ name: 'Example Wallet Co' }],
    sources: [
      { title: 'Placeholder source for development', url: 'https://example.com/sample-two', publisher: 'Example Publisher' },
    ],
  },
];

const publish = process.argv.includes('--publish');

await connectDb(config.MONGODB_URI);
try {
  for (const data of samples) {
    const doc = (await CaseStudy.findOne({ slug: data.slug })) ?? new CaseStudy();
    doc.set(data);
    if (publish) {
      doc.status = 'published';
      doc.publishedAt ??= new Date();
    } else {
      doc.status = 'draft';
    }
    const isNew = doc.isNew;
    await doc.save();
    console.log(`${isNew ? 'Inserted' : 'Updated'} "${doc.name}" (${doc.slug}) as ${doc.status}`);
  }
} finally {
  await disconnectDb();
}
