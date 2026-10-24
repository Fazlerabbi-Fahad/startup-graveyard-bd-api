// Fictional test data only.
export function fullCaseStudy(overrides = {}) {
  return {
    name: 'Test Startup Alpha',
    tagline: 'A fictional on-demand delivery app used only in tests.',
    atAGlance: {
      sector: 'Logistics',
      city: 'Dhaka',
      foundedYear: 2016,
      shutDownYear: 2020,
      founders: [{ name: 'Founder A', role: 'CEO' }],
      fundingAmountUSD: 1_000_000,
      fundingRounds: 2,
      investors: ['Fictional Ventures'],
      outcome: 'Shut down',
      peakTeamSize: 40,
    },
    failureReasons: [{ category: 'Unit economics / cash burn', summary: 'Burned cash on every order.' }],
    sections: {
      executiveSummary: 'word '.repeat(300).trim(),
      whatWentWrong: 'word '.repeat(200).trim(),
    },
    timeline: [{ year: 2016, month: 3, event: 'Founded' }],
    lessons: ['Know your contribution margin.'],
    competitors: [{ name: 'Rival Co', url: 'https://rival.example' }],
    sources: [{ title: 'Fictional article', url: 'https://news.example/article', publisher: 'Example News' }],
    ...overrides,
  };
}
